# SEC-03 — Intégrité des données et suspension des agences

Branche candidate : `agent/platform-access`, base `b0af7ac`. Travaux locaux non livrés. SEC-03 est divisé en deux parties pour ne pas confondre protection des données et décision d'exploitation.

## SEC-03A — Protection des écritures directes

Le helper Firestore `forbidChange` utilise désormais `affectedKeys()` : un champ déclaré immuable est protégé contre l'ajout, la suppression et le remplacement. Les anciennes listes de champs sont conservées ; cette correction n'ajoute pas de nouvelles interdictions métier à ces listes.

| Collection / branche | Champs protégés |
| --- | --- |
| Sites, agents, vacations | `tenantId`, `createdAt`, `createdBy` |
| Incidents, gestionnaire | Champs communs et `siteId` |
| Incidents, agent | Champs communs, `siteId`, `severity`, `siteName` |
| Affectations, gestionnaire | Champs communs, `agentId`, `vacationId` |
| Affectations, autoédition | Champs communs, `agentId`, `vacationId`, `siteId` |

Le document `tenants/{tenantId}` devient non modifiable directement depuis un navigateur, quel que soit le rôle. La lecture de sa propre agence par un membre actif est conservée. Les changements de statut, paramètres et informations d'agence passent par les API serveur existantes.

### Compatibilité inspectée

Aucune écriture frontend directe vers `tenants` n'a été trouvée dans les sources inspectées. Les API `agency-profile`, `prepay/settings` et `onboarding/status` écrivent des objets explicitement construits via l'Admin SDK. Le parcours plateforme de suspension/réactivation écrit le statut et son journal dans une transaction. Ces chemins ne sont pas remplacés dans SEC-03A.

Les documents historiques dépourvus d'un champ immuable ne pourront plus recevoir ce champ par mise à jour navigateur. Toute régularisation éventuelle doit être une opération serveur contrôlée, pas une exception générale dans les règles.

### Vérification

`npm run test:rules:integrity` lance les deux suites dans des processus Node distincts, successivement, sur le même émulateur dédié. Cette séparation préserve leurs gardes d'environnement. Ne pas les réunir dans un processus partagé : chaque suite retire les variables d'autodécouverte après validation.

Prérequis et configuration identiques à SEC-01 : Node 22, Java 21, projet fictif `demo-sentrys-accounts`, Firestore loopback sur le port 8091. Aucune donnée ni clé de production. Les refus doivent produire `permission-denied`, et les témoins positifs vérifient les opérations légitimes.

La CI lance désormais `test:rules:integrity` après `test:rules:accounts`. Le script local `quality:check` ne lance pas ces suites : les exécuter explicitement.

### Résultats locaux du 8 septembre 2026

- Suite finale d'immutabilité : **104/104**, aucun échec.
- Suite finale du document d'agence : **453/453**, aucun échec, après ajout des cas agence active et création de son propre document absent demandés par la QA.
- `test:rules:integrity` : code 0, émulateurs arrêtés en fin de commande.
- Non-régression comptes exécutée pendant ce lot : **596/596**, aucun échec.
- `npm test` : **138/138**, aucun échec.
- TypeScript, lint final, contrôles de sécurité, syntaxe du nouveau test et `git diff --check` : code 0.

Revue indépendante favorable sur SEC-03A ; les deux compléments de QA ont été relus puis exécutés avec succès. Ces résultats ne clôturent pas SEC-03B et ne démontrent pas le fonctionnement complet des API serveur de provisioning. Aucun nouveau changement de dépendances dans SEC-03A ; les modifications du lockfile appartiennent au lot SEC-01 précédent.

## SEC-03B — Décision validée, implémentation candidate

Le diagnostic initial constatait que le statut de suspension n'était pas appliqué aux accès métier. Le candidat SEC-03B ajoute désormais ces contrôles aux API, règles et parcours concernés. Voir `recette-suspension-agences.md` pour la politique approuvée, les limites et la recette de livraison.

La décision utilisateur validée distingue :

- Consultation seule : conserver lectures et exports, refuser les écritures métier.
- Blocage métier total : conserver uniquement connexion, diagnostic et contact support.

Conséquences à traiter explicitement avant implémentation : agents en mission et pointage, incidents urgents, téléchargement des documents, diffusion/confirmation, endpoints utilisant POST pour une lecture ou GET avec effets de bord, onboarding, réactivation par la plateforme. Une simple condition fondée sur la méthode HTTP ne constitue pas une politique métier suffisante.

Les états `pending_setup`, `activation_requested`, `trial`, les statuts absents et le tenant spécial `platform` devront être distingués ; ne pas assimiler arbitrairement toute agence non `active` à une agence suspendue.

### Points d'application repérés pour SEC-03B

- `src/app/api/_utils/withTenant.ts` : garde principal à compléter, sans bloquer le diagnostic ou la réactivation plateforme.
- `src/app/api/clients/route.ts`, `clients/[id]/route.ts`, `billing/reconcile/route.ts`, `quotes/generate-advanced/route.ts` : authentification locale distincte, à couvrir explicitement plutôt que supposer une délégation au garde principal.
- `src/lib/api/admin-auth.ts` et `/api/admin/**` : autorisations administratives fondées sur les claims, à distinguer des accès métier agence.
- `functions/src/index.ts` : fonction HTTP séparée, donc non couverte par un changement du garde Next.js.
- `firestore.rules` et `storage.rules` : accès directs à traiter séparément des API utilisant l'Admin SDK.
- `src/app/api/me/route.ts` et `src/app/dashboard/layout.tsx` : conserver un diagnostic compréhensible. Le layout assimile actuellement les statuts non actifs à l'onboarding pour certains responsables ; ce comportement ne remplace pas une autorisation serveur et ne couvre pas tous les rôles.

## Limites et livraison

- Les règles ne restreignent pas l'Admin SDK : vérifier séparément les API et les autres gardes avant de déclarer la suspension effective.
- Les champs non présents dans les listes d'immutabilité, les contraintes de création et les transitions métier restent à auditer.
- L'identité `agentId` différente de l'UID Firebase reste un chantier distinct ; les témoins d'autoédition d'affectation utilisent ici l'identité actuellement attendue par les règles.
- Pas de modification de données historiques, ni de déploiement, commit ou push dans ce lot.
- La recette navigateur, les builds et la CI distante restent requis avant livraison. Une réussite locale n'atteste pas des règles réellement déployées.
