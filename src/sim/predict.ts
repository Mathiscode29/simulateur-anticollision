/**
 * Prédicteur de position du porteur (« predictor » des ECDIS et des aides à l'accostage).
 *
 * On intègre le même modèle que la simulation (MMG 3 DDL, appareil à gouverner, machine, propulseur d'étrave,
 * vent et courant du moment) sur une copie de l'état du porteur, en gardant les ordres en cours : angle de barre
 * ordonné ou pilote automatique, transmetteur, propulseur. La trajectoire obtenue est donc celle que suivrait le
 * navire si personne ne touchait aux commandes. Pas de DOM : utilisable en test.
 */
import { S, type OwnShip } from '../core/state';
import { stepOwnMMG } from './physics';

export interface PredPose { t: number; x: number; y: number; hdg: number; stw: number }

/** Pas d'intégration du prédicteur (s). */
export const PRED_DT = 0.5;

/**
 * Trajectoire prédite sur `horizon` secondes, une pose toutes les `every` secondes (la première à t = 0).
 * Le porteur réel n'est pas modifié.
 */
export function predict(horizon: number, every = 5, own: OwnShip = S.own): PredPose[] {
  const c: OwnShip = { ...own };
  const out: PredPose[] = [{ t: 0, x: c.x, y: c.y, hdg: c.hdg, stw: c.stw }];
  const n = Math.round(horizon / PRED_DT), k = Math.max(1, Math.round(every / PRED_DT));
  for (let i = 1; i <= n; i++) {
    stepOwnMMG(c, c.ship.mmg, PRED_DT, S.t + i * PRED_DT);
    if (i % k === 0 || i === n) out.push({ t: i * PRED_DT, x: c.x, y: c.y, hdg: c.hdg, stw: c.stw });
  }
  return out;
}

let cache: { key: string; poses: PredPose[] } | null = null;
/** Prédiction mise en cache : recalculée seulement si le temps simulé, les ordres ou l'horizon ont changé. */
export function predicted(horizon = S.ecdis.pred): PredPose[] {
  const o = S.own;
  const key = `${S.t}|${horizon}|${o.tele}|${o.ap ? o.cmdHdg : 'm' + o.manRud}|${o.rudLim}|${o.thr ?? 0}|${o.x}|${o.y}`;
  if (!cache || cache.key !== key) cache = { key, poses: horizon > 0 ? predict(horizon) : [] };
  return cache.poses;
}
