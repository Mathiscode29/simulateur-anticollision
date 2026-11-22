/**
 * Génère docs/manoeuvrabilite.md : manœuvres normalisées OMI simulées pour chaque navire à modèle MMG.
 * Usage : npm run manoeuvrabilite
 */
import { writeFileSync } from 'node:fs';
import { SHIPS } from '../src/core/data';
import { IMO, autopilotChange, initialTurning, stopping, turningCircle, zigzag } from '../src/sim/manoeuvres';
import { nSea } from '../src/sim/physics';

const f = (x: number, d = 2) => x.toFixed(d).replace('.', ',');
const ok = (c: boolean) => (c ? '✅' : '❌');
let md = `# Rapport de manœuvrabilité (simulation)\n\n`;
md += `Manœuvres normalisées simulées en eau profonde, sans vent ni courant, à la vitesse de service, comparées aux critères de la résolution OMI MSC.137(76). Fichier généré par \`npm run manoeuvrabilite\`.\n\n`;
for (const [key, s] of Object.entries(SHIPS)) {
  const tc = turningCircle(s, 35), tcp = turningCircle(s, -35), z10 = zigzag(s, 10), z20 = zigzag(s, 20);
  const it = initialTurning(s), st = stopping(s), ap = autopilotChange(s, 30), LV = z10.LV;
  md += `## ${s.n} (\`${key}\`)\n\nSource : ${s.src ?? '—'}. L = ${s.L} m, vitesse de service ${s.max} kn, L/V = ${f(LV, 1)} s, régime allure mer ${f(nSea(s.mmg) * 60, 1)} tr/min.\n\n`;
  md += `| Manœuvre | Résultat | Critère OMI | |\n|---|---|---|---|\n`;
  md += `| Giration 35° Td — avance | ${f(tc.advance)} L | ≤ ${f(IMO.advance, 1)} L | ${ok(tc.advance <= IMO.advance)} |\n`;
  md += `| Giration 35° Td — diamètre tactique | ${f(tc.tactical)} L | ≤ ${IMO.tactical} L | ${ok(tc.tactical <= IMO.tactical)} |\n`;
  md += `| Giration 35° Bd — avance / diamètre tactique | ${f(tcp.advance)} L / ${f(tcp.tactical)} L | idem | ${ok(tcp.advance <= IMO.advance && tcp.tactical <= IMO.tactical)} |\n`;
  md += `| Giration 35° — transfert à 90° | ${f(tc.transfer)} L | — | |\n`;
  md += `| Giration 35° — diamètre en giration établie | ${f(tc.steadyDiam)} L | — | |\n`;
  md += `| Giration 35° — perte de vitesse | ${Math.round(tc.speedLoss * 100)} % | — | |\n`;
  md += `| Abattée initiale (10° de barre, 10° de cap) | ${f(it)} L | ≤ ${f(IMO.initial, 1)} L | ${ok(it <= IMO.initial)} |\n`;
  md += `| Zigzag 10°/10° — 1er dépassement | ${f(z10.first, 1)}° | ≤ ${f(IMO.zz10first(LV), 1)}° | ${ok(z10.first <= IMO.zz10first(LV))} |\n`;
  md += `| Zigzag 10°/10° — 2e dépassement | ${f(z10.second, 1)}° | ≤ ${f(IMO.zz10second(LV), 1)}° | ${ok(z10.second <= IMO.zz10second(LV))} |\n`;
  md += `| Zigzag 20°/20° — 1er dépassement | ${f(z20.first, 1)}° | ≤ ${IMO.zz20first}° | ${ok(z20.first <= IMO.zz20first)} |\n`;
  md += `| Arrêt d'urgence (allure mer → AR toute) | ${f(st.track, 1)} L en ${Math.round(st.time / 60)} min | ≤ ${IMO.stop} L (${IMO.stopLarge} L admis) | ${ok(st.track <= IMO.stop)} |\n`;
  md += `| Pilote auto, changement de cap 30° — dépassement | ${f(ap, 1)}° | — | |\n\n`;
}
md += `## Limites connues\n\n- Les dérivées de carène proviennent d'essais captifs sur maquette (KVLCC2 L7) : la méthode MMG standard « capture grossièrement » le comportement à pleine échelle (Yasukawa & Yoshimura, 2015). La comparaison détaillée avec les essais libres publiés (SIMMAN) reste à faire.\n- Surface de safran et fardage estimés (voir \`src/core/ships/\`).\n- Marche arrière, efforts de vent et faibles vitesses : approximations hors méthode standard (voir \`src/sim/mmg.ts\`).\n- Eau profonde uniquement (pas d'effet de petits fonds pour l'instant).\n`;
writeFileSync(new URL('../docs/manoeuvrabilite.md', import.meta.url), md);
console.log(md);
