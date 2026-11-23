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
 * Niveau de détail volontairement limité pour rester fluide.
 */
import { S, type Target } from '../core/state';
import { D2R, adiff, brgOf, clamp, n360, p3 } from '../core/util';
import { toXY } from '../core/geo';
import { CHART, NRAYS } from '../sim/chart';
import { dayShapes, navLights3D } from '../sim/visual';

const NM = 1852, RE = (6371000 * 7) / 6, EYE = 32;
const FOV = 62, FOV_BINO = 7.5;

/** Regard : relèvement relatif (± 90°), vue arrière, jumelles. */
export const look = { rel: 0, aft: false, binoc: false };
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

// ---------------------------------------------------------------- caméra

interface Cam { ex: number; ey: number; yaw: number; F: number; cy: number; yH: number; sy: number; cyw: number }
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
  const yaw = n360(o.hdg + look.rel + (look.aft ? 180 : 0));
  const eyeA = -o.L / 2 + 50; // passerelle à l'arrière
  const F = W / 2 / Math.tan((hf / 2) * D2R);
  const cy = H * (look.binoc ? 0.5 : 0.42), yH = cy + Math.sqrt((2 * EYE) / RE) * F;
  cam = { ex: o.x * NM + eyeA * Math.sin(o.hdg * D2R), ey: o.y * NM + eyeA * Math.cos(o.hdg * D2R), yaw, F, cy, yH, sy: Math.sin(yaw * D2R), cyw: Math.cos(yaw * D2R) };
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

  // ciel et mer
  let g = ctx.createLinearGradient(0, 0, 0, yH);
  g.addColorStop(0, mix(sk.top, sk.top, 0)); g.addColorStop(1, mix(sk.hor, sk.hor, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, yH + 1);
  g = ctx.createLinearGradient(0, yH, 0, H);
  g.addColorStop(0, mix(sk.seaH, sk.seaH, 0)); g.addColorStop(1, mix(sk.seaN, sk.seaN, 0));
  ctx.fillStyle = g; ctx.fillRect(0, yH, W, H - yH);
  if (sk.night && S.env.vis !== 'poor') stars(yH);

  drawCoast(sk, hf);
  waves(sk);
  drawMarks(sk);
  // cibles, de la plus lointaine à la plus proche
  const ts = [...S.targets].map((t) => ({ t, d: Math.hypot(t.x * NM - cam.ex, t.y * NM - cam.ey) })).sort((u, v) => v.d - u.d);
  for (const { t, d } of ts) drawTarget(t, d, sk);
  if (!look.aft) ownDeck(sk);
  if (look.binoc) binocMask(); else bridgeFrame(sk);
  hud(hf);
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

/** Relief schématique : collines basses et falaises connues (Douvres, South Foreland, Blanc-Nez, Gris-Nez). */
const CLIFFS: [number, number, number][] = [[51.128, 1.335, 100], [51.142, 1.375, 90], [51.096, 1.235, 70], [50.925, 1.712, 130], [50.871, 1.585, 45]];
let cliffXY: { x: number; y: number; h: number }[] | null = null, cliffKey = '';
function landHeight(x: number, y: number): { h: number; cliff: number } {
  if (cliffKey !== CHART.key) { cliffKey = CHART.key; cliffXY = CHART.key === 'pdc' ? CLIFFS.map(([la, lo, h]) => ({ ...toXY(la, lo), h })) : []; }
  let h = 18 + 30 * (0.5 + 0.5 * Math.sin(1.7 * x + 0.3) * Math.cos(1.3 * y - 0.7)), cl = 0;
  for (const c of cliffXY!) { const k = Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / 2.2); h += c.h * k; cl = Math.max(cl, k); }
  return { h, cliff: cl };
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
    const d = r0 * NM, hx = co.ox + Math.sin(b * D2R) * r0, hy = co.oy + Math.cos(b * D2R) * r0, lh = landHeight(hx, hy);
    const f = d * Math.cos(rel * D2R);
    if (f < 50) continue;
    const top = lh.h - EYE - (d * d) / (2 * RE), base = -EYE - (d * d) / (2 * RE);
    const yT = cam.cy - (top / f) * cam.F, yB = d > dH ? cam.yH : cam.cy - (base / f) * cam.F;
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

/** Crêtes de vagues fixes dans le monde (repère du mouvement) et moutons par vent frais. */
function waves(sk: Sky): void {
  const cell = 70, R = 1100, wind = S.env.windKn, ci = Math.floor(cam.ex / cell), cj = Math.floor(cam.ey / cell), n = Math.ceil(R / cell);
  const lite = mix(sk.seaH, [255, 255, 255], sk.night ? 0.05 : 0.25), white = sk.night ? 'rgba(150,160,170,.35)' : 'rgba(255,255,255,.85)';
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const I = ci + i, J = cj + j, h1 = Math.abs(Math.sin(I * 127.1 + J * 311.7) * 43758.5453) % 1, h2 = Math.abs(Math.sin(I * 269.5 + J * 183.3) * 24634.6345) % 1;
    const wx = I * cell + h1 * cell - cam.ex, wy = J * cell + h2 * cell - cam.ey;
    const q = proj(wx, wy, 0);
    if (!q || q[2] > R || q[0] < 0 || q[0] > W) continue;
    const len = clamp((9 / q[2]) * cam.F, 1, 40), a = clamp(1 - q[2] / R, 0, 1);
    const cap = wind > 16 && h1 * h2 < (wind - 16) / 60 && Math.sin(S.t * 0.8 + h1 * 40) > 0.3;
    ctx.globalAlpha = a * (cap ? 1 : 0.5);
    ctx.fillStyle = cap ? white : lite;
    ctx.fillRect(q[0] - len / 2, q[1], len, Math.max(1, len * 0.08));
  }
  ctx.globalAlpha = 1;
}

const LIGHT: Record<string, string> = { W: '255,250,235', R: '255,60,50', G: '60,255,120', Y: '255,220,60' };
function glow(x: number, y: number, col: string, a: number, big: number): void {
  const r = (look.binoc ? 3 : 1.8) * big;
  ctx.fillStyle = `rgba(${col},${a * 0.25})`; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
/**
 * Visibilité d'un feu : la portée de R22 est une portée minimale par temps clair ; on l'affiche jusqu'à 1,5 fois
 * cette portée en s'atténuant. En brume, un feu perce un peu mieux qu'une silhouette (1,4 fois la visibilité).
 */
function lightAlpha(d: number, rangeNM: number, sk: Sky): number {
  const rng = Math.min(rangeNM * NM * 1.5, S.env.vis === 'poor' ? sk.vis * 1.4 : Infinity);
  if (d > rng) return 0;
  // de jour, un feu n'est guère perceptible qu'à courte distance
  return clamp(1.4 * (1 - d / rng), 0.15, 1) * (sk.night ? 1 : d < NM ? 0.3 : 0);
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
  // feux (non coupés par l'horizon tant que le feu est au-dessus)
  for (const l of navLights3D(t, ob)) {
    const a = lightAlpha(d, l.range, sk);
    if (a <= 0) continue;
    const p = shipPt(t, l.a, l.b, l.z), q = proj(...p);
    if (q && (d < dH || q[1] < cam.yH)) glow(q[0], q[1], LIGHT[l.col], a, 1);
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

function drawMarks(sk: Sky): void {
  for (const m of CHART.marks) {
    const dx = m.x * NM - cam.ex, dy = m.y * NM - cam.ey, d = Math.hypot(dx, dy);
    if (d > 12 * NM) continue;
    const v = veil(d, sk.vis);
    const stub = { x: m.x, y: m.y, hdg: 0 };
    if (v < 0.98) {
      if (m.kind === 'lv') {
        solid(stub, [[-20, -4, 0], [20, -4, 0], [-20, 4, 0], [20, 4, 0], [-20, -4, 4], [20, -4, 4], [-20, 4, 4], [20, 4, 4]], mix(sk.night ? [12, 3, 3] : [190, 30, 30], sk.hor, v));
        solid(stub, box(-2, 2, 1.2, 4, 14), mix(sk.night ? [12, 3, 3] : [200, 40, 40], sk.hor, v));
      } else {
        const cols: Record<string, string[]> = { N: ['#f4d000', '#111'], S: ['#111', '#f4d000'], E: ['#111', '#f4d000', '#111'], W: ['#f4d000', '#111', '#f4d000'], special: ['#f4d000'] };
        const cs = cols[m.kind] ?? ['#c81e1e', '#f0f0f0'];
        cs.forEach((c, i) => {
          const z0 = (i * 4.5) / cs.length, z1 = ((i + 1) * 4.5) / cs.length;
          solid(stub, box(-0.9, 0.9, 0.9, z0, z1), mix(sk.night ? dark(hex(c), 0.05) : hex(c), sk.hor, v));
        });
      }
    }
    const lit = m.kind === 'lv' ? 'W' : m.kind === 'special' ? 'Y' : 'W', z = m.kind === 'lv' ? 13 : 5;
    const a = lightAlpha(d, m.kind === 'lv' ? 15 : 5, sk);
    if (a > 0 && flashOn(m.kind, m.id)) { const q = proj(dx, dy, z); if (q) glow(q[0], q[1], LIGHT[lit], a, m.kind === 'lv' ? 1.4 : 0.9); }
  }
}

/** Pont du porteur vu de la passerelle (VLCC : pont long, mât avant, poteaux de manifold). */
function ownDeck(sk: Sky): void {
  const o = S.own, L = o.L, B = 58, eyeA = -L / 2 + 50, rel = look.rel * D2R, cr = Math.cos(rel), sr = Math.sin(rel);
  const P = (a: number, b: number, z: number): [number, number] | null => {
    const da = a - eyeA, f = da * cr + b * sr;
    if (f < 3) return null;
    const r = -da * sr + b * cr;
    return [W / 2 + (r / f) * cam.F, cam.cy - ((z - EYE) / f) * cam.F];
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
  ctx.fillRect(0, H - Math.max(10, H * 0.06), W, H);
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

function hud(hf: number): void {
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
    `${S.env.night ? 'Nuit' : 'Jour'} · ${S.env.vis === 'poor' ? 'brume' : 'bonne visibilité'} · œil à ${EYE} m`];
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
