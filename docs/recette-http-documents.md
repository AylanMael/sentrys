# Recette HTTP des documents privés

Commande : `npm run test:documents:http`.

Prérequis : Node 22.15+ (version 22 récente recommandée), Java 21+, dépendances npm installées et runtimes Firebase Emulator disponibles. Le premier démarrage peut télécharger ces runtimes. Ne pas charger de fichier `.env` ni de clé de service pour cette recette.

## Périmètre et sécurité

- Projet imposé : `demo-sentrys-documents-http` ; hôtes exclusivement `127.0.0.1`.
- Auth 9394, Firestore 9395, Storage 9396, hub 9397, logs 9398. Le lanceur refuse des ports déjà occupés.
- Serveur HTTP de recette sur un port local attribué par le système.
- Comptes fictifs à identifiants UUID, mots de passe aléatoires et jetons émis par Auth Emulator, jamais affichés.
- Aucun secret, compte ou fichier de production ; aucune purge globale des émulateurs.
- Nettoyage des seules données UUID de l'exécution, puis arrêt des émulateurs par Firebase CLI.
- Le chemin Storage est obligatoire : le mode de production du gestionnaire désactive le repli local `.private-uploads`. Cela ne connecte pas la recette à la production.

## Parcours

1. Import V1 par un responsable et téléchargement HTTP avec cache privé désactivé.
2. Refus de téléchargement et remplacement : agent (403), responsable d'une autre agence (404), visiteur sans jeton (401).
3. Vérification que ces refus n'ont pas changé la référence V1.
4. Remplacement V1 par V2 par le responsable via multipart HTTP.
5. Ancienne URL applicative V1 en 404 et ancien objet absent dans Storage Emulator.
6. V2 téléchargeable ; historique contenant V1/V2, sans chemin technique de nettoyage.
7. V2 et historique toujours refusés à l'agent et à l'autre agence.

## Limites

Les gestionnaires applicatifs, le contrôle d'authentification, les transactions Firestore et les opérations Storage sont réels, reliés aux émulateurs. Le marqueur de compilation `server-only` est résolu comme côté serveur par Next.

Un adaptateur HTTP minimal appelle les gestionnaires : ce n'est **pas** une recette navigateur ni un démarrage complet Next.js. Le routage Next, le middleware, App Hosting, IAM et la configuration déployée ne sont pas validés par ce test. Il ne remplace donc pas le contrôle HTTP authentifié encore ouvert en production.

Les octets PDF sont une fixture minimale de signature/contenu, pas un document destiné à une recette visuelle.
