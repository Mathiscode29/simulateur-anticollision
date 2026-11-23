import { describe, expect, it } from 'vitest';
import { S } from '../src/core/state';
import { add, anchorAt, applyScenarioEnv, mkT, newScenario } from '../src/sim/scenarios';
import { simStep } from '../src/sim/loop';
import { roleOf } from '../src/sim/rules';
import { OWN, audibleRange, fogPattern, ownSignal, patDuration, soundStep } from '../src/sim/sound';
import { finish } from '../src/sim/assessment';
import { dayShapes, lights, navLights3D, shipKind } from '../src/sim/visual';
import { vec } from '../src/core/util';

function calm(key = 'r15', vis: 'good' | 'poor' = 'good'): void {
  S.scen = key; applyScenarioEnv(key);
  Object.assign(S.env, { windKn: 0, curKn: 0, vis, comp: 'disc', faults: 'off', night: false });
  newScenario(); S.started = true; S.paused = false; S.targets = []; S.enc = {};
}
const run = (min: number, each?: () => void) => { for (let i = 0; i < min * 240 && !S.over; i++) { simStep(); each?.(); } };
/** Point à `d` NM sur l'avant du porteur et `off` NM sur tribord. */
const ahead = (d: number, off: number) => { const o = S.own, p = vec(o.hdg, d), q = vec(o.hdg + 90, off); return { x: o.x + p.x + q.x, y: o.y + p.y + q.y }; };

describe('navire au mouillage (R30)', () => {
  it('rôle : le navire qui fait route l’évite ; en brume, R19 s’applique', () => {
    const own = { x: 0, y: 0, hdg: 0, stw: 12, type: 'power' as const }, anc = { x: 0, y: 3, hdg: 180, stw: 0, type: 'anchor' as const };
    expect(roleOf(own, anc, 'good')).toBe('anchor');
    expect(roleOf(anc, own, 'good')).toBe('standon18');
    expect(roleOf(own, anc, 'poor')).toBe('R19');
  });
  it('immobile, évité au vent, AIS « au mouillage », feux et boule', () => {
    calm(); S.env.windKn = 15; S.env.windFrom = 90; S.env.curKn = 1.5;
    const p = ahead(8, 3), t = anchorAt(p.x, p.y)!;
    t.L = 200; t.hdg = 0;
    run(10);
    expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeLessThan(1e-9);
    expect(Math.abs(t.hdg - 90)).toBeLessThan(15);
    expect(t.ais === null || t.ais.status === 'au mouillage').toBe(true);
    const l = navLights3D(t, 0);
    expect(l.map((x) => x.col).join('')).toBe('WW');
    expect(l[0].z).toBeGreaterThan(l[1].z); // feu avant plus haut (R30a)
    expect(lights(t, 1, 90).join(' ')).toMatch(/deux feux blancs.*ponts éclairés/);
    expect(dayShapes(t)).toEqual([expect.objectContaining({ shape: 'ball' })]);
  });
  it('silhouette selon la désignation', () => {
    expect(shipKind({ type: 'anchor', name: 'Pétrolier au mouillage' })).toBe('tank');
    expect(shipKind({ type: 'anchor', name: 'Cargo au mouillage' })).toBe('cargo');
  });
  it('bilan : marge suffisante sur un navire au mouillage (R8d)', () => {
    calm(); const p = ahead(5, 0.8); anchorAt(p.x, p.y);
    run(30);
    finish();
    const it0 = S.report!.items[0];
    expect(it0.role).toMatch(/mouillage/);
    expect(it0.other).toBe('au mouillage');
    expect(it0.msgs.some((m) => m[0] === 'ok' && /mouillage.*R8d/.test(m[1]))).toBe(true);
  });
  it('les cibles évitent un navire au mouillage sur leur route', () => {
    calm(); S.own.x = 60; S.own.y = 60; S.own.tele = 2;
    const a = anchorAt(0, 4)!, b = mkT('power', 0, 12, 0, 0);
    let min = 99;
    run(30, () => { min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y)); });
    expect(min).toBeGreaterThan(0.3);
  });
});

describe('signaux sonores (R32 à R35, annexe III)', () => {
  it('portées d’audibilité et durées des motifs', () => {
    expect([audibleRange(250), audibleRange(120), audibleRange(40), audibleRange(12)]).toEqual([2, 1.5, 1, 0.5]);
    expect(patDuration('P')).toBe(5);
    expect(patDuration('PP')).toBe(12); // deux prolongés séparés d'environ 2 s
    expect(patDuration('CCCCC')).toBe(9);
  });
  it('motifs de brume selon la situation de la cible (R35)', () => {
    calm();
    const p = mkT('power', 0, 12, 1, 1), f = mkT('fish', 0, 3, 1, 1), s = mkT('power', 0, 0, 1, 1), a = anchorAt(ahead(6, 2).x, ahead(6, 2).y)!;
    a.L = 150;
    expect([fogPattern(p), fogPattern(f), fogPattern(s), fogPattern(a)]).toEqual(['P', 'PCC', 'PP', 'BG']);
  });
  it('en brume : cible toutes les 2 min au plus, mouillage toutes les minutes au plus', () => {
    calm('r15', 'poor');
    const t = mkT('power', 0, 12, 50, 50), q = ahead(9, 3), a = anchorAt(q.x, q.y)!;
    const times: Record<number, number[]> = { [t.id]: [], [a.id]: [] };
    for (let k = 0; k < 400; k++) { S.t = k; soundStep(1); }
    for (const s of S.snd.list.concat()) if (times[s.src]) times[s.src].push(s.t);
    // la file ne garde que la dernière minute : on reconstitue les intervalles depuis le dernier signal
    expect(S.t - S.snd.tFog[t.id]).toBeLessThanOrEqual(120);
    expect(S.t - S.snd.tFog[a.id]).toBeLessThanOrEqual(60);
    const ta = times[a.id];
    for (let i = 1; i < ta.length; i++) expect(ta[i] - ta[i - 1]).toBeLessThanOrEqual(60);
  });
  it('signal de brume automatique du porteur et suivi R35 au bilan', () => {
    calm('r15', 'poor'); S.snd.fogAuto = true;
    run(6);
    const own = S.snd.own.filter((s) => s.pat === 'P').map((s) => s.t);
    expect(own.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < own.length; i++) expect(own[i] - own[i - 1]).toBeLessThanOrEqual(120);
    expect(S.snd.missed).toBe(0);
    finish();
    expect(S.report!.global.some((m) => m[0] === 'ok' && m[1].includes('R35'))).toBe(true);
  });
  it('sans signal de brume : avertissement R35a au bilan', () => {
    calm('r15', 'poor');
    run(8);
    expect(S.snd.missed).toBeGreaterThan(60);
    finish();
    expect(S.report!.global.some((m) => m[0] === 'warn' && m[1].includes('R35a'))).toBe(true);
  });
  it('signal du porteur enregistré (sifflet)', () => {
    calm(); ownSignal('C');
    expect(S.snd.own[S.snd.own.length - 1]?.pat).toBe('C');
    expect(S.snd.list[S.snd.list.length - 1]?.src).toBe(OWN);
    expect(S.snd.list[S.snd.list.length - 1]?.kind).toBe('man');
  });
  it('R34a au bilan : signal donné avec l’abattée, ou rappel s’il manque', () => {
    for (const sig of [true, false]) {
      calm();
      const t = add('gw', 10, 0)!;
      t.beh = 'passive';
      let done = false;
      run(40, () => {
        if (!done && Math.hypot(t.x - S.own.x, t.y - S.own.y) < 2.8) { done = true; S.own.cmdHdg = (S.own.cmdHdg + 50) % 360; if (sig) ownSignal('C'); }
      });
      finish();
      const msgs = S.report!.items[0].msgs.map((m) => m[1]).join(' | ');
      expect(msgs).toMatch(sig ? /Signal de manœuvre donné \(R34a/ : /R34a : votre changement de cap/);
    }
  });
});
