# ELSATIA Colors — clôture technique et intégration au Train V3

**Verdict : GO PILOTE SOUS CONDITIONS.**

La migration est intégrée et prouvée. Le cloisonnement multi-entreprise est
démontré, RPC par RPC, sous quatre identités réelles. L'OCR est démontré fermé,
jusqu'au refus de build. Ce qui manque n'est pas un correctif : c'est **une
machine capable de servir la recette navigateur**. Aucune des quatre passes
authentifiées n'a été verte, et le jeu de tests qui passe change à chaque passe
à code identique. Détail en §6.

---

## 1. Identification

| | |
|---|---|
| Dépôt | `git@github.com:julien-gregurec/Appli_BTP.git` |
| Branche | `integration/colors-pilot-readiness-v1` |
| Train V3 de départ | `59e960a0e6648a472bedff0d8b71d47caa6e56ac` |
| SHA métier du train, vérifié ancêtre | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` |
| Lot Colors intégré | `38d871c9ea3b0745a568fb136cf9f9c8c2cf0733` |
| SHA final | `9eaeeb84370489572e76535ddcf6f5ac8fb93174` |
| Commits | 14 |
| Fichiers modifiés | 71 |
| Migration créée | **`20260909000281_colors_finition_reference_nuancier_v15.sql`** |
| Ledger | 278 → **279** |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/colors-pilot-readiness-v1` |

Le train n'avait pas bougé depuis le lot Colors : la fusion s'est faite sans
conflit, sur base commune identique, sans qu'aucun apport du train soit arbitré.

### Périmètre — preuve d'absence d'embarquement parasite

| Racine | Fichiers |
|---|---|
| `apps/colors/` | 61 |
| `tests/e2e/` | 4 |
| `docs/` | 4 |
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

## 6. Recette authentifiée — ce qui n'a pas pu être mesuré

Une pile Supabase **dédiée** a été montée : projet `colors-pilot-e2e`, ports
61321/61322, sept conteneurs, aucun nom ni port partagé. Les 279 migrations s'y
sont appliquées. Sept identités en `@recette.invalid` — TLD réservé par la
RFC 2606, aucune ne peut correspondre à une adresse réelle. Authentification
réelle obtenue.

**Quatre passes complètes du même code :**

| Passe | Verts | Rouges | Durée |
|---|---|---|---|
| 1 | 16 | 17 | 6,3 min |
| 2 | 13 | 20 | 6,7 min |
| 3 | 17 | 16 | 10,7 min |
| 4 | 15 | 18 | **13,0 min** |

**Le jeu de tests qui passe change à chaque passe, à code identique.** Aucune
passe n'est verte, aucune n'est rouge de la même façon.

### Ce qui a été mesuré sur l'infrastructure

| Mesure | Valeur |
|---|---|
| Requêtes `/token` | 79 |
| HTTP 504 | **15** |
| Durée maximale d'une connexion | **41 574 ms** |
| Requêtes > 1 s | 25 sur 79 |
| `hostname resolving error` / `i/o timeout` | **69** |
| Refus de quota (429) | **0** |

`lookup supabase_db_colors-pilot-e2e on 127.0.0.11:53: dial udp: i/o timeout` :
le DNS interne de Docker expire. Trois `next build` d'une autre conversation ont
tourné en continu pendant toute la mission ; une surveillance de soixante
minutes a conclu **« aucune fenêtre »** (charge sous 12 et aucun build
concurrent, six mesures consécutives).

**Aucun délai global n'a été augmenté et aucun retry n'a été ajouté.** Une
connexion à 41 secondes n'est pas une caractéristique du produit.

### Trois défauts trouvés malgré tout, dont un dans le produit

1. **Défaut produit — corrigé.** Sous panne d'authentification, Colors annonçait
   « Identifiants incorrects ». GoTrue répondait 504 et `connexionAction`
   renvoyait le même code que pour un mot de passe faux. Quelqu'un qui lit cela
   pendant une indisponibilité change son mot de passe pour rien, et le support
   cherche du côté du compte au lieu du service. Les erreurs 5xx et injoignables
   ont désormais leur propre message, qui disculpe explicitement l'utilisateur.
2. **Fixtures non réinitialisées.** Une finition déjà déclarée par la passe
   précédente faisait échouer une assertion sur l'état initial — ce qui prouvait
   au passage que la migration fonctionne de bout en bout. Le jeu est désormais
   rejouable, transactionnel, borné aux deux organisations de recette.
3. **Mauvais budget d'attente.** `toHaveURL` applique le budget des assertions
   du DOM (10 s) à des **navigations** : il interroge l'URL courante, qui reste
   celle du départ tant que le nouveau document n'est pas validé. Un rendu
   serveur de plus de dix secondes faisait donc échouer des connexions qui
   avaient abouti. Remplacé par `waitForURL`, qui applique le budget de
   navigation. **Appliquer le bon budget au bon type d'attente n'est pas gonfler
   un délai.**

Une réutilisation de session par instantané de cookies a été écartée après
mesure : Supabase fait tourner le jeton de rafraîchissement au premier passage
du proxy, l'instantané n'est valable qu'une fois, et le réutiliser produisait de
faux refus d'habilitation.

---

## 7. Validation sur arbre figé — `9eaeeb8`

Chaque suite comptée séparément, aucune commande chaînée n'ayant empêché la
suivante de tourner.

| # | Contrôle | Résultat |
|---|---|---|
| 1 | Suite unitaire Colors | **382 verts** / 36 fichiers |
| 2 | Suite unitaire racine | **1 722 verts / 1 725** — 3 échecs, voir ci-dessous |
| 3 | Typecheck racine | propre |
| 4 | Typecheck Colors | propre |
| 5 | Lint racine | **0 erreur**, 4 avertissements préexistants |
| 6 | Lint Colors | propre |
| 7 | `verify-migrations` | **279 migrations valides**, noms et horodatages uniques |
| 8 | `verify-secrets` | **1 750 fichiers, aucun secret** (1 exception nommée) |
| 9 | `git diff --check` | propre |
| 10 | Build Gestion Pro | **réussi** |
| 11 | Build Colors | **réussi**, 27 routes |
| 12 | Fresh | 279 migrations, 1 031 lignes |
| 13 | Upgrade | 278 + 1, 1 031 lignes, **identique au Fresh** |
| 14 | Idempotence | rejouable, schéma inchangé |
| 15 | pgTAP Colors | **273 assertions, 0 rouge** |
| 16 | Non-vacuité | 1 verte / 9 rouges sans la migration |

**Les 3 échecs racine** sont tous dans `src/lib/xlsx.test.ts`, avec
« Test timed out in 5000ms ». Le même fichier **passe en 878 ms lancé seul**, et
**le lot ne modifie aucun fichier sous `src/`**. C'est la saturation, pas une
régression.

Les 4 avertissements de lint racine portent sur `src/app/(app)/boutique/…`,
`src/components/SignatureEmploye.tsx` et `tests/e2e/reserves-v4-offline-mobile.spec.ts` :
aucun ne vient de ce lot.

---

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

**Un constat qu'il aurait été malhonnête de taire :** `/api/photos` téléverse
les octets du fichier tels quels. La photo conserve donc ses métadonnées EXIF,
**coordonnées GPS comprises**. Sur un chantier, c'est l'adresse d'un client.

Six décisions à arbitrer avant commercialisation :
`docs/colors/ELSATIA_COLORS_CONSERVATION_DONNEES_V1.md`.

---

## 10. Conditions restantes

### Avant pilote

| # | Condition |
|---|---|
| **A1** | **Rejouer la recette authentifiée sur une machine non saturée.** C'est la seule condition qui empêche un `GO PILOTE` franc : 33 parcours écrits, aucun passage vert complet obtenu ici. |
| A2 | Déployer cette branche. Ce qui est servi sur `colors.elsatia.fr` est un build très antérieur : réinitialisation de mot de passe en 404 et aucune en-tête de sécurité. |
| A3 | Vérifier les cinq variables publiques dans l'environnement cible. |
| A4 | Annoncer aux participants la durée du pilote et le sort des données. |
| A5 | Fournir un nuancier sous licence, ou assumer l'absence de proposition. |
| A6 | Arbitrer l'élargissement de `ral_approxime` aux référentiels non-RAL, ou assumer que seules les références RAL sont confirmables. |

### Avant commercialisation

- Parcours d'invitation — **aucune table, aucune route, aucun courriel** dans le dépôt.
- Durées de conservation et purge : obligation, pas confort.
- Écrans Catalogues, Imports, Utilisateurs : encore des annonces « bientôt disponible ».
- Suppression d'une photo à l'unité depuis l'interface.
- Sort des métadonnées EXIF (point C3).
- Lot ELSATIA-UI-V2.

---

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

---

## 12. Interdictions respectées

Aucune fusion dans le Train V3, `main` ou une branche Production. Aucun
déploiement. Aucune action Stripe. Aucun `git clean`, reset destructif, rebase,
amend ni force-push. Aucune migration canonique existante modifiée. Aucun
processus d'une autre conversation arrêté — les trois `next build` du worktree
Gestion Pro mobile ont tourné sans être touchés, et les six piles Supabase
préexistantes sont intactes. Aucune donnée RAL, aucun prix, aucun prestataire
OCR et aucune règle juridique inventés. Aucun secret dans les sorties, les
rapports ou les commits.
