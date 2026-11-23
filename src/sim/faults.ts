/**
 * Avaries et changements de statut des cibles, sans DOM.
 *
 * - Avarie de machine : le navire devient non maître de sa manœuvre (NUC), perd son erre puis dérive au vent.
 * - Avarie de barre : barre bloquée d'un bord, machine stoppée, NUC ; le navire tourne en perdant son erre.
 * - Abordage entre deux cibles : les deux deviennent NUC.
 * Une avarie peut être réparée (retour au statut précédent et à la route). Chaque changement est annoncé
 * comme un message de sécurité VHF / AIS, avec le nom du navire, sa piste radar et sa position relative,
 * et le statut AIS est mis à jour. Les feux et marques suivent le nouveau statut (visual.ts).
 *
 * Fréquence des avaries aléatoires (réglage « Avaries ») : rares ≈ une par 40 min, fréquentes ≈ une par 12 min,
 * sur l'ensemble des navires à moins de 10 NM ; jamais dans les 5 premières minutes, au plus deux à la fois.
 */
import { S, logE, type Fault, type Target } from '../core/state';
import { brgOf, n360, p3, pick, rnd } from '../core/util';
import { raiseEvent } from './alerts';
import { aisStatus } from './ais';

const RATE = { off: 0, rare: 1 / 2400, freq: 1 / 720 };

/** Désignation d'un navire dans les messages : nom, MMSI, piste radar, relèvement et distance depuis le porteur. */
export function callName(t: Target): string {
  const o = S.own, tr = S.tracks.find((k) => k.tid === t.id && k.state !== 'LOST');
  const b = n360(brgOf(t.x - o.x, t.y - o.y)), r = Math.hypot(t.x - o.x, t.y - o.y);
  return `${t.vname}${t.ais ? ` (MMSI ${t.ais.mmsi})` : ' (sans AIS)'}${tr ? `, piste ${tr.n}` : ''}, au ${p3(b)}° à ${r.toFixed(1)} NM`;
}

function announce(t: Target, text: string): void {
  const msg = `${t.ais?.on ? 'AIS / VHF 16' : 'VHF 16'} · ${callName(t)} : ${text}`;
  logE(msg, 'warn');
  raiseEvent(`fault-${t.id}-${Math.round(S.t)}`, 'warning', msg);
}

const NUC_SIG = '2 feux rouges superposés, de jour 2 boules';

/** Met une cible en avarie (NUC). `quiet` : pas de message (abordage annoncé globalement). */
export function breakDown(t: Target, kind: Fault['kind'], quiet = false, repairable = true): void {
  if (t.fault?.active) return;
  const prev = t.type === 'nuc' ? t.fault?.prev ?? 'power' : t.type;
  const f: Fault = { kind, active: true, prev, lane: t.lane };
  if (repairable && kind !== 'collision' && Math.random() < 0.5) f.until = S.t + rnd(900, 1800);
  if (kind === 'steering') f.jam = Math.random() < 0.5 ? 1 : -1;
  t.fault = f;
  t.type = 'nuc'; t.cmdStw = 0; t.lane = undefined;
  t.ai.state = 'transit'; t.ai.role = null; t.ai.vs = undefined;
  if (t.ais) t.ais.status = aisStatus('nuc');
  if (quiet) return;
  if (kind === 'engine') announce(t, `avarie de machine, non maître de sa manœuvre, en dérive (${NUC_SIG}).`);
  else announce(t, `avarie de barre, barre bloquée ${f.jam! > 0 ? 'à droite' : 'à gauche'}, machine stoppée : non maître de sa manœuvre (${NUC_SIG}).`);
}

/** Fin d'avarie : retour au statut précédent, reprise de la route et de la vitesse. */
export function repair(t: Target): void {
  const f = t.fault;
  if (!f?.active || !f.prev) return;
  t.type = f.prev; t.lane = f.lane;
  t.cmdStw = t.baseStw; t.cmdHdg = t.baseHdg;
  t.fault = { ...f, active: false, until: undefined };
  if (t.ais) t.ais.status = aisStatus(t.type);
  announce(t, 'avarie réparée, de nouveau maître de sa manœuvre, reprend sa route.');
}

/** Abordage entre deux cibles : les deux deviennent NUC. */
export function targetCollision(a: Target, b: Target): void {
  for (const t of [a, b]) { t.stw *= 0.3; t.fault = undefined; breakDown(t, 'collision', true); }
  const msg = `VHF 16 · ABORDAGE entre ${callName(a)} et ${b.vname} : les deux navires sont non maîtres de leur manœuvre (${NUC_SIG}).`;
  logE(msg, 'bad');
  raiseEvent(`coll-${a.id}-${b.id}`, 'warning', msg);
}

/** Pas des avaries (appelé toutes les 2 s simulées). */
export function faultStep(dt: number): void {
  const ts = S.targets;
  for (const t of ts) {
    const f = t.fault;
    if (f && !f.active && f.at !== undefined && S.t >= f.at) { t.fault = undefined; breakDown(t, f.kind, false, false); } // avarie programmée : pas de réparation
    else if (f?.active && f.until !== undefined && S.t >= f.until) repair(t);
  }
  // abordages entre cibles
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    if (a.fault?.kind === 'collision' && b.fault?.kind === 'collision' && a.fault.active && b.fault.active) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < ((a.L + b.L) / 2 / 1852) * 0.7) targetCollision(a, b);
  }
  // avaries aléatoires
  const rate = RATE[S.env.faults];
  if (!rate || S.t < 300 || ts.filter((t) => t.fault?.active).length >= 2) return;
  const o = S.own, ok = ts.filter((t) => (t.type === 'power' || t.type === 'small') && !t.fault && t.stw > 3 && Math.hypot(t.x - o.x, t.y - o.y) < 10);
  if (ok.length && Math.random() < rate * dt) breakDown(pick(ok), Math.random() < 0.65 ? 'engine' : 'steering');
}

/** Consigne de cap d'un navire à la barre bloquée : il continue de tourner tant qu'il a de l'erre. */
export function jammedHeading(t: Target): number | null {
  const j = t.fault?.active ? t.fault.jam : undefined;
  return j && t.stw > 1 ? n360(t.hdg + j * 30) : null;
}

