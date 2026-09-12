# Reprise contrôlée des suppressions documentaires

Statut : spécification de recette et d'implémentation. Aucun outil de reprise automatique n'est livré par ce document. Aucune intervention de production n'est autorisée par cette procédure seule.

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

Implémentation dédiée, tests exécutant la logique, recette sur émulateurs, revue indépendante puis validation explicite du périmètre de production. Pas de suppression globale, de bouton de purge de masse ni de tâche automatique à ce stade.
