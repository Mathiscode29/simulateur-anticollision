import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { toXY } from '../src/core/geo';
import { adiff, n360 } from '../src/core/util';
import { CHART, coastRays, depthAt, inPoly, loadChart, onLand, pointAt, polyLength, tssAt } from '../src/sim/chart';
import { applyScenarioEnv, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { finish } from '../src/sim/assessment';
import { initOwnDynamics } from '../src/sim/physics';
import { GIBRALTAR } from '../src/core/charts/gibraltar';

const dm = (d: number, m: number) => d + m / 60;
const W = (d: number, m: number) => -(d + m / 60);
const at = (lat: number, lon: number) => toXY(lat, lon);
const kind = (lat: number, lon: number) => { const p = at(lat, lon); return tssAt(p.x, p.y).kind; };

function start(key: string): void {
  S.scen = key; applyScenarioEnv(key); S.env.comp = 'disc';
  S.env.faults = 'off'; newScenario(); S.started = true; S.paused = false;
}
function setHeading(h: number): void {
  const o = S.own;
  o.hdg = o.cmdHdg = n360(h); initOwnDynamics(o, o.ship.max);
  o.vx = Math.sin((o.hdg * Math.PI) / 180) * o.stw + Math.sin((S.env.curSet * Math.PI) / 180) * S.env.curKn;
  o.vy = Math.cos((o.hdg * Math.PI) / 180) * o.stw + Math.cos((S.env.curSet * Math.PI) / 180) * S.env.curKn;
}
const run = (min: number) => { for (let i = 0; i < min * 240 && !S.over; i++) simStep(); };

describe('carte du détroit de Gibraltar', () => {
  it('terre et eau profonde aux bons endroits', () => {
    loadChart('gib');
    for (const [la, lo] of [[36.14, -5.353], [36.05, -5.60], [35.78, -5.81], [35.89, -5.33]] as const) {
      const p = at(la, lo);
      expect(onLand(p.x, p.y), `${la} ${lo}`).toBe(true); // Gibraltar, Tarifa (arrière-pays), Tanger, Ceuta
    }
    const mid = at(dm(35, 56.2), W(5, 40));
    expect(onLand(mid.x, mid.y)).toBe(false);
    expect(depthAt(mid.x, mid.y)).toBeGreaterThan(200);
  });
  it('zones du DST (COLREG.2/Circ.66)', () => {
    loadChart('gib');
    expect(kind(dm(35, 57.4), W(5, 40))).toBe('laneW');
    expect(kind(dm(35, 54.6), W(5, 40))).toBe('laneE');
    expect(kind(dm(36, 0.2), W(5, 27))).toBe('laneW');
    expect(kind(dm(35, 57.5), W(5, 26.5))).toBe('laneE');
    expect(kind(dm(35, 56.21), W(5, 40))).toBe('sep');
    expect(kind(dm(35, 58.7), W(5, 27))).toBe('sep');
    expect(kind(dm(35, 57.5), W(5, 31.5))).toBe('prec'); // Tanger-Med
    expect(kind(dm(35, 59.5), W(5, 22.0))).toBe('prec'); // zone de prudence est
    expect(kind(dm(35, 59.5), W(5, 40))).toBe('itz');
    expect(kind(dm(35, 51.5), W(5, 40))).toBe('itz');
    // sens de circulation : voie ouest ≈ 270°, voie est ≈ 080°
    const w = at(dm(35, 57.4), W(5, 40)), e = at(dm(35, 54.6), W(5, 40));
    expect(Math.abs(adiff(tssAt(w.x, w.y).dir!, 270))).toBeLessThan(15);
    expect(Math.abs(adiff(tssAt(e.x, e.y).dir!, 80))).toBeLessThan(15);
  });
  it('zones de séparation larges de 0,5 NM, centrées sur leurs lignes', () => {
    loadChart('gib');
    const z = CHART.zones.find((x) => x.id === 'b')!;
    const c = at(dm(35, 56.21), W(5, 40));
    expect(inPoly(z.poly, c.x, c.y + 0.24)).toBe(true);
    expect(inPoly(z.poly, c.x, c.y - 0.24)).toBe(true);
    expect(inPoly(z.poly, c.x, c.y + 0.27)).toBe(false);
    expect(inPoly(z.poly, c.x, c.y - 0.27)).toBe(false);
  });
  it('les axes des voies ne passent ni à terre, ni dans une zone de séparation ou côtière', () => {
    loadChart('gib');
    for (const l of CHART.lanes) {
      const L = polyLength(l.axis);
      let inLane = 0;
      for (let s = 0; s <= L; s += 0.2) {
        const p = pointAt(l.axis, s), k = tssAt(p.x, p.y).kind;
        expect(['sep', 'itz']).not.toContain(k);
        expect(depthAt(p.x, p.y)).toBeGreaterThan(100);
        if (k === `lane${l.id}`) inLane++;
      }
      expect(inLane * 0.2).toBeGreaterThan(8);
    }
  });
  it('la côte marocaine renvoie un écho, Gibraltar masque la baie', () => {
    loadChart('gib');
    const p = at(dm(35, 56.2), W(5, 40)), r = coastRays(p.x, p.y);
    expect(r.r0[180 * 2]).toBeGreaterThan(2); expect(r.r0[180 * 2]).toBeLessThan(8); // côte sud
    expect(r.r0[0]).toBeGreaterThan(2); expect(r.r0[0]).toBeLessThan(10); // côte nord
  });
  it('phares et marques : sources indiquées', () => {
    for (const m of GIBRALTAR.marks) expect(m.src.length).toBeGreaterThan(5);
    expect(GIBRALTAR.attribution).toContain('OpenStreetMap');
  });
});

describe('exercices de Gibraltar', () => {
  it('départ et route en eau libre, au-delà du contour de sécurité', () => {
    for (const key of ['gib_west', 'gib_tanger', 'gib_alge']) {
      start(key);
      expect(CHART.key).toBe('gib');
      expect(depthAt(S.own.x, S.own.y), key).toBeGreaterThan(30);
      for (const w of S.route!.wps.slice(1)) expect(depthAt(w.x, w.y), key).toBeGreaterThan(30);
      expect(S.targets.length, key).toBeGreaterThanOrEqual(5);
      for (const t of S.targets) expect(depthAt(t.x, t.y), `${key} ${t.vname}`).toBeGreaterThan(15);
    }
  });
  it('le trafic des voies reste en eau profonde et ne coupe pas les zones de séparation', () => {
    for (const key of ['gib_west', 'gib_tanger', 'gib_alge']) {
      start(key);
      for (const t of S.targets) t.beh = 'passive';
      S.own.tele = 2; S.own.x += 60; // porteur stoppé et écarté : seul le trafic des voies est observé
      let sep = 0, itz = 0, n = 0;
      for (let i = 0; i < 20 * 4 && !S.over; i++) {
        run(0.25);
        for (const t of S.targets.filter((x) => x.lane)) {
          expect(depthAt(t.x, t.y)).toBeGreaterThan(15);
          if (t.fault?.active) continue; // abordage entre cibles passives : hors du sujet de ce test
          const k = tssAt(t.x, t.y).kind;
          n++; if (k === 'sep') sep++; if (k === 'itz') itz++;
        }
      }
      expect(sep / n, key).toBeLessThan(0.03);
      expect(itz / n, key).toBeLessThan(0.03);
    }
  });
  it('transit dans la voie ouest : conforme à R10(b)(i) ; à contresens : sanctionné', () => {
    start('gib_west'); S.targets = [];
    run(30); finish();
    expect(S.report!.global.some((m) => m[0] === 'ok' && m[1].includes('R10(b)(i)'))).toBe(true);
    start('gib_west'); S.targets = [];
    const e = at(dm(35, 54.6), W(5, 40)); S.own.x = e.x; S.own.y = e.y; // dans la voie est, cap à l'ouest
    setHeading(270);
    run(5); finish();
    expect(S.report!.global.some((m) => m[0] === 'bad' && m[1].includes('contresens'))).toBe(true);
  });
  it('appareillage de Tanger-Med : la zone de prudence est signalée au bilan', () => {
    start('gib_tanger'); S.targets = [];
    run(14); finish();
    expect(S.report!.global.some((m) => m[1].includes('Zone de prudence'))).toBe(true);
  });
  it('rencontres programmées : le trafic de la voie croise la route au bon moment', () => {
    for (let k = 0; k < 4; k++) {
      start('gib_tanger');
      const meet = S.targets.slice(0, 2); // laneMeetRoute (voie est)
      for (const t of S.targets) t.beh = 'passive';
      const dmin = meet.map(() => Infinity);
      for (let i = 0; i < 20 * 240 && !S.over; i++) {
        simStep();
        meet.forEach((t, j) => { dmin[j] = Math.min(dmin[j], Math.hypot(t.x - S.own.x, t.y - S.own.y)); });
      }
      expect(meet.every((t) => t.lane === 'E')).toBe(true);
      expect(Math.min(...dmin)).toBeLessThan(1.2);
    }
  });
});
