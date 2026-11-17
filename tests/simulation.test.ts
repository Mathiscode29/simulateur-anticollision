import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { n360 } from '../src/core/util';
import { SCEN, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';

function start(scen: string, comp: 'disc' | 'real' | 'hostile' = 'real'): void {
  S.scen = scen;
  S.env.vis = SCEN[scen].vis ?? 'good';
  S.env.comp = comp;
  newScenario();
  S.started = true;
  S.radar.autoAcq = true;
}
const run = (minutes: number, each?: () => void) => {
  for (let i = 0; i < minutes * 240; i++) { simStep(); each?.(); if (S.over) break; }
};

describe('scénarios (exécution sans affichage)', () => {
  for (const key of Object.keys(SCEN)) {
    it(`${key} : génère des cibles et des situations à risque, sans erreur`, () => {
      start(key);
      expect(S.targets.length).toBeGreaterThan(0);
      run(5);
      expect(Object.keys(S.enc).length).toBeGreaterThan(0);
      run(35);
      finish();
      expect(S.report).not.toBeNull();
    });
  }
});

describe('évaluation du chef de quart', () => {
  it('R15 : abattée franche de 60° sur tribord à TCPA ~11 min → pas de faute sur la cible', () => {
    let ok = 0;
    for (let k = 0; k < 5; k++) {
      start('r15', 'disc');
      let acted = false;
      run(40, () => {
        const tr = S.tracks.find((x) => x.state === 'TRK' && x.danger);
        if (!acted && tr && tr.tcpa < 11 * 60) { S.own.cmdHdg = n360(S.own.hdg + 60); acted = true; }
      });
      const e = Object.values(S.enc).find((x) => x.role === 'giveway');
      finish();
      if (e && e.minR > 1 && !e.res!.m.some((m) => m[0] === 'bad')) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(4);
  });

  it('R15 : ne rien faire en non privilégié → situation sanctionnée', () => {
    start('r15', 'disc');
    S.targets.forEach((t) => (t.beh = 'passive'));
    run(40);
    finish();
    const it = S.report!.items.find((i) => i.role.includes('non privilégié'));
    expect(it).toBeDefined();
    expect(it!.msgs.some((m) => m[0] === 'bad')).toBe(true);
  });
});
