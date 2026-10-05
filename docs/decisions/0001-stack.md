# Décision 0001 : choix de la stack

Date : 2026-10-05

**Contexte** : création du projet « Documental » : un outil métier, un espace client.

**Décision** : Application web + API (React · Vite · Hono). Base : PostgreSQL avec Drizzle et migrations versionnées. Connexion : Mot de passe + 2FA (Better Auth, données dans la base du projet). Panel admin généré dans le projet : Clients. Modules : Docker, E-mails. Apparence : thème Tech, barre latérale + barre du haut.

**Écartés** :

- MongoDB ou Firebase : données relationnelles mal servies, sortie difficile.
- Microservices : un seul service bien découpé se reprend mieux à cette échelle.
- GraphQL : une API REST typée et validée suffit.
- Un CMS ou un panel tout fait : un second modèle de données et une dépendance de plus.

**Conséquences** : des choix standard, reprenables par n'importe quel développeur JS/TS ; le
socle (TypeScript strict, Vite+ avec Oxfmt et Oxlint, CI, Renovate) est le même sur tous les projets du kit en front et back séparés.

**À revoir si** : un besoin mesuré (charge, hors ligne, temps réel) dépasse ce que ces choix couvrent.
