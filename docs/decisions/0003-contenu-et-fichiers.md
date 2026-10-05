# Décision 0003 : rendu du contenu et fichiers joints

Date : 2026-10-05

**Contexte** : l'espace documentaire porte désormais un corps de texte édité à plusieurs en
temps réel (`apps/api/src/edition`, `apps/web/src/edition`) : transformation opérationnelle
écrite à la main, journal des opérations en base, diffusion par WebSocket et `NOTIFY`. Ce qui
manque, c'est ce que ce texte veut dire et ce qu'il peut porter : aujourd'hui un lecteur sans
droit d'écriture voit du texte brut dans une zone de saisie en lecture seule, et il n'existe
aucun moyen de joindre un PDF ni d'insérer une image.

Trois questions se posaient : comment rendre le corps sans ouvrir une porte d'injection, où
écrire les octets des fichiers, et comment un lecteur consulte un PDF.

**Décision** :

1. **Le corps est du Markdown, rendu en éléments React.** Le format n'était pas à choisir : la
   colonne `document.content` existe déjà et porte du texte. Ce qui se décide ici, c'est son
   interprétation. Le rendu produit des éléments React, jamais du HTML : l'application n'appelle
   `dangerouslySetInnerHTML` nulle part, donc il n'y a pas d'injection possible — ce n'est pas un
   filtre à tenir à jour, c'est une propriété de la forme du code. Le sous-ensemble reconnu est
   fermé (titres, paragraphes, gras, italique, code, listes, citations, liens, images, filets) ;
   ce qui n'en fait pas partie s'affiche tel quel. Les adresses des liens et des images passent
   par une liste blanche : `https`, `http`, `mailto` et les chemins de l'application, rien
   d'autre. L'aperçu est une bascule dans l'éditeur existant, et la zone de saisie reste montée
   dessous : la démonter couperait la réception des modifications des autres rédacteurs, et
   perdrait les curseurs des personnes présentes.
2. **Les octets des fichiers vont dans PostgreSQL** (`bytea`), dans une table `document_file`.
3. **Un PDF se consulte par téléchargement ou dans un nouvel onglet**, jamais dans un cadre de
   la page.

**Écartés** :

- _Rendre le Markdown en HTML puis l'assainir_ (marked + un assainisseur) : une dépendance de
  plus, et une sécurité qui repose sur l'exhaustivité d'un filtre plutôt que sur la forme du
  code. Un bogue d'assainisseur devient une injection ; ici il n'y a pas de chemin vers le HTML.
- _Un éditeur riche (TipTap, ProseMirror)_ : incompatible avec la transformation opérationnelle
  déjà en place, qui travaille sur du texte plat et son journal d'opérations.
- _Volume disque monté_ : le conteneur de production tourne en `read_only` (compose.yaml).
  Ouvrir un volume en écriture entame cette propriété, complique la sauvegarde (deux choses à
  sauvegarder au lieu d'une) et interdit plusieurs instances sans stockage partagé.
- _Objet S3 ou MinIO_ : la bonne réponse à grande échelle, mais un service de plus à exploiter,
  des secrets de plus, et deux chemins différents entre le développement et la production.
- _Aperçu PDF embarqué_ : exigerait d'assouplir `frame-ancestors` en `'self'` et de lever le
  `X-Frame-Options: DENY` posé par `http/headers.ts` — un affaiblissement réel des protections
  contre le détournement de clic, pour un confort que le visualiseur du navigateur rend déjà.
- _Visualiseur pdf.js intégré_ : évite de toucher aux en-têtes, mais ajoute une dépendance lourde
  et un worker à autoriser dans la politique de contenu.

**Conséquences** :

- Aucune infrastructure nouvelle : la base est déjà là, identique en développement (PGlite) et en
  production (PostgreSQL). Les fichiers sont sauvegardés, restaurés et supprimés avec le reste —
  la suppression en cascade d'un document emporte ses fichiers sans code de nettoyage.
- Une lecture de fichier charge ses octets en mémoire : la colonne `bytes` ne doit **jamais**
  figurer dans un `select` de listing, seulement dans la requête qui sert le fichier.
- La taille du corps des requêtes doit monter pour la route d'envoi. `bodyLimitsByPath` dans
  `app.ts` retient le préfixe le plus long : les fichiers vivent donc sous `/api/documents/
fichiers/`, qui porte `UPLOAD_MAX_MB` sans toucher à la limite de 2 Mo du corps d'un document.
- Les fichiers servis portent un `ETag` tiré de leur empreinte et un cache long : leur contenu ne
  change jamais (un remplacement crée un autre fichier). Sans cela, une page illustrée
  consommerait le débit autorisé d'un lecteur à chaque affichage.
- Le type d'un fichier se déduit de ses octets de tête, jamais de l'en-tête envoyé par le client
  ni de l'extension du nom. Le SVG est refusé : c'est un document exécutable déguisé en image.
- **Insérer une image dans le corps passe par le contrôleur d'édition**, jamais par une écriture
  directe dans la zone de saisie : l'insertion est une opération comme une autre, transformée et
  journalisée. C'est la contrainte principale que l'édition collaborative impose au lot suivant.
- Les droits sur un fichier sont ceux de son document : écrire un fichier demande l'accès en
  écriture (`access.write`, donc le créateur, ses invités ou un admin), le supprimer demande
  l'accès en gestion. Les fichiers ne portent pas de droits à eux.
- Un fichier inséré puis retiré du texte reste en base : il faudra un ramassage des orphelins, qui
  ne peut se faire qu'en lisant le corps courant de chaque document.
- Le sous-ensemble Markdown reconnu est une surface fermée : l'élargir demande d'écrire le cas et
  son test, ce qui est le but.

**À revoir si** : le volume de la base devient un problème d'exploitation (sauvegardes longues,
coût de stockage), ou si l'application doit tourner en plusieurs instances derrière un
répartiteur avec un trafic de fichiers nourri. Dans les deux cas, la sortie est la même :
extraire une interface de stockage et lui ajouter un pilote S3, le pilote base restant le défaut
en développement.
