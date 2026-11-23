/**
 * Vue ECDIS (canvas 2D), nord en haut, mouvement vrai.
 *
 * Présentation inspirée de la bibliothèque de présentation S-52 (couleurs de fonds, terre chamois de jour,
 * magenta pour le DST, contour de sécurité renforcé), sans prétendre à la conformité : carte schématique
 * d'entraînement, non destinée à la navigation.
 *
 * Fluidité : les couches lourdes sont précalculées une fois par carte / palette / contour de sécurité
 * (image des zones de profondeur, Path2D de la terre et des isobathes en coordonnées géographiques, dessinés
 * avec une seule transformation affine) ; seules les couches dynamiques sont recalculées à chaque image.
 */
import { lightColour } from '../sim/visual';
import { S, ownDraft } from '../core/state';
import { D2R, brgOf, clamp, n360, p3, vec } from '../core/util';
import { fmtLat, fmtLon, toLL, toXY } from '../core/geo';
import { CHART, contours, depthAt, inPoly, polyLength, pointAt, tssAt, type XY } from '../sim/chart';
import { legData } from '../sim/route';
import { trueV } from '../sim/radar';
import { aisAssociated, aisLost, aisPos } from '../sim/ais';
import { isUnackedDanger } from '../sim/alerts';

type PalKey = 'DAY' | 'DUSK' | 'NIGHT';
interface EPal {
  deep: string; md: string; ms: string; vs: string; it: string; land: string; coast: string; contour: string; safety: string;
  mag: string; text: string; dim: string; own: string; ais: string; arpa: string; route: string; danger: string;
  hud: string; hudTxt: string; grid: string; ebl: string;
}
/** Couleurs inspirées des tables S-52 (jour), adaptées pour le crépuscule et la nuit. */
export const EPAL: Record<PalKey, EPal> = {
  DAY: { deep: '#d4eaee', md: '#bad5e1', ms: '#98c5f2', vs: '#73b6ef', it: '#83b295', land: '#c9b97a', coast: '#525a5c', contour: '#7d8b93', safety: '#1d2326',
    mag: '#c545c3', text: '#0b1a24', dim: '#3b4a55', own: '#000000', ais: '#1e1e1e', arpa: '#c76b00', route: '#e0521f', danger: '#e01f1f',
    hud: 'rgba(255,255,255,.86)', hudTxt: '#0b1a24', grid: 'rgba(60,80,95,.35)', ebl: '#0a6b3a' },
  DUSK: { deep: '#0b1118', md: '#111b26', ms: '#1a2a3c', vs: '#26435e', it: '#263a2a', land: '#4b4129', coast: '#9aa1a3', contour: '#56636d', safety: '#c3ccd2',
    mag: '#c056be', text: '#cfe2ef', dim: '#7f9fb3', own: '#e8f4ff', ais: '#dfe7ec', arpa: '#ffb020', route: '#ff6a3d', danger: '#ff3b3b',
    hud: 'rgba(3,8,13,.84)', hudTxt: '#cfe2ef', grid: 'rgba(130,160,180,.18)', ebl: '#7dffb0' },
  NIGHT: { deep: '#000000', md: '#04080c', ms: '#091018', vs: '#0f1b27', it: '#0d160f', land: '#1f1a0d', coast: '#3f4446', contour: '#283037', safety: '#525c63',
    mag: '#5c2a5b', text: '#64737d', dim: '#45525b', own: '#7b8a95', ais: '#66727a', arpa: '#8a5a10', route: '#8a3a1c', danger: '#a51616',
    hud: 'rgba(0,0,0,.86)', hudTxt: '#6d7d88', grid: 'rgba(80,95,105,.16)', ebl: '#3c7d58' },
};

export const E_RANGES = [0.75, 1.5, 3, 6, 12, 24];

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
let W = 0, H = 0, DPR = 1;
/** Caméra : centre (NM), demi-hauteur affichée (NM), suivi du porteur. */
export const view = { cx: 0, cy: 0, range: 6, follow: true };
export const ecur: { x: number | null; y: number | null } = { x: null, y: null };
/** Objet sélectionné à la souris (outil Info). */
export let picked: { kind: 'ais' | 'arpa' | 'mark' | 'own'; id: string | number } | null = null;

export function initEcdis(canvas: HTMLCanvasElement): void {
  cv = canvas;
  ctx = canvas.getContext('2d')!;
  new ResizeObserver(resize).observe(cv);
  resize();
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
}

/** Pixels par mille. */
const kpx = () => H / 2 / view.range;
/** Géographique (NM) → écran (px CSS). */
export function toScr(x: number, y: number): [number, number] {
  const k = kpx();
  return [W / 2 + (x - view.cx) * k, H / 2 - (y - view.cy) * k];
}
/** Écran (px CSS) → géographique (NM). */
export function fromScr(px: number, py: number): XY {
  const k = kpx();
  return { x: view.cx + (px - W / 2) / k, y: view.cy - (py - H / 2) / k };
}

export function zoom(d: number): void {
  const i = clamp(E_RANGES.indexOf(view.range) + d, 0, E_RANGES.length - 1);
  view.range = E_RANGES[i];
}
export function centreOnOwn(): void { view.follow = true; }
export function pan(dxPx: number, dyPx: number): void {
  const k = kpx();
  view.follow = false; view.cx -= dxPx / k; view.cy += dyPx / k;
}

// ---------------------------------------------------------------- caches

let cacheKey = '';
let depthImg: HTMLCanvasElement | null = null;
let landPath: Path2D | null = null, urbanPath: Path2D | null = null;
let isoPaths: { level: number; path: Path2D }[] = [];
let hatch: CanvasPattern | null = null;

function ensureCaches(pal: EPal, palKey: PalKey): void {
  const key = `${CHART.key}|${palKey}|${S.ecdis.safety}`;
  if (key === cacheKey) return;
  cacheKey = key;
  // terre
  landPath = new Path2D();
  for (const r of CHART.land) { r.forEach((p, i) => (i ? landPath!.lineTo(p.x, p.y) : landPath!.moveTo(p.x, p.y))); landPath.closePath(); }
  // zones bâties (teinte foncée de la terre)
  urbanPath = new Path2D();
  for (const u of CHART.urban) { u.poly.forEach((p, i) => (i ? urbanPath!.lineTo(p.x, p.y) : urbanPath!.moveTo(p.x, p.y))); urbanPath.closePath(); }
  // isobathes
  isoPaths = [];
  const levels = Array.from(new Set([10, 20, 30, S.ecdis.safety])).sort((a, b) => a - b);
  for (const lv of levels) {
    const seg = contours(lv), p = new Path2D();
    for (let i = 0; i < seg.length; i += 4) { p.moveTo(seg[i], seg[i + 1]); p.lineTo(seg[i + 2], seg[i + 3]); }
    isoPaths.push({ level: lv, path: p });
  }
  // zones de profondeur (image suréchantillonnée ×3 de la grille)
  depthImg = null;
  const g = CHART.grid;
  if (g) {
    const f = 3, w = (g.nx - 1) * f, h = (g.ny - 1) * f, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d')!, img = cx.createImageData(w, h), sc = S.ecdis.safety, deepC = Math.max(sc + 10, 30);
    const rgb = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const C = { it: rgb(pal.it), vs: rgb(pal.vs), ms: rgb(pal.ms), md: rgb(pal.md), dw: rgb(pal.deep), land: rgb(pal.land) };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = g.x0 + (i / f) * g.dx, y = g.y0 + ((h - 1 - j) / f) * g.dx, d = depthAt(x, y);
      const col = d <= -5 ? C.land : d < 0 ? C.it : d < 10 ? C.vs : d < sc ? C.ms : d < deepC ? C.md : C.dw;
      const o = (j * w + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    depthImg = c;
  }
  // hachures des zones de séparation
  const hc = document.createElement('canvas');
  hc.width = 10; hc.height = 10;
  const hx = hc.getContext('2d')!;
  hx.strokeStyle = pal.mag; hx.globalAlpha = 0.55; hx.lineWidth = 1.2;
  hx.beginPath(); hx.moveTo(0, 10); hx.lineTo(10, 0); hx.moveTo(-2, 2); hx.lineTo(2, -2); hx.moveTo(8, 12); hx.lineTo(12, 8); hx.stroke();
  hatch = ctx.createPattern(hc, 'repeat');
}

/** Transformation canvas : coordonnées géographiques (NM) → pixels physiques. */
function worldTransform(): void {
  const k = kpx();
  ctx.setTransform(DPR * k, 0, 0, -DPR * k, DPR * (W / 2 - view.cx * k), DPR * (H / 2 + view.cy * k));
}
function screenTransform(): void { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }

function polyPath(pts: XY[], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => { const q = toScr(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
  if (close) ctx.closePath();
}
function line(a: [number, number], b: [number, number]): void { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

// ---------------------------------------------------------------- dessin

export function drawEcdis(): void {
  if (!W || !H) return;
  const palKey = S.radar.palette, pal = EPAL[palKey], o = S.own, E = S.ecdis, k = kpx();
  ensureCaches(pal, palKey);
  if (view.follow) {
    const sog = Math.hypot(o.vx, o.vy), cog = sog > 0.5 ? brgOf(o.vx, o.vy) : o.hdg, v = vec(cog, view.range * 0.35);
    view.cx = o.x + v.x; view.cy = o.y + v.y;
  }
  const fs = clamp(Math.min(W, H) / 70, 10, 13);
  screenTransform();
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.deep; ctx.fillRect(0, 0, W, H);

  // zones de profondeur, isobathes, terre (coordonnées géographiques)
  const g = CHART.grid;
  if (g && depthImg && E.layers.depth) {
    const a = toScr(g.x0, g.y0 + (g.ny - 1) * g.dx);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(depthImg, a[0], a[1], (g.nx - 1) * g.dx * k, (g.ny - 1) * g.dx * k);
  }
  worldTransform();
  if (E.layers.depth) {
    for (const iso of isoPaths) {
      const sc = iso.level === E.safety;
      ctx.strokeStyle = sc ? pal.safety : pal.contour; ctx.lineWidth = (sc ? 2.2 : 0.8) / k;
      ctx.stroke(iso.path);
    }
  }
  if (landPath) {
    ctx.fillStyle = pal.land; ctx.fill(landPath, 'evenodd');
    ctx.strokeStyle = pal.coast; ctx.lineWidth = 1.2 / k; ctx.stroke(landPath);
    if (urbanPath && CHART.urban.length) { ctx.globalAlpha = 0.22; ctx.fillStyle = pal.coast; ctx.fill(urbanPath); ctx.globalAlpha = 1; }
  }
  screenTransform();

  drawGraticule(pal, fs);
  if (E.layers.tss) drawTss(pal, fs, k);
  drawBanks(pal, fs);
  drawMarks(pal, fs);
  drawRoute(pal, fs);
  drawTrack(pal);
  drawTargets(pal, fs);
  drawOwn(pal, k);
  drawEbl(pal, k);
  drawHud(pal, fs);
}

function drawGraticule(pal: EPal, fs: number): void {
  const tl = toLL(fromScr(0, 0).x, fromScr(0, 0).y), br = toLL(fromScr(W, H).x, fromScr(W, H).y);
  const spanMin = (tl.lat - br.lat) * 60, step = spanMin > 40 ? 10 : spanMin > 16 ? 5 : spanMin > 6 ? 2 : spanMin > 2.5 ? 1 : 0.5;
  ctx.strokeStyle = pal.grid; ctx.lineWidth = 1; ctx.fillStyle = pal.dim;
  ctx.font = `${fs * 0.8}px ui-monospace,Menlo,monospace`;
  const lat0 = Math.ceil((br.lat * 60) / step) * step, lon0 = Math.ceil((tl.lon * 60) / step) * step;
  const toS = (lat: number, lon: number) => { const p = toXY(lat, lon); return toScr(p.x, p.y); };
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  for (let m = lat0; m <= tl.lat * 60; m += step) {
    const y = toS(m / 60, tl.lon)[1];
    line([0, y], [W, y]);
    ctx.fillText(fmtLat(m / 60).replace(/,0+'/, "'"), 4, y - 1);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let m = lon0; m <= br.lon * 60; m += step) {
    const x = toS(tl.lat, m / 60)[0];
    line([x, 0], [x, H]);
    ctx.fillText(fmtLon(m / 60).replace(/,0+'/, "'"), x, H - fs * 3.2);
  }
}

function drawTss(pal: EPal, fs: number, k: number): void {
  // chenaux (R9) : limites en tirets gris, axe en pointillés, nom
  for (const f of CHART.fairways) {
    ctx.strokeStyle = pal.text; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.1; ctx.setLineDash([8, 6]);
    polyPath(f.poly); ctx.stroke();
    ctx.setLineDash([2, 6]); polyPath(f.axis, false); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (S.ecdis.layers.names) {
      const a = f.axis[0], b = f.axis[1], q = toScr((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.fillStyle = pal.text; ctx.font = `600 ${fs * 0.8}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`${f.name} (${f.depth} m)`, q[0], q[1] - 8);
    }
  }
  // zones de séparation : hachures magenta
  for (const z of CHART.zones) {
    polyPath(z.poly);
    if (hatch) { ctx.fillStyle = hatch; ctx.fill(); }
    ctx.strokeStyle = pal.mag; ctx.lineWidth = 1.3; ctx.setLineDash([]); ctx.stroke();
  }
  // limites des voies : tirets magenta ; ligne de séparation : trait large
  ctx.strokeStyle = pal.mag; ctx.lineWidth = 1.4; ctx.setLineDash([10, 6]);
  for (const l of CHART.lanes) for (const p of l.polys) { polyPath(p); ctx.stroke(); }
  ctx.setLineDash([]);
  // zones de prudence : limite en tirets longs, symbole « ! » au centre
  ctx.lineWidth = 1.2; ctx.setLineDash([14, 5, 3, 5]);
  for (const z of CHART.prec) {
    polyPath(z.poly); ctx.stroke();
    const c = z.poly.reduce((s, p) => ({ x: s.x + p.x / z.poly.length, y: s.y + p.y / z.poly.length }), { x: 0, y: 0 }), q = toScr(c.x, c.y), r = fs * 0.9;
    ctx.save(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0] + r, q[1] + r * 0.75); ctx.lineTo(q[0] - r, q[1] + r * 0.75); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = pal.mag; ctx.font = `700 ${fs}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', q[0], q[1] + r * 0.15);
    if (S.ecdis.layers.names) { ctx.font = `600 ${fs * 0.8}px system-ui,sans-serif`; ctx.fillText(z.name, q[0], q[1] + r * 2); }
    ctx.restore();
  }
  // mouillages : cercle en tirets, ancre
  ctx.setLineDash([6, 4]);
  for (const a of CHART.anch) {
    const q = toScr(a.x, a.y), rr = a.r * k;
    ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(4, rr), 0, 7); ctx.stroke();
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = pal.mag; ctx.font = `700 ${fs * 1.1}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚓', q[0], q[1]); if (S.ecdis.layers.names) { ctx.font = `600 ${fs * 0.8}px system-ui,sans-serif`; ctx.fillText(a.name, q[0], q[1] + Math.max(4, rr) + fs * 0.8); }
    ctx.restore();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.55; ctx.lineWidth = 5;
  for (const pl of CHART.lines) { polyPath(pl, false); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // zones de navigation côtière
  ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]);
  ctx.fillStyle = pal.mag; ctx.font = `600 ${fs * 0.85}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const z of CHART.itz) {
    const a = toScr(z.poly[0].x, z.poly[0].y), b = toScr(z.poly[1].x, z.poly[1].y);
    line(a, b);
    ctx.fillText('ZNC', (a[0] + b[0]) / 2 - 18, (a[1] + b[1]) / 2);
  }
  // route en eau profonde
  ctx.strokeStyle = pal.dim; ctx.setLineDash([6, 4]);
  for (const d of CHART.dw) {
    polyPath(d); ctx.stroke();
    const c = d.reduce((s, p) => ({ x: s.x + p.x / d.length, y: s.y + p.y / d.length }), { x: 0, y: 0 }), q = toScr(c.x, c.y);
    ctx.fillStyle = pal.dim; ctx.fillText('DW', q[0], q[1]);
  }
  ctx.setLineDash([]);
  // flèches de sens de circulation (contour magenta), tous les 3,5 NM
  const L = clamp(1.1 * k, 26, 64);
  ctx.strokeStyle = pal.mag; ctx.lineWidth = 1.5;
  for (const l of CHART.lanes) {
    const len = polyLength(l.axis);
    for (let s = 1.5; s < len; s += 3.5) {
      const p = pointAt(l.axis, s), q = toScr(p.x, p.y);
      if (q[0] < -L || q[1] < -L || q[0] > W + L || q[1] > H + L) continue;
      if (!l.polys.some((pl) => inPoly(pl, p.x, p.y))) continue; // l'axe se prolonge dans les zones de prudence
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(p.brg * D2R);
      const w = L * 0.11, hw = L * 0.26, hl = L * 0.38;
      ctx.beginPath();
      ctx.moveTo(-w, L / 2); ctx.lineTo(-w, -L / 2 + hl); ctx.lineTo(-hw, -L / 2 + hl); ctx.lineTo(0, -L / 2);
      ctx.lineTo(hw, -L / 2 + hl); ctx.lineTo(w, -L / 2 + hl); ctx.lineTo(w, L / 2); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBanks(pal: EPal, fs: number): void {
  if (!S.ecdis.layers.names) return;
  ctx.font = `italic ${fs * 0.9}px Georgia,serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of CHART.banks) {
    const q = toScr(b.x, b.y);
    if (q[0] < -50 || q[1] < -20 || q[0] > W + 50 || q[1] > H + 20) continue;
    ctx.fillStyle = pal.text; ctx.fillText(b.name, q[0], q[1] - fs);
    ctx.font = `${fs * 0.85}px ui-monospace,Menlo,monospace`; ctx.fillStyle = pal.dim;
    ctx.fillText(b.min < 0 ? 'découvrant' : `≈ ${b.min} m`, q[0], q[1] + 2);
    ctx.font = `italic ${fs * 0.9}px Georgia,serif`;
  }
}

const CARD: Record<string, [string, string, string]> = { N: ['#111', '#111', '#f4d000'], S: ['#f4d000', '#111', '#111'], E: ['#111', '#f4d000', '#111'], W: ['#f4d000', '#111', '#f4d000'] };

function drawMarks(pal: EPal, fs: number): void {
  const night = S.radar.palette === 'NIGHT', dim = night ? 0.5 : 1;
  ctx.font = `600 ${fs * 0.8}px system-ui,sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const m of CHART.marks) {
    const q = toScr(m.x, m.y);
    if (q[0] < -30 || q[1] < -30 || q[0] > W + 30 || q[1] > H + 30) continue;
    ctx.globalAlpha = dim;
    // feu : virgule magenta (rouge ou verte pour un feu rouge ou vert)
    const lc = lightColour(m.light);
    ctx.fillStyle = lc === 'R' ? '#d01c1c' : lc === 'G' ? '#16a34a' : pal.mag; ctx.beginPath(); ctx.ellipse(q[0] + 7, q[1] - 9, 3, 7, 0.6, 0, 7); ctx.fill();
    if (m.kind === 'lh') {
      // phare : étoile (point et cercle), feu de grande portée
      ctx.fillStyle = pal.text; ctx.strokeStyle = pal.text; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(q[0], q[1], 5.5, 0, 7); ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; line([q[0] + Math.cos(a) * 5.5, q[1] + Math.sin(a) * 5.5], [q[0] + Math.cos(a) * 9, q[1] + Math.sin(a) * 9]); }
    } else if (m.kind === 'port') {
      // feu de port : point (structure) sous la virgule
      ctx.fillStyle = pal.text; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill();
    } else if (m.kind === 'lv') {
      ctx.fillStyle = '#d01c1c'; ctx.strokeStyle = pal.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q[0] - 8, q[1] - 2); ctx.lineTo(q[0] + 8, q[1] - 2); ctx.lineTo(q[0] + 5, q[1] + 3); ctx.lineTo(q[0] - 5, q[1] + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      line([q[0], q[1] - 2], [q[0], q[1] - 10]);
    } else {
      const cols = m.kind in CARD ? CARD[m.kind] : m.kind === 'special' ? ['#f4d000', '#f4d000', '#f4d000'] : m.kind === 'lr' ? ['#d01c1c', '#d01c1c', '#d01c1c'] : m.kind === 'lg' ? ['#16a34a', '#16a34a', '#16a34a'] : ['#d01c1c', '#f2f2f2', '#d01c1c'];
      for (let i = 0; i < 3; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(q[0] - 3, q[1] - 10 + i * 3.4, 6, 3.4); }
      ctx.strokeStyle = pal.text; ctx.lineWidth = 0.8; ctx.strokeRect(q[0] - 3, q[1] - 10, 6, 10.2);
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.8, 0, 7); ctx.fillStyle = pal.text; ctx.fill();
      // voyant : cônes des cardinales, croix des marques spéciales
      ctx.strokeStyle = pal.text; ctx.lineWidth = 1.2;
      if (m.kind === 'special') { line([q[0] - 3, q[1] - 16], [q[0] + 3, q[1] - 12]); line([q[0] + 3, q[1] - 16], [q[0] - 3, q[1] - 12]); }
      else if (m.kind in CARD) {
        const up = (y0: number) => { ctx.beginPath(); ctx.moveTo(q[0] - 3, y0); ctx.lineTo(q[0] + 3, y0); ctx.lineTo(q[0], y0 - 4); ctx.closePath(); ctx.fillStyle = pal.text; ctx.fill(); };
        const dn = (y0: number) => { ctx.beginPath(); ctx.moveTo(q[0] - 3, y0 - 4); ctx.lineTo(q[0] + 3, y0 - 4); ctx.lineTo(q[0], y0); ctx.closePath(); ctx.fillStyle = pal.text; ctx.fill(); };
        if (m.kind === 'N') { up(q[1] - 16); up(q[1] - 11); } else if (m.kind === 'S') { dn(q[1] - 15); dn(q[1] - 11); }
        else if (m.kind === 'E') { up(q[1] - 16); dn(q[1] - 11); } else { dn(q[1] - 16); up(q[1] - 11); }
      }
    }
    ctx.globalAlpha = 1;
    if (S.ecdis.layers.names && ((m.kind !== 'port' && m.kind !== 'lr' && m.kind !== 'lg') || view.range <= 3)) {
      ctx.fillStyle = pal.text;
      ctx.fillText(`${m.approx ? '≈' : ''}${m.name}${m.light ? ' ' + m.light : ''}${m.range ? ' ' + m.range + 'M' : ''}${m.racon ? ' Racon' : ''}`, q[0] + 12, q[1] - 2);
    }
  }
}

function drawRoute(pal: EPal, fs: number): void {
  const r = S.route;
  if (!r || !r.wps.length) return;
  ctx.strokeStyle = pal.route; ctx.fillStyle = pal.route;
  for (let i = 0; i < r.wps.length - 1; i++) {
    ctx.lineWidth = i === r.leg ? 2.6 : 1.6; ctx.setLineDash(i < r.leg ? [6, 5] : []);
    line(toScr(r.wps[i].x, r.wps[i].y), toScr(r.wps[i + 1].x, r.wps[i + 1].y));
  }
  ctx.setLineDash([]);
  if (r.wps.length > 1) {
    const A = r.wps[r.leg], B = r.wps[r.leg + 1], n = vec(brgOf(B.x - A.x, B.y - A.y) + 90, r.xteLim);
    ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.globalAlpha = 0.8;
    for (const sg of [1, -1]) line(toScr(A.x + n.x * sg, A.y + n.y * sg), toScr(B.x + n.x * sg, B.y + n.y * sg));
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // route et distance des segments
    ctx.font = `600 ${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let i = 0; i < r.wps.length - 1; i++) {
      const a = r.wps[i], b = r.wps[i + 1], m = toScr((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.fillText(`${p3(brgOf(b.x - a.x, b.y - a.y))}° ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(1)} NM`, m[0], m[1] - 4);
    }
  }
  ctx.font = `600 ${fs * 0.85}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  r.wps.forEach((p, i) => {
    const q = toScr(p.x, p.y);
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.stroke();
    ctx.fillText(i === 0 ? 'WP0' : `WP${i}`, q[0] + 9, q[1] - 9);
  });
  // points dangereux relevés par la vérification de route
  ctx.strokeStyle = pal.danger; ctx.fillStyle = pal.danger; ctx.lineWidth = 2.2;
  for (const is of S.ecdis.routeIssues) {
    const q = toScr(is.x, is.y);
    line([q[0] - 7, q[1] - 7], [q[0] + 7, q[1] + 7]); line([q[0] - 7, q[1] + 7], [q[0] + 7, q[1] - 7]);
    ctx.fillText(`${Math.max(0, is.depth).toFixed(0)} m`, q[0] + 10, q[1] + 8);
  }
}

function drawTrack(pal: EPal): void {
  const tr = S.ownTrack;
  if (tr.length < 1) return;
  ctx.strokeStyle = pal.own; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4; ctx.setLineDash([2, 3]);
  ctx.beginPath();
  tr.forEach((p, i) => { const q = toScr(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
  const q = toScr(S.own.x, S.own.y); ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.setLineDash([]);
  // repères de temps toutes les 6 min
  ctx.fillStyle = pal.own;
  for (const p of tr) if (Math.round(p.t) % 360 === 0) { const s = toScr(p.x, p.y); ctx.fillRect(s[0] - 1.5, s[1] - 1.5, 3, 3); }
  ctx.globalAlpha = 1;
}

/** Triangle AIS (SN.1/Circ.243) orienté selon le cap (à défaut la route fond). */
function aisTri(q: [number, number], hdg: number, size: number, fill: boolean): void {
  ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(hdg * D2R);
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.5, size * 0.6); ctx.lineTo(-size * 0.5, size * 0.6); ctx.closePath();
  if (fill) ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawTargets(pal: EPal, fs: number): void {
  const L = S.ecdis.layers, vm = S.radar.vecMin / 60;
  ctx.font = `600 ${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const assoc = new Set<number>();
  if (L.arpa) {
    for (const tr of S.tracks) {
      if (!tr.est) continue;
      const at = L.ais ? aisAssociated(tr) : null;
      if (at) { assoc.add(at.id); continue; } // priorité à l'AIS (MSC.192(79) 5.33)
      const q = toScr(tr.est.x, tr.est.y), col = tr.danger ? pal.danger : pal.arpa;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = tr.danger ? 2.4 : 1.4;
      if (tr.state !== 'LOST' && (!tr.danger || !isUnackedDanger(tr.n) || Math.floor(performance.now() / 450) % 2 === 0)) { ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.stroke(); }
      if (tr.state === 'TRK' && tr.est.vok) { const t = trueV(tr), e = toScr(tr.est.x + t.x * vm, tr.est.y + t.y * vm); line(q, e); }
      ctx.fillText(String(tr.n), q[0] + 8, q[1] - 7);
    }
  }
  if (!L.ais) return;
  const o = S.own;
  for (const t of S.targets) {
    if (!t.ais?.rep) continue;
    const p = aisPos(t)!, q = toScr(p.x, p.y);
    if (q[0] < -20 || q[1] < -20 || q[0] > W + 20 || q[1] > H + 20) continue;
    const lost = aisLost(t), r = Math.hypot(p.x - o.x, p.y - o.y), rep = t.ais.rep;
    const tr = S.tracks.find((k) => k.tid === t.id), danger = !!tr && tr.danger && assoc.has(t.id);
    const active = r < 6 || assoc.has(t.id) || (picked?.kind === 'ais' && picked.id === t.id);
    ctx.strokeStyle = danger ? pal.danger : pal.ais; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = danger ? 2.2 : 1.3;
    aisTri(q, rep.hdg, active ? 11 : 8, false);
    if (lost) { line([q[0] - 9, q[1] - 9], [q[0] + 9, q[1] + 9]); line([q[0] - 9, q[1] + 9], [q[0] + 9, q[1] - 9]); continue; }
    if (active) {
      const v = vec(rep.cog, rep.sog * vm), e = toScr(p.x + v.x, p.y + v.y); line(q, e);
      const h = vec(rep.hdg, 1), hp = [q[0] + h.x * 22, q[1] - h.y * 22] as [number, number]; line(q, hp);
    }
    if (tr && assoc.has(t.id)) ctx.fillText(String(tr.n), q[0] + 10, q[1] - 8);
    if (S.ecdis.layers.names && (active || view.range <= 6)) { ctx.fillStyle = pal.dim; ctx.fillText(t.ais.name + (t.type === 'nuc' && t.ais.status.includes('non maître') ? ' · NUC' : ''), q[0] + 10, q[1] + 12); }
  }
}

function drawOwn(pal: EPal, k: number): void {
  const o = S.own, q = toScr(o.x, o.y), Ln = (o.L / 1852) * k;
  ctx.strokeStyle = pal.own; ctx.lineWidth = 1.6;
  // ligne de foi jusqu'au bord
  const hv = vec(o.hdg, view.range * 4); line(q, toScr(o.x + hv.x, o.y + hv.y));
  if (Ln > 14) {
    const L = o.L / 1852, B = L * 0.17;
    const pts = [[0, L / 2], [B / 2, L / 4], [B / 2, -L / 2], [-B / 2, -L / 2], [-B / 2, L / 4]].map(([a, b]) => {
      const f = vec(o.hdg, b), s = vec(o.hdg + 90, a); return toScr(o.x + f.x + s.x, o.y + f.y + s.y);
    });
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.stroke();
  }
  // vecteur route fond / vitesse fond (stabilisé fond : double flèche), repères à la minute
  const T = S.ecdis.look, v = { x: (o.vx * T) / 60, y: (o.vy * T) / 60 }, e = toScr(o.x + v.x, o.y + v.y);
  ctx.lineWidth = 2; line(q, e);
  const b = brgOf(o.vx, o.vy);
  for (const back of [0, 7]) {
    const a1 = vec(b + 155, 1), a2 = vec(b - 155, 1), base = [e[0] - Math.sin(b * D2R) * back, e[1] + Math.cos(b * D2R) * back];
    line([base[0], base[1]], [base[0] + a1.x * 9, base[1] - a1.y * 9]); line([base[0], base[1]], [base[0] + a2.x * 9, base[1] - a2.y * 9]);
  }
  ctx.lineWidth = 1;
  for (let m = 1; m < T; m++) {
    const p = toScr(o.x + (o.vx * m) / 60, o.y + (o.vy * m) / 60), n = vec(b + 90, 1);
    line([p[0] - n.x * 4, p[1] + n.y * 4], [p[0] + n.x * 4, p[1] - n.y * 4]);
  }
}

function drawEbl(pal: EPal, k: number): void {
  const E = S.ecdis, o = S.own, q = toScr(o.x, o.y);
  ctx.strokeStyle = pal.ebl; ctx.lineWidth = 1.3; ctx.setLineDash([8, 5]);
  if (E.ebl !== null) { const v = vec(E.ebl, view.range * 4); line(q, toScr(o.x + v.x, o.y + v.y)); }
  if (E.vrm !== null) { ctx.beginPath(); ctx.arc(q[0], q[1], E.vrm * k, 0, 7); ctx.stroke(); }
  ctx.setLineDash([]);
}

function box(x: number, y: number, lines: string[], pal: EPal, fs: number, align: 'left' | 'right', first?: string): void {
  const lh = fs * 1.3, w = Math.max(...lines.map((s) => ctx.measureText(s).width)) + 12, h = lines.length * lh + 8;
  const x0 = align === 'left' ? x : x - w;
  ctx.fillStyle = pal.hud; ctx.fillRect(x0, y, w, h);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((s, i) => { ctx.fillStyle = i === 0 && first ? first : pal.hudTxt; ctx.fillText(s, x0 + 6, y + 4 + i * lh); });
}

function drawHud(pal: EPal, fs: number): void {
  const o = S.own, E = S.ecdis;
  ctx.font = `600 ${fs}px ui-monospace,Menlo,monospace`;
  const ll = toLL(o.x, o.y), sog = Math.hypot(o.vx, o.vy), cog = sog > 0.2 ? brgOf(o.vx, o.vy) : o.hdg;
  const dep = depthAt(o.x, o.y), z = tssAt(o.x, o.y);
  box(6, 6, [
    'ECDIS — NORD EN HAUT, MOUV. VRAI',
    CHART.name,
    `Échelle ${view.range} NM · contour de sécurité ${E.safety} m`,
    `Anticipation ${E.look} min${view.follow ? '' : ' · CARTE DÉPLACÉE'}`,
  ], pal, fs * 0.92, 'left', pal.text);
  box(W - 6, 6, [
    `${fmtLat(ll.lat)}  ${fmtLon(ll.lon)}`,
    `CAP ${o.hdg.toFixed(1)}°  RF ${cog.toFixed(1)}°  VF ${sog.toFixed(1)} kn`,
    `FONDS ${dep > 200 ? '> 200' : dep.toFixed(0)} m  ${z.name}`,
  ], pal, fs * 0.92, 'right');
  const r = S.route;
  if (r && r.wps.length > 1) {
    const d = legData(r, o.x, o.y);
    box(W - 6, 6 + fs * 5.2, [`WP${r.leg + 1} ${d.dtw.toFixed(1)} NM au ${p3(d.btw)}°`, `XTE ${Math.abs(d.xte).toFixed(2)} NM ${d.xte >= 0 ? 'Td' : 'Bd'}`], pal, fs * 0.92, 'right');
  }
  // bas : avertissement et attribution, lecture curseur
  ctx.font = `${fs * 0.78}px system-ui,sans-serif`;
  box(6, H - fs * 2.6 - 10, ['CARTE SCHÉMATIQUE — NON DESTINÉE À LA NAVIGATION', CHART.attribution], pal, fs * 0.78, 'left', pal.danger);
  if (ecur.x !== null && ecur.y !== null) {
    const p = fromScr(ecur.x, ecur.y), pl = toLL(p.x, p.y), dx = p.x - o.x, dy = p.y - o.y, dc = depthAt(p.x, p.y);
    ctx.font = `600 ${fs * 0.9}px ui-monospace,Menlo,monospace`;
    box(W - 6, H - fs * 4.1 - 10, [
      `CURSEUR ${fmtLat(pl.lat)} ${fmtLon(pl.lon)}`,
      `${n360(brgOf(dx, dy)).toFixed(1)}°T  ${Math.hypot(dx, dy).toFixed(2)} NM  fonds ${dc > 200 ? '> 200' : Math.max(0, dc).toFixed(0)} m`,
      E.ebl !== null || E.vrm !== null ? `EBL ${E.ebl !== null ? E.ebl.toFixed(1) + '°T' : '---'}  VRM ${E.vrm !== null ? E.vrm.toFixed(2) + ' NM' : '---'}` : `Outil : ${E.tool === 'INFO' ? 'info' : E.tool === 'EBL' ? 'EBL/VRM' : 'tracé de route'}`,
    ], pal, fs * 0.9, 'right');
    ctx.strokeStyle = pal.text; ctx.lineWidth = 1;
    line([ecur.x - 10, ecur.y], [ecur.x - 3, ecur.y]); line([ecur.x + 3, ecur.y], [ecur.x + 10, ecur.y]);
    line([ecur.x, ecur.y - 10], [ecur.x, ecur.y - 3]); line([ecur.x, ecur.y + 3], [ecur.x, ecur.y + 10]);
  }
}

// ---------------------------------------------------------------- sélection

/** Objet le plus proche d'un point écran (cible AIS, piste ARPA, marque), à moins de 16 px. */
export function pickAt(px: number, py: number): typeof picked {
  let best: typeof picked = null, bd = 16;
  const test = (x: number, y: number, p: NonNullable<typeof picked>) => { const q = toScr(x, y), d = Math.hypot(q[0] - px, q[1] - py); if (d < bd) { bd = d; best = p; } };
  for (const t of S.targets) { const p = aisPos(t); if (p) test(p.x, p.y, { kind: 'ais', id: t.id }); }
  for (const tr of S.tracks) if (tr.est) test(tr.est.x, tr.est.y, { kind: 'arpa', id: tr.n });
  for (const m of CHART.marks) test(m.x, m.y, { kind: 'mark', id: m.id });
  test(S.own.x, S.own.y, { kind: 'own', id: 0 });
  return best;
}
export function setPicked(p: typeof picked): void { picked = p; }

/** Texte d'information sur l'objet sélectionné (panneau ECDIS). */
export function pickedInfo(): string[] {
  const p = picked, o = S.own;
  if (!p) return [];
  const rb = (x: number, y: number) => `${n360(brgOf(x - o.x, y - o.y)).toFixed(1)}°T, ${Math.hypot(x - o.x, y - o.y).toFixed(2)} NM`;
  if (p.kind === 'ais') {
    const t = S.targets.find((x) => x.id === p.id);
    if (!t?.ais?.rep) return ['Cible AIS disparue'];
    const a = t.ais, r = a.rep!, pos = aisPos(t)!, ll = toLL(pos.x, pos.y);
    return [`AIS classe ${a.cls} — ${a.name}`, `MMSI ${a.mmsi}`, `Statut : ${a.status}`, `Position ${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`,
      `RF ${r.cog.toFixed(0)}°  VF ${r.sog.toFixed(1)} kn  cap ${r.hdg.toFixed(0)}°`, `Relèvement / distance : ${rb(pos.x, pos.y)}`,
      `Dernier message il y a ${Math.round(S.t - r.t)} s${aisLost(t) ? ' — CIBLE AIS PERDUE' : ''}`, `Zone : ${tssAt(pos.x, pos.y).name}`];
  }
  if (p.kind === 'arpa') {
    const tr = S.tracks.find((x) => x.n === p.id);
    if (!tr?.est) return ['Piste radar annulée'];
    return [`Piste radar ${tr.n} (${tr.state})`, `Relèvement / distance : ${rb(tr.est.x, tr.est.y)}`, tr.state === 'TRK' ? `CPA ${tr.cpa.toFixed(2)} NM  TCPA ${(tr.tcpa / 60).toFixed(1)} min` : 'CPA/TCPA en cours d’acquisition',
      tr.state === 'TRK' ? `Route ${p3(tr.crs)}°  vitesse ${tr.spd.toFixed(1)} kn` : ''];
  }
  if (p.kind === 'mark') {
    const m = CHART.marks.find((x) => x.id === p.id);
    if (!m) return [];
    const kinds: Record<string, string> = { N: 'cardinale Nord', S: 'cardinale Sud', E: 'cardinale Est', W: 'cardinale Ouest', special: 'marque spéciale', safe: 'eaux saines', lv: 'bateau-feu', light: 'bouée lumineuse', lh: 'phare', port: 'feu de port', lr: 'bouée latérale bâbord', lg: 'bouée latérale tribord' };
    return [`${m.name} — ${kinds[m.kind]}`, `${fmtLat(m.lat)} ${fmtLon(m.lon)}${m.approx ? ' (position approchée)' : ''}`, m.light ? `Feu ${m.light}${m.range ? `, portée ${m.range} M` : ''}` : m.range ? `Portée ${m.range} M (caractère non renseigné)` : '', `Relèvement / distance : ${rb(m.x, m.y)}`, `Source : ${m.src}`];
  }
  return ['Navire porteur', `${fmtLat(toLL(o.x, o.y).lat)} ${fmtLon(toLL(o.x, o.y).lon)}`, `Tirant d'eau ${ownDraft(o).toFixed(1)} m`];
}

/** Vrai si le point écran est à terre (pour refuser un point tournant à terre). */
export function scrOnLand(px: number, py: number): boolean {
  const p = fromScr(px, py);
  return CHART.land.some((r) => inPoly(r, p.x, p.y));
}
