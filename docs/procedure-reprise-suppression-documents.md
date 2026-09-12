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
