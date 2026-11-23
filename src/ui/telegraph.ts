/**
 * Transmetteur d'ordres (« chadburn ») vertical de l'onglet Barre, aligné sur la liste des allures :
 * allures avant en haut (vert), STOP au milieu, allures arrière en bas (rouge), comme l'indicateur de barre.
 * Manette fine réglée au clic ou au glisser ; un repère jaune répète le régime réel de l'hélice (réponse machine),
 * qui rejoint l'ordre avec le temps de réaction du moteur (et 20 s d'attente au renversement de marche).
 */
import { S, logE } from '../core/state';
import { TELE } from '../core/data';
import { clamp } from '../core/util';
import { nSea } from '../sim/physics';

let cv: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D, drag = false;
/** Ordonnée (px, repère du canevas) du centre de chaque allure, indexée comme TELE. */
let rows: number[] = [];

/** Centres des boutons de la liste, pour aligner le transmetteur sur elle. */
function layoutRows(): void {
  const top = cv!.getBoundingClientRect().top;
  rows = TELE.map((_, i) => {
    const b = document.querySelector<HTMLElement>(`#tele button[data-v="${i}"]`)?.getBoundingClientRect();
    return b ? b.top + b.height / 2 - top : 0;
  });
}

export function initTelegraph(c: HTMLCanvasElement): void {
  cv = c; ctx = c.getContext('2d')!;
  const pick = (ev: PointerEvent): number => {
    const y = ev.clientY - c.getBoundingClientRect().top;
    let best = S.own.tele, bd = Infinity;
    rows.forEach((r, i) => { if (Math.abs(r - y) < bd) { bd = Math.abs(r - y); best = i; } });
    return best;
  };
  let start = 0;
  c.addEventListener('pointerdown', (ev) => { drag = true; start = S.own.tele; c.setPointerCapture(ev.pointerId); S.own.tele = pick(ev); });
  c.addEventListener('pointermove', (ev) => { if (drag) S.own.tele = pick(ev); });
  const end = () => { if (!drag) return; drag = false; if (S.own.tele !== start) logE(`Machine : ${TELE[S.own.tele].n}`); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

/** Ordonnée correspondant à une fraction de régime (interpolation entre les allures). */
function yOf(f: number): number {
  const fs = TELE.map((t) => t.f);
  if (f <= fs[0]) return rows[0];
  for (let i = 0; i < fs.length - 1; i++) if (f <= fs[i + 1]) return rows[i] + ((rows[i + 1] - rows[i]) * (f - fs[i])) / (fs[i + 1] - fs[i]);
  return rows[rows.length - 1];
}

export function drawTelegraph(): void {
  if (!cv || cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  layoutRows();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const o = S.own, n = rows.length;
  ctx.globalAlpha = document.body.classList.contains('pal-night') ? 0.55 : 1;
  const tx = Math.min(70, w * 0.28), tw = 16; // axe et largeur de la glissière
  // segments colorés : vert (avant), gris (stop), rouge (arrière) ; l'allure ordonnée est éclairée
  for (let i = 0; i < n; i++) {
    const yA = i === n - 1 ? rows[i] - (rows[i - 1] - rows[i]) / 2 : (rows[i] + rows[i + 1]) / 2;
    const yB = i === 0 ? rows[0] + (rows[0] - rows[1]) / 2 : (rows[i] + rows[i - 1]) / 2;
    const f = TELE[i].f, k = i === o.tele ? 1 : 0.4, base = f > 0 ? [37, 181, 74] : f < 0 ? [224, 36, 36] : [150, 150, 150];
    ctx.fillStyle = `rgb(${base.map((c) => Math.round(c * k)).join(',')})`;
    ctx.fillRect(tx - tw / 2, Math.min(yA, yB) + 1, tw, Math.abs(yB - yA) - 2);
    ctx.strokeStyle = '#6d757c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx - tw / 2 - 6, rows[i]); ctx.lineTo(tx - tw / 2 - 1, rows[i]); ctx.stroke();
  }
  // fente de la glissière
  ctx.fillStyle = '#0b0d0f'; ctx.fillRect(tx - 2, rows[n - 1] - 4, 4, rows[0] - rows[n - 1] + 8);
  // libellés AV / AR
  ctx.font = '800 13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4fd872'; ctx.fillText('AV', tx - tw / 2 - 22, rows[n - 1] + 6);
  ctx.fillStyle = '#ff5a5a'; ctx.fillText('AR', tx - tw / 2 - 22, rows[0] - 6);
  ctx.fillStyle = '#c9c9c9'; ctx.font = '700 11px system-ui,sans-serif'; ctx.fillText('STOP', tx - tw / 2 - 22, rows[TELE.findIndex((t) => t.f === 0)]);
  // réponse machine : repère jaune sur le régime réel
  const ns = nSea(o.ship.mmg), ry = yOf(clamp(o.n / ns, -0.6, 1.1));
  ctx.fillStyle = '#ffd21f';
  ctx.beginPath(); ctx.moveTo(tx - tw / 2 - 1, ry); ctx.lineTo(tx - tw / 2 - 11, ry - 6); ctx.lineTo(tx - tw / 2 - 11, ry + 6); ctx.closePath(); ctx.fill();
  // manette fine : bras incliné partant de la fente, pommeau
  const ly = rows[o.tele], kx = tx + Math.min(70, w * 0.3), ky = ly - 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx + 1, ly + 2); ctx.lineTo(kx + 1, ky + 2); ctx.stroke();
  ctx.strokeStyle = '#c3c9ce'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tx, ly); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.fillStyle = '#7d858c'; ctx.fillRect(tx - tw / 2 - 2, ly - 3, tw + 4, 6);
  const g = ctx.createRadialGradient(kx - 2, ky - 2, 1, kx, ky, 8);
  g.addColorStop(0, '#f6f6f6'); g.addColorStop(1, '#5f676e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, 7, 0, 7); ctx.fill();
  // lecture : ordre, régime, renversement
  const xr = kx + 18, f = TELE[o.tele].f;
  ctx.textAlign = 'left';
  ctx.fillStyle = f > 0 ? '#4fd872' : f < 0 ? '#ff5a5a' : '#f2f2f2'; ctx.font = '700 13px system-ui,sans-serif';
  ctx.fillText(TELE[o.tele].n.toUpperCase(), xr, ly - 10);
  ctx.fillStyle = '#ffd21f'; ctx.font = '600 12px ui-monospace,Menlo,monospace';
  ctx.fillText(`${Math.round(o.n * 60)} tr/min`, xr, ly + 7);
  if (o.revUntil > 0) { ctx.fillStyle = '#f2f2f2'; ctx.fillText(`renversement ${Math.max(0, Math.ceil(o.revUntil - S.t))} s`, xr, ly + 22); }
  ctx.globalAlpha = 1;
}
