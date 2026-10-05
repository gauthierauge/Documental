# Décision 0002 : architecture

Date : 2026-10-05

**Contexte** : « Documental ».

**Décision** : Direct (par fonctionnalité), front et back séparés. Le code de chaque fonctionnalité dans un dossier : routes, requêtes et écrans côte à côte. Pour un site, une petite app ou un outil interne.
Monorepo à workspaces Bun : apps/api, apps/web, packages/ partagés. Une seule image Docker, même origine.

**Écartés** :

- Clean : Plus de fichiers au départ : 2 à 4 par cas d'usage.
- DDD : Demande des ateliers avec le client pour découper les contextes.

**Conséquences** : chaque workspace déclare les dépendances que son code importe ;
`tsc -b` vérifie les références entre projets ; `vp check` (Vite+ : Oxfmt, Oxlint typé) formate
et lint tout le dépôt depuis le `vite.config.ts` de la racine ; l'API sert l'écran compilé depuis
la même origine, dans une seule image Docker.
Le métier se mêle au framework quand l'app grossit.

**À revoir si** : le code métier grossit : passer en Clean, module par module, dans une décision écrite.
