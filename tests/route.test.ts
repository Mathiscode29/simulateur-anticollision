import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { legData, makeRoute } from '../src/sim/route';
import { SCEN, applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';

describe('route prévue et écart latéral (XTE)', () => {
  it('XTE positif sur tribord de la route, négatif sur bâbord', () => {
    const r = makeRoute(0, 0, 0, [[0, 10]]); // route au 000°
    expect(legData(r, 0.5, 3).xte).toBeCloseTo(0.5, 6);
    expect(legData(r, -0.3, 3).xte).toBeCloseTo(-0.3, 6);
    expect(legData(r, 0, 3).crs).toBeCloseTo(0, 6);
  });
  it('route multi-segments : points tournants à la bonne place', () => {
    const r = makeRoute(0, 0, 0, [[0, 4], [90, 5]]);
    expect(r.wps.length).toBe(3);
    expect(r.wps[1].x).toBeCloseTo(0, 6); expect(r.wps[1].y).toBeCloseTo(4, 6);
    expect(r.wps[2].x).toBeCloseTo(5, 6); expect(r.wps[2].y).toBeCloseTo(4, 6);
  });
  it('en suivant la route, le porteur passe au segment suivant et l’écart reste faible', () => {
    S.scen = 'c_wp'; applyScenarioEnv('c_wp'); S.env.windKn = 0; S.env.curKn = 0;
    S.env.faults = 'off'; newScenario(); S.started = true;
    let switched = false;
    for (let i = 0; i < 4 * 60 * 30; i++) {
      simStep();
      const d = legData(S.route!, S.own.x, S.own.y);
      // pilotage simple sur la route : cap = route du segment, corrigé de l'écart
      S.own.cmdHdg = (d.crs - Math.max(-20, Math.min(20, d.xte * 40)) + 360) % 360;
      if (S.route!.leg === 1) switched = true;
    }
    expect(switched).toBe(true);
    expect(Math.abs(legData(S.route!, S.own.x, S.own.y).xte)).toBeLessThan(0.3);
  });
  it('bilan : l’écart de route figure dans le rapport', () => {
    finish();
    expect(S.report!.global.some((m) => m[1].includes('Écart de route maximal'))).toBe(true);
  });
  it('rencontre après le point tournant : la cible est placée et la situation se crée sur la nouvelle route', () => {
    let ok = 0;
    for (let k = 0; k < 4; k++) {
      S.scen = 'c_wp'; applyScenarioEnv('c_wp'); S.env.faults = 'off'; newScenario(); S.started = true;
      expect(S.targets.length).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < 4 * 60 * 32; i++) {
        simStep();
        const d = legData(S.route!, S.own.x, S.own.y);
        S.own.cmdHdg = (d.crs - Math.max(-20, Math.min(20, d.xte * 40)) + 360) % 360;
      }
      if (Object.values(S.enc).some((e) => e.role === 'giveway')) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(3);
  });
  it('tous les scénarios ont une description et un niveau', () => {
    for (const s of Object.values(SCEN)) { expect(s.d.length).toBeGreaterThan(10); expect([1, 2, 3, 4]).toContain(s.lvl); }
  });
});
