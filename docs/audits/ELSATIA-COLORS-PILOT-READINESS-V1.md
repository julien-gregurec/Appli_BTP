# ELSATIA Colors — clôture technique et intégration au Train V3

**Verdict : BLOQUÉ ENVIRONNEMENT — RECETTE NON CONCLUSIVE.**

Tout ce qui se démontre sans navigateur est démontré et vert : la migration, le
cloisonnement multi-entreprise, la séparation RAL/fabricants, le nettoyage des
photos, la fermeture de la lecture d'étiquette, les dix-sept contrôles sur arbre
figé. Ce qui manque est la recette Playwright des 35 parcours en une passe — et
elle ne manque pas par défaut du produit : **le poste ne peut pas la servir**.

Ce verdict n'est pas un `GO PILOTE SOUS CONDITIONS` déguisé. La mission demande
explicitement de ne pas produire de verdict applicatif quand la fenêtre ne
s'ouvre pas, et elle ne s'est pas ouverte.

## Ce qui a changé depuis `3e90c9f`

| Décision | État |
|---|---|
| **D1 — RAL et fabricants séparés** | **Fermée.** Voir §2 bis. |
| **D2 — photos débarrassées des EXIF/GPS** | **Fermée.** Voir §9 bis. |
| Trois défauts produit trouvés | Corrigés. Voir §6 bis. |

## 1. Identification

| | |
|---|---|
| Dépôt | `git@github.com:julien-gregurec/Appli_BTP.git` |
| Branche | `integration/colors-pilot-readiness-v1` |
| Train V3 de départ | `59e960a0e6648a472bedff0d8b71d47caa6e56ac` |
| SHA métier du train, vérifié ancêtre | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` |
| Lot Colors intégré | `38d871c9ea3b0745a568fb136cf9f9c8c2cf0733` |
| SHA final | **`6c4b4bffb7568172c8b189088a0ee370fb913ea5`** |
| Commits | 17 |
| Fichiers modifiés | 80 |
| Migration créée | **`20260909000281_colors_finition_reference_nuancier_v15.sql`** |
| Ledger | 278 → **279** |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/colors-pilot-readiness-v1` |

Le train n'avait pas bougé depuis le lot Colors : la fusion s'est faite sans
conflit, sur base commune identique, sans qu'aucun apport du train soit arbitré.

### Périmètre — preuve d'absence d'embarquement parasite

| Racine | Fichiers |
|---|---|
| `apps/colors/` | 69 |
| `docs/` | 5 |
| `tests/e2e/` | 4 |
| `supabase/tests/` | 1 |
| `supabase/migrations/` | **1** |

**Zéro fichier** sous `src/` (Gestion Pro), `apps/reserves/`, `apps/tools/` ou
`packages/`. Une seule migration ajoutée, aucune migration existante modifiée.

### Attribution du numéro de migration

Les 289 noms de migration jamais ajoutés sur une référence locale ou distante
ont été énumérés (`git log --all --remotes --diff-filter=AR`). Le plus haut
était `20260909000280`. **`20260909000281` était libre, sans collision.**

---

## 2. Audit du SQL proposé — trois défauts, dont un bloquant

Le fichier `docs/migrations-proposees/colors-finition-et-reference-nuancier-v1.sql.proposed`
**n'a pas été promu tel quel**. Il est conservé pour mémoire.

1. **Fonction inexistante.** Il appelait `public.colors_diff_seau_base` et
   laissait son extraction « à l'application de la migration ». Une migration ne
   délègue pas une étape indispensable.
2. **Volatilité changée en passant.** Il réécrivait `colors_diff_seau` en
   `plpgsql volatile` alors que la fonction réelle est `sql immutable` bâtie sur
   une liste `VALUES`. Une assertion pgTAP verrouille désormais `provolatile='i'`.
3. **Bloquant à l'exécution.** `colors_valider_mouvement` (V1.4) porte une liste
   blanche des champs journalisables. Les entrées `finition`,
   `reference_nuancier` et `reference_confirmee` insérées par la proposition
   auraient été rejetées par `raise exception 'Champ Colors non journalisable'`.
   **Toute déclaration de finition aurait échoué.**

Quatrième point corrigé après coup : le refus d'une référence hors format RAL
porte un SQLSTATE dédié `CLR01`. Faire reposer la logique applicative sur le
texte français d'un message est un contrat qu'une reformulation romprait en
silence.

### Décision de produit laissée ouverte

`colors_seaux_ral_approxime_check` impose `^RAL [0-9]{4}$` et **n'a pas été
élargie**. Conséquence assumée : une référence de nuancier fabricant reste
proposée à l'écran et exportée, sans pouvoir être confirmée. Élargir la
contrainte revient à décider ce que contient au juste une colonne nommée
`ral_approxime` — c'est une décision de produit, pas un détail technique. La RPC
refuse explicitement, sous `CLR01`, plutôt que de laisser la contrainte de table
produire une erreur opaque, et l'écran affiche « la proposition reste visible,
elle ne peut simplement pas être confirmée ».

---

---

## 2 bis. Décision D1 — références RAL et fabricants strictement séparées

### La colonne neutre n'existe pas : vérifié avant d'écrire

Relevé sur le schéma de la pile dédiée : `colors_seaux` ne porte que
`ral_approxime`, `ral_distance` et `ral_confirme`. Aucune table de nuancier
(`article_teintes` appartient à Gestion Pro). La deuxième branche de la décision
s'applique donc : `.sql.proposed` sans numéro, confirmation fabricant bloquée
côté applicatif, confirmation RAL opérationnelle. **La migration 281 n'a pas été
touchée et le ledger reste à 279.**

### Le piège que ce lot ferme

On pourrait croire qu'il suffit de regarder la forme du code : `RAL 9010`
ressemble à du RAL, `PR-1024` non. C'est faux, et dangereusement. **Rien
n'empêche un nuancier fabricant de nommer une de ses teintes « RAL 9010 »**
parce qu'elle s'en approche. La retenir alors dans une colonne nommée
`ral_approxime` présenterait une référence fabricant comme une norme.

La nature d'une référence est donc décidée par la **provenance déclarée** du
nuancier (`referentiel: "ral" | "fabricant"`), et le format du code n'est qu'une
condition supplémentaire. Un nuancier muet vaut `fabricant` — le défaut prudent,
verrouillé par un test.

### Trois verrous, du plus visible au plus profond

1. **L'écran** ne propose plus de bouton pour une référence non persistable :
   proposer un bouton qui échoue ensuite ferait porter à l'utilisateur une
   limite de schéma dont il n'est pas responsable, et l'inviterait à réessayer.
   Il explique, et affiche la nature à côté du code.
2. **L'action serveur** refuse avant tout appel à la base — une Server Action
   est une surface publique, appelable sans passer par l'écran.
3. **Le schéma** refuse sous le SQLSTATE dédié `CLR01`.

### Les huit démonstrations exigées

| # | Démonstration | Preuve |
|---|---|---|
| 1 | Proposition RAL valide | `nature: ral`, `persistable: true` |
| 2 | Confirmation RAL valide | format applicatif **identique** à la contrainte SQL, comparé par test |
| 3 | Refus d'un faux format | 6 variantes (`RAL9010`, `ral 9010`, `RAL 901`, `RAL 90101`, double espace, espace final) |
| 4 | Proposition fabricant | proposée avec provenance, signalée fabricant |
| 5 | Aucune écriture dans `ral_approxime` | **y compris pour un fabricant déguisé en RAL** |
| 6 | Modèle neutre | proposé, six informations, **absent du ledger** (279 vérifié par test) |
| 7 | Provenance conservée | colonne `Référentiel` : `"RAL 9010";"Fabricant"` |
| 8 | Aucune certification | aucun intitulé ne contient `certifi\|exact\|garanti\|mesur` |

23 tests unitaires, plus six vérifications HTTP sur l'application vivante
(§6 ter) : nature affichée « Référence fabricant », **zéro bouton « Retenir »**,
explication présente, export portant `"TEST-BLANC";"Fabricant"` et **zéro
ligne** la présentant comme RAL.

### Modèle neutre proposé

`docs/migrations-proposees/colors-references-fabricants-neutres-v1.sql.proposed` :
une table plutôt que des colonnes — une référence retenue porte six informations
dont trois n'ont de sens qu'ensemble (fabricant, nuancier, version) —, une seule
référence par seau, proposition **et** confirmation conservées séparément
puisque c'est leur écart qui vaut d'être tracé, et deux contraintes qui refusent
le format RAL dans ce modèle-ci. Elle ne migre rien depuis `ral_approxime`.

Elle porte aussi une note d'application indispensable : la liste blanche de
`colors_valider_mouvement` devra être étendue au champ `reference_fabricant`,
faute de quoi l'insertion au journal sera rejetée — la même erreur que celle
trouvée dans le SQL proposé du lot précédent.

---

## 9 bis. Décision D2 — photos débarrassées de leurs métadonnées

### Réencodage, pas retrait de champs

L'image est **décodée puis réencodée** : les pixels sont relus et un fichier neuf
est écrit. Aucun bloc de métadonnées de l'original ne peut survivre à ce trajet,
y compris ceux qu'une liste de champs à retirer aurait oubliés — un profil
fabricant propriétaire, un commentaire XMP, une miniature enfouie.

**L'orientation EXIF est appliquée aux pixels avant d'être effacée.** Sans cette
précaution, retirer l'EXIF ferait basculer d'un quart de tour toutes les photos
prises en portrait, et Colors afficherait des étiquettes couchées.

HEIC et HEIF sortent en JPEG : aucun navigateur n'affiche du HEIC, et Colors rend
les photos avec `next/image`. Conserver l'extension d'origine produirait une
fiche dont l'image ne s'affiche pas — un défaut que le nettoyage n'a pas à créer.

### Fermé par défaut

Illisible, dimensions aberrantes, encodage impossible, métadonnées résiduelles :
chacun **refuse le stockage**, sans repli sur l'original. Le contrôle de sortie
porte sur les **octets** et non sur ce que le décodeur rapporte — c'est un
contrôle, il ne doit rien devoir à la bibliothèque qui vient d'écrire le fichier.

Les métadonnées retirées ne sont **jamais journalisées** : cela déplacerait la
fuite du fichier vers des journaux qui ne sont pas cloisonnés par organisation.

### Preuve de bout en bout sur la pile réelle

Photo piégée téléversée par `/api/photos`, puis **fichier réellement stocké relu
depuis le bucket** :

| | Envoyé | Stocké |
|---|---|---|
| Taille | 1 242 o | **328 o** |
| Dimensions | 40×20 | **20×40** (orientation appliquée) |
| Bloc EXIF | présent | **absent** |
| Profil ICC | présent | **absent** |
| Orientation | 6 | **aucune** |
| Appareil, modèle, logiciel, date | présents | **absents** |
| Marqueur `GPSLatitude` | présent | **absent** |
| Débuts d'image JPEG | — | **1** (aucune miniature) |

### Une assertion vacante, trouvée et corrigée

Une première assertion cherchait la chaîne `48/1 51/1` dans les octets, alors que
**le GPS EXIF est stocké en rationnels binaires**. Elle ne trouvait rien ni avant
ni après le nettoyage : elle passait au vert **sans rien démontrer**.

Elle est remplacée par une lecture réelle de l'en-tête TIFF et des entrées de
l'IFD0, à la recherche du pointeur `GPSInfo` (0x8825). Vérifiée discriminante :
**vrai** avec GPS, **faux** sans, **faux** après nettoyage.

La fixture est fabriquée à l'exécution plutôt que versionnée en binaire : un
binaire dans le dépôt est opaque à la revue, personne ne peut vérifier en lisant
un diff qu'il contient bien des coordonnées. Les tests démontrent **d'abord** que
la fixture est piégée, **ensuite** qu'elle est désamorcée.

### Aucun téléversement direct ne contourne le nettoyage

Les politiques de stockage de la V1.2 sont `bucket_id <> 'colors-seaux'` en
INSERT **et** en DELETE : le rôle applicatif ne peut ni écrire ni supprimer dans
ce bucket, seule la lecture lui est ouverte. Toute écriture passe donc
obligatoirement par la clé de service, c'est-à-dire par `/api/photos`. Un test
vérifie côté code qu'aucune autre route n'appelle le stockage, et que la route
de lecture d'étiquette ne stocke aucune image.

25 tests couvrent le nettoyage, dont l'échec fermé et la convergence des formats.

---

## 6 bis. Trois défauts produit trouvés par la mesure

### 1. Une panne d'authentification annoncée comme un mauvais mot de passe

Corrigé au lot précédent pour `signInWithPassword`.

### 2. Une panne d'habilitation annoncée comme une absence d'habilitation

**Le même défaut subsistait à l'identique sur les deux lectures qui suivent**, et
je ne l'avais pas vu. `contexte_application_courant` et `a_acces_application`
renvoyaient toutes deux vers « Votre compte ELSATIA ne dispose pas d'un accès
actif à Colors » dès qu'elles retournaient une erreur, quelle qu'en soit la
cause.

Constaté en mesurant : sous charge, une de ces RPC a dépassé son délai et une
administratrice parfaitement habilitée s'est vu refuser l'entrée avec ce message.
Il envoie vers **le mauvais interlocuteur** — on va demander une habilitation à
son administrateur, qui n'y peut rien, au lieu d'attendre que le service revienne.

Une **erreur** annonce désormais le service indisponible. Une réponse **vide**
reste une absence d'accès : le contrat canonique a répondu, et il ne rattache la
personne à rien. La distinction porte sur ce qui s'est passé, pas sur le résultat
observé.

### 3. Une correction du diagnostic du lot précédent

Le rapport précédent attribuait **toute** la non-déterminisme de la recette à la
saturation du poste. C'était vrai en partie seulement.

Le journal du serveur de recette montre `Operation not permitted` en sourçant le
fichier de clés depuis `launch.json` : les `export` posaient alors des valeurs
**vides** qui écrasaient `.env.local`. Selon que le sourçage passait ou non, le
serveur démarrait **sans nuancier chargé et sans clé de stockage** — d'où des
tests de référence et de photo qui échouaient sans que ni le produit ni la
machine n'y soient pour rien.

C'était une faute de mon harnais, pas de l'infrastructure. Elle est corrigée :
la configuration de lancement ne source plus rien et `.env.local` fait seul foi.

---

## 3. Recette de la migration

Conteneurs Postgres nus et jetables, préfixe `colorspilot-`, aucun nom, port ou
volume partagé avec une autre conversation.

| Contrôle | Résultat |
|---|---|
| **Fresh** — 279 migrations sur base nue | empreinte **1 031 lignes** |
| **Upgrade** — 278 du train, puis la seule 281 | empreinte **1 031 lignes** |
| **Comparaison Fresh ↔ Upgrade** | **aucun écart** |
| **Idempotence** — rejeu de la 281 | sans erreur, **schéma inchangé** |
| **Non-vacuité** — suite V1.5 sans la migration | **1 verte / 9 rouges**, arrêt sur « colors_seaux.finition does not exist » |

L'empreinte compare colonnes, contraintes, index, politiques RLS, droits de
table, signatures et volatilité des fonctions, et droits d'exécution.

### pgTAP — les sept suites Colors, sur le Fresh

| Suite | Vertes | Rouges |
|---|---|---|
| `colors_functional_core_v1` | 46 | 0 |
| `colors_integrity_v11` | 41 | 0 |
| `colors_correctifs_v12` | 28 | 0 |
| `colors_nettoyages_v13` | 46 | 0 |
| `colors_activity_history_v14` | 47 | 0 |
| `colors_canonical_integration_v1` | 8 | 0 |
| **`colors_finition_reference_nuancier_v15`** | **57** | **0** |
| **Total** | **273** | **0** |

`colors_canonical_integration_v1` comporte une inclusion relative
(`\ir fixtures/…`) et exige d'être jouée depuis son répertoire : lancée par
redirection d'entrée elle rendait 0 assertion. Rejouée correctement, 8 vertes.

### Deux assertions fausses, trouvées et corrigées

Au premier passage, deux assertions de **ma** suite ont échoué — pas la
migration :

- l'une s'exécutait avant la création du seau qu'elle visait et ne touchait
  aucune ligne : elle était **vacante** ;
- l'autre supposait une politique `UPDATE` sur `colors_seaux`. **Il n'en existe
  aucune** — la V1.1 l'a supprimée. C'est plus fort qu'une politique
  restrictive : PostgREST ne peut pas mettre à jour la table, quelle que soit
  l'habilitation, et seules les RPC `security definer` y parviennent.

---

## 4. Sécurité multi-entreprise — démontrée

La suite V1.5 n'est pas déclarative : elle **exerce** les deux RPC sous quatre
identités réelles, avec `set local role authenticated` et un `sub` de JWT.

| Situation | Résultat |
|---|---|
| Administratrice de l'organisation | écrit finition et référence, journalise |
| Rôle de consultation | **`Accès Colors refusé`**, aucune mutation |
| Administratrice d'une **autre** organisation | **refusée**, et le seau **n'est même pas visible** |
| Membre de l'organisation **sans habilitation individuelle** | **refusé** — le second verrou |
| Seau inexistant | refusé **comme un accès refusé**, sans révéler l'inexistence |

Droits relevés sur le schéma final : `colors_seaux` n'accorde que `SELECT` et
`INSERT` au rôle applicatif, `colors_mouvements` que `SELECT`,
`colors_nettoyages_photos` aucun droit et aucune politique. La migration n'a
réintroduit aucune voie d'écriture.

---

## 5. Lecture d'étiquette — fermée, jusqu'au build

| Exigence | Preuve |
|---|---|
| Sans `COLORS_OCR_ACTIF=oui`, aucun OCR | test unitaire, quatre issues de `decisionOcr` |
| Sans prestataire déclaré, aucun OCR | test unitaire |
| Registre vide → refus explicite | registre gelé, `Object.isFrozen`, aucune configuration ne l'active |
| Aucune image envoyée implicitement | test d'ordre : `etatOcrColors()` précède `request.formData()` dans la route |
| Aucune réponse appliquée automatiquement | `analyserEtiquetteColors` impose `a_confirmer` quoi que renvoie le prestataire |
| Confirmation humaine champ par champ | un champ non coché n'est pas écrit |
| Journaux expurgés | valeurs métier retirées avant écriture |
| **Un build Production ne peut pas activer un prestataire fictif** | **la garde de pré-build interrompt le build** ; la liste de la garde et le registre applicatif sont comparés par un test |

Aucun prestataire n'a été sélectionné ni ajouté.

---

## 6. Recette authentifiée — pourquoi elle n'est toujours pas concluante

Une pile Supabase **dédiée** reste montée : projet `colors-pilot-e2e`, ports
61321/61322, sept conteneurs, aucun nom ni port partagé. Les 279 migrations s'y
appliquent, sept identités en `@recette.invalid` — TLD réservé par la RFC 2606,
aucune ne peut correspondre à une adresse réelle. Le jeu de recette est
rejouable, transactionnel, borné aux deux organisations de recette, et il ne
contient **aucun compte hors recette** (vérifié : 7 de recette, 0 autre).

### La fenêtre exigée ne s'est pas ouverte

Dix critères, six relevés consécutifs à 60 secondes. **Trois campagnes de
surveillance, 41 relevés, `stable=0` sur toute la durée.**

| Critère | État observé |
|---|---|
| Aucun build concurrent | conforme après correction du critère (ci-dessous) |
| Aucune autre suite Playwright | conforme |
| `load1 < 12` | **jamais atteint** — 13 à 33 en continu |
| DNS Docker fonctionnel | conforme |
| GoTrue 200 | conforme |
| Authentification < 1 s | **pics à 4 568 ms, 8 565 ms, 10 008 ms** |
| PostgREST 200 | **retours `000` intermittents** |
| Storage sain | **retours `000` intermittents** |
| Application 200 | conforme |
| SHA et worktree inchangés | conforme |

### Un critère mal spécifié, de ma main, corrigé

Mon détecteur de « build concurrent » comptait trois processus. Mesuré : ce sont
des **boucles de surveillance dont l'enfant courant est un `sleep`**, à **0,0 %
de CPU** depuis plus de huit heures. Les compter comme des builds rendait la
fenêtre inatteignable pour une raison qui n'existe pas. Le critère ne retient
désormais que les builds consommant réellement du processeur — ce n'est pas un
assouplissement, c'est la mesure de ce que le critère voulait dire.

### D'où vient réellement la charge

`com.apple.Virtualization.VirtualMachine` — la machine virtuelle de Docker —
consomme **925 % de CPU**. Attribution par pile :

| Pile | CPU conteneurs |
|---|---|
| `elsatia-capacity-r2-dbtest` | **127,4 %** |
| `btp-platform` | **117,2 %** |
| `elsatia-reserves-v4-dbtest` | **116,2 %** |
| `elsatia-gp-contracts-snapshot-int-dbtest` | 68,8 % |
| `elsatia-gp-client-snapshot-dbtest` | 22,0 % |
| **`colors-pilot-e2e` (celle de cette mission)** | **11,4 %** |

Conteneurs `analytics` et `realtime` de cinq piles laissées en fonctionnement par
d'autres lots. **Aucun ne m'appartient et je n'en ai arrêté aucun.** Ma pile a
`analytics` et `realtime` désactivés et pèse onze pour cent. Tant que ces cinq
piles tournent, `load1` ne descendra pas sous 12.

### Ce que l'environnement fait aux mesures

Même requête, même code, à dix minutes d'intervalle :

| Fiche d'un seau | Taille servie | Formulaires |
|---|---|---|
| Moment défavorable | **10 870 octets** | **0** |
| Moment favorable | **43 518 octets** | **8** |

Le journal du serveur explique : `Sélecteur d'applications indisponible`,
`Vérification d'accès indisponible`, `Impossible de charger les emplacements
Colors`. Les RPC échouent par intermittence et la page se rend partiellement.

Une recette exécutée là-dessus ne mesurerait pas le produit. **Playwright n'a
donc pas été relancé**, conformément à la consigne.

## 6 ter. Ce qui a pu être vérifié malgré tout, en HTTP direct

Hors Playwright, sur l'application et la pile réelles. Requêtes légères, donc peu
exposées aux défaillances ci-dessus. **34 vérifications, 0 échec :**

| Domaine | Vérifications |
|---|---|
| Connexion des sept identités | 4 rôles + refus sans habilitation individuelle + autre entreprise + double appartenance |
| Cloisonnement inter-entreprises | seau de B **404** depuis A ; export de A sans rien de B ; export de B sans rien de A |
| Habilitations par rôle | consultation ne peut ni ajouter ni modifier ; opérateur en lecture seule et sans gestion d'emplacements ; gestionnaire gère les emplacements mais pas les paramètres |
| Destination mémorisée | `/login?next=%2Finventaire%2F…` |
| Session terminée | `/login?next=%2Fdepots&error=session-expiree` |
| Lecture d'étiquette fermée | `409` + `code: desactive` ; écran « inactive » ; aucun bouton d'analyse |
| Séparation RAL/fabricant | nature affichée, zéro bouton « Retenir », explication, colonne `Référentiel`, `"TEST-BLANC";"Fabricant"`, zéro ligne présentée comme RAL |
| Aucun secret servi | 4 pages authentifiées, zéro occurrence |

**Transparence** : un réessai est appliqué **uniquement** sur
`service-indisponible`, la panne technique que le code sait désormais distinguer
d'un refus d'habilitation. Un refus d'habilitation n'est jamais réessayé. Ces
vérifications **ne remplacent pas** la recette Playwright exigée pour un
`GO PILOTE`, où `retries: 0` reste la règle.

**Les parcours métier lourds n'ont pas pu être vérifiés de façon concluante** :
trois passes du même script ont donné 12/9, 14/7 puis 12/9 — jeux différents à
code identique. La fiche d'un seau enchaîne cinq allers-retours ; c'est elle qui
tombe en premier.


## 7. Validation sur arbre figé — `6c4b4bf`

Chaque contrôle compté séparément ; aucune commande chaînée n'a empêché la
suivante de tourner. Worktree propre au moment de l'exécution.

| # | Contrôle | Résultat |
|---|---|---|
| 1 | Suite unitaire Colors | **427 verts** / 38 fichiers |
| 2 | Suite unitaire racine | **1 722 verts / 1 725** — 3 échecs, voir ci-dessous |
| 3 | Typecheck racine | propre |
| 4 | Typecheck Colors | propre |
| 5 | Lint racine | **0 erreur**, 4 avertissements préexistants |
| 6 | Lint Colors | propre |
| 7 | `verify-migrations` | **279 valides**, noms et horodatages uniques |
| 8 | `verify-secrets` | **1 756 fichiers, aucun secret** |
| 9 | `git diff --check` | propre |
| 10 | Build Colors | **réussi**, 27 routes |
| 11 | Build Gestion Pro | **réussi** |
| 12 | Fresh 279 | empreinte **1 031 lignes** |
| 13 | Upgrade 278 + 281 | empreinte **1 031 lignes** |
| 14 | Comparaison des schémas | **identiques** |
| 15 | Idempotence | rejouable, schéma inchangé |
| 16 | pgTAP complet Colors | **273 assertions, 0 rouge** (7 suites) |
| 17 | Non-vacuité | **1 verte / 9 rouges** sans la 281 |

**Les 3 échecs racine** sont tous dans `src/lib/xlsx.test.ts` (« Test timed out
in 5000ms »). Le fichier **passe en 2,15 s lancé seul**, et **le lot ne modifie
aucun fichier sous `src/`** (vérifié : 0). C'est la saturation.

**Une preuve inattendue** : le build Colors lancé sans variables a été **refusé
par la garde de pré-build**, qui a nommé les cinq variables manquantes. Elle fait
exactement ce pour quoi elle existe.


## 8. Candidat pilote — aucune dépendance Production

Aperçu **local** sur `http://127.0.0.1:3041`, servi par la pile dédiée.

| Vérification | Résultat |
|---|---|
| `/` | 307 → `/dashboard` |
| `/dashboard`, `/inventaire`, `/nuanciers`, `/parametres`, `/activite` | **307 → `/login`**, avec `next` conservé |
| `/api/export/inventaire` | **307 → `/login?next=…`** |
| `/api/ocr` en GET | 405 |
| Origine `supabase.co` dans le HTML servi | **aucune** |
| `colors.elsatia.fr` cité | **0 occurrence** |
| En-têtes de sécurité | **4 présents** |
| `noindex` servi | présent |

**Aucun domaine Production, aucune base Production, aucune migration
Production, aucune ouverture commerciale, aucune action Stripe.**

---

## 9. Conservation des photos et des données OCR

Aucune durée fixée : une durée de conservation est une décision juridique, pas
un réglage produit.

Livré sans arbitrage : inventaire des quatre catégories réellement stockées,
purge configurable par catégorie (quatre variables **serveur**), fail-closed
**dans le sens de la conservation** — sans consigne, rien n'est détruit —,
aucun effacement automatique, suppression manuelle tracée.

**Le point EXIF/GPS est désormais fermé** par la décision D2 : la photo stockée
est décodée, redressée et réencodée, et ne porte plus aucune métadonnée. Voir
§9 bis. L'inventaire du code a été mis à jour en conséquence, et un test exige
qu'il nomme explicitement ce qui a été retiré — pour qu'une régression du
nettoyage ne puisse pas passer inaperçue dans la fiche.

Cinq décisions restent à arbitrer avant commercialisation (C3 est tranchée) :
`docs/colors/ELSATIA_COLORS_CONSERVATION_DONNEES_V1.md`.

---

## 10. Conditions restantes

### Avant pilote

| # | Condition | État |
|---|---|---|
| **A1** | **Rejouer la recette Playwright des 35 parcours sur une machine capable de la servir.** | **Seule condition bloquante.** Elle ne dépend pas du code : `load1` ne descend pas sous 12 tant que cinq piles Supabase tierces consomment 460 % de CPU. Libérer ces piles — décision de leurs propriétaires — suffirait probablement. |
| A2 | Déployer cette branche | Ce qui est servi sur `colors.elsatia.fr` reste un build très antérieur : réinitialisation de mot de passe en 404, aucune en-tête de sécurité. |
| A3 | Vérifier les cinq variables publiques dans l'environnement cible | La garde de pré-build les exige et refuse le build à défaut — vérifié en phase F. |
| A4 | Annoncer aux participants la durée du pilote et le sort des données | Aucune règle de conservation n'est configurée ; rien n'est détruit par défaut. |
| A5 | Fournir un nuancier sous licence, ou assumer l'absence de proposition | Le format attend `referentiel: "ral" \| "fabricant"`. Sans déclaration, il vaut `fabricant` et rien ne peut être retenu sur une fiche. |
| ~~A6~~ | ~~Arbitrer l'élargissement de `ral_approxime`~~ | **Tranchée (D1) : pas d'élargissement.** Un modèle neutre est proposé sans numéro. |

### Avant commercialisation

- **Appliquer le modèle neutre des références fabricants**, sans quoi une
  organisation qui charge le nuancier de son fournisseur ne peut retenir aucune
  référence sur ses fiches.
- **Parcours d'invitation** — aucune table, aucune route, aucun courriel dans le
  dépôt.
- **Durées de conservation et purge** : obligation, pas confort.
- Écrans Catalogues, Imports, Utilisateurs : encore des annonces « bientôt
  disponible ».
- Suppression d'une photo à l'unité depuis l'interface.
- Lot ELSATIA-UI-V2.

### Ce qu'il faudrait pour lever A1

1. Arrêter ou mettre en veille les piles `elsatia-capacity-r2-dbtest`,
   `btp-platform`, `elsatia-reserves-v4-dbtest`,
   `elsatia-gp-contracts-snapshot-int-dbtest` et
   `elsatia-gp-client-snapshot-dbtest` — **elles ne m'appartiennent pas**, et
   c'est la seule action qui débloquerait la charge.
2. Relancer la surveillance :
   `/Volumes/ELSATIA-DEV/ELSATIA-STACKS/colors-pilot-e2e/fenetre.sh`
3. Dès la fenêtre confirmée, remettre les fixtures à zéro puis lancer les quatre
   profils :
   ```
   docker exec -i -e MDP_RECETTE="…" supabase_db_colors-pilot-e2e \
     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
     < tests/e2e/fixtures/colors-pilote.sql
   E2E_BASE_URL=http://127.0.0.1:3041 MDP_RECETTE="…" \
     npx playwright test --grep "@colors-auth" --reporter=list
   ```
   `retries: 0` et les délais de `playwright.config.ts` restent inchangés.

## 11. Déploiement ultérieur et retour arrière

### Déploiement

1. Fusionner `integration/colors-pilot-readiness-v1` dans le train, **après**
   arbitrage de A6.
2. Appliquer **une seule** migration : `20260909000281`. Elle est protégée par
   des gardes d'existence et se rejoue sans effet second.
3. Poser les variables : les cinq publiques,
   `SUPABASE_SERVICE_ROLE_KEY`, et si un nuancier est fourni,
   `COLORS_NUANCIER_FICHIER`. **Ne pas poser `COLORS_OCR_ACTIF`** — le build
   serait interrompu, aucun prestataire n'étant implémenté.
4. Le `prebuild` refuse un build publié auquel il manque une variable.

### Retour arrière

| Étage | Procédure |
|---|---|
| **Application** | Revenir à la version Vercel précédente. Immédiat. |
| **Schéma** | La migration n'est **pas destructrice** : elle ajoute une colonne avec un défaut, un index, et remplace trois fonctions. Un retour applicatif seul est sûr — le code antérieur ignore simplement `finition`. |
| **Annulation du schéma** | Si elle est exigée : `drop index colors_seaux_finition_idx`, `alter table colors_seaux drop column finition`, et restaurer les corps V1.4 de `colors_diff_seau` et `colors_valider_mouvement` depuis `20260908000271`. **Cette annulation détruit les finitions déclarées** — elle n'est pas recommandée, le retour applicatif suffit. |
| **Nuancier** | C'est un fichier. Le retirer revient à l'état sans correspondance, sans toucher aux données. |
| **Nettoyage des photos** | Purement applicatif : un retour de version rétablit l'ancien comportement. Les photos déjà nettoyées le restent — le nettoyage est irréversible par construction, et c'est voulu. |
| **Références fabricants** | Rien à annuler : le modèle neutre n'est pas appliqué. |

---

## 12. Interdictions respectées

Aucune fusion dans le Train V3, `main` ou une branche Production. Aucun
déploiement. Aucune action Stripe. Aucun `git clean`, reset destructif, rebase,
amend ni force-push.

**Aucune migration existante modifiée** : la `20260909000281` est celle du lot
précédent, inchangée, et le ledger reste à 279. Le modèle neutre des références
fabricants est proposé **sans numéro**.

**Aucun processus d'une autre conversation arrêté.** Les cinq piles Supabase qui
saturent la machine — et qui sont la cause du verdict — ont été identifiées,
mesurées et **laissées intactes**. Seuls mes propres conteneurs de recette
migrations ont été libérés après usage.

**Aucune donnée RAL inventée.** Le nuancier de recette ne contient aucune
référence au format RAL : associer un code RAL à une valeur sRGB approchée
reviendrait à fabriquer une donnée normative. Le format RAL est éprouvé en
pgTAP, sur une chaîne nue, sans couleur associée.

Aucun prix, aucun prestataire OCR et aucune règle juridique inventés. Aucun
secret dans les sorties, les rapports ou les commits — le mot de passe de
recette est généré hors dépôt et transmis par variable d'environnement.
