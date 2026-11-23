import { describe, expect, it } from 'vitest';
import { SHIPS } from '../src/core/data';
import { IMO, autopilotChange, initialTurning, stopping, turningCircle, zigzag } from '../src/sim/manoeuvres';
import { S } from '../src/core/state';
import { SCEN, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';

const vlcc = SHIPS.vlcc;

describe('KVLCC2 (MMG) — critères OMI MSC.137(76)', () => {
  const tc = turningCircle(vlcc, 35);
  it('giration 35° : avance ≤ 4,5 L et diamètre tactique ≤ 5 L', () => {
    expect(tc.advance).toBeLessThanOrEqual(IMO.advance);
    expect(tc.tactical).toBeLessThanOrEqual(IMO.tactical);
    // ordre de grandeur réaliste pour un VLCC
    expect(tc.advance).toBeGreaterThan(2.3);
    expect(tc.tactical).toBeGreaterThan(2.3);
  });
  it('giration symétrique bâbord / tribord (hélice simple non modélisée en couple)', () => {
    const port = turningCircle(vlcc, -35);
    expect(Math.abs(port.tactical - tc.tactical)).toBeLessThan(0.1);
  });
  it('perte de vitesse en giration établie importante (navire plein)', () => {
    expect(tc.speedLoss).toBeGreaterThan(0.4);
  });
  it('abattée initiale : ≤ 2,5 L pour 10° de cap avec 10° de barre', () => {
    expect(initialTurning(vlcc)).toBeLessThanOrEqual(IMO.initial);
  });
  it('zigzag 10°/10° et 20°/20° : dépassements dans les limites', () => {
    const z10 = zigzag(vlcc, 10), z20 = zigzag(vlcc, 20);
    expect(z10.first).toBeLessThanOrEqual(IMO.zz10first(z10.LV));
    expect(z10.second).toBeLessThanOrEqual(IMO.zz10second(z10.LV));
    expect(z20.first).toBeLessThanOrEqual(IMO.zz20first);
    expect(z10.first).toBeGreaterThan(0);
  });
  it('arrêt d\'urgence : distance ≤ 15 L', () => {
    const st = stopping(vlcc);
    expect(st.track).toBeLessThanOrEqual(IMO.stop);
    expect(st.time).toBeGreaterThan(300); // un VLCC ne s'arrête pas en 5 min
  });
  it('pilote automatique : dépassement < 3° sur un changement de cap de 30°', () => {
    expect(autopilotChange(vlcc, 30)).toBeLessThan(3);
  });
});

describe('intégration du modèle MMG dans la simulation', () => {
  it('scénario R15 avec le VLCC : pas de valeur non numérique, vitesse stable', () => {
    S.scen = 'r15'; S.env.vis = SCEN.r15.vis ?? 'good';
    S.env.faults = 'off'; newScenario(); S.started = true;
    for (let i = 0; i < 240 * 20; i++) simStep();
    expect(Number.isFinite(S.own.x) && Number.isFinite(S.own.hdg)).toBe(true);
    expect(S.own.stw).toBeGreaterThan(14.5);
    expect(S.own.stw).toBeLessThan(16.5);
  });
});
