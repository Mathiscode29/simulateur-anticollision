/**
 * Débrief : rejeu de l'exercice enregistré (vérité terrain).
 *
 * - Tracé (haut) : mouvement vrai nord en haut sur fond de carte, ou mouvement relatif centré sur le porteur
 *   (les routes relatives rectilignes montrent d'un coup d'œil le relèvement constant).
 *   Sillages parcourus, routes complètes en grisé, vecteurs 6 min, repères horaires, ordres à la barre et à la machine,
 *   situation sélectionnée : ligne de visée, point de CPA prévu.
 * - Graphe (bas) : distance de chaque navire en rencontre au cours du temps, limite CPA, moments clés colorés ;
 *   un clic ou un glissé déplace le curseur de temps.
 * - Commentaire : le moment clé courant s'affiche sur le tracé ; le rejeu peut s'arrêter seul aux moments importants.
 */
import { S } from '../core/state';
import { D2R, brgOf, clamp, cpaOf, K2N, n360, p3 } from '../core/util';
import { CHART } from '../sim/chart';
import { buildDebrief, fmtT, frameAt, relOf, type Debrief, type RecFrame } from '../sim/debrief';
import { EPAL } from './ecdis';

export const RP = {
  d: null as Debrief | null,
  t: 0, playing: false, speed: 30, mode: 'TRUE' as 'TRUE' | 'REL', focus: null as number | null,
  autoPause: true, view: { cx: 0, cy: 0, k: 0, fit: true }, lastKey: -1,
};
const COLS = ['#ff6b5b', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8', '#ff9f43', '#4dd0e1', '#f06292'];

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, W = 0, H = 0, DPR = 1;

export function initDebrief(canvas: HTMLCanvasElement): void {
  cv = canvas; ctx = canvas.getContext('2d')!;
  new ResizeObserver(resize).observe(cv); resize();
  let drag: { x: number; y: number; graph: boolean; moved: boolean } | null = null;
  const pos = (e: PointerEvent | WheelEvent | MouseEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => { const p = pos(e); drag = { ...p, graph: p.y > plotH(), moved: false }; cv.setPointerCapture(e.pointerId); if (drag.graph) seekGraph(p.x); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pos(e);
    if (drag.graph) { seekGraph(p.x); return; }
    if (Math.hypot(p.x - drag.x, p.y - drag.y) > 3 || drag.moved) {
      RP.view.fit = false; RP.view.cx -= (p.x - drag.x) / RP.view.k; RP.view.cy += (p.y - drag.y) / RP.view.k;
      drag = { ...drag, x: p.x, y: p.y, moved: true };
    }
  });
  cv.addEventListener('pointerup', (e) => { const p = pos(e); if (drag && !drag.graph && !drag.moved) pickShip(p.x, p.y); drag = null; });
  cv.addEventListener('dblclick', () => { RP.view.fit = true; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    if (p.y > plotH()) return;
    const w = toW(p.x, p.y), f = e.deltaY < 0 ? 1.25 : 0.8;
    RP.view.fit = false; RP.view.k *= f;
    RP.view.cx = w.x - (p.x - W / 2) / RP.view.k; RP.view.cy = w.y + (p.y - plotH() / 2) / RP.view.k;
  }, { passive: false });
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1; W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
}

/** Prépare le débrief (après la fin de l'exercice). */
export function openDebrief(): boolean {
  RP.d = buildDebrief();
  if (!RP.d) return false;
  RP.t = RP.d.t0; RP.playing = false; RP.view.fit = true; RP.lastKey = -1;
  RP.focus = RP.d.enc.length ? [...RP.d.enc].sort((a, b) => a.minR - b.minR)[0].tid : null;
  return true;
}

// ---------------------------------------------------------------- lecture

let lastNow = 0;
function advance(): void {
  const now = performance.now(), dt = Math.min(0.1, (now - (lastNow || now)) / 1000);
  lastNow = now;
  const d = RP.d;
  if (!d || !RP.playing) return;
  const nt = Math.min(d.t1, RP.t + dt * RP.speed);
  if (RP.autoPause) {
    const k = d.keys.find((x) => x.t > RP.t && x.t <= nt && (x.lvl === 'warn' || x.lvl === 'bad' || x.kind === 'key'));
    if (k) { RP.t = k.t; RP.playing = false; return; }
  }
  RP.t = nt;
  if (RP.t >= d.t1) RP.playing = false;
}
export function togglePlay(): void { if (!RP.d) return; if (RP.t >= RP.d.t1) RP.t = RP.d.t0; RP.playing = !RP.playing; }
export function seek(t: number): void { if (RP.d) RP.t = clamp(t, RP.d.t0, RP.d.t1); }
export function stepKey(dir: 1 | -1): void {
  const d = RP.d;
  if (!d) return;
  RP.playing = false;
  const k = dir > 0 ? d.keys.find((x) => x.t > RP.t + 0.5) : [...d.keys].reverse().find((x) => x.t < RP.t - 0.5);
  if (k) { RP.t = k.t; if (k.tid !== undefined) RP.focus = k.tid; } else RP.t = dir > 0 ? d.t1 : d.t0;
}
/** Moment clé courant : le dernier atteint, s'il date de moins de 90 s. */
export function currentKey(): number {
  const d = RP.d;
  if (!d) return -1;
  let i = -1;
  d.keys.forEach((k, j) => { if (k.t <= RP.t + 0.5) i = j; });
  return i >= 0 && RP.t - d.keys[i].t < 90 ? i : -1;
}

// ---------------------------------------------------------------- géométrie de l'écran

const plotH = () => Math.round(H * 0.68);
function toS(x: number, y: number): [number, number] { return [W / 2 + (x - RP.view.cx) * RP.view.k, plotH() / 2 - (y - RP.view.cy) * RP.view.k]; }
function toW(px: number, py: number): { x: number; y: number } { return { x: RP.view.cx + (px - W / 2) / RP.view.k, y: RP.view.cy - (py - plotH() / 2) / RP.view.k }; }

/** Ensemble des navires à tracer : ceux en rencontre et ceux passés à moins de 6 NM. */
function shipsOfInterest(d: Debrief): number[] {
  const ids = new Set<number>(d.enc.map((e) => e.tid));
  for (const f of d.frames) for (const s of f.s) if (Math.hypot(s.x - f.o.x, s.y - f.o.y) < 6) ids.add(s.id);
  return [...ids];
}
let ids: number[] = [], idsFor: Debrief | null = null;
/** Sillages précalculés par navire : indice d'image et position (évite de reparcourir les images à chaque affichage). */
let trk: Record<number, { i: number; x: number; y: number }[]> = {};
function prepare(d: Debrief): void {
  ids = shipsOfInterest(d); idsFor = d; trk = {};
  for (const id of ids) trk[id] = [];
  d.frames.forEach((f, i) => { for (const s of f.s) if (trk[s.id]) trk[s.id].push({ i, x: s.x, y: s.y }); });
}
const colorOf = (tid: number): string => { const i = RP.d!.enc.findIndex((e) => e.tid === tid); return i >= 0 ? COLS[i % COLS.length] : '#8a98a3'; };

/** Coordonnées tracées : vraies, ou relatives au porteur en mode relatif. */
function P(f: RecFrame, x: number, y: number): [number, number] { return RP.mode === 'REL' ? toS(x - f.o.x, y - f.o.y) : toS(x, y); }

function fit(d: Debrief): void {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const f of d.frames) {
    if (RP.mode === 'REL') { for (const s of f.s) if (ids.includes(s.id) && Math.hypot(s.x - f.o.x, s.y - f.o.y) < 8) add(s.x - f.o.x, s.y - f.o.y); add(0, 0); }
    else { add(f.o.x, f.o.y); for (const s of f.s) if (ids.includes(s.id) && Math.hypot(s.x - f.o.x, s.y - f.o.y) < 8) add(s.x, s.y); }
  }
  const pw = Math.max(1, x1 - x0), ph = Math.max(1, y1 - y0);
  RP.view.k = Math.min((W * 0.9) / pw, (plotH() * 0.86) / ph);
  RP.view.cx = (x0 + x1) / 2; RP.view.cy = (y0 + y1) / 2;
}

// ---------------------------------------------------------------- dessin

export function drawDebrief(): void {
  advance();
  if (!W || !H) return;
  const d = RP.d, pal = EPAL[S.radar.palette];
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = pal.deep; ctx.fillRect(0, 0, W, H);
  if (!d) {
    ctx.fillStyle = pal.text; ctx.font = '14px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Terminez un exercice (onglet Bilan) pour le revoir ici.', W / 2, H / 2);
    return;
  }
  if (idsFor !== d) prepare(d);
  if (RP.view.fit) fit(d);
  const f = frameAt(d, RP.t), fs = clamp(W / 95, 10, 13);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, plotH()); ctx.clip();
  if (RP.mode === 'TRUE') background(pal); else relGrid(pal, fs);
  tracks(d, f, pal, fs);
  focusLine(f, pal, fs);
  ships(f, pal, fs);
  commentary(d, pal, fs);
  ctx.restore();
  graph(d, pal, fs);
}

function background(pal: typeof EPAL.DAY): void {
  ctx.lineWidth = 1;
  for (const r of CHART.land) {
    ctx.beginPath(); r.forEach((p, i) => { const q = toS(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
    ctx.fillStyle = pal.land; ctx.fill(); ctx.strokeStyle = pal.coast; ctx.stroke();
  }
  ctx.strokeStyle = pal.mag; ctx.globalAlpha = 0.6;
  for (const z of CHART.zones) { ctx.beginPath(); z.poly.forEach((p, i) => { const q = toS(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); }
  ctx.setLineDash([8, 6]);
  for (const l of CHART.lanes) { ctx.beginPath(); l.poly.forEach((p, i) => { const q = toS(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // bancs (emprise schématique en gélule)
  ctx.strokeStyle = pal.vs; ctx.globalAlpha = 0.55; ctx.lineCap = 'round';
  for (const b of CHART.banks) {
    const h = Math.max(0, b.len / 2 - b.wid / 2), u = Math.sin(b.orient * D2R), v = Math.cos(b.orient * D2R);
    const p = toS(b.x - u * h, b.y - v * h), q = toS(b.x + u * h, b.y + v * h);
    ctx.lineWidth = Math.max(3, b.wid * RP.view.k); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineWidth = 1;
  // route prévue
  const r = S.route;
  if (r && r.wps.length > 1) {
    ctx.strokeStyle = pal.route; ctx.setLineDash([10, 6]); ctx.lineWidth = 1.5; ctx.beginPath();
    r.wps.forEach((p, i) => { const q = toS(p.x, p.y); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]);
  }
  // échelle
  scaleBar(pal);
}

function scaleBar(pal: typeof EPAL.DAY): void {
  const nm = [0.5, 1, 2, 5, 10].find((v) => v * RP.view.k > 60) ?? 10, x = 14, y = plotH() - 16;
  ctx.strokeStyle = pal.text; ctx.fillStyle = pal.text; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nm * RP.view.k, y); ctx.stroke();
  ctx.font = '11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.fillText(`${nm} NM`, x, y - 5);
}

function relGrid(pal: typeof EPAL.DAY, fs: number): void {
  const c = toS(0, 0);
  ctx.strokeStyle = pal.contour; ctx.fillStyle = pal.dim; ctx.lineWidth = 1; ctx.font = `${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left';
  for (let r = 1; r <= 12; r++) {
    const R = r * RP.view.k;
    if (R > Math.hypot(W, plotH())) break;
    ctx.globalAlpha = r % 2 ? 0.35 : 0.6; ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    if (r % 2 === 0 || RP.view.k > 60) ctx.fillText(`${r} NM`, c[0] + R * 0.71 + 3, c[1] - R * 0.71);
  }
  ctx.strokeStyle = pal.danger; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(c[0], c[1], S.radar.cpaLim * RP.view.k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = pal.danger; ctx.fillText(`CPA limite ${S.radar.cpaLim} NM`, c[0] + S.radar.cpaLim * RP.view.k + 4, c[1] + 12);
  ctx.fillStyle = pal.dim; ctx.textAlign = 'center'; ctx.fillText('N', c[0], 14);
}

function tracks(d: Debrief, f: RecFrame, pal: typeof EPAL.DAY, fs: number): void {
  const F = d.frames, n = F.findIndex((x) => x.t > RP.t), cut = n < 0 ? F.length : n;
  const path = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); };
  // porteur (mouvement vrai seulement : en relatif il reste au centre)
  if (RP.mode === 'TRUE') {
    const all = F.map((x) => toS(x.o.x, x.o.y));
    ctx.strokeStyle = pal.own; ctx.globalAlpha = 0.25; ctx.lineWidth = 1.5; path(all);
    ctx.globalAlpha = 1; ctx.lineWidth = 2.5; path([...all.slice(0, cut), toS(f.o.x, f.o.y)]);
    // repères horaires toutes les 6 min
    ctx.fillStyle = pal.own; ctx.font = `${fs * 0.78}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left';
    for (const x of F) if (Math.round(x.t) % 360 === 0 && x.t > 0) { const q = toS(x.o.x, x.o.y); ctx.fillRect(q[0] - 2, q[1] - 2, 4, 4); ctx.fillText(`${Math.round(x.t / 60)}'`, q[0] + 5, q[1] + 4); }
    // ordres à la barre et à la machine
    for (const ev of d.ev) {
      if (ev.kind !== 'helm' && ev.kind !== 'engine') continue;
      const g = frameAt(d, ev.t), q = toS(g.o.x, g.o.y);
      ctx.fillStyle = ev.kind === 'helm' ? '#ffcf33' : '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0] + 5, q[1]); ctx.lineTo(q[0], q[1] + 6); ctx.lineTo(q[0] - 5, q[1]); ctx.fill();
    }
  }
  for (const id of ids) {
    const col = colorOf(id), tk = trk[id] ?? [];
    if (!tk.length) continue;
    const pts = tk.map((p) => P(F[p.i], p.x, p.y));
    const foc = RP.focus === id;
    ctx.strokeStyle = col; ctx.globalAlpha = 0.22; ctx.lineWidth = 1.2; path(pts);
    const s = f.s.find((z) => z.id === id), done = pts.filter((_, j) => tk[j].i < cut);
    if (s) done.push(P(f, s.x, s.y));
    ctx.globalAlpha = 1; ctx.lineWidth = foc ? 2.8 : 1.6; path(done);
  }
  ctx.globalAlpha = 1;
}

function shipSym(q: [number, number], hdg: number, col: string, len: number): void {
  ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(hdg * D2R);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(len * 0.38, len * 0.55); ctx.lineTo(-len * 0.38, len * 0.55); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function ships(f: RecFrame, pal: typeof EPAL.DAY, fs: number): void {
  const vm = 6 / 60;
  ctx.font = `600 ${fs * 0.85}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left';
  for (const id of ids) {
    const s = f.s.find((z) => z.id === id);
    if (!s) continue;
    const col = colorOf(id), q = P(f, s.x, s.y);
    const vx = RP.mode === 'REL' ? s.vx - f.o.vx : s.vx, vy = RP.mode === 'REL' ? s.vy - f.o.vy : s.vy;
    const e = RP.mode === 'REL' ? toS(s.x - f.o.x + vx * vm, s.y - f.o.y + vy * vm) : toS(s.x + vx * vm, s.y + vy * vm);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    shipSym(q, s.hdg, col, Math.max(8, ((RP.d!.ships[id]?.L ?? 100) / 1852) * RP.view.k));
    const sh = RP.d!.ships[id], tr = S.tracks.find((k) => k.tid === id);
    ctx.fillStyle = col;
    ctx.fillText(`${tr ? tr.n + ' · ' : ''}${sh?.vname ?? ''}${s.type === 'nuc' ? ' (NUC)' : ''}`, q[0] + 10, q[1] - 8);
  }
  // porteur
  const o = f.o, q = RP.mode === 'REL' ? toS(0, 0) : toS(o.x, o.y);
  const e = RP.mode === 'REL' ? q : toS(o.x + o.vx * vm, o.y + o.vy * vm);
  ctx.strokeStyle = pal.own; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  shipSym(q, o.hdg, pal.own, Math.max(10, (S.own.L / 1852) * RP.view.k));
  ctx.strokeStyle = pal.own; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], 13, 0, 7); ctx.stroke();
}

/** Situation sélectionnée : ligne de visée, relèvement / distance, points de CPA prévus (vérité terrain). */
function focusLine(f: RecFrame, pal: typeof EPAL.DAY, fs: number): void {
  if (RP.focus === null) return;
  const s = f.s.find((z) => z.id === RP.focus);
  if (!s) return;
  const p = relOf(f, s.id)!, a = RP.mode === 'REL' ? toS(0, 0) : toS(f.o.x, f.o.y), b = P(f, s.x, s.y), col = colorOf(s.id);
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
  if (p.tcpa > 0 && p.tcpa < 3600) {
    const T = p.tcpa;
    const oc = RP.mode === 'REL' ? toS(0, 0) : toS(f.o.x + f.o.vx * K2N * T, f.o.y + f.o.vy * K2N * T);
    const tc = RP.mode === 'REL' ? toS(s.x - f.o.x + (s.vx - f.o.vx) * K2N * T, s.y - f.o.y + (s.vy - f.o.vy) * K2N * T) : toS(s.x + s.vx * K2N * T, s.y + s.vy * K2N * T);
    ctx.strokeStyle = pal.danger; ctx.lineWidth = 1.2;
    for (const c of [oc, tc]) { ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(oc[0], oc[1]); ctx.lineTo(tc[0], tc[1]); ctx.stroke();
    ctx.fillStyle = pal.danger; ctx.font = `600 ${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'left';
    ctx.fillText(`CPA ${p.cpa.toFixed(2)} NM dans ${(T / 60).toFixed(1)} min`, Math.max(oc[0], tc[0]) + 8, (oc[1] + tc[1]) / 2 + 16);
  }
  ctx.fillStyle = col; ctx.font = `600 ${fs * 0.85}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center';
  ctx.fillText(`${p3(p.brg)}° · ${p.r.toFixed(2)} NM`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 6);
}

function wrap(text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}

function commentary(d: Debrief, pal: typeof EPAL.DAY, fs: number): void {
  ctx.font = `600 ${fs}px ui-monospace,Menlo,monospace`;
  const f = frameAt(d, RP.t);
  const head = `${fmtT(RP.t)} · ${RP.mode === 'TRUE' ? 'MOUVEMENT VRAI' : 'MOUVEMENT RELATIF'} · cap ${f.o.hdg.toFixed(0)}° · ${f.o.stw.toFixed(1)} kn${RP.playing ? ` · ×${RP.speed}` : ' · pause'}`;
  ctx.fillStyle = pal.hud; ctx.fillRect(8, 8, ctx.measureText(head).width + 16, fs + 10);
  ctx.fillStyle = pal.hudTxt; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(head, 16, 13);
  const i = currentKey();
  if (i >= 0) {
    const k = d.keys[i];
    ctx.font = `${fs}px system-ui,sans-serif`;
    const lines = wrap(`${fmtT(k.t)} — ${k.text}`, Math.min(W - 40, 720));
    const h = lines.length * (fs + 5) + 12, y = fs + 26;
    ctx.fillStyle = pal.hud; ctx.fillRect(W / 2 - Math.min(W - 40, 720) / 2 - 8, y, Math.min(W - 40, 720) + 16, h);
    ctx.fillStyle = k.lvl === 'bad' ? pal.danger : k.lvl === 'warn' ? '#e8a317' : k.lvl === 'ok' ? '#3fbf6f' : pal.ebl;
    ctx.fillRect(W / 2 - Math.min(W - 40, 720) / 2 - 8, y, 4, h);
    ctx.fillStyle = pal.hudTxt; ctx.textAlign = 'left';
    lines.forEach((l, j) => ctx.fillText(l, W / 2 - Math.min(W - 40, 720) / 2 + 4, y + 6 + j * (fs + 5)));
  }
  ctx.textBaseline = 'alphabetic';
}

const LV: Record<string, string> = { bad: '#e5484d', warn: '#e8a317', ok: '#3fbf6f', info: '#5aa9e6' };

function graph(d: Debrief, pal: typeof EPAL.DAY, fs: number): void {
  const y0 = plotH() + 1, gh = H - y0, L = 46, R = W - 14, T = y0 + 40, B = H - 30;
  ctx.fillStyle = pal.hud; ctx.fillRect(0, y0, W, gh);
  ctx.strokeStyle = pal.contour; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
  const maxR = 6, X = (t: number) => L + ((t - d.t0) / Math.max(1, d.t1 - d.t0)) * (R - L), Y = (r: number) => B - (Math.min(r, maxR) / maxR) * (B - T);
  ctx.font = `${fs * 0.8}px ui-monospace,Menlo,monospace`; ctx.fillStyle = pal.dim; ctx.textAlign = 'right';
  ctx.fillText('NM', L - 6, T - 8);
  for (let r = 0; r <= maxR; r += 1) { const y = Y(r); ctx.strokeStyle = pal.grid; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.fillText(String(r), L - 6, y + 4); }
  ctx.textAlign = 'center';
  const step = d.t1 - d.t0 > 3600 ? 600 : d.t1 - d.t0 > 1200 ? 300 : 120;
  for (let t = Math.ceil(d.t0 / step) * step; t <= d.t1; t += step) ctx.fillText(`${Math.round(t / 60)}'`, X(t), B + 14);
  // limite CPA et 0,5 NM
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = pal.danger; ctx.beginPath(); ctx.moveTo(L, Y(S.radar.cpaLim)); ctx.lineTo(R, Y(S.radar.cpaLim)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = pal.danger; ctx.textAlign = 'left'; ctx.fillText(`CPA limite ${S.radar.cpaLim} NM`, L + 4, Y(S.radar.cpaLim) - 3);
  // distances
  d.enc.forEach((e) => {
    const col = colorOf(e.tid), foc = RP.focus === e.tid;
    ctx.strokeStyle = col; ctx.lineWidth = foc ? 2.4 : 1.2; ctx.globalAlpha = foc ? 1 : 0.7;
    ctx.beginPath(); e.series.forEach((p, i) => { const x = X(p.t), y = Y(p.r); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    if (foc) {
      // CPA prévu (pointillé) : montre quand la situation devient dangereuse et l'effet des manœuvres
      ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); let st = false;
      for (const p of e.series) { if (p.tcpa <= 0) { st = false; continue; } const x = X(p.t), y = Y(p.cpa); if (st) ctx.lineTo(x, y); else { ctx.moveTo(x, y); st = true; } }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(e.tMin), Y(e.minR), 3, 0, 7); ctx.fill();
  });
  ctx.lineWidth = 1;
  // moments clés
  for (const k of d.keys) { ctx.fillStyle = LV[k.lvl]; ctx.fillRect(X(k.t) - 1.5, B + 18, 3, 8); }
  for (const ev of d.ev) if (ev.kind === 'helm' || ev.kind === 'engine') { ctx.fillStyle = ev.kind === 'helm' ? '#ffcf33' : '#ff8a3d'; ctx.fillRect(X(ev.t) - 1, T - 10, 2, 6); }
  // curseur
  const x = X(RP.t);
  ctx.strokeStyle = pal.text; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, T - 12); ctx.lineTo(x, B + 26); ctx.stroke();
  ctx.fillStyle = pal.text; ctx.textAlign = x > W - 80 ? 'right' : 'left'; ctx.font = `600 ${fs * 0.85}px ui-monospace,Menlo,monospace`;
  ctx.fillText(fmtT(RP.t), x + (x > W - 80 ? -4 : 4), T - 14);
  ctx.fillStyle = pal.dim; ctx.textAlign = 'left'; ctx.font = `${fs * 0.78}px system-ui,sans-serif`;
  ctx.fillText('Distance des navires en rencontre (trait) · CPA prévu de la situation suivie (pointillé) · ordres barre (jaune) et machine (orange) en haut · moments clés en bas', L, y0 + 14);
  geom = { L, R, t0: d.t0, t1: d.t1 };
}
let geom = { L: 0, R: 1, t0: 0, t1: 1 };
function seekGraph(px: number): void { RP.playing = false; seek(geom.t0 + ((px - geom.L) / (geom.R - geom.L)) * (geom.t1 - geom.t0)); }

function pickShip(px: number, py: number): void {
  const d = RP.d;
  if (!d) return;
  const f = frameAt(d, RP.t);
  let best: number | null = null, bd = 18;
  for (const id of ids) { const s = f.s.find((z) => z.id === id); if (!s) continue; const q = P(f, s.x, s.y), dd = Math.hypot(q[0] - px, q[1] - py); if (dd < bd) { bd = dd; best = id; } }
  if (best !== null) RP.focus = best;
}

// ---------------------------------------------------------------- panneau

/** Situation à l'instant du rejeu : navires à moins de 12 NM, triés par TCPA. */
export function situationRows(): { id: number; name: string; brg: number; r: number; cpa: number; tcpa: number; role: string; col: string }[] {
  const d = RP.d;
  if (!d) return [];
  const f = frameAt(d, RP.t), rows = [];
  for (const s of f.s) {
    const rx = s.x - f.o.x, ry = s.y - f.o.y, r = Math.hypot(rx, ry);
    if (r > 12) continue;
    const c = cpaOf(rx, ry, (s.vx - f.o.vx) * K2N, (s.vy - f.o.vy) * K2N), e = d.enc.find((x) => x.tid === s.id), tr = S.tracks.find((k) => k.tid === s.id);
    rows.push({ id: s.id, name: `${tr ? tr.n + ' · ' : ''}${d.ships[s.id]?.vname ?? '?'}${s.type === 'nuc' ? ' (NUC)' : ''}`, brg: n360(brgOf(rx, ry)), r, cpa: c.cpa, tcpa: c.tcpa, role: e && RP.t >= e.t0 ? e.roleTxt : '', col: colorOf(s.id) });
  }
  return rows.sort((a, b) => (a.tcpa > 0 ? a.tcpa : 1e9) - (b.tcpa > 0 ? b.tcpa : 1e9));
}


