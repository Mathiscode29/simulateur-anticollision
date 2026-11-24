import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { toXY } from '../src/core/geo';
import { brgOf } from '../src/core/util';
import { SCEN, applyScenarioEnv, laneShip, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';
import { CHART, depthAt, fairwayAt, laneOf, loadChart, polyLength, projOnPolyline, tssAt } from '../src/sim/chart';
import { tssReport } from '../src/sim/nav';
import { OUESSANT } from '../src/core/charts/ouessant';
import { LE_HAVRE } from '../src/core/charts/lehavre';

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.faults = 'off'; S.env.windKn = 0; S.env.curKn = 0;
  newScenario(); S.started = true; S.paused = false;
}
const run = (min: number, each?: () => void) => { for (let i = 0; i < min * 240 && !S.over; i++) { simStep(); each?.(); } };
const xy = (la: number, lo: number) => toXY(la, lo);
const bowStern = () => [0.48, -0.48].map((k) => { const a = (S.own.hdg * Math.PI) / 180; return depthAt(S.own.x + Math.sin(a) * (k * S.own.L) / 1852, S.own.y + Math.cos(a) * (k * S.own.L) / 1852); });

describe('Le Havre : carte, chenal et bassins', () => {
  it('profondeurs : chenal et bassins dragués, terre de part et d’autre de la passe', () => {
    loadChart('lh');
    const p = (la: number, lo: number) => { const q = xy(la, lo); return depthAt(q.x, q.y); };
    expect(p(49.5050, -0.04)).toBeGreaterThanOrEqual(17); // chenal, mi-parcours
    expect(p(49.4858, 0.0885)).toBeGreaterThanOrEqual(15); // passe entre les musoirs
    expect(p(49.4830, 0.1000)).toBeGreaterThanOrEqual(15); // avant-port
    expect(p(49.4628, 0.1400)).toBeGreaterThanOrEqual(17); // Port 2000
    expect(p(49.4910, 0.1011)).toBeLessThan(0); // église Saint-Joseph : à terre
    const f = fairwayAt(xy(49.505, -0.04).x, xy(49.505, -0.04).y);
    expect(f?.id).toBe('LH');
  });
  it('ville : repères et quartiers générés sur la terre seulement', () => {
    loadChart('lh');
    expect(CHART.blocks.some((b) => b.name?.includes('Saint-Joseph') && b.h === 107)).toBe(true);
    const gen = CHART.blocks.filter((b) => !b.name);
    expect(gen.length).toBeGreaterThan(100);
    for (const b of gen) expect(depthAt(b.x, b.y)).toBeLessThan(0);
    expect(CHART.blocks.filter((b) => b.kind === 'crane').length).toBeGreaterThan(15);
  });
  it('exercices de port : départ dans l’eau, étrave et poupe à flot, navire allégé', () => {
    for (const k of Object.keys(SCEN).filter((key) => SCEN[key].chart === 'lh')) {
      start(k);
      expect(depthAt(S.own.x, S.own.y)).toBeGreaterThan(S.own.draft!);
      for (const d of bowStern()) expect(d).toBeGreaterThan(0);
      expect(S.own.draft).toBeLessThan(S.own.ship.mmg.d);
    }
  });
  it('entrée complète : en suivant les points tournants à petite allure, on atteint l’avant-port sans toucher', () => {
    start('lh_entree');
    S.targets = [];
    const wps = S.route!.wps;
    let i = 1;
    run(45, () => {
      const o = S.own, w = wps[Math.min(i, wps.length - 1)];
      if (Math.hypot(w.x - o.x, w.y - o.y) < 0.12 && i < wps.length - 1) i++;
      o.cmdHdg = brgOf(w.x - o.x, w.y - o.y);
      const end = wps[wps.length - 1], dEnd = Math.hypot(end.x - o.x, end.y - o.y);
      o.tele = dEnd < 0.6 ? 2 : dEnd < 2.5 ? 3 : 5;
    });
    expect(S.grounded).toBe(false);
    const e = wps[wps.length - 1];
    expect(Math.hypot(e.x - S.own.x, e.y - S.own.y)).toBeLessThan(0.4);
    finish();
    expect(JSON.stringify(S.tss) + S.report!.global.map((m) => m.join(' ')).join(' | ')).toMatch(/ok Chenal parcouru.*R9a/);
  });
  it('R9a : remonter le chenal sur la moitié bâbord est relevé au bilan', () => {
    start('lh_entree');
    S.targets = [];
    const l = laneOf('LHout')!; // axe décalé côté nord : bâbord pour un navire entrant
    const p = projOnPolyline(l.axis, S.own.x, S.own.y);
    void p;
    const a = l.axis[l.axis.length - 1], b = l.axis[0];
    Object.assign(S.own, { x: a.x + (b.x - a.x) * 0.05, y: a.y + (b.y - a.y) * 0.05 });
    const q = toXY(49.5233, -0.165);
    Object.assign(S.own, { x: q.x, y: q.y + 0.035 });
    run(8, () => { S.own.cmdHdg = brgOf(l.axis[0].x - S.own.x, l.axis[0].y - S.own.y); });
    const r = tssReport();
    expect(r.m.some((m) => m[0] === 'warn' && m[1].includes('R9a'))).toBe(true);
  });
  it('trafic : un navire de la voie d’entrée s’arrête au bout de l’axe (rendu au port)', () => {
    start('lh_entree');
    S.targets = []; S.own.x += 30; // porteur hors jeu
    const l = laneOf('LHin')!, t = laneShip('LHin', polyLength(l.axis) - 1.5, 0, 10)!;
    run(40);
    expect(t.stw).toBeLessThan(0.5);
    expect(depthAt(t.x, t.y)).toBeGreaterThan(10);
    // rendu au port : amarré, il ne dérive plus au courant ni au vent
    expect(t.berthed).toBe(true);
    const x = t.x, y = t.y;
    run(20);
    expect(Math.hypot(t.x - x, t.y - y)).toBeLessThan(1e-9);
  });
});

describe('Ouessant : DST « Off Ushant » (SN/Circ.232)', () => {
  it('voies, zones de séparation et zone côtière aux bonnes positions', () => {
    loadChart('ush');
    const at = (la: number, lo: number) => { const q = xy(la, lo); return tssAt(q.x, q.y).kind; };
    expect(at(48.70, -5.62)).toBe('laneNE');
    expect(at(48.80, -5.82)).toBe('laneSW');
    expect(at(48.75, -5.72)).toBe('sep'); // zone de séparation intérieure
    expect(at(48.40, -5.05)).toBe('none'); // à terre ou près de l'île : hors DST
    expect(at(48.50, -5.15)).toBe('itz');
    const ne = laneOf('NE')!, sw = laneOf('SW')!;
    expect(Math.abs(projOnPolyline(ne.axis, ne.axis[0].x, ne.axis[0].y).brg - 28)).toBeLessThan(3);
    expect(Math.abs(projOnPolyline(sw.axis, sw.axis[2].x, sw.axis[2].y).brg - 208)).toBeLessThan(3);
  });
  it('phares sourcés et île à terre', () => {
    expect(OUESSANT.marks.find((m) => m.id === 'CREAC')?.light).toBe('Fl(2) 10s');
    for (const m of [...OUESSANT.marks, ...LE_HAVRE.marks]) expect(m.src.length).toBeGreaterThan(5);
    loadChart('ush');
    const q = xy(48.458, -5.09);
    expect(depthAt(q.x, q.y)).toBeLessThan(0);
  });
});
