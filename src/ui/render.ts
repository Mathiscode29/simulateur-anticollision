/**
 * Rendu du scope radar (PPI) sur canvas 2D.
 *
 * Présentation et symbologie suivant MSC.192(79) et SN.1/Circ.243/Rev.2 :
 *  - échelles 0,25 à 24 NM, anneaux fixes, ligne de foi, graduation compas ;
 *  - mouvement relatif ou vrai (recentrage automatique à 50 % du rayon), décentrage manuel jusqu'à 75 % ;
 *  - 2 EBL / 2 VRM, 4 lignes parallèles indexées, lecture permanente du curseur ;
 *  - cibles suivies : segments de cercle en acquisition (rouges et clignotants en acquisition automatique non
 *    acquittée), cercle + vecteur en poursuite, cercle rouge épais clignotant jusqu'à l'acquittement pour une
 *    cible dangereuse, cercle barré pour une cible perdue, carré par ses coins pour la cible sélectionnée,
 *    points équidistants en temps pour les positions passées ;
 *  - manœuvre d'essai signalée par un grand « T » et un décompte ;
 *  - échos de côte (bandes depuis le trait de côte, masquage au-delà), bouées et bateaux-feux ;
 *  - cibles AIS en superposition (triangles), priorité à l'AIS pour une piste associée (MSC.192(79) 5.33) ;
 *  - palettes jour / crépuscule / nuit.
 */
import { S } from '../core/state';
import { RINGS } from '../core/data';
import { D2R, adiff, brgOf, clamp, n360, vec } from '../core/util';
import { ownWater } from '../sim/physics';
import { SWP, seaLevel, trialRemaining, trueV } from '../sim/radar';
import { DT } from '../sim/loop';
import { isUnackedDanger, isUnackedLost } from '../sim/alerts';
import { CHART, NRAYS } from '../sim/chart';
import { fmtLat, fmtLon, toLL } from '../core/geo';
import { aisAssociated, aisLost, aisPos } from '../sim/ais';

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
let W = 0, DPR = 1;

/**
 * Balayage continu : la simulation avance par pas de 0,25 s (36° de rotation d'antenne), l'écran est rafraîchi à chaque
 * image. L'affichage est daté d'un pas en retard sur la simulation (tv = S.t − DT + fraction écoulée du pas suivant) :
 * tout ce que le faisceau a éclairé avant tv est déjà calculé, et un écho n'apparaît qu'au passage du trait de balayage.
 */
let frac = 0;
export function setSimFrac(f: number): void { frac = clamp(f, 0, DT); }
/** Position du curseur sur le scope (pixels CSS), null hors du scope. */
export const cursor: { x: number | null; y: number | null } = { x: null, y: null };

interface Pal { frame: string; ppi: string; echo: string; ring: string; scale: string; lbl: string; text: string; dim: string; sym: string; head: string; danger: string; lost: string; ebl: string; eblTxt: string; trial: string; own: string; zone: string; route: string; cog: string; vec: string }
export const PALETTES: Record<'DAY' | 'DUSK' | 'NIGHT', Pal> = {
  DAY: { frame: '#d5dde4', ppi: '#0b2c4d', echo: '#ffd84a', ring: '#4f86ab', scale: '#25384a', lbl: '#a9c9e0', text: '#0d1b26', dim: '#4d6475', sym: '#33e6ff', head: '#ffffff', danger: '#ff2b2b', lost: '#ffb020', ebl: '#86ffbe', eblTxt: '#0a6b3a', trial: '#ff9f1c', own: '#ffffff', zone: '#c38bff', route: '#ff3b30', cog: '#ffffff', vec: '#5ee82f' },
  DUSK: { frame: '#020509', ppi: '#04182a', echo: '#ffd23f', ring: '#1f5d74', scale: '#8fb5cc', lbl: '#8fb5cc', text: '#bfe3f5', dim: '#7f9fb3', sym: '#5ff3ff', head: '#e8f4ff', danger: '#ff3b3b', lost: '#ffb020', ebl: '#7dffb0', eblTxt: '#7dffb0', trial: '#ff9f1c', own: '#e8f4ff', zone: '#b58cff', route: '#ff4646', cog: '#e8f4ff', vec: '#5ee82f' },
  NIGHT: { frame: '#000000', ppi: '#020406', echo: '#9a7414', ring: '#152a35', scale: '#4b5e6b', lbl: '#4b5e6b', text: '#6d7d88', dim: '#4a5862', sym: '#2c8796', head: '#7b8a95', danger: '#a51616', lost: '#8a5a10', ebl: '#3c7d58', eblTxt: '#3c7d58', trial: '#8a5a10', own: '#7b8a95', zone: '#5c4a80', route: '#8a1c1c', cog: '#7b8a95', vec: '#2f6b22' },
};

export function initRender(canvas: HTMLCanvasElement): void {
  cv = canvas;
  ctx = canvas.getContext('2d')!;
  new ResizeObserver(resize).observe(cv);
  resize();
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width;
  cv.width = Math.round(r.width * DPR);
  cv.height = Math.round(r.width * DPR);
}

function dispRot(): number {
  const R = S.radar;
  return R.orient === 'HU' ? S.own.hdg : R.orient === 'CU' ? R.cuRef : 0;
}

/** Route fond du porteur (repli sur le cap à faible vitesse). */
function ownCourse(): number {
  const o = S.own;
  return Math.hypot(o.vx, o.vy) > 0.5 ? brgOf(o.vx, o.vy) : o.hdg;
}

/** Recentrage du mouvement vrai : le porteur repart à 50 % du rayon sur l'arrière du centre. */
export function resetTM(): void {
  const o = S.own, v = vec(ownCourse(), S.radar.range * 0.5);
  S.radar.tmC = { x: o.x + v.x, y: o.y + v.y };
}

/** Centre géographique de l'affichage. */
function displayCentre(): { x: number; y: number } {
  const R = S.radar, o = S.own;
  if (R.motion === 'TM') return R.tmC;
  if (R.offMode === 'FWD') { const v = vec(R.orient === 'NU' ? ownCourse() : o.hdg, R.range * 0.5); return { x: o.x + v.x, y: o.y + v.y }; }
  if (R.offMode === 'CUR') {
    const d = Math.hypot(R.off.x, R.off.y), m = R.range * 0.75, f = d > m ? m / d : 1;
    return { x: o.x + R.off.x * f, y: o.y + R.off.y * f };
  }
  return { x: o.x, y: o.y };
}

/** Géométrie d'affichage : conversions géographique / relatif au porteur <-> pixels. */
export function geo() {
  const R = S.radar, o = S.own;
  const w = W, cx = w / 2, cy = w / 2, Rr = w / 2 - 16, k = Rr / R.range, rot = dispRot();
  const C = displayCentre(), cr = Math.cos(rot * D2R), sr = Math.sin(rot * D2R);
  const Wp = (wx: number, wy: number): [number, number] => {
    const dx = wx - C.x, dy = wy - C.y;
    return [cx + (dx * cr - dy * sr) * k, cy - (dx * sr + dy * cr) * k];
  };
  return {
    w, cx, cy, Rr, k, rot,
    /** position géographique (NM) → écran */
    Wp,
    /** position relative au porteur (NM) → écran */
    P: (dx: number, dy: number): [number, number] => Wp(o.x + dx, o.y + dy),
    /** écran → position géographique (NM) */
    inv: (px: number, py: number) => { const sx = (px - cx) / k, sy = (cy - py) / k; return { x: C.x + sx * cr + sy * sr, y: C.y - sx * sr + sy * cr }; },
  };
}

function line(x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** Triangle AIS (SN.1/Circ.243) : sommet dans la direction donnée (déjà corrigée de l'orientation). */
function aisTriangle(q: [number, number], dir: number, s: number): void {
  ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(dir * D2R);
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.5, s * 0.6); ctx.lineTo(-s * 0.5, s * 0.6); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

/** Lecture curseur : relèvement vrai et distance depuis le porteur. */
export function cursorReadout(): { b: number; r: number } | null {
  if (cursor.x === null || cursor.y === null) return null;
  const G = geo(), p = G.inv(cursor.x, cursor.y), o = S.own;
  const dx = p.x - o.x, dy = p.y - o.y;
  return { b: brgOf(dx, dy), r: Math.hypot(dx, dy) };
}

export function eblText(b: number): string {
  return S.radar.eblRef === 'T' ? `${b.toFixed(1)}°T` : `${n360(adiff(b, S.own.hdg)).toFixed(1)}°R`;
}

export function draw(): void {
  if (!W) return;
  const R = S.radar, o = S.own, pal = PALETTES[R.palette];
  if (R.motion === 'TM' && Math.hypot(o.x - R.tmC.x, o.y - R.tmC.y) > R.range * 0.52) resetTM();
  const G = geo(), { w, cx, cy, Rr, k, rot, P, Wp } = G;
  const now = performance.now(), blink = Math.floor(now / 450) % 2 === 0, tv = S.t - DT + frac;
  const fs = clamp(w / 68, 10, 14), sz = clamp(w / 120, 6, 10);
  const [ox, oy] = P(0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.frame; ctx.fillRect(0, 0, w, w);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, 7); ctx.fillStyle = pal.ppi; ctx.fill(); ctx.clip();

  // clutter (mer, pluie, bruit) : positions relatives au porteur
  ctx.fillStyle = pal.echo;
  for (const p of S.clutter) {
    const ag = tv - p.t, a = 1 - (0.6 * ag) / SWP;
    if (ag < 0 || ag >= SWP || p.r > R.range * 1.6) continue;
    ctx.globalAlpha = a * Math.min(1, p.s);
    const v = vec(p.b, p.r), q = P(v.x, v.y);
    ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
  }

  // sillages
  if (R.trail !== 'OFF') {
    for (const h of S.hist) {
      const ag = S.t - h.t;
      if (ag > R.trailMin * 60) continue;
      ctx.globalAlpha = 0.45 * (1 - ag / (R.trailMin * 60)) + 0.08;
      ctx.fillStyle = pal.echo;
      for (const t of S.targets) {
        if (!t.echo || S.t - t.echo.t > SWP * 1.1) continue;
        const q = h.p[t.id];
        if (!q) continue;
        const s = R.trail === 'REL' ? P(q[0] - h.ox, q[1] - h.oy) : Wp(q[0], q[1]);
        ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2);
      }
      if (R.trail === 'TRUE') { const s = Wp(h.ox, h.oy); ctx.fillStyle = pal.own; ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2); }
    }
  }

  // côte : bande d'écho depuis le premier point de terre, sur la largeur du faisceau
  const co = S.coast;
  if (co) {
    ctx.fillStyle = pal.echo;
    const half = 0.25 + (R.band === 'X' ? 0.5 : 0.9), maxR = R.range * 1.5 + 2;
    for (let i = 0; i < NRAYS; i++) {
      const r0 = co.r0[i];
      if (r0 > maxR) continue;
      const ag = tv - (co.t[i] <= tv ? co.t[i] : co.tp[i]);
      if (ag > SWP * 1.05 || ag < 0) continue;
      const r1 = Math.min(co.r1[i], r0 + co.band[i]), b = i * 0.5;
      ctx.globalAlpha = clamp(1 - (0.5 * ag) / SWP, 0.3, 0.95);
      const a1 = vec(b - half, r0), a2 = vec(b + half, r0), b1 = vec(b - half, r1), b2 = vec(b + half, r1);
      const q1 = Wp(co.ox + a1.x, co.oy + a1.y), q2 = Wp(co.ox + a2.x, co.oy + a2.y), q3 = Wp(co.ox + b2.x, co.oy + b2.y), q4 = Wp(co.ox + b1.x, co.oy + b1.y);
      ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.lineTo(q4[0], q4[1]); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // bouées et bateaux-feux
  ctx.fillStyle = pal.echo;
  for (const m of CHART.marks) {
    const me = S.markEcho[m.id];
    if (me === undefined) continue;
    const ag = tv - (me.t <= tv ? me.t : me.tp);
    if (ag < 0 || ag > SWP * 1.05) continue;
    const q = Wp(m.x, m.y), wd = Math.max(3, Math.hypot(m.x - o.x, m.y - o.y) * k * (R.band === 'X' ? 1 : 1.8) * D2R), dp = m.kind === 'lv' ? 3.5 : 2.5;
    ctx.globalAlpha = clamp(1 - (0.5 * ag) / SWP, 0.25, 1);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate((brgOf(m.x - o.x, m.y - o.y) - rot) * D2R); ctx.fillRect(-wd / 2, -dp / 2, wd, dp); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // échos
  ctx.fillStyle = pal.echo;
  const beam = (R.band === 'X' ? 1.0 : 1.8) * D2R;
  for (const t of S.targets) {
    const e = t.echo && t.echo.t <= tv ? t.echo : t.echoPrev;
    if (!e) continue;
    const ag = tv - e.t;
    if (ag < 0 || ag > SWP * 1.05) continue;
    const q = Wp(e.x, e.y);
    if (Math.hypot(q[0] - cx, q[1] - cy) > Rr + 10) continue;
    ctx.globalAlpha = clamp(1 - (0.5 * ag) / SWP, 0.25, 1);
    const lp = (t.L / 1852) * k;
    const wd = Math.max(3, e.r * k * beam + lp * 0.6), dp = Math.max(2.5, 0.025 * k + lp * 0.4);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate((e.b - rot) * D2R); ctx.fillRect(-wd / 2, -dp / 2, wd, dp); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // anneaux de distance (centrés sur le porteur)
  ctx.strokeStyle = pal.ring; ctx.lineWidth = 1;
  const rs = RINGS[R.range];
  for (let rr = rs; rr <= R.range + 1e-6; rr += rs) { ctx.beginPath(); ctx.arc(ox, oy, rr * k, 0, 7); ctx.stroke(); }

  // zone d'acquisition
  if (R.zone > 0) {
    ctx.strokeStyle = pal.zone; ctx.setLineDash([2, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ox, oy, R.zone * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }

  // route prévue (rouge), couloir d'écart sur le segment actif, points tournants
  const rt = S.route;
  if (rt && rt.show && rt.wps.length > 1) {
    ctx.strokeStyle = pal.route; ctx.fillStyle = pal.route;
    for (let i = 0; i < rt.wps.length - 1; i++) {
      const a = Wp(rt.wps[i].x, rt.wps[i].y), b = Wp(rt.wps[i + 1].x, rt.wps[i + 1].y);
      ctx.lineWidth = i === rt.leg ? 2.4 : 1.3; line(a[0], a[1], b[0], b[1]);
    }
    const A = rt.wps[rt.leg], B = rt.wps[rt.leg + 1], n = vec(brgOf(B.x - A.x, B.y - A.y) + 90, rt.xteLim);
    ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    for (const sg of [1, -1]) { const a = Wp(A.x + n.x * sg, A.y + n.y * sg), b = Wp(B.x + n.x * sg, B.y + n.y * sg); line(a[0], a[1], b[0], b[1]); }
    ctx.setLineDash([]);
    ctx.font = `600 ${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    rt.wps.forEach((p, i) => {
      if (i === 0) return;
      const q = Wp(p.x, p.y);
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke();
      ctx.fillText(`WP${i}`, q[0] + 8, q[1] - 8);
    });
  }

  // lignes parallèles indexées
  ctx.strokeStyle = pal.sym; ctx.lineWidth = 1; ctx.setLineDash([1, 4]);
  for (const pi of R.pi) {
    if (!pi) continue;
    const u = vec(pi.b, 1), n = vec(pi.b + 90, pi.d), L = R.range * 3;
    const a = P(n.x - u.x * L, n.y - u.y * L), b = P(n.x + u.x * L, n.y + u.y * L);
    line(a[0], a[1], b[0], b[1]);
  }
  ctx.setLineDash([]);

  // ligne de foi
  ctx.strokeStyle = pal.head; ctx.lineWidth = 1.3;
  const hv = vec(o.hdg, R.range * 3), hq = P(hv.x, hv.y);
  line(ox, oy, hq[0], hq[1]);

  // navire porteur : contour à petite échelle, double cercle sinon (SN.1/Circ.243)
  ctx.strokeStyle = pal.own; ctx.lineWidth = 1.2;
  if (R.range <= 1.5) {
    const L = o.L / 1852, B = L * 0.16;
    const pts = [[0, L / 2], [B / 2, L / 4], [B / 2, -L / 2], [-B / 2, -L / 2], [-B / 2, L / 4]].map(([a, b]) => {
      const f = vec(o.hdg, b), s = vec(o.hdg + 90, a);
      return P(f.x + s.x, f.y + s.y);
    });
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(ox, oy, 3, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox, oy, 6.5, 0, 7); ctx.stroke();
  }

  // vecteur du porteur (vecteurs vrais)
  const vm = R.vecMin / 60;
  if (R.vec === 'TRUE') {
    // vecteur du porteur : route fond (stabilisation sol) ou route surface (stabilisation eau), dérive comprise.
    // Trait blanc à repères de temps (toutes les 30 s, plus longs à la minute) : il reste distinct de la ligne de foi,
    // trait blanc nu, même quand les deux sont confondus (pas de dérive).
    const v = R.stab === 'GND' ? { x: o.vx, y: o.vy } : ownWater(), q = P(v.x * vm, v.y * vm);
    const len = Math.hypot(q[0] - ox, q[1] - oy);
    if (len > 4) {
      const ux = (q[0] - ox) / len, uy = (q[1] - oy) / len, n = R.vecMin * 2;
      ctx.strokeStyle = pal.cog; ctx.lineWidth = 1.6; line(ox, oy, q[0], q[1]);
      ctx.lineWidth = 1.2;
      for (let m = 1; m <= n; m++) {
        const f = m / n, px = ox + (q[0] - ox) * f, py = oy + (q[1] - oy) * f, l = m % 2 ? 2.5 : 4.5;
        line(px - uy * l, py + ux * l, px + uy * l, py - ux * l);
      }
      // petite flèche blanche (double chevron) au bout du vecteur
      ctx.lineWidth = 1.5;
      for (const d of [0, 5]) {
        const tx = q[0] - ux * d, ty = q[1] - uy * d;
        ctx.beginPath();
        ctx.moveTo(tx - ux * 6 - uy * 4, ty - uy * 6 + ux * 4); ctx.lineTo(tx, ty); ctx.lineTo(tx - ux * 6 + uy * 4, ty - uy * 6 - ux * 4);
        ctx.stroke();
      }
    }
  }
  if (R.trial && R.vec === 'TRUE') {
    ctx.setLineDash([6, 4]); ctx.strokeStyle = pal.trial; ctx.lineWidth = 1.5;
    const w0 = ownWater(), tw = vec(R.trialHdg, R.trialSpd);
    const v = R.stab === 'GND' ? { x: tw.x + o.vx - w0.x, y: tw.y + o.vy - w0.y } : tw, q = P(v.x * vm, v.y * vm);
    line(ox, oy, q[0], q[1]);
    ctx.setLineDash([]);
  }

  // cibles AIS (triangles) non associées à une piste
  const assoc = new Map<number, number>();
  if (S.ecdis.aisRadar) {
    for (const tr of S.tracks) { const t = aisAssociated(tr); if (t) assoc.set(t.id, tr.n); }
    ctx.strokeStyle = pal.sym; ctx.lineWidth = 1.2;
    for (const t of S.targets) {
      if (!t.ais?.rep || assoc.has(t.id)) continue;
      const p = aisPos(t)!, q = Wp(p.x, p.y);
      if (Math.hypot(q[0] - cx, q[1] - cy) > Rr) continue;
      aisTriangle(q, t.ais.rep.hdg - rot, sz * 1.25);
      if (aisLost(t)) { line(q[0] - sz, q[1] - sz, q[0] + sz, q[1] + sz); line(q[0] - sz, q[1] + sz, q[0] + sz, q[1] - sz); }
    }
  }

  // cibles suivies
  ctx.font = `600 ${fs * 0.85}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const tr of S.tracks) {
    if (!tr.est) continue;
    const isAis = [...assoc.values()].includes(tr.n);
    const q = Wp(tr.est.x, tr.est.y);
    if (Math.hypot(q[0] - cx, q[1] - cy) > Rr + 20) continue;
    const dangerFlash = tr.danger && isUnackedDanger(tr.n), lostFlash = tr.state === 'LOST' && isUnackedLost(tr.n);
    const col = tr.state === 'LOST' ? pal.lost : tr.danger ? pal.danger : pal.sym;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    // positions passées
    if (R.pastMin > 0 && tr.state !== 'ACQ') {
      for (let i = 1; i <= 4; i++) {
        const tt = S.t - i * R.pastMin * 60;
        let best = null as null | { x: number; y: number }, bd = 20;
        for (const p of tr.past) { const d = Math.abs(p.t - tt); if (d < bd) { bd = d; best = p; } }
        if (best) { const s = Wp(best.x, best.y); ctx.beginPath(); ctx.arc(s[0], s[1], 1.6, 0, 7); ctx.fill(); }
      }
    }
    // vecteur
    if (tr.state !== 'ACQ' && tr.est.vok) {
      let vx: number, vy: number;
      if (R.vec === 'REL') { vx = tr.est.vx - o.vx; vy = tr.est.vy - o.vy; } else { const t = trueV(tr); vx = t.x; vy = t.y; }
      const e = Wp(tr.est.x + vx * vm, tr.est.y + vy * vm);
      // vecteur de cible : tirets verts (rouges si dangereuse, orange si perdue)
      ctx.strokeStyle = tr.danger || tr.state === 'LOST' ? col : pal.vec; ctx.lineWidth = tr.danger ? 2.2 : 1.6; ctx.setLineDash([7, 5]);
      line(q[0], q[1], e[0], e[1]);
      ctx.setLineDash([]); ctx.strokeStyle = col;
    }
    const show = (!dangerFlash && !lostFlash && !(tr.auto && tr.state === 'ACQ')) || blink;
    if (show) {
      if (tr.state === 'ACQ') {
        const autoUnack = tr.auto;
        ctx.strokeStyle = autoUnack ? pal.danger : col; ctx.lineWidth = autoUnack ? 2.5 : 1.5;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(q[0], q[1], sz + 1, (i * Math.PI) / 2 + 0.25, (i * Math.PI) / 2 + Math.PI / 2 - 0.25); ctx.stroke(); }
      } else if (isAis) {
        // piste associée à une cible AIS : symbole AIS activé (priorité AIS)
        const t = S.targets.find((x) => x.id === tr.tid);
        ctx.lineWidth = tr.danger ? 3 : 1.5;
        aisTriangle(q, (t?.ais?.rep?.hdg ?? tr.crs) - rot, sz * 1.5);
      } else {
        ctx.lineWidth = tr.danger ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(q[0], q[1], sz, 0, 7); ctx.stroke();
        if (tr.state === 'LOST') { ctx.lineWidth = 2.5; line(q[0] - sz * 1.3, q[1] - sz * 1.3, q[0] + sz * 1.3, q[1] + sz * 1.3); line(q[0] - sz * 1.3, q[1] + sz * 1.3, q[0] + sz * 1.3, q[1] - sz * 1.3); }
      }
    }
    ctx.fillStyle = col;
    ctx.fillText(String(tr.n), q[0] + sz + 3, q[1] - sz - 1);
    if (S.sel === tr.n) {
      ctx.strokeStyle = pal.head; ctx.lineWidth = 1.2;
      const s = sz + 6, c = 5;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        line(q[0] + a * s, q[1] + b * s, q[0] + a * (s - c), q[1] + b * s);
        line(q[0] + a * s, q[1] + b * s, q[0] + a * s, q[1] + b * (s - c));
      }
    }
    if (R.trial && tr.trial && tr.state !== 'ACQ') {
      const tt = tr.trial, a = P(tt.px, tt.py), b = P(tt.px + tt.rvx * vm, tt.py + tt.rvy * vm);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = pal.trial; ctx.lineWidth = 1.5; line(a[0], a[1], b[0], b[1]); ctx.setLineDash([]);
    }
  }

  // EBL / VRM
  const dashes = [[8, 5], [3, 4]];
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = pal.ebl; ctx.lineWidth = 1.2; ctx.setLineDash(dashes[i]);
    const b = R.ebl[i], r = R.vrm[i];
    if (b !== null) { const v = vec(b, R.range * 3), q = P(v.x, v.y); line(ox, oy, q[0], q[1]); }
    if (r !== null) { ctx.beginPath(); ctx.arc(ox, oy, r * k, 0, 7); ctx.stroke(); }
  }
  ctx.setLineDash([]);

  // balayage continu (masqué au-delà de ×4 : la rotation devient trop rapide pour être suivie) :
  // trait de balayage et traînée lumineuse en secteurs pleins dégradés
  if (S.ts <= 4 && !S.paused) {
    const a = (S.sweep - (360 * (S.t - tv)) / SWP - rot) * D2R, L = R.range * 3 * k, wd = 0.022, N = 16;
    ctx.fillStyle = pal.sym;
    for (let i = 0; i < N; i++) {
      const b1 = a - i * wd, b0 = b1 - wd - 0.002;
      ctx.globalAlpha = 0.16 * (1 - i / N);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, L, b0 - Math.PI / 2, b1 - Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = pal.sym; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    line(ox, oy, ox + Math.sin(a) * L, oy - Math.cos(a) * L);
    ctx.globalAlpha = 1;
  }

  // curseur
  if (cursor.x !== null && cursor.y !== null && Math.hypot(cursor.x - cx, cursor.y - cy) < Rr) {
    ctx.strokeStyle = pal.head; ctx.lineWidth = 1;
    line(cursor.x - 9, cursor.y, cursor.x - 3, cursor.y); line(cursor.x + 3, cursor.y, cursor.x + 9, cursor.y);
    line(cursor.x, cursor.y - 9, cursor.x, cursor.y - 3); line(cursor.x, cursor.y + 3, cursor.x, cursor.y + 9);
  }

  // manœuvre d'essai : grand « T » et décompte
  if (R.trial) {
    ctx.fillStyle = pal.trial; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs * 3}px system-ui,sans-serif`;
    const tx = cx - Rr * 0.68, ty = cy - Rr * 0.6;
    ctx.fillText('T', tx, ty);
    ctx.font = `600 ${fs * 0.9}px ui-monospace,Menlo,monospace`;
    const rem = trialRemaining();
    ctx.fillText(rem > 0 ? `dans ${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}` : 'immédiat', tx, ty + fs * 2);
  }
  ctx.restore();

  // graduation compas
  ctx.strokeStyle = pal.scale; ctx.fillStyle = pal.scale; ctx.lineWidth = 1;
  ctx.font = `${fs * 0.78}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let b = 0; b < 360; b += 5) {
    const a = (b - rot) * D2R, l = b % 10 ? 3 : 7, s = Math.sin(a), c = Math.cos(a);
    line(cx + s * Rr, cy - c * Rr, cx + s * (Rr + l), cy - c * (Rr + l));
    ctx.fillStyle = pal.lbl;
    if (b % 30 === 0) ctx.fillText(String(b).padStart(3, '0'), cx + s * (Rr - fs), cy - c * (Rr - fs));
  }

  // cartouches permanents (MSC.192(79) 5.10.2, 5.20.3, 5.22, 5.27.3, 5.3.2.5)
  const lh = fs * 1.25, sea = Math.round(seaLevel() * 100);
  ctx.font = `600 ${fs}px ui-monospace,Menlo,monospace`; ctx.textBaseline = 'top';
  const TL = [
    `${R.orient === 'NU' ? 'NORTH UP' : R.orient === 'CU' ? 'COURSE UP' : 'HEAD UP'} ${R.motion}${R.offMode !== 'OFF' && R.motion === 'RM' ? ' DÉCENTRÉ' : ''}`,
    `${R.range} NM  anneaux ${RINGS[R.range]} NM`,
    `BANDE ${R.band}  GAIN ${R.gain}`,
    `MER ${R.seaAuto ? 'AUTO ' : ''}${sea}  PLUIE ${R.rain}`,
  ];
  const TR = [
    `VECT ${R.vec === 'REL' ? 'REL' : 'VRAIS'} ${R.vecMin} min`,
    `STAB ${R.stab === 'GND' ? 'SOL (GNSS)' : 'EAU (LOCH)'}`,
    `SILLAGES ${R.trail === 'OFF' ? 'OFF' : (R.trail === 'REL' ? 'REL ' : 'VRAIS ') + R.trailMin + ' min'}`,
    `CPA ${R.cpaLim} NM  TCPA ${R.tcpaLim} min`,
    `AIS ${S.ecdis.aisRadar ? 'SUPERPOSÉ' : 'OFF'}`,
  ];
  ctx.textAlign = 'left'; TL.forEach((s, i) => { ctx.fillStyle = i === 0 ? pal.text : pal.dim; ctx.fillText(s, 6, 5 + i * lh); });
  ctx.textAlign = 'right'; TR.forEach((s, i) => { ctx.fillStyle = i === 0 ? pal.text : pal.dim; ctx.fillText(s, w - 6, 5 + i * lh); });
  ctx.textBaseline = 'bottom';
  const BL: string[] = [];
  for (let i = 0; i < 2; i++) {
    const b = R.ebl[i], r = R.vrm[i];
    if (b !== null || r !== null) BL.push(`EBL${i + 1} ${b !== null ? eblText(b) : '---'}  VRM${i + 1} ${r !== null ? r.toFixed(2) + ' NM' : '---'}`);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = pal.eblTxt; BL.forEach((s, i) => ctx.fillText(s, 6, w - 5 - (BL.length - 1 - i) * lh));
  const cr = cursorReadout(), BR: string[] = [];
  if (cr) {
    const G2 = geo(), pc = G2.inv(cursor.x!, cursor.y!), ll = toLL(pc.x, pc.y);
    BR.push(`${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`);
    BR.push(`CURSEUR ${cr.b.toFixed(1)}°T ${cr.r.toFixed(2)} NM`);
  }
  BR.push(S.env.vis === 'poor' ? 'BRUME' : S.env.night ? 'NUIT' : 'JOUR');
  ctx.textAlign = 'right'; BR.forEach((s, i) => { ctx.fillStyle = i === BR.length - 1 && S.env.vis === 'poor' ? pal.lost : pal.text; ctx.fillText(s, w - 6, w - 5 - (BR.length - 1 - i) * lh); });

  if (!S.started && !S.over) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${fs * 1.2}px system-ui,sans-serif`;
    ctx.fillStyle = 'rgba(2,5,9,.78)'; ctx.fillRect(cx - 150, cy + Rr * 0.45 - 16, 300, 32);
    ctx.fillStyle = '#fff'; ctx.fillText('Appuyez sur ▶ (ou Espace) pour démarrer', cx, cy + Rr * 0.45);
  }
}
