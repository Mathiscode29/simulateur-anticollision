/**
 * Répétiteurs de l'onglet Barre, dans l'esprit des cadrans de passerelle (fond sombre, arc rouge sur bâbord,
 * vert sur tribord, aiguille, lecture numérique) :
 *  - angle de barre : 0 à 45° de part et d'autre, zéro en bas, repère blanc pour l'angle ordonné ;
 *  - ROT (taux de giration) : 0 à 60 °/min de part et d'autre, zéro en haut.
 * Ne lisent que S : redessinés à chaque image tant que l'onglet est affiché.
 */
import { S } from '../core/state';
import { clamp } from '../core/util';

interface Dial { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
let rud: Dial | null = null, rot: Dial | null = null;
const D2R = Math.PI / 180;

export function initRudder(cRud: HTMLCanvasElement, cRot: HTMLCanvasElement): void {
  rud = { cv: cRud, ctx: cRud.getContext('2d')! };
  rot = { cv: cRot, ctx: cRot.getContext('2d')! };
}

interface DialOpt {
  title: string; value: number; cmd?: number; max: number; span: number; minor: number; major: number;
  zero: 'top' | 'bottom'; text: string;
}

function dial(d: Dial, o: DialOpt): void {
  const { cv, ctx } = d;
  if (cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sg = o.zero === 'bottom' ? 1 : -1, cx = w / 2, cy = h / 2 + 6 * sg, R = Math.min(w, h) * 0.3;
  // point du cadran pour une valeur (+ = tribord, à droite), à la distance r du centre
  const pt = (v: number, r: number): [number, number] => {
    const a = (clamp(v, -o.max, o.max) / o.max) * o.span * D2R;
    return [cx + Math.sin(a) * r, cy + sg * Math.cos(a) * r];
  };
  ctx.globalAlpha = document.body.classList.contains('pal-night') ? 0.55 : 1;
  // titre en haut, ou en bas quand le zéro est en haut
  ctx.font = `600 ${Math.round(R * 0.2)}px system-ui,sans-serif`; ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center';
  ctx.textBaseline = sg > 0 ? 'top' : 'bottom'; ctx.fillText(o.title, cx, sg > 0 ? 5 : h - 5);
  // arcs bâbord (rouge) et tribord (vert)
  ctx.lineWidth = R * 0.16; ctx.lineCap = 'butt';
  const arc = (from: number, to: number, col: string) => {
    ctx.strokeStyle = col; ctx.beginPath();
    for (let k = 0; k <= 30; k++) { const p = pt(from + ((to - from) * k) / 30, R); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  };
  arc(-o.max * 0.007, -o.max, '#e02424'); arc(o.max * 0.007, o.max, '#25b54a');
  // graduations et chiffres
  ctx.strokeStyle = '#f2f2f2'; ctx.fillStyle = '#f2f2f2'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(R * 0.2)}px system-ui,sans-serif`;
  for (let v = -o.max; v <= o.max + 1e-9; v += o.minor) {
    const big = Math.abs(v % o.major) < 1e-9, a = pt(v, R * 1.09), b = pt(v, R * (big ? 1.22 : 1.16));
    ctx.lineWidth = big ? 1.4 : 0.9; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    if (big) { const q = pt(v, R * 1.42); ctx.fillText(String(Math.abs(Math.round(v))), q[0], q[1]); }
  }
  // repère de l'ordre (triangle blanc à l'intérieur de l'arc)
  if (o.cmd !== undefined) {
    const a = (clamp(o.cmd, -o.max, o.max) / o.max) * o.span * D2R, tip = pt(o.cmd, R * 0.88), l = pt(o.cmd, R * 1.05);
    const nx = Math.cos(a) * R * 0.09, ny = -sg * Math.sin(a) * R * 0.09;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(l[0] + nx, l[1] + ny); ctx.lineTo(l[0] - nx, l[1] - ny); ctx.closePath(); ctx.fill();
  }
  // aiguille
  const n = pt(o.value, R * 0.93);
  ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n[0], n[1]); ctx.stroke();
  ctx.fillStyle = '#d8d8d8'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, 7); ctx.fill();
  // lecture numérique, du côté opposé au zéro
  ctx.font = `700 ${Math.round(R * 0.24)}px ui-monospace,Menlo,monospace`;
  ctx.fillStyle = o.value < 0 ? '#ff5a5a' : o.value > 0 ? '#4fd872' : '#f2f2f2';
  ctx.fillText(o.text, cx, cy - sg * R * 0.42);
  ctx.globalAlpha = 1;
}

/** « Bd 11,3 », « Td 5,0 », « 0,0 ». */
const side = (v: number, unit: string): string => `${v < 0 ? 'Bd ' : v > 0 ? 'Td ' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}${unit}`;

export function drawRudder(): void {
  const o = S.own;
  if (rud) {
    const v = Math.abs(o.rud) < 0.05 ? 0 : o.rud;
    dial(rud, { title: 'BARRE', value: v, cmd: o.ap ? o.rudCmd ?? o.rud : o.manRud, max: 45, span: 150, minor: 5, major: 10, zero: 'bottom', text: side(v, '°') });
  }
  if (rot) {
    const r = o.rot * 60, v = Math.abs(r) < 0.05 ? 0 : r;
    dial(rot, { title: 'ROT  °/min', value: v, max: 60, span: 135, minor: 5, major: 20, zero: 'top', text: side(v, '') });
  }
}
