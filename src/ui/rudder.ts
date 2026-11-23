/**
 * Indicateur d'angle de barre de l'onglet Barre, dans l'esprit des répétiteurs de passerelle :
 * cadran à fond sombre, arc rouge sur bâbord et vert sur tribord (0 à 45° de part et d'autre, zéro en bas),
 * aiguille partant du centre (angle réel de la mèche), repère pour l'angle ordonné, lecture numérique.
 * Ne lit que S : redessiné à chaque image tant que l'onglet est affiché.
 */
import { S } from '../core/state';
import { clamp } from '../core/util';

let cv: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D;
const MAX = 45, SPAN = 150; // ±45° de barre sur ±150° de cadran

export function initRudder(c: HTMLCanvasElement): void { cv = c; ctx = c.getContext('2d')!; }

/** Angle écran (rad, 0 = vers le bas, sens horaire vu de l'écran = vers la gauche pour bâbord). */
const ang = (rud: number): number => (clamp(rud, -MAX, MAX) / MAX) * SPAN * (Math.PI / 180);

export function drawRudder(): void {
  if (!cv || cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const night = document.body.classList.contains('pal-night'), dim = night ? 0.55 : 1;
  const cx = w / 2, cy = h / 2 + 5, R = Math.min(w, h) * 0.3;
  // point du cadran pour un angle de barre (+ = tribord, à droite), à la distance r du centre
  const pt = (rud: number, r: number): [number, number] => { const a = ang(rud); return [cx + Math.sin(a) * r, cy + Math.cos(a) * r]; };
  ctx.globalAlpha = dim;
  ctx.font = `600 ${Math.round(R * 0.2)}px system-ui,sans-serif`; ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('BARRE', cx, 4);
  // arcs bâbord (rouge) et tribord (vert)
  ctx.lineWidth = R * 0.16; ctx.lineCap = 'butt';
  const arc = (from: number, to: number, col: string) => {
    ctx.strokeStyle = col; ctx.beginPath();
    for (let k = 0; k <= 30; k++) { const p = pt(from + ((to - from) * k) / 30, R); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  };
  arc(-0.3, -MAX, '#e02424'); arc(0.3, MAX, '#25b54a');
  // graduations tous les 5°, chiffres tous les 10°
  ctx.strokeStyle = '#f2f2f2'; ctx.fillStyle = '#f2f2f2'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(R * 0.2)}px system-ui,sans-serif`;
  for (let v = -MAX; v <= MAX; v += 5) {
    const big = v % 10 === 0, a = pt(v, R + R * 0.09), b = pt(v, R + R * (big ? 0.22 : 0.16));
    ctx.lineWidth = big ? 1.4 : 0.9; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (big && v !== 0) { const q = pt(v, R + R * 0.42); ctx.fillText(String(Math.abs(v)), q[0], q[1]); }
  }
  const z = pt(0, R + R * 0.4); ctx.fillText('0', z[0], z[1]);
  // repère de l'angle ordonné (triangle blanc sur l'intérieur de l'arc)
  const o = S.own, cmd = o.ap ? o.rudCmd ?? o.rud : o.manRud;
  {
    const a = ang(cmd), tip = pt(cmd, R - R * 0.12), l = pt(cmd, R + R * 0.05);
    const nx = Math.cos(a) * R * 0.09, ny = -Math.sin(a) * R * 0.09;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(l[0] + nx, l[1] + ny); ctx.lineTo(l[0] - nx, l[1] - ny); ctx.closePath(); ctx.fill();
  }
  // aiguille : angle réel
  const n = pt(o.rud, R * 0.93);
  ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n[0], n[1]); ctx.stroke();
  ctx.fillStyle = '#d8d8d8'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, 7); ctx.fill();
  // lecture numérique
  const v = Math.abs(o.rud) < 0.05 ? 0 : o.rud;
  ctx.font = `700 ${Math.round(R * 0.26)}px ui-monospace,Menlo,monospace`; ctx.fillStyle = v < 0 ? '#ff5a5a' : v > 0 ? '#4fd872' : '#f2f2f2';
  ctx.fillText(`${v < 0 ? 'Bd ' : v > 0 ? 'Td ' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}°`, cx, cy - R * 0.42);
  ctx.globalAlpha = 1;
}
