/**
 * Radar et ARPA.
 *
 * - Antenne à 24 tr/min (SWP = 2,5 s) : un écho n'est rafraîchi qu'au passage du faisceau.
 * - Détection : puissance d'écho ∝ surface équivalente (rcs), décroissance en r⁴ au-delà de rmax,
 *   fluctuation (Swerling) plus forte pour les petites cibles, masquage par l'anti-clutter mer (STC).
 * - ARPA : mesures bruitées (σ relèvement 0,45°, σ distance 5 m + 0,15 %), régression linéaire
 *   sur 75 s glissantes → retard réaliste après une manœuvre de la cible.
 *   ACQ < 30 s, puis TRK ; PERDUE après 20 s sans écho.
 */
import { S, logE, type Echo, type Target, type Track, type TrialResult } from '../core/state';
import { K2N, R2D, brgOf, cpaOf, gauss, vec, type Vec } from '../core/util';
import { ownWater } from './physics';

export const SWP = 2.5;
export const clutR = (): number => 0.2 + S.env.windKn * 0.05;

const inSweep = (b: number, a0: number, d: number): boolean => ((b - a0) % 360 + 360) % 360 < d;

export function radarStep(dt: number): void {
  const a0 = S.sweep, d = Math.min(360, (360 * dt) / SWP), o = S.own;
  S.sweep = (a0 + d) % 360;
  for (const t of S.targets) {
    const dx = t.x - o.x, dy = t.y - o.y, b = brgOf(dx, dy);
    if (inSweep(b, a0, d)) paint(t, dx, dy, b);
  }
  S.clutter = S.clutter.filter((p) => !inSweep(p.b, a0, d));
  const cR = clutR(), dens = Math.min(3, Math.pow(S.env.windKn / 10, 2) * 0.6), n = Math.floor(dens * d + Math.random());
  for (let i = 0; i < n; i++) {
    const r = cR * -Math.log(1 - Math.random()) * 0.7;
    const s = Math.random() * Math.exp(-r / cR) * 1.4;
    if (s < S.radar.ac || r > 24) continue;
    S.clutter.push({ b: (a0 + Math.random() * d) % 360, r, s, t: S.t });
  }
}

function paint(t: Target, dx: number, dy: number, b: number): void {
  const r = Math.hypot(dx, dy), rmax = 3 + 6 * Math.sqrt(t.rcs);
  const fl = t.rcs < 1 ? 0.55 + 0.9 * Math.random() : 0.8 + 0.4 * Math.random();
  const s = (t.rcs * fl) / (1 + Math.pow(r / rmax, 4));
  const supp = Math.max(0.12, S.radar.ac * 1.4 * Math.exp(-r / clutR()));
  if (s < supp) return;
  t.echo = { dx, dy, b, r, t: S.t };
  const tr = S.tracks.find((k) => k.tid === t.id);
  if (tr) addObs(tr, t.echo);
  else if (S.radar.autoAcq && r < 6 && S.tracks.length < 40) acquire(t, true);
}

export function acquire(t: Target, auto: boolean): void {
  if (!t.echo || S.tracks.find((k) => k.tid === t.id)) return;
  const tr: Track = {
    n: S.trackSeq++, tid: t.id, t0: S.t, obs: [], last: S.t, state: 'ACQ', est: null,
    range: 0, brg: 0, cpa: 0, tcpa: Infinity, brate: 0, bcr: null, bct: null, danger: false, crs: 0, spd: 0,
  };
  S.tracks.push(tr);
  if (!auto) S.sel = tr.n;
  addObs(tr, t.echo);
  logE(`Acquisition cible ${tr.n}${auto ? ' (auto)' : ''}`);
}

function addObs(tr: Track, e: Echo): void {
  const nb = e.b + gauss() * 0.45, nr = Math.max(0, e.r + gauss() * (0.005 + 0.0015 * e.r)), v = vec(nb, nr);
  tr.obs.push({ t: S.t, x: S.own.x + v.x, y: S.own.y + v.y });
  tr.last = S.t;
  while (tr.obs.length && tr.obs[0].t < S.t - 150) tr.obs.shift();
}

export function estimate(tr: Track): void {
  const o = S.own, age = S.t - tr.t0;
  tr.state = S.t - tr.last > 20 ? 'LOST' : age < 30 ? 'ACQ' : 'TRK';
  if (tr.state !== 'LOST') {
    const W = Math.min(75, age + 0.01), ob = tr.obs.filter((p) => p.t >= S.t - W);
    if (ob.length < 3) {
      const l = tr.obs[tr.obs.length - 1];
      if (!l) return;
      tr.est = { x: l.x, y: l.y, vx: 0, vy: 0, vok: false };
    } else {
      let mt = 0, mx = 0, my = 0;
      for (const p of ob) { mt += p.t; mx += p.x; my += p.y; }
      mt /= ob.length; mx /= ob.length; my /= ob.length;
      let st = 0, sx = 0, sy = 0;
      for (const p of ob) { const dt = p.t - mt; st += dt * dt; sx += dt * (p.x - mx); sy += dt * (p.y - my); }
      const bx = st > 0 ? sx / st : 0, by = st > 0 ? sy / st : 0;
      tr.est = { x: mx + bx * (S.t - mt), y: my + by * (S.t - mt), vx: bx * 3600, vy: by * 3600, vok: true };
    }
  } else if (tr.est && tr.lostT !== S.t) {
    tr.est.x += tr.est.vx * K2N * 0.25; tr.est.y += tr.est.vy * K2N * 0.25; tr.lostT = S.t;
  }
  if (!tr.est) return;
  const px = tr.est.x - o.x, py = tr.est.y - o.y, rvx = tr.est.vx - o.vx, rvy = tr.est.vy - o.vy;
  const c = cpaOf(px, py, rvx * K2N, rvy * K2N);
  tr.range = Math.hypot(px, py); tr.brg = brgOf(px, py); tr.cpa = c.cpa; tr.tcpa = c.tcpa;
  // évolution du relèvement (°/min), positive vers la droite
  tr.brate = ((rvx * K2N * py - rvy * K2N * px) / Math.max(1e-9, px * px + py * py)) * R2D * 60;
  // BCR/BCT : croisement de la ligne de foi du porteur
  const h = vec(o.hdg, 1), cr = (v: Vec) => h.x * v.y - h.y * v.x, den = cr({ x: rvx, y: rvy });
  tr.bcr = null; tr.bct = null;
  if (Math.abs(den) > 1e-6) {
    const tt = -cr({ x: px, y: py }) / den;
    if (tt > 0) { const qx = px + rvx * tt, qy = py + rvy * tt; tr.bcr = h.x * qx + h.y * qy; tr.bct = tt / K2N; }
  }
  tr.danger = tr.state === 'TRK' && tr.cpa < S.radar.cpaLim && tr.tcpa > 0 && tr.tcpa < S.radar.tcpaLim * 60;
  const tv = trueV(tr);
  tr.crs = brgOf(tv.x, tv.y); tr.spd = Math.hypot(tv.x, tv.y);
  if (S.radar.trial) tr.trial = trialCalc(tr);
}

/** Vecteur vrai de la cible selon la stabilisation : sol (GPS) ou eau (loch). */
export function trueV(tr: Track): Vec {
  if (!tr.est) return { x: 0, y: 0 };
  if (S.radar.stab === 'GND') return { x: tr.est.vx, y: tr.est.vy };
  const o = S.own, w = ownWater();
  return { x: tr.est.vx - (o.vx - w.x), y: tr.est.vy - (o.vy - w.y) };
}

/** Manœuvre d'essai : cap / vitesse surface d'essai après un délai, dérive actuelle conservée. */
export function trialCalc(tr: Track): TrialResult | undefined {
  if (!tr.est) return undefined;
  const o = S.own, R = S.radar, w = ownWater();
  const dr = { x: o.vx - w.x, y: o.vy - w.y }, tw = vec(R.trialHdg, R.trialSpd), tg = { x: tw.x + dr.x, y: tw.y + dr.y }, D = R.trialDelay * 60;
  const px = tr.est.x - o.x + (tr.est.vx - o.vx) * K2N * D, py = tr.est.y - o.y + (tr.est.vy - o.vy) * K2N * D;
  const rvx = tr.est.vx - tg.x, rvy = tr.est.vy - tg.y, c = cpaOf(px, py, rvx * K2N, rvy * K2N);
  return { cpa: c.cpa, tcpa: c.tcpa + D, px, py, rvx, rvy };
}
