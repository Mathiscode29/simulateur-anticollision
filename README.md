# Simulateur anticollision — Radar ARPA et ECDIS

Simulateur web pour s'entraîner à l'anticollision et à l'application du RIPAM, pensé pour les élèves officiers et officiers de la marine marchande. Il fonctionne dans le navigateur, de préférence sur ordinateur.

> Outil d'entraînement complémentaire. Ce n'est **pas** un simulateur agréé au titre de la convention STCW.

## Ce qu'il fait

- **Navire porteur** : pétrolier VLCC 320 m (KVLCC2) simulé par un modèle hydrodynamique MMG 3 DDL (méthode standard publiée, critères OMI de manœuvrabilité vérifiés automatiquement, voir [docs/manoeuvrabilite.md](docs/manoeuvrabilite.md)). Pilote automatique ou barre manuelle, transmetteur d'ordres avec inertie machine et renversement de marche, propulseur d'étrave (simplifié, efficacité décroissante avec la vitesse). Un porte-conteneurs est prévu.
- **Environnement** : vent (dérive selon la prise au vent), courant, visibilité bonne ou réduite, jour ou nuit.
- **Radar / ARPA** (présentation selon MSC.192(79) et SN.1/Circ.243, voir [docs/conformite-radar.md](docs/conformite-radar.md)) : bandes X et S, gain, anti-clutter mer et pluie, grains, mouvement relatif ou vrai, décentrage, deux EBL/VRM, lignes parallèles indexées, curseur, poursuite de 40 cibles avec zone d'acquisition, CPA/TCPA, BCR/BCT, positions passées, manœuvre d'essai avec décompte, alertes avec acquittement et signal sonore, palettes jour / crépuscule / nuit. Utilisation à la souris et au clavier.
- **Trafic** : les autres navires appliquent les règles 13 à 19 vis-à-vis du porteur **et entre eux** (non-privilégié qui manœuvre, privilégié qui maintient puis agit seul si l'autre ne fait rien, manœuvre de dernière minute), plus ou moins bien selon le niveau choisi (discipliné, réaliste, imprévisible) : en trafic imprévisible, quasi-abordages et abordages entre cibles sont possibles. Navires en pêche, à voile, non maîtres de leur manœuvre, à capacité de manœuvre restreinte. Chaque navire a un nom, émis par l'AIS.
- **Avaries** (aucune, rares, fréquentes) : avarie de machine ou de barre, abordage entre cibles. Le navire devient non maître de sa manœuvre (feux, marques et statut AIS mis à jour) ; un message VHF / AIS donne son nom, sa piste radar et sa position. Une avarie peut être réparée. Si le statut d'un navire change en cours de rencontre, le rôle du porteur est réévalué (R18) et le bilan le signale.
- **Vue extérieure en 2D « en blocs »**, pensée pour rester fluide sur un ordinateur courant : silhouettes en blocs par type de navire (porte-conteneurs, pétrolier, vraquier, roulier, méthanier, transbordeur, chalutier, câblier, voilier) avec fenêtres éclairées la nuit, relief côtier en gradins (Rocher de Gibraltar, Djebel Moussa, falaises de Douvres), nuages, pont du VLCC avec son tuyautage, son manifold et ses grues. Vue « Visuel » ou « Passerelle » (le triangle du chef de quart : visuel en haut, radar en bas à gauche, ECDIS en bas à droite) : regard orientable sur 180° autour de l'avant (et de l'arrière depuis l'aileron), jumelles 7×, bandeau de relèvements vrais. Œil à 32 m, rotondité de la Terre (horizon à 11,8 NM), brume, nuit, côte et falaises, bouées (voyants, rythmes IALA simplifiés, mouvement à la houle) et bateaux-feux, silhouettes simples des navires avec vague d'étrave et sillage, feux de navigation selon les secteurs de l'annexe I avec halo et reflet sur l'eau, éclairage des emménagements et projecteurs des chalutiers, marques de jour. Mer selon la force du vent (crêtes qui avancent, moutons, roulis et tangage modestes du VLCC). Console d'instruments : gyro, axiomètre, ROT, loch, machine, vent apparent, sondeur. **Manœuvre depuis la vue visuelle** : barre manuelle, transmetteur d'ordres et propulseur d'étrave sous la main, ECDIS incrusté qui zoome sur le navire à faible vitesse, avec le prédicteur.
- **Observation** : feux selon l'aspect et leur portée, marques de jour, signaux de brume.
- **ECDIS** (vue séparée ou côte à côte avec le radar, sans interrompre la simulation, touche V) : position WGS 84, carte nord en haut en mouvement vrai, couleurs inspirées de S-52 selon la palette, isobathes et contour de sécurité, alarme de franchissement anticipé du contour de sécurité (visuelle et sonore), DST en magenta, bouées et bateaux-feux, cibles AIS et pistes ARPA, EBL/VRM, tracé et vérification de route, **prédicteur** (trajectoire à 30 s … 6 min si l'on ne touche plus aux commandes, silhouettes à l'échelle), échelles de port (0,25 et 0,5 NM).
- **AIS** : classes A et B, cadence des messages selon la vitesse, navires sans AIS, association avec les pistes radar (priorité AIS), superposition au radar.
- **Côte au radar** : échos de côte et de bouées, masquage de tout ce qui est derrière la terre.
- **Débrief** (fenêtre Bilan, « Revoir l'exercice ») : rejeu de l'exercice en mouvement vrai sur la carte ou en mouvement relatif centré sur le porteur, de ×10 à ×120, avec arrêt automatique aux moments clés. Pour chaque situation : établissement du risque, fenêtre de manœuvre conseillée, seuil de manœuvre tardive, actions R17a(ii) et R17b pour le privilégié, vos ordres à la barre et à la machine, manœuvre de l'autre navire, distance minimale, avaries. Graphe des distances et du CPA prévu, situation vraie (relèvement, distance, CPA, TCPA) à chaque instant, chronologie complète.
- **Bilan** : chaque situation est évaluée règle par règle (moment et ampleur de la manœuvre, côté, passage sur l'avant, R17, R19), plus la règle 10 dans le DST (sens de circulation, traversée à angle droit, zone de séparation, zone côtière) et l'échouement.

## Prise en main

- **☰ Exercices** (s'ouvre au démarrage) : les sept niveaux en cartes ; choisir un exercice, puis « Lancer ». L'environnement (vent, courant, trafic, avaries) est dans « Options avancées ».
- Panneau de droite en quatre onglets : **Conduite** (barre, propulseur d'étrave, transmetteur, sifflet), **Radar** (échelle, vidéo, outils, cibles suivies, manœuvre d'essai), **ECDIS** (échelle, prédicteur, outils, route), **Journal** (journal de passerelle, mémo RIPAM, fin de l'exercice).
- Les inscriptions du scope radar se règlent d'un clic ; les réglages qu'on fixe une fois (présentation radar, alertes, ECDIS, affichage, son) sont dans **⚙ Réglages**.
- À la fin, le **Bilan** s'ouvre de lui-même ; « Revoir l'exercice » lance le débrief. Touche **?** : toutes les commandes au clavier et à la souris.

## Exercices

Trente-deux exercices sur sept niveaux, chacun avec une route prévue (affichée en rouge sur le radar, écart latéral suivi dans le bilan) :

- **Fondamentaux** : face à face (R14), croisement non privilégié (R15/16), croisement privilégié (R17), rattrapement (R13), responsabilités réciproques (R18), visibilité réduite (R19).
- **Situations combinées** : changement de route au point tournant, double croisement, face à face et rattrapant, non privilégié qui ne manœuvre pas, manœuvre à contresens, avarie en croisement (le privilégié devient non privilégié, R18), trafic mixte, navires au mouillage de nuit (R30).
- **Avancé** : petit voilier de nuit par mer formée, flottille de chalutiers, NUC en dérive, grains et bande X, trafic dense, trafic dense en brume, changement de route en brume.
- **Pas-de-Calais (DST, règle 10)** : traversée du DST à angle droit dans un trafic dense, rattrapement en brume dans la voie montante entre le Colbart et le Varne, navire à contresens dans la voie descendante.
- **Détroit de Gibraltar (DST, règle 10)** : transit vers l'Atlantique dans la voie ouest avec les transbordeurs rapides Tarifa / Tanger, appareillage de nuit de Tanger-Med par la zone de prudence, arrivée à Algeciras en brume de Levant en coupant la voie ouest.
- **Le Havre (port, chenal, règle 9)** : entrée par le chenal jusqu'à l'avant-port, appareillage de nuit de l'avant-port par vent de travers, appareillage de Port 2000 ; navire allégé (tirant d'eau d'exercice), heurt de quai ou de digue détecté à l'étrave et à la poupe.
- **Ouessant (DST, règle 10)** : remontée dans la voie montante, descente de nuit dans la voie descendante, rejoindre la voie montante par brume.

La carte du Pas-de-Calais est **schématique et non destinée à la navigation** : trait de côte © contributeurs OpenStreetMap (ODbL), dispositif de séparation du trafic d'après les positions officielles de l'OMI, bancs et isobathes modélisés. Sources et limites : [docs/carte-pas-de-calais.md](docs/carte-pas-de-calais.md). Même principe pour le détroit de Gibraltar (DST d'après COLREG.2/Circ.66) : [docs/carte-gibraltar.md](docs/carte-gibraltar.md), pour Le Havre (port et ville schématiques) : [docs/carte-le-havre.md](docs/carte-le-havre.md), et pour Ouessant (DST d'après SN/Circ.232) : [docs/carte-ouessant.md](docs/carte-ouessant.md).

**Signaux sonores** (R34, R35, annexe III) : sifflet du porteur (brefs et prolongés), signal de brume automatique, signaux de brume et de manœuvre des autres navires entendus selon leur distance, cloche et gong des navires au mouillage ; le bilan relève l'absence de signal de brume (R35) et les signaux de manœuvre (R34a).

Le réglage **Trafic** (discipliné, réaliste, imprévisible) règle la proportion de navires qui appliquent correctement le RIPAM, tardivement, pas du tout, ou à contresens.

## Développement

```bash
npm install
npm run dev      # serveur local
npm test         # tests
npm run build    # build de production dans dist/
```

Chaque push sur `main` lance les tests puis publie le site sur GitHub Pages.

Architecture, conventions et références : [CLAUDE.md](CLAUDE.md). Suite du projet : [ROADMAP.md](ROADMAP.md).

## Droits

© 2026 Mathis THOMAS — tous droits réservés. Voir [LICENSE](LICENSE). Le trait de côte extrait d'OpenStreetMap reste sous licence ODbL (© contributeurs OpenStreetMap).
