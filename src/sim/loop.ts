/** Pas de simulation (0,25 s simulées). Indépendant du DOM : utilisable en test. */
import { S } from '../core/state';
import { stepOwn, stepT } from './physics';
import { radarStep, estimate, rainStep, SWP } from './radar';
import { updateAlerts } from './alerts';
import { routeStep } from './route';
import { aiStep } from './rules';
import { encStep, checkCol } from './assessment';

export const DT = 0.25;

function pushHist(): void {
  const p: Record<number, [number, number]> = {};
  for (const t of S.targets) if (t.echo && S.t - t.echo.t < SWP * 1.1) p[t.id] = [t.x, t.y];
  S.hist.push({ t: S.t, ox: S.own.x, oy: S.own.y, p });
  while (S.hist.length && S.hist[0].t < S.t - 1260) S.hist.shift();
}

export function simStep(dt = DT): void {
  S.t += dt;
  stepOwn(dt);
  routeStep(dt);
  for (const t of S.targets) stepT(t, dt);
  rainStep(dt);
  radarStep(dt);
  S.aiAcc += dt;
  if (S.aiAcc >= 2) { S.aiAcc = 0; for (const t of S.targets) aiStep(t); }
  S.encAcc += dt;
  if (S.encAcc >= 1) { S.encAcc = 0; encStep(); checkCol(); }
  S.histAcc += dt;
  if (S.histAcc >= 10) { S.histAcc = 0; pushHist(); }
  for (const tr of S.tracks) estimate(tr);
  updateAlerts();
}
