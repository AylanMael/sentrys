# Recette manuelle — perte de connexion du planning

Statut : test local rejoué et déclaré réussi par l’utilisateur après correction : message de vérification indisponible pendant la coupure et retour automatique du planning à la reconnexion. La tentative d’écriture hors ligne reste à tester séparément.

## Préconditions

- Serveur local et émulateurs démarrés ; ouvrir http://127.0.0.1:9002/dashboard/planning dans Chrome.
- Utiliser le responsable de recette locale, jamais une agence de production. Confirmer la bannière « Running in emulator mode ».
- Vue Mois, tous sites, tous agents, toutes publications et absences visibles. Attendre la confirmation serveur.
- Noter une vacation fictive existante, ses heures et le nombre de missions.

## Coupure et tentative d'écriture

1. Ouvrir DevTools (F12), onglet Network/Réseau. Choisir Offline dans le menu de limitation réseau. Garder DevTools ouvert et ne pas recharger la page.
2. Attendre la réaction du planning. Le résumé peut d’abord devenir non confirmé. Lors de la revérification d’accès (au retour sur la fenêtre ou sous environ 30 secondes), attendre « Vérification de l’accès indisponible », sans affirmation de suspension. Les données métier sont alors masquées par précaution.
3. Si le formulaire est encore accessible avant cette revérification, ouvrir une vacation fictive, modifier une note identifiable « RECETTE HORS LIGNE », puis tenter d'enregistrer une seule fois. Attendu : refus/erreur, aucun message de succès. Si l’écran de vérification masque déjà le planning, noter « écriture inaccessible » et ne pas chercher à contourner le blocage.
4. Rétablir No throttling/Aucune limitation. Ne pas réessayer l'enregistrement immédiatement. Attendre une nouvelle confirmation serveur.
5. Recharger puis rouvrir la vacation : la tentative hors ligne ne doit pas avoir modifié sa note. Vérifier les heures, l'absence de doublon et la restauration du résumé.
6. Si l'interface reste bloquée, conserver les messages d'erreur et l'heure du test ; ne pas répéter des écritures au hasard.

Toujours rétablir No throttling à la fin, même en cas d'échec. Ne pas couper le Wi-Fi comme substitut : les serveurs de cette recette sont sur la boucle locale.

## Résultats à renseigner

- Avertissement hors ligne : nouveau message validé par l’utilisateur après correction.
- Absence de faux succès lors de l'écriture : non exécuté.
- Reconnexion : retour automatique du planning et des vacations confirmé par l’utilisateur après correction.
- Données inchangées après rechargement : non exécuté.
- Le changement d'agence et les courses entre abonnements constituent une recette distincte ; les tests unitaires ne suffisent pas à les déclarer validés.

Référence pour la simulation : https://developer.chrome.com/docs/devtools/network/reference#offline
