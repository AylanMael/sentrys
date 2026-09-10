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

La projection dans AssignAgentsSheet reste hors périmètre : son fuseau et son contrat par défaut sont à revoir. Le classement des remplaçants utilise encore les heures de la période filtrée ; ce n'est pas la charge mensuelle complète. Les alertes sur données chargées ne garantissent ni complétude de l'historique ni conformité. Les choix d'exclusion des annulations/absences et le vrai « réalisé » issu des pointages exigent un lot métier séparé.
