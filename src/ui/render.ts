/**
 * Rendu du scope radar (PPI) sur canvas 2D : clutter, échos, sillages, cercles, ligne de foi,
 * symboles ARPA, vecteurs, EBL/VRM, balayage, graduation et cartouches.
 * Symbologie à faire évoluer vers IEC 62388 (voir ROADMAP.md, phase 3).
 */
import { S } from '../core/state';
import { RINGS } from '../core/data';
import { D2R, clamp, vec } from '../core/util';
import { ownWater } from '../sim/physics';
import { SWP, trueV } from '../sim/radar';

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
let W = 0, DPR = 1;

export function initRender(canvas: HTMLCanvasElement): void {
  cv = canvas;
  ctx = canvas.getContext('2d')!;
  new ResizeObserver(resize).observe(cv);
  resize();
}

function resize(): void {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = r.width;
  cv.width = Math.round(r.width * DPR);
  cv.height = Math.round(r.width * DPR);
}

function dispRot(): number {
  const R = S.radar;
  return R.orient === 'HU' ? S.own.hdg : R.orient === 'CU' ? R.cuRef : 0;
}

/** Géométrie d'affichage : conversion position relative (NM) <-> pixels écran. */
export function geo() {
  const w = W, cx = w / 2, cy = w / 2, Rr = w / 2 - 15, k = Rr / S.radar.range, rot = dispRot();
  const cr = Math.cos(rot * D2R), sr = Math.sin(rot * D2R);
  return {
    w, cx, cy, Rr, k, rot,
    P: (dx: number, dy: number): [number, number] => [cx + (dx * cr - dy * sr) * k, cy - (dx * sr + dy * cr) * k],
    inv: (px: number, py: number) => { const sx = (px - cx) / k, sy = (cy - py) / k; return { x: sx * cr + sy * sr, y: -sx * sr + sy * cr }; },
  };
}

function line(x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export function draw(): void {
  if (!W) return;
  const G = geo(), { w, cx, cy, Rr, k, rot, P } = G, R = S.radar, o = S.own;
  const blink = Math.floor(performance.now() / 400) % 2;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#020509'; ctx.fillRect(0, 0, w, w);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, 7); ctx.fillStyle = '#04182a'; ctx.fill(); ctx.clip();

  // clutter de mer
  ctx.fillStyle = '#ffd23f';
  for (const p of S.clutter) {
    const a = 1 - (0.6 * (S.t - p.t)) / SWP;
    if (a <= 0 || p.r > R.range * 1.1) continue;
    ctx.globalAlpha = a * Math.min(1, p.s);
    const v = vec(p.b, p.r), q = P(v.x, v.y);
    ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
  }

  // sillages
  if (R.trail !== 'OFF') {
    for (const h of S.hist) {
      const ag = S.t - h.t;
      if (ag > R.trailMin * 60) continue;
      ctx.globalAlpha = 0.45 * (1 - ag / (R.trailMin * 60)) + 0.08;
      for (const t of S.targets) {
        if (!t.echo || S.t - t.echo.t > SWP * 1.1) continue;
        const q = h.p[t.id];
        if (!q) continue;
        const dx = R.trail === 'REL' ? q[0] - h.ox : q[0] - o.x, dy = R.trail === 'REL' ? q[1] - h.oy : q[1] - o.y;
        const s = P(dx, dy);
        ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2);
      }
      if (R.trail === 'TRUE') {
        const s = P(h.ox - o.x, h.oy - o.y);
        ctx.fillStyle = '#9fd8ff'; ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2); ctx.fillStyle = '#ffd23f';
      }
    }
  }

  // échos
  ctx.fillStyle = '#ffd23f';
  for (const t of S.targets) {
    const e = t.echo;
    if (!e || e.r > R.range * 1.1) continue;
    const ag = S.t - e.t;
    if (ag > SWP * 1.05) continue;
    ctx.globalAlpha = clamp(1 - (0.5 * ag) / SWP, 0.25, 1);
    const q = P(e.dx, e.dy), lp = (t.L / 1852) * k;
    const wd = Math.max(3, e.r * k * 0.022 + lp * 0.6), dp = Math.max(2.5, 0.025 * k + lp * 0.4);
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate((e.b - rot) * D2R); ctx.fillRect(-wd / 2, -dp / 2, wd, dp); ctx.restore();
  }
  ctx.globalAlpha = 1;

  // cercles de distance
  ctx.strokeStyle = '#1f5d74'; ctx.lineWidth = 1;
  const rs = RINGS[R.range];
  for (let rr = rs; rr <= R.range + 1e-6; rr += rs) { ctx.beginPath(); ctx.arc(cx, cy, rr * k, 0, 7); ctx.stroke(); }

  // ligne de foi
  ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1.2;
  const hv = vec(o.hdg, R.range * 1.2), hq = P(hv.x, hv.y);
  line(cx, cy, hq[0], hq[1]);

  // navire porteur (contour à petite échelle)
  if (R.range <= 1.5) {
    const L = o.L / 1852, B = L * 0.15;
    const pts = [[0, L / 2], [B / 2, L / 4], [B / 2, -L / 2], [-B / 2, -L / 2], [-B / 2, L / 4]].map(([a, b]) => {
      const f = vec(o.hdg, b), s = vec(o.hdg + 90, a);
      return P(f.x + s.x, f.y + s.y);
    });
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
  } else { ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.stroke(); }

  const vm = R.vecMin / 60;
  if (R.vec === 'TRUE') {
    const v = R.stab === 'GND' ? { x: o.vx, y: o.vy } : ownWater(), q = P(v.x * vm, v.y * vm);
    ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1.6; line(cx, cy, q[0], q[1]);
  }
  if (R.trial && R.vec === 'TRUE') {
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 1.4;
    const w0 = ownWater(), tw = vec(R.trialHdg, R.trialSpd);
    const v = R.stab === 'GND' ? { x: tw.x + o.vx - w0.x, y: tw.y + o.vy - w0.y } : tw, q = P(v.x * vm, v.y * vm);
    line(cx, cy, q[0], q[1]);
    ctx.setLineDash([]);
  }

  // symboles ARPA
  ctx.font = '600 10px ui-monospace,Menlo,monospace';
  for (const tr of S.tracks) {
    if (!tr.est) continue;
    const dx = tr.est.x - o.x, dy = tr.est.y - o.y;
    if (Math.hypot(dx, dy) > R.range * 1.15) continue;
    const q = P(dx, dy), col = tr.danger ? (blink ? '#ff3b3b' : '#ff9a9a') : tr.state === 'LOST' ? '#ffb020' : '#5ff3ff';
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
    if (tr.state !== 'ACQ' && tr.est.vok) {
      let vx: number, vy: number;
      if (R.vec === 'REL') { vx = tr.est.vx - o.vx; vy = tr.est.vy - o.vy; } else { const t = trueV(tr); vx = t.x; vy = t.y; }
      const e = P(dx + vx * vm, dy + vy * vm);
      line(q[0], q[1], e[0], e[1]);
    }
    if (tr.state === 'ACQ') { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    else if (tr.state === 'LOST') {
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 8); ctx.lineTo(q[0] + 8, q[1]); ctx.lineTo(q[0], q[1] + 8); ctx.lineTo(q[0] - 8, q[1]); ctx.closePath(); ctx.stroke();
      line(q[0] - 5, q[1] - 5, q[0] + 5, q[1] + 5); line(q[0] - 5, q[1] + 5, q[0] + 5, q[1] - 5);
    } else if (tr.danger) {
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 10); ctx.lineTo(q[0] + 9, q[1] + 6); ctx.lineTo(q[0] - 9, q[1] + 6); ctx.closePath(); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.stroke(); }
    ctx.fillText(String(tr.n), q[0] + 10, q[1] - 8);
    if (S.sel === tr.n) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      const s = 12, c = 4;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        line(q[0] + a * s, q[1] + b * s, q[0] + a * (s - c), q[1] + b * s);
        line(q[0] + a * s, q[1] + b * s, q[0] + a * s, q[1] + b * (s - c));
      }
    }
    if (R.trial && tr.trial && tr.state !== 'ACQ') {
      const tt = tr.trial, a = P(tt.px, tt.py), b = P(tt.px + tt.rvx * vm, tt.py + tt.rvy * vm);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 1.4; line(a[0], a[1], b[0], b[1]); ctx.setLineDash([]);
    }
  }

  // EBL / VRM
  if (R.ebl) {
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1;
    const v = vec(R.ebl.b, R.range * 1.2), q = P(v.x, v.y);
    line(cx, cy, q[0], q[1]);
    ctx.beginPath(); ctx.arc(cx, cy, R.ebl.r * k, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }

  // balayage (masqué en temps accéléré)
  if (S.ts <= 2 && !S.paused) {
    const a = (S.sweep - rot) * D2R;
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(80,200,255,${0.28 - i * 0.026})`; ctx.lineWidth = 2;
      const b = a - i * 0.035;
      line(cx, cy, cx + Math.sin(b) * Rr, cy - Math.cos(b) * Rr);
    }
  }
  ctx.restore();

  // graduation compas (stabilisée gyro)
  ctx.strokeStyle = '#5d8aa3'; ctx.fillStyle = '#8fb5cc'; ctx.lineWidth = 1;
  ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let b = 0; b < 360; b += 5) {
    const a = (b - rot) * D2R, l = b % 10 ? 3 : 6, s = Math.sin(a), c = Math.cos(a);
    line(cx + s * Rr, cy - c * Rr, cx + s * (Rr + l), cy - c * (Rr + l));
    if (b % 30 === 0) ctx.fillText(String(b).padStart(3, '0'), cx + s * (Rr - 10), cy - c * (Rr - 10));
  }

  // cartouches
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '600 10.5px ui-monospace,Menlo,monospace'; ctx.fillStyle = '#bfe3f5';
  ctx.fillText(`${R.orient} RM`, 5, 4); ctx.fillText(`${R.range} NM`, 5, 17);
  ctx.fillStyle = '#7f9fb3'; ctx.fillText(`(${RINGS[R.range]})`, 5, 30);
  ctx.textAlign = 'right'; ctx.fillStyle = '#bfe3f5';
  ctx.fillText(`VEC ${R.vec === 'REL' ? 'REL' : 'VRAI'} ${R.vecMin}'`, w - 5, 4);
  ctx.fillText(R.stab === 'GND' ? 'STAB SOL' : 'STAB EAU', w - 5, 17);
  if (R.trial) { ctx.fillStyle = '#ff9f1c'; ctx.fillText('TRIAL', w - 5, 30); }
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
  if (R.ebl) { ctx.fillStyle = '#7dffb0'; ctx.fillText(`EBL ${R.ebl.b.toFixed(1)}°`, 5, w - 17); ctx.fillText(`VRM ${R.ebl.r.toFixed(2)}`, 5, w - 4); }
  ctx.textAlign = 'right'; ctx.fillStyle = S.env.vis === 'poor' ? '#ffb020' : '#7f9fb3';
  ctx.fillText(S.env.vis === 'poor' ? 'BRUME' : S.env.night ? 'NUIT' : 'JOUR', w - 5, w - 4);
  if (!S.started && !S.over) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 13px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(2,5,9,.75)'; ctx.fillRect(cx - 120, cy + Rr * 0.45 - 14, 240, 28);
    ctx.fillStyle = '#fff'; ctx.fillText('Appuyez sur ▶ pour démarrer', cx, cy + Rr * 0.45);
  }
}
