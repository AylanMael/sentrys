# Indicateurs du planning — périmètre et limites

## Convention conservée

Les heures affichées viennent des vacations et de la période filtrée, pas des pointages. Les vacations annulées et les absences visibles restent incluses conformément au calcul existant ; aucune convention de paie ou règle juridique n'est changée. Les champs internes agentMonthlyHours/agentWeeklyHours ne sont pas renommés dans ce lot.

## Comparaison au contrat

- Mois civil Paris exact, bornes exclusives, tous sites/toutes publications/absences incluses.
- Dernier snapshot confirmé par le serveur pour le tenant courant, sans écritures locales en attente ni erreur ; dates exploitables et absence de mutation locale.
- Contrat individuel réellement renseigné et positif. Pas de contrat standard inventé.
- Dans un périmètre incomplet, delta/%/contrat comparé : tiret neutre ; pas de fausse alerte rouge sur l'avatar.
- Filtre agent : comparaison individuelle seulement. Le résultat partagé n'invente pas zéro heure pour les autres agents.

## Cockpit et audit

La comparaison globale est non évaluée si un filtre agent est actif ou si un agent compté dans les heures n'a pas de contrat exploitable, y compris les agents de vacations clôturées/annulées. Le verdict devient au minimum avertissement, le score est étiqueté partiel et aucune recommandation « tout au vert » n'est générée. Le score numérique reste l'indice existant, sans prétendre mesurer le contrôle absent.

Le journal conserve `metrics.overtimeEvaluated` (0/1), `metrics.overtimeAgentFiltered` (0/1) et un risque descriptif lorsque le contrôle n'est pas complet. Les anciennes entrées sans ces métadonnées restent affichables ; elles ne sont pas réécrites. Ces informations décrivent un calcul d'interface, pas un contrôle de conformité serveur.

## Recette manuelle

1. Vue Mois, tous sites/publications, contrat renseigné : comparer heures planifiées, contrat, delta, pourcentage.
2. Passer en Semaine ou filtrer un site : heures conservées sur le nouveau périmètre, comparaisons remplacées par des tirets ; cockpit non évalué, pas de recommandation verte.
3. Filtrer un agent : comparaison individuelle disponible si mois entier, cockpit global partiel et journal identifié comme filtré.
4. Agent sans contrat : aucun 151,67 h inventé, comparaison absente et contrôle global incomplet s'il contribue aux heures.
5. Hors ligne/erreur de synchronisation : comparaisons suspendues ; le chargement terminé seul ne constitue pas une confirmation serveur.
6. Enregistrer une revue sur un périmètre incomplet et rouvrir le journal : score partiel, pas d'interprétation d'un zéro dépassement comme contrôle réalisé.

## Recette navigateur du 10 septembre 2026

Effectuée sur le serveur local 127.0.0.1:9002 et les émulateurs du projet fictif demo-sentrys-accounts, sans modification de production. Deux agents fictifs, un site et deux vacations de 3 h ont été créés dans la recette.

- Mois complet : 3 h / contrat de 150 h = 2 %, delta -147 h ; agent sans contrat : tirets.
- Semaine : heures conservées, contrat/delta/% remplacés par des tirets.
- Mois filtré par site : comparaisons suspendues et raison visible.
- Cockpit en semaine : score partiel, contrôle mensuel non évalué, verdict avec vigilance.
- Notice : présentation compacte vérifiée visuellement ; ouverture et fermeture des limites vérifiées dans le navigateur.

- Filtre agent seul : Alice conserve 3 h / 150 h, delta -147 h et 2 %. Le cockpit indique un contrôle global incomplet.
- Persistance du journal : prévisualisation locale sans publication, puis rechargement complet ; la revue apparaît toujours avec « Score partiel », 96/100 et une vacation/un agent. Le score courant tous agents (92) ne remplace pas le score historique (96).

Restent à effectuer en navigateur : coupure réseau et recette mobile. Les tests automatisés ne remplacent pas ces vérifications. L'étiquette explicite « agent filtré » dans la liste historique n'a pas été observée : l'interface montre « Score partiel » et les effectifs, tandis que les métadonnées de filtre sont prévues dans le lot.

Anomalie préexistante confirmée : le bandeau de site affiche le client « SAMSIC SECURITE » en dur, même pour le site fictif. À corriger dans un lot distinct.

## Travaux métier ultérieurs

### Complément responsive local

Simulation navigateur à 390 × 844 : débordement global initial mesuré à 554 px pour une zone utile de 375 px. Correction du minimum implicite du conteneur dashboard et retour à la ligne de son en-tête ; largeur de document mesurée ensuite à 375 px. Les filtres de publication reviennent à la ligne, le calendrier conserve 512 px de hauteur minimale sur petit écran et ses quatre commandes Mois/Semaine/Jour/Grille sont visibles. L'override du navigateur a été réinitialisé après la recette.

Cette vérification concerne la mise en page, pas une validation complète du planning tactile ni un test sur téléphone physique. Le scénario de coupure réseau reste à exécuter ; aucune validation hors ligne n'est revendiquée.

### Contre-vérification de la hauteur

La hauteur minimale de 512 px ne suffisait pas : la zone `.fc-view-harness` mesurait 0 px à 907 px de largeur. Remplacée par une hauteur définie de 40 rem sous le breakpoint desktop (FullCalendar demande 100 %). Mesures après correction : environ 510 px pour la zone des lignes à 907 px, et 404 px à 390 px ; la ligne du site fictif est visible. Le défilement horizontal reste nécessaire pour la timeline.

TypeScript et lint ciblé terminés avec succès. Trois garde-fous de structure responsive ont été ajoutés ; ils ne constituent pas des tests de rendu. La revue indépendante confirme la correction de hauteur, avec réserves à lever sur le filtre site (bandeau supplémentaire dans la hauteur disponible) et les commandes tablette entre 768 et 1023 px. Ne pas clôturer la recette mobile complète sur cette seule base.

### Commandes tablette et filtre site

Seuil du zoom en flux et du retour à la ligne de la toolbar harmonisé à 1024 px. Recette locale avec site fictif sélectionné : à 907 px, toutes les commandes sont visibles et la zone des lignes mesure environ 412 px ; à 390 px, elle mesure environ 170 px, avec ligne du site et barre de défilement accessibles. Aucun débordement global (document utile 375 px). Cela lève les réserves sur ce scénario à une ligne, pas sur de grands effectifs ni sur téléphone physique. Le bandeau reste volumineux sur mobile et son contenu client fictif préexistant reste à corriger. Simulation réseau hors ligne toujours non exécutée.

### Bandeau site compact et données réelles

Remplacement des mentions fixes SAMSIC/ADS/prestation/activité par le composant PlanningSiteSummary : nom et client issus exclusivement du site sélectionné. Client absent : « Non renseigné » ; site absent du catalogue chargé : « Site non disponible ». Aucun droit ou calcul métier modifié. Les champs client ne sont pas revérifiés via une requête supplémentaire : il s'agit du clientName exposé par l'API sites.

Mesure locale à 390 px avec filtre site : bandeau environ 68 px, zone des lignes environ 336 px (contre 170 px avant), document utile 375 px sans débordement. Tests de rendu React pour données réelles, données manquantes, échappement et noms longs. La recette physique et la coupure réseau restent ouvertes.

### Garde-fou de connectivité

Le signal navigateur offline suspend les comparaisons mensuelles et l'écoute Firestore. Le retour online recrée l'écoute ; seul un snapshot serveur sans écritures en attente permet de comparer de nouveau. Le signal online n'est pas une preuve d'accès au serveur. Des tests d'événements couvrent l'état initial, la perte/reprise et le nettoyage des écouteurs ; un garde-fou de source vérifie l'intégration au provider. Cela ne remplace pas un test de coupure réelle ni un test React complet et ne rend pas les écritures métier disponibles hors ligne.

Suite à la revue indépendante, le snapshot des vacations est associé à son tenant : dès le rendu, un tenant différent reçoit une liste vide, pas les anciennes vacations. Les callbacks d'un abonnement nettoyé sont ignorés. Les tests de structure couvrent ces branchements ; une recette complète de changement de tenant et de course réseau reste nécessaire. Les noms très longs restent couverts en rendu texte, pas encore en géométrie mobile.

### Cohérence du résumé opérationnel

Le résumé de couverture et ses compteurs sont remplacés par un état accessible (`role=status`) lorsque le snapshot n'est pas confirmé. Le message distingue chargement et données non confirmées sans diagnostiquer à tort une panne réseau. L'animation respecte la préférence de mouvement réduit. Le démarrage guidé « planning vierge » exige également une confirmation serveur. La confirmation est distincte de l'éligibilité mensuelle : un filtre semaine ne masque pas un résumé synchronisé.

Ce sous-lot ne désactive pas toutes les actions d'édition ni les autres surfaces du planning. Les heures historiques de la grille peuvent rester visibles ; elles ne constituent pas une confirmation de fraîcheur. Quatre tests supplémentaires couvrent le rendu du statut, le chargement et les branchements de confirmation. Vérification visuelle de ces nouveaux états lors d'une coupure réelle encore requise.

### Recette de stress des noms longs

Site fictif supplémentaire qa-longnames créé uniquement dans demo-sentrys-accounts (émulateur). Nom site environ 246 caractères et nom client environ 289 caractères : cas de stress, non présenté comme validation des limites du formulaire.

À 390 px : document utile 375 px, pas de débordement global ; bandeau 284 px et lignes 120 px environ : lisibilité insuffisante pour un planning dense. À 907 px : bandeau 140 px et lignes 356 px environ. À 1366 px après stabilisation : lignes 239 px environ ; la première mesure immédiate après resize (0 px) était transitoire et n'a pas été retenue comme défaut. Capture PC : le démarrage guidé du site sans missions recouvre une partie des commandes, autre réserve ergonomique. Taille du navigateur réinitialisée.

Les capacités disponibles du navigateur intégré ne permettent pas de simuler une coupure réseau. Aucun réglage système réseau n'a été modifié. La coupure réelle et le parcours de changement d'agence restent non validés en navigateur ; les tests d'événements et de séparation de snapshots ne les remplacent pas.

### Corrections après stress des noms longs

Noms résumés sur deux lignes pour le site et une pour le client ; les textes complets restent consultables dans un volet natif, défilable et accessible au clavier. Bandeau avec noms longs fermé : environ 108 px à 390 px. Le démarrage guidé est remplacé par un volet dans le flux, sans superposition, conservant les deux actions existantes. Sous 1024 px, l'ouverture d'un volet étend le calendrier à 56 rem : test des deux volets ouverts à 390 px, zone des lignes 287 px et document utile 375 px sans débordement. Tests de structure responsive relancés après ce dernier ajustement CSS.

La projection dans AssignAgentsSheet reste hors périmètre : son fuseau et son contrat par défaut sont à revoir. Le classement des remplaçants utilise encore les heures de la période filtrée ; ce n'est pas la charge mensuelle complète. Les alertes sur données chargées ne garantissent ni complétude de l'historique ni conformité. Les choix d'exclusion des annulations/absences et le vrai « réalisé » issu des pointages exigent un lot métier séparé.
