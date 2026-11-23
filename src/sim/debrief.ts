/**
 * Enregistrement de l'exercice et analyse pour le débrief, sans DOM.
 *
 * Enregistrement (recStep, chaque seconde simulée) :
 *  - une image toutes les 5 s : porteur (position, cap, vitesses, barre, machine) et toutes les cibles (vérité terrain) ;
 *  - les événements : ordres à la barre et à la machine (regroupés quand l'ordre est stable 4 s), nouvelles alertes,
 *    entrées du journal de passerelle.
 *
 * Analyse (buildDebrief, après la fin de l'exercice) : pour chaque situation de rapprochement, séries distance / CPA /
 * TCPA vraies, jalons pédagogiques et moments clés horodatés, alignés sur les seuils de l'évaluation (assessment.ts) :
 *  - non privilégié (R14, R15/16, R13 rattrapant, R18) : fenêtre de manœuvre à TCPA 12 min, au plus tard 5 min (R8a, R16) ;
 *  - visibilité réduite (R19) : au plus tard 6 min ;
 *  - privilégié : maintien (R17a(i)), action seule possible quand l'autre ne réagit pas (R17a(ii)), obligatoire au très près (R17b).
 * Ces jalons sont des repères de bonne pratique : le RIPAM ne fixe pas de valeurs chiffrées.
 */
import { S, type AlertCat, type Encounter, type MsgLevel, type RecEvent, type RecFrame, type Recording, type Role } from '../core/state';
export type { RecEvent, RecFrame, Recording } from '../core/state';
import { ROLE_TXT, TELE } from '../core/data';
import { K2N, adiff, brgOf, cpaOf, fMin, fT, n360, p3 } from '../core/util';

export const FRAME_DT = 5;

export function newRecording(): Recording {
  return { frames: [], ev: [], ships: {}, acc: FRAME_DT, cmd: S.own.cmdHdg, cmdT: 0, cmdLast: S.own.cmdHdg, tele: S.own.tele, rud: S.own.manRud, rudT: 0, rudLast: S.own.manRud, seenAlerts: new Set(), lastLog: S.log[0] };
}

const ALV: Record<AlertCat, MsgLevel> = { alarm: 'bad', warning: 'warn', caution: 'info' };

function frame(): RecFrame {
  const o = S.own;
  return {
    t: S.t, o: { x: o.x, y: o.y, hdg: o.hdg, stw: o.stw, vx: o.vx, vy: o.vy, rud: o.rud, tele: o.tele },
    s: S.targets.map((t) => ({ id: t.id, x: t.x, y: t.y, hdg: t.hdg, stw: t.stw, vx: t.vx, vy: t.vy, type: t.type })),
  };
}

/** Enregistrement (appelé chaque seconde simulée). */
export function recStep(dt: number): void {
  const R = S.rec, o = S.own;
  if (!R) return;
  for (const t of S.targets) if (!R.ships[t.id]) R.ships[t.id] = { vname: t.vname, name: t.name, L: t.L };
  R.acc += dt;
  if (R.acc >= FRAME_DT) { R.acc = 0; R.frames.push(frame()); if (R.frames.length > 4000) R.frames.splice(0, 1); }
  // cap ordonné (pilote automatique) : un événement quand l'ordre est stable depuis 4 s
  if (o.ap) {
    if (o.cmdHdg !== R.cmd) { R.cmd = o.cmdHdg; R.cmdT = S.t; }
    else if (R.cmdT && S.t - R.cmdT >= 4 && Math.abs(adiff(R.cmd, R.cmdLast)) >= 1) {
      const d = adiff(R.cmd, R.cmdLast);
      R.ev.push({ t: R.cmdT, kind: 'helm', lvl: 'info', text: `Cap ordonné ${p3(R.cmd)}° (${d > 0 ? 'Td' : 'Bd'} ${Math.abs(Math.round(d))}°)` });
      R.cmdLast = R.cmd; R.cmdT = 0;
    }
  } else {
    if (o.manRud !== R.rud) { R.rud = o.manRud; R.rudT = S.t; }
    else if (R.rudT && S.t - R.rudT >= 4 && o.manRud !== R.rudLast) {
      R.ev.push({ t: R.rudT, kind: 'helm', lvl: 'info', text: o.manRud === 0 ? 'Barre à zéro' : `Barre ${Math.abs(o.manRud)}° ${o.manRud > 0 ? 'Td' : 'Bd'}` });
      R.rudLast = o.manRud; R.rudT = 0;
    }
  }
  if (o.tele !== R.tele) {
    R.ev.push({ t: S.t, kind: 'engine', lvl: 'info', text: `Machine : ${TELE[o.tele].n}` });
    R.tele = o.tele;
  }
  for (const a of S.alerts) if (!R.seenAlerts.has(a.id)) { R.seenAlerts.add(a.id); R.ev.push({ t: a.t0, kind: 'alert', lvl: ALV[a.cat], text: a.text }); }
  // nouvelles entrées du journal (S.log est rangé du plus récent au plus ancien)
  const fresh = [];
  for (const l of S.log) { if (l === R.lastLog) break; fresh.push(l); }
  if (S.log.length) R.lastLog = S.log[0];
  for (const l of fresh.reverse()) R.ev.push({ t: l.t, kind: 'log', lvl: l.cls === 'bad' ? 'bad' : l.cls === 'warn' ? 'warn' : 'info', text: l.txt });
}

/** Clôture : dernière image et ordre en attente. */
export function recClose(): void {
  const R = S.rec;
  if (!R) return;
  if (!R.frames.length || R.frames[R.frames.length - 1].t < S.t) R.frames.push(frame());
  R.ev.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- analyse

export interface EncPoint { t: number; r: number; brg: number; cpa: number; tcpa: number }
export interface EncDebrief {
  tid: number; label: string; role: Role; roleTxt: string; series: EncPoint[];
  tMin: number; minR: number; t0: number; msgs: [MsgLevel, string][]; give: boolean;
}
export interface Debrief { t0: number; t1: number; frames: RecFrame[]; enc: EncDebrief[]; keys: RecEvent[]; ev: RecEvent[]; ships: Recording['ships'] }

const GIVE: Role[] = ['giveway', 'giveway18', 'headon', 'overtaking', 'R19'];

/** Distance, relèvement vrai et CPA/TCPA du porteur vis-à-vis d'une cible dans une image. */
export function relOf(f: RecFrame, tid: number): EncPoint | null {
  const s = f.s.find((x) => x.id === tid);
  if (!s) return null;
  const rx = s.x - f.o.x, ry = s.y - f.o.y, c = cpaOf(rx, ry, (s.vx - f.o.vx) * K2N, (s.vy - f.o.vy) * K2N);
  return { t: f.t, r: Math.hypot(rx, ry), brg: n360(brgOf(rx, ry)), cpa: c.cpa, tcpa: c.tcpa };
}

/** Désignation stable d'une cible dans le débrief : piste radar s'il y en a une, et nom. */
export function shipLabel(tid: number): string {
  const tr = S.tracks.find((k) => k.tid === tid), sh = S.rec?.ships[tid];
  return `${tr ? `Cible ${tr.n}` : 'Écho non acquis'} — ${sh?.vname ?? '?'}`;
}

export function buildDebrief(): Debrief | null {
  const R = S.rec;
  if (!R || R.frames.length < 2) return null;
  const frames = R.frames, keys: RecEvent[] = [], encs: EncDebrief[] = [];
  const items = S.report?.items ?? [];
  for (const e of Object.values(S.enc) as Encounter[]) {
    const series: EncPoint[] = [];
    for (const f of frames) { const p = relOf(f, e.tid); if (p) series.push(p); }
    if (!series.length) continue;
    let mi = 0;
    series.forEach((p, i) => { if (p.r < series[mi].r) mi = i; });
    const label = shipLabel(e.tid), give = GIVE.includes(e.role);
    const t = S.targets.find((x) => x.id === e.tid), item = items.find((it) => it.tid === e.tid);
    const enc: EncDebrief = { tid: e.tid, label, role: e.role, roleTxt: ROLE_TXT[e.role] || e.role, series, tMin: series[mi].t, minR: series[mi].r, t0: e.t0, msgs: item?.msgs ?? e.res?.m ?? [], give };
    encs.push(enc);
    const at = (tt: number) => series.reduce((b, p) => (Math.abs(p.t - tt) < Math.abs(b.t - tt) ? p : b), series[0]);
    const p0 = at(e.t0);
    keys.push({ t: e.t0, kind: 'key', lvl: 'info', tid: e.tid, text: `${label} : situation établie — ${enc.roleTxt}. Relèvement ${p3(p0.brg)}°, ${p0.r.toFixed(1)} NM, CPA ${p0.cpa.toFixed(2)} NM, TCPA ${fMin(p0.tcpa)}.` });
    const after = series.filter((p) => p.t >= e.t0 && p.tcpa > 0);
    if (give) {
      const late = e.role === 'R19' ? 6 : 5;
      const w = after.find((p) => p.tcpa <= 12 * 60 && p.cpa < 1);
      if (w) keys.push({ t: w.t, kind: 'key', lvl: 'ok', tid: e.tid, text: `${label} : fenêtre de manœuvre (repère de bonne pratique : TCPA 12 min, ${w.r.toFixed(1)} NM). ${e.role === 'R19' ? 'R19d : manœuvrer largement à temps.' : 'R16 : manœuvrer tôt et franchement.'}` });
      const l = after.find((p) => p.tcpa <= late * 60 && p.cpa < 1);
      if (l) keys.push({ t: l.t, kind: 'key', lvl: 'warn', tid: e.tid, text: `${label} : TCPA ${late} min (${l.r.toFixed(1)} NM). Une manœuvre engagée après ce point est jugée tardive (R8a).` });
    } else if (e.role === 'standon' || e.role === 'overtaken' || e.role === 'standon18') {
      const tgtLate = (tt: number) => !e.tgtActT || e.tgtActT > tt;
      const a = after.find((p) => p.tcpa <= 8 * 60 && p.cpa < 0.5 && tgtLate(p.t));
      if (a) keys.push({ t: a.t, kind: 'key', lvl: 'warn', tid: e.tid, text: `${label} : l'autre n'a toujours pas manœuvré (TCPA ${fMin(a.tcpa)}). R17a(ii) : vous pouvez agir seul ; R34d : 5 sons brefs au moins pour signaler le doute.` });
      const b = after.find((p) => p.r < 1.5 && p.cpa < 0.3 && tgtLate(p.t));
      if (b) keys.push({ t: b.t, kind: 'key', lvl: 'bad', tid: e.tid, text: `${label} : ${b.r.toFixed(1)} NM, CPA ${b.cpa.toFixed(2)} NM. R17b : l'abordage ne peut plus être évité par le seul non privilégié, vous devez manœuvrer.` });
    }
    const A = e.fc && e.fs ? (e.fc.t <= e.fs.t ? e.fc : e.fs) : e.fc || e.fs;
    if (e.fc) keys.push({ t: e.fc.t, kind: 'key', lvl: 'info', tid: e.tid, text: `${label} : votre changement de cap sur ${e.fc.dir > 0 ? 'tribord' : 'bâbord'} (TCPA ${fMin(e.fc.tcpa)}, ${e.fc.r.toFixed(1)} NM) ; abattée maximale ${Math.round(e.maxDev)}°.` });
    if (e.fs) keys.push({ t: e.fs.t, kind: 'key', lvl: 'info', tid: e.tid, text: `${label} : votre réduction de vitesse (TCPA ${fMin(e.fs.tcpa)}, ${e.fs.r.toFixed(1)} NM) ; réduction maximale ${Math.round(e.maxRed * 100)} %.` });
    if (!A && give && e.minR < 1) keys.push({ t: series[mi].t, kind: 'key', lvl: 'bad', tid: e.tid, text: `${label} : aucune manœuvre de votre part.` });
    if (e.tgtActT) keys.push({ t: e.tgtActT, kind: 'key', lvl: 'info', tid: e.tid, text: `${label} : l'autre navire manœuvre${t?.ai.done ? ` (${t.ai.done.split(' ; ')[0]})` : ''}.` });
    keys.push({ t: series[mi].t, kind: 'key', lvl: series[mi].r < 0.5 ? 'bad' : series[mi].r < 1 ? 'warn' : 'ok', tid: e.tid, text: `${label} : distance minimale ${series[mi].r.toFixed(2)} NM au ${p3(series[mi].brg)}°.` });
  }
  for (const ev of R.ev) if (ev.lvl === 'bad' || (ev.kind === 'log' && /ÉCHOUEMENT|ABORDAGE|Situation modifiée|VHF/.test(ev.text))) keys.push(ev);
  keys.sort((a, b) => a.t - b.t);
  return { t0: frames[0].t, t1: frames[frames.length - 1].t, frames, enc: encs, keys, ev: R.ev, ships: R.ships };
}

/** Image interpolée à l'instant t (positions et caps), pour un rejeu fluide. */
export function frameAt(d: Debrief, t: number): RecFrame {
  const F = d.frames;
  if (t <= F[0].t) return F[0];
  if (t >= F[F.length - 1].t) return F[F.length - 1];
  let lo = 0, hi = F.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t <= t) lo = m; else hi = m; }
  const a = F[lo], b = F[hi], k = (t - a.t) / (b.t - a.t);
  const L = (u: number, v: number) => u + (v - u) * k, H = (u: number, v: number) => n360(u + adiff(v, u) * k);
  return {
    t, o: { x: L(a.o.x, b.o.x), y: L(a.o.y, b.o.y), hdg: H(a.o.hdg, b.o.hdg), stw: L(a.o.stw, b.o.stw), vx: L(a.o.vx, b.o.vx), vy: L(a.o.vy, b.o.vy), rud: L(a.o.rud, b.o.rud), tele: b.o.tele },
    s: a.s.map((s) => {
      const z = b.s.find((x) => x.id === s.id);
      return z ? { ...z, x: L(s.x, z.x), y: L(s.y, z.y), hdg: H(s.hdg, z.hdg), stw: L(s.stw, z.stw), vx: L(s.vx, z.vx), vy: L(s.vy, z.vy) } : s;
    }),
  };
}

export const fmtT = (t: number): string => 'T+' + fT(t);
