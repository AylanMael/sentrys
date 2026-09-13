# Sentrys — Registre des lots et décisions

État ouvert le 8 septembre 2026. Ce registre distingue réalisation et acceptation ; il n'est pas un calendrier contractuel.

## Décisions

### D-001 — Ne pas travailler sur le checkout historique modifié

`main` local : `ac9ff1a`, 34 fichiers suivis modifiés avant notre intervention. `origin/main`, vérifié par fetch : `b0af7ac`. Travaux préservés. Développement du premier correctif isolé sur `agent/platform-access`. Aucun reset, stash global, écrasement ou fusion aveugle.

### D-002 — Revue L2 : NO-GO pour clôture du chantier sécurité

Une revue indépendante du worktree `agent/stabilisation-l2-security` relève :

- une branche administrateur autorisant encore l'édition des champs d'autorité de `tenantUsers` ;
- `changedKeys()` encore employé dans le helper d'immutabilité général ;
- absence de traitement uniforme de la suspension d'agence ;
- contrôles plateforme inégaux suivant les API ;
- statut utilisateur absent considéré différemment par API et règles ;
- couverture insuffisante des droits métier lorsque `agentId` diffère de l'UID Firebase.

Les améliorations existantes ne sont pas rejetées en bloc : elles restent à compléter et à tester. Les fichiers de ce worktree ne sont pas modifiés par l'équipe de ce lot.

### D-003 — Premier correctif borné, aucune déclaration de sécurité globale

Unifier la frontière `/api/platform/**` sans changer les opérations métier. Le relecteur indépendant a pouvoir de bloquer l'intégration. Tant que les champs d'autorité restent modifiables via un autre chemin, l'identité plateforme n'est pas considérée comme sécurisée de bout en bout.

### D-004 — L1 : progrès vérifiés, réception fonctionnelle incomplète

La revue QA indépendante confirme la correction de l'option de tests Node 22 dans L1, 67 tests réussis, TypeScript et lint racine réussis, ainsi que TypeScript Functions. Ces résultats portent sur le worktree L1, pas sur un build de production ni sur l'installation fraîche en CI.

L1 n'est pas la copie exacte des modifications historiques : sur 34 fichiers, 4 sont repris à l'identique après normalisation des fins de ligne, 26 divergent et 4 changements historiques ne sont pas repris ; L1 modifie aussi 9 fichiers supplémentaires. Toute reprise sera sélective.

Réserve de recette : L1 modifie le contrat de liste des vacations et les limites d'impression planning site. Un contrat statique réécrit pour accepter une API réduite ne démontre pas que ses anciens consommateurs restent compatibles. Vérifier filtres, pagination et exports avant clôture de REF-01.

La vérification complémentaire ne trouve pas de consommateur GET vacations envoyant encore les filtres refusés. Elle relève en revanche des liens d'impression sans `siteId`, incompatibles avec la page qui exige désormais ce paramètre : « PDF des sites » du planning, export depuis la fiche client, exports multisites de `SiteDispatchSheet`, aperçu email client et URL générée par l'API de remise client. Résultat attendu par lecture : demande de sélectionner un site après ouverture. Ces parcours doivent être corrigés ou proposer le choix du site avant ouverture ; ils ne sont pas considérés comme recettés.

### D-005 — Revue du garde plateforme : GO technique borné

Revue indépendante : aucun défaut bloquant trouvé dans le patch des sept routes/onze handlers. Contrôles placés avant opérations métier et contrats d'erreur préservés. TypeScript, lint et contrôles statiques passent sur la branche candidate.

Réserves demandées au développeur : fixture authentifiée explicitement active, cas sans token/membre absent/membre désactivé avec le vrai code d'authentification et clarification de la normalisation des rôles dans les tests. La revue du garde ne valide ni Firestore, ni les mutations métier complètes, ni le déploiement. Le statut absent encore admis par le helper d'authentification général reste suivi dans SEC-03.

Les compléments de tests demandés sont implémentés et vérifiés par le parent. L'inventaire inclut aussi un futur handler situé directement à la racine du dossier plateforme. Suite complète exécutée par le parent : **125 tests réussis, 0 échec** (67 existants, 58 ajoutés). Les dépendances externes des nouveaux tests sont simulées ; le vrai garde et les fonctions des routes sont exécutés. Aucun appel Firebase de production.

Preuve avant/après rapportée par le développeur : chargement de HEAD en mémoire sans modifier le patch. Un `super_admin` d'agence atteignait le métier sur audit GET/POST (200/201), tenants POST (400 métier), tenant GET/PATCH (404/400 métier). Les cinq handlers retournent 403 après correction, avant accès métier. Cela démontre le durcissement d'autorisation, pas la réussite des mutations métier.

### Preuves locales du lot SEC-02

Environnement : Node 22.23.2, npm 10.9.8, worktree `sentrys-platform-access`, base `b0af7ac`, modifications non commitées.

| Commande | Résultat |
| --- | --- |
| `npm ci --ignore-scripts --offline --no-audit --no-fund` | Code 0, 1369 paquets installés ; scripts lifecycle désactivés, donc pas équivalent à toute la CI |
| `npm run typecheck` | Code 0 |
| `npm run lint:ci` | Code 0 |
| `npm run security:check` | Code 0 |
| `npm test` | Code 0, 125/125 ; sous-processus esbuild autorisé hors sandbox pour les tests locaux |
| `git diff --check` | Code 0 |

Build Next/Functions, CI distante du patch, émulateur Firestore et recette authentifiée : non exécutés pour ce lot. Aucun commit, push, merge ou déploiement. SEC-02 est implémenté, testé localement et relu sur son périmètre ; pas encore intégré ni livré. SEC-01 et SEC-03 restent bloquants pour toute réception globale de sécurité.

### D-006 — SEC-01 : GO technique borné après tests sur émulateur

Sur `agent/platform-access`, les écritures navigateur sur les comptes sont limitées au nom et à la date de profil du membre actif lui-même. Les champs d'autorité ne sont plus modifiables directement, même par un administrateur. Le garde API refuse un statut absent ou nul. Le worktree L2 historique demeure intact ; son NO-GO antérieur n'est pas effacé.

Validation finale exécutée par le parent : **138/138 tests API/métier**, **596/596 tests Firestore sur émulateur**, aucun échec. TypeScript, lint, contrôles de sécurité et `git diff --check` : code 0. Revue indépendante sans blocage sur ce périmètre, dont la réserve de réexécution finale est levée par ces résultats.

Tests Firestore : projet fictif `demo-sentrys-accounts`, boucle locale, Java 21, aucun accès aux données de production. Le workflow CI inclut désormais explicitement cette suite ; le script local `quality:check` ne la lance pas et doit être complété par `npm run test:rules:accounts`.

Builds, installation fraîche du nouveau lockfile, CI distante et recette authentifiée restent à exécuter. Inventaire des anciens comptes sans statut requis avant livraison. Aucun commit, push ou déploiement. Voir `recette-securite-comptes.md` pour les limites et conditions de livraison. SEC-03 et les autres chemins d'autorisation restent ouverts.

### D-007 — SEC-03 séparé : intégrité des écritures et politique de suspension

SEC-03A ferme deux chemins directs : ajout/suppression des champs déjà déclarés immuables et modification navigateur du document d'agence. Les paramètres légitimes passent par les API serveur existantes ; la lecture de sa propre agence est conservée.

SEC-03B ne sera pas défini implicitement par le correctif : le choix entre consultation seule et blocage métier total a été demandé à l'utilisateur. Aucune politique de suspension effective n'est encore ajoutée aux gardes API, à Storage ou aux fonctions HTTP. Les cas de pointage en cours, onboarding et accès plateforme nécessitent un traitement explicite.

Revue indépendante SEC-03A favorable sur le code, initialement conditionnée aux tests finaux. La QA a demandé deux compléments : agence active et création de son propre document d'agence absent. Ces cas sont ajoutés et relus. Résultats finaux : **104/104 tests d'immutabilité et 453/453 tests du document d'agence**, aucun échec. La condition de réexécution est levée. Les suites comptes (596) et API/métier (138) passent également ; TypeScript, lint et contrôles de sécurité réussis. Voir `recette-integrite-agences.md` pour les limites. Aucun commit, push ou déploiement ; réception globale SEC-03 toujours ouverte.

### D-008 — SEC-03B : politique approuvée et candidat vérifié localement

L'utilisateur a validé les deux modes : commercial (consultation et exception terrain bornée) et sécurité (aucun accès métier). Le candidat conserve le cutoff lors d'un changement de mode et réserve la réactivation à la plateforme autorisée. Voir `recette-suspension-agences.md`.

Résultats finaux de tests : **308/308 serveur**, **596/596 comptes**, **104/104 immutabilité**, **453/453 document d'agence**, **142/142 suspension Firestore/Storage**. Soit 1 295 tests d'émulateur, sans échec. Revue indépendante favorable sur le delta ; conditions de réexécution des règles levées. TypeScript, lint, sécurité et Functions lint/build réussis. Le build Next final isolé est réussi (114 pages statiques) ; sa configuration de démonstration n'est pas destinée au déploiement.

Travaux uniquement sur `agent/platform-access`, départ `ab8f810`. Aucun commit/push/déploiement pour SEC-03B, aucune clé ni donnée de production utilisée. CI distante, recette navigateur et validation des règles/index réellement déployés restent nécessaires. Les anciennes URL de téléchargement publiques ne sont pas révoquées par ce patch ; leur inventaire est une condition de livraison.

## Backlog ordonné

| ID | Périmètre | Priorité | État initial | Critère de réception |
| --- | --- | --- | --- | --- |
| REF-01 | Référence, L1, CI et travail local | Prérequis | Référence vérifiée ; revue L1 demandée | Reproduire les validations sur révision précise ; documenter les divergences utiles |
| SEC-01 | Champs d'autorité comptes et règles | Critique | Candidat isolé implémenté, tests et revue technique réussis ; non intégré | Aucun rôle ne peut s'auto-promouvoir, se réactiver ou relier arbitrairement un agent ; tests d'émulateur positifs et négatifs |
| SEC-02 | Autorité plateforme des API | Critique, complément SEC-01 | Implémenté, testé localement, revue technique bornée ; non intégré | Politique commune ; refus agence/sans rôle/hors plateforme avant toute opération métier ; tests et revue |
| SEC-03 | Suspension, champs immuables, écritures directes | Élevée | A poussé sur branche candidate ; B implémenté, tests et revue locale réussis, non livré | Politique active/pending/suspendue validée ; ajout/suppression/remplacement testés ; pas de contournement direct des invariants |
| TER-01 | Identité agent et pointage | Élevée | À traiter | Pointage autorisé au bon agent/tenant ; refus des autres ; reprises et concurrence maîtrisées |
| PAY-01 | Temps, absences et pré-paie | Élevée | Reproductions disponibles dans l'audit | Notes sans effet sur nature de l'absence ; fuseau explicite ; frontières calendaires et export validés par référent paie |
| PLN-01 | Affectations et opérations groupées | Élevée | À traiter | Pas d'incohérence sous concurrence ; échec partiel explicite ; reprise idempotente |
| DIS-01 | Publication, diffusion et confirmations | Élevée | À traiter | Statuts fondés sur résultats enregistrés ; versions et canaux explicites ; aucune fausse réussite |
| DAT-01 | Exhaustivité des listes et indicateurs | Importante | À traiter | Pagination consommée jusqu'au périmètre annoncé ; recherche complète ; compteurs partiels identifiés |
| UX-01 | Parcours planning et agent | Importante | Recette visuelle à organiser | Parcours de référence réalisables au clavier/tactile ; erreurs récupérables ; tests utilisateur |
| ONB-01 | Prise en main et imports | Importante | À cadrer | Première mission diffusée et confirmée ; import prévisualisé, contrôlé et reprenable |
| OPS-01 | Observabilité, sauvegarde, reprise et charge | Élevée avant généralisation | Configuration cloud non vérifiée | Restauration testée, seuils convenus, alertes utiles, révision déployée identifiable |
| WEB-01 | Vitrine, design system et promesses | Importante | À traiter | Responsive/accessibilité mesurés ; médias présents ; promesses correspondant au produit livré |

## Éléments bloquant une réception globale

1. Pas encore de validation des règles réellement déployées ni de l'IAM cloud.
2. Pas encore de recette authentifiée multi-rôles, mobile et réseau dégradé.
3. Choix métier à faire valider : suspension d'agence, conditions de dérogation, export de paie, traitement des absences et des heures réalisées.
4. Sauvegardes et capacité de restauration non démontrées.
5. Les tests existants ne couvrent pas tous les scénarios adverses et de concurrence.

## Format du compte rendu de lot

Révision de départ ; fichiers modifiés ; comportement avant/après ; tests et environnement ; objections de revue ; risques restants ; état Git ; autorisation de fusion/déploiement. L'absence d'une preuve est notée « non vérifié », jamais remplacée par une promesse.
