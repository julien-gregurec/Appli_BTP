# ELSATIA Colors — préparation au pilote et à la commercialisation

**Verdict : PRÊT SOUS CONDITIONS.**

Colors est opérationnel de bout en bout dans son périmètre réel, sécurisé,
adapté du téléphone au grand écran, installable, et recetté sur quatre profils
de navigateur. Il n'est pas prêt à ouvrir un pilote **aujourd'hui**, pour une
raison qui ne dépend pas du code : ce qui est servi sur `colors.elsatia.fr` est
un build très antérieur, dépourvu du parcours de réinitialisation de mot de
passe et de toute en-tête de sécurité. Les conditions sont listées en §10.

---

## 1. Identification du lot

| | |
|---|---|
| Branche | `feat/colors-commercial-readiness-v1` |
| SHA de base | `59e960a0e6648a472bedff0d8b71d47caa6e56ac` (train V3, tête documentaire) |
| SHA métier testé du train | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` (ancêtre vérifié de la base) |
| SHA final | `fe9fea66681ef40c3a0464d23ef1915dc90949cd` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/colors-commercial-readiness-v1` |
| Commits | 7 |
| Fichiers | 54 modifiés — 3 352 insertions, 49 suppressions |
| Migrations | **aucune**. Ledger inchangé à 278 fichiers. Un `.sql.proposed`, sans numéro. |

### Pourquoi le train V3 et non les branches Colors

Les huit branches `colors/*` sont 126 commits derrière le train V3 et ne
contiennent rien qu'il n'ait déjà ; `integration/colors-code-on-ecosystem-ledger-v1`
en *retire* même l'assistance interapplications. Le train V3 est le sur-ensemble
strict. Aucune de ces branches n'a été reprise.

---

## 2. Écart entre la mission et le produit

ELSATIA Colors **n'est pas une application de mesure colorimétrique**. C'est une
gestion de stock de peinture au seau : chaque seau individualisé, localisé,
historisé, avec sa teinte déclarée, son niveau, son état et sa photo.

Les phases demandées restent applicables, à une réinterprétation consignée près :

- « créer/ouvrir un projet » → créer ou ouvrir un **seau** ;
- « calibrer », « sélectionner une zone », « analyser la couleur » → **sans
  objet**, et rien n'a été ajouté en ce sens. Une pipette sur photo non calibrée
  produirait exactement l'affirmation que la mission interdit ;
- « correspondance avec niveau de confiance » → **pleinement traité** : teinte
  déclarée en HEX, référence la plus proche du nuancier chargé, écart ΔE ;
- « finition » → **modèle complet livré**, écriture bloquée par l'absence de
  migration.

---

## 3. État de chaque parcours

| Parcours | État | Détail |
|---|---|---|
| Connexion | opérationnel | mot de passe, contrôle serveur, session isolée par domaine |
| Création de compte | **hors périmètre, assumé** | l'identité naît sur Gestion Pro ; Colors le dit à l'écran et renvoie au portail |
| Vérification d'adresse | opérationnel | `/auth/confirm`, relais depuis le portail commun |
| Récupération de mot de passe | opérationnel dans le code, **absent en Production** | anti-énumération vérifiée par E2E |
| Invitation | **absent** | aucune table, aucune route, aucun courriel dans tout le dépôt |
| Acceptation d'invitation | **absent** | conséquence du précédent |
| Rattachement à une entreprise | opérationnel | contrat canonique, refus explicite sinon |
| Onboarding initial | **livré par ce lot** | quatre étapes déduites des données réelles, aucun état stocké |
| Déconnexion | opérationnel | révoque la session Supabase |
| Session expirée | **livré par ce lot** | distinguée d'une absence de session par un fait observable |
| Révocation d'accès | opérationnel | effet immédiat, revérifié à chaque rendu et par la RLS |
| Créer / ouvrir un seau | opérationnel | |
| Photo (import et appareil) | opérationnel | `capture="environment"`, signature binaire vérifiée |
| Qualité minimale de l'image | opérationnel | MIME **et** octets de tête, 10 Mo |
| Calibration | sans objet | aucune mesure n'est faite |
| Analyse de couleur | **volontairement absente** | voir §2 |
| Correspondance de nuancier | **livré par ce lot** | ΔE, qualificatif d'écart, provenance citable |
| Finition | **modèle livré, écriture bloquée** | migration proposée |
| OCR | **intégré, inactif par défaut** | aucun prestataire contractualisé |
| Historique | opérationnel | journal append-only, auteur nommé, diff champ par champ |
| Export | **réparé par ce lot** | troncature silencieuse à 5 000 lignes supprimée |
| Suppression | opérationnel | archivage tracé ; aucune suppression physique possible |
| Stockage des images | opérationnel | bucket privé, liens signés 300 s, cloisonné par organisation |
| Conservation | **absent** | aucune règle de rétention ni purge |
| Responsive | **corrigé par ce lot** | 0 débordement aux sept largeurs |
| PWA | **corrigé par ce lot** | installable sur iOS |
| Hors ligne | volontairement minimal | page dédiée ; aucune donnée de stock en cache |
| Assistance interapplications | opérationnel | bornée à Colors, annoncée par un bandeau |
| Notifications | absent | hors périmètre du pilote |
| Abonnement et habilitations | opérationnel | double verrou, deux écrans de refus distincts |
| Variables d'environnement | opérationnel | garde bloquante avant `next build` |

---

## 4. Correspondance de nuancier

Le moteur CIELAB existait depuis le premier jalon et **n'avait aucun appelant**.
Le défaut signalé — « RAL calculé mais non alimenté » — était en dessous de la
réalité : rien n'était calculé, et les colonnes `ral_approxime`, `ral_distance`,
`ral_confirme` n'ont jamais reçu de valeur.

Ce qui manquait n'était pas le moteur, c'était **la source licite**. Aucun
nuancier n'est livré, et ce lot n'en ajoute aucun : RAL Classic et les nuanciers
fabricants sont des bases protégées, et une valeur sRGB approchée d'un standard
mesuré en laboratoire n'a pas la valeur du standard.

L'application fournit le mécanisme : un fichier JSON déclarant **source, version
et licence**, désigné par la variable **serveur** `COLORS_NUANCIER_FICHIER` —
serveur et non publique, un nuancier communiqué par contrat n'ayant pas à être
servi en clair à tous les visiteurs. Une entête incomplète refuse le fichier en
bloc ; une référence invalide est écartée ligne à ligne.

**L'absence est un état normal**, pas une panne : l'écran `/nuanciers` — qui
n'est plus une annonce « bientôt disponible » — explique pourquoi il est vide, et
les fiches affichent « aucune référence proposée » plutôt que d'inventer.

Ce que la correspondance affirme : une **proposition de proximité**, avec son
écart ΔE, son qualificatif, la source, la version du nuancier et la version du
moteur. Ce qu'elle n'affirme jamais : une identification. Un test verrouille
l'absence de vocabulaire de certitude dans les libellés.

Le calcul est fait à l'affichage et jamais écrit — une correspondance stockée
deviendrait fausse au premier changement de nuancier.

---

## 5. Finition

Modèle complet et testé : `mat`, `satine`, `brillant`, `texture`, et
`indetermine` comme valeur de plein droit. **Deux origines seulement — déclarée
ou inconnue.** Aucune origine « estimée » n'est prévue et un test le verrouille :
le brillant apparent sur une image dépend de l'angle et de l'éclairage.

**Écriture bloquée.** `colors_valider_seau` (V1.4) refuse toute mutation qui ne
passe pas par une RPC métier appartenant à `postgres`, et aucune colonne
`finition` n'existe. Mesuré indépendamment sur le schéma : `colors_seaux`
n'accorde que `SELECT` et `INSERT` au rôle applicatif. Persister la finition
exige donc une migration, non autorisée dans ce lot.

→ `docs/migrations-proposees/colors-finition-et-reference-nuancier-v1.sql.proposed`,
**sans numéro de ledger**. Elle ajoute la colonne, l'entrée au journal des
modifications, et deux RPC — dont celle qui permet à un humain de confirmer une
référence proposée.

---

## 6. Lecture d'étiquette (OCR)

`analyserEtiquetteColors` n'avait, lui non plus, aucun appelant. Pire : la
permission nommée `ocr` ne gardait en réalité que le téléversement d'une photo,
et l'écran d'ajout affirmait « le contrat de fournisseur OCR est prêt ».

**Intégration technique terminée, inactive par défaut**, conformément à la
consigne. Points de garantie :

- **L'ordre des contrôles est le contrat.** `/api/ocr` décide de l'état avant de
  lire le corps de la requête : tant que la lecture est inactive, aucune image
  n'est reçue, mise en mémoire ni transmise. Un test verrouille cet ordre.
- **Deux verrous convergents**, jamais un seul : `COLORS_OCR_ACTIF=oui` (décision
  d'exploitation) **et** `COLORS_OCR_FOURNISSEUR=<id>` (sous-traitant nommé,
  inscriptible dans un registre de traitements). Aucune n'est `NEXT_PUBLIC_` ; un
  test balaie tout `src/` pour le vérifier.
- **Registre des prestataires vide**, et c'est le livrable : aucun n'est
  contractualisé. Tant qu'il l'est, aucune configuration n'active quoi que ce
  soit.
- **Consentement explicite** par requête, distinct de l'envoi de la photo à
  ELSATIA.
- **Confirmation champ par champ.** Sur une étiquette de peinture, la marque est
  presque toujours bien lue et la référence presque jamais : un « tout accepter »
  ferait entrer des références fausses là où elles coûtent le plus cher, à la
  commande. Un champ non coché n'est pas écrit.
- **Le prestataire ne recevra que des octets et un type MIME** : ni identifiant
  d'organisation, ni de seau, ni nom de fichier.
- **Aucune couleur n'est jamais déduite d'une image**, ni par l'OCR ni ailleurs.

Aucune migration : le socle SQL (`créer`/`confirmer`/`rejeter`, statuts,
cloisonnement) existe depuis la V1.1.

---

## 7. Sécurité

### Mesuré en base (conteneur d'audit, lecture seule)

| Table | Droits `authenticated` | Politiques RLS |
|---|---|---|
| `colors_emplacements` | SELECT, INSERT, UPDATE | 3 |
| `colors_seaux` | SELECT, INSERT | 2 |
| `colors_mouvements` | SELECT | 1 |
| `colors_parametres` | SELECT | 1 |
| `colors_analyses_ocr` | SELECT | 1 |
| `colors_nettoyages_photos` | aucun | 0 — refus total |

`anon` n'a aucun droit. Bucket `colors-seaux` privé, 10 Mo, MIME restreints,
trois politiques à porte de signature. `relforcerowsecurity` est à `false` : c'est
correct et délibéré — le forcer soumettrait le propriétaire à la RLS et casserait
toutes les RPC `security definer`, qui sont le seul chemin d'écriture.

### Corrigé par ce lot

- **Fuite de valeurs métier dans les journaux.** `journaliserEchecTechnique`
  écrivait `erreur.message` tel quel, or PostgreSQL y fait entrer des valeurs
  (`Key (entreprise_id, nom)=(0f3a…, Dépôt Nord)`). Le nom du dépôt d'un client
  atterrissait dans un journal Vercel conservé, lisible par toute personne ayant
  accès au projet, **hors du cloisonnement par entreprise**. Trois formes sont
  retirées avant écriture ; le code SQLSTATE est au contraire ajouté.
- **CSP destructrice sur WebKit.** `upgrade-insecure-requests` était émise dès que
  `NODE_ENV !== "development"`. Chromium exempte `127.0.0.1` du surclassement,
  WebKit non : sur une origine HTTP, WebKit réclamait en `https` les 284 règles
  de style et tous les fragments de script, échouait sur une erreur TLS, et
  affichait la page entièrement nue, sans le moindre message. **Toute préversion
  servie en HTTP était cassée sur Safari et sur iPhone, en silence.** La
  Production HTTPS ne perd aucune protection : la directive y reste émise.
- **Quatre invariants verrouillés en revue** : aucune écriture directe sur une
  table Colors ; la clé de service n'est lue que par `admin-storage.ts` et ne
  touche aucune table métier ; l'identifiant d'organisation ne peut venir ni d'une
  URL ni d'un formulaire ; toute route d'API exige le contexte canonique et la
  garde d'accès.

### Reste ouvert

Aucune règle de conservation ni purge (photos, analyses, journal).

---

## 8. Tests et recette

| Contrôle | Avant | Après |
|---|---|---|
| Tests unitaires Colors | 264 | **360** (35 fichiers) |
| Tests racine pertinents | — | 44 verts |
| Typecheck | propre | propre |
| Lint | propre | propre |
| Build Colors | — | réussi, 27 routes |
| E2E surface publique | 0 | **34 verts en une passe** |
| Migrations | 278 | **278, inchangé** |
| `git diff --check` | — | propre |
| Secrets dans le diff | — | aucun |

### Profils de recette E2E

| Profil | Tests | Résultat |
|---|---|---|
| Chromium bureau | 19 | verts |
| iPhone 13 — WebKit | 5 | verts |
| Pixel 7 — Chromium Android | 5 | verts |
| iPad gen 7 — WebKit | 5 | verts |

### Largeurs mesurées, débordement horizontal

| Largeur | 375 | 390 | 430 | 768 | 1024 | 1200 | 1440 |
|---|---|---|---|---|---|---|---|
| Avant | 0 | 0 | 0 | **51 px** | 0 | 0 | 0 |
| Après | 0 | 0 | 0 | **0** | 0 | 0 | 0 |

Contraste : 107 nœuds de texte contrôlés sur la coquille authentifiée, **zéro
échec**. Trois défauts corrigés, dont le corail de marque à 2,43:1 qui portait
l'en-tête de **chaque** écran, et un introduit par ce lot même.

### Ce qui n'est pas recetté

Tout ce qui se trouve derrière le mur de connexion. Cela exige une base au ledger
du train V3 **et** un compte habilité sur Colors ; aucun des deux n'était
disponible sur ce poste sans muter la pile Supabase d'un autre lot ou le jeu de
données local partagé, ce que la mission interdit. La coquille authentifiée a été
mesurée visuellement via un harnais local temporaire — balisage réel, composants
réels, CSS réel — supprimé avant le commit. Les **parcours fonctionnels**
authentifiés restent à recetter : c'est la condition P7.

---

## 9. Audit public final — constat, aucun déploiement

Mesuré sur `colors.elsatia.fr` après les corrections, sans rien déployer.

| Route | Code | Constat |
|---|---|---|
| `/` | 307 → `/dashboard` | |
| `/login` | 200 | rendu correct |
| `/mot-de-passe-oublie` | **404** | parcours de réinitialisation absent |
| `/nouveau-mot-de-passe` | **404** | idem |
| `/auth/confirm` | **404** | idem |
| `/dashboard`, `/inventaire`, `/nuanciers`, `/ajout-photo` | 307 → `/login` | mur de connexion effectif |
| `/acces-refuse`, `/abonnement-requis` | 307 → `/login` | |
| `/robots.txt` | **404** | fermeture d'indexation absente |
| `/hors-ligne.html`, `/icons/colors-icon-192.png`, `/api/ocr` | 404 | build antérieur |
| `/sitemap.xml` | 404 | **conforme** — aucun plan de site ne doit être publié |
| `/manifest.webmanifest`, `/sw-colors.js` | 200 | anciennes versions |

**En-têtes servis sur `/login` : `strict-transport-security` seul**, émis par
Vercel. Aucune CSP, aucun `X-Frame-Options`, aucun `Referrer-Policy`, aucun
`X-Content-Type-Options`, aucun `X-Robots-Tag`. La page servie ne porte **aucune
balise `robots`** : le mur de connexion est indexable.

**Absence d'ouverture commerciale prématurée : confirmée.** Les seuls liens de la
page servie sont `/dashboard`, le manifeste et l'icône. Aucun tarif, aucun faux
client, aucun faux avis, aucun CTA d'achat, aucune inscription publique.

**Lien vers le site ELSATIA :** absent du build déployé. Le build de ce lot en
ajoute un vers le portail de compte (`NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`), ce qui
est la bonne cible pour une application — le site vitrine n'a pas à recevoir
quelqu'un qui cherche à se connecter.

---

## 10. Conditions

### Avant d'ouvrir le pilote

| # | Condition | Pourquoi |
|---|---|---|
| P1 | **Déployer** cette branche (ou le train V3) | Sans elle, une personne qui perd son mot de passe pendant le pilote est bloquée, et aucune en-tête de sécurité n'est servie |
| P2 | Vérifier les cinq variables publiques en Production | La garde bloque le build à défaut ; il faut qu'elle passe |
| P3 | Décider du sort des données du pilote | Aucune règle de conservation n'existe |
| P4 | Fournir un nuancier sous licence, ou renoncer | Sans fichier, aucune référence n'est proposée — cohérent, mais à savoir avant de présenter le produit |
| P5 | Décider de la lecture d'étiquette | Inactive ; l'activer suppose contrat, base légale et information des personnes |
| P6 | Arbitrer la migration proposée | Sans elle : pas de finition, pas de confirmation humaine de référence |
| P7 | Recetter les parcours authentifiés | Non couverts par ce lot, faute d'environnement |

### Avant commercialisation

- **Parcours d'invitation** — indispensable au-delà d'une poignée d'utilisateurs.
- **Règles de conservation et purge** — obligation, pas confort.
- **Écrans Catalogues, Imports, Utilisateurs** — encore des annonces « bientôt
  disponible ». Un produit vendu ne comporte pas de rubriques vides.
- **Suppression de photo à l'unité** depuis l'interface.
- **Nuancier sous licence**, ou renoncement assumé et documenté.
- **Lot ELSATIA-UI-V2** — refonte visuelle prévue avant commercialisation.

---

## 11. Estimations

| | Estimation |
|---|---|
| Avancement du produit sur son périmètre réel | **~85 %** |
| Avant pilote | **1 à 2 jours** — dominés par P1 (déploiement) et P7 (recette authentifiée) ; P3 à P6 sont des décisions, pas du développement |
| Avant commercialisation | **4 à 7 semaines** — invitation (1–2 sem.), conservation et purge (1 sem.), trois écrans à livrer (1–2 sem.), UI-V2 (lot séparé, non chiffré ici) |

---

## 12. Interdictions respectées

Aucune fusion dans `main`. Aucun déploiement. Aucun Stripe. Aucune modification
du site public ni du worktree Gestion Pro mobile. Aucun prix inventé. Aucun
nuancier copié. Aucune capture inventée. Aucune migration numérotée. Aucun
force-push, rebase, amend ni `git clean`. Aucun processus extérieur arrêté — les
six piles Supabase et le serveur du poste ont été laissés intacts, seule une
lecture SQL en lecture seule a été faite sur un conteneur d'audit. Aucun secret
dans Git.
