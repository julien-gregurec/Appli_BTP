# ELSATIA-COLORS-CANONICAL-CODE-REBASE — rapport

Date : 2026-09-08
Lot : `ELSATIA-COLORS-CANONICAL-CODE-REBASE-V1`
Auteur de l'exécution : session autonome Claude Opus 5

---

## 1. Verdict

**Réussi.** Le code applicatif ELSATIA Colors V1.4 est désormais posé sur le
train écosystème sans qu'aucune migration n'ait été ajoutée, modifiée ni
dupliquée, et sans qu'aucune migration de l'ancienne base amputée n'ait été
réintroduite.

- Branche livrée : `integration/colors-code-on-ecosystem-ledger-v1`
- **SHA complet du lot** (le seul à reprendre) : `e9a6e6bc40d29e021f96c6395e0efce25f4b085a`
  — commit unique portant tout le code et toute la documentation d'architecture.
- Tête de branche poussée : ce commit, suivi du seul commit ajoutant le présent
  rapport. `git rev-parse origin/integration/colors-code-on-ecosystem-ledger-v1`
  en donne la valeur courante ; elle n'a aucune importance pour la reprise (§12).
- Base : `integration/elsatia-ledger-reconciliation-p0-v1` @ `4f1f17044a38beba3b09e6937b2f8f626a8d87e0`
- Migrations : **270 fichiers avant, 270 après** — delta nul, vérifié par
  `git diff 4f1f170 -- supabase/migrations` (0 ligne).
- Tests : 264 tests Colors, 1219 tests racine, 216 assertions pgTAP Colors, tous
  au vert. Build standalone Colors et build racine Gestion Pro : verts.

Aucune fusion n'a été faite, aucun déploiement n'a été déclenché, la production
n'a pas été touchée.

Réserves ouvertes, toutes documentées au §11 : le RAL reste un contrat non
branché, la `finition` n'existe pas au modèle, et la recette humaine
authentifiée de `/activite` n'a **pas** été exécutée — elle est préparée au §10.

---

## 2. Branches et SHA audités

| Référence | SHA | Date | Statut au regard du lot |
| --- | --- | --- | --- |
| `integration/elsatia-ledger-reconciliation-p0-v1` | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` | 07/09 23:30 | **base retenue** (canon intermédiaire imposé) |
| `feat/colors-product-activity-history-v1` | `74002c214be0bb15936d1c35b22995b1fe32c766` | 07/09 17:06 | **source du code** ; base amputée (229 migrations) |
| `fix/elsatia-colors-standalone-build-v1` (HEAD) | `3f20eaa1900103e8cab4f9d0f0ad3441fd43ee69` | 04/09 19:02 | déjà contenu dans `74002c2` — rien à reprendre |
| commit `f1cabc7…` (correctif standalone annoncé) | `f1cabc74126d5a56cf5ebde6f5dceace4138c61b` | 29/08 15:38 | **exclu** : orphelin, sur aucune branche, approche abandonnée (voir §5.4) |
| `feat/elsatia-canonical-final-r73-v1` (HEAD) | `e65fc05bcc0f7320c1c77585f2e73e6d8135a63e` | 02/09 18:21 | hors périmètre |
| commit `810912d…` (ancien lot annoncé) | `810912d0a041555957c95954f2a0750a3a96fe65` | 28/08 17:38 | **socle commun** de la lignée Colors ; sert de borne au calcul du delta |
| `a4c01ea…` (Colors dans le train) | `a4c01eaa31a7c1a12cbc20d7bc38bee2f16faaf2` | 27/08 19:51 | version du train, remplacée |
| `f427492…` (Colors 271 dans le train) | `f427492254538bed0800b0f2f3bbbbc7c2cedd9c` | 07/09 22:29 | a rapatrié 271 + 5 suites pgTAP, **sans** le code |

Branches Colors passées en revue et écartées comme déjà contenues dans
`74002c2` : `fix/colors-auth-callback-csp-p1-v2`, `fix/colors-safe-next-redirect-v1`,
`fix/colors-security-p1-closure-v1`, `fix/colors-precommercial-noindex-robots-v1`,
`fix/colors-supabase-public-key-predeploy-guard-v1`,
`feat/colors-multiapp-password-reset-v1`, `integration/colors-predeploy-final-v1`,
`integration/colors-precommercial-security-reset-v1`,
`feat/elsatia-colors-canonical-integration-v1`.

### Le fait central établi par l'audit

`74002c2` et `4f1f170` divergent depuis `fcdd4e7` (26/08). La lignée Colors porte
30 commits depuis ce point ; le train en porte 71. **La branche Colors ne contient
aucun fichier de migration absent du train**, et le train en contient **41** qui
manquent à la branche Colors. La fusion était donc structurellement interdite,
et le rapatriement par chemins était la seule voie correcte — c'est exactement le
diagnostic déjà posé par le message de `f427492`.

---

## 3. Matrice fonctionnelle

Légende : **T** = présent dans le train avant ce lot · **C** = présent seulement
dans la branche Colors · **D** = divergent · **O** = obsolète · **I** = intégré
par ce lot · **X** = exclu.

| Domaine | T | C | D | Décision | Fait constaté |
| --- | :-: | :-: | :-: | --- | --- |
| **produits** | partiel | ✔ | | **I** | `colors_seaux.produit` + `reference_produit` ; le train n'avait que la coquille d'écran |
| **seaux** | partiel | ✔ | | **I** | table complète (migration 246, déjà au train) ; CRUD réel apporté par le code |
| **marques** | | ✔ | | **I** | `colors_seaux.marque`, texte libre borné 120 car. ; filtre inventaire par marque |
| **fabricants** | | | | **X** | **inexistant au modèle** : seule la `marque` est portée. Aucune table fabricant, aucun référentiel |
| **teintes** | | ✔ | | **I** | `teinte_nom`, `teinte_reference`, `couleur_hex` (contrainte `^#[0-9A-F]{6}$`) |
| **RAL** | | ✔ | ✔ | **I (contrat seul)** | colonnes `ral_approxime`/`ral_distance`/`ral_confirme` au train ; `lib/ral.ts` calcule la distance Lab — **aucune palette, aucun appelant** : rien n'écrit ces colonnes (P1, §11) |
| **photos** | | ✔ | | **I** | `POST /api/photos`, bucket privé `colors-seaux`, contrôle de signature binaire (JPEG/PNG/WebP/HEIC/HEIF), 10 Mo, purge de l'ancienne photo + file de nettoyage |
| **OCR** | | ✔ | | **I** | `lib/ocr-colors.ts` : interface fournisseur, validation MIME, **aucun appel payant, aucune reconnaissance active** — annoncé comme tel à l'écran |
| **confirmation humaine OCR** | | ✔ | | **I** | statut forcé `a_confirmer` côté code ; RPC `colors_confirmer_analyse_ocr` / `colors_rejeter_analyse_ocr` côté base. Aucune écriture automatique |
| **dépôts** | | ✔ | | **I** | écran `/depots` fonctionnel (création, hiérarchie parent) |
| **emplacements** | | ✔ | | **I** | 8 types : dépôt, véhicule, chantier, atelier, zone, rack, étagère, autre |
| **quantités** | | ✔ | | **I** | 3 modes exclusifs : pourcentage, volume, poids — validés en base ET dans `lib/quantites.ts` |
| **litres** | | ✔ | | **I** | unités `l` / `ml` |
| **poids** | | ✔ | | **I** | unités `kg` / `g`, densité `densite_kg_l` disponible |
| **ouvert / fermé** | | ✔ | | **I** | états `ferme`, `ouvert`, `vide`, `archive` + `date_ouverture` ; RPC `colors_changer_etat` |
| **pourcentage restant** | | ✔ | | **I** | colonne générée `pourcentage_restant`, cohérente pour les trois modes |
| **entrées** | | ✔ | | **I** | type de mouvement `entree`, historisé à la création (`colors_historiser_creation_seau`) |
| **sorties** | | ✔ | | **I** | `sortie`, `consommation`, `retour_chantier` ; règles métier en base (une sortie doit réduire le stock) |
| **mouvements** | | ✔ | ✔ | **I** | journal append-only `colors_mouvements`, 13 types. **L'écran `/mouvements` est remplacé par `/activite`** ; l'URL est conservée en redirection |
| **inventaires** | partiel | ✔ | | **I** | `/inventaire` : recherche plein texte, filtres marque/emplacement/état/stock faible/sans photo, tri, corbeille ; `/inventaire/[id]` : fiche produit + historique immuable. **Pas de campagne d'inventaire tournant** (non demandé au jalon) |
| **statistiques** | | ✔ | | **I** | `colors_statistiques` : actifs, ouverts, stocks faibles (seuil paramétrable), vides — affichés au tableau de bord |
| **activité produit** | | ✔ | | **I** | `/activite` (V1.4) : timeline par jour, diff champ par champ, filtres période/famille/auteur/emplacement, pagination par curseur |
| **fiches techniques** | | | | **X** | **inexistant** : aucune colonne, aucune table, aucun écran. Contrat futur documenté (§9) |
| **FDS** | | | | **X** | **inexistant**, idem. Aucune mention à l'écran |
| **droits** | | ✔ | | **I** | 4 rôles Colors + admin plateforme global (lecture seule) ; matrice de 13 actions ; double contrôle code + `colors_action_autorisee` en base |
| **abonnement** | ✔ | ✔ | | **I** | `/abonnement-requis`, `/acces-refuse` ; décision `exigerAccesApplication` via `@elsatia/application-access` du train |
| **navigation** | partiel | ✔ | | **I** | 10 entrées, dont 4 explicitement `disponible: false` rendues en écran « Structure préparée » |
| **responsive** | | ✔ | | **I** | 3 points de rupture (1100 px, 760 px ×2) ; vérifié à 375×812 (capture §8) |
| **fonctionnement standalone** | | ✔ | ✔ | **I** | PostCSS isolé sans plugin, garde `verify-public-env` en `prebuild`, `next.config.ts` autonome. **L'approche Tailwind de `f1cabc7` est exclue** (§5.4) |
| suppressions apparentes de `apps/reserves`, `apps/tools` | | | | **X** | artefacts de la base amputée, **jamais appliqués** |
| historique de migrations de la branche Colors | | | | **X** | jamais importé |

---

## 4. Stratégie Git

### 4.1 Ce qui a été fait

```
git branch integration/colors-code-on-ecosystem-ledger-v1 4f1f170
git checkout 74002c2 -- apps/colors                       # 83 fichiers
git checkout 74002c2 -- <13 fichiers partagés listés ci-dessous>
```

Aucun `merge`, aucun `rebase`, aucun `cherry-pick` d'un commit de la lignée
amputée. La sélection de chemins est le seul mécanisme employé : elle rend
impossible l'entrée d'un fichier non explicitement nommé.

### 4.2 Comment le périmètre a été déterminé

Le delta `4f1f170..74002c2` est trompeur : il affiche 535 fichiers hors
`apps/colors`, dont l'immense majorité sont des **suppressions apparentes** de
`apps/reserves` et `apps/tools` — c'est-à-dire l'absence de ces applications sur
la base amputée, pas une intention du lot Colors.

Le périmètre réel a donc été calculé sur `810912d..74002c2`, c'est-à-dire la
lignée Colors depuis son socle commun. Hors `apps/colors` et hors migrations, il
ne contient que **13 fichiers**, tous repris :

| Fichier | Nature |
| --- | --- |
| `src/lib/auth-relais-colors.ts` + `.test.ts` | relais du lien de récupération Supabase vers Colors |
| `src/app/auth/confirm/page.tsx` + `page.test.ts` | bouton « Poursuivre sur ELSATIA Colors » |
| `scripts/security/colors-acl-preflight.mjs` | contrôle ACL Colors avant déploiement |
| `docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md` | doc |
| `docs/audits/ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1.md` | doc |
| `docs/colors/ELSATIA_COLORS_FUNCTIONAL_V1.md` | doc |
| `docs/exploitation/COLORS_PLAN_DEPLOIEMENT_PREDEPLOY_V1.md` | doc |
| `docs/securite/colors-en-tetes.md` | doc |
| `docs/securite/colors-integration-precommercial.md` | doc |
| `docs/securite/reset-password-multiapp.md` | doc |
| `supabase/tests/colors_canonical_integration_v1.test.sql` | suite pgTAP manquante au train |

`eslint.config.mjs` et `tsconfig.json` apparaissaient aussi dans ce delta : leurs
modifications sont **déjà présentes, en mieux, dans le train** (l'`eslint` du
train est un sur-ensemble ; l'`include` du tsconfig du train ne balaie plus
`apps/`, ce qui rend l'`exclude` de la branche Colors sans objet). Ils n'ont pas
été touchés. Même constat pour `vitest.config.ts`, `package.json`,
`.env.example`, `.claude/launch.json` et `packages/application-access` : le train
est en avance, la branche Colors ne les modifiait pas.

### 4.3 Ce qui a été vérifié avant d'écrire

- **Aucune perte** : l'ensemble des fichiers de `apps/colors` du train est un
  sous-ensemble strict de celui de la branche Colors (`comm -23` = vide).
  Remplacer l'arbre entier ne perd rien.
- **Compatibilité du paquet partagé** : tous les symboles importés par Colors
  depuis `@elsatia/application-access` (`ApplicationElsatiaAutorisee`,
  `CodeApplicationElsatia`, `RoleApplicationColors`, `estRoleColors`,
  `ROLE_ADMIN_PLATEFORME`, `ROLES_COLORS`, `creerControleAccesApplications`,
  `ClientAccesApplications`, `AccesApplicationRefuseError`,
  `CODES_APPLICATIONS_ELSATIA`) existent dans la version du train.
- **Aucune dépendance à Gestion Pro** : le code de `apps/colors` n'importe
  strictement rien d'autre que `@elsatia/application-access` et ses propres
  modules `@/…`. Aucune remontée vers `../../../src`, aucune occurrence de
  « gestion-pro ».

---

## 5. Traitement des migrations

### 5.1 Migration 271 préservée

```
train   4f1f170:supabase/migrations/20260908000271_colors_activity_history_v14.sql
        blob 6c08595fed9c57642ec7b014b09099705ecacb21
colors  74002c2:…même chemin…
        blob 6c08595fed9c57642ec7b014b09099705ecacb21
```

**Blobs identiques.** Aucune duplication n'était possible, et aucune n'a été
faite : le fichier n'est pas au commit. SHA-256 du fichier sur la branche
livrée : `38339cba9a1459bb7e49af319bde6bbd1a1e30264bc3ff4ebad96e5cf5144b3f`.

### 5.2 Comparaison blob à blob de toutes les migrations Colors

| Migration | Train | Branche Colors | Verdict |
| --- | --- | --- | --- |
| `20260828000246_colors_functional_core_v1` | `…` | `…` | **identique** |
| `20260828000247_colors_integrity_v11` | | | **identique** |
| `20260828000248_colors_correctifs_v12` | | | **identique** |
| `20260828000249_colors_security_cleanup_v13` | `ae2c935…` | `0d3ee38…` | **divergent — cosmétique** |
| `20260908000271_colors_activity_history_v14` | `6c08595…` | `6c08595…` | **identique** |

La divergence de 249 a été lue ligne à ligne : le train a supprimé six lignes
vides entre des blocs de commentaires. **Aucune instruction SQL ne diffère.** La
version du train reste l'unique version canonique, sans retouche.

### 5.3 Confirmation d'absence d'ajout

```
$ git diff 4f1f170 -- supabase/migrations | wc -l
0
$ ls supabase/migrations | wc -l
270
$ git show --stat HEAD | grep supabase/migrations
(vide)
```

Aucune des 41 migrations manquantes à la branche Colors n'a été « ramenée en
arrière », et aucun numéro n'a été alloué.

### 5.4 Exclusion motivée du commit `f1cabc7`

Le lot annonçait `f1cabc74126d5a56cf5ebde6f5dceace4138c61b` comme « correctif
build standalone ». L'audit établit qu'il ne doit **pas** être repris :

- il n'est atteignable depuis **aucune branche** du dépôt ;
- il n'est **pas** un ancêtre de `74002c2` ;
- son contenu — déclarer `tailwindcss` et `@tailwindcss/postcss` en
  devDependencies de `apps/colors` — a été **remplacé** par `2753f04`
  (« isolate standalone PostCSS configuration »), qui est, lui, dans la lignée
  retenue. `2753f04` pose un `apps/colors/postcss.config.mjs` sans aucun plugin,
  parce que **Colors n'utilise pas Tailwind** : vérifié, `globals.css` ne contient
  ni `@tailwind`, ni `@import "tailwindcss"`, ni `@apply` (310 lignes de CSS
  standard).

Reprendre `f1cabc7` aurait ajouté deux dépendances mortes et 689 lignes de
lockfile pour un besoin qui n'existe plus. Le build standalone est vert sans lui
(§7).

---

## 6. Corrections et garanties

| Exigence du lot | État | Preuve |
| --- | --- | --- |
| build standalone | ✅ | `npm run build` dans `apps/colors` : 26 routes, code 0 (§7) |
| routes Colors | ✅ | 26 routes construites, 13 vérifiées en HTTP, 0 lien mort |
| accès et permissions | ✅ | 4 rôles + admin plateforme, 13 actions ; double contrôle code/base ; 216 assertions pgTAP |
| aucune dépendance accidentelle à GP | ✅ | seul import externe : `@elsatia/application-access` |
| fonctionnement comme application autonome | ✅ | port 3010, PostCSS isolé, proxy et CSP propres, garde d'env dédiée |
| compte ELSATIA compatible | ✅ | même identifiant que les autres applications ; sessions cloisonnées par domaine (texte de `/login`) |
| OCR toujours soumis à confirmation humaine | ✅ | statut `a_confirmer` forcé côté code ; RPC de confirmation/rejet côté base ; aucun fournisseur actif |
| historique `/activite` | ✅ | écran complet ; 47 assertions pgTAP dédiées ; recette HTTP §8 |
| états vides | ✅ | `/activite`, `/inventaire`, `/depots` portent chacun un `empty-state` explicite |
| erreurs | ✅ | `not-found.tsx` (rendu à la requête pour respecter le nonce CSP) et `global-error.tsx` sans détail technique |
| responsive mobile | ✅ | 3 media queries ; rendu 375×812 vérifié |
| aucune fonction fictive | ✅ | 4 écrans non livrés affichent « Structure préparée / Aucune fonctionnalité métier n'est simulée dans ce jalon » |
| aucun texte annonçant Market | ✅ | `grep -i market apps/colors` : **aucune occurrence** |

Point de sécurité relevé au passage et déjà correct dans le code repris : la CSP
porte un nonce de 128 bits **régénéré à chaque requête** (vérifié : deux appels
successifs à `/login` renvoient deux nonces différents), l'indexation est fermée
(`X-Robots-Tag: noindex, nofollow` + `robots.txt` `Disallow: /`), et les
ressources publiques reçoivent une CSP distincte, sans nonce.

---

## 7. Tests exécutés

Tous les résultats ci-dessous ont été obtenus sur la branche livrée.

| Test | Commande | Résultat |
| --- | --- | --- |
| Tests Colors | `npm test` dans `apps/colors` | **27 fichiers, 264 tests — 0 échec** |
| Tests racine (GP + paquets) | `npx vitest run` | **117 fichiers, 1219 tests — 0 échec** |
| pgTAP `colors_functional_core_v1` | psql sur base au ledger 272 | **46 assertions — 0 échec** |
| pgTAP `colors_integrity_v11` | idem | **41 — 0 échec** |
| pgTAP `colors_correctifs_v12` | idem | **28 — 0 échec** |
| pgTAP `colors_nettoyages_v13` | idem | **46 — 0 échec** |
| pgTAP `colors_canonical_integration_v1` | idem | **8 — 0 échec** |
| pgTAP `colors_activity_history_v14` (activité) | idem | **47 — 0 échec** |
| TypeScript Colors | `npm run typecheck` | **0 erreur** |
| TypeScript racine | `npx tsc --noEmit` | **0 erreur** |
| Lint Colors | `npm run lint` | **0 problème** |
| Lint racine | `npx eslint .` | **0 erreur**, 3 avertissements `no-img-element` préexistants dans Gestion Pro (`boutique`, `SignatureEmploye`), aucun dans Colors |
| Build standalone Colors | `npm run build` | **succès — 26 routes** |
| Build racine Gestion Pro | `npx next build` | **succès** |
| `git diff --check` | working tree + index | **propre** |

**Méthode pgTAP.** Les six suites sont encadrées par `begin; … rollback;` : elles
sont strictement non destructives. Elles ont été jouées sur la base jetable
`elsatia-ledger-p0-dbtest`, qui porte **exactement les 270 migrations du train**
(`max(version) = 20260908000272`) — c'est-à-dire le schéma que vise cette
branche, puisqu'elle n'en ajoute aucune. Absence d'effet vérifiée après coup
(`select count(*) from colors_seaux` → 0). Le répertoire temporaire copié dans le
conteneur pour résoudre l'`\ir` de la fixture partagée a été supprimé.

**Non exécuté, et pourquoi.** Le build `apps/tools` (second membre du script
`build` racine) n'a pas été joué : ce lot ne touche aucun fichier de `apps/tools`,
et ses dépendances ne sont pas installées dans ce worktree. Les tests e2e
Playwright n'ont pas été joués non plus : ils exigent une pile Supabase
authentifiée dédiée, indisponible sans déstabiliser les travaux parallèles en
cours sur la machine (57 conteneurs actifs, mémoire saturée pendant une partie de
la session).

---

## 8. Recette automatisée de `/activite`

Deux niveaux, tous deux exécutés.

### 8.1 Contrat serveur — `supabase/tests/colors_activity_history_v14.test.sql`

47 assertions, 0 échec. Couvre : ajout et historisation, tri par date d'ajout,
modification champ par champ avec diff avant/après, corbeille (archivage) et
restauration, filtres par période / famille / auteur / emplacement, restitution
de l'auteur nommé, **cloisonnement multi-organisation**, pagination par curseur,
refus d'écriture directe dans le journal, refus de réécriture, refus de lecture
par `service_role`.

### 8.2 Contrat HTTP — build standalone servi sur le port 3010

| Contrôle | Résultat |
| --- | --- |
| `/activite` sans session | **307 → `/login`** |
| 12 autres routes protégées sans session | **307 → `/login`** (toutes) |
| `/` sans session | 307 → `/dashboard` puis `/login` |
| `/api/acces`, `/api/export/inventaire`, `POST /api/photos` sans session | **307** (aucune fuite) |
| Liens internes du code (8 cibles distinctes) | **0 lien mort** |
| `/mouvements` | **redirige vers `/activite`** (URL historique conservée) |
| 404 sur une adresse inconnue | **404**, page Colors dédiée |
| En-têtes de sécurité sur `/login` | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP, CORP, `Permissions-Policy`, `X-Robots-Tag: noindex, nofollow` |
| CSP | présente, nonce **différent à chaque requête** (vérifié sur deux appels) |
| `robots.txt` | `User-Agent: * / Disallow: /` |
| Rendu `/login` desktop et mobile 375×812 | conforme, aucune coupure |
| Erreurs console après purge du cache | **aucune**, hors le point §11-P2-a |

Le parcours **authentifié** de `/activite` (filtres cliqués, diff affiché,
pagination) n'a pas été exécuté : il exige une pile Supabase avec des données
Colors réelles, que je n'ai pas créée pour ne pas écrire dans une base partagée
avec d'autres travaux en cours. Il constitue le cœur de la recette humaine ci-dessous.

---

## 9. Contrats futurs préparés (documentation seule, aucun code)

Deux documents ont été ajoutés. Ni l'un ni l'autre n'introduit de table, de
colonne, de route, de migration ou de libellé d'écran.

- **`docs/architecture/ELSATIA_COLORS_MARKET_EXPORT_CONTRACT_V1.md`** — données
  exportables (marque, référence, produit, teinte, finition, quantité, état,
  photos, clé d'idempotence, provenance), forme JSON indicative, et surtout trois
  réserves explicites : `finition` n'existe pas au modèle, le RAL n'est jamais
  alimenté, les photos sont dans un bucket privé et ne doivent jamais produire
  d'URL publique. La clé d'idempotence proposée
  (`colors:<entreprise>:<seau>:<updated_at>`) est **dérivable sans écriture**,
  donc sans migration.
- **`docs/architecture/ELSATIA_COLORS_BIBLIOTHEQUE_TECHNIQUE_CONTRACT_V1.md`** —
  fiches techniques et FDS. Principe non négociable : **aucune dépendance dure**
  — pas de clé étrangère, pas de requête synchrone au rendu, référence molle
  `marque` + `reference_produit`, résolveur détenu par la Bibliothèque. Un seau
  sans FT ni FDS reste un seau valide.

---

## 10. Recette humaine — **à exécuter par Julien, non exécutée**

Préparation requise : une pile Supabase au ledger 272, une organisation avec le
droit `colors` actif, un compte avec l'habilitation `colors_admin_organisation`,
un second compte `colors_consultation`, un troisième compte sur une **autre**
organisation.

> **Avant de commencer** : dans le navigateur, vider les service workers et les
> caches du domaine servant Colors. Plusieurs applications ELSATIA ont partagé le
> port 3010 en local ; un service worker résiduel sert l'ancienne coquille et
> donne une page sans style. Voir §11-P2-a.

| # | Geste | Attendu |
| --- | --- | --- |
| 1 | Se connecter avec le compte administrateur d'organisation | tableau de bord, 4 compteurs, aucune erreur |
| 2 | Créer un dépôt puis un rack rattaché à ce dépôt | les deux apparaissent, le rack affiche son parent |
| 3 | Créer un seau en mode **volume** (15 l, reste 9,5 l) | pourcentage restant calculé à 63,33 % |
| 4 | Créer un seau en mode **poids**, puis un en mode **pourcentage** | les trois cohabitent ; les unités incohérentes sont refusées avec un message clair |
| 5 | Ouvrir la fiche d'un seau, ajouter une photo (JPEG > 1 Mo) | photo affichée ; refuser un `.pdf` renommé `.jpg` doit échouer proprement |
| 6 | Ajuster la quantité **sans motif** en type « ajustement » | refusé, message métier explicite |
| 7 | Ajuster avec motif, puis déplacer le seau vers le rack | deux événements distincts apparaissent |
| 8 | Ouvrir puis refermer le seau | états `ouvert` / `fermé` reflétés dans la liste |
| 9 | Passer un seau à vide | état `vide`, compteur « Seaux vides » incrémenté |
| 10 | Modifier la marque **et** la teinte en une fois | `/activite` montre **deux lignes de diff**, ancienne → nouvelle valeur |
| 11 | Archiver le seau (corbeille), puis le restaurer | deux événements ; le seau réapparaît dans son état d'avant archivage |
| 12 | `/activite` : filtrer par période « Aujourd'hui » | seuls les événements du jour, depuis 00 h 00 locale |
| 13 | `/activite` : filtrer par famille « Mouvements de stock » | ni les ajouts, ni les modifications |
| 14 | `/activite` : filtrer par utilisateur, puis par emplacement | filtres cumulatifs, cohérents |
| 15 | Générer plus de 40 événements, puis « Charger les événements plus anciens » | pagination sans doublon ni trou ; « Revenir aux événements les plus récents » fonctionne |
| 16 | Exporter l'inventaire en CSV, ouvrir dans un tableur | accents corrects (BOM), aucune cellule interprétée comme formule |
| 17 | Se reconnecter avec le compte `colors_consultation` | aucun bouton de mutation ; export toujours possible |
| 18 | Avec ce compte, appeler directement une URL de fiche puis tenter une action | refus côté serveur, pas seulement masquage |
| 19 | Se connecter avec le compte de l'**autre** organisation | **aucune donnée** de la première organisation, nulle part |
| 20 | Demander une réinitialisation de mot de passe depuis Colors | e-mail reçu ; le lien mène à l'écran ELSATIA avec le bouton « Poursuivre sur ELSATIA Colors » ; le nouveau mot de passe ouvre bien les deux applications |
| 21 | Refaire les étapes 1, 3, 10, 12 et 15 **sur téléphone** | timeline lisible, filtres accessibles, aucun débordement horizontal |
| 22 | Ouvrir `/nuanciers`, `/catalogues`, `/imports`, `/utilisateurs` | écran « Structure préparée », aucune fonctionnalité simulée |
| 23 | Chercher le mot « Market » dans toute l'application | **aucune occurrence** |

---

## 11. Réserves — P0 / P1 / P2

### P0 — aucun

Aucun élément bloquant n'a été relevé sur le périmètre de ce lot.

### P1

- **P1-a — RAL non alimenté.** `colors_seaux.ral_approxime`, `ral_distance` et
  `ral_confirme` existent et sont correctement contraints ; `lib/ral.ts` fournit
  la conversion Lab et la recherche du plus proche. Mais **aucune palette de
  référence n'est embarquée et aucun écran n'appelle la fonction** : les colonnes
  restent nulles en pratique. À trancher : livrer une palette RAL classique et
  brancher la suggestion (avec confirmation humaine, comme l'OCR), ou retirer la
  promesse de l'inventaire des fonctionnalités. Aucune migration nécessaire dans
  les deux cas.
- **P1-b — OCR non branché.** L'interface fournisseur, la validation et la
  confirmation humaine sont en place et testées, mais aucun fournisseur n'est
  connecté. C'est annoncé honnêtement à l'écran ; cela reste une fonctionnalité
  attendue non livrée.
- **P1-c — `finition` absente du modèle.** Bloquante pour un futur Market
  peinture, et elle exigera une migration. À planifier dans un lot Colors dédié,
  **pas** dans le train V2.
- **P1-d — recette authentifiée non exécutée.** Voir §10. Tant qu'elle n'est pas
  passée, la couverture visuelle de `/activite` repose sur les 47 assertions
  pgTAP et les 264 tests unitaires, pas sur un parcours réel.

### P2

- **P2-a — service worker résiduel en développement local.** Sur
  `http://localhost:3010`, un cache `elsatia-tools-v6` laissé par une exécution
  antérieure d'ELSATIA Tools servait l'ancienne coquille et rendait Colors sans
  style. Ce n'est **pas** un défaut du code livré (le serveur renvoie bien
  `text/css`, vérifié hors navigateur), mais un piège de recette : plusieurs
  applications ELSATIA partagent les ports locaux, alors qu'en Production chacune
  a son domaine. À consigner dans le mode opératoire de recette.
- **P2-b — enregistrement du service worker impossible à valider ici.**
  `/sw-colors.js` est servi correctement (200, `application/javascript`, CSP
  compatible), mais `navigator.serviceWorker.register` échoue systématiquement
  dans le navigateur intégré utilisé pour cette session. À vérifier dans un
  navigateur réel pendant la recette humaine.
- **P2-c — 3 avertissements lint préexistants** dans Gestion Pro
  (`no-img-element` sur `boutique/page.tsx`, `boutique/[produitId]/page.tsx`,
  `SignatureEmploye.tsx`). Hors périmètre de ce lot, signalés pour mémoire.
- **P2-d — divergence cosmétique de la migration 249.** Six lignes vides en
  moins côté train. Sans effet, mais les deux lignées ne se recolleront jamais à
  l'octet près sur ce fichier : c'est la version du train qui fait foi.

---

## 12. Instructions de reprise dans le futur train V2

Le lot tient en **un seul commit**, sans fusion et sans migration. Trois voies,
par ordre de préférence.

### Voie 1 — cherry-pick direct (recommandée)

```bash
git checkout <branche-du-train-v2>
git cherry-pick e9a6e6bc40d29e021f96c6395e0efce25f4b085a
```

Le commit ne touche **aucun** fichier de `supabase/migrations`. Il ne peut donc
pas entrer en conflit avec la renumérotation ou la réorganisation du train V2.

### Voie 2 — si le train V2 a fait évoluer `apps/colors` de son côté

Improbable, mais si un conflit survient, la règle est simple : **la version de ce
lot fait foi pour tout `apps/colors/**`**, car elle descend de la lignée
fonctionnelle V1.4 et l'arbre du train n'en est qu'un sous-ensemble ancien.

```bash
git cherry-pick -n e9a6e6b
git checkout --theirs apps/colors && git add apps/colors
# arbitrer à la main les 13 fichiers partagés listés au §4.2
```

### Voie 3 — reconstruction depuis les sources

Si l'histoire est réécrite et que le SHA disparaît, le lot est reproductible en
deux commandes depuis n'importe quelle base :

```bash
git checkout 74002c214be0bb15936d1c35b22995b1fe32c766 -- apps/colors
git checkout 74002c2 -- \
  src/lib/auth-relais-colors.ts src/lib/auth-relais-colors.test.ts \
  src/app/auth/confirm/page.tsx src/app/auth/confirm/page.test.ts \
  scripts/security/colors-acl-preflight.mjs \
  supabase/tests/colors_canonical_integration_v1.test.sql \
  docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md \
  docs/audits/ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1.md \
  docs/colors/ELSATIA_COLORS_FUNCTIONAL_V1.md \
  docs/exploitation/COLORS_PLAN_DEPLOIEMENT_PREDEPLOY_V1.md \
  docs/securite/colors-en-tetes.md \
  docs/securite/colors-integration-precommercial.md \
  docs/securite/reset-password-multiapp.md
```

### Contrôles obligatoires après reprise

```bash
ls supabase/migrations | wc -l        # doit être inchangé
git diff <base> -- supabase/migrations # doit être vide
grep -ri market apps/colors            # doit être vide
cd apps/colors && npm ci && npm test && npm run typecheck && npm run lint && npm run build
```

### Interdits maintenus

- Ne **jamais** fusionner `feat/colors-product-activity-history-v1` : sa base est
  amputée de 41 migrations.
- Ne **jamais** reprendre `f1cabc7` (dépendances Tailwind mortes, §5.4).
- Ne **jamais** réintroduire l'historique de migrations de la lignée Colors.
- La migration `20260908000271_colors_activity_history_v14.sql` du train reste
  l'unique version canonique.

---

## 13. Ce qui n'a pas été fait, volontairement

- Aucune fusion (`merge`), aucune pull request.
- Aucun déploiement, aucune action sur la Production.
- Aucune migration créée, modifiée, renumérotée ou supprimée.
- Aucun développement du pont Market ni du pont Bibliothèque technique : les
  deux se limitent à un document.
- La recette humaine du §10 est **préparée, pas exécutée**.
