/**
 * Vue extérieure depuis la passerelle (canvas 2D, perspective simple, sans bibliothèque 3D).
 *
 * - Œil à 32 m au-dessus de l'eau, à l'arrière (passerelle du VLCC), regard orientable sur 180° (± 90° autour de
 *   l'avant, ou autour de l'arrière en vue « aileron »), jumelles 7× (champ ≈ 7,5°).
 * - Rotondité de la Terre avec réfraction standard (rayon effectif 7/6 R) : horizon à ≈ 11,8 NM, les coques
 *   au-delà sont coupées par l'horizon, les superstructures et les feux restent visibles.
 * - Atmosphère : contraste atténué selon la loi de Koschmieder (visibilité météorologique), brume, nuit.
 * - Cibles : silhouettes simples (coque, château, cheminée, mâts, voiles), feux selon les secteurs de l'annexe I,
 *   marques de jour ; bouées et bateaux-feux de la carte ; côte à partir des rayons radar (relief schématique,
 *   falaises de Douvres et des caps Blanc-Nez / Gris-Nez), lumières à terre de nuit.
 * - État de la mer selon le vent (échelle de Beaufort) : crêtes qui avancent dans le lit du vent, moutons, embruns,
 *   mouvements de plate-forme (roulis, tangage) d'amplitude modeste pour un VLCC.
 * - Feux de nuit avec halo et reflet sur l'eau, éclairage des emménagements et projecteurs de pont des chalutiers,
 *   vague d'étrave et sillage ; bouées avec voyants et rythmes IALA simplifiés, qui dansent à la houle.
 * - Console d'instruments (répétiteur gyro, axiomètre, indicateur de taux de giration ROT, loch, machine, anémomètre, sondeur).
 * Niveau de détail volontairement limité pour rester fluide.
 */
import { S, type Target } from '../core/state';
import { TELE } from '../core/data';
import { D2R, adiff, brgOf, clamp, n360, p3 } from '../core/util';
import { CHART, NRAYS, depthAt, rayIndex } from '../sim/chart';
import { dayShapes, navLights3D } from '../sim/visual';

const NM = 1852, RE = (6371000 * 7) / 6, EYE = 32;
const FOV = 62, FOV_BINO = 7.5;

/** Regard : relèvement relatif (± 90°), vue arrière, jumelles. */
export const look = { rel: 0, aft: false, binoc: false, inst: true };
export function lookBy(d: number): void { look.rel = clamp(look.rel + d, -90, 90); }

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
let W = 0, H = 0, DPR = 1;
let hover: number | null = null;

export function initOutside(canvas: HTMLCanvasElement): void {
  cv = canvas;
  ctx = canvas.getContext('2d')!;
  new ResizeObserver(resize).observe(cv);
  resize();
  let drag: { x: number; rel: number } | null = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, rel: look.rel }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    hover = e.clientX - r.left;
    if (drag) look.rel = clamp(drag.rel - ((e.clientX - drag.x) * fov()) / W, -90, 90);
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); look.binoc = e.deltaY < 0; }, { passive: false });
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
}

const fov = () => (look.binoc ? FOV_BINO : FOV);

// ---------------------------------------------------------------- couleurs

type RGB = [number, number, number];
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): string => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const dark = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

interface Sky { top: RGB; hor: RGB; seaH: RGB; seaN: RGB; land: RGB; cliff: RGB; vis: number; night: boolean }
function sky(): Sky {
  const night = S.env.night, fog = S.env.vis === 'poor';
  if (fog) return night
    ? { top: hex('#0d1013'), hor: hex('#1a1f23'), seaH: hex('#1a1f23'), seaN: hex('#07090b'), land: hex('#0b0d0e'), cliff: hex('#121416'), vis: 0.4 * NM, night }
    : { top: hex('#aeb6ba'), hor: hex('#c9cfd1'), seaH: hex('#c9cfd1'), seaN: hex('#6d7a80'), land: hex('#7d877c'), cliff: hex('#b9b8ad'), vis: 0.4 * NM, night };
  return night
    ? { top: hex('#02040a'), hor: hex('#0d1724'), seaH: hex('#09111a'), seaN: hex('#020406'), land: hex('#020304'), cliff: hex('#05070a'), vis: 14 * NM, night }
    : { top: hex('#5d93c8'), hor: hex('#d3e2ec'), seaH: hex('#7f9db0'), seaN: hex('#1d4660'), land: hex('#5b6a4b'), cliff: hex('#d7d4c7'), vis: 16 * NM, night };
}
/** Part de voile atmosphérique à la distance d (m) : contraste résiduel 5 % à la visibilité (Koschmieder). */
const veil = (d: number, V: number): number => 1 - Math.exp((-3 * d) / V);

// ---------------------------------------------------------------- état de la mer

/** Limites supérieures (kn) des forces de Beaufort 0 à 11, et hauteur significative probable en mer ouverte (m, OMM). */
const BF = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
const HS = [0, 0.1, 0.2, 0.6, 1, 2, 3, 4, 5.5, 7, 9, 11.5, 14];
export function beaufort(kn: number): number { let b = 0; while (b < 12 && kn > BF[b]) b++; return b; }
const CAPS = [0, 0, 0, 0.01, 0.04, 0.1, 0.18, 0.28, 0.38, 0.48, 0.55, 0.6, 0.65];

/** Roulis et tangage du porteur (degrés) : amplitude modeste pour un VLCC chargé, périodes 14 s et 9 s. */
function motion(): { roll: number; pitch: number } {
  const hs = HS[beaufort(S.env.windKn)], t = S.t;
  const ar = Math.min(3, 0.32 * hs), ap = Math.min(1.2, 0.12 * hs);
  return { roll: ar * (Math.sin((2 * Math.PI * t) / 14) + 0.3 * Math.sin((2 * Math.PI * t) / 23 + 1)), pitch: ap * Math.sin((2 * Math.PI * t) / 9 + 0.7) };
}

// ---------------------------------------------------------------- caméra

interface Cam { ex: number; ey: number; yaw: number; F: number; cy: number; cy0: number; yH: number; sy: number; cyw: number; tilt: number }
let cam: Cam;

/** Point du monde (m, depuis l'œil : est, nord, hauteur) → écran. null si derrière l'observateur. */
function proj(dx: number, dy: number, z: number): [number, number, number] | null {
  const f = dx * cam.sy + dy * cam.cyw;
  if (f < 2) return null;
  const r = dx * cam.cyw - dy * cam.sy, d = Math.hypot(dx, dy), u = z - EYE - (d * d) / (2 * RE);
  return [W / 2 + (r / f) * cam.F, cam.cy - (u / f) * cam.F, f];
}

/** Coordonnées navire (a avant, b tribord, z) → monde relatif à l'œil (m). */
function shipPt(t: { x: number; y: number; hdg: number }, a: number, b: number, z: number): [number, number, number] {
  const s = Math.sin(t.hdg * D2R), c = Math.cos(t.hdg * D2R);
  return [(t.x * NM - cam.ex) + a * s + b * c, (t.y * NM - cam.ey) + a * c - b * s, z];
}

function hull2D(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const p = [...pts].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Remplit l'enveloppe convexe d'un solide donné par ses sommets (coordonnées navire). */
function solid(t: { x: number; y: number; hdg: number }, verts: [number, number, number][], fill: string): void {
  const sp: [number, number][] = [];
  for (const v of verts) { const w = shipPt(t, v[0], v[1], v[2]), q = proj(w[0], w[1], w[2]); if (q) sp.push([q[0], q[1]]); }
  if (sp.length < 3) return;
  const h = hull2D(sp);
  ctx.fillStyle = fill;
  ctx.beginPath(); h.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
}
const box = (a0: number, a1: number, hb: number, z0: number, z1: number): [number, number, number][] =>
  [[a0, -hb, z0], [a0, hb, z0], [a1, -hb, z0], [a1, hb, z0], [a0, -hb, z1], [a0, hb, z1], [a1, -hb, z1], [a1, hb, z1]];

// ---------------------------------------------------------------- dessin

export function drawOutside(): void {
  if (!W || !H) return;
  const o = S.own, sk = sky(), hf = fov();
  const rel = look.rel + (look.aft ? 180 : 0), yaw = n360(o.hdg + rel);
  const eyeA = -o.L / 2 + 50; // passerelle à l'arrière
  const F = W / 2 / Math.tan((hf / 2) * D2R);
  // mouvements de plate-forme : inclinaison apparente et déplacement vertical de l'horizon selon la direction du regard
  const m = motion(), damp = look.binoc ? 0.6 : 1, cr = Math.cos(rel * D2R), sr = Math.sin(rel * D2R);
  const tilt = (m.roll * cr - m.pitch * sr) * damp * D2R, lift = (m.pitch * cr + m.roll * sr) * damp * D2R;
  const cy0 = H * (look.binoc ? 0.5 : 0.42), cy = cy0 + Math.tan(lift) * F, yH = cy + Math.sqrt((2 * EYE) / RE) * F;
  cam = { ex: o.x * NM + eyeA * Math.sin(o.hdg * D2R), ey: o.y * NM + eyeA * Math.cos(o.hdg * D2R), yaw, F, cy, cy0, yH, sy: Math.sin(yaw * D2R), cyw: Math.cos(yaw * D2R), tilt };
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

  // monde (incliné par le roulis apparent)
  ctx.save();
  ctx.translate(W / 2, cy); ctx.rotate(-tilt); ctx.translate(-W / 2, -cy);
  const bf = beaufort(S.env.windKn), rough = Math.min(1, bf / 8);
  const seaH = mix(sk.seaH, [150, 160, 160], sk.night ? 0 : rough * 0.25), seaN = mix(sk.seaN, [40, 60, 64], sk.night ? 0 : rough * 0.35);
  let g = ctx.createLinearGradient(0, yH - H, 0, yH);
  g.addColorStop(0, mix(sk.top, sk.top, 0)); g.addColorStop(1, mix(sk.hor, sk.hor, 0));
  ctx.fillStyle = g; ctx.fillRect(-W, yH - 2 * H, 3 * W, 2 * H + 1);
  g = ctx.createLinearGradient(0, yH, 0, yH + H);
  g.addColorStop(0, seaH); g.addColorStop(1, seaN);
  ctx.fillStyle = g; ctx.fillRect(-W, yH, 3 * W, 2 * H);
  if (sk.night && S.env.vis !== 'poor') stars(yH);
  drawCoast(sk, hf);
  waves(sk, bf);
  drawMarks(sk, bf);
  // cibles, de la plus lointaine à la plus proche
  const ts = [...S.targets].map((t) => ({ t, d: Math.hypot(t.x * NM - cam.ex, t.y * NM - cam.ey) })).sort((u, v) => v.d - u.d);
  for (const { t, d } of ts) drawTarget(t, d, sk);
  ctx.restore();
  if (!look.aft) ownDeck(sk);
  if (look.binoc) binocMask(); else { bridgeFrame(sk); if (look.inst) instruments(bf); }
  hud(hf, bf);
}

function stars(yH: number): void {
  ctx.fillStyle = 'rgba(220,230,255,0.75)';
  for (let i = 0; i < 160; i++) {
    const az = (i * 137.508) % 360, el = ((i * 7.31) % 30) + 1.5, rel = adiff(az, cam.yaw);
    if (Math.abs(rel) > fov() / 2) continue;
    const x = W / 2 + Math.tan(rel * D2R) * cam.F, y = cam.cy - Math.tan(el * D2R) * cam.F;
    if (y < yH - 3) ctx.fillRect(x, y, i % 5 ? 1 : 1.6, i % 5 ? 1 : 1.6);
  }
}

/**
 * Relief schématique de la carte : ondulation de base et sommets notables (falaises de Douvres et caps au
 * Pas-de-Calais ; Rocher de Gibraltar et Djebel Moussa au détroit de Gibraltar). Illustration, pas un MNT.
 */
function landHeight(x: number, y: number): { h: number; cliff: number } {
  let h = CHART.landBase * (1 + 1.67 * (0.5 + 0.5 * Math.sin(1.7 * x + 0.3) * Math.cos(1.3 * y - 0.7))), cl = 0;
  for (const c of CHART.relief) {
    const k = Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * c.r * c.r));
    h += c.h * k;
    if (c.cliff) cl = Math.max(cl, k);
  }
  return { h, cliff: cl };
}

/** Caractère d'un feu (Fl(n), Iso, Oc, Mo(A)) : allumé à l'instant t ? Rythmes simplifiés. */
function charOn(light: string, t: number): boolean {
  const per = Number(/(\d+(?:\.\d+)?)\s*s\b/.exec(light)?.[1] ?? 10), ph = ((t % per) + per) % per;
  const grp = /Fl\s*\((\d+)\)/.exec(light);
  if (grp) { const n = Number(grp[1]); return ph < n * 1.4 && ph % 1.4 < 0.5; }
  if (/^Iso/.test(light)) return ph < per / 2;
  if (/^Oc/.test(light)) return !(ph < 1.2 || (/Oc\s*\(2\)/.test(light) && ph >= 2 && ph < 3.2));
  if (/Mo\s*\(A\)/.test(light)) return ph < 0.5 || (ph >= 1 && ph < 2.5);
  return ph < 0.6;
}

function drawCoast(sk: Sky, hf: number): void {
  const co = S.coast;
  if (!co) return;
  const step = 360 / NRAYS, dH = Math.sqrt(2 * EYE * RE);
  for (let i = 0; i < NRAYS; i++) {
    const b = i * step, rel = adiff(b, cam.yaw);
    if (Math.abs(rel) > hf / 2 + step) continue;
    const r0 = co.r0[i];
    if (!(r0 < 40)) continue;
    const d = r0 * NM, sb = Math.sin(b * D2R), cb = Math.cos(b * D2R), hx = co.ox + sb * r0, hy = co.oy + cb * r0, cr = Math.cos(rel * D2R);
    const f = d * cr;
    if (f < 50) continue;
    // ligne de crête : élévation angulaire maximale le long du rayon, sur la terre traversée (relief en retrait de la côte)
    let lh = landHeight(hx, hy), el = (lh.h - EYE - (d * d) / (2 * RE)) / d;
    const rEnd = Math.min(co.r1[i], r0 + 4);
    for (let r = r0 + 0.25; r < rEnd; r += 0.25) {
      const q = landHeight(co.ox + sb * r, co.oy + cb * r), dd = r * NM, e = (q.h - EYE - (dd * dd) / (2 * RE)) / dd;
      if (e > el) { el = e; lh = q; }
    }
    const base = -EYE - (d * d) / (2 * RE);
    const yT = cam.cy - (el / cr) * cam.F, yB = d > dH ? cam.yH : cam.cy - (base / f) * cam.F;
    if (yT >= yB) continue;
    const x0 = W / 2 + Math.tan((rel - step / 2) * D2R) * cam.F, x1 = W / 2 + Math.tan((rel + step / 2) * D2R) * cam.F;
    const v = veil(d, sk.vis);
    if (v > 0.985) continue;
    const base3 = lh.cliff > 0.35 && !sk.night ? sk.cliff : sk.land;
    ctx.fillStyle = mix(base3, sk.hor, v);
    ctx.fillRect(x0, yT, x1 - x0 + 0.6, yB - yT);
    // lumières à terre la nuit
    if (sk.night && S.env.vis !== 'poor' && r0 < 22) {
      const hsh = Math.abs(Math.sin(Math.round(hx * 4) * 12.9898 + Math.round(hy * 4) * 78.233) * 43758.5453) % 1;
      if (hsh < 0.3) {
        ctx.fillStyle = `rgba(255,214,140,${(1 - v) * 0.9})`;
        const n = 1 + Math.floor(hsh * 10);
        for (let k = 0; k < n; k++) ctx.fillRect(x0 + ((k * 37) % 10) / 10 * (x1 - x0), yB - 1.5 - ((k * 53) % 7) / 7 * Math.min(8, (yB - yT) * 0.8), 1.4, 1.4);
      }
    }
  }
}

/**
 * Mer : crêtes dans un repère qui avance dans le lit du vent (vitesse de phase croissante avec la force du vent),
 * longueur et densité selon le Beaufort, moutons qui apparaissent et disparaissent, ondulations lointaines.
 */
function waves(sk: Sky, bf: number): void {
  const cell = 26 + 5 * bf, R = 1500, to = (S.env.windFrom + 180) * D2R, ux = Math.sin(to), uy = Math.cos(to);
  const c = 4 + 1.6 * bf, ox = ux * c * S.t, oy = uy * c * S.t; // dérive du champ de vagues
  const px = cam.ex - ox, py = cam.ey - oy, ci = Math.floor(px / cell), cj = Math.floor(py / cell), n = Math.ceil(R / cell);
  const crest = 4 + 2.2 * bf, kx = Math.cos(to), ky = -Math.sin(to); // direction des crêtes (perpendiculaire au vent)
  const hi = mix(sk.seaH, [255, 255, 255], sk.night ? 0.04 : 0.22), lo = mix(sk.seaN, [0, 0, 0], sk.night ? 0 : 0.25);
  const capP = CAPS[bf], night = sk.night;
  ctx.lineCap = 'round';
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const I = ci + i, J = cj + j, h1 = Math.abs(Math.sin(I * 127.1 + J * 311.7) * 43758.5453) % 1, h2 = Math.abs(Math.sin(I * 269.5 + J * 183.3) * 24634.6345) % 1;
    const wx = I * cell + h1 * cell + ox - cam.ex, wy = J * cell + h2 * cell + oy - cam.ey;
    const q = proj(wx, wy, 0);
    if (!q || q[2] > R || q[2] < 90 || q[0] < -60 || q[0] > W + 60) continue;
    const a = clamp(1 - q[2] / R, 0, 1) ** 1.3 * clamp((q[2] - 90) / 150, 0, 1), L2 = crest * (0.6 + h1) / 2;
    const p1 = proj(wx - kx * L2, wy - ky * L2, 0), p2 = proj(wx + kx * L2, wy + ky * L2, 0);
    if (!p1 || !p2) continue;
    const th = clamp(((0.18 + 0.07 * bf) / q[2]) * cam.F, 0.6, 3);
    if (bf >= 3) { ctx.globalAlpha = a * 0.5; ctx.strokeStyle = lo; ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(p1[0], p1[1] + th); ctx.lineTo(p2[0], p2[1] + th); ctx.stroke(); }
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = hi; ctx.lineWidth = th * 0.8; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    // moutons : écume qui naît et se résorbe
    if (h1 * h2 < capP) {
      const life = Math.sin(S.t * 0.55 + h1 * 60);
      if (life > 0.2) {
        const r = clamp((((0.8 + 0.35 * bf) * (life - 0.2)) / q[2]) * cam.F, 0.6, 9);
        ctx.globalAlpha = a * (night ? 0.25 : 0.9) * (life - 0.2) * 1.25; ctx.fillStyle = night ? '#8c969c' : '#f4f7f8';
        ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 1.6, r * 0.35, 0, 0, 7); ctx.fill();
        if (bf >= 7) { ctx.globalAlpha *= 0.4; ctx.fillRect(q[0] - r * 4, q[1] + r * 0.3, r * 8, Math.max(0.6, r * 0.12)); } // traînées d'écume
      }
    }
  }
  // ondulations lointaines vers l'horizon
  ctx.globalAlpha = night ? 0.06 : 0.12 + 0.02 * bf; ctx.strokeStyle = hi; ctx.lineWidth = 1;
  for (let k = 0; k < 70; k++) {
    const h = Math.abs(Math.sin(k * 91.7 + Math.floor(S.t / 3) * 0.37) * 9137.1) % 1, dist = 1500 + h * 9000;
    const y = cam.cy - ((-EYE - (dist * dist) / (2 * RE)) / dist) * cam.F, x = ((k * 0.618 + h * 0.2) % 1) * W, len = 4 + 30 * (1500 / dist);
    ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x + len, y); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}

const LIGHT: Record<string, string> = { W: '255,248,228', R: '255,48,40', G: '40,255,130', Y: '255,214,40', A: '255,190,110' };
/** Feu : halo diffus de nuit (plus large en brume), cœur blanchi par la saturation de l'œil. */
function glow(x: number, y: number, col: string, a: number, big: number): void {
  const night = S.env.night, fog = S.env.vis === 'poor', r = (look.binoc ? 2.8 : 1.7) * big * (0.8 + 0.4 * a);
  if (night || fog) {
    const R = r * (fog ? 9 : 5.5), g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `rgba(${col},${a * (fog ? 0.45 : 0.4)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  }
  ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (a > 0.4 && night) { ctx.fillStyle = `rgba(255,255,255,${(a - 0.4) * 0.9})`; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill(); }
}
/** Reflet d'un feu sur l'eau : traînée verticale brisée par les vagues, sous le point d'eau à la verticale du feu. */
function reflect(water: [number, number, number] | null, top: [number, number, number], col: string, a: number): void {
  if (!water || !S.env.night || S.env.vis === 'poor') return;
  const len = Math.min(60, Math.max(4, (top[1] - water[1]) * -1.1)), bf = beaufort(S.env.windKn);
  ctx.fillStyle = `rgba(${col},${a * 0.28})`;
  for (let k = 0; k < len; k += 2) {
    const w = 1 + (bf >= 3 ? Math.abs(Math.sin(k * 1.7 + S.t * 3)) * 2 : 0.6);
    if (Math.sin(k * 0.9 + S.t * 2.3) > -0.3) ctx.fillRect(water[0] - w / 2, water[1] + k, w, 1.4);
  }
}

/**
 * Visibilité d'un feu : la portée de R22 est une portée minimale par temps clair ; on l'affiche jusqu'à 1,5 fois
 * cette portée en s'atténuant. En brume, un feu perce un peu mieux qu'une silhouette (1,4 fois la visibilité).
 */
function lightAlpha(d: number, rangeNM: number, sk: Sky): number {
  const rng = Math.min(rangeNM * NM * 1.5, S.env.vis === 'poor' ? sk.vis * 1.4 : Infinity);
  if (d > rng) return 0;
  // de jour, un feu n'est guère perceptible qu'à courte distance
  // un feu de nuit reste un point net jusqu'à sa portée : intensité de 0,4 à 1 selon la distance
  return clamp(0.4 + 0.9 * (1 - d / rng), 0, 1) * (sk.night ? 1 : d < NM ? 0.3 : 0);
}

const HULL = ['#2c3137', '#5b2424', '#1f3a57', '#2b4630', '#43403c', '#6b3a1f'];

function drawTarget(t: Target, d: number, sk: Sky): void {
  if (d > 26 * NM) return;
  const ob = n360(brgOf(cam.ex / NM - t.x, cam.ey / NM - t.y) - t.hdg);
  const v = veil(d, sk.vis), dH = Math.sqrt(2 * EYE * RE);
  const L = t.L, B = Math.max(3, L / 7), fb = clamp(0.045 * L, 1.2, 12), hM = clamp(0.1 * L + 4, 6, 30);
  const shade = (c: RGB): string => mix(sk.night ? dark(c, d < 600 ? 0.18 : 0.06) : c, sk.hor, v);
  ctx.save();
  if (d > dH) { ctx.beginPath(); ctx.rect(0, 0, W, cam.yH); ctx.clip(); }
  if (v < 0.99) {
    const hullC = hex(HULL[t.id % HULL.length]), white = hex('#e6e4dc');
    if (t.type === 'sail') {
      solid(t, [[L / 2, 0, 1], [0, -B / 2, 1], [0, B / 2, 1], [-L / 2, -B / 2.4, 1], [-L / 2, B / 2.4, 1], [L / 2, 0, 0], [-L / 2, 0, 0]], shade(hex('#f2f2ee')));
      if (t.stw > 0.3) {
        solid(t, [[0.05 * L, 0, 1.5], [0.05 * L, 0, 1.3 * L], [-0.4 * L, 0, 1.5]], shade(hex('#f6f4ec')));
        solid(t, [[0.08 * L, 0, 1.5], [0.08 * L, 0, 1.2 * L], [0.48 * L, 0, 1.3]], shade(hex('#ecebe4')));
      }
    } else {
      solid(t, [[L / 2, 0, fb + 1], [0.32 * L, -B / 2, fb], [0.32 * L, B / 2, fb], [-L / 2, -B / 2.2, fb], [-L / 2, B / 2.2, fb],
        [0.46 * L, 0, 0], [0.3 * L, -B / 2, 0], [0.3 * L, B / 2, 0], [-0.48 * L, -B / 2.4, 0], [-0.48 * L, B / 2.4, 0]], shade(hullC));
      const fwd = t.type === 'fish' || (t.type === 'small' && t.id % 2 === 0);
      const [s0, s1] = fwd ? [0.12 * L, 0.3 * L] : [-0.44 * L, -0.3 * L], hs = clamp(0.09 * L, 4, 26);
      solid(t, box(s0, s1, (B / 2) * 0.85, fb, fb + hs), shade(white));
      if (t.type !== 'fish') solid(t, box(s0 - 0.04 * L, s0 + 0.02 * L, B / 7, fb + hs, fb + hs + 0.04 * L), shade(hex(t.id % 3 ? '#2a2a2a' : '#b23a2a')));
      if (t.type === 'fish') solid(t, box(-0.42 * L, -0.38 * L, B / 2, fb, fb + 0.25 * L), shade(hex('#3a3a3a'))); // portique arrière
      if (t.type === 'power' && t.id % 2) for (let k = 0; k < 4; k++) solid(t, box(-0.28 * L + k * 0.17 * L, -0.14 * L + k * 0.17 * L, B / 2.2, fb, fb + 0.035 * L + 2), shade(hex(['#9c3b2d', '#2d5f8a', '#7c7c74', '#3f6b3a'][(t.id + k) % 4]))); // conteneurs
      // mâts
      const mast = (a: number, top: number) => {
        const p0 = shipPt(t, a, 0, fb), p1 = shipPt(t, a, 0, top), q0 = proj(...p0), q1 = proj(...p1);
        if (!q0 || !q1) return;
        ctx.strokeStyle = shade(hex('#2a2a2a')); ctx.lineWidth = Math.max(0.6, (0.5 / q0[2]) * cam.F);
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      };
      mast(0.25 * L, hM); if (L >= 50 && t.type !== 'fish') mast(-0.3 * L, hM + Math.max(4.5, 0.04 * L));
    }
    // marques de jour
    if (!sk.night && d < 4 * NM) {
      ctx.fillStyle = mix([10, 10, 10], sk.hor, v);
      for (const s of dayShapes(t)) {
        const p = shipPt(t, s.a, 0, s.z), q = proj(...p);
        if (!q) continue;
        const r = Math.max(0.35, (0.3 / q[2]) * cam.F);
        ctx.beginPath();
        if (s.shape === 'ball') ctx.arc(q[0], q[1], r, 0, 7);
        else if (s.shape === 'diamond') { ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0] + r, q[1]); ctx.lineTo(q[0], q[1] + r); ctx.lineTo(q[0] - r, q[1]); }
        else if (s.shape === 'coneUp') { ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0] + r, q[1] + r); ctx.lineTo(q[0] - r, q[1] + r); }
        else { ctx.moveTo(q[0] - r, q[1] - r); ctx.lineTo(q[0] + r, q[1] - r); ctx.lineTo(q[0], q[1] + r); }
        ctx.fill();
      }
    }
  }
  ctx.restore();
  // éclairage de pont et des emménagements la nuit (aide à juger la distance, projecteurs des chalutiers en pêche)
  if (sk.night && t.type !== 'sail' && S.env.vis !== 'poor') {
    const L = t.L, B = Math.max(3, L / 7), fb = clamp(0.045 * L, 1.2, 12), hs = clamp(0.09 * L, 4, 26);
    const fwd = t.type === 'fish' || (t.type === 'small' && t.id % 2 === 0), s0 = fwd ? 0.12 * L : -0.44 * L, s1 = fwd ? 0.3 * L : -0.3 * L;
    const range = t.type === 'fish' ? 6 * NM : 3.5 * NM;
    if (d < range) {
      const k = clamp(1 - d / range, 0, 1);
      if (t.type === 'fish') for (const a of [-0.3 * L, 0, 0.2 * L]) { const q = proj(...shipPt(t, a, 0, fb + 3)); if (q) glow(q[0], q[1], LIGHT.W, 0.55 * k + 0.2, 1.1); }
      for (let w = 0; w < 6; w++) {
        const q = proj(...shipPt(t, w % 2 ? s1 : s0, ((w % 3) - 1) * B * 0.25, fb + hs * (0.35 + 0.18 * Math.floor(w / 2))));
        if (q && (t.id * 7 + w) % 3) { ctx.fillStyle = `rgba(${LIGHT.A},${0.5 * k})`; ctx.fillRect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6); }
      }
    }
  }
  // vague d'étrave et sillage
  if (t.stw > 3 && d < 4 * NM && v < 0.9 && !(sk.night && d > 0.5 * NM)) {
    const L = t.L, B = Math.max(3, L / 7), q = proj(...shipPt(t, L / 2, 0, 0.3));
    if (q) {
      const r = Math.max(0.6, ((B * 0.28 * Math.min(1, t.stw / 15)) / q[2]) * cam.F);
      ctx.fillStyle = mix([245, 248, 250], sk.hor, v); ctx.globalAlpha = sk.night ? 0.25 : 0.85;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 1.3, r * 0.3, 0, 0, 7); ctx.fill();
      const w0 = proj(...shipPt(t, -L / 2, 0, 0)), w1 = proj(...shipPt(t, -L / 2 - L * 0.8, 0, 0));
      if (w0 && w1) {
        ctx.strokeStyle = mix([235, 242, 245], sk.hor, v); ctx.globalAlpha = sk.night ? 0.15 : 0.5; ctx.lineWidth = Math.max(0.6, ((B * 0.5) / w0[2]) * cam.F);
        ctx.beginPath(); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w1[0], w1[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  // feux de navigation (non coupés par l'horizon tant que le feu est au-dessus), avec reflet sur l'eau
  for (const l of navLights3D(t, ob)) {
    const a = lightAlpha(d, l.range, sk);
    if (a <= 0) continue;
    const p = shipPt(t, l.a, l.b, l.z), q = proj(...p);
    if (!q || (d >= dH && q[1] >= cam.yH)) continue;
    if (d < dH) reflect(proj(p[0], p[1], 0), q, LIGHT[l.col], a);
    glow(q[0], q[1], LIGHT[l.col], a, l.col === 'W' ? 1.05 : 1);
  }
}

/** Rythmes simplifiés des feux des marques (caractères non vérifiés pour la plupart : illustration). */
function flashOn(kind: string, id: string): boolean {
  const ph = (S.t + id.charCodeAt(0) * 1.7) % 15;
  switch (kind) {
    case 'N': return (S.t * 1.0) % 1 < 0.3;
    case 'E': return ph < 3 && ph % 1 < 0.3;
    case 'S': return (ph < 6 && ph % 1 < 0.3) || (ph >= 6.5 && ph < 8.5);
    case 'W': return ph < 9 && ph % 1 < 0.3;
    case 'special': return ph < 4 && ph % 1 < 0.35; // Fl(4)Y 15s
    case 'lv': return ph % 5 < 0.6;
    default: return ph % 5 < 0.5;
  }
}

/** Bouées (corps, voyant, feu) et bateaux-feux ; les bouées dansent à la houle. */
function drawMarks(sk: Sky, bf: number): void {
  const hs = HS[bf];
  const cols: Record<string, string[]> = { N: ['#f4d000', '#111'], S: ['#111', '#f4d000'], E: ['#111', '#f4d000', '#111'], W: ['#f4d000', '#111', '#f4d000'], special: ['#f4d000'], safe: ['#c81e1e', '#f0f0f0'] };
  for (const m of CHART.marks) {
    const dx = m.x * NM - cam.ex, dy = m.y * NM - cam.ey, d = Math.hypot(dx, dy);
    if (m.kind === 'lh') { lighthouse(m, dx, dy, d, sk); continue; }
    if (d > 13 * NM) continue;
    const v = veil(d, sk.vis), ph = m.id.charCodeAt(0) * 0.37 + m.id.length;
    const bob = m.kind === 'lv' ? hs * 0.08 * Math.sin(S.t * 0.5 + ph) : hs * 0.18 * Math.sin(S.t * 1.25 + ph);
    const stub = { x: m.x, y: m.y, hdg: (S.env.windFrom + 15 * Math.sin(S.t * 0.2 + ph)) % 360 };
    const shade = (c: string) => mix(sk.night ? dark(hex(c), 0.05) : hex(c), sk.hor, v);
    let zl = 5.2 + bob;
    if (v < 0.98) {
      if (m.kind === 'lv') {
        solid(stub, [[-20, -4.5, bob], [22, 0, bob + 1], [-20, 4.5, bob], [-20, -4.5, bob + 4], [-20, 4.5, bob + 4], [20, 0, bob + 5], [18, -4, bob + 4], [18, 4, bob + 4]], shade('#c42020'));
        solid(stub, box(-3, 3, 2.5, bob + 4, bob + 7), shade('#d8d8d0'));
        solid(stub, box(-1, 1, 1, bob + 7, bob + 13), shade('#c42020'));
        zl = 13.5 + bob;
      } else {
        // flotteur, châssis (bandes de couleur), voyant
        const cs = cols[m.kind] ?? ['#c81e1e', '#f0f0f0'];
        solid(stub, box(-1.3, 1.3, 1.3, bob - 0.2, bob + 1.2), shade(cs[0]));
        cs.forEach((c, i) => solid(stub, box(-0.6, 0.6, 0.6, bob + 1.2 + (i * 3.2) / cs.length, bob + 1.2 + ((i + 1) * 3.2) / cs.length), shade(c)));
        const top = proj(...shipPt(stub, 0, 0, bob + 4.7)), r = top ? Math.max(0.5, (0.45 / top[2]) * cam.F) : 0;
        if (top && r > 0.6) {
          ctx.fillStyle = shade(m.kind === 'special' ? '#f4d000' : '#111'); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(0.6, r * 0.35);
          const cone = (y: number, up: boolean) => { ctx.beginPath(); ctx.moveTo(top[0] - r, y + (up ? r : 0)); ctx.lineTo(top[0] + r, y + (up ? r : 0)); ctx.lineTo(top[0], y + (up ? 0 : r)); ctx.closePath(); ctx.fill(); };
          if (m.kind === 'N') { cone(top[1] - 3 * r, true); cone(top[1] - 1.6 * r, true); }
          else if (m.kind === 'S') { cone(top[1] - 3 * r, false); cone(top[1] - 1.6 * r, false); }
          else if (m.kind === 'E') { cone(top[1] - 3.2 * r, true); cone(top[1] - 1.4 * r, false); }
          else if (m.kind === 'W') { cone(top[1] - 3.2 * r, false); cone(top[1] - 1.4 * r, true); }
          else if (m.kind === 'special') { ctx.beginPath(); ctx.moveTo(top[0] - r, top[1] - 3 * r); ctx.lineTo(top[0] + r, top[1] - r); ctx.moveTo(top[0] + r, top[1] - 3 * r); ctx.lineTo(top[0] - r, top[1] - r); ctx.stroke(); }
        }
      }
    }
    const lit = m.kind === 'special' ? 'Y' : 'W';
    const a = lightAlpha(d, m.kind === 'lv' ? 12 : 4, sk);
    if (a > 0 && (m.light ? charOn(m.light, S.t + m.id.length * 1.3) : flashOn(m.kind, m.id))) {
      const q = proj(dx, dy, zl);
      if (q) { reflect(proj(dx, dy, 0), q, LIGHT[lit], a); glow(q[0], q[1], LIGHT[lit], a, m.kind === 'lv' ? 1.5 : 1); }
    }
  }
}

/**
 * Phare à terre : tour blanche de jour (à moins de 8 NM), feu de grande portée la nuit. Le feu est caché par la terre
 * située devant lui (rayons de côte) et sous l'horizon au-delà de sa portée géographique (élévation du feu et de l'œil).
 */
function lighthouse(m: (typeof CHART.marks)[number], dx: number, dy: number, d: number, sk: Sky): void {
  const z = m.elev ?? 40, dNM = d / NM, b = brgOf(dx, dy), co = S.coast;
  if (co && co.r0[rayIndex(b)] < dNM - 0.6) return;
  if (dNM > 2.08 * (Math.sqrt(z) + Math.sqrt(EYE))) return;
  const v = veil(d, sk.vis), stub = { x: m.x, y: m.y, hdg: 0 };
  if (!sk.night && v < 0.95 && dNM < 8) solid(stub, box(-3, 3, 3, z - 18, z + 2), mix(hex('#eeeeea'), sk.hor, v));
  const a = lightAlpha(d, m.range ?? 15, sk);
  if (a > 0 && charOn(m.light ?? 'Fl 10s', S.t + m.id.length * 1.7)) {
    const q = proj(dx, dy, z);
    if (q) glow(q[0], q[1], LIGHT.W, a, 1.6);
  }
}

/** Pont du porteur vu de la passerelle (VLCC : pont long, mât avant, poteaux de manifold). */
function ownDeck(sk: Sky): void {
  const o = S.own, L = o.L, B = 58, eyeA = -L / 2 + 50, rel = look.rel * D2R, cr = Math.cos(rel), sr = Math.sin(rel);
  const P = (a: number, b: number, z: number): [number, number] | null => {
    const da = a - eyeA, f = da * cr + b * sr;
    if (f < 3) return null;
    const r = -da * sr + b * cr;
    return [W / 2 + (r / f) * cam.F, cam.cy0 - ((z - EYE) / f) * cam.F];
  };
  const poly = (pts: [number, number, number][], fill: string) => {
    // découpe au plan proche (f ≥ 3 m)
    const fz = (p: number[]) => (p[0] - eyeA) * cr + p[1] * sr - 3, out: [number, number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], Bp = pts[(i + 1) % pts.length], fa = fz(A), fb = fz(Bp);
      if (fa >= 0) out.push(A);
      if (fa >= 0 !== fb >= 0) { const k = fa / (fa - fb); out.push([A[0] + (Bp[0] - A[0]) * k, A[1] + (Bp[1] - A[1]) * k, A[2] + (Bp[2] - A[2]) * k]); }
    }
    const sp = out.map((p) => P(p[0], p[1], p[2] + 0)).filter((p): p is [number, number] => !!p);
    if (sp.length < 3) return;
    ctx.fillStyle = fill; ctx.beginPath(); sp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
  };
  const lightK = sk.night ? 0.07 : S.env.vis === 'poor' ? 0.8 : 1;
  const fogV = veil(150, sk.vis); // le pont s'estompe dans la brume
  const deck = mix(dark(hex('#6a3e30'), lightK), sk.hor, fogV), side = mix(dark(hex('#2a2d31'), lightK), sk.hor, fogV);
  const fb = 8, a0 = eyeA + 8;
  poly([[a0, -B / 2, 0], [L / 2 - 30, -B / 2, 0], [L / 2, 0, 0], [L / 2 - 30, B / 2, 0], [a0, B / 2, 0], [a0, B / 2, fb], [L / 2 - 30, B / 2, fb], [L / 2, 0, fb + 3], [L / 2 - 30, -B / 2, fb], [a0, -B / 2, fb]], side);
  poly([[a0, -B / 2, fb], [L / 2 - 30, -B / 2, fb], [L / 2, 0, fb + 3], [L / 2 - 30, B / 2, fb], [a0, B / 2, fb]], deck);
  ctx.strokeStyle = mix(dark(hex('#c9c3b5'), lightK), sk.hor, fogV); ctx.lineWidth = 1.5;
  const seg = (a: number, b: number, z: number, a2: number, b2: number, z2: number) => { const p = P(a, b, z), q = P(a2, b2, z2); if (p && q) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } };
  seg(a0, 0, fb + 2, L / 2 - 25, 0, fb + 2); // passerelle de pont (catwalk)
  seg(L / 2 - 15, 0, fb + 3, L / 2 - 15, 0, fb + 26); // mât avant
  for (const b of [-14, 14]) seg(-5, b, fb, -5, b, fb + 14); // poteaux de manifold
  ctx.lineWidth = 1;
}

function bridgeFrame(sk: Sky): void {
  const c = sk.night ? '#020203' : '#1b1f23';
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, W, Math.max(6, H * 0.035));
  if (!look.inst) ctx.fillRect(0, H - Math.max(10, H * 0.06), W, H);
  for (const m of [-84, -60, -36, -12, 12, 36, 60, 84]) {
    const rel = m - look.rel;
    if (Math.abs(rel) > fov() / 2 + 3) continue;
    const x = W / 2 + Math.tan(rel * D2R) * cam.F;
    ctx.fillRect(x - 2.5, 0, 5, H);
  }
}

function binocMask(): void {
  const R = Math.min(H * 0.47, W * 0.26), dx = R * 0.62;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath(); ctx.arc(W / 2 - dx, H / 2, R, 0, 7); ctx.arc(W / 2 + dx, H / 2, R, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

function hud(hf: number, bf: number): void {
  const o = S.own, fs = clamp(W / 90, 10, 13), top = look.binoc ? 6 : Math.max(6, H * 0.035) + 4;
  ctx.font = `600 ${fs}px ui-monospace,Menlo,monospace`; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  // bandeau de relèvements vrais
  ctx.strokeStyle = 'rgba(230,240,245,.75)'; ctx.fillStyle = 'rgba(230,240,245,.9)'; ctx.lineWidth = 1;
  const stepT = hf > 20 ? 5 : 1, lab = hf > 20 ? 10 : 2;
  for (let b = Math.floor((cam.yaw - hf / 2) / stepT) * stepT; b <= cam.yaw + hf / 2; b += stepT) {
    const rel = b - cam.yaw, x = W / 2 + Math.tan(rel * D2R) * cam.F, big = ((b % lab) + lab) % lab === 0;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + (big ? 9 : 5)); ctx.stroke();
    if (big) ctx.fillText(p3(n360(b)), x, top + 10);
  }
  ctx.fillStyle = '#ffcf33';
  ctx.beginPath(); ctx.moveTo(W / 2, top + 26); ctx.lineTo(W / 2 - 5, top + 33); ctx.lineTo(W / 2 + 5, top + 33); ctx.fill();
  const relB = n360(look.rel + (look.aft ? 180 : 0)), side = relB === 0 ? "dans l'axe" : relB === 180 ? 'sur l\'arrière' : `${relB < 180 ? Math.round(relB) + '° Td' : Math.round(360 - relB) + '° Bd'}`;
  ctx.textAlign = 'left';
  const info = [`REGARD ${p3(cam.yaw)}°T (${side})${look.binoc ? ' · JUMELLES 7×' : ''}`,
    `${S.env.night ? 'Nuit' : 'Jour'} · ${S.env.vis === 'poor' ? 'brume' : 'bonne visibilité'} · mer force ${bf} (≈ ${HS[bf].toString().replace('.', ',')} m) · œil à ${EYE} m`];
  if (hover !== null) {
    const rel = Math.atan((hover - W / 2) / cam.F) / D2R;
    info.push(`Relèvement curseur ${n360(cam.yaw + rel).toFixed(1)}°T`);
    ctx.strokeStyle = 'rgba(255,207,51,.6)'; ctx.beginPath(); ctx.moveTo(hover, top + 24); ctx.lineTo(hover, top + 40); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(8, top + 36, Math.max(...info.map((s) => ctx.measureText(s).width)) + 12, info.length * (fs + 4) + 6);
  ctx.fillStyle = 'rgba(230,240,245,.95)';
  info.forEach((s, i) => ctx.fillText(s, 14, top + 40 + i * (fs + 4)));
  void o;
}

// ---------------------------------------------------------------- console d'instruments

/** Console d'instruments de passerelle (présentation générique, sans charte de constructeur). */
function instruments(bf: number): void {
  const o = S.own, pal = S.radar.palette, night = pal === 'NIGHT';
  const hp = clamp(H * 0.2, 74, 140), y0 = H - hp, cy = y0 + hp * 0.52, r = hp * 0.38;
  const g = ctx.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, night ? '#070707' : '#262b30'); g.addColorStop(1, night ? '#000' : '#121518');
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, hp);
  ctx.fillStyle = night ? '#111' : '#3a4148'; ctx.fillRect(0, y0, W, 2);
  const C = { face: night ? '#030202' : '#0a0d10', ink: night ? '#b4361f' : '#eaf4f8', acc: night ? '#8a2a16' : '#ffb000', dim: night ? '#5a1c10' : '#6c8594', red: night ? '#8a1c10' : '#e5484d', grn: night ? '#3a5a20' : '#3fbf6f' };
  const n = 7, gap = Math.min(W / n, r * 2.7), x0 = W / 2 - (gap * (n - 1)) / 2;
  const fs = Math.max(8, r * 0.22);
  const dialFace = (x: number) => { ctx.fillStyle = C.face; ctx.beginPath(); ctx.arc(x, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5; ctx.stroke(); };
  const title = (x: number, t: string) => { ctx.fillStyle = C.dim; ctx.font = `600 ${fs * 0.8}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y0 + fs * 0.95); };
  const digit = (x: number, y: number, t: string, big = 1) => { ctx.fillStyle = C.ink; ctx.font = `600 ${fs * big}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); };
  const needle = (x: number, ang: number, len: number, col: string) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, cy + r * 0.25); ctx.lineTo(x + Math.sin(ang) * len, cy + r * 0.25 - Math.cos(ang) * len); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, cy + r * 0.25, 3, 0, 7); ctx.fill();
  };
  /** Cadran en arc de ± 75° pour une grandeur symétrique (barre, giration). */
  const arcDial = (x: number, v: number, max: number, step: number, label: string, unit: string) => {
    dialFace(x);
    const A = 75 * D2R, R0 = r * 0.82, cyy = cy + r * 0.25, map = (u: number) => (clamp(u, -max, max) / max) * A;
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(x, cyy, R0, -Math.PI / 2 - A, -Math.PI / 2); ctx.stroke();
    ctx.strokeStyle = C.grn; ctx.beginPath(); ctx.arc(x, cyy, R0, -Math.PI / 2, -Math.PI / 2 + A); ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.font = `${fs * 0.7}px ui-monospace,Menlo,monospace`; ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let u = -max; u <= max + 1e-6; u += step) {
      const a = map(u), s = Math.sin(a), c = Math.cos(a);
      ctx.beginPath(); ctx.moveTo(x + s * R0 * 0.88, cyy - c * R0 * 0.88); ctx.lineTo(x + s * R0, cyy - c * R0); ctx.stroke();
      if (Math.abs(u) % (step * 2) < 1e-6) ctx.fillText(String(Math.abs(Math.round(u))), x + s * R0 * 0.68, cyy - c * R0 * 0.68);
    }
    needle(x, map(v), R0 * 0.92, C.acc);
    digit(x, cy + r * 0.62, `${Math.abs(v).toFixed(0)}${unit} ${Math.abs(v) < 0.5 ? '' : v > 0 ? 'Td' : 'Bd'}`, 0.85);
    title(x, label);
  };
  const lcd = (x: number, lines: string[], label: string) => {
    const w = r * 2.1, h = r * 1.45;
    ctx.fillStyle = C.face; ctx.fillRect(x - w / 2, cy - h / 2, w, h); ctx.strokeStyle = C.dim; ctx.lineWidth = 1.2; ctx.strokeRect(x - w / 2, cy - h / 2, w, h);
    lines.forEach((l, i) => digit(x, cy - h / 2 + (h / (lines.length + 1)) * (i + 1), l, i === 0 ? 1.05 : 0.8));
    title(x, label);
  };
  // 1. répétiteur gyro : rose qui tourne, ligne de foi en haut
  let x = x0;
  dialFace(x);
  ctx.save(); ctx.beginPath(); ctx.arc(x, cy, r - 1, 0, 7); ctx.clip();
  ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.font = `600 ${fs * 0.72}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let dg = 0; dg < 360; dg += 5) {
    const a = (dg - o.hdg) * D2R, s = Math.sin(a), c = Math.cos(a), l = dg % 10 ? 0.08 : 0.15;
    ctx.lineWidth = dg % 30 ? 0.8 : 1.4;
    ctx.beginPath(); ctx.moveTo(x + s * r * (0.95 - l), cy - c * r * (0.95 - l)); ctx.lineTo(x + s * r * 0.95, cy - c * r * 0.95); ctx.stroke();
    if (dg % 30 === 0) ctx.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[dg] ?? String(dg / 10).padStart(2, '0'), x + s * r * 0.62, cy - c * r * 0.62);
  }
  ctx.restore();
  ctx.fillStyle = C.acc; ctx.beginPath(); ctx.moveTo(x, cy - r + 1); ctx.lineTo(x - 5, cy - r - 6); ctx.lineTo(x + 5, cy - r - 6); ctx.fill();
  ctx.fillStyle = C.face; ctx.fillRect(x - r * 0.5, cy - fs * 0.6, r, fs * 1.2);
  digit(x, cy, `${o.hdg.toFixed(1)}°`, 0.95);
  title(x, 'GYRO');
  // 2. axiomètre, 3. indicateur de giration
  arcDial((x += gap), o.rud, 35, 5, 'BARRE', '°');
  arcDial((x += gap), o.rot * 60, 30, 5, 'ROT', '°/mn');
  // 4. loch
  const sog = Math.hypot(o.vx, o.vy), cog = sog > 0.2 ? n360(brgOf(o.vx, o.vy)) : o.hdg;
  lcd((x += gap), [`VS ${o.stw.toFixed(1)} kn`, `VF ${sog.toFixed(1)} kn`, `RF ${cog.toFixed(0)}°`], 'LOCH / GNSS');
  // 5. machine
  lcd((x += gap), [`${Math.round(o.n * 60)} tr/mn`, TELE[o.tele].n], 'MACHINE');
  // 6. anémomètre (vent apparent)
  x += gap; dialFace(x);
  const wt = { x: Math.sin((S.env.windFrom + 180) * D2R) * S.env.windKn, y: Math.cos((S.env.windFrom + 180) * D2R) * S.env.windKn };
  const ax = wt.x - o.vx, ay = wt.y - o.vy, aspd = Math.hypot(ax, ay), afrom = n360(brgOf(-ax, -ay) - o.hdg);
  ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, cy - r * 0.35); ctx.lineTo(x + r * 0.12, cy - r * 0.1); ctx.lineTo(x + r * 0.12, cy + r * 0.35); ctx.lineTo(x - r * 0.12, cy + r * 0.35); ctx.lineTo(x - r * 0.12, cy - r * 0.1); ctx.closePath(); ctx.stroke();
  const wa = afrom * D2R, ex = x + Math.sin(wa) * r * 0.85, ey = cy - Math.cos(wa) * r * 0.85, ix = x + Math.sin(wa) * r * 0.45, iy = cy - Math.cos(wa) * r * 0.45;
  ctx.strokeStyle = C.acc; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ix, iy); ctx.stroke();
  ctx.fillStyle = C.acc; ctx.beginPath(); ctx.arc(ix, iy, 3, 0, 7); ctx.fill();
  digit(x, cy + r * 0.62, `${aspd.toFixed(0)} kn ${afrom <= 180 ? 'Td' : 'Bd'} ${Math.round(afrom <= 180 ? afrom : 360 - afrom)}°`, 0.72);
  title(x, `VENT APP. · F${bf}`);
  // 7. sondeur
  const dp = depthAt(o.x, o.y), ukc = dp - o.ship.mmg.d;
  lcd((x += gap), dp > 200 ? ['> 200 m', 'sous quille'] : [`${ukc.toFixed(1)} m`, `fonds ${dp.toFixed(0)} m`], 'SONDEUR');
  ctx.textBaseline = 'alphabetic';
}
