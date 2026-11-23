/**
 * Radar et poursuite de cibles (TT / ARPA).
 *
 * - Antenne à 24 tr/min (SWP = 2,5 s) : un écho n'est rafraîchi qu'au passage du faisceau.
 * - Bande X (9 GHz) : ouverture 1°, sensible au clutter de mer et de pluie. Bande S (3 GHz) : ouverture 1,8°,
 *   clutter et atténuation par la pluie nettement réduits, petites cibles un peu moins visibles (MSC.192(79) 5.1.2).
 * - Détection : puissance d'écho ∝ surface équivalente (rcs), décroissance en r⁴ au-delà de rmax, fluctuation
 *   plus forte pour les petites cibles. Seuil réglé par le gain ; anti-clutter mer (STC, manuel ou automatique) ;
 *   anti-clutter pluie (FTC) dans les grains, qui atténuent aussi les échos situés dedans ou derrière.
 * - Poursuite : mesures bruitées (σ relèvement 0,45°, σ distance 5 m + 0,15 %), régression linéaire glissante
 *   sur 75 s. Tendance après 1 min, prédiction stabilisée après 3 min (MSC.192(79) 5.25.4.1). Cible perdue
 *   après 20 s (8 balayages) sans écho.
 * - Zone d'acquisition automatique : acquisition et alarme à l'entrée dans la zone (5.29.3).
 * - Côte : lancer de rayons tous les 0,5° (voir chart.ts). L'écho de côte occupe une bande depuis le trait de côte
 *   (falaises, arrière-pays) ; tout ce qui est situé derrière la première terre rencontrée est masqué, cibles comprises.
 * - Bouées (≈ 0,4 m² équivalents avec réflecteur) et bateaux-feux : échos fixes, soumis au clutter et au masquage.
 */
import { S, logE, type Target, type Track, type TrialResult } from '../core/state';
import { K2N, R2D, brgOf, clamp, cpaOf, gauss, vec, type Vec } from '../core/util';
import { ownWater } from './physics';
import { CHART, NRAYS, coastRays, rayIndex } from './chart';
import { TRACK_CAPACITY, raiseEvent, updateAlerts } from './alerts';

export const SWP = 2.5;
export const ACQ_TIME = 60;
export const STABLE_TIME = 180;

export const clutR = (): number => 0.2 + S.env.windKn * 0.05;
/** Niveau effectif d'anti-clutter mer (0-1). */
export const seaLevel = (): number => (S.radar.seaAuto ? clamp(0.12 + S.env.windKn / 55, 0.1, 0.85) : S.radar.sea / 100);
/** Seuil de détection imposé par le gain. */
export const gainThreshold = (): number => 0.12 * (1.6 - (S.radar.gain / 100) * 1.3);
/** Ouverture horizontale du faisceau (rad). */
export const beamWidth = (): number => (S.radar.band === 'X' ? 1.0 : 1.8) * (Math.PI / 180);

const inSweep = (b: number, a0: number, d: number): boolean => ((b - a0) % 360 + 360) % 360 < d;

/** Atténuation par les grains sur le trajet porteur → point (facteur ≤ 1). */
function rainAttenuation(px: number, py: number): number {
  if (!S.env.rain) return 1;
  const o = S.own;
  let f = 1;
  for (const c of S.rainCells) {
    // distance du centre du grain au segment porteur → point
    const dx = px - o.x, dy = py - o.y, L2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((c.x - o.x) * dx + (c.y - o.y) * dy) / L2, 0, 1);
    const d = Math.hypot(o.x + dx * t - c.x, o.y + dy * t - c.y);
    if (d < c.r) f *= S.radar.band === 'X' ? 0.5 : 0.85;
  }
  return f;
}

/** Grains : création et dérive avec le vent. */
export function rainStep(dt: number): void {
  if (!S.env.rain) return;
  if (!S.rainCells.length) {
    for (let i = 0; i < 3; i++) {
      const v = vec(Math.random() * 360, 3 + Math.random() * 7);
      S.rainCells.push({ x: S.own.x + v.x, y: S.own.y + v.y, r: 0.8 + Math.random() * 1.6 });
    }
  }
  const w = vec(S.env.windFrom + 180, S.env.windKn * 0.7);
  for (const c of S.rainCells) { c.x += w.x * K2N * dt; c.y += w.y * K2N * dt; }
}

/** Bande d'écho de côte (NM) propre à chaque rayon : pseudo-aléatoire stable, plus large aux caps et falaises. */
function bandOf(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return 0.25 + 0.9 * (h - Math.floor(h));
}

/** Recalcule les rayons de côte quand le porteur s'est déplacé de plus de 0,05 NM. */
export function coastStep(): void {
  if (!CHART.edges.length) { S.coast = null; return; }
  const o = S.own, c = S.coast;
  if (c && Math.hypot(o.x - c.ox, o.y - c.oy) < 0.05) return;
  const r = coastRays(o.x, o.y);
  const band = c?.band ?? Float32Array.from({ length: NRAYS }, (_, i) => bandOf(i));
  S.coast = { ox: o.x, oy: o.y, r0: r.r0, r1: r.r1, t: c?.t ?? new Float32Array(NRAYS).fill(-1e9), band };
}

/** Vrai si un point situé au relèvement b et à la distance r est masqué par la terre. */
export function masked(b: number, r: number): boolean {
  const c = S.coast;
  return !!c && r > c.r0[rayIndex(b)] + 0.03;
}

export function radarStep(dt: number): void {
  const a0 = S.sweep, d = Math.min(360, (360 * dt) / SWP), o = S.own;
  S.sweep = (a0 + d) % 360;
  for (const t of S.targets) {
    const dx = t.x - o.x, dy = t.y - o.y, b = brgOf(dx, dy);
    if (inSweep(b, a0, d)) paint(t, dx, dy, b);
  }
  // côte : rayons éclairés pendant ce pas
  coastStep();
  const c = S.coast;
  if (c) {
    const step = 360 / NRAYS, i0 = Math.ceil(a0 / step), n = Math.floor(d / step) + 1, thr = gainThreshold();
    for (let k = 0; k < n; k++) {
      const i = (i0 + k) % NRAYS;
      if (!inSweep(i * step, a0, d) || c.r0[i] > 32) continue;
      const v = vec(i * step, c.r0[i]), att = rainAttenuation(o.x + v.x, o.y + v.y);
      if (att * (Math.random() < 0.96 ? 3 : 0.1) > thr) c.t[i] = S.t;
    }
  }
  // bouées et bateaux-feux
  for (const m of CHART.marks) {
    if (m.kind === 'lh') continue; // phare à terre : confondu avec l'écho de côte
    const dx = m.x - o.x, dy = m.y - o.y, b = brgOf(dx, dy);
    if (!inSweep(b, a0, d)) continue;
    const r = Math.hypot(dx, dy);
    if (masked(b, r)) continue;
    const rcs = m.kind === 'lv' ? 3 : 0.4, rmax = 3 + 6 * Math.sqrt(rcs);
    const s = ((rcs * (0.6 + 0.8 * Math.random())) / (1 + Math.pow(r / rmax, 4))) * rainAttenuation(m.x, m.y);
    if (s >= Math.max(gainThreshold(), seaLevel() * 1.4 * Math.exp(-r / clutR()))) S.markEcho[m.id] = S.t;
  }
  // clutter de mer, bruit récepteur et grains : régénérés sur le secteur balayé
  S.clutter = S.clutter.filter((p) => !inSweep(p.b, a0, d));
  const band = S.radar.band === 'X' ? 1 : 0.45;
  const cR = clutR(), sea = seaLevel(), thr = gainThreshold();
  const dens = Math.min(3, Math.pow(S.env.windKn / 10, 2) * 0.6) * band;
  const n = Math.floor(dens * d + Math.random());
  for (let i = 0; i < n; i++) {
    const r = cR * -Math.log(1 - Math.random()) * 0.7;
    const s = Math.random() * Math.exp(-r / cR) * 1.4 * (0.7 + 0.3 * band);
    if (s < sea || s < thr || r > 24) continue;
    S.clutter.push({ b: (a0 + Math.random() * d) % 360, r, s, t: S.t });
  }
  // bruit récepteur quand le gain est poussé
  if (S.radar.gain > 75) {
    const nn = Math.floor(((S.radar.gain - 75) / 25) * 1.2 * d + Math.random());
    for (let i = 0; i < nn; i++) S.clutter.push({ b: (a0 + Math.random() * d) % 360, r: Math.random() * S.radar.range * 1.1, s: 0.3 + Math.random() * 0.3, t: S.t });
  }
  // pluie
  if (S.env.rain) {
    const ftc = S.radar.rain / 100;
    for (const c of S.rainCells) {
      const dx = c.x - o.x, dy = c.y - o.y, rc = Math.hypot(dx, dy), bc = brgOf(dx, dy);
      const half = rc > c.r ? Math.asin(c.r / rc) * R2D : 180;
      const rel = ((bc - a0 - d / 2 + 540) % 360) - 180;
      if (Math.abs(rel) > half + d) continue;
      const k = Math.floor(260 * c.r * c.r * (d / 360) * (rc > c.r ? 360 / (2 * half) : 1) * band + Math.random());
      for (let i = 0; i < k; i++) {
        const v = vec(Math.random() * 360, c.r * Math.sqrt(Math.random()));
        const px = c.x + v.x - o.x, py = c.y + v.y - o.y, b = brgOf(px, py);
        if (!inSweep(b, a0, d)) continue;
        const s = Math.random() * (S.radar.band === 'X' ? 0.9 : 0.4);
        if (s < ftc * 0.9 || s < thr) continue;
        S.clutter.push({ b, r: Math.hypot(px, py), s, t: S.t });
      }
    }
  }
}

function inRain(x: number, y: number): boolean {
  return S.env.rain && S.rainCells.some((c) => Math.hypot(x - c.x, y - c.y) < c.r);
}

function paint(t: Target, dx: number, dy: number, b: number): void {
  const r = Math.hypot(dx, dy), small = t.rcs < 1;
  if (masked(b, r)) return; // derrière la terre : pas d'écho
  const rcs = t.rcs * (S.radar.band === 'S' && small ? 0.8 : 1);
  const rmax = 3 + 6 * Math.sqrt(rcs);
  const fl = small ? 0.55 + 0.9 * Math.random() : 0.8 + 0.4 * Math.random();
  let s = (rcs * fl) / (1 + Math.pow(r / rmax, 4));
  s *= rainAttenuation(t.x, t.y);
  if (inRain(t.x, t.y)) s *= 1 - (S.radar.rain / 100) * 0.5; // le FTC affaiblit aussi les échos dans le grain
  const supp = Math.max(gainThreshold(), seaLevel() * 1.4 * Math.exp(-r / clutR()));
  if (s < supp) return;
  t.echo = { x: t.x, y: t.y, b, r, t: S.t };
  const tr = S.tracks.find((k) => k.tid === t.id);
  if (tr) addObs(tr, dx, dy);
  else if (S.radar.zone > 0 && r <= S.radar.zone && S.tracks.length < TRACK_CAPACITY) {
    const n = acquire(t, true);
    if (n) raiseEvent(`zone-${t.id}`, 'alarm', `Nouvelle cible ${n} dans la zone d'acquisition (${r.toFixed(1)} NM)`);
  }
}

/** Acquisition d'une cible ; renvoie son numéro, ou null si impossible. */
export function acquire(t: Target, auto: boolean): number | null {
  if (!t.echo || S.tracks.find((k) => k.tid === t.id)) return null;
  if (S.tracks.length >= TRACK_CAPACITY) { logE(`Capacité de suivi atteinte (${TRACK_CAPACITY})`, 'warn'); return null; }
  const tr: Track = {
    n: S.trackSeq++, tid: t.id, t0: S.t, obs: [], last: S.t, state: 'ACQ', est: null,
    range: 0, brg: 0, cpa: 0, tcpa: Infinity, brate: 0, bcr: null, bct: null, danger: false, crs: 0, spd: 0, auto, past: [],
  };
  S.tracks.push(tr);
  if (!auto) S.sel = tr.n;
  addObs(tr, t.echo.x - S.own.x, t.echo.y - S.own.y);
  logE(`Acquisition cible ${tr.n}${auto ? ' (zone)' : ''}`);
  return tr.n;
}

export function cancelTrack(n: number): void {
  S.tracks = S.tracks.filter((k) => k.n !== n);
  if (S.sel === n) S.sel = null;
  updateAlerts();
}

function addObs(tr: Track, dx: number, dy: number): void {
  const b = brgOf(dx, dy), r = Math.hypot(dx, dy);
  const nb = b + gauss() * 0.45, nr = Math.max(0, r + gauss() * (0.005 + 0.0015 * r)), v = vec(nb, nr);
  tr.obs.push({ t: S.t, x: S.own.x + v.x, y: S.own.y + v.y });
  tr.last = S.t;
  while (tr.obs.length && tr.obs[0].t < S.t - 150) tr.obs.shift();
}

export function estimate(tr: Track): void {
  const o = S.own, age = S.t - tr.t0;
  tr.state = S.t - tr.last > 20 ? 'LOST' : age < ACQ_TIME ? 'ACQ' : 'TRK';
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
    const lp = tr.past[tr.past.length - 1];
    if (!lp || S.t - lp.t >= 15) { tr.past.push({ t: S.t, x: tr.est.x, y: tr.est.y }); while (tr.past.length > 100) tr.past.shift(); }
  } else if (tr.est && tr.lostT !== S.t) {
    tr.est.x += tr.est.vx * K2N * 0.25; tr.est.y += tr.est.vy * K2N * 0.25; tr.lostT = S.t;
  }
  if (!tr.est) return;
  const px = tr.est.x - o.x, py = tr.est.y - o.y, rvx = tr.est.vx - o.vx, rvy = tr.est.vy - o.vy;
  const c = cpaOf(px, py, rvx * K2N, rvy * K2N);
  tr.range = Math.hypot(px, py); tr.brg = brgOf(px, py); tr.cpa = c.cpa; tr.tcpa = c.tcpa;
  tr.brate = ((rvx * K2N * py - rvy * K2N * px) / Math.max(1e-9, px * px + py * py)) * R2D * 60;
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

/** Temps restant (s) avant l'exécution de la manœuvre d'essai (décompte, MSC.192(79) 5.31). */
export function trialRemaining(): number {
  return Math.max(0, S.radar.trialDelay * 60 - (S.t - S.radar.trialT0));
}

/** Manœuvre d'essai : cap / vitesse surface d'essai après le délai restant, dérive actuelle conservée. */
export function trialCalc(tr: Track): TrialResult | undefined {
  if (!tr.est) return undefined;
  const o = S.own, R = S.radar, w = ownWater();
  const dr = { x: o.vx - w.x, y: o.vy - w.y }, tw = vec(R.trialHdg, R.trialSpd), tg = { x: tw.x + dr.x, y: tw.y + dr.y }, D = trialRemaining();
  const px = tr.est.x - o.x + (tr.est.vx - o.vx) * K2N * D, py = tr.est.y - o.y + (tr.est.vy - o.vy) * K2N * D;
  const rvx = tr.est.vx - tg.x, rvy = tr.est.vy - tg.y, c = cpaOf(px, py, rvx * K2N, rvy * K2N);
  return { cpa: c.cpa, tcpa: c.tcpa + D, px, py, rvx, rvy };
}
