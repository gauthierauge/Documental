# Domaine d'envoi des e-mails : SPF, DKIM, DMARC

Les e-mails partent de l'adresse de `MAIL_FROM`, au nom de son domaine. Sans les enregistrements
DNS que le fournisseur demande, ils arrivent en indésirables, ou pas du tout : Gmail, Yahoo et
Microsoft exigent un domaine authentifié.

- **SPF** : les serveurs autorisés à envoyer pour le domaine (un TXT `v=spf1 …`).
- **DKIM** : une signature de chaque message, vérifiée avec une clé publique publiée dans le DNS.
- **DMARC** : ce que le destinataire fait d'un message qui échoue aux deux autres, et où envoyer
  les rapports (un TXT sur `_dmarc.<domaine>`, qui commence par `v=DMARC1`). Commencer par
  `p=none`, puis durcir une fois les rapports propres.

Les valeurs exactes (clés, codes, cibles) sont propres au compte et au domaine : elles se
copient depuis le tableau de bord du fournisseur, jamais depuis ce document.

## Brevo

Documentation officielle : [Authenticate your domain with Brevo (Brevo code, DKIM, DMARC)](https://help.brevo.com/hc/en-us/articles/12163873383186).

| Enregistrement | Type             | Nom                | Valeur                                                    |
| -------------- | ---------------- | ------------------ | --------------------------------------------------------- |
| Code Brevo     | TXT              | affiché par Brevo  | affichée par Brevo                                        |
| DKIM           | 2 CNAME ou 1 TXT | affichés par Brevo | affichées par Brevo                                       |
| DMARC          | TXT              | `_dmarc`           | affichée par Brevo, avec `rua=mailto:rua@dmarc.brevo.com` |

D'après cette documentation, SPF et MX ne sont pas nécessaires pour authentifier un domaine chez
Brevo.

## Resend

Documentation officielle : [Domains](https://resend.com/docs/dashboard/domains/introduction),
et [DMARC](https://resend.com/docs/dashboard/domains/dmarc). Un guide par hébergeur DNS est dans
la base de connaissances de Resend (par exemple [Gandi](https://resend.com/docs/knowledge-base/gandi)).

| Enregistrement | Type | Nom                 | Valeur                                                |
| -------------- | ---- | ------------------- | ----------------------------------------------------- |
| SPF            | MX   | `send`              | affichée par Resend (priorité 10)                     |
| SPF            | TXT  | `send`              | affichée par Resend (`v=spf1 …`)                      |
| DKIM           | TXT  | `resend._domainkey` | affichée par Resend                                   |
| DMARC          | TXT  | `_dmarc`            | la vôtre ; Resend conseille de commencer par `p=none` |

## Vérifier

```sh
make mail-dns-check                              # lit le .env : MAIL_PROVIDER et le domaine de MAIL_FROM
make mail-dns-check FICHIER=.env.production
make mail-dns-check DKIM=<nom1>,<nom2>           # Brevo : les noms DKIM tels que Brevo les affiche
```

Le script lit les enregistrements publiés (résolveur DNS du système) et dit ce qui manque ; il
n'écrit rien. Ce qu'il ne peut pas savoir seul (le code Brevo, les noms DKIM de Brevo) est
marqué « à vérifier ». La porte qualité, hors ligne, vérifie seulement que `MAIL_FROM` a un
domaine qui n'est pas un domaine d'exemple.
