# Journal des versions

Convention : chaque mise à jour publiée augmente la version d'un dixième (V1.0, V1.1 … V1.9, V2.0 …). La version
affichée dans l'en-tête vient de `src/core/version.ts`.

La **version initiale** (état du 23 novembre 2026, avant les mises à jour V1.x) est sauvegardée :
- dans la branche `version-initiale` de ce dépôt ;
- dans un dépôt de sauvegarde séparé, `simulateur-anticollision-version-initiale`.

## V1.9 — 24 novembre 2026
Ergonomie, manœuvre depuis la vue visuelle et prédicteur ECDIS.
- **Moins de boutons à l'écran** : le panneau de droite passe de six onglets à quatre (Conduite, Radar avec la liste des cibles, ECDIS, Journal). Les réglages qu'on fixe une fois (présentation radar, limites CPA / TCPA, zone d'acquisition, contour de sécurité, couches ECDIS, palette, son) sont dans un volet **⚙ Réglages** qui laisse l'écran visible.
- **Inscriptions du scope cliquables**, comme sur les consoles réelles : un clic sur NORTH UP, RM, VECT VRAIS, 6 min, STAB, SILLAGES, CPA, TCPA, AIS, BANDE ou MER passe à l'option suivante.
- **Fenêtre Exercices** à l'ouverture : les sept niveaux en cartes, description, environnement en « Options avancées », exercice en cours et bouton « Terminer et évaluer ». Le **Bilan** s'ouvre de lui-même à la fin ; le bouton de vue Débrief n'apparaît qu'à ce moment, avec un onglet de commandes dédié.
- En-tête allégé : palette en un seul bouton (jour, crépuscule, nuit), « Radar + ECDIS » regroupé avec « Passerelle » (second clic pour changer de disposition), aide clavier sur la touche **?**, Échap pour fermer.
- **Manœuvre depuis la vue visuelle** : barre manuelle, transmetteur d'ordres et propulseur d'étrave dans une console superposée à la vue (repliable, bouton « Commandes »). Flèches ← → : barre ±5° en barre manuelle (cap ordonné en pilote auto) ; W / C : propulseur d'étrave.
- **Propulseur d'étrave** du porteur, simplifié : poussée transversale à l'avant, montée en 8 s, efficacité qui chute avec la vitesse (≈ 50 % à 2 kn, ≈ 20 % à 4 kn). Puissance du KVLCC2 estimée (2 000 kW) : le navire de référence n'en a pas.
- **Prédicteur ECDIS** (30 s à 6 min, 2 min par défaut) : trajectoire que suivrait le navire si l'on ne touchait plus aux commandes, calculée avec le même modèle que la simulation (barre ou pilote, machine, propulseur, vent et courant), silhouettes à l'échelle et cap / vitesse prévus en bout de prédiction.
- **ECDIS incrusté** dans la vue visuelle, centré sur le navire, avec zoom automatique selon la vitesse (0,25 NM sous 2,5 kn, 0,5 NM sous 5 kn…) ; un clic change l'échelle. Nouvelles échelles de port 0,25 et 0,5 NM ; navires AIS dessinés à l'échelle quand ils sont assez grands.

## V1.8 — 24 novembre 2026
Deux nouvelles zones : Le Havre (port) et Ouessant.
- **Le Havre** : chenal d'accès depuis la bouée LHA jusqu'aux musoirs des digues Nord et Sud, avant-port, bassin Théophile-Ducrocq, accès et bassin de Port 2000 (4,2 km de quai), Antifer au nord. Feux de la NGA (Pub. 114), cap de la Hève, alignement du quai d'escale, bouées latérales schématiques du chenal, zone d'attente indicative.
- Ville en blocs pour la vue extérieure : église Saint-Joseph (107 m, éclairée la nuit), hôtel de ville, Porte Océane, sémaphore, centre reconstruit, Sainte-Adresse, zone portuaire et réservoirs, portiques à conteneurs de Port 2000, pont de Normandie ; falaises de la Hève et d'Antifer, côte de Grâce. Fenêtres éclairées et feux d'obstacle la nuit.
- Manœuvres de port : départ stoppé à quai, tirant d'eau d'exercice (navire allégé à 13,5 ou 14,5 m, le modèle de manœuvrabilité restant celui du KVLCC2 en charge), grille de profondeur fine (≈ 75 m), profondeur exacte jusqu'au quai dans les bassins, heurt détecté à l'étrave et à la poupe, échelle radar 1,5 NM et contour de sécurité de 15 m au départ.
- Règle 9 : suivi du côté tribord dans le chenal (alerte et bilan) ; trafic de chenal entrant (qui s'arrête au port) et sortant.
- Trois exercices au Havre : entrée par le chenal, appareillage de l'avant-port de nuit, appareillage de Port 2000.
- **Ouessant** : DST « Off Ushant » d'après l'OMI (SN/Circ.232 : voies montante et descendante avec coude, zones de séparation, zone de navigation côtière), phares de Créac'h, du Stiff, de la Jument, de Nividic, de Men-Korn, de Kéréon, du Four, de Trézien, de Kermorvan, de Saint-Mathieu et des Pierres Noires (NGA Pub. 113). Trois exercices : remontée dans la voie montante, descente de nuit, rejoindre la voie montante par brume.
- ECDIS : chenaux (limites et axe), zones bâties, bouées latérales ; contour de sécurité de 15 m ajouté. Relief côtier de la vue extérieure : le relief en retrait est voilé selon sa propre distance.

## V1.7 — 23 novembre 2026
- Vue extérieure : montants des vitres de la passerelle 1,5 fois plus espacés (tous les 36° au lieu de 24°).
- Fenêtres des châteaux des autres navires : retour à l'espacement d'origine (2,8 m), la V1.6 ayant mal interprété la demande.

## V1.6 — 23 novembre 2026
- Vue extérieure : rangées de fenêtres des châteaux 1,5 fois plus espacées (un niveau tous les 4,2 m au lieu de 2,8 m).

## V1.5 — 23 novembre 2026
Correction de la vue extérieure, défilement fluide, ports et feux.
- Correction : la texture de la mer dérivait à la vitesse de phase des vagues (≈ 10 m/s) dans le lit du vent, ce qui donnait l'impression que le navire avançait en travers de son vecteur radar. Elle suit désormais l'eau (courant et légère dérive due au vent).
- Défilement fluide : la vue extérieure interpole positions et caps entre deux pas de simulation (0,25 s) et tourne à pleine cadence, avec repli à 30 images/s seulement si l'ordinateur peine.
- Ports et feux : feux de port des musoirs de Dover, Boulogne, Calais, Gravelines, Dunkerque, Tarifa, Algeciras, Gibraltar, Ceuta et Tanger ; phares de Dungeness, Folkestone, Dover, Cap d'Alprech, Cap Gris-Nez, Calais, Dunkerque, Punta Cires, Malabata et Cap Spartel ; Tarifa précisé (Fl(3) WR 10s). Positions et caractères d'après les livres des feux de la NGA (Pub. 113 et 114, domaine public).
- Vue extérieure : tourelles rouges ou vertes sur les musoirs de jour, éclairage des quais la nuit, reflets des feux de port ; rythmes des feux complétés (Q, VQ, Fl(2+1), Oc(2), F).
- ECDIS : feux de port (virgule rouge, verte ou magenta selon la couleur du feu), nom affiché à partir de l'échelle 3 NM. Radar : écho des musoirs.

## V1.4 — 23 novembre 2026
Navires au mouillage et signaux sonores.
- Navires au mouillage (R30) : immobiles, évités au vent (au courant par vent faible), deux feux blancs tous horizons (l'avant plus haut), ponts éclairés à partir de 100 m, boule noire de jour, statut AIS « au mouillage » (message toutes les 3 min). Le navire qui fait route les évite, porteur comme trafic (R2, R8) ; bilan : marge de passage, passage sur l'avant d'un navire au mouillage signalé.
- Nouvel exercice « Navires au mouillage, de nuit » (niveau 2) ; navires au mouillage dans le Mouillage Alpha (COLREG.2/Circ.66) et à l'entrée de la baie d'Algeciras (positions indicatives).
- Signaux sonores (R32 à R35, annexe III), audibles : sifflet selon la longueur du navire, cloche et gong au mouillage, volume selon la distance et portée d'audibilité, son spatialisé selon le relèvement. Signaux de brume des autres navires (R35), signaux de manœuvre des navires qui évitent (R34a), cinq brefs d'un privilégié qui doute de vos intentions (R34d).
- Onglet Barre : sifflet du porteur (1, 2, 3 ou 5 brefs, 1 ou 2 prolongés), signal de brume automatique, sons entendus oui / non ; dernier signal entendu affiché dans la vue extérieure, et noté au journal.
- Bilan : R35 (signal de brume absent en visibilité réduite), R34a (signal de manœuvre donné, absent ou contraire au sens de l'abattée).

## V1.3 — 23 novembre 2026
Pont du VLCC détaillé, nuages arrondis, rendu 3D retiré.
- Pont du pétrolier porteur : collecteurs de cargaison, passerelle de pont sur supports, manifold (traverses et colonnes montantes), grues de manutention des flexibles, panneaux de citerne, soupapes P/V, mât de dégazage, guindeaux ; l'épaisseur des tubes suit la perspective.
- Nuages en cumulus arrondis (bulles sur une base plate, ombre sous la base).
- Rendu 3D WebGL supprimé, ainsi que la bibliothèque three.js : le simulateur n'a plus aucune dépendance d'exécution.

## V1.2 — 23 novembre 2026
Vue extérieure en 2D « en blocs » par défaut, pour la fluidité.
- Retour au rendu 2D en perspective comme rendu par défaut : le rendu WebGL de la V1.1 était trop lourd sur les ordinateurs courants.
- Silhouettes en blocs par famille de navire, ombrées selon le soleil : porte-conteneurs (piles de conteneurs de couleurs), pétrolier (tuyautage, manifold), méthanier (sphères en gradins), vraquier (panneaux de cale, grues), roulier, transbordeur (ponts étagés), cargo et caboteur, chalutier (portique), câblier (portique arrière), voilier ; château avec passerelle, ailerons, fenêtres (éclairées la nuit) et cheminée.
- Niveau de détail selon la taille à l'écran : blocs détaillés au-delà de 45 pixels, silhouette simple en deçà.
- Ciel et mer en aplats par paliers, nuages en pavés qui dérivent avec le vent, relief côtier en gradins de 15 m avec herbe et grève, sillage en bande d'écume.
- Allègement : vagues regroupées en quelques remplissages, vue extérieure limitée à 30 images par seconde, résolution plafonnée à un pixel par point.
- Le rendu 3D reste disponible en essai (bouton « 3D », exige une bonne carte graphique) ; three.js n'est téléchargé qu'à ce moment-là (application principale ≈ 200 Ko au lieu de ≈ 790 Ko).

## V1.1 — 23 novembre 2026
Vue extérieure en 3D (WebGL, three.js).
- Mer : vagues de Gerstner selon la force de Beaufort, vaguelettes, reflets du ciel (Fresnel), reflet du soleil, moutons.
- Ciel jour / nuit / brume, étoiles ; brouillard exponentiel selon la visibilité ; rotondité de la Terre avec réfraction.
- Relief côtier tiré du trait de côte et du relief de la carte (Rocher de Gibraltar, Djebel Moussa, falaises de Douvres), lumières de côte la nuit ; les feux et navires sont masqués par la terre.
- Silhouettes par type de navire : porte-conteneurs, pétrolier, vraquier, cargo, roulier, méthanier, ferry, chalutier, voilier, câblier ; fenêtres éclairées la nuit, vague d'étrave et sillage.
- Feux de navigation selon les secteurs de l'annexe I, reflets sur l'eau ; bouées, bateaux-feux et phares en 3D.
- Pont du VLCC vu de la passerelle, roulis et tangage.
- Bouton « 3D » pour revenir au rendu 2D allégé sur un ordinateur modeste (choix mémorisé).

## V1.0 — 23 novembre 2026
Point de départ, identique à la version initiale.
- Navire porteur VLCC KVLCC2 (modèle MMG), radar / ARPA, ECDIS, AIS, trafic IA selon le RIPAM, avaries.
- Zones : large, Pas-de-Calais, détroit de Gibraltar ; 25 exercices sur cinq niveaux.
- Vue extérieure et disposition passerelle ; répétiteurs barre et ROT, transmetteur d'ordres −10…+10.
- Bilan règle par règle et débrief rejoué.
