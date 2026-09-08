# ELSATIA-RESERVES-V6-SECURITY-OFFLINE-PILOT-GATE-V1 — RAPPORT

## Verdict

**Sécurité : RENFORCÉE, sans faille de cloisonnement trouvée.**
Vingt-trois scénarios adversariaux ont été joués contre l'application réelle, avec des
sessions légitimes, sur une pile jetable. Aucun n'a permis à une organisation d'atteindre
les données d'une autre. Le cloisonnement multi-tenant, la machine à états du workflow,
l'immuabilité de l'historique et le cycle des invitations ont tenu sous attaque directe.

Cinq défauts réels ont été trouvés et **quatre ont été corrigés dans ce lot**. Le
cinquième exige du SQL : il est rédigé, argumenté, et **BLOQUÉ PAR LE TRAIN GLOBAL**.

**Pilote : GO CONDITIONNEL.**
Le produit peut partir en pilote sur un chantier réel, à trois conditions énoncées en §12 :
la recette iPhone physique décrite en §13 doit être exécutée par Julien ; le SQL de §11
doit être numéroté avant tout usage à plusieurs entreprises hôtes ; et le plafond de
1 000 lignes corrigé en §5 doit être revérifié en préproduction.

**Ce lot ne fusionne rien, ne déploie rien, et ne crée aucune migration.**

---

## 1. Branche et SHA

| | |
|---|---|
| Branche de base | `feat/reserves-v4-e2e-offline-pdf-print` |
| Tête V5 (base de ce lot) | `3db106d84de2454401fe207e9fc3e970b3554d40` |
| SHA du code V5 | `7c0fc3d158a0f7b6a3de27eaba8b4be47cb60b00` |
| Branche de ce lot | `feat/reserves-v6-security-offline-pilot-gate-v1` |
| SHA du code V6 (complet) | `72aefe000fb3de0f25a5719c0bcdc0edbd5a4c00` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/reserves-v6-security` |
| Migration candidate 271 | **non promue, non renommée, non touchée** |

`git status supabase/migrations` est vide : aucune migration n'a été ajoutée, modifiée ni
renumérotée. Le train global reste seul maître de la numérotation.

---

## 2. Audit initial

| Point vérifié | Constat |
|---|---|
| SHA poussé | `3db106d` présent sur `origin/feat/reserves-v4-e2e-offline-pdf-print` |
| Arbre | worktree V5 propre, aucun WIP non commité |
| Worktrees | 53 worktrees actifs ; le lot Réserves travaille sur `/Volumes/ELSATIA-DEV` conformément à la règle de stockage externe |
| Secrets | aucun jeton, clé privée ou `service_role` dans l'arbre ni dans le diff (`git grep` sur motifs JWT/PEM/`sk_live`) |
| Variables d'environnement | 6 utilisées : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RESERVES_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `PDF_CHROMIUM_EXECUTABLE_PATH`. Le service role n'est employé que par la route cron, protégée par secret. |
| Dépendances | `npm audit` : **0 vulnérabilité**, avec et sans dépendances de développement |
| Service worker | ne met en cache que la coquille sans données et les ressources statiques ; ignore `/api/`, `/imprimer/`, et ne cache aucune navigation |
| IndexedDB | une base par couple (organisation, utilisateur) ; le nom refuse tout identifiant qui n'est pas un uuid |
| API de synchronisation | identité déclarée revérifiée contre la session à chaque mutation ; aucune RPC nouvelle, aucun droit nouveau |
| Upload | chemin composé par la base, jamais par l'appelant ; MIME contraint à jpeg/png/webp ; taille bornée |
| Invitations | jeton 256 bits, seule l'empreinte SHA-256 est stockée ; usage unique, expiration, révocation, liaison à une organisation cible |
| RLS | activée sur les 17 tables du domaine ; écriture directe révoquée sur photos, historique, messages, conversations, notifications |
| Rôles | miroir client (`acces-reserves-policy`) explicitement non autoritatif ; la base tranche |
| Historique | `select` seul, aucune policy d'écriture, `insert/update/delete` révoqués |
| PDF | rendu par la page réelle, sous la session de l'appelant, mêmes RLS qu'à l'écran |
| Plans | RLS par chantier ; visibilité intervenant restreinte à ses propres plans |
| Stockage | buckets privés, URL signées 900 s, aucune policy `update`/`delete` sur les photos |

---

## 3. Menaces testées

Vingt-trois tests adversariaux (`tests/e2e/reserves-v6-securite.spec.ts`), plus cinq tests
de charge (`tests/e2e/reserves-v6-performance.spec.ts`).

### Multi-tenant — **aucune fuite**

Un décor dédié (`scripts/e2e/prepare-reserves-v6-securite.sql`) crée une organisation B
sans **aucun** lien avec l'organisation A : ni invitation, ni intervention, ni chantier
commun. Sa réserve porte le marqueur `MARQUEUR_SECRET_B_ne_doit_jamais_fuiter`. Toute
apparition de ce marqueur dans une réponse servie à A prouve la fuite.

| Tentative | Résultat |
|---|---|
| A lit le chantier de B par identifiant deviné | `[]` |
| A lit la réserve de B par identifiant deviné | `[]` |
| A lit les photos, l'historique, les messages, les intervenants, les plans de B | `[]` |
| A liste toutes les réserves sans filtre (1 000 lignes) | aucune ligne de B |
| A lit le registre d'idempotence de B | `[]` |
| B lit les réserves du chantier de A | `[]` |
| A demande le PDF du chantier de B | **404** |
| A ouvre le document imprimable de B | marqueur absent |
| A ouvre l'écran d'export de B | marqueur absent |
| A ouvre la fiche de la réserve de B | marqueur absent |
| Recherche annuaire élargie (`%%%`, `___`, `%_%`, `a`) | `[]` dans les quatre cas |
| Invitation utilisée par le mauvais tenant | refusée, « émis pour une autre organisation » |

### Invitations — **le cycle tient**

| Tentative | Résultat |
|---|---|
| Jeton expiré / révoqué / déjà consommé / inexistant | **écran identique au caractère près** ; aucun oracle |
| Jeton volé, présenté par une autre organisation | refusé, et l'organisation ne gagne aucun accès |
| Jeton rejoué après acceptation | « ce lien n'est plus valide » |
| Jeton dans les journaux serveur | **corrigé** — voir §4.3 |
| Jeton dans l'historique du navigateur | **corrigé** — voir §4.3 |
| Jeton dans le `Referer` | fermé par `Referrer-Policy: strict-origin-when-cross-origin` (§4.1) |
| Accès conservé après révocation | non : l'entreprise révoquée ne voit plus rien |
| Transfert d'entreprise, changement de rôle | **défaut trouvé** — voir §11.1 |

### Workflow — **la base tranche, toujours**

| Tentative | Résultat |
|---|---|
| Intervenant valide sa propre levée (`reserves_statuer_levee`) | refusé |
| Intervenant valide sa propre levée (route hors-ligne, `reserves_transition_differee`) | refusé ; la réserve reste `levee_demandee` |
| Appel direct du cœur de transition | refusé : la fonction n'est pas accordée au rôle `authenticated` |
| Photo obligatoire contournée par l'API hors-ligne | refusé : « Photo obligatoire : ajoutez une preuve » ; la réserve reste `acceptee` |
| Statut forcé par écriture directe (`statut`, `levee_at`, `numero`, `entreprise_id`) | les quatre refusés par le trigger de garde |
| Double validation, demande de levée répétée | idempotentes : rejeu, jamais doublon |
| Historique réécrit | refusé |
| Historique effacé | refusé, la ligne est toujours là |

### Hors-ligne — **cloisonnement et format**

| Tentative | Résultat |
|---|---|
| File préparée par A, envoyée sous la session de B | refusée : « préparée sous une autre identité » |
| Photo préparée par A, envoyée sous B | **403** |
| Charge utile d'un format inconnu (`version: 99`) | refusée explicitement — **corrigé dans ce lot** |
| Routes hors-ligne sans session | **401 JSON**, jamais une redirection HTML |
| Même mutation rejouée trois fois | une seule réserve, identifiant identique |
| File de 100 mutations, rejouée intégralement | 100 réserves, aucun doublon |
| Lot démesuré (100 mutations d'un coup) | refusé (borne à 50) |
| Photo déjà déposée, renvoyée deux fois | acquittée — **P0 corrigé, voir §4.4** |
| Deux onglets synchronisent ensemble | verrou inter-onglets, plus libéré à la fermeture (§4.2) |
| Horloge locale reculée | verrou « venu du futur » désormais considéré périmé (§4.2) |
| Base IndexedDB copiée, charge utile modifiée | sans effet : le serveur revérifie identité et droits |
| Quota disque, photo lourde | photo compressée avant mise en file (§4.5) |

---

## 4. Défauts trouvés et corrigés

### 4.1 — P0 · Aucun en-tête de sécurité (`apps/reserves/src/lib/securite/entetes.ts`, `src/proxy.ts`)

**Constat.** Réserves n'émettait aucun en-tête de sécurité : ni politique de contenu, ni
`frame-ancestors`, ni `Referrer-Policy`, ni `nosniff`. Gestion Pro en émet depuis la
phase 3 et sa recette les vérifie ; Réserves était resté en dehors.

L'écart comptait davantage ici que partout ailleurs, pour deux raisons propres à ce
produit : `/invitation/<jeton>` est une page publique **dont le chemin est le secret**, et
son bouton « Rejoindre l'intervention » accorde un accès en un clic. Sans
`frame-ancestors`, cette page est encadrable, donc détournable au clic ; sans
`Referrer-Policy`, le jeton part dans le `Referer` de toute ressource tierce.

**Correctif.** Politique de contenu à nonce, posée par le proxy sur la requête ET sur la
réponse, plus `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
COOP, CORP et HSTS. Vérifié en exécution : **tous les scripts de chaque page portent le
nonce**, et le nonce n'est jamais réutilisé d'une requête à l'autre.

**Deux régressions que la CSP a elle-même provoquées, trouvées et corrigées :**

- **Pages pré-rendues.** `/hors-ligne`, `/abonnement-requis` et la page 404 étaient
  statiques : Next n'avait aucun moment pour y inscrire le nonce, et leurs quinze balises
  de script seraient toutes parties sans. Avec `'strict-dynamic'`, le navigateur les aurait
  **toutes bloquées** — la coquille hors-ligne se serait affichée sans jamais s'animer,
  panne invisible côté serveur. Les trois pages sont désormais rendues dynamiquement, et
  leur `Cache-Control: s-maxage=31536000` — un an de cache partagé sur une page portant un
  nonce à usage unique — a disparu au passage.

- **`upgrade-insecure-requests` et WebKit.** La directive était émise dès que
  `NODE_ENV=production`. Chromium exempte la boucle locale ; **WebKit non** : il tentait
  `https://127.0.0.1:3025`, échouait en erreur TLS, et **toute** la recette mobile tombait,
  connexion comprise. La directive — et HSTS avec elle — est maintenant conditionnée à
  l'origine réellement servie (`x-forwarded-proto`), jamais au mode de construction. Sans
  la recette multi-moteur, ce défaut serait passé : il est invisible sur le navigateur où
  l'on développe, et total sur celui du terrain.

### 4.2 — P1 · Le PDF envoyait le cookie de session hors de l'origine, vers un hôte choisissable

**Constat, deux défauts imbriqués** (`src/lib/pdf/generer.ts`,
`src/app/api/documents/chantier/[id]/pdf/route.ts`) :

1. L'URL visitée par Chromium était composée depuis `request.url`, donc depuis l'en-tête
   `Host`. Un `Host:` falsifié faisait **naviguer un navigateur authentifié vers l'hôte du
   détournement**.
2. Le cookie de session était passé à `setExtraHTTPHeaders()`, qui l'attache à **toutes**
   les requêtes de la page — y compris les URL signées Supabase des photos et des plans.
   Le jeton de session partait donc vers une autre origine à chaque tirage.

**Correctif.** L'origine du document vient désormais de `NEXT_PUBLIC_RESERVES_URL` — la
variable qui compose déjà les liens d'invitation, donc renseignée partout — et les cookies
sont posés dans le magasin de Chromium **portés par cette URL**, comme dans un navigateur
ordinaire : ils ne sortent plus de l'origine. Vérifié : PDF de 430 Ko, images intégrées,
en 3 à 6 secondes.

### 4.3 — P1 · Le jeton d'invitation voyageait dans l'URL de retour

**Constat.** `lib/invitations` promet que « le jeton en clair n'existe que dans l'URL
remise au destinataire — jamais en base, jamais dans un journal ». Quand l'envoi d'e-mail
échouait, l'action plaçait pourtant le lien complet en paramètre d'URL
(`?lien=https://…/invitation/<jeton>`), ce qui le déposait dans l'historique du navigateur
et dans les journaux d'accès du serveur, **où il survit très largement aux trente jours de
validité de l'invitation**. L'écran affirmait par-dessus qu'il n'était « stocké nulle part
en clair ».

**Correctif.** Le lien transite par un cookie `httpOnly`, `SameSite=Strict`, de cinq
minutes (`src/lib/invitation-relais.ts`). L'URL ne porte plus qu'un drapeau. Le texte de
l'écran a été corrigé pour dire ce qui est vrai.

### 4.4 — P0 · Une photo déjà déposée ne repartait JAMAIS

**Le défaut le plus grave du lot, et il n'a été trouvé qu'en jouant la recette.**

**Constat.** La V5 déposait les photos avec `upsert: true`, au motif — juste — que le
chemin étant dérivé de la clé d'idempotence, réécrire signifie « même photo, même envoi ».
Mais les policies Storage de Réserves n'accordent que `select` et `insert`, **délibérément**
(migration 00269 : « un fichier déposé ne peut être ni écrasé ni effacé depuis
l'application »). Or `upsert` se traduit par un `on conflict do update`, qui exige une
policy `update` inexistante.

Conséquence, observée dans les journaux Storage de la recette : le premier dépôt passe
(200), **tout renvoi échoue** en `new row violates row-level security policy`, présenté à
l'utilisateur comme « Le téléversement a été interrompu ». La file retentait cinq fois,
échouait cinq fois, puis abandonnait — et **le constat photographique, celui-là même qui
sert de preuve à la levée, était perdu alors qu'il était déjà dans le bucket**.

C'est exactement le scénario « upload interrompu, reprise » du cahier des charges : la
protection d'idempotence annoncée en V5 n'avait jamais été exercée sur un chemin où
l'objet existait déjà.

**Correctif** (`src/lib/depot-photo.ts`). Dépôt **sans écrasement**, et « l'objet existe
déjà » traité comme un **succès** : le chemin venant de la clé d'idempotence, un objet
présent à cette adresse est nécessairement le nôtre. Le code rejoint ainsi la règle de
sécurité au lieu de la contredire — rien n'est jamais écrasé. Verrouillé par un test
unitaire (le message RLS ne doit **jamais** passer pour un succès, sous peine de confirmer
une photo absente et de satisfaire l'exigence de preuve avec du vide) et par un test de
recette qui renvoie deux fois la même photo.

### 4.5 — P0 · Le document imprimable s'arrêtait à la 1 000ᵉ réserve, sans le dire

**Constat.** `supabase/config.toml` fixe `max_rows = 1000`, comme Supabase Cloud par
défaut. C'est une bonne protection — mais PostgREST l'applique **en silence** : il rend
mille lignes, et rien, ni statut ni en-tête, ne dit qu'il en manque.

Mesuré sur un chantier de 2 000 réserves : la « liste des réserves », pièce que l'on annexe
à un procès-verbal, s'arrêtait à la 1 000ᵉ. Les réserves manquantes passaient pour
inexistantes, **donc pour levées**. Un document tronqué sans le dire est un document faux.

**Correctif** (`src/lib/donnees.ts`). Pagination explicite par tranches de 1 000, avec
garde d'arrêt, sur l'export des réserves, l'export de l'historique, l'export des photos, la
liste des réserves et la liste des intervenants. Le plafond continue de protéger chaque
requête ; il ne décide plus du contenu d'un document contractuel. Sept tests unitaires, dont
le cas limite désagréable des mille lignes pile. Vérifié en recette : **2 000 réserves
distinctes rendues, dont la 1 001ᵉ**.

### 4.6 — P1 · La reprise hors-ligne tournait sans fin, et ne reprenait pas là où il fallait

**Constat.** Deux défauts opposés, tous deux mauvais :

- La coquille hors-ligne relançait une tentative **toutes les cinq secondes,
  indéfiniment**, dès qu'il restait quoi que ce soit — y compris une mutation en échec,
  que la file ne renvoie jamais d'elle-même. Sur un téléphone posé dans une poche, la
  radio ne se rendormait plus, pour un résultat connu d'avance. Aucune temporisation,
  aucun bruit, aucun arrêt.
- La coquille **applicative**, elle, n'avait aucune reprise périodique : l'envoi ne
  repartait qu'à l'événement `online`, que le système n'émet pas quand la couverture
  revient sur un lien resté « connecté ». Une file préparée dans un sous-sol pouvait y
  rester.
- Une mutation tombée en `echec` n'en sortait **que par un clic** — alors que l'échec le
  plus courant sur un chantier (session expirée, envoi coupé) disparaît de lui-même, et
  que l'utilisateur, lui, a rangé son téléphone.

**Correctif** (`src/lib/offline/reprise.ts`, `src/components/offline/useReprise.ts`) :
temporisation exponentielle plafonnée à cinq minutes, **avec bruit** — sans lui, toute une
équipe remontant du sous-sol repartirait en phase et frapperait le serveur à la même
seconde ; **arrêt franc** quand plus rien ne peut avancer ; **réveil** au retour à l'écran ;
**silence** quand l'onglet est masqué ; et remise en file **bornée** des échecs
rattrapables, le plafond de tentatives distinguant une panne d'un refus.

Une passe empêchée par le verrou inter-onglets ne compte plus comme un échec : rien n'ayant
été tenté, il n'y a rien à espacer. Le verrou est en outre libéré sur `pagehide`, faute de
quoi une navigation en plein envoi le laissait posé pendant tout son bail.

**Mesuré en navigateur, sur l'application réelle :**

| Situation | V5 | V6 |
|---|---|---|
| File définitivement bloquée, 25 s | ≈ 5 sondes réseau | **0** |
| Reprise sur échecs répétés | toutes les 5 s | 4,4 s → +6,9 s → +12,3 s → +36,7 s |
| Après épuisement du budget (5 tentatives) | continue indéfiniment | **s'arrête** (34 s de silence observés) |

### 4.7 — P1 · Photo hors-ligne stockée et envoyée brute, EXIF compris

**Constat.** Le chemin en ligne compresse (2048 px, JPEG 0,85) ; la saisie hors ligne
conservait le cliché **brut** dans IndexedDB, jusqu'à 15 Mo, et le téléversait tel quel.
Vingt constats dans un sous-sol suffisaient à saturer le quota — le message d'échec
arrivant après que l'utilisateur a cru enregistrer — et le retour au réseau imposait des
centaines de mégaoctets sur le lien le plus fragile du parcours.

Second effet, moins visible : le passage par un canvas ne recopie que les **pixels**. Le
chemin en ligne retirait donc déjà les métadonnées EXIF — **coordonnées GPS comprises**,
que les téléphones inscrivent par défaut — sans que ce soit dit. Le chemin hors ligne, lui,
les téléversait intactes : la position précise du porteur du téléphone finissait dans le
bucket, à disposition de l'organisation hôte, alors qu'aucun écran ne la demande.

**Correctif** (`src/lib/images-navigateur.ts`). Compression partagée par les deux chemins,
appliquée **avant** la mise en file, avec `imageOrientation: "from-image"` pour que le
retrait de l'EXIF ne couche pas les photos prises en portrait.

### 4.8 — P1 · Le brouillon hors-ligne était du code mort

**Constat.** L'état `brouillon` existait dans le contrat de la file, `AtelierOffline`
exposait `enregistrerBrouillon` et `soumettreBrouillon` — et **aucun écran ne les
appelait**. Une saisie interrompue n'avait que deux issues : partir incomplète, ou être
perdue.

**Correctif.** « Garder en brouillon » à la saisie, liste dédiée des brouillons dans la
coquille hors-ligne, bouton « Reprendre » qui rouvre le formulaire pré-rempli, et
« Mettre en file d'envoi » depuis le bandeau. Le brouillon conserve son identifiant — donc
sa clé d'idempotence — et repasse par la machine à états plutôt que d'écraser la ligne.

### 4.9 — P1 · Une charge utile d'un format inconnu était interprétée quand même

**Constat.** Le champ `version` était écrit depuis la V5 et **lu nulle part**. Une file
écrite par une version plus récente de l'application — mise à jour pendant qu'une file est
active, onglet servi par un service worker plus ancien — était envoyée comme si elle était
comprise, et le serveur en tirait ce qu'il pouvait.

**Correctif.** La version voyage avec la mutation ; le client ne propose plus à l'envoi ce
qu'il ne sait pas relire, et le serveur refuse explicitement, avec un message qui dit quoi
faire (« rechargez ELSATIA Réserves »).

### 4.10 — P1 · Le service worker figeait la coquille à la version du jour de l'installation

**Constat.** La coquille et ses ressources n'étaient mises en cache qu'à l'**installation**
du service worker, c'est-à-dire quand `sw-reserves.js` change. L'application, elle, est
redéployée bien plus souvent. Entre deux modifications de ce fichier, un appareil
conservait indéfiniment une coquille figée — avec son ancien code de file, capable
d'écrire une charge utile d'un format que le serveur ne lit plus (§4.9).

**Correctif.** La page demande explicitement au service worker de reprendre l'empreinte à
chaque démarrage en ligne, et appelle `registration.update()`. Version du cache portée à
`reserves-v6-1`.

### 4.11 — P2 · Secret de la tâche planifiée comparé caractère par caractère

Une égalité de chaînes s'arrête au premier caractère qui diffère : le temps de réponse
renseigne alors, octet par octet, sur le secret attendu. Sur une route publiquement
joignable et sans limitation de débit, c'est une fuite exploitable. Remplacé par
`timingSafeEqual`, longueur comprise.

---

## 5. Limites de ce lot

Énoncées sans détour.

- **L'iPhone physique n'a pas été testé.** Aucun appareil n'était disponible. Les moteurs
  WebKit (iPhone 13, iPad) et Chromium Android ont été exercés par émulation Playwright, ce
  qui a suffi à trouver et corriger un défaut total sur Safari (§4.1) — mais l'émulation ne
  remplace ni le mode autonome installé sur l'écran d'accueil, ni le comportement réel du
  quota, ni la mise en veille du système. La recette manuelle §13 existe pour cela.
- **La coupure réseau est celle de Playwright** (`context.setOffline`), pas un tunnel. Elle
  ne reproduit ni la latence d'un lien à deux barres, ni un portail captif, ni une coupure
  au milieu d'un octet.
- **Le SQL de §11 n'est pas joué.** Le défaut de traçabilité du rattachement (§11.1) est
  toujours ouvert.
- **La machine de recette était saturée** (charge moyenne 22, huit piles Supabase, plusieurs
  conversations simultanées). Trois échecs de recette ont été diagnostiqués comme
  environnementaux avant d'être écartés ; les budgets de deux tests ont été alignés sur la
  réalité de ce qu'ils mesurent (§9).
- **Aucune mesure sur un parc réel** : les chiffres de §8 viennent d'un poste de
  développement, pas d'un téléphone de chantier.

---

## 6. Données hors-ligne

**Ce qui est conservé sur l'appareil**, dans une base IndexedDB dont le nom est
`elsatia-reserves::v1::<organisation>::<utilisateur>` :

| Magasin | Contenu | Sensibilité |
|---|---|---|
| `mutations` | actions saisies non transmises | données métier de l'organisation |
| `photos` | clichés en attente, en `Blob` | preuves de chantier |
| `chantiers`, `reserves` | cache de consultation | données métier |
| `meta` | horodatages techniques | aucune |

**Ce qui n'y est jamais** : aucun jeton de session, aucune clé, aucun secret. Le seul usage
de `localStorage` est un pointeur de deux uuid vers la dernière identité connectée, plus
l'horodatage du verrou inter-onglets.

**Cloisonnement par le NOM de la base**, et non par un filtre applicatif : deux identités
ouvrent deux bases distinctes. Un changement de compte ne filtre pas les données
précédentes — il ne les ouvre jamais. Vérifié en recette (« deux identités ne partagent pas
la même base locale »).

**Aucune page métier dans un cache HTTP partagé.** Vérifié en exécution sur `/login`,
`/hors-ligne`, `/invitation/…` : `Cache-Control: private, no-cache, no-store,
must-revalidate` sur chacune. Le service worker ne met en cache **aucune** navigation, et
ignore explicitement `/api/` et `/imprimer/`.

**`/hors-ligne` n'affiche rien avant identification** : sans pointeur d'identité, elle
n'ouvre aucune base et affiche « Aucune session n'est ouverte sur cet appareil ».

**URL signées : 900 secondes.** Elles ne sont jamais persistées.

---

## 7. Stratégie de purge

| Événement | Cache de lecture | File de mutations | Pointeur d'identité | Cache du service worker |
|---|---|---|---|---|
| Déconnexion explicite | **effacé** | conservé | **effacé** | conservé |
| Fermeture sans déconnexion | conservé | conservé | conservé | conservé |
| Session expirée | conservé | conservé | conservé | conservé |
| Changement de compte | inaccessible (autre base) | inaccessible | remplacé | conservé |

**Pourquoi la file survit à la déconnexion.** Supprimer un travail non transmis parce que
la session s'est fermée — ce qui arrive tout seul, sur un chantier, quand le jeton expire —
ferait perdre des constats que leur auteur croit enregistrés. Elle reste cloisonnée dans la
base de son identité, que personne d'autre ne peut ouvrir, et le serveur revérifie
l'identité de chaque mutation avant de l'appliquer.

**Pourquoi le cache du service worker n'est pas purgé.** Il ne contient que la coquille —
une page sans aucune donnée — et des ressources statiques versionnées. Le vider ne
retirerait rien de confidentiel et priverait la session suivante d'un démarrage hors ligne.

**Ce que cela laisse ouvert, et qu'il faut savoir** : sur un appareil **perdu ou volé**,
déverrouillé, les photos en attente et le cache de lecture de la dernière session restent
lisibles par un examen du disque. C'est le prix assumé du travail hors ligne. La contre-
mesure est organisationnelle — verrouillage de l'appareil, effacement à distance — et doit
figurer dans la consigne remise aux pilotes.

---

## 8. Idempotence, conflits, performances

### Idempotence

| Action | Clé | Comportement au rejeu |
|---|---|---|
| Création de réserve | `origine_client_id` (V1) | rend la même réserve |
| Ajout de photo | `origine_client_id` (V2) | rend la même photo ; **l'objet déjà déposé vaut succès depuis V6** |
| Commentaire | `origine_client_id` (271) | rend la même conversation |
| Transition différée | registre `reserves_mutations_appliquees` (271) | issue `rejeu`, aucun effet |

Démontré : 100 mutations envoyées puis **rejouées intégralement** → 100 réserves, mêmes
identifiants. Trois envois de la même photo → une photo, même identifiant.

### Conflits

La politique est explicite et testée : une réserve **levée** côté serveur n'est jamais
réécrite par une action préparée hors ligne, quelle que soit la nature de la donnée. La
saisie n'est pas perdue — elle est conservée, marquée `conflit`, et **exige une décision
humaine** : la machine à états interdit à un conflit de retourner en file.

### Performances — chantier de 2 000 réserves

| Mesure | Résultat |
|---|---|
| Fiche chantier, 2 000 réserves | 2,3 – 3,1 s |
| Liste des réserves | 2,9 – 3,3 s |
| Document imprimable synthétique | 2,7 – 3,1 s · 1,57 Mo · **2 000 réserves rendues** |
| PDF serveur (Chromium) | 3,0 – 6,2 s · 430 Ko |
| File de 100 mutations (4 lots de 25) | 714 – 988 ms |
| Écriture de 500 lignes en IndexedDB | 11 – 18 ms |
| Lecture de 2 600 lignes locales | 2 – 3 ms |
| Ouverture de la coquille, 500 réserves locales | 61 – 481 ms |
| Consommation IndexedDB observée | 0,9 – 1,7 Mo sur un quota de 3,2 – 4,3 Go |
| Sondes réseau, file bloquée, 25 s | **0** |

Aucune boucle de reprise. Aucune dérive quadratique. Le poste de mesure était chargé
(moyenne 22) : ces chiffres sont un plafond, pas un optimum.

---

## 9. Tests

### Exécutés

| Suite | Résultat |
|---|---|
| Tests unitaires (`vitest`) | **151 / 151**, 12 fichiers |
| `typecheck` (`tsc --noEmit`) | propre |
| `lint` (`eslint`) | propre, zéro avertissement |
| `build` (production) | propre |
| E2E Chromium — V3 + V4 + V5 + V6 sécurité + V6 charge | **59 / 59** |
| E2E iPhone WebKit + Android Chromium + iPad WebKit | **15 / 15** |
| E2E V6 sécurité seule | **22 passés + 1 `fixme`** (défaut §11.1, volontairement rouge) |
| `npm audit` (avec et sans dev) | **0 vulnérabilité** |
| `git diff --check` | propre |
| Recherche de secrets dans l'arbre et le diff | néant |

**Pile de test : jetable et isolée.** `elsatia-reserves-v4-dbtest` (ports 5732x), dédiée à
Réserves. La base de développement principale (`btp-platform`) n'a **jamais** été touchée,
et le script de décor refuse explicitement de la viser. Aucune pile d'une autre conversation
n'a été perturbée ; les serveurs déjà en écoute sur les ports 3020 et 3100 ont été laissés
intacts et ce lot a servi sur le port 3025.

### Nouveaux tests livrés

- `src/lib/offline/reprise.test.ts` — 17 cas : temporisation, plafond, bruit, arrêt.
- `src/lib/securite/entetes.test.ts` — 16 cas : CSP, nonce, origines, en-têtes.
- `src/lib/donnees.test.ts` — 7 cas : pagination au-delà du plafond, cas limites.
- `src/lib/depot-photo.test.ts` — 5 cas : reconnaissance d'un objet déjà déposé.
- `tests/e2e/reserves-v6-securite.spec.ts` — 23 scénarios adversariaux.
- `tests/e2e/reserves-v6-performance.spec.ts` — 5 scénarios de charge.
- `scripts/e2e/prepare-reserves-v6-securite.sql` — décor à deux organisations sans lien.
- `scripts/e2e/prepare-reserves-v6-charge.sql` — chantier de 2 000 réserves.

### Corrections apportées à la recette elle-même

Quatre défauts de recette ont été corrigés, parce qu'un faux négatif fait douter d'un code
correct et finit par faire ignorer la recette :

1. `recette-reserves-v4.sh` n'était **pas rejouable** : le jeu multi-tenant décrémente un
   stock à chaque passage, et au bout d'une dizaine de rejeux le décor entier s'arrêtait sur
   « Stock insuffisant » — très loin de ce que la recette Réserves vérifie. Le stock des
   deux articles de test est désormais remis à niveau avant le rejeu.
2. Les budgets de la génération PDF étaient de 15 secondes, budget d'une **action d'écran**,
   pour une route qui lance un Chromium et s'accorde 60 secondes côté serveur.
3. `jetonSupabase` et `rpc` échouaient sur dépassement de délai au lieu de réessayer, alors
   que le module s'engage explicitement à réessayer sur indisponibilité.
4. Deux assertions utilisaient `count()`, qui ne réessaie pas : elles lisaient l'instant
   d'avant l'hydratation et échouaient sur un écran parfaitement juste.

---

## 10. Ce qui reste ouvert — P0 / P1 / P2

### P0 — aucun

Les deux P0 trouvés (§4.4 photo perdue, §4.5 document tronqué) sont **corrigés et
verrouillés par des tests**.

### P1

| # | Sujet | État |
|---|---|---|
| P1-1 | **Recette iPhone physique** non réalisée | procédure détaillée en §13, à exécuter par Julien |
| P1-2 | **Rattachement d'une entreprise sans trace** par écriture directe | démontré ; correctif SQL rédigé, **BLOQUÉ PAR TRAIN GLOBAL** (§11.1) |
| P1-3 | **Plans et photos déjà envoyés non consultables hors ligne** | inchangé, et **délibérément** : les mettre en cache ferait passer le volume local de 1 Mo à plusieurs centaines. La coquille le dit en toutes lettres, ce qui évite la conclusion fausse. À arbitrer après le pilote, avec un choix explicite de l'utilisateur. |
| P1-4 | **Transfert / révocation / désactivation pendant la coupure** | partiellement couvert : la révocation pendant la coupure est testée (le rejeu échoue, la saisie est conservée avec son motif). Le **transfert** de responsabilité pendant la coupure ne l'est pas encore ; à ajouter à la recette V7. |
| P1-5 | **Brouillon rééditable** | **livré** (§4.8) ; reste à éprouver au doigt sur un écran de 375 px avec des gants |

### P2

| # | Sujet |
|---|---|
| P2-1 | Jokers `like` non échappés dans la recherche annuaire — portée limitée aux organisations publiées, plafonnée à 20 résultats. SQL proposé §11.3. |
| P2-2 | `reserves_designer_entreprise_intervenante` accepte toute organisation, alors que l'écran ne propose que les organisations publiées. SQL proposé §11.2. |
| P2-3 | `reserves_mutations_appliquees` n'a aucune purge : dette d'exploitation à ouvrir avant mise en service. SQL proposé §11.4. |
| P2-4 | Le type MIME d'un téléversement est **déclaré** par le client, jamais reniflé. Portée réelle faible : le type est épinglé à l'écriture, les objets sont servis depuis une autre origine, et l'extension est dérivée du MIME côté base. À traiter par un contrôle des octets d'en-tête. |
| P2-5 | Le message « Enregistré sur l'appareil » paraît avant que la liste « À envoyer » ne se rafraîchisse. La donnée est bien écrite avant le message — seule la liste accuse un instant de retard — mais l'ordre gagnerait à être inversé. |
| P2-6 | Aucune limitation de débit sur `reserves_invitation_consulter`, ouverte à `anon`. Sans effet pratique face à 256 bits d'entropie ; à considérer si une journalisation d'abus est souhaitée. |

---

## 11. SQL proposé, NON intégré

Rédigé dans **`docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql`**, hors de
`supabase/migrations/`, sans numéro.

> **BLOQUÉE PAR TRAIN GLOBAL.** Le train de migrations ELSATIA est consolidé en parallèle
> de ce lot ; allouer un numéro ici entrerait en collision avec cette consolidation. Le
> contenu est prêt et sera numéroté depuis le train canonique
> (`integration/elsatia-ledger-reconciliation-p0-v1`) quand celui-ci sera figé.

### 11.1 — Garde de rattachement (P1, démontré)

`reserves_intervenants` accorde `update` au rôle `authenticated`, et la policy ne vérifie
que le droit sur l'organisation hôte. Une organisation hôte peut donc, par un simple
`PATCH` sur l'API de données, changer le porteur d'une intervention :

```
avant  : entreprise_intervenante_id = F   → F voit ses réserves
PATCH  : entreprise_intervenante_id = B   → HTTP 200
après  : F voit []   ·   revoque_at = NULL   ·   historique_acces_applications = 0 ligne
```

L'entreprise qui portait les réserves **perd tout accès sans qu'aucune révocation ne soit
enregistrée**, et sans que rien ne dise quand ni par qui. Il n'y a pas de fuite entre
tenants — l'hôte n'expose que ses propres données — mais pour une application dont la
valeur **est** le constat contradictoire entre deux entreprises, un changement de porteur
sans trace est un défaut d'intégrité.

Correctif proposé : un trigger de garde sur les colonnes de rattachement, sur le modèle
exact de `reserves_garde_workflow`, laissant passer les seules fonctions `security definer`
du domaine — qui, elles, vérifient le consentement et tracent.

Un test `test.fixme` documente le défaut dans la recette : il énonce le comportement
attendu, échoue aujourd'hui, et passera au vert le jour où le SQL sera joué.

### 11.2 à 11.4

Désignation restreinte aux organisations publiées (P2) ; échappement des jokers `like`
(P2) ; purge du registre d'idempotence (P2). Détail dans le fichier.

### Ce que le SQL proposé ne contient **pas**

**Aucune policy `update` sur `storage.objects`.** Le P0 de §4.4 venait d'un code qui
demandait l'écrasement, pas d'une policy manquante. L'absence de `update` et de `delete`
sur les objets photo est une garantie du produit ; le correctif aligne le code sur elle
plutôt que de l'affaiblir, et il a été livré **sans SQL**.

---

## 12. Dépendance au train global

| Élément | Dépendance |
|---|---|
| Tous les correctifs de §4 | **aucune** — TypeScript pur, aucune migration |
| Garde de rattachement (§11.1) | **bloquante** avant usage à plusieurs organisations hôtes |
| Désignation, jokers, purge (§11.2–4) | non bloquantes pour le pilote |
| Migration candidate 271 | non promue, non renommée ; le train reste seul maître de sa numérotation |

**Conditions du GO pilote :**

1. La recette iPhone §13 est exécutée et concluante.
2. Le pilote se limite à **une seule organisation hôte** tant que §11.1 n'est pas joué —
   le défaut ne concerne que le rattachement d'entreprises tierces par un hôte.
3. Le plafond de 1 000 lignes (§4.5) est revérifié en préproduction sur un chantier réel de
   plus de mille réserves, la configuration Supabase Cloud pouvant différer.

---

## 13. Recette iPhone à faire au retour de Julien

À exécuter sur un **iPhone réel**, pas sur un simulateur. Compter 45 minutes. Noter à
chaque étape ce qui est vu, pas ce qui est attendu.

### Préparation

1. iPhone à jour, Safari, données mobiles **et** Wi-Fi actifs.
2. Ouvrir l'URL de préproduction Réserves, se connecter avec un compte de test.
3. **Partager → Sur l'écran d'accueil.** Fermer Safari. Ouvrir l'application depuis
   l'icône : elle doit s'ouvrir **sans barre d'adresse**.
4. Ouvrir un chantier et sa liste de réserves. Attendre le chargement complet.

### A — Ouverture sans réseau

5. **Mode Avion.** Fermer complètement l'application (balayage vers le haut).
6. Rouvrir depuis l'icône.
   - ✅ L'application **s'ouvre**.
   - ✅ Le bandeau annonce « Hors ligne ».
   - ✅ Le chantier et ses réserves sont **listés**.
   - ❌ Un écran blanc, une erreur Safari, ou une liste vide = **arrêt de la recette**.

### B — Saisie sur le terrain, sans réseau

7. Toujours en mode Avion : « Constater une réserve », intitulé + description, **Mettre en
   file d'envoi**.
   - ✅ Message : « L'envoi partira dès le retour du réseau ».
   - ✅ La réserve apparaît dans « À envoyer ».
8. « Joindre une photo » → **prendre une photo avec l'appareil**.
   - ✅ Le format est accepté (si « HEIC non pris en charge » apparaît : Réglages → Appareil
     photo → Formats → **Le plus compatible**, puis recommencer — et **le noter**).
   - ✅ L'aperçu s'affiche et le poids annoncé est de l'ordre de quelques centaines de Ko,
     **pas** de plusieurs Mo.
9. Répéter jusqu'à **dix photos**. Noter si un message de mémoire pleine apparaît.

### C — Brouillon

10. Commencer une réserve, saisir l'intitulé seul, **Garder en brouillon**.
11. Fermer l'application, la rouvrir.
    - ✅ Le brouillon est dans « Brouillons sur l'appareil ».
12. **Reprendre**, compléter la description, **Mettre en file d'envoi**.
    - ✅ Il passe dans « À envoyer » et disparaît des brouillons.

### D — Redémarrage brutal

13. Toujours hors réseau, **forcer la fermeture** de l'application, la rouvrir.
    - ✅ Tout ce qui a été saisi est **toujours là**.
    - ✅ Rien n'affiche « Envoi en cours » indéfiniment.

### E — Retour du réseau

14. **Désactiver le mode Avion.** Laisser l'écran allumé sur la page hors-ligne.
    - ✅ Le bandeau passe à « Le réseau est revenu ».
    - ✅ La file se vide **seule**, en moins de deux minutes.
    - ✅ Message final : « Rien en attente ».
15. Ouvrir le chantier **sur un ordinateur**.
    - ✅ Toutes les réserves saisies y sont, **une seule fois chacune**.
    - ✅ Toutes les photos y sont, **une seule fois chacune**, lisibles et nettes.

### F — Coupure en plein envoi (le scénario qui a révélé le P0 §4.4)

16. Créer une réserve avec photo hors réseau. Réactiver le réseau et, **pendant** l'envoi,
    repasser en mode Avion.
17. Attendre 30 s, réactiver le réseau.
    - ✅ L'envoi **repart** et aboutit.
    - ❌ « Le téléversement a été interrompu » qui persiste après plusieurs minutes =
      **régression du correctif §4.4, à signaler immédiatement**.
    - ✅ Sur l'ordinateur : **une seule** photo, pas deux.

### G — Batterie et veille

18. Laisser une action en échec dans la file. Verrouiller l'iPhone, le poser **30 minutes**.
19. Le déverrouiller. Réglages → Batterie → activité par app.
    - ✅ Réserves n'apparaît **pas** en tête de la consommation d'arrière-plan.

### H — Confort au doigt

20. Sur chaque écran : lisible en plein soleil ? Boutons atteignables au pouce ? Rien ne
    déborde à l'horizontale ? Les états sont-ils lisibles **sans** distinguer les couleurs ?
21. Avec des **gants de chantier**, refaire les étapes 7 et 8.

### I — Changement de compte

22. Se déconnecter. Se reconnecter avec un compte d'une **autre** organisation.
    - ✅ **Aucune** donnée de l'organisation précédente n'apparaît, nulle part.
23. Mode Avion, ouvrir l'application.
    - ✅ Seules les données de la nouvelle organisation sont visibles.

### À rapporter

Pour chaque étape : ✅ / ❌ et une phrase. Pour tout ❌ : capture d'écran, heure, et l'action
exacte qui précédait. Les étapes **A5-6**, **F17** et **I22** sont bloquantes pour le
pilote.

---

## 14. Ce que ce lot ne fait pas

- Il ne fusionne rien.
- Il ne déploie rien.
- Il ne crée, ne renomme ni ne promeut aucune migration.
- Il ne touche pas à la base de développement principale.
- Il ne change aucune règle métier : toutes les corrections sont des corrections de
  sécurité, de robustesse ou d'exactitude, jamais de comportement produit.
