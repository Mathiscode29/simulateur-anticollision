import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { ackAlert, ackAll, isUnackedDanger } from '../src/sim/alerts';
import { ACQ_TIME, cancelTrack } from '../src/sim/radar';

function start(): void {
  S.scen = 'r15'; applyScenarioEnv('r15'); S.env.comp = 'disc';
  newScenario(); S.started = true; S.radar.zone = 12; S.radar.cpaLim = 1; S.radar.tcpaLim = 30;
}
const run = (s: number) => { for (let i = 0; i < s * 4; i++) simStep(); };

describe('alertes radar (MSC.192(79) 5.29)', () => {
  it('entrée en zone : acquisition automatique et alarme jusqu’à l’acquittement', () => {
    start(); run(5);
    const z = S.alerts.filter((a) => a.id.startsWith('zone-'));
    expect(z.length).toBeGreaterThan(0);
    expect(z.every((a) => a.cat === 'alarm' && !a.acked)).toBe(true);
    expect(S.tracks.every((t) => t.auto)).toBe(true);
    ackAll();
    expect(S.alerts.some((a) => a.id.startsWith('zone-'))).toBe(false);
    expect(S.tracks.every((t) => !t.auto)).toBe(true);
  });

  it('alarme CPA/TCPA : pas pendant l’acquisition, puis active ; acquittée, elle reste affichée tant que la condition dure', () => {
    start(); run(ACQ_TIME - 10);
    expect(S.alerts.some((a) => a.id.startsWith('cpa-'))).toBe(false);
    run(40);
    const a = S.alerts.find((x) => x.id.startsWith('cpa-'));
    expect(a).toBeDefined();
    const n = +a!.id.slice(4);
    expect(isUnackedDanger(n)).toBe(true);
    ackAlert(a!.id);
    expect(isUnackedDanger(n)).toBe(false);
    run(2);
    expect(S.alerts.find((x) => x.id === a!.id)?.acked).toBe(true);
  });

  it('cible annulée : son alarme disparaît une fois acquittée', () => {
    start(); run(ACQ_TIME + 30);
    const a = S.alerts.find((x) => x.id.startsWith('cpa-'))!;
    cancelTrack(+a.id.slice(4));
    expect(S.alerts.find((x) => x.id === a.id)?.active).toBe(false); // disparue, non acquittée : reste affichée
    ackAlert(a.id);
    expect(S.alerts.find((x) => x.id === a.id)).toBeUndefined();
  });
});
