# Recette locale — isolation des missions agent

Exécution du 10 septembre 2026, contre Next local 127.0.0.1:9002 et les émulateurs Auth 9099 / Firestore 8091 du projet demo-sentrys-accounts. Aucune requête de production.

Script reproductible : `node scripts/check-agent-isolation-local.cjs`.
Le script crée seulement des comptes et documents fictifs avec un préfixe unique ; ils restent dans les émulateurs pour inspection. Ne pas utiliser en production.

## Résultat : 13 contrôles réussis sur 14

Fixture : `qa-isolation-1789051386240` ; agents A et B dans une agence et autorisés sur le même site, agent C dans une seconde agence.

- Les trois listes terrain ne contiennent que la mission du compte connecté : 200, validé.
- Lecture directe de sa propre vacation : 200, témoin positif validé.
- **Lecture directe par A de la vacation de B : 200 au lieu d’un refus. Anomalie confirmée.**
- Curseur de mission de B utilisé par A : 403.
- Tentatives de check-in / check-out de B par A : 403 ; affectation inchangée.
- Lecture directe de la vacation de C par A : 404.
- Curseur de mission de C utilisé par A : 403.
- Tentatives de check-in / check-out de C par A : 403 ; affectation inchangée.

Les 26 tests existants `tests/agent-terrain.test.mjs` passent également : ils ne couvrent pas cette lecture directe via `/api/vacations/[id]`.

## Cause et suite proposée

`GET /api/vacations/[id]` appelle `canUserAccessSite`, qui vérifie l’autorisation du site pour le rôle agent, pas l’affectation à la vacation demandée. Cela ne suffit pas à garantir « uniquement ses missions ».

Après ce diagnostic, correction locale des trois lectures API : vacation directe, affectations de vacation, liste de vacations filtrée par agent et curseur lié à son identité. Les droits des responsables restent inchangés.

## Revalidation après correction

- Fixture `qa-isolation-1789052000216` : **22 contrôles HTTP réussis sur 22**, dont refus 403 de la lecture directe d’un collègue, lecture de ses propres missions et absence d’écriture lors des pointages interdits.
- **551 tests applicatifs réussis**, dont 8 nouveaux tests de lecture agent ; TypeScript, lint ciblé et contrôles de sécurité passent.
- La revue indépendante a signalé le chemin direct Firestore, également corrigé pour les vacations.
- **3 tests Firestore réels réussis** dans le projet démo distinct `demo-sentrys-isolation`, émulateur 8091 : lecture propre autorisée, collègue/mauvais tenant/document incomplet/map/chaîne/null refusés, requêtes SDK de liste agent refusées (même filtrées), lecture et liste du responsable conservées, accès anonyme refusé. Les listes agent sont réservées aux API filtrées testées ci-dessus ; ne pas intégrer de nouvelles listes SDK côté agent.
- Les tests de règles se lancent séparément : `node --test --experimental-test-isolation=none tests/emulator/vacation-agent-read.test.mjs` (émulateur 8091 requis). Ils ne sont pas inclus dans `npm test`.

## Livraison à prévoir

Rien n’est déployé par cette recette. Déployer les règles et le nouvel index `vacations` (tenantId, siteId, assignedAgentIds CONTAINS, startAt ASC, __name__ ASC) et attendre que l’index soit prêt avant la livraison de l’application. Les émulateurs ne prouvent pas la disponibilité de cet index en production.

Périmètre limité : cette recette ne valide pas l’ensemble des règles Firestore, les incidents, les exports ou toutes les routes de l’application. Une vacation legacy multi-agents peut encore afficher les identifiants des coaffectés dans son DTO ; cette recette porte sur l’accès aux vacations non affectées.
