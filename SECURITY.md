# Sécurité

## Signaler une faille

Écrivez à securite@[domaine du client] plutôt que d'ouvrir un ticket public. Réponse sous 72 heures ouvrées.
Pour une application web, le même contact est publié dans `/.well-known/security.txt`
(RFC 9116, variable `SECURITY_CONTACT`).

## Ce que ce projet applique

Les mesures ci-dessous visent le niveau 1 de l'OWASP ASVS. Elles en couvrent une partie, pas
la totalité : une vérification complète reste à faire avant une mise en production sensible.

- toute entrée est validée côté serveur, jamais seulement dans le navigateur ;
- en-têtes de sécurité et politique de contenu (CSP) stricte ;
- cookies de session `HttpOnly`, `Secure`, `SameSite=Lax` ;
- nombre de tentatives limité sur la connexion et les formulaires ;
- droits vérifiés sur chaque route, pas seulement masqués dans l'interface ;
- aucun secret dans le dépôt : les variables vivent chez l'hébergeur, `.env.example` liste leurs noms ;
- dépendances auditées à chaque livraison, mises à jour proposées par Renovate ;
- données personnelles hébergées dans l'UE, réduites au nécessaire, supprimées sur demande ;
- journaux d'erreurs sans données personnelles.

## Serveur HTTP (application web et API)

Chaque réglage a une valeur par défaut sûre, validée au démarrage (`src/server/env.ts`) et
décrite dans `.env.example`.

| Mesure                                                                                                                                                                                                                        | Réglage                                 | Thème ASVS (indicatif)                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Corps de requête limité en taille, 413 au-delà ; limites propres au webhook Stripe et à l'envoi de fichiers en développement                                                                                                  | `BODY_MAX_KB`                           | anti-automatisation, API              |
| Débit limité par adresse IP sur `/api/*` (fenêtre glissante, 429 et `Retry-After`), en plus de la limite de Better Auth sur la connexion ; compteurs dans la base quand le projet en a une, partagés par toutes les instances | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_S` | anti-automatisation, authentification |
| Adresse IP réelle lue seulement derrière un proxy déclaré, transmise telle quelle à Better Auth                                                                                                                               | `TRUST_PROXY`, `TRUST_PROXY_HOPS`       | anti-automatisation                   |
| Durée de traitement bornée, 503 au-delà                                                                                                                                                                                       | `REQUEST_TIMEOUT_MS`                    | anti-automatisation                   |
| Identifiant par requête (`X-Request-Id`) et journal JSON d'une ligne : méthode, route sans paramètres, statut, durée ; ni IP, ni e-mail                                                                                       | —                                       | journalisation                        |
| Arrêt propre sur SIGTERM et SIGINT : plus de nouvelles connexions, requêtes en cours terminées, puis fermeture des tâches et de la base                                                                                       | `SHUTDOWN_TIMEOUT_MS`                   | —                                     |
| `Permissions-Policy` restrictive, `Cross-Origin-Opener-Policy` et `Cross-Origin-Resource-Policy`, `X-Frame-Options: DENY`, `nosniff`, HSTS en production (`includeSubDomains`, sans `preload`)                                | —                                       | sécurité du navigateur                |
| API seule : démarrage refusé en production si `ALLOWED_ORIGINS` contient `*` ou une origine sans HTTPS                                                                                                                        | `ALLOWED_ORIGINS`                       | sécurité du navigateur, configuration |
| Connexion : démarrage refusé en production si `APP_URL` n'est pas en HTTPS (cookies `Secure` avec préfixe `__Secure-`)                                                                                                        | `APP_URL`                               | cookies et sessions                   |

Limites connues :

- les compteurs de débit vivent dans la mémoire du processus : avec plusieurs instances,
  chacune compte de son côté ; passer à un compteur partagé ou limiter au niveau du proxy ;
- un traitement qui dépasse `REQUEST_TIMEOUT_MS` reçoit un 503 mais n'est pas interrompu ;
- `preload` HSTS n'est pas activé : c'est un engagement difficile à défaire, à décider avec le
  client pour son domaine.

Site vitrine (Cloudflare Pages) : `public/_headers` pose HSTS, `Permissions-Policy`,
`frame-ancestors`, `nosniff` et `Referrer-Policy` ; la CSP est générée par Astro. Next.js :
mêmes en-têtes dans `next.config.ts`, CSP à nonce dans `src/proxy.ts`.
