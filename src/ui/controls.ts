/** Interface : onglets, commandes passerelle, réglages radar, table ARPA, bilan. */
import { S, logE, type Compliance, type RadarSettings, type Visibility } from '../core/state';
import { RANGES, TELE } from '../core/data';
import { brgOf, clamp, fMin, fT, n360, p3 } from '../core/util';
import { SCEN, newScenario } from '../sim/scenarios';
import { acquire, SWP } from '../sim/radar';
import { finish } from '../sim/assessment';
import { visual } from '../sim/visual';
import { geo } from './render';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function showTab(n: string): void {
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === n));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 't-' + n));
}

let hdgT: number | undefined, rudT: number | undefined;
const rudTxt = (v: number) => (v === 0 ? 'à zéro' : (v < 0 ? 'bâbord ' : 'tribord ') + Math.abs(v) + '°');

interface Seg { g: () => string; s: (v: string) => void }
const SEGS: Record<string, Seg> = {
  ts: { g: () => String(S.ts), s: (v) => (S.ts = +v) },
  ap: { g: () => (S.own.ap ? '1' : '0'), s: (v) => {
    const o = S.own; o.ap = v === '1';
    if (o.ap) { o.cmdHdg = Math.round(o.hdg); logE(`Pilote auto, cap ${p3(o.cmdHdg)}°`); } else { o.manRud = Math.round(o.rud); logE('Barre manuelle'); }
  } },
  rudLim: { g: () => String(S.own.rudLim), s: (v) => (S.own.rudLim = +v) },
  orient: { g: () => S.radar.orient, s: (v) => { S.radar.orient = v as RadarSettings['orient']; if (v === 'CU') S.radar.cuRef = Math.round(S.own.hdg); } },
  vec: { g: () => S.radar.vec, s: (v) => (S.radar.vec = v as RadarSettings['vec']) },
  vecMin: { g: () => String(S.radar.vecMin), s: (v) => (S.radar.vecMin = +v) },
  stab: { g: () => S.radar.stab, s: (v) => (S.radar.stab = v as RadarSettings['stab']) },
  trail: { g: () => S.radar.trail, s: (v) => (S.radar.trail = v as RadarSettings['trail']) },
  trailMin: { g: () => String(S.radar.trailMin), s: (v) => (S.radar.trailMin = +v) },
  cpaLim: { g: () => String(S.radar.cpaLim), s: (v) => (S.radar.cpaLim = +v) },
  tcpaLim: { g: () => String(S.radar.tcpaLim), s: (v) => (S.radar.tcpaLim = +v) },
  autoAcq: { g: () => (S.radar.autoAcq ? '1' : '0'), s: (v) => (S.radar.autoAcq = v === '1') },
  trial: { g: () => (S.radar.trial ? '1' : '0'), s: (v) => {
    S.radar.trial = v === '1';
    if (S.radar.trial) { S.radar.trialHdg = Math.round(S.own.hdg); S.radar.trialSpd = Math.round(S.own.stw); }
  } },
  trialDelay: { g: () => String(S.radar.trialDelay), s: (v) => (S.radar.trialDelay = +v) },
  vis: { g: () => S.env.vis, s: (v) => { S.env.vis = v as Visibility; logE(v === 'poor' ? 'Visibilité réduite' : 'Bonne visibilité'); } },
  night: { g: () => (S.env.night ? '1' : '0'), s: (v) => (S.env.night = v === '1') },
  comp: { g: () => S.env.comp, s: (v) => (S.env.comp = v as Compliance) },
  scen: { g: () => S.scen, s: (v) => { S.scen = v; const sc = SCEN[v]; if (sc.vis) S.env.vis = sc.vis; } },
};

const ACT: Record<string, (v: string) => void> = {
  play() { if (S.over) newScenario(); S.started = true; S.paused = !S.paused; },
  hdg(v) {
    const o = S.own;
    if (!o.ap) { o.ap = true; o.cmdHdg = Math.round(o.hdg); }
    o.cmdHdg = n360(Math.round(o.cmdHdg) + +v);
    clearTimeout(hdgT);
    hdgT = window.setTimeout(() => logE(`Cap ordonné ${p3(S.own.cmdHdg)}°`), 1200);
  },
  rud(v) { const o = S.own; o.ap = false; o.manRud = +v; $in('rudSl').value = v; logE(`Barre ${rudTxt(+v)}`); },
  tele(v) { S.own.tele = +v; logE(`Machine : ${TELE[+v].n}`); },
  rng(v) { const i = clamp(RANGES.indexOf(S.radar.range) + +v, 0, RANGES.length - 1); S.radar.range = RANGES[i]; },
  dropSel() { S.tracks = S.tracks.filter((k) => k.n !== S.sel); S.sel = null; },
  dropAll() { S.tracks = []; S.sel = null; },
  trH(v) { S.radar.trialHdg = n360(S.radar.trialHdg + +v); },
  trS(v) { S.radar.trialSpd = clamp(S.radar.trialSpd + +v, 0, S.own.ship.max); },
  eblClr() { S.radar.ebl = null; },
  randWx() {
    const e = S.env;
    e.windFrom = Math.round(Math.random() * 35) * 10; e.windKn = Math.round(4 + Math.random() * 28);
    e.curSet = Math.round(Math.random() * 35) * 10; e.curKn = Math.round(Math.random() * 25) / 10;
    syncEnv();
  },
  newRun() { newScenario(); S.started = true; S.paused = false; showTab('barre'); },
  finish() { if (!S.over && S.started) finish(); },
};

const BFT = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
const bft = (k: number) => { const i = BFT.findIndex((x) => k < x); return i < 0 ? 12 : i; };

function syncEnv(): void {
  const e = S.env;
  $in('wDir').value = String(e.windFrom); $in('wSpd').value = String(e.windKn);
  $in('cDir').value = String(e.curSet); $in('cSpd').value = String(Math.round(e.curKn * 10));
  envTxt();
}
function envTxt(): void {
  const e = S.env;
  $('windTxt').textContent = `du ${p3(e.windFrom)}°, ${e.windKn} kn (force ${bft(e.windKn)})`;
  $('curTxt').textContent = `portant au ${p3(e.curSet)}°, ${e.curKn.toFixed(1)} kn`;
}

const fmtR = (v: number) => { v = Math.round(v); return v === 0 ? '0' : (v < 0 ? 'B' : 'T') + Math.abs(v); };

let reportShown: object | null = null;
function renderReport(): void {
  const R = S.report;
  if (!R || reportShown === R) return;
  reportShown = R;
  const col = R.score >= 85 ? 'var(--ok)' : R.score >= 70 ? 'var(--ac)' : R.score >= 50 ? 'var(--wn)' : 'var(--bd)';
  const msgs = (m: [string, string][]) => m.map((x) => `<div class="msg ${x[0]}">${esc(x[1])}</div>`).join('');
  let h = `<div class="card"><div class="score" style="color:${col}">${R.score}/100</div><div>${esc(R.grade)} · ${esc(R.scen)} · durée ${fT(R.duration)}</div>${msgs(R.global)}</div>`;
  if (!R.items.length) h += "<p class=\"dim\">Aucune situation de risque ne s'est établie (CPA toujours > 1 NM).</p>";
  for (const it of R.items) {
    h += `<div class="card"><b>${esc(it.label)}</b> <span class="dim">· ${esc(it.name)} ${it.L} m</span><div style="color:var(--ac);font-size:12px;margin:3px 0">${esc(it.role)}</div>${msgs(it.msgs)}<div class="msg info">L'autre navire : ${esc(it.other)}.</div></div>`;
  }
  $('report').innerHTML = h;
  showTab('bilan');
}

export function upd(): void {
  const o = S.own, R = S.radar, e = S.env;
  $('clock').textContent = 'T+' + fT(S.t);
  $('play').textContent = S.paused ? '▶' : '⏸';
  const sog = Math.hypot(o.vx, o.vy);
  $('nHdg').textContent = o.hdg.toFixed(1) + '°';
  $('nCog').textContent = (sog > 0.2 ? brgOf(o.vx, o.vy).toFixed(1) : '---') + '°';
  $('nStw').textContent = o.stw.toFixed(1) + ' kn';
  $('nSog').textContent = sog.toFixed(1) + ' kn';
  $('nRud').textContent = fmtR(o.rud) + '°';
  $('nRot').textContent = (o.rot * 60 >= 0 ? '+' : '') + Math.round(o.rot * 60) + '°/min';
  $('nCmd').textContent = o.ap ? p3(o.cmdHdg) + '°' : 'manuel';
  $('nTel').textContent = `${TELE[o.tele].n} · ${Math.round(o.n * 60)} tr/min`;
  $('nEnv').textContent = `Vent ${p3(e.windFrom)}°/${e.windKn} kn · Courant →${p3(e.curSet)}°/${e.curKn.toFixed(1)} kn · ${e.vis === 'poor' ? 'Brume' : 'Bonne visibilité'} · ${SCEN[S.scen].n}`;
  document.querySelectorAll<HTMLElement>('[data-seg]').forEach((sg) => {
    const k = SEGS[sg.dataset.seg!];
    if (!k) return;
    const v = k.g();
    sg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  });
  document.querySelectorAll<HTMLButtonElement>('#tele button').forEach((b) => b.classList.toggle('on', +b.dataset.v! === o.tele));
  $('apBox').style.display = o.ap ? '' : 'none';
  $('manBox').style.display = o.ap ? 'none' : '';
  $('cmdTxt').textContent = p3(o.cmdHdg);
  $('rudTxt').textContent = fmtR(o.manRud) + '°';
  $('shipInfo').textContent = `${o.ship.n} · vitesse de service ${o.ship.max} kn · modèle hydrodynamique MMG 3 DDL (${o.ship.src}). Renversement de marche : 20 s d'attente moteur.`;
  $('rngTxt').textContent = R.range + ' NM';
  $('trHTxt').textContent = p3(R.trialHdg) + '°';
  $('trSTxt').textContent = R.trialSpd + ' kn';
  $('scDesc').textContent = SCEN[S.scen].d;

  // table ARPA
  if (!S.tracks.length) {
    $('arpaTable').innerHTML = "<p class=\"dim\">Aucune cible acquise. Touchez un écho sur le scope pour l'acquérir, ou activez l'acquisition auto (onglet Radar).</p>";
  } else {
    let h = `<table class="t"><tr><th>N°</th><th>Dist</th><th>Rlv</th><th>CPA</th><th>TCPA</th><th>BCR</th>${R.trial ? '<th>CPA ess.</th>' : ''}</tr>`;
    for (const tr of [...S.tracks].sort((a, b) => a.n - b.n)) {
      if (!tr.est) continue;
      const ok = tr.state === 'TRK';
      h += `<tr data-n="${tr.n}" class="${S.sel === tr.n ? 'sel' : ''} ${tr.danger ? 'dg' : ''}"><td>${tr.n}${tr.state === 'ACQ' ? '…' : tr.state === 'LOST' ? ' ⚠' : ''}</td><td>${tr.range.toFixed(1)}</td><td>${p3(tr.brg)}</td>`
        + `<td>${ok ? tr.cpa.toFixed(2) : '—'}</td><td>${ok && isFinite(tr.tcpa) ? (tr.tcpa / 60).toFixed(1) : '—'}</td>`
        + `<td>${ok && tr.bcr !== null ? (tr.bcr >= 0 ? 'Av ' : 'Ar ') + Math.abs(tr.bcr).toFixed(1) : '—'}</td>`
        + (R.trial ? `<td>${ok && tr.trial ? (tr.trial.tcpa > 0 ? tr.trial.cpa.toFixed(2) : 'ouvre') : '—'}</td>` : '') + '</tr>';
    }
    $('arpaTable').innerHTML = h + '</table>';
  }
  const tr = S.tracks.find((k) => k.n === S.sel);
  if (tr && tr.est) {
    const t = S.targets.find((x) => x.id === tr.tid), ok = tr.state === 'TRK';
    $('selCard').innerHTML = `<div class="card"><b>Cible ${tr.n}</b><span class="tag">${tr.state === 'ACQ' ? 'ACQUISITION' : tr.state === 'LOST' ? 'PERDUE' : 'SUIVIE'}</span>
    <div class="kv"><span>Distance</span><b>${tr.range.toFixed(2)} NM</b><span>Relèvement vrai</span><b>${tr.brg.toFixed(1)}°</b>
    <span>CPA / TCPA</span><b>${ok ? tr.cpa.toFixed(2) + ' NM / ' + (isFinite(tr.tcpa) ? fMin(tr.tcpa) : '—') : '…'}</b>
    <span>Évol. relèvement</span><b>${ok ? (tr.brate >= 0 ? '+' : '') + tr.brate.toFixed(2) + '°/min' : '…'}</b>
    <span>Route / vitesse ${R.stab === 'GND' ? 'fond' : 'surface'}</span><b>${ok ? p3(tr.crs) + '° / ' + tr.spd.toFixed(1) + ' kn' : '…'}</b>
    <span>BCR / BCT</span><b>${ok && tr.bcr !== null && tr.bct !== null ? (tr.bcr >= 0 ? 'avant ' : 'arrière ') + Math.abs(tr.bcr).toFixed(2) + ' NM / ' + fMin(tr.bct) : '—'}</b>
    ${R.trial && ok && tr.trial ? `<span style="color:#ff9f1c">Essai CPA / TCPA</span><b style="color:#ff9f1c">${tr.trial.tcpa > 0 ? tr.trial.cpa.toFixed(2) + ' NM / ' + fMin(tr.trial.tcpa) : 'distance croissante'}</b>` : ''}</div>
    <div style="margin-top:6px;font-size:12.5px"><span class="dim">Observation :</span> ${t ? esc(visual(t)) : '—'}</div></div>`;
  } else $('selCard').innerHTML = '';

  // alarmes
  const al = $('alarm'), dg = S.tracks.filter((k) => k.danger).map((k) => k.n), lost = S.tracks.filter((k) => k.state === 'LOST').map((k) => k.n);
  if (S.collided !== null) { al.className = 'bad'; al.textContent = 'ABORDAGE'; }
  else if (dg.length || lost.length) {
    al.className = 'bad';
    al.textContent = [dg.length ? 'CPA/TCPA : ' + dg.join(', ') : '', lost.length ? 'PERDUE : ' + lost.join(', ') : ''].filter(Boolean).join(' · ');
  } else {
    const en = Object.values(S.enc);
    const clear = S.started && !S.over && en.length > 0 && en.every((x) => x.closed)
      && S.targets.every((t) => S.enc[t.id] || Math.hypot(t.x - o.x, t.y - o.y) > 8);
    if (clear) { al.className = 'info'; al.textContent = 'Situations dégagées · Bilan > Terminer'; } else al.className = '';
  }
  $('log').innerHTML = S.log.slice(0, 60).map((l) => `<div class="${l.cls}">T+${fT(l.t)} ${esc(l.txt)}</div>`).join('');
  renderReport();
}

export function initControls(canvas: HTMLCanvasElement): void {
  document.querySelector('.scgrid')!.innerHTML = Object.entries(SCEN).map(([k, s]) => `<button data-v="${k}">${esc(s.n)}</button>`).join('');
  $('tele').innerHTML = TELE.map((t, i) => `<button data-act="tele" data-v="${i}" class="${t.f < 0 ? 'ast' : ''}">${t.n}</button>`).reverse().join('');

  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.tab) { showTab(b.dataset.tab); return; }
    const sg = b.closest('[data-seg]') as HTMLElement | null;
    if (sg && b.dataset.v !== undefined && SEGS[sg.dataset.seg!]) { SEGS[sg.dataset.seg!].s(b.dataset.v); upd(); return; }
    if (b.dataset.act && ACT[b.dataset.act]) { ACT[b.dataset.act](b.dataset.v ?? ''); upd(); }
  });
  $('arpaTable').addEventListener('pointerdown', (ev) => {
    const tr = (ev.target as HTMLElement).closest('tr[data-n]') as HTMLElement | null;
    if (tr) { S.sel = +tr.dataset.n!; upd(); }
  });
  $in('rudSl').addEventListener('input', (e) => {
    const o = S.own; o.ap = false; o.manRud = +(e.target as HTMLInputElement).value;
    clearTimeout(rudT);
    rudT = window.setTimeout(() => logE(`Barre ${rudTxt(o.manRud)}`), 900);
    upd();
  });
  $in('acSl').addEventListener('input', (e) => { S.radar.ac = +(e.target as HTMLInputElement).value / 100; });
  for (const id of ['wDir', 'wSpd', 'cDir', 'cSpd']) {
    $in(id).addEventListener('input', () => {
      const e = S.env;
      e.windFrom = +$in('wDir').value; e.windKn = +$in('wSpd').value; e.curSet = +$in('cDir').value; e.curKn = +$in('cSpd').value / 10;
      envTxt();
    });
  }

  // scope : toucher un écho = acquisition / sélection ; ailleurs = EBL/VRM
  canvas.addEventListener('pointerdown', (ev) => {
    const rc = canvas.getBoundingClientRect(), px = ev.clientX - rc.left, py = ev.clientY - rc.top, G = geo(), o = S.own;
    let best: { kind: 'tr'; n: number } | { kind: 't'; id: number } | null = null, bd = 22;
    for (const tr of S.tracks) {
      if (!tr.est) continue;
      const q = G.P(tr.est.x - o.x, tr.est.y - o.y), d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bd) { bd = d; best = { kind: 'tr', n: tr.n }; }
    }
    for (const t of S.targets) {
      if (!t.echo || S.t - t.echo.t > SWP * 1.1) continue;
      const q = G.P(t.echo.dx, t.echo.dy), d = Math.hypot(q[0] - px, q[1] - py);
      if (d < bd) { bd = d; best = { kind: 't', id: t.id }; }
    }
    if (best) {
      if (best.kind === 'tr') S.sel = best.n;
      else {
        const id = best.id, ex = S.tracks.find((k) => k.tid === id);
        if (ex) S.sel = ex.n; else { const t = S.targets.find((x) => x.id === id); if (t) acquire(t, false); }
      }
    } else {
      const p = G.inv(px, py), r = Math.hypot(p.x, p.y);
      if (r <= S.radar.range * 1.05) S.radar.ebl = { b: brgOf(p.x, p.y), r };
    }
    upd();
  });
  syncEnv();
}
