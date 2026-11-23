import { describe, expect, it } from 'vitest';
import { S, type Behaviour } from '../src/core/state';
import { applyScenarioEnv, mkT, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { breakDown, faultStep } from '../src/sim/faults';
import { adiff } from '../src/core/util';

function calm(key = 'r15'): void {
  S.scen = key; applyScenarioEnv(key);
  Object.assign(S.env, { windKn: 0, curKn: 0, vis: 'good', comp: 'disc', faults: 'off' });
  newScenario(); S.started = true; S.paused = false;
}
const run = (min: number, each?: () => void) => { for (let i = 0; i < min * 240 && !S.over; i++) { simStep(); each?.(); } };

/** Deux cibles en route de collision (B croise de tribord de A), porteur éloigné et stoppé. */
function crossingPair(bA: Behaviour, bB: Behaviour) {
  calm(); S.targets = [];
  S.own.x = 60; S.own.y = 60; S.own.tele = 2;
  const A = mkT('power', 0, 12, 0, 0), B = mkT('power', 270, 12, 3, 3);
  A.beh = bA; B.beh = bB;
  let min = 99;
  run(25, () => { min = Math.min(min, Math.hypot(A.x - B.x, A.y - B.y)); });
  return { A, B, min };
}

describe('les cibles s’évitent entre elles', () => {
  it('trafic discipliné : le non-privilégié (R15) vient sur tribord, passage à distance', () => {
    const { A, B, min } = crossingPair('good', 'good');
    expect(min).toBeGreaterThan(0.5);
    expect(A.ai.done ?? '').toMatch(/tribord.*pour éviter/);
    expect(B.ai.done ?? '').not.toMatch(/pour éviter/); // le privilégié maintient (R17a)
  });
  it('comportement « à contresens » : le non-privilégié vient sur bâbord', () => {
    const { A } = crossingPair('wrong', 'good');
    expect((A.ai.done ?? '') + (A.ai.info ?? '')).toMatch(/bâbord/);
  });
  it('deux navires passifs : rapprochement dangereux, sauvé (ou non) à la dernière minute', () => {
    const good = crossingPair('good', 'good').min, bad = crossingPair('passive', 'passive').min;
    expect(bad).toBeLessThan(0.5);
    expect(bad).toBeLessThan(good);
  });
});

describe('avaries et changements de statut', () => {
  it('avarie de machine : NUC, perte d’erre, statut AIS et message nominatif', () => {
    calm(); S.targets = [];
    const t = mkT('power', 90, 14, -3, 2);
    t.ais = { mmsi: 227000001, name: t.vname, cls: 'A', on: true, next: 0, rep: null, status: 'en route au moteur' };
    breakDown(t, 'engine', false, false);
    expect(t.type).toBe('nuc');
    expect(t.ais.status).toBe('non maître de sa manœuvre');
    const al = S.alerts.find((a) => a.text.includes(t.vname));
    expect(al?.text).toMatch(/non maître de sa manœuvre/);
    expect(al?.cat).toBe('warning');
    run(10);
    expect(t.stw).toBeLessThan(4);
  });
  it('avarie programmée en croisement : le porteur privilégié devient non privilégié (R18)', () => {
    let ok = 0;
    for (let k = 0; k < 3; k++) {
      calm('c_avarie');
      const tid = S.targets[0].id;
      run(20);
      const e = S.enc[tid];
      if (e && e.role === 'giveway18' && (e.chg ?? '').includes('R18')) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(2);
  });
  it('abordage entre deux cibles : les deux deviennent NUC, message d’abordage', () => {
    const { A, B } = crossingPair('passive', 'passive');
    // si la dernière minute a suffi, provoquer le contact
    if (A.fault?.kind !== 'collision') { B.x = A.x + 0.01; B.y = A.y; faultStep(2); }
    expect(A.type).toBe('nuc'); expect(B.type).toBe('nuc');
    expect(S.alerts.some((a) => a.text.includes('ABORDAGE'))).toBe(true);
  });
  it('avaries aléatoires « fréquentes » : au moins une en une heure de trafic dense', () => {
    let n = 0;
    for (let k = 0; k < 2 && !n; k++) {
      calm('dense'); S.env.faults = 'freq'; S.own.tele = 2;
      run(60);
      n = S.targets.filter((t) => t.fault).length;
    }
    expect(n).toBeGreaterThan(0);
  });
  it('barre bloquée : le navire tourne tant qu’il a de l’erre', () => {
    calm(); S.targets = [];
    const t = mkT('power', 0, 14, -5, 5), h0 = t.hdg;
    breakDown(t, 'steering', true, false);
    run(2);
    expect(Math.abs(adiff(t.hdg, h0))).toBeGreaterThan(20);
  });
});
