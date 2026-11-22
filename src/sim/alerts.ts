/**
 * Gestion des alertes radar, sans DOM.
 *
 * Exigences de MSC.192(79) : alarme CPA/TCPA (5.29.1), alerte de cible perdue (5.29.4), entrée dans la zone
 * d'acquisition (5.29.3), indication de la cause de chaque alerte. Cycle de vie inspiré de la gestion des
 * alertes de passerelle (MSC.302(87)) :
 *  - active non acquittée (clignote, signal sonore pour une alarme) ;
 *  - active acquittée (fixe) ;
 *  - disparue non acquittée (reste affichée jusqu'à l'acquittement) ;
 *  - disparue et acquittée : retirée de la liste.
 * Les alertes « événement » (entrée en zone) restent actives jusqu'à leur acquittement.
 */
import { S, type AlertCat } from '../core/state';

export const TRACK_CAPACITY = 40;

function want(map: Map<string, { cat: AlertCat; text: string }>, id: string, cat: AlertCat, text: string) {
  map.set(id, { cat, text });
}

/** Signale un événement ponctuel (reste présent jusqu'à l'acquittement). */
export function raiseEvent(id: string, cat: AlertCat, text: string): void {
  if (S.alerts.some((a) => a.id === id)) return;
  S.alerts.push({ id, cat, text, t0: S.t, active: true, acked: false, event: true });
}

/** Recalcule les alertes de condition à partir des pistes. */
export function updateAlerts(): void {
  const w = new Map<string, { cat: AlertCat; text: string }>();
  for (const tr of S.tracks) {
    if (tr.danger) want(w, `cpa-${tr.n}`, 'alarm', `Cible ${tr.n} : CPA/TCPA sous les limites`);
    if (tr.state === 'LOST') want(w, `lost-${tr.n}`, 'warning', `Cible ${tr.n} perdue (dernière position affichée)`);
  }
  if (S.tracks.length >= TRACK_CAPACITY - 2) want(w, 'capacity', 'caution', `Capacité de suivi presque atteinte (${S.tracks.length}/${TRACK_CAPACITY})`);

  for (const a of S.alerts) {
    if (a.event) continue;
    const c = w.get(a.id);
    if (c) { a.active = true; w.delete(a.id); } else a.active = false;
  }
  for (const [id, c] of w) S.alerts.push({ id, cat: c.cat, text: c.text, t0: S.t, active: true, acked: false, event: false });
  S.alerts = S.alerts.filter((a) => !(a.acked && (!a.active || a.event)));
}

export function ackAlert(id: string): void {
  const a = S.alerts.find((x) => x.id === id);
  if (a) a.acked = true;
  if (id.startsWith('zone-')) { const tr = S.tracks.find((k) => `zone-${k.tid}` === id); if (tr) tr.auto = false; }
  updateAlertsAfterAck();
}

export function ackAll(): void {
  for (const a of S.alerts) a.acked = true;
  for (const tr of S.tracks) tr.auto = false;
  updateAlertsAfterAck();
}

function updateAlertsAfterAck(): void {
  S.alerts = S.alerts.filter((a) => !(a.acked && (!a.active || a.event)));
}

/** Vrai si l'alarme CPA/TCPA de la piste n'est pas encore acquittée (le symbole doit clignoter). */
export function isUnackedDanger(n: number): boolean {
  return S.alerts.some((a) => a.id === `cpa-${n}` && !a.acked);
}
export function isUnackedLost(n: number): boolean {
  return S.alerts.some((a) => a.id === `lost-${n}` && !a.acked);
}

const RANK: Record<AlertCat, number> = { alarm: 0, warning: 1, caution: 2 };
/** Alertes triées : priorité, puis non acquittées d'abord, puis les plus récentes. */
export function sortedAlerts() {
  return [...S.alerts].sort((a, b) => RANK[a.cat] - RANK[b.cat] || Number(a.acked) - Number(b.acked) || b.t0 - a.t0);
}
