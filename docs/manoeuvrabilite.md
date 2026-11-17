# Rapport de manœuvrabilité (simulation)

Manœuvres normalisées simulées en eau profonde, sans vent ni courant, à la vitesse de service, comparées aux critères de la résolution OMI MSC.137(76). Fichier généré par `npm run manoeuvrabilite`.

## Pétrolier VLCC 320 m (KVLCC2, modèle MMG) (`vlcc`)

Source : MMG standard method, Yasukawa & Yoshimura (2015), coefficients KVLCC2. L = 320 m, vitesse de service 15.5 kn, L/V = 40,1 s, régime allure mer 106,7 tr/min.

| Manœuvre | Résultat | Critère OMI | |
|---|---|---|---|
| Giration 35° Td — avance | 2,76 L | ≤ 4,5 L | ✅ |
| Giration 35° Td — diamètre tactique | 2,79 L | ≤ 5 L | ✅ |
| Giration 35° Bd — avance / diamètre tactique | 2,77 L / 2,78 L | idem | ✅ |
| Giration 35° — transfert à 90° | 1,17 L | — | |
| Giration 35° — diamètre en giration établie | 2,07 L | — | |
| Giration 35° — perte de vitesse | 67 % | — | |
| Abattée initiale (10° de barre, 10° de cap) | 1,57 L | ≤ 2,5 L | ✅ |
| Zigzag 10°/10° — 1er dépassement | 4,2° | ≤ 20,0° | ✅ |
| Zigzag 10°/10° — 2e dépassement | 10,2° | ≤ 40,0° | ✅ |
| Zigzag 20°/20° — 1er dépassement | 9,3° | ≤ 25° | ✅ |
| Arrêt d'urgence (allure mer → AR toute) | 12,1 L en 21 min | ≤ 15 L (20 L admis) | ✅ |
| Pilote auto, changement de cap 30° — dépassement | 0,8° | — | |

## Limites connues

- Les dérivées de carène proviennent d'essais captifs sur maquette (KVLCC2 L7) : la méthode MMG standard « capture grossièrement » le comportement à pleine échelle (Yasukawa & Yoshimura, 2015). La comparaison détaillée avec les essais libres publiés (SIMMAN) reste à faire.
- Surface de safran et fardage estimés (voir `src/core/ships/`).
- Marche arrière, efforts de vent et faibles vitesses : approximations hors méthode standard (voir `src/sim/mmg.ts`).
- Eau profonde uniquement (pas d'effet de petits fonds pour l'instant).
