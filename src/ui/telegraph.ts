/**
 * Transmetteur d'ordres de l'onglet Barre, inspiré des manettes de passerelle à tambour gradué :
 * échelle verticale de −10 (arrière toute) à +10 (allure mer), avant en haut sur fond vert, arrière en bas sur
 * fond rouge, poignée noire effilée à bague blanche et index rouge. Les allures de la liste sont placées à leur cran
 * de l'échelle. Réglage au clic ou au glisser (cran le plus proche) ; un repère jaune répète le régime réel de
 * l'hélice (réponse machine), qui rejoint l'ordre avec le temps de réaction du moteur.
 */
import { S, logE } from '../core/state';
import { TELE } from '../core/data';
import { clamp } from '../core/util';
import { nSea } from '../sim/physics';

/** Cran de chaque allure sur l'échelle −10…+10, indexé comme TELE (avant : ≈ 10 × fraction de régime). */
export const NOTCH = [-10, -6, 0, 2, 4, 6, 8, 10];
const PAD = 16;

let cv: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D, drag = false, H = 0;
const yOfV = (v: number): number => PAD + ((10 - v) / 20) * (H - 2 * PAD);

export function initTelegraph(c: HTMLCanvasElement): void {
  cv = c; ctx = c.getContext('2d')!;
  const pick = (ev: PointerEvent): number => {
    const y = ev.clientY - c.getBoundingClientRect().top;
    let best = S.own.tele, bd = Infinity;
    NOTCH.forEach((v, i) => { const d = Math.abs(yOfV(v) - y); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  let start = 0;
  c.addEventListener('pointerdown', (ev) => { drag = true; start = S.own.tele; c.setPointerCapture(ev.pointerId); S.own.tele = pick(ev); });
  c.addEventListener('pointermove', (ev) => { if (drag) S.own.tele = pick(ev); });
  const end = () => { if (!drag) return; drag = false; if (S.own.tele !== start) logE(`Machine : ${TELE[S.own.tele].n}`); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

/** Cran équivalent au régime réel (interpolation entre les allures). */
function vOfRegime(f: number): number {
  const fs = TELE.map((t) => t.f);
  if (f <= fs[0]) return NOTCH[0];
  for (let i = 0; i < fs.length - 1; i++) if (f <= fs[i + 1]) return NOTCH[i] + ((NOTCH[i + 1] - NOTCH[i]) * (f - fs[i])) / (fs[i + 1] - fs[i]);
  return NOTCH[NOTCH.length - 1];
}

/** Place les boutons de la liste en face de leur cran. */
function placeButtons(): void {
  TELE.forEach((_, i) => {
    const b = document.querySelector<HTMLElement>(`#tele button[data-v="${i}"]`);
    if (!b) return;
    const top = `${Math.round(yOfV(NOTCH[i]) - b.offsetHeight / 2)}px`;
    if (b.style.top !== top) b.style.top = top;
  });
}

export function drawTelegraph(): void {
  if (!cv || cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth;
  H = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr); }
  placeButtons();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, H);
  const o = S.own;
  ctx.globalAlpha = document.body.classList.contains('pal-night') ? 0.55 : 1;
  const sx = 46, sw = 34, y10 = yOfV(10), ym10 = yOfV(-10);
  // tambour gradué : fond sombre, bandes verte (avant) et rouge (arrière)
  ctx.fillStyle = '#1d2329'; ctx.beginPath(); ctx.roundRect(sx - 6, y10 - 10, sw + 12, ym10 - y10 + 20, 8); ctx.fill();
  ctx.fillStyle = '#0f1316'; ctx.fillRect(sx, y10 - 4, sw, ym10 - y10 + 8);
  ctx.fillStyle = '#25b54a'; ctx.fillRect(sx, y10, 5, yOfV(0) - y10);
  ctx.fillStyle = '#e02424'; ctx.fillRect(sx, yOfV(0), 5, ym10 - yOfV(0));
  // graduations : chaque cran, chiffres de 2 en 2
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '700 12px ui-monospace,Menlo,monospace';
  for (let v = -10; v <= 10; v++) {
    const y = yOfV(v), big = v % 2 === 0;
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = big ? 1.4 : 0.8;
    ctx.beginPath(); ctx.moveTo(sx + 6, y); ctx.lineTo(sx + (big ? 16 : 11), y); ctx.stroke();
    if (big) { ctx.fillStyle = v > 0 ? '#4fd872' : v < 0 ? '#ff5a5a' : '#f2f2f2'; ctx.fillText(String(Math.abs(v)), sx - 10, y); }
  }
  ctx.textAlign = 'center'; ctx.font = '800 11px system-ui,sans-serif';
  ctx.fillStyle = '#4fd872'; ctx.fillText('AV', sx + sw / 2 + 4, y10 - 2 - 8 > 4 ? y10 - 2 - 8 : 6);
  ctx.fillStyle = '#ff5a5a'; ctx.fillText('AR', sx + sw / 2 + 4, Math.min(H - 6, ym10 + 10));
  // réponse machine : repère jaune sur le régime réel
  const ry = yOfV(vOfRegime(clamp(o.n / nSea(o.ship.mmg), -0.6, 1.1)));
  ctx.fillStyle = '#ffd21f';
  ctx.beginPath(); ctx.moveTo(sx + 2, ry); ctx.lineTo(sx - 7, ry - 5); ctx.lineTo(sx - 7, ry + 5); ctx.closePath(); ctx.fill();
  // manette : index rouge sur le tambour, poignée noire effilée à bague blanche
  const y = yOfV(NOTCH[o.tele]), x0 = sx + sw - 6, L = Math.min(96, w - x0 - 70);
  ctx.fillStyle = '#ff2d2d'; ctx.fillRect(sx + 6, y - 1.5, sw - 6, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.moveTo(x0, y - 3 + 3); ctx.lineTo(x0 + L, y - 6 + 3); ctx.lineTo(x0 + L, y + 6 + 3); ctx.lineTo(x0, y + 3 + 3); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(0, y - 7, 0, y + 7);
  g.addColorStop(0, '#5b6168'); g.addColorStop(0.45, '#15181b'); g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x0, y - 3); ctx.lineTo(x0 + L * 0.55, y - 4.5); ctx.lineTo(x0 + L, y - 7); ctx.lineTo(x0 + L, y + 7); ctx.lineTo(x0 + L * 0.55, y + 4.5); ctx.lineTo(x0, y + 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e9e9e9'; ctx.fillRect(x0 + L * 0.3, y - 4.2, 4, 8.4);
  // lecture : ordre, régime, renversement
  const xr = x0 + L + 10, f = TELE[o.tele].f;
  ctx.textAlign = 'left';
  ctx.fillStyle = f > 0 ? '#4fd872' : f < 0 ? '#ff5a5a' : '#f2f2f2'; ctx.font = '700 13px system-ui,sans-serif';
  ctx.fillText(`${NOTCH[o.tele] > 0 ? '+' : ''}${NOTCH[o.tele]}`, xr, y - 8);
  ctx.fillStyle = '#ffd21f'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
  ctx.fillText(`${Math.round(o.n * 60)} tr/min`, xr, y + 8);
  if (o.revUntil > 0) { ctx.fillStyle = '#f2f2f2'; ctx.fillText(`renv. ${Math.max(0, Math.ceil(o.revUntil - S.t))} s`, xr, y + 22); }
  ctx.globalAlpha = 1;
}
