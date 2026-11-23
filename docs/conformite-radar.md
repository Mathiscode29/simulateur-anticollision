# Conformité de la présentation radar

Grille d'auto-évaluation par rapport à la résolution OMI **MSC.192(79)** (normes de fonctionnement révisées du matériel radar) et aux symboles de la circulaire **SN.1/Circ.243/Rev.2**. La norme d'essai IEC 62388 (payante) n'a pas été consultée : elle reste à confronter point par point.

Légende : ✅ conforme · 🟡 partiel / simplifié · ❌ absent

Le simulateur reste un **outil d'entraînement complémentaire, non agréé STCW**. Cette grille sert à mesurer l'écart avec un équipement réel, pas à revendiquer une conformité.

| § MSC.192(79) | Exigence (résumé) | État | Mise en œuvre / écart |
|---|---|---|---|
| 5.1.2 | Bandes X et S, bande indiquée | 🟡 | Sélection X / S, indiquée en permanence. Différences modélisées : ouverture du faisceau, sensibilité au clutter et à la pluie. Pas de radars X et S simultanés. |
| 5.3.2 | Gain, anti-clutter mer (manuel et automatique), anti-clutter pluie ; état affiché en permanence | ✅ | Trois réglages, mer en auto ou manuel, niveaux affichés sur le scope. |
| 5.10.1-2 | Échelles 0,25 / 0,5 / 0,75 / 1,5 / 3 / 6 / 12 / 24 NM, échelle affichée | ✅ | Molette ou touches + / −. |
| 5.11.1 | Anneaux fixes équidistants, intervalle affiché | ✅ | |
| 5.12.1 | Au moins deux VRM avec lecture numérique | ✅ | VRM 1 et 2 (clic ou touches 1 / 2). |
| 5.14 | Ligne de foi du CCRP au bord de l'affichage | 🟡 | Présente ; suppression temporaire non proposée. |
| 5.15 | Au moins deux EBL, référence vraie ou relative indiquée | 🟡 | EBL 1 et 2, référence T / R. Origine non déplaçable (toujours au porteur). |
| 5.16 | Au moins quatre lignes parallèles indexées | 🟡 | Quatre lignes, placées parallèlement au cap ; relèvement non réglable séparément. |
| 5.18 | Curseur avec lecture continue distance / relèvement, sélection des cibles | ✅ | Lecture permanente en bas à droite du scope. |
| 5.20.1-3 | Mouvement vrai avec recentrage automatique ; north up et course up ; modes indiqués | ✅ | RM / TM, NU / CU / HU (HU en RM seulement), recentrage à 50 % du rayon. |
| 5.21 | Décentrage manuel jusqu'à au moins 50 % du rayon, au plus 75 % | ✅ | Vue avant 50 % ou au curseur, limitée à 75 %. |
| 5.22 | Stabilisation sol et eau, mode et source indiqués | ✅ | Sol (GNSS) ou eau (loch), affichée en permanence. |
| 5.23 | Sillages vrais ou relatifs de durée variable, mode et durée indiqués | ✅ | |
| 5.25.1.3 | Poursuite sur au moins 3, 6 et 12 NM, jusqu'à 12 NM | ✅ | Poursuite indépendante de l'échelle affichée. |
| Tableau 1 | Capacité de 40 cibles radar (navires ≥ 10 000 UMS) | ✅ | 40 cibles, alerte à l'approche de la limite (5.25.2.2). |
| 5.25.3.2 | Acquisition automatique, zone définie par l'utilisateur | 🟡 | Zone circulaire 6 ou 12 NM ; contour non réglable librement. |
| 5.25.4.1 | Tendance en 1 min, prédiction en 3 min | ✅ | État ACQUISITION < 60 s, TENDANCE < 3 min, puis PRÉDICTION. |
| 5.25.4.6 | Annulation d'une cible et de toutes les cibles | ✅ | |
| 5.27.2-3 | Durée des vecteurs réglable ; mode, durée et stabilisation affichés | ✅ | |
| 5.28.2 | Données de la cible sélectionnée : source, distance, relèvement, CPA, TCPA, route et vitesse vraies | ✅ | Plus BCR / BCT et évolution du relèvement. |
| 5.29.1 | Alarme CPA / TCPA, cible clairement signalée | ✅ | Cercle rouge épais clignotant jusqu'à l'acquittement, puis fixe. |
| 5.29.3 | Alarme à l'entrée dans la zone d'acquisition | ✅ | |
| 5.29.4 | Alerte de cible perdue, dernière position affichée | ✅ | Cercle barré clignotant jusqu'à l'acquittement. |
| 5.31 | Manœuvre d'essai clairement identifiée, avec décompte, poursuite maintenue | ✅ | Grand « T », décompte jusqu'à l'exécution, vecteurs d'essai. |
| 5.34 / 6.1.4 | Alertes, acquittement en commande principale | 🟡 | Liste des alertes (alarme / avertissement / attention), acquittement individuel ou global (Entrée), signal sonore coupable 30 s. Gestion simplifiée par rapport à MSC.302(87). |
| 5.26 / 5.28.3 | Cibles AIS (endormies, activées), données AIS | 🟡 | Superposition AIS au radar (triangles), symbole barré si cible perdue ; activation et données AIS détaillées dans la vue ECDIS (MMSI, nom, statut, RF/VF, âge du message). Filtrage AIS et alarme CPA sur cible AIS seule non proposés. |
| 5.33 | Association radar / AIS, priorité par défaut à l'AIS | 🟡 | Association sur écarts de position, route et vitesse ; symbole AIS affiché pour la piste associée, source « R+A » dans la table. Critères non réglables. |
| 5.4 / 5.32 | Échos de côte, zones d'ombre | 🟡 | Côte par lancer de rayons tous les 0,5° (trait de côte OSM) ; bande d'écho depuis la côte, masquage de tout ce qui est derrière la première terre. Relief non modélisé (pas d'altitude), pas de radar de cartes (5.32 : superposition de la carte au radar non proposée). |
| 5.34.1-2 | Alerte de gel de l'image, défaillance de capteur | ❌ | Sans objet en simulation pour l'instant. |
| 6 | Couleurs jour / nuit | ✅ | Palettes jour, crépuscule et nuit. |

## Symboles (SN.1/Circ.243/Rev.2, tableau 2)

| Symbole | État | Remarque |
|---|---|---|
| Cible en acquisition : segments de cercle ; en acquisition automatique : segments épais rouges clignotants jusqu'à l'acquittement | ✅ | |
| Cible suivie : cercle avec vecteur | ✅ | |
| Navire porteur : ligne de foi et vecteur distincts | ✅ | Ligne de foi blanche ; vecteur du porteur gris fin à pointe : route fond (stabilisation sol, courant compris) ou route surface (stabilisation eau, dérive due au vent comprise). Dérive affichée sous la route fond. |
| Cible dangereuse : cercle épais rouge, clignotant jusqu'à l'acquittement | ✅ | |
| Cible perdue : traits épais en travers du cercle, clignotants jusqu'à l'acquittement | ✅ | |
| Cible sélectionnée : carré indiqué par ses coins | ✅ | |
| Positions passées : points équidistants en temps | ✅ | 4 points, intervalle 30 s, 1 ou 2 min. |
| Navire porteur : double cercle, contour à grande échelle | ✅ | |
| Cible de référence « R » | ❌ | Utile avec la stabilisation sol sur référence ; non prévue. |
| Cible AIS endormie : triangle isocèle aigu orienté selon le cap | ✅ | Radar et ECDIS. |
| Cible AIS activée : triangle, vecteur RF/VF, ligne de cap | 🟡 | ECDIS (activée à moins de 6 NM, si associée ou sélectionnée) ; au radar, piste associée seulement. |
| Cible AIS perdue : triangle barré | ✅ | Plus de message depuis 6 intervalles nominaux (au moins 60 s). |

## ECDIS (repères MSC.232(82), sans revendiquer de conformité)

| Fonction | État | Remarque |
|---|---|---|
| Position du porteur en latitude / longitude WGS 84 | ✅ | Panneau de navigation, radar (curseur) et ECDIS. |
| Contour de sécurité choisi par l'utilisateur, mis en valeur | ✅ | 10, 20 ou 30 m ; zones de profondeur colorées par rapport à ce contour. |
| Alarme de franchissement du contour de sécurité dans un délai réglable | ✅ | 3, 6 ou 12 min sur le vecteur route fond, bande latérale de ± 0,1 NM ; alarme sonore. |
| Indication d'entrée dans une zone particulière (DST) | ✅ | Alerte « attention » à l'entrée dans une voie ou dans une zone de prudence ; R10 suivie en continu. Zones de prudence (tirets, « ! »), mouillages et phares (étoile, caractère, portée) affichés. |
| Planification et vérification de route | 🟡 | Tracé à la souris, contrôle des segments par rapport au contour de sécurité ; pas de couloir de route paramétrable par segment. |
| Présentation S-52 | 🟡 | Couleurs et symboles inspirés de S-52 (jour, crépuscule, nuit), carte schématique : pas de cellule S-57/S-101. |
