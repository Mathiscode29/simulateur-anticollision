import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';
import { FRAME_DT, buildDebrief, frameAt } from '../src/sim/debrief';
import { n360 } from '../src/core/util';

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.faults = 'off'; S.env.comp = 'disc';
  newScenario(); S.started = true; S.paused = false;
}
const run = (min: number, each?: () => void) => { for (let i = 0; i < min * 240 && !S.over; i++) { simStep(); each?.(); } };
const has = (re: RegExp) => buildDebrief()!.keys.some((k) => re.test(k.text));

describe('enregistrement de l’exercice', () => {
  it('une image toutes les 5 s, ordres barre / machine regroupés, alertes', () => {
    start('r15');
    run(3, () => {
      if (Math.abs(S.t - 60) < 0.01) S.own.cmdHdg = n360(S.own.cmdHdg + 10);
      if (Math.abs(S.t - 61) < 0.01) S.own.cmdHdg = n360(S.own.cmdHdg + 10); // deux appuis rapprochés = un seul ordre
      if (Math.abs(S.t - 90) < 0.01) S.own.tele = 5;
    });
    finish();
    const R = S.rec!;
    expect(R.frames.length).toBeGreaterThanOrEqual((180 / FRAME_DT) - 1);
    const helm = R.ev.filter((e) => e.kind === 'helm');
    expect(helm.length).toBe(1);
    expect(helm[0].text).toMatch(/Td 20°/);
    expect(R.ev.some((e) => e.kind === 'engine' && /AV demie/.test(e.text))).toBe(true);
  });
  it('interpolation entre deux images', () => {
    start('r15'); run(1); finish();
    const d = buildDebrief()!, a = d.frames[2], b = d.frames[3], m = frameAt(d, (a.t + b.t) / 2);
    expect(m.o.x).toBeCloseTo((a.o.x + b.o.x) / 2, 6);
    expect(m.o.y).toBeCloseTo((a.o.y + b.o.y) / 2, 6);
  });
});

describe('analyse du débrief', () => {
  it('non privilégié qui ne fait rien : fenêtre de manœuvre, seuil tardif, absence de manœuvre, distance minimale', () => {
    start('r15'); run(30); finish();
    expect(has(/fenêtre de manœuvre/)).toBe(true);
    expect(has(/jugée tardive \(R8a\)/)).toBe(true);
    expect(has(/aucune manœuvre de votre part/)).toBe(true);
    expect(has(/distance minimale/)).toBe(true);
    const d = buildDebrief()!;
    for (let i = 1; i < d.keys.length; i++) expect(d.keys[i].t).toBeGreaterThanOrEqual(d.keys[i - 1].t);
    const e = d.enc[0];
    expect(Math.abs(e.minR - S.enc[e.tid].minR)).toBeLessThan(0.15); // échantillonnage 5 s
  });
  it('non privilégié qui manœuvre : la manœuvre apparaît avec son TCPA', () => {
    start('r15');
    let done = false;
    run(30, () => {
      const e = Object.values(S.enc)[0];
      if (!done && e && S.t - e.t0 > 120) { S.own.cmdHdg = n360(S.own.cmdHdg + 50); done = true; }
    });
    finish();
    expect(has(/votre changement de cap sur tribord \(TCPA/)).toBe(true);
    expect(has(/aucune manœuvre de votre part/)).toBe(false);
  });
  it('privilégié face à un non-privilégié passif : jalons R17a(ii) puis R17b', () => {
    start('r17');
    for (const t of S.targets) t.beh = 'passive';
    run(30); finish();
    expect(has(/R17a\(ii\)/)).toBe(true);
    expect(has(/R17b/)).toBe(true);
  });
});
