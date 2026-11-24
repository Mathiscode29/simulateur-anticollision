import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { fmtLat, fmtLon, toLL, toXY } from '../src/core/geo';
import { n360 } from '../src/core/util';
import { CHART, checkRoute, coastRays, depthAt, loadChart, onLand, tssAt } from '../src/sim/chart';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';
import { initOwnDynamics } from '../src/sim/physics';
import { aisInterval, aisPos, aisStep } from '../src/sim/ais';
import { masked, radarStep } from '../src/sim/radar';

const dm = (d: number, m: number) => d + m / 60;
const at = (lat: number, lon: number) => toXY(lat, lon);

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.comp = 'disc';
  S.env.faults = 'off'; newScenario(); S.started = true; S.paused = false;
}
/** Remplace le cap du porteur instantanément (ligne droite, régime établi). */
function setHeading(h: number): void {
  const o = S.own;
  o.hdg = o.cmdHdg = n360(h); initOwnDynamics(o, o.ship.max);
  const w = { x: Math.sin((o.hdg * Math.PI) / 180) * o.stw, y: Math.cos((o.hdg * Math.PI) / 180) * o.stw };
  o.vx = w.x + Math.sin((S.env.curSet * Math.PI) / 180) * S.env.curKn; o.vy = w.y + Math.cos((S.env.curSet * Math.PI) / 180) * S.env.curKn;
}
const run = (min: number) => { for (let i = 0; i < min * 240 && !S.over; i++) simStep(); };

describe('géoréférencement WGS 84', () => {
  it('aller-retour latitude/longitude ↔ plan local', () => {
    loadChart('pdc');
    const p = toXY(dm(51, 6.1), dm(1, 38.19)), q = toLL(p.x, p.y);
    expect(q.lat).toBeCloseTo(dm(51, 6.1), 9);
    expect(q.lon).toBeCloseTo(dm(1, 38.19), 9);
    // 1' de latitude = 1 NM ; 1' de longitude ≈ cos(51°) NM
    expect(toXY(dm(51, 1), 1.5).y - toXY(51, 1.5).y).toBeCloseTo(1, 6);
    expect(toXY(51, 1.5 + 1 / 60).x).toBeCloseTo(Math.cos((51 * Math.PI) / 180), 6);
  });
  it('format marin', () => {
    expect(fmtLat(dm(51, 2.345))).toBe("51°02,345'N");
    expect(fmtLon(-dm(6, 30))).toBe("006°30,000'W");
  });
});

describe('carte du Pas-de-Calais', () => {
  it('terre, bancs et eau profonde aux bons endroits', () => {
    loadChart('pdc');
    const dover = at(dm(51, 9), dm(1, 15)), calais = at(dm(50, 57.5), dm(1, 51.5));
    expect(onLand(dover.x, dover.y)).toBe(true);
    expect(onLand(calais.x, calais.y)).toBe(true);
    const varne = at(dm(50, 58.5), dm(1, 20)), colbart = at(dm(50, 53), dm(1, 20)), mid = at(dm(51, 0), dm(1, 34));
    expect(depthAt(varne.x, varne.y)).toBeLessThan(5);
    expect(depthAt(colbart.x, colbart.y)).toBeLessThan(5);
    expect(depthAt(mid.x, mid.y)).toBeGreaterThan(35);
  });
  it('zones du DST (COLREG.2/Circ.59)', () => {
    loadChart('pdc');
    const k = (lat: number, lon: number) => { const p = at(lat, lon); return tssAt(p.x, p.y).kind; };
    expect(k(dm(51, 0), dm(1, 34))).toBe('laneNE');
    expect(k(dm(51, 4.6), dm(1, 31.5))).toBe('laneSW');
    expect(k(dm(50, 53), dm(1, 20))).toBe('sep');
    expect(k(dm(50, 48), dm(1, 30))).toBe('itz');
    // sens de circulation : NE ≈ 045°, SW ≈ 225°
    const ne = at(dm(51, 0), dm(1, 34)), sw = at(dm(51, 4.6), dm(1, 31.5));
    expect(Math.abs(tssAt(ne.x, ne.y).dir! - 45)).toBeLessThan(15);
    expect(Math.abs(tssAt(sw.x, sw.y).dir! - 225)).toBeLessThan(15);
  });
  it('lancer de rayons : la côte masque ce qui est derrière', () => {
    loadChart('pdc');
    const p = at(dm(51, 0), dm(1, 34)), r = coastRays(p.x, p.y);
    const east = r.r0[90 * 2];
    expect(east).toBeGreaterThan(5); expect(east).toBeLessThan(20);
    start('pdc_cross');
    S.own.x = p.x; S.own.y = p.y; S.coast = null; radarStep(0.25);
    expect(masked(90, east + 1)).toBe(true);
    expect(masked(90, east - 1)).toBe(false);
  });
  it('vérification de route : le Varne est détecté sous le contour de sécurité', () => {
    loadChart('pdc');
    const a = at(dm(51, 1), dm(1, 16)), b = at(dm(50, 56), dm(1, 24));
    expect(checkRoute([a, b], 30).length).toBeGreaterThan(0);
    const c = at(dm(51, 2), dm(1, 36)), d = at(dm(50, 58), dm(1, 30));
    expect(checkRoute([c, d], 30).length).toBe(0);
  });
});

describe('AIS', () => {
  it('cadence des messages de position (UIT-R M.1371)', () => {
    start('pdc_rogue');
    const t = S.targets.find((x) => x.ais && x.ais.cls === 'A' && x.stw > 9 && x.stw < 14)!;
    expect(t).toBeDefined();
    expect(aisInterval(t)).toBe(10);
    t.ais!.next = 0; aisStep();
    expect(t.ais!.rep).not.toBeNull();
    const p = aisPos(t)!;
    expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeLessThan(0.05);
  });
});

describe('règle 10 et ECDIS', () => {
  it('suivre la voie descendante dans le bon sens : conforme à R10(b)(i)', () => {
    start('pdc_rogue'); S.targets = [];
    run(6); finish();
    expect(S.report!.global.some((m) => m[0] === 'ok' && m[1].includes('R10(b)(i)'))).toBe(true);
  });
  it('remonter la voie descendante : sanctionné (R10(b)(i))', () => {
    start('pdc_rogue'); S.targets = [];
    setHeading(S.own.hdg + 180);
    run(4); finish();
    expect(S.report!.global.some((m) => m[0] === 'bad' && m[1].includes('contresens'))).toBe(true);
    expect(S.alerts.some((a) => a.id === 'tss-wrong')).toBe(true);
  });
  it('traversée à angle droit : conforme à R10(c) ; traversée oblique : sanctionnée', () => {
    start('pdc_cross'); S.targets = [];
    run(30); finish();
    expect(S.report!.global.some((m) => m[0] === 'ok' && m[1].includes('R10(c)'))).toBe(true);
    start('pdc_cross'); S.targets = [];
    setHeading(S.own.hdg - 40);
    run(30); finish();
    expect(S.report!.global.some((m) => m[0] === 'bad' && m[1].includes('R10(c)'))).toBe(true);
  });
  it('cap sur le Varne : alarme de contour de sécurité, puis échouement', () => {
    start('pdc_rogue'); S.targets = [];
    const v = at(dm(50, 58.5), dm(1, 20));
    setHeading(Math.atan2(v.x - S.own.x, v.y - S.own.y) * 180 / Math.PI);
    let alarm = false;
    for (let i = 0; i < 100 * 240 && !S.over; i++) { simStep(); if (S.alerts.some((a) => a.id === 'ecdis-sc')) alarm = true; }
    expect(alarm).toBe(true);
    expect(S.grounded).toBe(true);
    expect(S.report!.grade).toBe('Échouement');
    expect(S.report!.global[0][1]).toContain('R6(a)(vi)');
  });
  it('le trafic des voies reste dans les voies et en eau profonde', () => {
    for (const key of ['pdc_cross', 'pdc_varne', 'pdc_rogue']) {
      start(key);
      for (const t of S.targets) t.beh = 'passive';
      S.own.tele = 2; // porteur stoppé, hors du jeu
      run(20);
      for (const t of S.targets.filter((x) => x.lane)) {
        expect(depthAt(t.x, t.y)).toBeGreaterThan(15);
        const k = tssAt(t.x, t.y).kind;
        if (k === 'none') expect(Math.hypot(t.x, t.y)).toBeGreaterThan(12); // sorti par une extrémité de la carte
      }
    }
    expect(CHART.key).toBe('pdc');
  });
  it('garde de profondeur : une cible qui fait route sur le Varne s\'en écarte', () => {
    start('pdc_rogue');
    const t = S.targets.find((x) => x.L > 100)!;
    S.targets = [t];
    t.lane = undefined; t.beh = 'passive'; S.own.tele = 2; S.own.x += 30;
    const v = at(dm(50, 56.5), dm(1, 17.5)), p = at(dm(51, 1.5), dm(1, 24)); // centre du Varne et départ à 5 NM au NE
    expect(depthAt(v.x, v.y)).toBeLessThan(15);
    const h = n360((Math.atan2(v.x - p.x, v.y - p.y) * 180) / Math.PI);
    Object.assign(t, { x: p.x, y: p.y, hdg: h, cmdHdg: h, baseHdg: h, stw: 10, cmdStw: 10, baseStw: 10 });
    let mn = 99;
    for (let i = 0; i < 40 * 240; i++) { simStep(); mn = Math.min(mn, depthAt(t.x, t.y)); }
    expect(mn).toBeGreaterThan(15);
  });
  it('navire à contresens : rencontre de face dans la voie descendante', () => {
    let ok = 0;
    for (let k = 0; k < 4; k++) {
      start('pdc_rogue');
      run(25);
      const rogue = S.targets.find((t) => t.laneDir === -1)!;
      if (S.enc[rogue.id]?.role === 'headon') ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(3);
  });
});
