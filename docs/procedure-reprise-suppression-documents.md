# Reprise contrôlée des suppressions documentaires

Statut : spécification de recette et d'implémentation. Aucun outil de reprise automatique n'est livré par ce document. Aucune intervention de production n'est autorisée par cette procédure seule.

Premier socle local : `src/lib/uploads/document-cleanup-diagnostic.ts` fournit un contrôle pur, sans accès réseau ni écriture. Il vérifie le périmètre, le chemin, le statut de la trace et un inventaire de références fourni par l'appelant serveur. Son résultat positif signifie uniquement « inspection du stockage nécessaire ». Le collecteur exhaustif de références, la vérification des buckets/générations, la protection contre la concurrence et l'exécution restent à construire. Les tests unitaires ne constituent pas une recette sur émulateurs ni une validation de données réelles.

Collecte locale préparée : `src/lib/uploads/document-reference-inventory.ts` parcourt les pages fournies par un lecteur injecté, extrait `profile.documents` et les références photo, résout les anciennes URL Firebase et compte les références ambiguës. Une erreur, un curseur répété, un agent répété ou la limite de pages rend l'inventaire incomplet. Le résultat contient des chemins privés : usage serveur uniquement, jamais d'exposition ou de journalisation brute. L'adaptateur `document-reference-reader.ts` lit Firestore par agence, avec projection et pagination par identifiant (250 fiches maximum par page). Il n'est raccordé à aucune route publique ou tâche automatique. `complete` signifie seulement que toutes les pages fournies ont été consommées, pas que les données sont restées stables pendant la lecture. Une recherche limitée à une agence ne prouve pas l'absence de liens hérités dans une autre agence ou une autre collection : le périmètre exhaustif et la stabilité de lecture doivent être établis avant toute suppression.

Recette exécutée sur un émulateur dédié au projet `demo-sentrys-cleanup` : référence active détectée en dernière page, blocage du diagnostic associé, limite de pages conservatrice, exclusion de l'autre agence, lecture terminale vide et absence de modification des fiches par le lecteur. Les tests créent puis retirent uniquement leurs propres fiches fictives. Ce sont des tests du lecteur Admin, pas des tests de règles de sécurité ni une preuve de stabilité en présence d'écritures concurrentes. Commande du test après démarrage explicite d'un émulateur loopback : `node --test --experimental-test-isolation=none tests/emulator/document-reference-inventory.test.mjs` avec `FIRESTORE_EMULATOR_HOST` défini. La recette refuse un hôte non local et n'utilise jamais de projet implicite.

## Périmètre

Traiter une trace de remplacement `documentReplacementTraces` dont `cleanupStatus` vaut `pending`. Le nouveau document reste utilisable. Ne pas supprimer la trace, ni modifier les autres documents. Ne pas confondre cette reprise avec les suppressions ordinaires ou les fichiers orphelins, qui nécessitent un traitement distinct.

Le code actuel conserve `cleanupPath` côté serveur et ne le renvoie pas dans l'historique public de l'API. Une erreur de stockage ou de mise à jour de la trace peut laisser le statut en attente même si l'objet a déjà été supprimé.

## Phase 1 — Diagnostic sans écriture

1. Fixer explicitement l'environnement, l'agence, l'agent et la trace. Ne jamais déduire un environnement de production d'une configuration par défaut.
2. Relire l'agence, l'agent et la trace. Vérifier leur cohérence d'appartenance et le statut `pending`. Une trace absente, incohérente ou déjà traitée ne déclenche aucune suppression.
3. Valider un chemin strictement situé dans `tenants/<agence>/agents/<agent>/documents/<fichier>`, sans traversal, séparateur alternatif, caractère nul ou nom vide. Exclure les photos, URL externes, dossiers et préfixes globaux.
4. Vérifier que ce chemin n'est référencé par aucun document courant, photo ou référence héritée résoluble. Si la recherche est incomplète, non exhaustive ou échoue, bloquer la reprise ; ne pas interpréter une absence de résultat partiel comme une preuve.
5. Résoudre explicitement les buckets autorisés et inspecter chaque objet candidat. Identifier sa génération. Un refus de lecture ne signifie jamais « objet absent ».
6. Produire un rapport privé : admissible, bloqué avec motif, ou absence confirmée. Aucun jeton de téléchargement, secret ou contenu documentaire dans les journaux ni dans le dépôt public.

## Phase 2 — Action autorisée et ciblée

Socle d'inspection disponible en local : `document-storage-inspection.ts` relance le diagnostic, exige une liste explicite de buckets et lit uniquement leurs métadonnées puis celles de l'objet. Il conserve la génération exacte sous forme de chaîne, rejette une identité incohérente et ne renvoie ni contenu, ni jeton, ni chemin privé. Un bucket inaccessible (même avec une réponse 404) reste non vérifié ; seule une réponse 404 de l'objet après vérification du bucket est notée absente. La présence de métadonnées non vérifiées rend l'inspection incomplète. Les tests unitaires utilisent des doubles de stockage ; la recette sur émulateur a confirmé le refus conservateur lorsque les métadonnées du bucket ne sont pas disponibles (voir Conditions de livraison). Le parcours positif complet reste à valider sur un stockage de recette compatible. Les états renvoyés sont des observations, jamais une autorisation de suppression ni une mise à jour de la trace. La liste exhaustive des buckets doit être fournie par un appelant serveur autorisé, pas par le navigateur. Aucune route ou tâche n'utilise encore ce module.

Avant implémentation, résoudre la concurrence entre la vérification des références et la suppression : une simple lecture suivie d'une suppression laisse une fenêtre de réutilisation. Les chemins d'upload neufs sont uniques, mais cela ne suffit pas à prouver l'absence de réaffectation par tous les autres chemins d'écriture.

- Exiger une autorisation serveur adaptée et un motif d'intervention. Conserver le périmètre exact de l'opération, sans permissions de téléchargement supplémentaires.
- Prévoir un verrou ou un mécanisme équivalent de réservation, respecté par les chemins d'écriture concernés. Relire les préconditions avant l'action ; ne pas placer un appel Storage dans une transaction Firestore susceptible d'être rejouée.
- Supprimer uniquement l'objet inspecté, avec une précondition de génération. Si l'objet a changé, arrêter et refaire le diagnostic ; ne pas supprimer sa nouvelle version.
- N'enregistrer `deleted` qu'après suppression confirmée de tous les objets du périmètre. Enregistrer `not-found` uniquement après vérification d'absence sur tous les emplacements concernés.
- En cas d'échec partiel, conserver `pending` et les références serveur nécessaires. Si la suppression réussit mais que l'écriture d'audit échoue, une nouvelle tentative doit constater l'absence sans erreur destructive.
- Conserver auteur, date, motif, résultat et nombre de tentatives. Retirer le chemin technique de la trace après résolution confirmée, sans supprimer l'historique du remplacement.

Le helper actuel `deleteTenantFile` parcourt les buckets candidats sans précondition de génération. Ne pas le réutiliser tel quel pour un outil de reprise différée prétendant respecter les garanties ci-dessus.

## Recette obligatoire avant activation

| Cas | Résultat attendu |
| --- | --- |
| Autre agence, autre agent, photo ou chemin invalide | Refus avant accès destructif |
| Ancien fichier encore référencé | Refus, document courant intact |
| Références non vérifiables ou recherche incomplète | Refus conservateur |
| Trace absente ou déjà résolue | Aucun effet destructif |
| Ancien objet présent, non référencé et inchangé | Seul cet objet est supprimé ; nouveau document intact |
| Objet absent de tous les emplacements autorisés | Résolution `not-found` |
| Accès Storage refusé ou panne | Maintien `pending`, diagnostic exploitable |
| Génération changée ou référence réintroduite | Refus ou conflit, aucun objet nouveau supprimé |
| Deux opérateurs simultanés | Une opération contrôlée, résultat cohérent |
| Suppression réussie, audit momentanément indisponible | Reprise idempotente sans toucher au nouveau fichier |
| Historique consulté après intervention | Traces conservées, aucun lien vers l'ancien fichier |

## Conditions de livraison

Recette Storage locale (projet `demo-sentrys-inspection`, hôte explicite loopback) : l'objet fictif a été créé, inspecté sans changement de génération, puis retiré par le test et son absence vérifiée via l'API objet. L'émulateur installé ne confirme pas les métadonnées du bucket avec l'API utilisée ; le module conserve donc correctement `incomplete/unverified` avant et après retrait. Cette recette prouve le refus conservateur, pas le parcours positif d'inspection complète. Celui-ci reste couvert par des tests unitaires et devra être validé sur un stockage de recette compatible avant activation. Aucun contrôle de sécurité n'a été contourné pour faire passer la recette. Test : `tests/emulator/document-storage-inspection.test.mjs`, variable obligatoire `FIREBASE_STORAGE_EMULATOR_HOST`.

Implémentation dédiée, tests exécutant la logique, recette sur émulateurs, revue indépendante puis validation explicite du périmètre de production. Pas de suppression globale, de bouton de purge de masse ni de tâche automatique à ce stade.

### Complément de recette Storage réelle

Le parcours positif a ensuite été vérifié, avec autorisation, sur le bucket Sentrys en `EUROPE-WEST9` : création d'un seul objet fictif dans un chemin de recette unique, inspection des métadonnées, génération inchangée, retrait de cet objet avec précondition de génération et absence confirmée. Aucun document préexistant n'a été modifié. Cette validation complète la limite de l'émulateur décrite ci-dessus ; elle n'autorise pas l'activation d'une suppression différée.

### Protection des écritures concurrentes — premier sous-lot

La sauvegarde générale d'une fiche agent ne transmet plus les documents ni la photo. Son API refuse explicitement les champs `documents`, `photoUrl` et `photoPath` avec `DEDICATED_FILE_ACTION_REQUIRED` ; une ancienne page encore ouverte doit être actualisée. Les actions dédiées restent nécessaires pour modifier les fichiers.

Le PATCH général fusionne seulement les champs de profil effectivement modifiés. L'enregistrement d'une photo fusionne seulement `photoUrl` et `photoPath`. Ces deux écritures ne recopient donc plus un tableau de documents lu avant un remplacement concurrent. Les tests exécutent les routes et contrôlent les champs écrits, avec une concurrence simulée pour le PATCH ; ce n'est pas une preuve de verrouillage global.

Le PATCH relit dans une transaction le périmètre et le format actuel de la fiche. Pour un ancien profil encore stocké à la racine, les champs modifiés restent à la racine : aucune migration implicite ne masque les informations historiques. Ce cas est couvert par un test de réponse et de persistance simulée.

### Création d'agent — second sous-lot

Le POST général refuse les champs `documents`, `photoUrl` et `photoPath`, à la racine ou dans `profile`, y compris lorsqu'ils sont vides. Le refus `DEDICATED_FILE_ACTION_REQUIRED` intervient avant réservation de quota, création ou audit de création. Le client doit créer la fiche sans ces champs, puis utiliser les actions dédiées d'importation. Le formulaire actuel suit déjà ce parcours.

Le profil créé contient une liste de documents vide et aucune référence de photo fournie par l'appelant. Les tests exécutent le POST avec des références anciennes, des URL, des champs imbriqués et des corps invalides ; ils vérifient aussi la création normale, le tenant imposé par l'authentification, les rôles, le quota et l'audit. Ils reposent sur des dépendances simulées et ne prouvent pas à eux seuls la sécurité des autres écrivains.

### Écritures directes et migration — troisième sous-lot

Les règles Firestore interdisent aux clients de créer ou modifier les références `documents`, `photoUrl` et `photoPath`, à la racine et dans `profile`. La suppression d'un champ, d'un profil contenant des références ou le remplacement intégral du document ne contourne pas ce contrôle. Pour les fiches historiques avec références racine, la présence de `profile` reste inchangée afin de ne pas masquer ou réexposer ces références. Un profil inchangé, même `null`, n'empêche pas une modification indépendante autorisée.

Recette dédiée : `tests/emulator/agent-file-reference-rules.test.mjs`, projet imposé `demo-sentrys-file-rules`, `FIRESTORE_EMULATOR_HOST` explicite et loopback uniquement. Elle vérifie les rôles de gestion, les références anciennes, les suppressions, les champs ordinaires, les profils historiques, la suspension et l'isolation inter-agences. Les fixtures ont des identifiants uniques ; seul leur périmètre est nettoyé. Le JAR utilisé nécessite `-Duser.language=en -Duser.country=US` pour éviter une erreur interne de messages de compilation en français.

Le script `migrate-agent-file-tokens.cjs --repair` exige désormais la version `updateTime` du snapshot et la transmet comme précondition atomique `lastUpdateTime` à Firestore. Une fiche modifiée entre-temps n'est pas écrasée. Un horodatage manquant provoque un refus avant les écritures. Attention : les révocations de tokens Storage déjà effectuées avant un conflit ne sont pas annulées ; le rapport conserve l'erreur et ne compte pas l'agent comme réparé. Les tests exécutent le script avec des dépendances simulées, sans credentials, réseau ni données réelles. Le script n'a pas été exécuté en production pour cette recette.

Inventaire ciblé : le script de recette documentaire impose un émulateur loopback et une création sans écrasement ; les routes de seed restent protégées par leur garde de production. Les SDK Admin contournent les règles Firestore : ces protections ne constituent donc pas une réservation partagée ni la preuve d'exhaustivité de tous les écrivains.

### Inventaire des références historiques — quatrième sous-lot

Le lecteur projette désormais `documents`, `photoPath` et `photoUrl` à la racine, en plus de `profile`. Le collecteur analyse les deux emplacements systématiquement, sans priorité ni fallback : un profil récent ou vide ne masque plus une référence historique. Les chemins identiques sont dédupliqués et les URL Firebase anciennes sont résolues sans conserver leurs jetons dans le résultat. Un format ambigu à l'un des emplacements augmente `unresolved` et bloque le prédiagnostic, même si l'autre emplacement est valide.

Les tests unitaires couvrent la coexistence des schémas, les profils absents/null/vides, les URL historiques et les formats ambigus. La recette Firestore vérifie la projection réelle, une référence historique sur la dernière page, le refus `still-referenced` ou `incomplete-references`, l'absence de jetons dans le résultat et les données inchangées après lecture. Elle utilise exclusivement un projet `demo-sentrys-cleanup` sur émulateur loopback.

`complete` signifie uniquement que toutes les pages demandées ont été parcourues : ce n'est ni une preuve d'absence globale de référence, ni un snapshot stable. La requête reste limitée à la collection `agents` et au tenant demandé ; les autres collections, tenants et champs non inventoriés ne sont pas couverts.

### Cartographie hors fiches agents — audit de code

Cette cartographie décrit des chemins possibles dans le code ; aucun document de production n'a été lu pour rechercher une occurrence réelle.

| Emplacement | Nature | Conséquence pour une reprise différée |
| --- | --- | --- |
| `tenants/{id}` : `agencyProfile.logoUrl`, variantes `logoPath`/`logo`, et valeurs historiques racine | Référence utilisée pour le logo, normalisée par `src/lib/agency/profile.ts` | À inventorier ; un lien Firebase peut désigner un objet du bucket, sans garantie que son chemin soit réservé aux logos |
| `planningDispatches/{id}.agencyProfile` | Copie du profil agence au moment de la diffusion, conservée dans les lignes persistées | À inventorier même si le logo du tenant a changé : le lecteur privilégie cette copie lorsqu'elle existe |
| `sitePlanningDispatches/{id}.agencyProfile` | Copie conservée lors de la remise client et restituée par le GET | À inventorier conservativement ; l'impression site actuelle recharge toutefois le profil courant via `/api/agency-profile`, pas cette copie historique |
| `agents/{id}/documentReplacementTraces/{trace}.cleanupPath` | Référence technique d'une opération de nettoyage en attente | Ne pas la confondre avec une utilisation métier. Elle identifie la cible et les opérations concurrentes, mais ne constitue pas, seule, un motif de conservation perpétuelle |
| `activity.meta` | Métadonnées d'audit génériques, susceptibles de contenir des valeurs historiques | Aucune consommation comme fichier métier identifiée dans les composants d'activité examinés. Ne pas supprimer les traces ; leur classification ne prouve pas l'absence d'autres consommateurs |
| `NEXT_PUBLIC_COMPANY_LOGO_PATH` | Référence de configuration utilisée par le profil public | Hors inventaire Firestore ; à vérifier dans le périmètre de déploiement avant une suppression |

Preuves de code : `src/app/api/agency-profile/route.ts` normalise puis stocke le profil sans réserver un préfixe Storage au logo. `src/app/api/planning-dispatches/route.ts` et `src/app/api/site-planning-dispatches/route.ts` copient `agencyProfile` dans les objets persistés. Les lecteurs des diffusions utilisent `data.agencyProfile` avant le profil courant ; l'impression agent consomme ce profil historique. L'impression site recharge actuellement le profil courant, donc l'utilisation de sa copie historique pour cette impression n'est pas établie. Le GET de l'historique documentaire projette explicitement les champs publics et n'expose pas `cleanupPath`.

Conclusion : l'inventaire actuel des seuls agents ne peut pas autoriser une suppression différée à lui seul. Prochain sous-lot : ajouter des lecteurs bornés pour les profils agence et les deux collections de diffusions, extraire les variantes historiques sans masquer les références coexistantes, et bloquer conservativement toute référence indéterminable. Les tests devront couvrir un ancien logo conservé uniquement dans une diffusion après changement du logo courant, la pagination et les erreurs de lecture. La classification des journaux techniques ne doit jamais donner lieu à leur effacement.

### Inventaire multi-sources — cinquième sous-lot

`collectTenantFileReferences` réunit désormais les lectures de `agents`, du document `tenants/{tenantId}`, de `planningDispatches` et de `sitePlanningDispatches`. Le lecteur agence n'accepte que ces trois dernières sources, projette les champs nécessaires et impose le tenant ; les diffusions sont paginées par identifiant. Chaque source a sa propre borne de pages. Un tenant absent, une erreur de lecture ou une pagination incomplète empêche un résultat complet. Aucun appel à Storage ni écriture n'est effectué.

Le collecteur de profils agence examine toutes les variantes `logoUrl`, `logoPath`, `logo`, à la racine et dans `agencyProfile`, sans priorité masquant une ancienne référence. Il réutilise l'analyse conservatrice des chemins agents et URL Firebase : les autres URL, routes internes sans chemin résolu, chemins statiques ou profils malformés restent `unresolved`. Ce choix peut bloquer le diagnostic pour un logo externe légitime ; il ne doit pas être remplacé par une exclusion silencieuse sans preuve que la référence est indépendante de la cible.

Le résultat regroupe les chemins dédupliqués et les compteurs par source, sans jetons ni détails d'erreur. Les chemins restent privés, réservés au traitement serveur. `complete` décrit uniquement le parcours de ces quatre sources ; il doit toujours être combiné avec `unresolved === 0`, et ne garantit ni l'absence globale de références ni la stabilité face aux écritures concurrentes. Ce collecteur n'est branché à aucune route ou tâche de suppression.

Recette : `tests/emulator/tenant-file-reference-inventory.test.mjs` exécute les vrais modules et les requêtes Firestore sur émulateur. Elle vérifie notamment l'ancien logo sur la dernière page de chacune des collections de diffusion, les variantes racine/imbriquées, les autres tenants exclus, le tenant absent, les bornes par source et la conservation des données et de leur `updateTime`. Les seuls documents supprimés en fin de recette sont les fixtures créées par ce test.

Restent à traiter avant toute purge : portée inter-agences, références de configuration et collections non inventoriées, revue des autres écritures Admin et réservation partagée. La suppression automatique demeure désactivée. Les changements de règles nécessitent un déploiement Firestore explicite ; un déploiement App Hosting seul ne prouve pas leur activation.
