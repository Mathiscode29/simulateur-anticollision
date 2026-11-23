# Carte d'Ouessant — sources et limites

> Carte d'entraînement **schématique, non destinée à la navigation**.

## Sources

| Donnée | Source | Fichier |
|---|---|---|
| DST « Off Ushant » | OMI SN/Circ.232, annexe A (positions WGS 84, en vigueur le 1er mai 2003) ; arrêté du préfet maritime de l'Atlantique n° 2003/11 ; usage de la route à double sens : COLREG.2/Circ.64 et COLREG.2/Circ.75. Coquille du texte corrigée : le point 3 de la zone de séparation extérieure est imprimé « 005°60'.60 W », on retient 005°50'.60 W (point commun avec la voie descendante) | `src/core/charts/ouessant.ts` |
| Phares (Créac'h, Stiff, Nividic, Jument, Men-Korn, Kéréon, Four, Trézien, Kermorvan, Saint-Mathieu, Pierres Noires) | NGA List of Lights, Pub. 113 (2021), domaine public | idem |
| Trait de côte | © contributeurs OpenStreetMap, ODbL 1.0 (mêmes tuiles que Le Havre, ≈ 100 m) ; îlots de moins de 0,3 ha omis | `src/core/charts/ouessant-land.ts` (reste sous ODbL) |

## Ce qui est modélisé

- Voies montante (028° puis 060° au coude, sur le relèvement 315° de Créac'h) et descendante (240° puis 208°), zones de séparation, zone de navigation côtière ; la route à double sens (réservée à certaines catégories de navires) est l'espace entre les deux zones de séparation intérieures.
- Règle 10 comme au Pas-de-Calais et à Gibraltar ; trafic qui suit les voies.

## Limites connues

- Bathymétrie schématique (fond de 110 m), pas de courants de marée (courant uniforme réglé par l'exercice).
- Chenal du Four et passage du Fromveur non détaillés (le trait de côte à ≈ 100 m ne rend pas les roches).
- Système de compte rendu obligatoire OUESSREP non simulé (pas de VHF avec Ouessant Trafic).
