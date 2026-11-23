import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { brgOf } from '../src/core/util';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { DT, simStep } from '../src/sim/loop';
import { SWP } from '../src/sim/radar';

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.faults = 'off'; S.env.rain = false;
  newScenario(); S.started = true; S.paused = false;
}

describe('balayage continu', () => {
  it("chaque écho est daté du passage du faisceau sur son relèvement, à l'intérieur du pas", () => {
    start('dense');
    let n = 0;
    for (let k = 0; k < 120; k++) {
      const a0 = S.sweep, before = new Map(S.targets.map((t) => [t.id, t.echo]));
      simStep();
      for (const t of S.targets) {
        if (!t.echo || t.echo === before.get(t.id)) continue; // pas repeint pendant ce pas
        const e = t.echo, rot = ((((e.b - a0) % 360) + 360) % 360) / 360 * SWP;
        expect(e.t).toBeGreaterThan(S.t - DT - 1e-9);
        expect(e.t).toBeLessThanOrEqual(S.t + 1e-9);
        expect(e.t).toBeCloseTo(S.t - DT + rot, 6);
        expect(Math.abs(brgOf(e.x - S.own.x, e.y - S.own.y) - e.b) % 360).toBeLessThan(1);
        expect(before.get(t.id) ?? null).toBe(t.echoPrev ?? null); // l'écho précédent reste disponible pour l'affichage
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });
  it("l'affichage en retard d'un pas trouve toujours l'écho de côte du tour précédent", () => {
    start('pdc_cross');
    for (let k = 0; k < 20; k++) simStep();
    let ahead = 0, ok = 0;
    for (let k = 0; k < 40; k++) {
      simStep();
      const co = S.coast!;
      for (const f of [0, 0.1, 0.2]) {
        const tv = S.t - DT + f;
        for (let i = 0; i < co.t.length; i++) {
          if (co.r0[i] > 25 || co.t[i] <= tv) continue; // repeint avant tv, ou trop loin
          ahead++;
          const ag = tv - co.tp[i];
          if (ag >= 0 && ag <= SWP * 1.05) ok++;
        }
      }
    }
    expect(ahead).toBeGreaterThan(50);
    expect(ok / ahead).toBeGreaterThan(0.9);
  });
  it('le clutter du tour précédent est conservé un tour, pas davantage', () => {
    start('a_voilier');
    for (let k = 0; k < 60; k++) simStep();
    expect(S.clutter.length).toBeGreaterThan(0);
    for (const p of S.clutter) expect(S.t - p.t).toBeLessThanOrEqual(SWP + DT + 1e-9);
  });
});
