/**
 * AIS (système d'identification automatique), sans DOM.
 *
 * - Équipement : classe A pour les navires de commerce (SOLAS), classe A ou absent pour les pêcheurs,
 *   classe B ou absent pour les voiliers. Quelques navires de commerce n'émettent pas (AIS coupé ou en panne).
 * - Cadence des messages de position (UIT-R M.1371) : classe A, 10 s de 0 à 14 kn (3⅓ s en giration),
 *   6 s de 14 à 23 kn (2 s en giration), 2 s au-delà, 3 min au mouillage ; classe B (CS), 30 s au-delà de 2 kn,
 *   3 min en dessous.
 * - Position GNSS du bord émetteur (bruit ≈ 10 m) ; l'affichage extrapole depuis le dernier message.
 * - Association avec une piste radar (MSC.192(79) 5.33) : écart de position, de route et de vitesse sous des seuils.
 */
import { S, type Ais, type Target, type TargetType, type Track } from '../core/state';
import { K2N, adiff, brgOf, gauss, pick } from '../core/util';

const STATUS: Record<TargetType, string> = {
  power: 'en route au moteur', small: 'en route au moteur', fish: 'en pêche', sail: 'à la voile',
  nuc: 'non maître de sa manœuvre', ram: 'capacité de manœuvre restreinte', anchor: 'au mouillage',
};

/** Statut de navigation AIS correspondant au type de navire. */
export const aisStatus = (type: TargetType): string => STATUS[type];

/** Équipement AIS tiré selon le type de navire ; le nom émis est celui du navire. */
export function makeAis(type: TargetType, name: string): Ais | null {
  const r = Math.random();
  let cls: 'A' | 'B' | null;
  if (type === 'sail') cls = r < 0.4 ? 'B' : null;
  else if (type === 'fish') cls = r < 0.7 ? 'A' : null;
  else if (type === 'small') cls = r < 0.9 ? 'A' : null;
  else cls = r < 0.95 ? 'A' : null;
  if (!cls) return null;
  const mid = pick([226, 227, 228, 235, 244, 255, 311, 351, 370, 538, 563, 636]);
  return { mmsi: mid * 1e6 + Math.floor(Math.random() * 1e6), name, cls, on: true, next: S.t + Math.random() * 10, rep: null, status: STATUS[type] };
}

/** Intervalle nominal (s) entre deux messages de position. */
export function aisInterval(t: Target): number {
  const sog = Math.hypot(t.vx, t.vy), turning = Math.abs(t.rot) > 0.1;
  if (t.ais?.cls === 'B') return sog > 2 ? 30 : 180;
  if (sog < 0.5 && t.type === 'nuc') return 10;
  if (sog < 0.5) return 180;
  if (sog <= 14) return turning ? 10 / 3 : 10;
  if (sog <= 23) return turning ? 2 : 6;
  return 2;
}

export function aisStep(): void {
  for (const t of S.targets) {
    const a = t.ais;
    if (!a || !a.on || S.t < a.next) continue;
    a.rep = { t: S.t, x: t.x + gauss() * 0.005, y: t.y + gauss() * 0.005, sog: Math.hypot(t.vx, t.vy), cog: brgOf(t.vx, t.vy), hdg: t.hdg };
    a.next = S.t + aisInterval(t);
  }
}

/** Position AIS affichée : dernier message extrapolé en route et vitesse fond (au plus 3 min). */
export function aisPos(t: Target): { x: number; y: number } | null {
  const r = t.ais?.rep;
  if (!r) return null;
  const dt = Math.min(180, S.t - r.t), v = { x: Math.sin((r.cog * Math.PI) / 180) * r.sog, y: Math.cos((r.cog * Math.PI) / 180) * r.sog };
  return { x: r.x + v.x * K2N * dt, y: r.y + v.y * K2N * dt };
}

/** Cible AIS perdue : plus de message depuis plus de 6 intervalles nominaux (et au moins 60 s). */
export function aisLost(t: Target): boolean {
  const a = t.ais;
  return !!a && !!a.rep && S.t - a.rep.t > Math.max(60, 6 * aisInterval(t));
}

/** Association piste radar / cible AIS (même navire) selon les écarts de position, route et vitesse. */
export function aisAssociated(tr: Track): Target | null {
  if (!tr.est || tr.state !== 'TRK') return null;
  const t = S.targets.find((x) => x.id === tr.tid);
  if (!t || !t.ais?.rep || aisLost(t)) return null;
  const p = aisPos(t)!, d = Math.hypot(p.x - tr.est.x, p.y - tr.est.y);
  const sog = t.ais.rep.sog, spd = Math.hypot(tr.est.vx, tr.est.vy);
  if (d > Math.max(0.15, 0.02 * tr.range)) return null;
  if (Math.abs(sog - spd) > 3) return null;
  if (sog > 3 && Math.abs(adiff(t.ais.rep.cog, brgOf(tr.est.vx, tr.est.vy))) > 25) return null;
  return t;
}
