# Connexion : mot de passe et double authentification

Better Auth, données dans la base du projet. Le code est dans `src/server/auth/`, les règles de
mot de passe dans `src/shared/password-policy.ts` (partagées par l'API et les écrans).

## Comptes

- Pas d'inscription libre : un admin invite chaque compte depuis le panel (ou
  `bun run admin:creer prenom@exemple.fr` pour le premier admin).
- L'invité reçoit un lien pour choisir son mot de passe, valable 72 heures et une seule fois.
  Le panel peut renvoyer un lien à tout moment.
- Mot de passe oublié : lien de réinitialisation valable 1 heure, une seule fois. Une
  réinitialisation ferme toutes les sessions ouvertes du compte.
- Une demande de lien pour une adresse inconnue reçoit la même réponse, sans e-mail envoyé.
- Session : 8 heures, cookie `httpOnly`, `SameSite=Lax`, `Secure` en HTTPS.

## Mots de passe (NIST SP 800-63B)

- 12 caractères au minimum, 128 au maximum : les phrases de passe sont bienvenues.
- Aucune règle de composition (majuscule, chiffre, symbole) et aucune expiration périodique.
- Refusés : une petite liste embarquée des mots de passe essayés en premier, les suites et
  répétitions (`123456789012`, `azerazerazer`), et les mots courants entourés de chiffres ou de
  symboles (`Motdepasse2026!`, `P@ssw0rd1234`), nom de l'application compris. Aucun appel réseau.
- Hachage : scrypt (N = 16384, r = 16, p = 1, sel aléatoire), celui de Better Auth. On ne le
  remplace pas sans raison écrite dans une décision.

### Option : fuites connues (Have I Been Pwned)

`PASSWORD_HIBP=true` refuse aussi les mots de passe présents dans les fuites publiques. Seuls les
5 premiers caractères de l'empreinte SHA-1 partent vers `api.pwnedpasswords.com` (k-anonymat) :
le mot de passe ne quitte jamais le serveur. Désactivé par défaut, car c'est un appel à un
service tiers : à décider avec le client. Si le service ne répond pas, le choix du mot de passe
échoue (erreur 500) : à surveiller si l'option est activée.

## Double authentification

- Application TOTP (Google Authenticator, Microsoft Authenticator, 1Password…) : on l'active dans
  « Mon compte » avec son mot de passe, on scanne le QR code (affiché dans le navigateur, le
  secret ne part chez aucun service), puis on confirme avec un premier code.
- Dix codes de secours sont affichés une fois, à garder hors ligne. Chaque code sert une fois.
- **Obligatoire pour les admins** : sans elle, un admin n'accède ni aux comptes ni aux réglages
  du panel (réponse 403, code `DEUXFA_REQUISE`), et ne peut pas la désactiver.
- Proposée aux autres rôles.
- Le secret TOTP et les codes de secours sont chiffrés en base avec `AUTH_SECRET` : changer
  `AUTH_SECRET` oblige chaque compte à réactiver sa double authentification.

## Tentatives

- Connexion : 5 essais par minute et par adresse IP ; ensuite 429, avec `Retry-After` et le délai
  en minutes, au format des autres refus de l'API.
- Demande de lien : 3 par minute ; code TOTP : 3 toutes les 10 secondes, et 10 codes faux
  bloquent le compte 15 minutes.
- Messages neutres : « adresse e-mail ou mot de passe incorrect », que le compte existe ou non ;
  le temps de réponse est le même (Better Auth hache un mot de passe fictif).
- Les compteurs vivent avec ceux des autres limites (`src/server/http/rate-limit-store.ts`) :
  dans la table `rate_limit`, partagés par toutes les instances de l'API.
- Derrière un proxy ou un CDN, régler `TRUST_PROXY` (`cloudflare` ou `x-forwarded-for` avec
  `TRUST_PROXY_HOPS`) : le serveur résout l'adresse du visiteur et la transmet à Better Auth
  (`src/server/http/client-ip.ts`). Sinon tous les visiteurs ont l'adresse du proxy et
  partagent le même compteur. Un en-tête envoyé par le client lui-même n'est jamais cru.
- En plus, toute l'API est limitée par adresse (`RATE_LIMIT_MAX` par `RATE_LIMIT_WINDOW_S`).

## Écrans

| Chemin                          | Rôle                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| `/connexion`                    | e-mail et mot de passe, puis code TOTP ou code de secours si activé       |
| `/mot-de-passe/oublie`          | demande d'un lien de réinitialisation                                     |
| `/mot-de-passe/nouveau?token=…` | choix du mot de passe (invitation ou réinitialisation)                    |
| `/compte`                       | changer de mot de passe, activer ou désactiver la double authentification |

Pour une API seule, ces écrans sont à faire dans le front ; les liens envoyés par e-mail
pointent vers `APP_URL/mot-de-passe/nouveau?token=…`.
