# TER-01A — Interface et lecture des missions agent

Base : `f5ebcf0`, branche `agent/platform-access`. Recette locale sur les émulateurs `demo-sentrys-accounts`, le 9 septembre 2026. Aucun changement de règles Firestore/Storage ni de données métier pour ce correctif.

## Comportement

- Navigation agent limitée à Mes missions et Mes diffusions, y compris recherche. Abonnement, configuration et notifications exploitation retirés de cette navigation. L'accueil agent affiche ses missions, pas le cockpit exploitation. Les contrôles API existants restent nécessaires pour les URL directes.
- `GET /api/agent-missions` exige un membre agent actif. La transaction relit membre, agence, affectations, vacations et sites. Le rattachement agent, l'agence et l'affectation actuelle sont vérifiés avant la projection. Aucun document site complet n'est exposé ; seules son identité et son nom sont retournés avec les horaires de la mission.
- Pagination : 20 affectations par page, tri par mise à jour, curseur rattaché au même agent et tenant. Le tri chronologique dans les groupes porte sur les pages chargées, pas sur toute la base. Les compteurs partiels sont signalés. L'index assignments tenantId/agentId/status/updatedAt existe déjà dans le dépôt ; sa disponibilité cloud reste à vérifier.
- Trois groupes : En cours, À venir, Terminées. Dates et heures explicitement en Europe/Paris. Actualisation manuelle et au retour de focus, horloge affichée recalée sur l'heure du serveur. Au début d'une mission future, actualiser pour obtenir les nouvelles autorisations.
- Pointage serveur : début planifié inclus, fin planifiée exclue, y compris pour une agence active. Aucune tolérance avant/après ni régularisation automatique. La fin dépassée doit être traitée par le responsable, pas par un pointage antidaté. La politique particulière de suspension commerciale reste inchangée.
- Les incidents ne subissent pas de nouvelle restriction serveur générale dans ce lot. L'écran terrain ne propose d'action que sur les missions en cours autorisées.

## Vérifications

- Suite locale : 354 tests réussis, dont 26 nouveaux tests de projection/endpoint et 8 refus temporels du pointage pour agence active.
- Appel HTTP réel : le compte agent reçoit le nom Tour Eiffel et les horaires du 2 septembre, phase `ended`, `canAct: false` (200, no-store).
- Appel HTTP réel du pointage de cette ancienne vacation : 403. Pas de présence enregistrée.
- Navigateur : navigation réduite, site et dates lisibles, ancienne vacation rangée dans Terminées sans bouton de pointage.

## Reste à valider

Mission de test réellement en cours, coordonnées adaptées au site de recette, autorisation GPS du navigateur, prise de service puis incident et fin de service. Vérifier également la suspension commerciale en cours de formulaire et la réaffectation concurrente. La présence d'une vieille affectation ne constitue pas un test positif de ce parcours.

Les fixtures mémoires ne prouvent pas la concurrence distribuée ni les index cloud. Aucun commit, push ou déploiement implicite.

Revue indépendante statique sans blocage sur les autorisations, la projection et le pointage transactionnel. Compléments demandés : pagination, frontières du pointage réel, concurrence. Le mock couvre désormais le passage à la page suivante et les pages filtrées ; les 8 tests de frontière entrée/sortie sont dans `tenant-suspension.test.mjs`. Les égalités de dates et déplacements entre pages en base réelle, les reprises transactionnelles distribuées et le parcours GPS restent à vérifier. TypeScript, lint ciblé et contrôle de sécurité réussis.
