# Carte du Pas-de-Calais — sources et limites

> Carte d'entraînement **schématique, non destinée à la navigation**. Elle sert à poser des situations réalistes (DST, bancs, côte) ; elle ne remplace ni une carte officielle ni une cellule ENC.

## Sources

| Donnée | Source | Fichier |
|---|---|---|
| Trait de côte et terre | © contributeurs OpenStreetMap, licence ODbL 1.0, via les polygones terrestres « earth-lands-100m » du projet simonepri/geo-maps v0.6.0 ; découpés sur 50°33'N–51°27'N / 000°42'E–002°27'E et simplifiés. Résolution effective ≈ 0,5 à 1 km : les ports et petits détails n'apparaissent pas. | `src/core/charts/pasdecalais-land.ts` (reste sous ODbL) |
| Dispositif de séparation du trafic « In the Strait of Dover and adjacent waters » | OMI, COLREG.2/Circ.59, annexe 8, positions WGS 84 (numéros de position conservés dans le code) | `src/core/charts/pasdecalais.ts` |
| Bouées et bateaux-feux | MGN 364 Amendment 2 (MPC), NGA Pub. 114 (CS4), NGA Pub. 191, Trinity House, rapports MAIB. Les positions marquées `approx` (« ≈ » sur la carte) sont arrondies à la minute ou estimées. | `src/core/charts/pasdecalais.ts` |
| Bancs (Varne, Le Colbart, Sandettie, Goodwin Sands, Ruytingen, Dyck, Ridens de Calais) | Emprises **schématiques** (gélules orientées) d'après les descriptions des Instructions nautiques (NGA Pub. 191, sea-seek) et l'évaluation hydrographique DS1 du Colbart ; profondeurs minimales indicatives | idem |
| Bathymétrie hors bancs | **Modèle** : fond de 45 m, remontée vers la côte en 1 − e^(−d/1,2 NM) ; les isobathes 10, 20 et 30 m en découlent (carrés marchants) | `src/sim/chart.ts` |

Les ENC du SHOM et de l'UKHO ne sont pas utilisées (données non libres).

## Ce qui est modélisé

- Géoréférencement : plan local équirectangulaire autour de 51°00'N 001°30'E (erreur d'échelle < 0,5 % sur la zone).
- Profondeur en tout point (grille de 0,2 NM interpolée), échouement quand elle devient inférieure au tirant d'eau du porteur (20,8 m).
- Appartenance aux voies, aux zones de séparation et aux zones de navigation côtière ; sens de circulation donné par l'axe de chaque voie.
- Trafic qui suit les voies (poursuite d'un point de l'axe avec un décalage latéral propre à chaque navire, rapprochement de l'axe à l'approche des petits fonds), ferry traversier, navire à contresens.
- Radar : échos de côte et de bouées, masquage derrière la terre.
- Phares (Dungeness, Folkestone, Dover, Cap d'Alprech, Cap Gris-Nez, Calais, Dunkerque) et feux de port des musoirs (Dover, Boulogne, Calais, Gravelines, Dunkerque) : positions et caractères d'après NGA Pub. 114 (2016), domaine public ; portées des phares français d'après les fiches publiées ; feux de port sans portée relevée : 5 M par défaut. Données à vérifier sur un livre des feux à jour avant tout usage réel (non destiné à la navigation).

## Limites connues

- Pas de marée : hauteurs d'eau et courants de marée non modélisés (courant uniforme réglé par l'exercice).
- Relief non modélisé : l'écho de côte est une bande d'épaisseur pseudo-aléatoire, sans altitude.
- Routes de ferries, zones de mouillage, épaves, câbles et parcs éoliens absents.
- La route en eau profonde (DW) est tracée mais ses profondeurs ne sont pas représentées.
