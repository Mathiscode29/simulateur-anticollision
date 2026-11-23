/** Interface : commandes passerelle, réglages radar et ECDIS, vues, alertes, table des cibles, bilan, clavier et souris. */
import { S, logE, type Compliance, type Faults, type RadarSettings, type Visibility } from '../core/state';
import { RANGES, TELE } from '../core/data';
import { brgOf, clamp, fMin, fT, n360, p3, vec } from '../core/util';
import { LEVELS, SCEN, applyScenarioEnv, newScenario } from '../sim/scenarios';
import { legData } from '../sim/route';
import { ACQ_TIME, STABLE_TIME, SWP, acquire, cancelTrack, seaLevel, trialRemaining } from '../sim/radar';
import { ackAlert, ackAll, sortedAlerts, TRACK_CAPACITY } from '../sim/alerts';
import { finish } from '../sim/assessment';
import { visual } from '../sim/visual';
import { cursor, geo, resetTM } from './render';
import { centreOnOwn, ecur, fromScr, pan, pickAt as ecPickAt, pickedInfo, scrOnLand, setPicked, view as ecView, zoom as ecZoom } from './ecdis';
import { checkRoute, depthAt, tssAt } from '../sim/chart';
import { fmtLat, fmtLon, toLL } from '../core/geo';
import { aisAssociated } from '../sim/ais';

/** Vue affichée : la simulation tourne quelle que soit la vue. */
export type View = 'radar' | 'ecdis' | 'split';
export let currentView: View = 'radar';
function setView(v: View): void {
  currentView = v;
  document.body.classList.remove('view-radar', 'view-ecdis', 'view-split');
  document.body.classList.add('view-' + v);
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function showTab(n: string): void {
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === n));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 't-' + n));
}

let hdgT: number | undefined, rudT: number | undefined;
const rudTxt = (v: number) => (v === 0 ? 'à zéro' : (v < 0 ? 'bâbord ' : 'tribord ') + Math.abs(v) + '°');
const R = () => S.radar;

function setPalette(p: RadarSettings['palette']): void {
  R().palette = p;
  document.body.classList.remove('pal-day', 'pal-dusk', 'pal-night');
  document.body.classList.add(p === 'DAY' ? 'pal-day' : p === 'NIGHT' ? 'pal-night' : 'pal-dusk');
}
function setMotion(m: RadarSettings['motion']): void {
  R().motion = m;
  if (m === 'TM') { if (R().orient === 'HU') R().orient = 'NU'; resetTM(); }
}
function setOrient(o: RadarSettings['orient']): void {
  if (o === 'HU' && R().motion === 'TM') R().motion = 'RM'; // Head up : mouvement relatif seulement
  R().orient = o;
  if (o === 'CU') R().cuRef = Math.round(S.own.hdg);
}
function setTrial(on: boolean): void {
  R().trial = on;
  if (on) { R().trialHdg = Math.round(S.own.hdg); R().trialSpd = Math.round(S.own.stw); R().trialT0 = S.t; }
}

interface Seg { g: () => string; s: (v: string) => void }
const SEGS: Record<string, Seg> = {
  ts: { g: () => String(S.ts), s: (v) => (S.ts = +v) },
  palette: { g: () => R().palette, s: (v) => setPalette(v as RadarSettings['palette']) },
  ap: { g: () => (S.own.ap ? '1' : '0'), s: (v) => {
    const o = S.own; o.ap = v === '1';
    if (o.ap) { o.cmdHdg = Math.round(o.hdg); logE(`Pilote auto, cap ${p3(o.cmdHdg)}°`); } else { o.manRud = Math.round(o.rud); logE('Barre manuelle'); }
  } },
  rudLim: { g: () => String(S.own.rudLim), s: (v) => (S.own.rudLim = +v) },
  motion: { g: () => R().motion, s: (v) => setMotion(v as RadarSettings['motion']) },
  orient: { g: () => R().orient, s: (v) => setOrient(v as RadarSettings['orient']) },
  offMode: { g: () => R().offMode, s: (v) => { R().offMode = v as RadarSettings['offMode']; if (v === 'CUR') offAtCursor(); } },
  vec: { g: () => R().vec, s: (v) => (R().vec = v as RadarSettings['vec']) },
  vecMin: { g: () => String(R().vecMin), s: (v) => (R().vecMin = +v) },
  stab: { g: () => R().stab, s: (v) => (R().stab = v as RadarSettings['stab']) },
  trail: { g: () => R().trail, s: (v) => (R().trail = v as RadarSettings['trail']) },
  trailMin: { g: () => String(R().trailMin), s: (v) => (R().trailMin = +v) },
  pastMin: { g: () => String(R().pastMin), s: (v) => (R().pastMin = +v) },
  band: { g: () => R().band, s: (v) => { R().band = v as RadarSettings['band']; logE(`Radar bande ${v}`); } },
  seaAuto: { g: () => (R().seaAuto ? '1' : '0'), s: (v) => (R().seaAuto = v === '1') },
  tool: { g: () => R().tool, s: (v) => (R().tool = v as RadarSettings['tool']) },
  eblRef: { g: () => R().eblRef, s: (v) => (R().eblRef = v as RadarSettings['eblRef']) },
  cpaLim: { g: () => String(R().cpaLim), s: (v) => (R().cpaLim = +v) },
  tcpaLim: { g: () => String(R().tcpaLim), s: (v) => (R().tcpaLim = +v) },
  zone: { g: () => String(R().zone), s: (v) => (R().zone = +v) },
  trial: { g: () => (R().trial ? '1' : '0'), s: (v) => setTrial(v === '1') },
  trialDelay: { g: () => String(R().trialDelay), s: (v) => { R().trialDelay = +v; R().trialT0 = S.t; } },
  vis: { g: () => S.env.vis, s: (v) => { S.env.vis = v as Visibility; logE(v === 'poor' ? 'Visibilité réduite' : 'Bonne visibilité'); } },
  rainEnv: { g: () => (S.env.rain ? '1' : '0'), s: (v) => { S.env.rain = v === '1'; if (!S.env.rain) S.rainCells = []; } },
  night: { g: () => (S.env.night ? '1' : '0'), s: (v) => (S.env.night = v === '1') },
  comp: { g: () => S.env.comp, s: (v) => (S.env.comp = v as Compliance) },
  faults: { g: () => S.env.faults, s: (v) => (S.env.faults = v as Faults) },
  scen: { g: () => S.scen, s: (v) => { S.scen = v; applyScenarioEnv(v); syncEnv(); } },
  routeShow: { g: () => (S.route?.show ? '1' : '0'), s: (v) => { if (S.route) S.route.show = v === '1'; } },
  xteLim: { g: () => String(S.route?.xteLim ?? 1), s: (v) => { if (S.route) S.route.xteLim = +v; } },
  view: { g: () => currentView, s: (v) => setView(v as View) },
  ecSafety: { g: () => String(S.ecdis.safety), s: (v) => { S.ecdis.safety = +v; logE(`ECDIS : contour de sécurité ${v} m`); } },
  ecLook: { g: () => String(S.ecdis.look), s: (v) => (S.ecdis.look = +v) },
  ecTool: { g: () => S.ecdis.tool, s: (v) => (S.ecdis.tool = v as typeof S.ecdis.tool) },
  aisRadar: { g: () => (S.ecdis.aisRadar ? '1' : '0'), s: (v) => (S.ecdis.aisRadar = v === '1') },
};

function routeCheck(): void {
  const r = S.route;
  if (!r || r.wps.length < 2) { S.ecdis.routeIssues = []; return; }
  S.ecdis.routeIssues = checkRoute(r.wps.slice(r.leg), S.ecdis.safety).map((i) => ({ ...i, leg: i.leg + r.leg }));
  const n = S.ecdis.routeIssues.length;
  if (n) logE(`Vérification de route : ${n} point(s) sous le contour de sécurité (${S.ecdis.safety} m), segment(s) ${[...new Set(S.ecdis.routeIssues.map((i) => i.leg))].join(', ')}`, 'warn');
  else logE(`Vérification de route : aucun danger sous le contour de sécurité (${S.ecdis.safety} m)`);
}

let audio: AudioContext | null = null;
function ensureAudio(): void {
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
}
function beep(freq: number, dur: number, delay = 0): void {
  if (!audio) return;
  try {
    const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.type = 'square'; g.gain.value = 0.04;
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch { /* son indisponible */ }
}

function stepTele(d: number): void {
  const o = S.own, n = clamp(o.tele + d, 0, TELE.length - 1);
  if (n !== o.tele) { o.tele = n; logE(`Machine : ${TELE[n].n}`); }
}
function stepHdg(d: number): void {
  const o = S.own;
  if (!o.ap) { o.ap = true; o.cmdHdg = Math.round(o.hdg); }
  o.cmdHdg = n360(Math.round(o.cmdHdg) + d);
  clearTimeout(hdgT);
  hdgT = window.setTimeout(() => logE(`Cap ordonné ${p3(S.own.cmdHdg)}°`), 1200);
}
function rangeStep(d: number): void {
  const i = clamp(RANGES.indexOf(R().range) + d, 0, RANGES.length - 1);
  R().range = RANGES[i];
}
/** Position du curseur, relative au porteur (NM). */
function cursorRel(): { x: number; y: number } | null {
  if (cursor.x === null || cursor.y === null) return null;
  const G = geo(), p = G.inv(cursor.x, cursor.y);
  return { x: p.x - S.own.x, y: p.y - S.own.y };
}
function offAtCursor(): void {
  const c = cursorRel();
  if (c) R().off = c;
}
function setEV(i: 0 | 1, rel: { x: number; y: number }): void {
  R().ebl[i] = brgOf(rel.x, rel.y); R().vrm[i] = Math.hypot(rel.x, rel.y);
}
let piNext = 0;
function setPI(rel: { x: number; y: number }): void {
  const b = S.own.hdg, n = vec(b + 90, 1);
  R().pi[piNext] = { b, d: rel.x * n.x + rel.y * n.y };
  piNext = (piNext + 1) % 4;
}
/** Cible (piste ou écho) la plus proche d'un point écran, à moins de 22 px. */
function pickAt(px: number, py: number): { tr?: number; tid?: number } | null {
  const G = geo();
  let best: { tr?: number; tid?: number } | null = null, bd = 22;
  for (const tr of S.tracks) {
    if (!tr.est) continue;
    const q = G.Wp(tr.est.x, tr.est.y), d = Math.hypot(q[0] - px, q[1] - py);
    if (d < bd) { bd = d; best = { tr: tr.n }; }
  }
  for (const t of S.targets) {
    if (!t.echo || S.t - t.echo.t > SWP * 1.1) continue;
    const q = G.Wp(t.echo.x, t.echo.y), d = Math.hypot(q[0] - px, q[1] - py);
    if (d < bd) { bd = d; best = { tid: t.id }; }
  }
  return best;
}
function acquireOrSelect(p: { tr?: number; tid?: number }): void {
  if (p.tr !== undefined) { S.sel = p.tr; return; }
  const ex = S.tracks.find((k) => k.tid === p.tid);
  if (ex) { S.sel = ex.n; return; }
  const t = S.targets.find((x) => x.id === p.tid);
  if (t) acquire(t, false);
}

const ACT: Record<string, (v: string) => void> = {
  play() { if (S.over) newScenario(); S.started = true; S.paused = !S.paused; },
  hdg(v) { stepHdg(+v); },
  rud(v) { const o = S.own; o.ap = false; o.manRud = +v; $in('rudSl').value = v; logE(`Barre ${rudTxt(+v)}`); },
  tele(v) { S.own.tele = +v; logE(`Machine : ${TELE[+v].n}`); },
  rng(v) { rangeStep(+v); },
  dropSel() { if (S.sel !== null) cancelTrack(S.sel); },
  dropAll() { for (const tr of [...S.tracks]) cancelTrack(tr.n); },
  trH(v) { R().trialHdg = n360(R().trialHdg + +v); },
  trS(v) { R().trialSpd = clamp(R().trialSpd + +v, 0, S.own.ship.max); },
  clrEbl() { R().ebl = [null, null]; R().vrm = [null, null]; },
  clrPi() { R().pi = [null, null, null, null]; piNext = 0; },
  randWx() {
    const e = S.env;
    e.windFrom = Math.round(Math.random() * 35) * 10; e.windKn = Math.round(4 + Math.random() * 28);
    e.curSet = Math.round(Math.random() * 35) * 10; e.curKn = Math.round(Math.random() * 25) / 10;
    syncEnv();
  },
  newRun() { newScenario(); S.started = true; S.paused = false; showTab('barre'); },
  finish() { if (!S.over && S.started) finish(); },
  ackAll() { ackAll(); },
  silence() { S.silencedUntil = performance.now() + 30000; },
  ecZoom(v) { ecZoom(+v); },
  ecCenter() { centreOnOwn(); },
  ecClr() { S.ecdis.ebl = null; S.ecdis.vrm = null; },
  layer(v) { const L = S.ecdis.layers as Record<string, boolean>; L[v] = !L[v]; },
  routeNew() {
    const o = S.own;
    S.route = { wps: [{ x: o.x, y: o.y }], leg: 0, xteLim: S.route?.xteLim ?? 1, show: true, maxXte: 0, tOver: 0 };
    S.ecdis.tool = 'ROUTE'; S.ecdis.routeIssues = [];
    logE('Nouvelle route : cliquez sur la carte ECDIS pour poser les points tournants');
  },
  routeUndo() {
    const r = S.route;
    if (r && r.wps.length > Math.max(1, r.leg + 2)) { r.wps.pop(); routeCheck(); }
  },
  routeCheck() { routeCheck(); },
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
  const Rp = S.report;
  if (!Rp || reportShown === Rp) return;
  reportShown = Rp;
  const col = Rp.score >= 85 ? 'var(--ok)' : Rp.score >= 70 ? 'var(--ac)' : Rp.score >= 50 ? 'var(--wn)' : 'var(--bd)';
  const msgs = (m: [string, string][]) => m.map((x) => `<div class="msg ${x[0]}">${esc(x[1])}</div>`).join('');
  let h = `<div class="card"><div class="score" style="color:${col}">${Rp.score}/100</div><div>${esc(Rp.grade)} · ${esc(Rp.scen)} · durée ${fT(Rp.duration)}</div>${msgs(Rp.global)}</div>`;
  if (!Rp.items.length) h += "<p class=\"dim\">Aucune situation de risque ne s'est établie (CPA toujours > 1 NM).</p>";
  for (const it of Rp.items) {
    h += `<div class="card"><b>${esc(it.label)}</b> <span class="dim">· ${esc(it.name)} ${it.L} m</span><div style="color:var(--ac);font-size:12px;margin:3px 0">${esc(it.role)}</div>${msgs(it.msgs)}<div class="msg info">L'autre navire : ${esc(it.other)}.</div></div>`;
  }
  $('report').innerHTML = h;
  showTab('bilan');
}

let lastAlertsHTML = '';
function renderAlerts(): void {
  const list = sortedAlerts();
  const html = list.length
    ? list.map((a) => `<div class="al ${a.cat}${a.acked ? '' : ' unack'}${a.active ? '' : ' gone'}"><span class="ic">${a.cat === 'alarm' ? '▲' : a.cat === 'warning' ? '●' : '◆'}</span>`
      + `<span class="tx">${esc(a.text)}${a.active ? '' : ' — disparue'}</span><span class="tm">T+${fT(a.t0)}</span>${a.acked ? '' : `<button data-ack="${a.id}">ACQ</button>`}</div>`).join('')
    : '<div class="none">Aucune alerte</div>';
  if (html !== lastAlertsHTML) { $('alerts').innerHTML = html; lastAlertsHTML = html; }
  const unack = list.filter((a) => !a.acked).length;
  $('alertCount').textContent = list.length ? `${list.length} (${unack} non acquittée${unack > 1 ? 's' : ''})` : '';
}

const seenWarn = new Set<string>();
let tick = 0;
function soundTick(): void {
  tick++;
  if (S.paused || performance.now() < S.silencedUntil) return;
  if (S.alerts.some((a) => a.cat === 'alarm' && !a.acked) && tick % 2 === 0) { beep(880, 0.12); beep(880, 0.12, 0.2); }
  for (const a of S.alerts) if (a.cat === 'warning' && !a.acked && !seenWarn.has(a.id)) { seenWarn.add(a.id); beep(660, 0.25); }
}

export function upd(): void {
  const o = S.own, Rs = S.radar, e = S.env;
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
  if (S.route && S.route.wps.length > 1) {
    const d = legData(S.route, o.x, o.y), xb = $('nXte');
    xb.textContent = `${Math.abs(d.xte).toFixed(2)} NM ${Math.abs(d.xte) < 0.005 ? '' : d.xte > 0 ? 'Td' : 'Bd'}`;
    xb.classList.toggle('over', Math.abs(d.xte) > S.route.xteLim);
    const nl = S.route.wps.length - 1;
    $('nLeg').textContent = nl > 1 ? `${p3(d.crs)}° · ${S.route.leg + 1}/${nl}` : `${p3(d.crs)}°`;
    $('nDtw').textContent = `${d.dtw.toFixed(1)} NM`;
    $('nBtw').textContent = `${p3(d.btw)}°`;
  }
  const ll = toLL(o.x, o.y), dep = depthAt(o.x, o.y), zone = tssAt(o.x, o.y);
  $('nPos').textContent = `${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`;
  const db = $('nDep');
  db.textContent = dep > 200 ? '> 200 m' : `${dep.toFixed(0)} m · ${(dep - o.ship.mmg.d).toFixed(0)} m s/q`;
  db.classList.toggle('over', dep < S.ecdis.safety);
  $('nZone').textContent = zone.name;
  $('ecRng').textContent = ecView.range + ' NM';
  $('ecDraft').textContent = `tirant d'eau ${o.ship.mmg.d.toFixed(1)} m`;
  document.querySelectorAll<HTMLButtonElement>('#ecLayers button').forEach((b) => b.classList.toggle('on', (S.ecdis.layers as Record<string, boolean>)[b.dataset.v!]));
  const info = pickedInfo().filter(Boolean);
  const pickHtml = info.length ? info.map((s, i) => (i ? `<div>${esc(s)}</div>` : `<b>${esc(s)}</b>`)).join('') : '<span class="dim">Outil Info : cliquez sur une cible AIS, une piste radar, une bouée ou le navire.</span>';
  if ($('ecPick').innerHTML !== pickHtml) $('ecPick').innerHTML = pickHtml;
  const rt = S.route;
  $('ecRouteTxt').textContent = rt ? `${rt.wps.length} point(s) tournant(s), segment actif ${rt.leg + 1}${S.ecdis.routeIssues.length ? ` · ${S.ecdis.routeIssues.length} danger(s) relevé(s)` : ''}${S.ecdis.tool === 'ROUTE' ? ' · outil tracé actif' : ''}` : '';
  $('nEnv').textContent = `Vent ${p3(e.windFrom)}°/${e.windKn} kn · Courant →${p3(e.curSet)}°/${e.curKn.toFixed(1)} kn · ${e.vis === 'poor' ? 'Brume' : 'Bonne visibilité'}${e.rain ? ' · Grains' : ''} · ${SCEN[S.scen].n}`;
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
  $('rngTxt').textContent = Rs.range + ' NM';
  $('trHTxt').textContent = p3(Rs.trialHdg) + '°';
  $('trSTxt').textContent = Rs.trialSpd + ' kn';
  const rem = trialRemaining();
  $('trCount').textContent = Rs.trial ? (rem > 0 ? `manœuvre dans ${fT(rem)}` : 'manœuvre immédiate') : '';
  $('scDesc').textContent = SCEN[S.scen].d;
  const sliders: [string, number][] = [['gainSl', Rs.gain], ['seaSl', Math.round(seaLevel() * 100)], ['rainSl', Rs.rain]];
  for (const [id, val] of sliders) {
    const el = $in(id);
    if (document.activeElement !== el) el.value = String(val);
    $(id.replace('Sl', 'Txt')).textContent = String(val);
  }
  $('capTxt').textContent = `${S.tracks.length}/${TRACK_CAPACITY} cibles suivies`;

  // table des cibles
  if (!S.tracks.length) {
    $('arpaTable').innerHTML = "<p class=\"dim\">Aucune cible suivie. Cliquez sur un écho (ou touche A sous le curseur), ou activez une zone d'acquisition (onglet Radar).</p>";
  } else {
    let h = `<table class="t"><tr><th>N°</th><th>Src</th><th>Dist</th><th>Rlv</th><th>CPA</th><th>TCPA</th><th>BCR</th><th>Route</th><th>Vit</th>${Rs.trial ? '<th>CPA ess.</th>' : ''}</tr>`;
    for (const tr of [...S.tracks].sort((a, b) => a.n - b.n)) {
      if (!tr.est) continue;
      const ok = tr.state === 'TRK';
      h += `<tr data-n="${tr.n}" class="${S.sel === tr.n ? 'sel' : ''} ${tr.danger ? 'dg' : ''}"><td>${tr.n}${tr.state === 'ACQ' ? '…' : tr.state === 'LOST' ? ' ⚠' : ''}</td><td>${aisAssociated(tr) ? 'R+A' : 'RAD'}</td><td>${tr.range.toFixed(1)}</td><td>${p3(tr.brg)}</td>`
        + `<td>${ok ? tr.cpa.toFixed(2) : '—'}</td><td>${ok && isFinite(tr.tcpa) ? (tr.tcpa / 60).toFixed(1) : '—'}</td>`
        + `<td>${ok && tr.bcr !== null ? (tr.bcr >= 0 ? 'Av ' : 'Ar ') + Math.abs(tr.bcr).toFixed(1) : '—'}</td>`
        + `<td>${ok ? p3(tr.crs) : '—'}</td><td>${ok ? tr.spd.toFixed(1) : '—'}</td>`
        + (Rs.trial ? `<td>${ok && tr.trial ? (tr.trial.tcpa > 0 ? tr.trial.cpa.toFixed(2) : 'ouvre') : '—'}</td>` : '') + '</tr>';
    }
    $('arpaTable').innerHTML = h + '</table>';
  }
  const tr = S.tracks.find((k) => k.n === S.sel);
  if (tr && tr.est) {
    const t = S.targets.find((x) => x.id === tr.tid), ok = tr.state === 'TRK', age = S.t - tr.t0;
    const st = tr.state === 'ACQ' ? 'ACQUISITION' : tr.state === 'LOST' ? 'PERDUE' : age < STABLE_TIME ? 'TENDANCE' : 'PRÉDICTION';
    $('selCard').innerHTML = `<div class="card"><b>Cible ${tr.n}</b><span class="tag">${st}</span>
    <div class="kv"><span>Source</span><b>Radar (poursuite TT), suivie depuis ${fT(age)}${t && aisAssociated(tr) && t.ais ? ` · associée AIS ${esc(t.ais.name)} (MMSI ${t.ais.mmsi})` : ''}</b>
    <span>Distance / relèvement</span><b>${tr.range.toFixed(2)} NM / ${tr.brg.toFixed(1)}°T</b>
    <span>CPA / TCPA</span><b>${ok ? tr.cpa.toFixed(2) + ' NM / ' + (isFinite(tr.tcpa) ? fMin(tr.tcpa) : '—') : `disponible après ${ACQ_TIME} s`}</b>
    <span>Route / vitesse vraies</span><b>${ok ? p3(tr.crs) + '° / ' + tr.spd.toFixed(1) + ' kn (' + (Rs.stab === 'GND' ? 'fond' : 'surface') + ')' : '…'}</b>
    <span>Évolution du relèvement</span><b>${ok ? (tr.brate >= 0 ? '+' : '') + tr.brate.toFixed(2) + '°/min' : '…'}</b>
    <span>BCR / BCT</span><b>${ok && tr.bcr !== null && tr.bct !== null ? (tr.bcr >= 0 ? "sur l'avant " : "sur l'arrière ") + Math.abs(tr.bcr).toFixed(2) + ' NM / ' + fMin(tr.bct) : '—'}</b>
    ${Rs.trial && ok && tr.trial ? `<span style="color:var(--wn)">Essai CPA / TCPA</span><b style="color:var(--wn)">${tr.trial.tcpa > 0 ? tr.trial.cpa.toFixed(2) + ' NM / ' + fMin(tr.trial.tcpa) : 'distance croissante'}</b>` : ''}</div>
    <div style="margin-top:6px;font-size:12.5px"><span class="dim">Observation :</span> ${t ? esc(visual(t)) : '—'}</div></div>`;
  } else $('selCard').innerHTML = '';

  renderAlerts();
  $('log').innerHTML = S.log.slice(0, 60).map((l) => `<div class="${l.cls}">T+${fT(l.t)} ${esc(l.txt)}</div>`).join('');
  renderReport();
}

/** Souris sur la carte ECDIS : glisser pour déplacer, molette pour l'échelle, clic selon l'outil. */
function initEcdisInput(ec: HTMLCanvasElement): void {
  let down: { x: number; y: number; moved: boolean } | null = null;
  const pos = (ev: PointerEvent | WheelEvent) => { const rc = ec.getBoundingClientRect(); return { x: ev.clientX - rc.left, y: ev.clientY - rc.top }; };
  ec.addEventListener('pointerdown', (ev) => { const p = pos(ev); down = { ...p, moved: false }; ec.setPointerCapture(ev.pointerId); });
  ec.addEventListener('pointermove', (ev) => {
    const p = pos(ev); ecur.x = p.x; ecur.y = p.y;
    if (down && (down.moved || Math.hypot(p.x - down.x, p.y - down.y) > 5)) { pan(p.x - down.x, p.y - down.y); down = { ...p, moved: true }; }
  });
  ec.addEventListener('pointerleave', () => { ecur.x = null; ecur.y = null; });
  ec.addEventListener('pointerup', (ev) => {
    const p = pos(ev), d = down; down = null;
    if (!d || d.moved) return;
    const E = S.ecdis, w = fromScr(p.x, p.y), o = S.own;
    if (E.tool === 'INFO') setPicked(ecPickAt(p.x, p.y));
    else if (E.tool === 'EBL') { E.ebl = brgOf(w.x - o.x, w.y - o.y); E.vrm = Math.hypot(w.x - o.x, w.y - o.y); }
    else if (E.tool === 'ROUTE') {
      if (scrOnLand(p.x, p.y)) { logE('Point tournant refusé : à terre', 'warn'); return; }
      if (!S.route) S.route = { wps: [{ x: o.x, y: o.y }], leg: 0, xteLim: 1, show: true, maxXte: 0, tOver: 0 };
      S.route.wps.push(w);
      const ll = toLL(w.x, w.y);
      logE(`WP${S.route.wps.length - 1} ajouté : ${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`);
      routeCheck();
    }
    upd();
  });
  ec.addEventListener('wheel', (ev) => { ev.preventDefault(); ecZoom(ev.deltaY > 0 ? 1 : -1); upd(); }, { passive: false });
}

export function initControls(canvas: HTMLCanvasElement, ec: HTMLCanvasElement): void {
  initEcdisInput(ec);
  document.querySelector('.scgrid')!.innerHTML = [1, 2, 3, 4].map((l) => `<div class="lvl">${LEVELS[l]}</div>`
    + Object.entries(SCEN).filter(([, s]) => s.lvl === l).map(([k, s]) => `<button data-v="${k}" title="${esc(s.d)}">${esc(s.n)}</button>`).join('')).join('');
  $('tele').innerHTML = TELE.map((t, i) => `<button data-act="tele" data-v="${i}" class="${t.f < 0 ? 'ast' : ''}">${t.n}</button>`).reverse().join('');
  setPalette(R().palette);

  document.addEventListener('pointerdown', ensureAudio);
  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.tab) { showTab(b.dataset.tab); return; }
    const sg = b.closest('[data-seg]') as HTMLElement | null;
    if (sg && b.dataset.v !== undefined && SEGS[sg.dataset.seg!]) { SEGS[sg.dataset.seg!].s(b.dataset.v); upd(); return; }
    if (b.dataset.act && ACT[b.dataset.act]) { ACT[b.dataset.act](b.dataset.v ?? ''); upd(); }
  });
  // listes rafraîchies en continu : action dès l'appui
  $('arpaTable').addEventListener('pointerdown', (ev) => {
    const tr = (ev.target as HTMLElement).closest('tr[data-n]') as HTMLElement | null;
    if (tr) { S.sel = +tr.dataset.n!; upd(); }
  });
  $('alerts').addEventListener('pointerdown', (ev) => {
    const b = (ev.target as HTMLElement).closest('button[data-ack]') as HTMLElement | null;
    if (b) { ackAlert(b.dataset.ack!); upd(); }
  });
  $in('rudSl').addEventListener('input', (e) => {
    const o = S.own; o.ap = false; o.manRud = +(e.target as HTMLInputElement).value;
    clearTimeout(rudT);
    rudT = window.setTimeout(() => logE(`Barre ${rudTxt(o.manRud)}`), 900);
    upd();
  });
  $in('gainSl').addEventListener('input', (e) => { R().gain = +(e.target as HTMLInputElement).value; });
  $in('seaSl').addEventListener('input', (e) => { R().sea = +(e.target as HTMLInputElement).value; R().seaAuto = false; });
  $in('rainSl').addEventListener('input', (e) => { R().rain = +(e.target as HTMLInputElement).value; });
  for (const id of ['wDir', 'wSpd', 'cDir', 'cSpd']) {
    $in(id).addEventListener('input', () => {
      const e = S.env;
      e.windFrom = +$in('wDir').value; e.windKn = +$in('wSpd').value; e.curSet = +$in('cDir').value; e.curKn = +$in('cSpd').value / 10;
      envTxt();
    });
  }

  // scope : curseur, clic, molette
  const setCursor = (ev: PointerEvent | MouseEvent) => {
    const rc = canvas.getBoundingClientRect();
    cursor.x = ev.clientX - rc.left; cursor.y = ev.clientY - rc.top;
  };
  canvas.addEventListener('pointermove', setCursor);
  canvas.addEventListener('pointerleave', () => { cursor.x = null; cursor.y = null; });
  canvas.addEventListener('pointerdown', (ev) => {
    setCursor(ev);
    const p = pickAt(cursor.x!, cursor.y!);
    if (p) acquireOrSelect(p);
    else {
      const rel = cursorRel();
      if (rel) {
        if (R().tool === 'EV1') setEV(0, rel);
        else if (R().tool === 'EV2') setEV(1, rel);
        else if (R().tool === 'PI') setPI(rel);
      }
    }
    upd();
  });
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); rangeStep(ev.deltaY > 0 ? 1 : -1); upd(); }, { passive: false });

  // clavier
  document.addEventListener('keydown', (ev) => {
    const tg = ev.target as HTMLElement;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ensureAudio();
    const k = ev.key;
    let done = true;
    if (k === ' ') ACT.play('');
    else if (k === 'ArrowLeft') stepHdg(ev.shiftKey ? -10 : -1);
    else if (k === 'ArrowRight') stepHdg(ev.shiftKey ? 10 : 1);
    else if (k === 'ArrowUp') stepTele(1);
    else if (k === 'ArrowDown') stepTele(-1);
    else if (k === '+' || k === '=') rangeStep(1);
    else if (k === '-' || k === '_') rangeStep(-1);
    else if (k === 'a' || k === 'A') { if (cursor.x !== null && cursor.y !== null) { const p = pickAt(cursor.x, cursor.y); if (p) acquireOrSelect(p); } }
    else if (k === 'Delete' || k === 'Backspace') ACT.dropSel('');
    else if (k === '1' || k === '2') { const c = cursorRel(); if (c) setEV(k === '1' ? 0 : 1, c); }
    else if (k === 'p' || k === 'P') { const c = cursorRel(); if (c) setPI(c); }
    else if (k === 'o' || k === 'O') { if (R().offMode === 'OFF') { R().offMode = 'CUR'; offAtCursor(); } else R().offMode = 'OFF'; }
    else if (k === 'm' || k === 'M') setMotion(R().motion === 'RM' ? 'TM' : 'RM');
    else if (k === 'n' || k === 'N') { const seq: RadarSettings['orient'][] = R().motion === 'TM' ? ['NU', 'CU'] : ['NU', 'CU', 'HU']; setOrient(seq[(seq.indexOf(R().orient) + 1) % seq.length]); }
    else if (k === 't' || k === 'T') setTrial(!R().trial);
    else if (k === 'Enter') ackAll();
    else if (k === 'v' || k === 'V') setView(currentView === 'radar' ? 'ecdis' : currentView === 'ecdis' ? 'split' : 'radar');
    else if (k === 'c' || k === 'C') centreOnOwn();
    else done = false;
    if (done) { ev.preventDefault(); upd(); }
  });

  setInterval(soundTick, 1000);
  syncEnv();
}
