import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { applyScenarioEnv, mkT, newScenario } from '../src/sim/scenarios';
import { dayShapes, lightColour, lightOn, navLights3D, shipKind } from '../src/sim/visual';
import { GIBRALTAR } from '../src/core/charts/gibraltar';
import { PAS_DE_CALAIS } from '../src/core/charts/pasdecalais';

function fresh() {
  S.scen = 'r15'; applyScenarioEnv('r15'); S.env.faults = 'off'; newScenario(); S.targets = [];
}
const cols = (l: { col: string }[]) => l.map((x) => x.col).sort().join('');

describe('feux de navigation en 3D (annexe I)', () => {
  it('navire à propulsion mécanique ≥ 50 m vu de l’avant : deux feux de mât, vert et rouge', () => {
    fresh();
    const t = mkT('power', 0, 14, 0, 3);
    const l = navLights3D(t, 0);
    expect(cols(l)).toBe('GRWW');
    const [m1, m2] = l.filter((x) => x.col === 'W');
    expect(m2.z).toBeGreaterThan(m1.z); // feu de mât arrière plus haut
  });
  it('vu par tribord (vert 60°) puis par l’arrière', () => {
    fresh();
    const t = mkT('power', 0, 14, 0, 3);
    expect(cols(navLights3D(t, 60))).toBe('GWW');
    expect(cols(navLights3D(t, 300))).toBe('RWW');
    expect(cols(navLights3D(t, 180))).toBe('W'); // feu de poupe seul
  });
  it('NUC faisant route : deux rouges tous horizons et feux de côté, pas de feu de mât', () => {
    fresh();
    const t = mkT('nuc', 0, 0, 0, 3); t.stw = 3;
    expect(cols(navLights3D(t, 60))).toBe('GRR');
    t.stw = 0;
    expect(cols(navLights3D(t, 60))).toBe('RR');
  });
  it('chalutier : vert sur blanc ; marques de jour cônes pointes réunies', () => {
    fresh();
    const t = mkT('fish', 0, 4, 0, 3);
    const l = navLights3D(t, 200), g = l.find((x) => x.col === 'G' && x.b === 0)!, w = l.find((x) => x.col === 'W' && x.b === 0 && x.a === g.a)!;
    expect(g.z).toBeGreaterThan(w.z);
    const s = dayShapes(t);
    expect(s.map((x) => x.shape)).toEqual(['coneDown', 'coneUp']);
  });
  it('voilier : feu tricolore en tête de mât selon le secteur', () => {
    fresh();
    const t = mkT('sail', 0, 5, 0, 3);
    expect(navLights3D(t, 30)[0].col).toBe('G');
    expect(navLights3D(t, 330)[0].col).toBe('R');
    expect(navLights3D(t, 180)[0].col).toBe('W');
  });
});

describe('silhouettes de la vue extérieure', () => {
  it('famille de silhouette selon le type et la désignation', () => {
    expect(shipKind({ type: 'power', name: 'Porte-conteneurs' })).toBe('pc');
    expect(shipKind({ type: 'power', name: 'Pétrolier' })).toBe('tank');
    expect(shipKind({ type: 'power', name: 'Méthanier' })).toBe('lng');
    expect(shipKind({ type: 'power', name: 'Transporteur de voitures' })).toBe('roro');
    expect(shipKind({ type: 'power', name: 'Transbordeur' })).toBe('ferry');
    expect(shipKind({ type: 'power', name: 'Vraquier' })).toBe('bulk');
    expect(shipKind({ type: 'small', name: 'Caboteur' })).toBe('coaster');
    expect(shipKind({ type: 'nuc', name: 'Navire non maître de sa manœuvre' })).toBe('cargo');
    expect(shipKind({ type: 'fish', name: 'Chalutier en pêche' })).toBe('fish');
    expect(shipKind({ type: 'sail', name: 'Voilier' })).toBe('sail');
    expect(shipKind({ type: 'ram', name: 'câblier' })).toBe('ram');
  });
});

describe('feux de port et caractères des feux', () => {
  /** Nombre d'allumages (fronts montants) sur une période, échantillonné au 1/20 s. */
  const flashes = (light: string, per: number) => { let n = 0, prev = false; for (let t = 0; t < per; t += 0.05) { const on = lightOn(light, t); if (on && !prev) n++; prev = on; } return n; };
  it('couleur principale du feu', () => {
    expect(['Fl(2) R 6s', 'Q G', 'Iso G 3s', 'Fl(4) WR 10s', 'Fl(4)WR 20s', 'Fl 5s', 'Fl(4)Y 15s', 'Oc(2) R 6s'].map(lightColour)).toEqual(['R', 'G', 'G', 'W', 'W', 'W', 'Y', 'R']);
  });
  it('rythmes : groupes d’éclats, éclats rapides, occultations', () => {
    expect(flashes('Fl(3) 15s', 15)).toBe(3);
    expect(flashes('Fl(2+1) 15s', 15)).toBe(3);
    expect(flashes('Q G', 10)).toBe(10);
    expect(flashes('Fl R 2.5s', 10)).toBe(4);
    expect(flashes('Oc(2) R 6s', 6)).toBe(2); // deux occultations par période
    expect(lightOn('Iso G 3s', 0.5)).toBe(true);
    expect(lightOn('Iso G 3s', 2)).toBe(false);
  });
  it('feux de port sourcés, dans l’emprise des cartes', () => {
    for (const c of [GIBRALTAR, PAS_DE_CALAIS]) {
      const ports = c.marks.filter((m) => m.kind === 'port');
      expect(ports.length).toBeGreaterThan(5);
      for (const m of ports) {
        expect(m.light).toBeTruthy();
        expect(m.src).toMatch(/NGA/);
        expect(m.lat).toBeGreaterThan(c.bbox[0]); expect(m.lat).toBeLessThan(c.bbox[1]);
        expect(m.lon).toBeGreaterThan(c.bbox[2]); expect(m.lon).toBeLessThan(c.bbox[3]);
      }
    }
  });
});
