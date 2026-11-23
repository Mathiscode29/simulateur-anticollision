/**
 * Transmetteur d'ordres (« chadburn ») de l'onglet Barre : cadran rond à fond sombre, STOP en haut,
 * allures avant sur tribord (secteurs verts), allures arrière sur bâbord (secteurs rouges), comme l'indicateur de barre.
 * La manette se règle au clic ou au glisser ; l'aiguille jaune répète le régime réel de l'hélice (réponse machine),
 * qui rejoint l'ordre avec le temps de réaction du moteur (et 20 s d'attente au renversement de marche).
 */
import { S, logE } from '../core/state';
import { TELE } from '../core/data';
import { clamp } from '../core/util';
import { nSea } from '../sim/physics';

/** Position angulaire de chaque ordre (°, 0 = haut, + = sens horaire vers tribord), dans l'ordre de TELE. */
const POS = [-115, -60, 0, 30, 58, 86, 114, 142];
const LBL = ['TOUTE', 'DEMIE', 'STOP', 'TR. LENTE', 'LENTE', 'DEMIE', 'TOUTE', 'MER'];
const D2R = Math.PI / 180;

let cv: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D, drag = false, geom = { cx: 0, cy: 0, R: 1 };

export function initTelegraph(c: HTMLCanvasElement): void {
  cv = c; ctx = c.getContext('2d')!;
  const pick = (ev: PointerEvent): number | null => {
    const r = c.getBoundingClientRect(), dx = ev.clientX - r.left - geom.cx, dy = ev.clientY - r.top - geom.cy;
    if (Math.hypot(dx, dy) < geom.R * 0.15) return null;
    const a = Math.atan2(dx, -dy) / D2R;
    let best = 0, bd = Infinity;
    POS.forEach((p, i) => { const d = Math.abs(p - a); if (d < bd) { bd = d; best = i; } });
    return bd < 25 ? best : null;
  };
  const set = (i: number | null, log: boolean) => {
    if (i === null) return;
    const o = S.own;
    if (i !== o.tele) { o.tele = i; if (log) logE(`Machine : ${TELE[i].n}`); }
  };
  let start = 0;
  c.addEventListener('pointerdown', (ev) => { drag = true; start = S.own.tele; c.setPointerCapture(ev.pointerId); set(pick(ev), false); });
  c.addEventListener('pointermove', (ev) => { if (drag) set(pick(ev), false); });
  const end = () => { if (!drag) return; drag = false; if (S.own.tele !== start) logE(`Machine : ${TELE[S.own.tele].n}`); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

/** Angle du cadran correspondant à une fraction de régime (interpolation entre les ordres). */
function angleOf(f: number): number {
  const fs = TELE.map((t) => t.f);
  if (f <= fs[0]) return POS[0];
  for (let i = 0; i < fs.length - 1; i++) if (f <= fs[i + 1]) return POS[i] + ((POS[i + 1] - POS[i]) * (f - fs[i])) / (fs[i + 1] - fs[i]);
  return POS[POS.length - 1];
}

export function drawTelegraph(): void {
  if (!cv || cv.offsetParent === null) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(w * 0.42, h * 0.4), cx = w / 2, cy = h * 0.47;
  geom = { cx, cy, R };
  const o = S.own, night = document.body.classList.contains('pal-night');
  ctx.globalAlpha = night ? 0.55 : 1;
  const P = (a: number, r: number): [number, number] => [cx + Math.sin(a * D2R) * r, cy - Math.cos(a * D2R) * r];
  const r0 = R * 0.6, r1 = R;
  // secteurs : vert (avant), rouge (arrière), gris (stop) ; le secteur ordonné est éclairé
  const half = (i: number, s: -1 | 1) => (i + s >= 0 && i + s < POS.length ? (POS[i + s] - POS[i]) / 2 : s * 14);
  POS.forEach((p, i) => {
    const a0 = p + half(i, -1), a1 = p + half(i, 1), f = TELE[i].f, on = i === o.tele;
    const base = f > 0 ? [37, 181, 74] : f < 0 ? [224, 36, 36] : [150, 150, 150];
    const k = on ? 1 : 0.42;
    ctx.fillStyle = `rgb(${base.map((c) => Math.round(c * k)).join(',')})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, (a0 - 90) * D2R, (a1 - 90) * D2R); ctx.arc(cx, cy, r0, (a1 - 90) * D2R, (a0 - 90) * D2R, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#15181c'; ctx.lineWidth = 2; ctx.stroke();
    // libellé : tangent au cadran pour STOP, radial ailleurs (secteurs étroits)
    const m = P(p, (r0 + r1) / 2);
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate((p === 0 ? 0 : p > 0 ? p - 90 : p + 90) * D2R);
    ctx.fillStyle = on ? '#ffffff' : '#d0d0d0'; ctx.font = `700 ${Math.round(R * (LBL[i].length > 6 ? 0.085 : 0.1))}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LBL[i], 0, 0);
    ctx.restore();
  });
  // AV / AR
  ctx.font = `800 ${Math.round(R * 0.16)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4fd872'; ctx.fillText('AV', ...P(70, r0 * 0.62));
  ctx.fillStyle = '#ff5a5a'; ctx.fillText('AR', ...P(-70, r0 * 0.62));
  // réponse machine : aiguille jaune sur le régime réel
  const ns = nSea(o.ship.mmg), fr = clamp(o.n / ns, -0.6, 1.1), ar = angleOf(fr), t1 = P(ar, r1 + R * 0.02), t2 = P(ar, r0 - R * 0.08);
  ctx.strokeStyle = '#ffd21f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(t1[0], t1[1]); ctx.lineTo(t2[0], t2[1]); ctx.stroke();
  // manette : bras et poignée sur l'ordre
  const ao = POS[o.tele], hnd = P(ao, r0 * 0.92);
  ctx.strokeStyle = '#9aa3ab'; ctx.lineWidth = R * 0.09; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hnd[0], hnd[1]); ctx.stroke();
  ctx.strokeStyle = '#d9dee2'; ctx.lineWidth = R * 0.03;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hnd[0], hnd[1]); ctx.stroke();
  const g = ctx.createRadialGradient(hnd[0] - R * 0.03, hnd[1] - R * 0.03, 1, hnd[0], hnd[1], R * 0.11);
  g.addColorStop(0, '#f4f4f4'); g.addColorStop(1, '#6e767d');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hnd[0], hnd[1], R * 0.11, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a4046'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, 7); ctx.fill();
  ctx.fillStyle = '#bfc5ca'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.06, 0, 7); ctx.fill();
  // lecture : ordre et régime
  const rpm = Math.round(o.n * 60), wait = o.revUntil > 0 ? ` · renversement ${Math.max(0, Math.ceil(o.revUntil - S.t))} s` : '';
  ctx.fillStyle = TELE[o.tele].f > 0 ? '#4fd872' : TELE[o.tele].f < 0 ? '#ff5a5a' : '#f2f2f2';
  ctx.font = `700 ${Math.round(R * 0.15)}px system-ui,sans-serif`; ctx.fillText(TELE[o.tele].n.toUpperCase(), cx, cy + R * 0.98 + R * 0.1);
  ctx.fillStyle = '#ffd21f'; ctx.font = `600 ${Math.round(R * 0.12)}px ui-monospace,Menlo,monospace`;
  ctx.fillText(`${rpm} tr/min${wait}`, cx, cy + R * 0.98 + R * 0.3);
  ctx.globalAlpha = 1;
}
