# Documental

Un outil métier, un espace client. React · Vite · Hono, TypeScript strict.

## Installer et lancer

Prérequis : [Bun](https://bun.sh) 1.4 ou plus (`curl -fsSL https://bun.sh/install | bash`).

```sh
make install           # vérifie la version de Bun (.bun-version), puis bun install
make db-migrate        # bun run db:migrate
make dev               # bun run dev · interface sur http://localhost:5173, API sur :8787
```

`make` seul liste toutes les commandes : chacune appelle un script de `package.json`.

## Variables d'environnement

Le modèle versionné est `.env.example`. Le `.env` de développement, jamais versionné, est
créé par `make env` (secrets tirés au hasard pour la machine) ; `make dev` le crée s'il manque.
En production, les variables vivent chez l'hébergeur : `make env-check FICHIER=.env.production`
vérifie un fichier avant le déploiement, et l'API refuse de démarrer avec une configuration de production à corriger.

## Page « Démarrage »

En développement, l'accueil (`/`) liste ce que contient le projet, l'état réel de chaque élément
(API, base, connexion, modules) et le geste qui le vérifie. En production, la page n'existe pas
(ni dans le bundle, ni dans l'API) : `apps/web/src/pages/Home.tsx`, l'accueil à personnaliser, la
remplace.

## Design system

Thème Tech, en clair et en sombre : le mode suit celui du système.

- Les jetons vivent dans `packages/ui/design/` (format DTCG 2025.10, resolver `design.resolver.json`) :
  primitives, thème, sémantique (clair, sombre), composants. C'est la source de vérité.
- `bun run jetons` (Terrazzo) les compile dans `packages/ui/src/jetons.css`, non versionné : les scripts le
  refont. Le lint vérifie les contrastes AA de chaque mode : un thème illisible fait échouer le
  build.
- Les composants de `apps/web/src/ui/` (boutons, champs, cartes, tableaux, pastilles, coquille) ne
  lisent que ces variables. `data-theme="clair"` ou `"sombre"` sur `<html>` force un mode, comme
  le sélecteur « Apparence » du pied de page.
- Polices embarquées sous licence OFL (avec leur licence) : aucune requête externe.

## Mise en page

Barre latérale + barre du haut : menu à gauche, repliable ; en haut, la recherche de page et le compte. Largeur du contenu : pleine largeur (tableaux larges, tableaux de bord).

- La coquille est `apps/web/src/ui/AppShell.tsx` : lien d'évitement, repères (`header`, `nav`, `main`,
  `footer`), page ouverte signalée par `aria-current`, menu au clavier (Échap le ferme).
- Les pages du menu sont listées dans `apps/web/src/App.tsx` (`PAGES`) : une page ajoutée y prend sa place.
- Le panel admin (`/admin`) garde sa propre mise en page, aux couleurs du thème.

## Base de données

PostgreSQL avec Drizzle. Le schéma est dans `apps/api/src/db/schema.ts`.

- `bun run db:generate` écrit la migration après un changement de schéma ;
- `bun run db:migrate` l'applique ;
- sans `DATABASE_URL`, le développement et les tests tournent sur PGlite (PostgreSQL en mémoire) : rien à installer.

`overrides` (package.json) impose esbuild 0.28.2 : drizzle-kit, outil de développement absent
de l'image, en demande par une de ses dépendances une version vulnérable (GHSA-67mh-4wv8-2f99).
À retirer quand drizzle-kit n'en dépendra plus (`bun audit` le dira).

## Connexion

Mot de passe + 2FA avec Better Auth. On ne s'inscrit pas seul : un admin invite
chaque compte depuis le panel, l'invité reçoit un lien pour choisir son mot de passe. La double
authentification (application TOTP) est obligatoire pour les admins, proposée aux autres.
En développement, les e-mails s'affichent dans le terminal de l'API.

Premier compte admin : `bun run admin:creer prenom@exemple.fr`. Règles et réglages :
`docs/connexion.md`.

## Discussion et appels audio

Chaque document textuel possède une discussion persistante et affiche les participants en ligne.
Le salon vocal du document utilise WebRTC ; le WebSocket Hono transporte seulement la présence,
les messages et la signalisation. Chacun rejoint ou quitte librement le vocal et ses contrôles
restent dans la colonne de discussion pour laisser l'éditeur utilisable.

`WEBRTC_STUN_URL` configure la découverte WebRTC. Pour les réseaux qui bloquent le pair-à-pair,
configurer aussi `WEBRTC_TURN_URL`, `WEBRTC_TURN_USERNAME` et `WEBRTC_TURN_CREDENTIAL` (voir
`.env.example`). Le microphone est autorisé uniquement pour l'origine de l'application.

## Panel admin

Sur `/admin`. Décrit dans `packages/contracts/src/admin.config.ts` :
contenus, droits par rôle (admin, éditeur, lecteur), réglages de l'app. Toute modification est
inscrite au journal d'activité.

Contenus gérés :

- **Clients** : Nom (texte), E-mail (e-mail)

Ajouter un contenu : `kit admin ajouter "Produits" nom:texte prix:montant`, puis `bun run db:generate`.

## Docker

L'image de production (`infrastructure/docker/Dockerfile`) et sa base (`infrastructure/docker/compose.yaml`) : non root, système de
fichiers en lecture seule, images épinglées par empreinte. Les secrets viennent du `.env`.

```sh
make smoke             # construit l'image, la démarre, vérifie santé, utilisateur et lecture seule, nettoie
make up                # essai local de l'image (vrais fournisseurs requis), puis make logs, make down
```

## Domaine d'envoi des e-mails

Avant la mise en ligne : les enregistrements SPF, DKIM et DMARC que Brevo ou Resend demandent
pour le domaine de `MAIL_FROM` (`docs/emails-dns.md`, avec les liens vers leur documentation).
`make mail-dns-check` lit ce qui est publié et dit ce qui manque, sans rien écrire.

## Limitation de débit

Les compteurs (la limite de toute l’API, celle de Better Auth) vivent dans la table `rate_limit` : l’hébergement n’est pas décrit par le Kit et peut lancer plusieurs instances : des compteurs en mémoire y compteraient chacun de leur côté.
Une seule instruction par requête limitée, les lignes expirées purgées au plus une fois par minute
(`apps/api/src/http/rate-limit-store.ts`).

## Vérifier

```sh
make check             # tests en miroir, types, lint, tests, build : la même porte que la CI
make lint              # vp check (format, lint, types), puis les règles du projet
make fix               # vp check --fix : format et corrections automatiques
make audit             # vulnérabilités des dépendances (exceptions écrites dans kit.json)
```

`vp check` (Vite+) formate avec Oxfmt et lint avec Oxlint typé : le format est dans
`vite.config.ts`, les règles dans `infrastructure/lint/oxlint.ts`.

La CI (`.github/workflows/ci.yml`) ajoute la recherche de secrets dans tout l'historique
(gitleaks, `.gitleaks.toml`) et la preuve que l'image démarre (`make smoke`).

Avant de pousser sur `main` ou `develop`, `.githooks/pre-push` lance la même porte en local et
refuse le push si elle échoue ou si des modifications ne sont pas commitées. Il s'active à
l'installation (`bun install`, script `prepare`) ; en cas d'urgence : `git push --no-verify`.

Chaque workspace range ses tests dans `src/test/`, en miroir de `src/` ; l'outillage dans `src/test/support/`. `infrastructure/test-policy.json` dit quels fichiers exigent un test (domaine, contrats, cas
d'usage, adaptateurs, hooks des vues) et lesquels en sont exemptés ; un test orphelin est refusé.
`bun run tests:miroir` le vérifie.

Les imports passent par des alias, jamais par `../` (Oxlint le refuse) : `@/…` dans une
app, `@documental/<paquet>/…` pour un paquet partagé.

## Décisions

Les choix qui engagent la suite sont écrits dans `docs/decisions/`, en cinq lignes chacun.
