import { describe, expect, it } from 'vitest';
import { roleOf, type Vessel } from '../src/sim/rules';
import { cpaOf, vec } from '../src/core/util';

/** Place B au relèvement relatif `rel` (deg) à `dist` NM de A, cap de B = hdgB. */
function at(A: Vessel, rel: number, dist: number, hdgB: number, stwB: number, type: Vessel['type'] = 'power'): Vessel {
  const v = vec(A.hdg + rel, dist);
  return { x: A.x + v.x, y: A.y + v.y, hdg: hdgB, stw: stwB, type };
}
const own: Vessel = { x: 0, y: 0, hdg: 0, stw: 15, type: 'power' };

describe('roleOf — RIPAM partie B', () => {
  it('R14 : routes opposées, autre dans l’axe → face à face', () => {
    expect(roleOf(own, at(own, 2, 6, 180, 14), 'good')).toBe('headon');
  });
  it('R15 : navire sur tribord qui croise → non privilégié', () => {
    expect(roleOf(own, at(own, 45, 5, 270, 14), 'good')).toBe('giveway');
  });
  it('R17 : navire sur bâbord qui croise → privilégié', () => {
    expect(roleOf(own, at(own, 315, 5, 90, 14), 'good')).toBe('standon');
  });
  it('R13 : on rattrape un navire plus lent devant → rattrapant', () => {
    expect(roleOf(own, at(own, 0, 3, 5, 8), 'good')).toBe('overtaking');
  });
  it('R13 : un navire plus rapide arrive de l’arrière → rattrapé', () => {
    expect(roleOf(own, at(own, 170, 3, 0, 22), 'good')).toBe('overtaken');
  });
  it('R13 prime sur R15 : arrivée à 120° sur tribord, plus rapide → rattrapé', () => {
    expect(roleOf(own, at(own, 125, 2, 340, 22), 'good')).toBe('overtaken');
  });
  it('R18 : chalutier en pêche sur bâbord → on s’écarte quand même', () => {
    expect(roleOf(own, at(own, 330, 4, 90, 3, 'fish'), 'good')).toBe('giveway18');
  });
  it('R18 : le chalutier se voit privilégié', () => {
    const f = at(own, 330, 4, 90, 3, 'fish');
    expect(roleOf(f, own, 'good')).toBe('standon18');
  });
  it('R19 : visibilité réduite → pas de privilégié', () => {
    expect(roleOf(own, at(own, 45, 5, 270, 14), 'poor')).toBe('R19');
  });
});

describe('cpaOf', () => {
  it('route de collision : CPA nul, TCPA = distance / vitesse relative', () => {
    const c = cpaOf(0, 6, 0, -20 / 3600);
    expect(c.cpa).toBeCloseTo(0, 6);
    expect(c.tcpa).toBeCloseTo(6 / (20 / 3600), 3);
  });
  it('passage déjà dépassé : TCPA négatif', () => {
    expect(cpaOf(0, -2, 0, -10 / 3600).tcpa).toBeLessThan(0);
  });
});
