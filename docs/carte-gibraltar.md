# Carte du détroit de Gibraltar — sources et limites

> Carte d'entraînement **schématique, non destinée à la navigation**. Elle sert à poser des situations réalistes (DST, zones de prudence, côte, phares) ; elle ne remplace ni une carte officielle ni une cellule ENC.

## Sources

| Donnée | Source | Fichier |
|---|---|---|
| Trait de côte et terre (Espagne, Gibraltar, Maroc, Ceuta) | © contributeurs OpenStreetMap, licence ODbL 1.0, via les polygones terrestres « earth-lands-100m » du projet simonepri/geo-maps v0.6.0 ; découpés sur 35°39'N–36°18'N / 006°03'W–005°06'W et simplifiés (tolérance ≈ 40 m). Les ports (Algeciras, Tanger-Med, Ceuta) ne sont pas détaillés. | `src/core/charts/gibraltar-land.ts` (reste sous ODbL) |
| DST « In the Strait of Gibraltar » | OMI, COLREG.2/Circ.66, annexe 1 (adopté au MSC 94, en vigueur le 1er juin 2015 à 0000 UTC), positions WGS 84, carte de référence n° 445 de l'Instituto Hidrográfico de la Marina ; numéros de position (1) à (25) conservés dans le code | `src/core/charts/gibraltar.ts` |
| Zones de séparation (a) et (b) | Définies par l'OMI comme larges de 0,5 NM et centrées sur une ligne : bords calculés par décalage de ± 0,25 NM | idem |
| Zones de prudence (g) est et (h) de Tanger-Med, zones de navigation côtière nord, sud-est et sud-ouest, mouillage « Alpha » (cercle de 0,4 NM) | COLREG.2/Circ.66, annexe 1 | idem |
| Phares | Punta Carnero, Europa Point, Punta Almina : positions et caractères publiés (Wikipedia, d'après les livres des feux). Tarifa : position NGA Pub. 131 arrondie à la minute (« ≈ » sur la carte), caractère non renseigné. Punta Almina : les sources divergent sur le caractère (Fl(2) 10s ou Oc(2) WRG 8s), à vérifier | idem |
| Bouée d'atterrissage d'Algeciras RW Mo(A) 12s | Imray, ILNW 281/21 | idem |
| Bathymétrie | **Modèle** : fond de référence de 400 m (le détroit a 300 à 900 m de profondeur), remontée vers la côte en 1 − e^(−d/1,5 NM) | `src/sim/chart.ts` |
| Relief de la vue extérieure | **Schématique** : Rocher de Gibraltar (426 m), Djebel Moussa (851 m), collines de Punta Carnero | `src/core/charts/gibraltar.ts` |

Les ENC du SHOM, de l'IHM et de l'UKHO ne sont pas utilisées (données non libres).

## Ce qui est modélisé

- Géoréférencement : plan local équirectangulaire autour de 36°00'N 005°33'W.
- Voie ouest (vers l'Atlantique, au nord) et voie est (vers la Méditerranée, au sud), chacune en deux tronçons de part et d'autre de la zone de prudence de Tanger-Med ; l'axe de chaque voie traverse les zones de prudence pour guider le trafic.
- Le trafic des voies garde une marge de 0,3 NM avec les limites quand la voie se rétrécit, et se resserre sur l'axe dans les zones de prudence.
- Règle 10 : suivi de la voie, contresens, traversées, zone de séparation, zone de navigation côtière ; la zone de prudence déclenche une alerte de prudence et une mention au bilan, sans pénalité.
- ECDIS : zones de prudence (limite en tirets, symbole « ! »), mouillage, phares (étoile, caractère, portée).
- Feux de port (Tarifa, Algeciras, Gibraltar, Ceuta, Tanger) et phares de Punta Cires, Malabata et Cap Spartel : NGA Pub. 113 (2021) ; Tarifa repris de la même source. Les feux de port sans portée publiée dans l'extrait consulté reçoivent 5 M par défaut.
- Navires au mouillage : dans le cercle du Mouillage Alpha (COLREG.2/Circ.66) et à l'entrée de la baie d'Algeciras ; ces dernières positions sont indicatives (pas de zone de mouillage officielle reprise).
- Vue extérieure : phares visibles jusqu'à leur portée géographique (élévation du feu et de l'œil), cachés par la terre située devant eux ; ligne de crête calculée sur la terre traversée par chaque rayon (le relief en retrait de la côte apparaît).

## Limites connues

- Courant de surface entrant (vers l'est) réglé uniformément par l'exercice ; pas de marée, pas de contre-courant côtier ni de courant de marée alterné.
- Sens de circulation recommandés de la zone de prudence de Tanger-Med non représentés (à consulter sur la carte officielle).
- Aucun haut-fond représenté (bancs de Tarifa, Los Cabezos) faute de source libre fiable ; isobathes très proches de la côte.
- Système de comptes rendus obligatoire (GIBREP, Tarifa Traffic / Tanger Traffic) non simulé.
