import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep, DT } from '../src/sim/loop';
import { predict, predicted } from '../src/sim/predict';
import { initOwnDynamics } from '../src/sim/physics';
import { mmgForces } from '../src/sim/mmg';
import { KVLCC2 } from '../src/core/ships/kvlcc2';

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.faults = 'off';
  newScenario(); S.started = true; S.paused = false;
  S.targets = []; // porteur seul
}
const run = (s: number) => { for (let i = 0; i < Math.round(s / DT) && !S.over; i++) simStep(); };

describe("Propulseur d'étrave", () => {
  it('navire stoppé : la poussée sur tribord fait abattre sur tribord', () => {
    start('r15');
    S.env.windKn = 0; S.env.curKn = 0;
    initOwnDynamics(S.own, 0); S.own.tele = 2; S.own.ap = false; S.own.manRud = 0;
    const h0 = S.own.hdg;
    S.own.thr = 1;
    run(180);
    expect(S.own.thrAct).toBeCloseTo(1, 5);
    const turned = ((S.own.hdg - h0 + 540) % 360) - 180;
    expect(turned).toBeGreaterThan(3); // abattée franche sur tribord en 3 min
    expect(S.own.rot).toBeGreaterThan(0);
    S.own.thr = -1;
    run(30);
    expect(S.own.thrAct).toBeLessThan(0); // inversion progressive (rampe)
  });
  it("efficacité réduite avec la vitesse : effet négligeable à l'allure mer", () => {
    const T = 240e3, xT = 0.44 * KVLCC2.L;
    const at = (u: number) => mmgForces(KVLCC2, { u, v: 0, r: 0 }, { delta: 0, n: 0, windSpeed: 0, windAngle: 0, thrust: T, xT }).N
      - mmgForces(KVLCC2, { u, v: 0, r: 0 }, { delta: 0, n: 0, windSpeed: 0, windAngle: 0 }).N;
    expect(at(0)).toBeCloseTo(T * xT, -3);
    expect(at(1.03) / at(0)).toBeLessThan(0.55); // ≈ 2 kn
    expect(at(8) / at(0)).toBeLessThan(0.02); // ≈ 15,5 kn
  });
});

describe('Prédicteur', () => {
  it("la trajectoire prédite coïncide avec la simulation quand on ne touche pas aux commandes", () => {
    start('r15');
    S.env.windKn = 15; S.env.curKn = 1;
    S.own.ap = false; S.own.manRud = 20; // barre à tribord 20
    const p = predict(60);
    run(60);
    const end = p[p.length - 1];
    expect(end.t).toBeCloseTo(60, 5);
    expect(Math.hypot(end.x - S.own.x, end.y - S.own.y) * 1852).toBeLessThan(15); // < 15 m après 1 min
    expect(Math.abs(((end.hdg - S.own.hdg + 540) % 360) - 180)).toBeLessThan(0.5);
  });
  it("ne modifie pas le porteur et suit le pilote automatique", () => {
    start('r15');
    const o = S.own, before = JSON.stringify({ x: o.x, y: o.y, hdg: o.hdg, u: o.u, r: o.r, rud: o.rud });
    o.cmdHdg = (o.hdg + 40) % 360;
    S.ecdis.pred = 180;
    const p = predicted();
    expect(JSON.stringify({ x: o.x, y: o.y, hdg: o.hdg, u: o.u, r: o.r, rud: o.rud })).toBe(before);
    const turned = ((p[p.length - 1].hdg - o.hdg + 540) % 360) - 180;
    expect(turned).toBeGreaterThan(15); // le prédicteur suit l'abattée commandée au pilote
    expect(predicted()).toBe(p); // cache tant que rien ne change
  });
});
