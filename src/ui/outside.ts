/**
 * Vue extérieure depuis la passerelle (canvas 2D, perspective simple, sans bibliothèque 3D).
 * Style volontairement « en blocs » (arcade) : la fluidité prime sur le photoréalisme.
 *
 * - Œil à 32 m au-dessus de l'eau, à l'arrière (passerelle du VLCC), regard orientable sur 180° (± 90° autour de
 *   l'avant, ou autour de l'arrière en vue « aileron »), jumelles 7× (champ ≈ 7,5°).
 * - Rotondité de la Terre avec réfraction standard (rayon effectif 7/6 R) : horizon à ≈ 11,8 NM, les coques
 *   au-delà sont coupées par l'horizon, les superstructures et les feux restent visibles.
 * - Atmosphère : contraste atténué selon la loi de Koschmieder (visibilité météorologique), brume, nuit.
 * - Cibles : silhouettes en blocs par famille (shipKind) avec faces ombrées et fenêtres, silhouette simple au loin ;
 *   feux selon les secteurs de l'annexe I,
 *   marques de jour ; bouées et bateaux-feux de la carte ; côte à partir des rayons radar (relief schématique,
 *   falaises de Douvres et des caps Blanc-Nez / Gris-Nez), lumières à terre de nuit.
 * - État de la mer selon le vent (échelle de Beaufort) : crêtes qui avancent dans le lit du vent, moutons, embruns,
 *   mouvements de plate-forme (roulis, tangage) d'amplitude modeste pour un VLCC.
 * - Feux de nuit avec halo et reflet sur l'eau, éclairage des emménagements et projecteurs de pont des chalutiers,
 *   vague d'étrave et sillage ; bouées avec voyants et rythmes IALA simplifiés, qui dansent à la houle.
 * - Console d'instruments (répétiteur gyro, axiomètre, indicateur de taux de giration ROT, loch, machine, anémomètre, sondeur).
 * Niveau de détail volontairement limité pour rester fluide.
 */
import { S, ownDraft, type Target } from '../core/state';
import { TELE } from '../core/data';
import { D2R, K2N, adiff, brgOf, clamp, n360, p3 } from '../core/util';
import { CHART, NRAYS, depthAt, rayIndex, type BlockG } from '../sim/chart';
import { simFrac } from './render';
import { dayShapes, lightColour, lightOn, mastH, navLights3D, shipKind } from '../sim/visual';
import { OWN, audibleRange, patText, sideOf } from '../sim/sound';

export const NM = 1852, RE = (6371000 * 7) / 6, EYE = 32;
export const FOV = 62, FOV_BINO = 7.5;

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
  // résolution plafonnée à 1 pixel par point CSS : rendu « arcade » et fluidité avant la finesse
  DPR = Math.min(1, window.devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
}

export const fov = (): number => (look.binoc ? FOV_BINO : FOV);

// ---------------------------------------------------------------- couleurs

type RGB = [number, number, number];
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): string => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const dark = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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
export const HS = [0, 0.1, 0.2, 0.6, 1, 2, 3, 4, 5.5, 7, 9, 11.5, 14];
export function beaufort(kn: number): number { let b = 0; while (b < 12 && kn > BF[b]) b++; return b; }
const CAPS = [0, 0, 0, 0.01, 0.04, 0.1, 0.18, 0.28, 0.38, 0.48, 0.55, 0.6, 0.65];

/** Roulis et tangage du porteur (degrés) : amplitude modeste pour un VLCC chargé, périodes 14 s et 9 s. */
export function motion(): { roll: number; pitch: number } {
  const hs = HS[beaufort(S.env.windKn)], t = TV;
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

/** Dernier rendu et durée moyenne d'un rendu (ms) : la cadence baisse à 30 i/s si l'ordinateur peine. */
let lastDraw = 0, drawMs = 0;
/** Instant affiché : simulation extrapolée de la fraction de pas écoulée (mouvement fluide entre deux pas de 0,25 s). */
let TV = 0;
const vecM = (b: number, v: number) => ({ x: v * Math.sin(b * D2R), y: v * Math.cos(b * D2R) });

let instH = -1;
export function drawOutside(): void {
  if (!W || !H) return;
  const now = performance.now();
  // pleine cadence tant que le rendu est léger ; 30 i/s seulement si l'ordinateur peine (rendu > 12 ms)
  if (drawMs > 12 && now - lastDraw < 31) return;
  lastDraw = now;
  // hauteur de la console d'instruments, pour placer les commandes de manœuvre juste au-dessus
  const ih = look.inst && !look.binoc ? Math.round(clamp(H * 0.2, 74, 140)) : 0;
  if (ih !== instH) { instH = ih; cv.parentElement?.style.setProperty('--insth', ih + 'px'); }
  const fr = S.paused || S.over ? 0 : simFrac();
  TV = S.t + fr;
  const O = S.own, o = { ...O, x: O.x + O.vx * K2N * fr, y: O.y + O.vy * K2N * fr, hdg: n360(O.hdg + O.rot * fr) }, sk = sky(), hf = fov();
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
  const sH = mixC(sk.seaH, [150, 160, 160], sk.night ? 0 : rough * 0.25), sN = mixC(sk.seaN, [40, 60, 64], sk.night ? 0 : rough * 0.35);
  // ciel et mer en aplats dégradés par paliers (style arcade, sans dégradé continu)
  const NB = 7;
  ctx.fillStyle = mix(sk.top, sk.top, 0); ctx.fillRect(-W, yH - 3 * H, 3 * W, 2 * H);
  for (let k = 0; k < NB; k++) {
    const y0 = yH - H * (1 - k / NB) ** 1.4, y1 = yH - H * (1 - (k + 1) / NB) ** 1.4;
    ctx.fillStyle = mix(sk.top, sk.hor, (k + 0.5) / NB); ctx.fillRect(-W, y0, 3 * W, y1 - y0 + 1);
  }
  for (let k = 0; k < NB; k++) {
    const y0 = yH + 1.3 * H * (k / NB) ** 1.8, y1 = yH + 1.3 * H * ((k + 1) / NB) ** 1.8;
    ctx.fillStyle = mix(sH, sN, k / (NB - 1)); ctx.fillRect(-W, y0, 3 * W, y1 - y0 + 1);
  }
  ctx.fillRect(-W, yH + 1.3 * H, 3 * W, 2 * H);
  if (sk.night && S.env.vis !== 'poor') stars(yH);
  else if (S.env.vis !== 'poor') clouds(sk, yH);
  drawCoast(sk, hf);
  drawBlocks(sk);
  waves(sk, bf);
  drawMarks(sk, bf);
  // cibles, de la plus lointaine à la plus proche
  const ts = S.targets.map((t0) => { const t = { ...t0, x: t0.x + t0.vx * K2N * fr, y: t0.y + t0.vy * K2N * fr, hdg: n360(t0.hdg + t0.rot * fr) }; return { t, d: Math.hypot(t.x * NM - cam.ex, t.y * NM - cam.ey) }; }).sort((u, v) => v.d - u.d);
  for (const { t, d } of ts) drawTarget(t, d, sk);
  ctx.restore();
  if (!look.aft) ownDeck(sk);
  if (look.binoc) binocMask(); else { bridgeFrame(sk); if (look.inst) instruments(bf); }
  hud(hf, bf);
  drawMs = drawMs * 0.9 + (performance.now() - now) * 0.1;
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

/** Cumulus de beau temps : quelques bulles arrondies sur une base plate, ombre sous la base ; dérive lente avec le vent. */
function clouds(sk: Sky, yH: number): void {
  const hf = fov(), body = new Path2D(), shade = new Path2D(), drift = TV * 0.0004 * S.env.windKn;
  const blob = (p: Path2D, x: number, y: number, rx: number, ry: number) => { p.moveTo(x + rx, y); p.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI); };
  for (let i = 0; i < 24; i++) {
    const az = n360(i * 163.7 + drift * (1 + (i % 3) * 0.3)), el = 2.5 + ((i * 7.7) % 13), w = 3 + ((i * 5.3) % 8), rel = adiff(az, cam.yaw);
    if (Math.abs(rel) > hf / 2 + w) continue;
    const x = W / 2 + Math.tan(rel * D2R) * cam.F, y = cam.cy - Math.tan(el * D2R) * cam.F, pw = w * D2R * cam.F, u = Math.max(2, pw * 0.16);
    if (y > yH - 4) continue;
    const h1 = (i * 0.618) % 1, h2 = (i * 0.414) % 1;
    const puffs: [number, number, number][] = [
      [-0.3, 0.75, 0.85 + 0.3 * h1], [-0.08, 1.15, 1.2 + 0.4 * h2], [0.16, 1.0, 1.0 + 0.3 * h1], [0.34, 0.7, 0.7 + 0.2 * h2],
    ];
    for (const [k, yy, r] of puffs) { blob(shade, x + k * pw, y - yy * u + u * 0.35, r * u, r * u * 0.9); blob(body, x + k * pw, y - yy * u, r * u, r * u * 0.9); }
    blob(shade, x, y - u * 0.05, pw * 0.48, u * 0.55); blob(body, x, y - u * 0.4, pw * 0.48, u * 0.55);
  }
  ctx.fillStyle = mix([188, 199, 211], sk.hor, 0.25); ctx.fill(shade);
  ctx.fillStyle = mix([250, 251, 252], sk.hor, 0.15); ctx.fill(body);
}

/**
 * Relief schématique de la carte : ondulation de base et sommets notables (falaises de Douvres et caps au
 * Pas-de-Calais ; Rocher de Gibraltar et Djebel Moussa au détroit de Gibraltar). Illustration, pas un MNT.
 */
export function landHeight(x: number, y: number): { h: number; cliff: number } {
  let h = CHART.landBase * (1 + 1.67 * (0.5 + 0.5 * Math.sin(1.7 * x + 0.3) * Math.cos(1.3 * y - 0.7))), cl = 0;
  for (const c of CHART.relief) {
    const k = Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * c.r * c.r));
    h += c.h * k;
    if (c.cliff) cl = Math.max(cl, k);
  }
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
    const d = r0 * NM, sb = Math.sin(b * D2R), cb = Math.cos(b * D2R), hx = co.ox + sb * r0, hy = co.oy + cb * r0, cr = Math.cos(rel * D2R);
    const f = d * cr;
    if (f < 50) continue;
    // ligne de crête : élévation angulaire maximale le long du rayon, sur la terre traversée (relief en retrait de la côte)
    const lh0 = landHeight(hx, hy), el0 = (lh0.h - EYE - (d * d) / (2 * RE)) / d;
    let lh = lh0, el = el0, dR = d;
    const rEnd = Math.min(co.r1[i], r0 + 4);
    for (let r = r0 + 0.25; r < rEnd; r += 0.25) {
      const q = landHeight(co.ox + sb * r, co.oy + cb * r), dd = r * NM, e = (q.h - EYE - (dd * dd) / (2 * RE)) / dd;
      if (e > el) { el = e; lh = q; dR = dd; }
    }
    const base = -EYE - (d * d) / (2 * RE);
    // relief en gradins de 15 m au-dessus de 25 m (style en blocs), côtes basses à leur hauteur ; légère variation de teinte d'une colonne à l'autre
    const q15 = (h: number) => (h < 25 ? Math.max(4, Math.round(h)) : Math.ceil(h / 15) * 15);
    const hq = q15(el * d - base), yT = cam.cy - ((hq + base) / d / cr) * cam.F, yB = d > dH ? cam.yH : cam.cy - (base / f) * cam.F;
    if (yT >= yB) continue;
    const px1 = (yB - yT) / hq, jit = 0.92 + 0.12 * (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1);
    const x0 = W / 2 + Math.tan((rel - step / 2) * D2R) * cam.F, x1 = W / 2 + Math.tan((rel + step / 2) * D2R) * cam.F;
    const v = veil(d, sk.vis);
    if (v > 0.985) continue;
    const cliff = lh.cliff > 0.35, base3 = cliff && !sk.night ? sk.cliff : sk.land, wx = x1 - x0 + 0.6;
    // relief en retrait (plus de 0,6 NM derrière la côte) : teinte voilée selon sa propre distance, la côte au premier plan
    const far = dR - d > 0.6 * NM, vR = far ? veil(dR, sk.vis) : v;
    const yT0 = far ? Math.max(yT, cam.cy - ((q15(el0 * d - base) + base) / d / cr) * cam.F) : yT;
    ctx.fillStyle = mix(dark(base3, jit), sk.hor, vR);
    ctx.fillRect(x0, yT, wx, yB - yT);
    if (far && yT0 > yT) { const c0 = lh0.cliff > 0.35 && !sk.night ? sk.cliff : sk.land; ctx.fillStyle = mix(dark(c0, jit * 0.95), sk.hor, v); ctx.fillRect(x0, yT0, wx, yB - yT0); }
    if (!sk.night) {
      // couche d'herbe au sommet, grève ou pied de falaise au bas
      ctx.fillStyle = mix(dark(GRASS, jit), sk.hor, vR); ctx.fillRect(x0, yT, wx, Math.max(1, (cliff ? 3 : 6) * px1));
      if (far && yT0 > yT) { ctx.fillStyle = mix(dark(GRASS, jit * 0.9), sk.hor, v); ctx.fillRect(x0, yT0, wx, Math.max(1, 2 * px1)); }
      ctx.fillStyle = mix(lh0.cliff > 0.35 ? dark(sk.cliff, 0.8) : SAND, sk.hor, v); ctx.fillRect(x0, yB - Math.max(1, 3 * px1), wx, Math.max(1, 3 * px1));
    }
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
  const cell = 30 + 6 * bf, R = 1500, to = (S.env.windFrom + 180) * D2R, ux = Math.sin(to), uy = Math.cos(to);
  // dérive lente de la texture de surface (courant + dérive due au vent) : l'œil la lit comme liée à l'eau ;
  // une vitesse de phase réelle (≈ 10 m/s) donnait l'impression que le navire avançait en crabe
  const cv = vecM(S.env.curSet, S.env.curKn * 0.514), dw = 0.12 + 0.05 * bf;
  const ox = (cv.x + ux * dw) * TV, oy = (cv.y + uy * dw) * TV;
  const px = cam.ex - ox, py = cam.ey - oy, ci = Math.floor(px / cell), cj = Math.floor(py / cell), n = Math.ceil(R / cell);
  const crest = 4 + 2.2 * bf, kx = Math.cos(to), ky = -Math.sin(to); // direction des crêtes (perpendiculaire au vent)
  const hi = mix(sk.seaH, [255, 255, 255], sk.night ? 0.04 : 0.22), lo = mix(sk.seaN, [0, 0, 0], sk.night ? 0 : 0.25);
  const capP = CAPS[bf], night = sk.night, hf = fov() / 2 + 4;
  // tracés groupés par classe de distance (trois remplissages par couleur au lieu d'un trait par vague)
  const HI = [new Path2D(), new Path2D(), new Path2D()], LO = [new Path2D(), new Path2D(), new Path2D()], FO = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const I = ci + i, J = cj + j, h1 = Math.abs(Math.sin(I * 127.1 + J * 311.7) * 43758.5453) % 1, h2 = Math.abs(Math.sin(I * 269.5 + J * 183.3) * 24634.6345) % 1;
    const wx = I * cell + h1 * cell + ox - cam.ex, wy = J * cell + h2 * cell + oy - cam.ey;
    const f = wx * cam.sy + wy * cam.cyw;
    if (f < 90 || f > R || Math.abs(Math.atan2(wx * cam.cyw - wy * cam.sy, f)) > hf * D2R) continue;
    const q = proj(wx, wy, 0);
    if (!q) continue;
    const L2 = crest * (0.6 + h1) / 2, p1 = proj(wx - kx * L2, wy - ky * L2, 0), p2 = proj(wx + kx * L2, wy + ky * L2, 0);
    if (!p1 || !p2) continue;
    const cls = q[2] < 240 || q[2] > 950 ? 2 : q[2] < 520 ? 0 : 1;
    const th = clamp(((0.18 + 0.07 * bf) / q[2]) * cam.F, 0.8, 3), x0 = Math.min(p1[0], p2[0]), w = Math.max(1, Math.abs(p2[0] - p1[0])), y = (p1[1] + p2[1]) / 2;
    HI[cls].rect(x0, y - th * 0.4, w, th * 0.8);
    if (bf >= 3) LO[cls].rect(x0, y + th * 0.5, w, th);
    // moutons : écume en pavés qui naît et se résorbe
    if (h1 * h2 < capP) {
      const life = Math.sin(TV * 0.55 + h1 * 60);
      if (life > 0.2) {
        const r = clamp((((0.8 + 0.35 * bf) * (life - 0.2)) / q[2]) * cam.F, 0.8, 9);
        FO[cls].rect(q[0] - r * 1.6, q[1] - r * 0.4, r * 3.2, Math.max(1, r * 0.7));
        if (bf >= 7) FO[cls].rect(q[0] - r * 4, q[1] + r * 0.3, r * 8, Math.max(0.8, r * 0.15)); // traînées d'écume
      }
    }
  }
  const A = [0.8, 0.5, 0.25];
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = A[k] * 0.5; ctx.fillStyle = lo; ctx.fill(LO[k]);
    ctx.globalAlpha = A[k] * 0.65; ctx.fillStyle = hi; ctx.fill(HI[k]);
    ctx.globalAlpha = A[k] * (night ? 0.25 : 0.95); ctx.fillStyle = night ? '#8c969c' : '#f4f7f8'; ctx.fill(FO[k]);
  }
  // ondulations lointaines vers l'horizon
  const far = new Path2D();
  for (let k = 0; k < 70; k++) {
    const h = Math.abs(Math.sin(k * 91.7 + Math.floor(TV / 3) * 0.37) * 9137.1) % 1, dist = 1500 + h * 9000;
    const y = cam.cy - ((-EYE - (dist * dist) / (2 * RE)) / dist) * cam.F, x = ((k * 0.618 + h * 0.2) % 1) * W, len = 4 + 30 * (1500 / dist);
    far.rect(x - len, y, 2 * len, 1);
  }
  ctx.globalAlpha = night ? 0.06 : 0.12 + 0.02 * bf; ctx.fillStyle = hi; ctx.fill(far);
  ctx.globalAlpha = 1;
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
    const w = 1 + (bf >= 3 ? Math.abs(Math.sin(k * 1.7 + TV * 3)) * 2 : 0.6);
    if (Math.sin(k * 0.9 + TV * 2.3) > -0.3) ctx.fillRect(water[0] - w / 2, water[1] + k, w, 1.4);
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

const GRASS = hex('#5c8a3a'), SAND = hex('#cdbb8a');
const HULL = ['#2c3137', '#5b2424', '#1f3a57', '#2b4630', '#43403c', '#6b3a1f'];

// ---------------------------------------------------------------- silhouettes en blocs (style « arcade »)

/** Empreinte d'un bloc dans le repère du navire : a vers l'avant, b vers tribord (m), polygone convexe. */
type Foot = [number, number][];
/** Bloc prismatique ; hull = coque (dessinée en premier), nt = dessus masqué par le bloc posé dessus. */
interface Part { f: Foot; z0: number; z1: number; c: RGB; hull?: boolean; nt?: boolean; ca: number; cb: number }
/** Bandeau de fenêtres : face verticale unique de (a0, b0) à (a1, b1), normale sortante (na, nb). */
interface Dec { a0: number; b0: number; a1: number; b1: number; z0: number; z1: number; na: number; nb: number }
interface Model { parts: Part[]; decs: Dec[]; mastBase: number; key: string }

const BOXC = ['#b03a2e', '#2e5e8c', '#3f7a3a', '#c9772b', '#8a8a82', '#e0ded6', '#6a3d7a', '#1f4f5c', '#b8a23a'].map(hex);
const HULLC = HULL.map(hex);
const FUNC = ['#c23b2a', '#1f3a57', '#e2b22c', '#2a2a2a', '#3f7a3a'].map(hex);
const C_WHITE = hex('#e8e6de'), C_RED = hex('#8e2b22'), C_GREY = hex('#8d9088'), C_DARK = hex('#262626'), C_BLUE = hex('#1f3a57');
const C_GLASS = hex('#22303a'), C_LIT = hex('#ffcf8a');
/** Direction horizontale du soleil (vers le sud-ouest, figée) pour l'ombrage des faces. */
const SUN_X = -0.6, SUN_Y = -0.8;
const hh = (i: number): number => Math.abs(Math.sin(i * 12.9898 + 4.1414) * 43758.5453) % 1;

const models = new Map<number, Model>();
function modelOf(t: Target): Model {
  const key = `${t.L}|${t.name}|${t.type}`, m0 = models.get(t.id);
  if (m0 && m0.key === key) return m0;
  const m = buildModel(t, key);
  models.set(t.id, m);
  return m;
}

/** Construit la silhouette en blocs d'une cible selon sa famille (porte-conteneurs, pétrolier, transbordeur…). */
function buildModel(t: Target, key: string): Model {
  const k = shipKind(t), L = t.L, id = t.id;
  const B = k === 'fish' ? L / 3.6 : k === 'ferry' || k === 'roro' ? L / 6.5 : L / 7;
  const fb = clamp(0.045 * L, 1.2, 12);
  const parts: Part[] = [], decs: Dec[] = [];
  let mastBase = fb;
  const add = (f: Foot, z0: number, z1: number, c: RGB, o: { hull?: boolean; nt?: boolean } = {}) => {
    const ca = f.reduce((s, p) => s + p[0], 0) / f.length, cb = f.reduce((s, p) => s + p[1], 0) / f.length;
    parts.push({ f, z0, z1, c, ca, cb, ...o });
  };
  const rect = (a0: number, a1: number, b0: number, b1: number): Foot => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
  const box = (a0: number, a1: number, hb: number, z0: number, z1: number, c: RGB, nt = false, bc = 0) => add(rect(a0, a1, bc - hb, bc + hb), z0, z1, c, { nt });
  /** Fenêtres : sur l'avant (f), l'arrière (r) et les deux bords (s) d'un bloc. */
  const win = (a0: number, a1: number, hb: number, z0: number, z1: number, sides: string) => {
    if (sides.includes('f')) decs.push({ a0: a1, b0: -hb, a1: a1, b1: hb, z0, z1, na: 1, nb: 0 });
    if (sides.includes('r')) decs.push({ a0: a0, b0: -hb, a1: a0, b1: hb, z0, z1, na: -1, nb: 0 });
    if (sides.includes('s')) decs.push({ a0, b0: hb, a1, b1: hb, z0, z1, na: 0, nb: 1 }, { a0, b0: -hb, a1, b1: -hb, z0, z1, na: 0, nb: -1 });
  };
  /** Château : emménagements, passerelle avec ailerons et fenêtres, cheminée. */
  const house = (a0: number, a1: number, hb: number, zTop: number) => {
    const da = a1 - a0;
    box(a0, a1, hb, fb, zTop - 2.6, C_WHITE);
    box(a0 + 0.15 * da, a1, hb, zTop - 2.6, zTop, C_WHITE);
    box(a1 - Math.min(2.5, 0.2 * da), a1, B / 2, zTop - 2.4, zTop - 1.4, C_WHITE); // ailerons
    win(a0 + 0.15 * da, a1, hb, zTop - 2.1, zTop - 0.9, 'fs');
    for (let z = fb + 1.2; z < zTop - 3.6; z += 2.8) win(a0 + 0.12 * da, a1 - 0.1 * da, hb, z, z + 1, 's');
    for (let z = fb + 1.2; z < zTop - 3.6; z += 2.8) win(a0, a1, hb * 0.6, z, z + 1, 'f');
    const fh = 0.035 * L + 3, fa0 = a0 + 0.02 * da, fa1 = a0 + 0.02 * da + Math.max(1.5, 0.3 * da), fc = FUNC[id % FUNC.length];
    box(fa0, fa1, Math.max(0.8, B / 8), zTop - 1, zTop + fh * 0.82, fc, true);
    box(fa0, fa1, Math.max(0.8, B / 8), zTop + fh * 0.82, zTop + fh, C_DARK);
  };

  if (k === 'sail') {
    add([[L / 2, 0], [0.1 * L, B / 2], [-L / 2, B / 2.4], [-L / 2, -B / 2.4], [0.1 * L, -B / 2]], 0, 1, C_WHITE, { hull: true });
    return { parts, decs, mastBase: 1, key };
  }
  // coque : œuvres vives (bande de flottaison) puis œuvres mortes, gaillard d'avant
  const hc = k === 'ferry' ? C_WHITE : k === 'roro' ? (id % 2 ? C_WHITE : HULLC[id % HULLC.length]) : k === 'tank' ? [C_RED, HULLC[0], HULLC[2]][id % 3]
    : k === 'fish' ? [C_BLUE, hex('#7a2a24'), hex('#2b4630'), hex('#b8a23a')][id % 4] : HULLC[id % HULLC.length];
  const hullF: Foot = [[L / 2, 0], [0.34 * L, B / 2], [-0.42 * L, B / 2], [-L / 2, 0.38 * B], [-L / 2, -0.38 * B], [-0.42 * L, -B / 2], [0.34 * L, -B / 2]];
  add(hullF, 0, 0.25 * fb, k === 'ferry' ? C_BLUE : C_RED, { hull: true, nt: true });
  add(hullF, 0.25 * fb, fb, hc, { hull: true });
  if (k !== 'fish') add([[L / 2, 0], [0.34 * L, B / 2], [0.3 * L, B / 2], [0.3 * L, -B / 2], [0.34 * L, -B / 2]], fb, fb + Math.max(1.2, 0.012 * L), hc);
  const hs = clamp(0.09 * L, 4, 28);

  switch (k) {
    case 'pc': {
      house(-0.4 * L, -0.29 * L, 0.42 * B, fb + Math.max(hs, 0.1 * L));
      const nb = L < 160 ? 6 : 9, a0 = -0.27 * L, len = (0.7 * L) / nb;
      for (let i = 0; i < nb; i++) for (let r = 0; r < 2; r++) {
        const s0 = a0 + i * len, s1 = s0 + len * 0.9, bc = (r ? 1 : -1) * 0.235 * B, j = id * 31 + i * 7 + r * 3;
        const h1 = 2.6 * (1 + Math.floor(hh(j) * 2)), h2 = 2.6 * (i === nb - 1 ? Math.floor(hh(j + 1) * 2) : 1 + Math.floor(hh(j + 1) * 3));
        box(s0, s1, 0.225 * B, fb, fb + h1, BOXC[Math.floor(hh(j + 2) * BOXC.length)], h2 > 0, bc);
        if (h2 > 0) box(s0, s1, 0.225 * B, fb + h1, fb + h1 + h2, BOXC[Math.floor(hh(j + 3) * BOXC.length)], false, bc);
      }
      break;
    }
    case 'tank':
      house(-0.4 * L, -0.29 * L, 0.42 * B, fb + hs);
      box(-0.27 * L, 0.42 * L, Math.max(0.5, 0.04 * B), fb, fb + 1.4, C_GREY); // tuyautage de pont
      box(-0.03 * L, 0.03 * L, 0.38 * B, fb, fb + 2.2, C_GREY); // manifold
      break;
    case 'lng':
      house(-0.4 * L, -0.29 * L, 0.42 * B, fb + hs);
      for (let i = 0; i < 4; i++) { // sphères Moss en gradins
        const c = -0.2 * L + i * 0.18 * L;
        box(c - 0.08 * L, c + 0.08 * L, 0.4 * B, fb, fb + 0.03 * L, C_WHITE, true);
        box(c - 0.06 * L, c + 0.06 * L, 0.3 * B, fb + 0.03 * L, fb + 0.05 * L, C_WHITE, true);
        box(c - 0.035 * L, c + 0.035 * L, 0.18 * B, fb + 0.05 * L, fb + 0.06 * L, C_WHITE);
      }
      break;
    case 'roro': {
      const top = fb + 0.11 * L, sc = hc === C_WHITE ? C_WHITE : hc;
      box(-0.47 * L, 0.4 * L, 0.48 * B, fb, top, sc);
      box(0.4 * L, 0.45 * L, 0.4 * B, fb, fb + 0.075 * L, sc);
      box(0.3 * L, 0.4 * L, 0.42 * B, top, top + 3, C_WHITE);
      win(0.3 * L, 0.4 * L, 0.42 * B, top + 1, top + 2.3, 'f');
      box(-0.42 * L, -0.37 * L, B / 9, top, top + 5, FUNC[id % FUNC.length]);
      mastBase = top + 3;
      break;
    }
    case 'ferry': {
      const n = L > 120 ? 5 : 2, dh = Math.max(2.8, 0.02 * L);
      let z = fb;
      for (let i = 0; i < n; i++) {
        const a0 = -0.42 * L + 0.03 * L * i, a1 = 0.3 * L - 0.045 * L * i, hb = (0.48 - 0.035 * i) * B;
        box(a0, a1, hb, z, z + dh, C_WHITE, i < n - 1);
        win(a0 + 0.02 * L, a1 - 0.01 * L, hb, z + 0.35 * dh, z + 0.7 * dh, i === n - 1 ? 'fs' : 's');
        z += dh;
      }
      box(-0.36 * L, -0.28 * L, B / 7, z, z + 0.045 * L, FUNC[id % FUNC.length]);
      mastBase = z;
      break;
    }
    case 'bulk': {
      house(-0.4 * L, -0.29 * L, 0.42 * B, fb + hs);
      const n = 7, a0 = -0.26 * L, len = (0.66 * L) / n, hcol = [hex('#7d2f26'), hex('#3f5a32'), C_GREY][id % 3];
      for (let i = 0; i < n; i++) box(a0 + i * len + 0.1 * len, a0 + (i + 0.9) * len, 0.36 * B, fb, fb + 0.012 * L + 1.5, hcol);
      for (const i of [1, 3, 5]) { const c = a0 + i * len; box(c - 1.2, c + 1.2, 1.2, fb, fb + 0.07 * L, hex('#d8c24a')); }
      break;
    }
    case 'ram':
      house(0.05 * L, 0.3 * L, 0.42 * B, fb + hs);
      box(-0.2 * L, 0, 0.3 * B, fb, fb + 2.5, C_GREY); // cuve à câble
      for (const s of [-1, 1]) box(-0.47 * L, -0.44 * L, 0.8, fb, fb + 0.12 * L, hex('#d8c24a'), false, s * 0.36 * B);
      box(-0.47 * L, -0.44 * L, 0.38 * B, fb + 0.12 * L - 1.5, fb + 0.12 * L, hex('#d8c24a'));
      break;
    case 'fish':
      box(0.05 * L, 0.25 * L, 0.33 * B, fb, fb + 2.6, C_WHITE);
      win(0.05 * L, 0.25 * L, 0.33 * B, fb + 1.3, fb + 2.2, 'fs');
      for (const s of [-1, 1]) box(-0.44 * L, -0.4 * L, 0.3, fb, fb + 0.22 * L, C_DARK, false, s * 0.38 * B); // portique
      box(-0.44 * L, -0.4 * L, 0.4 * B, fb + 0.22 * L - 0.6, fb + 0.22 * L, C_DARK);
      break;
    default: { // cargo, caboteur, NUC
      const fwd = k === 'coaster' && id % 2 === 0;
      if (fwd) { house(0.12 * L, 0.3 * L, 0.42 * B, fb + hs); box(-0.4 * L, 0.05 * L, 0.36 * B, fb, fb + 1.6, C_GREY); }
      else {
        house(-0.4 * L, -0.29 * L, 0.42 * B, fb + hs);
        const n = 3, a0 = -0.22 * L, len = (0.6 * L) / n;
        for (let i = 0; i < n; i++) box(a0 + i * len + 0.12 * len, a0 + (i + 0.88) * len, 0.36 * B, fb, fb + 1.8, hex('#6d4a2a'));
        for (const i of [1, 2]) { const c = a0 + i * len; box(c - 0.8, c + 0.8, 0.8, fb, fb + 0.06 * L + 3, hex('#d8c24a')); }
      }
    }
  }
  return { parts, decs, mastBase, key };
}

/** Dessine un bloc prismatique : faces latérales tournées vers l'œil, ombrées selon le soleil, et dessus. */
type Pose = { x: number; y: number; hdg: number };
function drawPart(t: Pose, p: Part, sh: (c: RGB, k: number) => string): void {
  const s = Math.sin(t.hdg * D2R), c = Math.cos(t.hdg * D2R), ox = t.x * NM - cam.ex, oy = t.y * NM - cam.ey, n = p.f.length;
  const lo: ([number, number, number] | null)[] = [], hi: ([number, number, number] | null)[] = [];
  for (const [a, b] of p.f) { const x = ox + a * s + b * c, y = oy + a * c - b * s; lo.push(proj(x, y, p.z0)); hi.push(proj(x, y, p.z1)); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [a0, b0] = p.f[i], [a1, b1] = p.f[j];
    let na = b1 - b0, nb = -(a1 - a0);
    const ma = (a0 + a1) / 2, mb = (b0 + b1) / 2;
    if (na * (ma - p.ca) + nb * (mb - p.cb) < 0) { na = -na; nb = -nb; }
    const nx = na * s + nb * c, ny = na * c - nb * s;
    if (nx * (ox + ma * s + mb * c) + ny * (oy + ma * c - mb * s) >= 0) continue;
    const P0 = lo[i], P1 = lo[j], P2 = hi[j], P3 = hi[i];
    if (!P0 || !P1 || !P2 || !P3) continue;
    const ln = Math.hypot(nx, ny) || 1;
    ctx.fillStyle = sh(p.c, 0.7 + 0.25 * Math.max(0, (nx * SUN_X + ny * SUN_Y) / ln));
    ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.lineTo(P2[0], P2[1]); ctx.lineTo(P3[0], P3[1]); ctx.closePath(); ctx.fill();
  }
  if (!p.nt && p.z1 < EYE) {
    ctx.fillStyle = sh(p.c, 1);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const q = hi[i]; if (!q) return; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill();
  }
}

/** Bandeaux de fenêtres tournés vers l'œil : vitrage sombre de jour, éclairés en partie la nuit. */
function drawDecs(t: Target, m: Model, sh: (c: RGB, k: number) => string, v: number, night: boolean): void {
  const s = Math.sin(t.hdg * D2R), c = Math.cos(t.hdg * D2R), ox = t.x * NM - cam.ex, oy = t.y * NM - cam.ey;
  m.decs.forEach((e, i) => {
    const nx = e.na * s + e.nb * c, ny = e.na * c - e.nb * s, ma = (e.a0 + e.a1) / 2 + e.na * 0.1, mb = (e.b0 + e.b1) / 2 + e.nb * 0.1;
    if (nx * (ox + ma * s + mb * c) + ny * (oy + ma * c - mb * s) >= 0) return;
    const P = (a: number, b: number, z: number) => proj(ox + (a + e.na * 0.1) * s + (b + e.nb * 0.1) * c, oy + (a + e.na * 0.1) * c - (b + e.nb * 0.1) * s, z);
    const q0 = P(e.a0, e.b0, e.z0), q1 = P(e.a1, e.b1, e.z0), q2 = P(e.a1, e.b1, e.z1), q3 = P(e.a0, e.b0, e.z1);
    if (!q0 || !q1 || !q2 || !q3) return;
    const lit = night && S.env.vis !== 'poor' && hh(t.id * 17 + i) < 0.7;
    ctx.fillStyle = lit ? mix(C_LIT, [0, 0, 0], 0.15 + 0.6 * v) : sh(C_GLASS, 1);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath(); ctx.fill();
  });
}

/** Navire proche : blocs triés du plus lointain au plus proche (coque d'abord), fenêtres, mâts. */
function drawNear(t: Target, sh: (c: RGB, k: number) => string, v: number, night: boolean): void {
  const m = modelOf(t), s = Math.sin(t.hdg * D2R), c = Math.cos(t.hdg * D2R), ox = t.x * NM - cam.ex, oy = t.y * NM - cam.ey;
  const key = (p: Part) => Math.hypot(ox + p.ca * s + p.cb * c, oy + p.ca * c - p.cb * s) - p.z0 * 1e-3;
  const hull = m.parts.filter((p) => p.hull), deck = m.parts.filter((p) => !p.hull).map((p) => ({ p, k: key(p) })).sort((u, w) => w.k - u.k);
  for (const p of hull) drawPart(t, p, sh);
  for (const { p } of deck) drawPart(t, p, sh);
  drawDecs(t, m, sh, v, night);
  const L = t.L, hM = mastH(L);
  const mast = (a: number, top: number) => {
    if (top < m.mastBase + 1) return;
    const q0 = proj(...shipPt(t, a, 0, m.mastBase)), q1 = proj(...shipPt(t, a, 0, top));
    if (!q0 || !q1) return;
    ctx.strokeStyle = sh(C_DARK, 1); ctx.lineWidth = Math.max(0.8, (0.6 / q0[2]) * cam.F);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
  };
  if (t.type === 'sail') return;
  mast(t.type === 'fish' ? 0.2 * L : 0.25 * L, hM);
  if (L >= 50 && t.type !== 'fish') mast(-0.3 * L, hM + Math.max(4.5, 0.04 * L));
}

/** Sillage : bande d'écume qui s'élargit et s'efface sur l'arrière (dessinée avant la coque). */
function wake(t: Target, d: number, sk: Sky, v: number): void {
  if (t.stw <= 3 || d > 4 * NM || v >= 0.9 || (sk.night && d > 0.5 * NM)) return;
  const L = t.L, B = Math.max(3, L / 7), wk: [number, number, number][] = [];
  for (const [a, b] of [[-L / 2, -B * 0.4], [-L / 2 - L * 0.9, -B * 1.4], [-L / 2 - L * 0.9, B * 1.4], [-L / 2, B * 0.4]]) { const q = proj(...shipPt(t, a, b, 0)); if (q) wk.push(q); }
  if (wk.length < 4) return;
  ctx.fillStyle = mix([235, 242, 245], sk.hor, v); ctx.globalAlpha = sk.night ? 0.08 : 0.3;
  ctx.beginPath(); wk.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTarget(t: Target, d: number, sk: Sky): void {
  if (d > 26 * NM) return;
  const ob = n360(brgOf(cam.ex / NM - t.x, cam.ey / NM - t.y) - t.hdg);
  const v = veil(d, sk.vis), dH = Math.sqrt(2 * EYE * RE);
  const L = t.L, B = Math.max(3, L / 7), fb = clamp(0.045 * L, 1.2, 12), hM = clamp(0.1 * L + 4, 6, 30);
  const shade = (c: RGB): string => mix(sk.night ? dark(c, d < 600 ? 0.18 : 0.06) : c, sk.hor, v);
  ctx.save();
  if (d > dH) { ctx.beginPath(); ctx.rect(0, 0, W, cam.yH); ctx.clip(); }
  // détail en blocs dès que le navire mesure plus de 45 pixels à l'écran, silhouette simple au-delà
  const near = v < 0.99 && (L / d) * cam.F > 45;
  wake(t, d, sk, v);
  if (v < 0.99) {
    const hullC = hex(HULL[t.id % HULL.length]), white = hex('#e6e4dc');
    if (near) drawNear(t, (c: RGB, k: number) => mix(dark(c, k * (sk.night ? (d < 600 ? 0.18 : 0.06) : 1)), sk.hor, v), v, sk.night);
    if (t.type === 'sail') {
      if (!near) solid(t, [[L / 2, 0, 1], [0, -B / 2, 1], [0, B / 2, 1], [-L / 2, -B / 2.4, 1], [-L / 2, B / 2.4, 1], [L / 2, 0, 0], [-L / 2, 0, 0]], shade(hex('#f2f2ee')));
      if (t.stw > 0.3) {
        solid(t, [[0.05 * L, 0, 1.5], [0.05 * L, 0, 1.3 * L], [-0.4 * L, 0, 1.5]], shade(hex('#f6f4ec')));
        solid(t, [[0.08 * L, 0, 1.5], [0.08 * L, 0, 1.2 * L], [0.48 * L, 0, 1.3]], shade(hex('#ecebe4')));
      }
    } else if (!near) {
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
  if (sk.night && t.type !== 'sail' && S.env.vis !== 'poor' && !near) {
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
  // R30c : navire au mouillage de 100 m et plus, ponts éclairés
  if (sk.night && t.type === 'anchor' && t.L >= 100 && S.env.vis !== 'poor' && d < 5 * NM) {
    const k = clamp(1 - d / (5 * NM), 0, 1), fb = clamp(0.045 * t.L, 1.2, 12);
    for (let a = -0.35; a <= 0.41; a += 0.15) { const q = proj(...shipPt(t, a * t.L, 0, fb + 6)); if (q) glow(q[0], q[1], LIGHT.A, 0.3 + 0.4 * k, 0.9); }
  }
  // vague d'étrave et sillage
  if (t.stw > 3 && d < 4 * NM && v < 0.9 && !(sk.night && d > 0.5 * NM)) {
    const L = t.L, B = Math.max(3, L / 7), q = proj(...shipPt(t, L / 2, 0, 0.3));
    if (q) {
      const r = Math.max(0.6, ((B * 0.28 * Math.min(1, t.stw / 15)) / q[2]) * cam.F);
      ctx.fillStyle = mix([245, 248, 250], sk.hor, v); ctx.globalAlpha = sk.night ? 0.25 : 0.85;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], r * 1.3, r * 0.3, 0, 0, 7); ctx.fill();
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
export function flashOn(kind: string, id: string): boolean {
  const ph = (TV + id.charCodeAt(0) * 1.7) % 15;
  switch (kind) {
    case 'N': return (TV * 1.0) % 1 < 0.3;
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
  const cols: Record<string, string[]> = { N: ['#f4d000', '#111'], S: ['#111', '#f4d000'], E: ['#111', '#f4d000', '#111'], W: ['#f4d000', '#111', '#f4d000'], special: ['#f4d000'], safe: ['#c81e1e', '#f0f0f0'], lr: ['#c81e1e'], lg: ['#1f9a46'] };
  for (const m of CHART.marks) {
    const dx = m.x * NM - cam.ex, dy = m.y * NM - cam.ey, d = Math.hypot(dx, dy);
    if (m.kind === 'lh' || m.kind === 'port') { lighthouse(m, dx, dy, d, sk); continue; }
    if (d > 13 * NM) continue;
    const v = veil(d, sk.vis), ph = m.id.charCodeAt(0) * 0.37 + m.id.length;
    const bob = m.kind === 'lv' ? hs * 0.08 * Math.sin(TV * 0.5 + ph) : hs * 0.18 * Math.sin(TV * 1.25 + ph);
    const stub = { x: m.x, y: m.y, hdg: (S.env.windFrom + 15 * Math.sin(TV * 0.2 + ph)) % 360 };
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
          else if (m.kind === 'lr') { ctx.fillStyle = shade('#c81e1e'); ctx.fillRect(top[0] - r * 0.8, top[1] - 2.4 * r, 1.6 * r, 1.6 * r); } // voyant cylindrique
          else if (m.kind === 'lg') { ctx.fillStyle = shade('#1f9a46'); cone(top[1] - 2.4 * r, true); } // voyant conique
        }
      }
    }
    const lit = m.light ? lightColour(m.light) : m.kind === 'special' ? 'Y' : 'W';
    const a = lightAlpha(d, m.kind === 'lv' ? 12 : 4, sk);
    if (a > 0 && (m.light ? lightOn(m.light, TV + m.id.length * 1.3) : flashOn(m.kind, m.id))) {
      const q = proj(dx, dy, zl);
      if (q) { reflect(proj(dx, dy, 0), q, LIGHT[lit], a); glow(q[0], q[1], LIGHT[lit], a, m.kind === 'lv' ? 1.5 : 1); }
    }
  }
}

/**
 * Phare à terre ou feu de port : tour blanche de jour (à moins de 8 NM), feu de grande portée la nuit. Le feu est caché par la terre
 * située devant lui (rayons de côte) et sous l'horizon au-delà de sa portée géographique (élévation du feu et de l'œil).
 */
function lighthouse(m: (typeof CHART.marks)[number], dx: number, dy: number, d: number, sk: Sky): void {
  const z = m.elev ?? 40, dNM = d / NM, b = brgOf(dx, dy), co = S.coast;
  if (co && co.r0[rayIndex(b)] < dNM - 0.6) return;
  if (dNM > 2.08 * (Math.sqrt(z) + Math.sqrt(EYE))) return;
  const v = veil(d, sk.vis), stub = { x: m.x, y: m.y, hdg: 0 }, port = m.kind === 'port', col = lightColour(m.light);
  if (!sk.night && v < 0.95) {
    // phare : tour blanche ; feu de port : tourelle rouge (bâbord) ou verte (tribord) selon la couleur du feu (IALA A)
    if (!port && dNM < 8) solid(stub, box(-3, 3, 3, z - 18, z + 2), mix(hex('#eeeeea'), sk.hor, v));
    if (port && dNM < 4) {
      const tc = col === 'R' ? '#b8302a' : col === 'G' ? '#2f7a3a' : '#e4e2da';
      solid(stub, box(-1.6, 1.6, 1.6, 0, Math.max(3, z - 3)), mix(hex('#8d8a82'), sk.hor, v));
      solid(stub, box(-1.1, 1.1, 1.1, Math.max(3, z - 3), z + 1), mix(hex(tc), sk.hor, v));
    }
  }
  // éclairage des quais la nuit, autour des feux de port
  if (port && sk.night && S.env.vis !== 'poor' && dNM < 8) {
    const k = clamp(1 - dNM / 8, 0, 1);
    ctx.fillStyle = `rgba(${LIGHT.A},${0.25 + 0.5 * k})`;
    for (let i = 0; i < 5; i++) {
      const h = Math.abs(Math.sin((m.id.charCodeAt(0) + i * 7.3) * 12.9898) * 43758.5453) % 1;
      const q = proj(dx + (h - 0.5) * 500, dy + (((h * 7) % 1) - 0.5) * 500, 8 + 10 * h);
      if (q) ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
    }
  }
  const a = lightAlpha(d, m.range ?? (port ? 5 : 15), sk);
  if (a > 0 && lightOn(m.light ?? 'Fl 10s', TV + m.id.length * 1.7)) {
    const q = proj(dx, dy, z);
    if (q) {
      if (port && d < Math.sqrt(2 * EYE * RE)) reflect(proj(dx, dy, 0), q, LIGHT[col], a);
      glow(q[0], q[1], LIGHT[col], a, port ? 1.1 : 1.6);
    }
  }
}

// ---------------------------------------------------------------- ville et ouvrages (blocs)

const blockPart = (a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, c: RGB, nt = false): Part =>
  ({ f: [[a0, b0], [a1, b0], [a1, b1], [a0, b1]], z0, z1, c, nt, ca: (a0 + a1) / 2, cb: (b0 + b1) / 2 });
const blockCache = new Map<BlockG, Part[]>();
/** Volumes d'un bloc (repère du bloc : a selon l'orientation rot, b à droite). */
function blockParts(b: BlockG, base: number): Part[] {
  let ps = blockCache.get(b);
  if (ps) return ps;
  const c = hex(b.col), w = b.w / 2, d = b.d / 2, z = base + b.z0;
  switch (b.kind) {
    case 'crane': { // portique à conteneurs : deux paires de pieds, poutre, flèche au-dessus du bassin (vers le sud)
      const legH = b.h * 0.6;
      ps = [blockPart(-12, -9, -9, -6, z, z + legH, c), blockPart(-12, -9, 6, 9, z, z + legH, c), blockPart(9, 12, -9, -6, z, z + legH, c), blockPart(9, 12, 6, 9, z, z + legH, c),
        blockPart(-14, 14, -10, 10, z + legH, z + legH + 6, c), blockPart(-14, 62, -2.5, 2.5, z + legH + 2, z + legH + 5, c), blockPart(-6, 6, -6, 6, z + legH + 6, z + b.h, c)];
      break;
    }
    case 'pylon': // pylône en Y renversé : jambes écartées puis fût
      ps = [blockPart(-w * 2.2, w * 2.2, -d, d, z, z + b.h * 0.35, c, true), blockPart(-w, w, -d * 0.7, d * 0.7, z + b.h * 0.35, z + b.h, c)];
      break;
    default:
      ps = [blockPart(-w, w, -d, d, z, z + b.h, c)];
  }
  blockCache.set(b, ps);
  return ps;
}

/** Ville, grues, réservoirs et ponts : blocs triés du plus lointain au plus proche, simplifiés au loin. */
function drawBlocks(sk: Sky): void {
  const bl = CHART.blocks;
  if (!bl.length) return;
  const list: { b: BlockG; d: number }[] = [];
  for (const b of bl) {
    const dx = b.x * NM - cam.ex, dy = b.y * NM - cam.ey, f = dx * cam.sy + dy * cam.cyw;
    if (f < 30) continue;
    const d = Math.hypot(dx, dy);
    if (d > 14 * NM || ((b.h + 10) / d) * cam.F < 1.2 || Math.abs(dx * cam.cyw - dy * cam.sy) > f * 1.3 + 300) continue;
    list.push({ b, d });
  }
  list.sort((u, v) => v.d - u.d);
  const night = sk.night;
  for (const { b, d } of list) {
    const v = veil(d, sk.vis);
    if (v > 0.985) continue;
    const lit = night && b.kind === 'tower' && b.h > 100; // tour Saint-Joseph éclairée la nuit
    const sh = (c: RGB, k: number) => mix(night && !lit ? dark(c, k * 0.07) : dark(c, k), sk.hor, v);
    const pose = { x: b.x, y: b.y, hdg: b.kind === 'crane' ? 180 : b.rot };
    const base = b.kind === 'deck' ? 0 : landHeight(b.x, b.y).h * 0.6;
    const px = (b.h / d) * cam.F;
    if (px < 4 || b.kind === 'bld' && px < 7) {
      // au loin : simple aplat vertical
      const q0 = proj(b.x * NM - cam.ex, b.y * NM - cam.ey, base + b.z0), q1 = proj(b.x * NM - cam.ex, b.y * NM - cam.ey, base + b.z0 + b.h);
      if (!q0 || !q1) continue;
      const wpx = Math.max(1, (Math.max(b.w, b.d) / q0[2]) * cam.F);
      ctx.fillStyle = sh(hex(b.col), 0.85); ctx.fillRect(q0[0] - wpx / 2, q1[1], wpx, q0[1] - q1[1]);
    } else for (const p of blockParts(b, base)) drawPart(pose, p, sh);
    // fenêtres éclairées la nuit, feux d'obstacle rouges sur les grands ouvrages
    if (night && S.env.vis !== 'poor' && d < 7 * NM) {
      const k = clamp(1 - d / (7 * NM), 0, 1), n = b.kind === 'bld' || b.kind === 'tower' ? 1 + Math.floor(b.h / 12) : 0;
      ctx.fillStyle = `rgba(${LIGHT.A},${0.3 + 0.5 * k})`;
      for (let i = 0; i < n; i++) {
        const hsh = Math.abs(Math.sin((b.x * 1e4 + b.y * 3e3 + i * 7.1) * 12.9898) * 43758.5453) % 1;
        if (hsh < 0.45) continue;
        const q = proj(b.x * NM - cam.ex + (hsh - 0.5) * b.w * 0.8, b.y * NM - cam.ey, base + b.z0 + b.h * (0.15 + 0.7 * ((hsh * 13) % 1)));
        if (q) ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
      }
      if (b.h > 60 && Math.floor(TV) % 2 === 0) { const q = proj(b.x * NM - cam.ex, b.y * NM - cam.ey, base + b.z0 + b.h + 1); if (q) glow(q[0], q[1], LIGHT.R, 0.7, 0.8); }
    }
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
  // équipement de pont : tuyautage de cargaison, passerelle (catwalk), manifold et ses grues, panneaux de citerne, soupapes
  const col = (c: string) => mix(dark(hex(c), lightK), sk.hor, fogV);
  const F3 = (a: number, b: number, z: number): [number, number, number] | null => {
    const da = a - eyeA, f = da * cr + b * sr;
    return f < 3 ? null : [W / 2 + ((-da * sr + b * cr) / f) * cam.F, cam.cy0 - ((z - EYE) / f) * cam.F, f];
  };
  /** Tube de diamètre wm (m), découpé en tronçons pour que son épaisseur suive la perspective. */
  const pipe = (a: number, b: number, z: number, a2: number, b2: number, z2: number, wm: number, c: string) => {
    const n = Math.max(1, Math.ceil(Math.hypot(a2 - a, b2 - b, z2 - z) / 15));
    ctx.strokeStyle = col(c);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p = F3(a + (a2 - a) * t0, b + (b2 - b) * t0, z + (z2 - z) * t0), q = F3(a + (a2 - a) * t1, b + (b2 - b) * t1, z + (z2 - z) * t1);
      if (!p || !q) continue;
      ctx.lineWidth = clamp((wm * cam.F) / ((p[2] + q[2]) / 2), 0.6, 16);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
  };
  const aF = L / 2 - 32;
  // panneaux de citerne (plaques sur le pont, de part et d'autre de l'axe)
  for (const a of [-80, -45, 25, 60, 95]) for (const b of [-12, 12]) poly([[a - 2, b - 2, fb + 0.4], [a + 2, b - 2, fb + 0.4], [a + 2, b + 2, fb + 0.4], [a - 2, b + 2, fb + 0.4]], col('#8f5a48'));
  ctx.lineCap = 'butt';
  for (const b of [-3.2, -1.6, 1.6, 3.2]) pipe(a0, b, fb + 0.8, aF, b, fb + 0.8, 0.7, '#b9b4a6'); // collecteurs de cargaison
  for (let a = a0 + 12; a < aF; a += 16) pipe(a, 0, fb, a, 0, fb + 2, 0.25, '#a8a396'); // supports de la passerelle
  pipe(a0, 0, fb + 2, aF + 8, 0, fb + 2, 1.1, '#d6d1c4'); // passerelle de pont (catwalk)
  for (const a of [-9, -6, -3, 0]) { // manifold : traverses et colonnes montantes
    pipe(a, -23, fb + 1.6, a, 23, fb + 1.6, 0.6, '#c9c3b5');
    for (const b of [-23, 23]) pipe(a, b, fb + 1.6, a, b, fb + 3.2, 0.5, '#c9c3b5');
  }
  for (const s2 of [-1, 1]) { // grues de manutention des flexibles
    pipe(-14, s2 * 20, fb, -14, s2 * 20, fb + 14, 0.9, '#d1b13a');
    pipe(-14, s2 * 20, fb + 13, -3, s2 * 9, fb + 19, 0.5, '#d1b13a');
  }
  for (const a of [-80, -45, 25, 60, 95]) for (const b of [-18, 18]) pipe(a, b, fb, a, b, fb + 3.5, 0.35, '#c9c3b5'); // soupapes P/V
  pipe(-60, 7, fb, -60, 7, fb + 12, 0.6, '#c9c3b5'); // mât de dégazage
  for (const b of [-6, 6]) poly([[L / 2 - 26, b - 2, fb + 3.5], [L / 2 - 22, b - 2, fb + 3.5], [L / 2 - 22, b + 2, fb + 3.5], [L / 2 - 26, b + 2, fb + 3.5]], col('#3b3f43')); // guindeaux
  pipe(L / 2 - 15, 0, fb + 3, L / 2 - 15, 0, fb + 26, 0.8, '#c9c3b5'); // mât avant
  ctx.lineWidth = 1;
}

function bridgeFrame(sk: Sky): void {
  const c = sk.night ? '#020203' : '#1b1f23';
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, W, Math.max(6, H * 0.035));
  if (!look.inst) ctx.fillRect(0, H - Math.max(10, H * 0.06), W, H);
  for (const m of [-90, -54, -18, 18, 54, 90]) { // montants des vitres de passerelle, tous les 36°
    const rel = m - look.rel;
    if (Math.abs(rel) > fov() / 2 + 3) continue;
    const x = W / 2 + Math.tan(rel * D2R) * cam.F;
    ctx.fillRect(x - 2.5, 0, 5, H);
  }
}

/** Masque des jumelles sur le calque 2D transparent posé sur le rendu WebGL. */
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
  // dernier signal sonore entendu (8 s)
  for (let k = S.snd.list.length - 1; k >= 0; k--) {
    const s = S.snd.list[k];
    if (S.t - s.t > 8) break;
    if (s.src === OWN) { info.push(`♪ Votre sifflet : ${patText(s.pat)}`); break; }
    if (Math.hypot(s.x - o.x, s.y - o.y) <= audibleRange(s.L)) { info.push(`♪ Entendu ${sideOf(s.x, s.y)} : ${patText(s.pat)}`); break; }
  }
  if (hover !== null) {
    const rel = Math.atan((hover - W / 2) / cam.F) / D2R;
    info.push(`Relèvement curseur ${n360(cam.yaw + rel).toFixed(1)}°T`);
    ctx.strokeStyle = 'rgba(255,207,51,.6)'; ctx.beginPath(); ctx.moveTo(hover, top + 24); ctx.lineTo(hover, top + 40); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(8, top + 36, Math.max(...info.map((s) => ctx.measureText(s).width)) + 12, info.length * (fs + 4) + 6);
  ctx.fillStyle = 'rgba(230,240,245,.95)';
  info.forEach((s, i) => ctx.fillText(s, 14, top + 40 + i * (fs + 4)));
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
  const dp = depthAt(o.x, o.y), ukc = dp - ownDraft(o);
  lcd((x += gap), dp > 200 ? ['> 200 m', 'sous quille'] : [`${ukc.toFixed(1)} m`, `fonds ${dp.toFixed(0)} m`], 'SONDEUR');
  ctx.textBaseline = 'alphabetic';
}
