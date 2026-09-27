# ELSATIA Tools — Relevé & Métré — Lot 2 — Architecture Foundation V1

**Date** : 2026-09-27
**Branche** : `claude/funny-knuth-ykfc0j`
**Base** : train canonique V2 (`integration/elsatia-canonical-train-v2` @ `819ebe56`) + Lot 1 (`88a2b794`) + première passe de fondation Lot 2 (`d3c39068`, branche `claude/dazzling-gates-uzfkvz`)
**Entrées lues** : [Audit Lot 1](./ELSATIA_TOOLS_RELEVE_METRE_EXISTING_AUDIT_V1.md) · [Roadmap V1](./ELSATIA_TOOLS_RELEVE_METRE_ROADMAP_V1.md) · [Première passe Lot 2](./ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md)
**Hors périmètre, volontairement** : LiDAR, AR, scan automatique, plan automatique complet, chiffrage, paiement, SKU, activation commerciale, écriture dans Gestion Pro.

---

## 0. Verdict

> **RELEVE METRE LOT 2 LOCALLY QUALIFIED**

| Contrôle (exécuté dans cette session) | Résultat |
|---|---|
| Rejeu des migrations sur PostgreSQL 16 vierge | **337 / 337** appliquées |
| pgTAP `elsatia_tools_releve_metre_lot2_complements.test.sql` (nouveau) | **66 / 66** |
| pgTAP `elsatia_tools_releve_metre_foundation_v1.test.sql` | **74 / 74** |
| pgTAP suite complète (128 fichiers, 2 972 tests) | **aucune régression** : les 11 mêmes fichiers échouent avant et après, avec les mêmes compteurs (limites connues du banc local, §11.3) |
| Vitest `packages/releve-domain` | **94 / 94** (9 fichiers) |
| Vitest `apps/tools` | **2 006 / 2 006** (176 fichiers) |
| Vitest racine (Gestion Pro + packages) | **1 947 / 1 947** (166 fichiers) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements, antérieurs, hors fichiers du lot) |
| `next build --webpack` Tools (web) | OK — `/releves`, `/releves/nouveau`, `/releves/fiche`, `/releves/structure` statiques |
| `build:native` Tools (export Capacitor) | OK — `out/releves/{index,nouveau,fiche,structure}` |
| `next build` Gestion Pro (racine) | OK |
| `verify-migrations` | 337 migrations valides |

« Locally qualified » : prouvé sur un vrai moteur PostgreSQL avec la vraie RLS, sans GoTrue / PostgREST / Storage réels (voir `scripts/local-postgres-bootstrap/README.md`). Aucune exécution Preview ou production n'est revendiquée.

---

## 1. Base et méthode

1. `git fetch` : le train canonique le plus récent est **V2** (`819ebe56`). Le Lot 1 existait sur `claude/happy-ritchie-7ji6xa` (base V1) ; une première passe de Lot 2 existait déjà sur `claude/dazzling-gates-uzfkvz`, **au-dessus de V2 + Lot 1**. Plutôt que de dupliquer 5 000 lignes, la branche de travail repart de cette passe (`d3c39068`) et la **complète** là où elle s'écartait du contrat de cette mission.
2. Baseline mesurée avant toute modification : pgTAP Relevé 74/74, suite complète 127 fichiers / 2 906 tests dont 11 fichiers en échec connu.
3. Écarts relevés entre la première passe et le contrat de la mission, tous comblés ici :

| Exigence de la mission | Première passe | Ce lot |
|---|---|---|
| Hiérarchie **Projet → Chantier → Bâtiment** → Étage → Zone → Pièce | chantier = simple libellé porté par le relevé | table `tools_releves_chantiers`, bâtiment rattaché à un chantier (clé composite) |
| Versioning initial / corrected / projected / as-built | versions numérotées non typées | `type_version` + version de base, règles serveur et domaine |
| Relevé Pro peut inclure Tools Pro | hypothèse écrite, non outillée (une ligne `['releve-metre']` n'ouvrait pas Tools Pro) | catalogue d'offres SQL sans prix + extension dans le résolveur |
| Contrat GP : client, chantier, building, floor, room, walls, openings, measurements, quantities, photos, annotations, materials, exports | 11 sections de forme différente | exactement ces 13 sections (+ `equipments` informatif), enveloppe par chantier |
| Domain model : Wall, Opening, Door, Window, … | pas de Door / Window | `Porte` / `Fenetre` typés + alias anglais |
| UI : Mes relevés, Nouveau relevé, fiche relevé, bâtiments, étages, pièces | liste+création, structure | 4 écrans distincts |
| RLS testée : owner, org member, unauthorized, other tenant, **service role** | service role non testé | bloc M (28 tests) |
| Rapport `…_LOT2_FOUNDATION_V1.md`, verdict LOCALLY QUALIFIED | autre nom, autre verdict | ce document |

---

## 2. Product contract — type de projet `releve`

- `TOOLS_PROJECT_KINDS = ["calculateur", "atelier", "releve"]`, `RELEVE_PROJECT_KIND = "releve"` (domaine) ; `tools_releves.type_projet text check (type_projet = 'releve')`, immuable (trigger).
- Agrégat **distinct** : ni `ToolProject` (calculateur) ni `TracingProject` (Atelier) ne sont modifiés. L'Atelier reste un outil de tracé, pas un projet bâtiment.
- Même application `tools`, même compte, même résolveur d'entitlements, mêmes rôles `roles_applications_elsatia`, routes `apps/tools/src/app/releves/*`.

## 3. Hiérarchie

```text
Projet relevé   tools_releves              (site principal, client, statut, visibilité, lien GP)
└─ Chantier     tools_releves_chantiers    (adresse, lien faible chantiers GP)          ← NOUVEAU
   └─ Bâtiment  tools_releves_batiments    (chantier_id NOT NULL)
      └─ Étage  tools_releves_etages       (niveau, HSP, existant | projet)
         ├─ Zone  tools_releves_zones      (facultative)
         │  └─ Pièce
         └─ Pièce hors zone
```

- **Clés étrangères composites** : `(chantier_id, releve_id) → chantiers(id, releve_id)`, `(releve_id, entreprise_id) → tools_releves(id, entreprise_id)`. Un bâtiment ne peut pas pendre sous le chantier d'un autre projet (pgTAP L10), un chantier ne peut pas porter un tenant forgé, même en `service_role` (M19, M25).
- **Rétro-compatibilité** : un bâtiment inséré sans `chantier_id` rejoint le chantier actif unique du projet ; s'il n'y en a aucun, le serveur le crée depuis le site principal ; s'il y en a plusieurs, l'insertion est refusée (`23502`). Aucun effet de bord pour un appelant non autorisé (M13). Le service de domaine applique la même règle, et crée le premier chantier dès « Nouveau relevé ».
- **Suppression douce en cascade** : chantier → bâtiments → étages → zones, pièces, éléments ; restauration symétrique limitée à ce que la même cascade a supprimé (L13–L16). Journal d'audit : nouvelle entité `chantier` (L17).
- **Lien GP d'un chantier** : même entreprise toujours exigée ; permission GP `acces_chantiers` pour poser un nouveau lien (L12, M20, M26) ; recopier le lien déjà validé du projet ne la redemande pas.
- Domaine : `RELEVE_HIERARCHY_LEVELS`, `Chantier`, `buildReleveTree()` → `chantiers[].batiments[].etages[]…`, `descendantsOf({kind:"chantier"})`, contrôle d'intégrité « bâtiment orphelin de chantier ».

## 4. Domain model

`packages/releve-domain/src/model.ts` (sans dépendance, partagé web / Capacitor / futur natif).

| Entité demandée | Type domaine | Persistance |
|---|---|---|
| Wall | `Mur` (alias `Wall`) | `tools_releves_elements` `type='mur'` |
| Opening | `Ouverture` (alias `Opening`) | `type='ouverture'`, mur hôte du même étage obligatoire |
| Door | `Porte` (alias `Door`) = ouverture `porte` \| `porte_fenetre`, garde `isPorte()` | idem |
| Window | `Fenetre` (alias `Window`) = ouverture `fenetre` \| `baie`, garde `isFenetre()` | idem |
| Equipment | `Equipement` (alias) | `type='equipement'` |
| Measurement | `Mesure` (alias) | `type='mesure'`, source `manuel…lidar` réservée, aucune capture revendiquée |
| PhotoAnchor | `PhotoAnchor` | `type='photo_anchor'` + `tools_releves_medias` |
| Annotation | `Annotation` | `type='annotation'` |
| Material | `Materiau` (alias) | `type='materiau'`, référence prestation GP sans prix |
| Quantity | `Quantite` (alias) | `type='quantite'`, dérivée (formule, qualité) |
| Version | `Version` (+ `typeVersion`, `versionBaseId`) | `tools_releves_versions`, immuable |

Validation (`validation.ts`) aux bornes identiques aux CHECK SQL, `validateChantierDraft` ajouté ; parité TypeScript ↔ SQL testée (`sql-parity.test.ts`). Aucune UI de dessin à ce lot.

## 5. Capability premium `releve-metre`

- Capability d'**add-on** : `tools_capabilities_addon()` (SQL), `ADDON_CAPABILITIES` (Tools), `RELEVE_METRE_CAPABILITY` (domaine). Jamais incluse dans le palier Pro par déduction : un Tools Pro existant ne l'obtient pas (pgTAP B5/B6/K7).
- **Aucune activation commerciale** :
  - trigger `tools_releve_metre_non_commercial` : refuse `releve-metre` sur toute ligne d'entitlement de source `web` / `apple` / `google`, y compris en `service_role` (B2, B3, I4, M27) ;
  - catalogue : `releve_pro` ne peut pas être `commercialement_active` (CHECK, K2 — même en superutilisateur, une migration relue est nécessaire) ;
  - `RELEVE_METRE_OFFER.commercialActivation = false`, `isReleveMetrePurchasable() === false` ; aucun SKU, aucun bouton d'achat, l'écran verrouillé n'affiche aucun prix.
- **Prix de référence, une seule source** : `RELEVE_METRE_OFFER` (`monthlyPriceCents: 2490`, `annualPriceCents: 24900`, `perUser`, `vat: "HT"`, `status: "working-price"`). Un test (`entitlement.test.ts`) parcourt `apps/tools/src`, `packages/releve-domain/src` et les deux migrations Relevé et échoue si le prix apparaît ailleurs ; le catalogue SQL n'a aucune colonne de prix (K5).
- Activation interne pour pilotes : `plateforme_attribuer_entitlement_utilisateur(…, 'tools', 'pro', array['releve-metre'], 'internal')` + une habilitation Tools Relevé dans l'entreprise.

## 6. Relation Tools Pro

Migration `20260926000501` : table `tools_offres_catalogue` (code, capability clé, capabilities, offres incluses, `commercialement_active`, statut — **sans prix**).

| Offre | Capability clé | Capabilities | Inclut | Commerciale |
|---|---|---|---|---|
| `tools_pro` | — (jamais déduite) | 18 capabilities Pro | — | oui (état actuel, descriptif) |
| `releve_pro` | `releve-metre` | `releve-metre` | `tools_pro` | **non** (`reference`) |

- `tools_capabilities_offre(code)` et `tools_capabilities_etendues(caps)` ; le résolveur `tools_resoudre_entitlements()` est **identique à une ligne près** : les capabilities résolues sont étendues par les offres qu'elles signalent. Effet : une attribution `['releve-metre']` seule ouvre Tools Pro complet (K8, 19 capabilities) ; Tools Free et Tools Pro sans add-on sont strictement inchangés (K4, K7, K9, suites `elsatia_tools_r8/r9/r10`, `platform_global_owner_all_apps_v1` vertes).
- Miroir domaine : `TOOLS_OFFERS`, `offerCapabilities()`, `expandOfferCapabilities()`, `TOOLS_PRO_CAPABILITIES` (parité avec SQL et avec `PRO_CAPABILITIES` de Tools testée).
- **Facturation réelle non modifiée** : ni Stripe, ni stores, ni `tools_monetization_subscriptions`, ni webhooks. Le catalogue n'est lu par aucun flux de paiement. L'inclusion reste une **décision de travail** à confirmer par le dirigeant avant le lot 21 ; la désactiver = vider `offres_incluses` (SQL) et `RELEVE_METRE_OFFER_INCLUDES_TOOLS_PRO` (domaine).

## 7. Stockage

Bucket **privé** `tools-releves` (aucune URL publique). Correspondance avec l'arborescence demandée :

| Cahier des charges | Chemin réel |
|---|---|
| `releve/{project}/photos` | `tools-releves` : `{entreprise}/{project}/photos/{media}.{ext}` |
| `releve/{project}/documents` | `tools-releves` : `{entreprise}/{project}/documents/…` |
| `releve/{project}/exports` | `tools-releves` : `{entreprise}/{project}/exports/…` |
| (notes vocales, croquis) | `…/annotations/…` |

Le préfixe `releve/` est le bucket dédié ; le segment `{entreprise}` est inséré **avant** `{project}` pour que l'ownership tenant soit vérifiable sur le seul chemin. `tools_releve_storage_autorise()` refuse toute forme non canonique, vérifie que le couple (entreprise, projet) existe réellement, puis applique `view` (lecture), `edit` (photos/documents), `export` (exports), `delete` (suppression) ; aucune policy UPDATE (pas d'écrasement). Domaine : `RELEVE_PROJECT_FOLDERS`, `logicalReleveFolder()`, `buildStoragePath()`, `checkMediaUpload()`. Tests : G1–G4, M21, M22.

## 8. RLS — matrice par acteur

Trois dimensions obligatoires : organisation (accès Tools + membre actif), entitlement personnel `releve-metre`, rôle Tools Relevé. Toutes les tables filles, chantiers compris, sont gardées par `tools_releve_peut(releve_id, action)`.

| Acteur | Lecture | Écriture | Preuve pgTAP |
|---|---|---|---|
| **Owner** (métreur) | ses projets, privés compris | ses projets | L1–L17, M1, M22, N1–N10 |
| **Org member** métreur (`tools_pro`) | projets partagés | projets partagés (pas suppression/partage/transfert) | M2, M5–M7, D12–D15 |
| **Org member** consultation | projets partagés | aucune (INSERT refusé, UPDATE sans effet) | M8–M10, N11–N12, D7–D11 |
| Admin Relevé | tous les projets de l'entreprise | tous | M3, D3–D4 |
| **Unauthorized** — Tools Pro sans add-on | rien | refusé, sans effet de bord | M11–M13, B5–B7 |
| **Unauthorized** — add-on sans rôle dans l'entreprise | rien | refusé | M14–M15 |
| **Other tenant** (admin de B) | rien de A | refusé ; tenant forgé → FK composite ; lien GP de A refusé ; stockage de A refusé | M16–M21, E1–E8, G4 |
| `anon` | aucun privilège | aucun | M23, A2 |
| **Service role** | tout (back-office, sans RLS) | mais : tenant d'un chantier non forgeable, lien GP inter-entreprise refusé, `releve-metre` jamais sur une source d'achat, résolveur d'entitlements inaccessible | M24–M28 |

## 9. Versioning

| Type | Sens | Règle serveur (`tools_releve_creer_version`) |
|---|---|---|
| `initial` | relevé de l'existant | unique (index partiel), toujours la version 1, sans base |
| `corrige` (*corrected*) | correction | exige une version antérieure ; base par défaut = la dernière |
| `projete` (*projected*) | état projeté (plan rénové, étages `etat = 'projet'`) | idem, base explicite possible |
| `as_built` (*as-built*) | tel que construit / DOE | idem |

Versions immuables (aucun UPDATE pour `authenticated`), numérotées, empreinte SHA-256, instantané incluant désormais les chantiers et le type ; base obligatoirement du même projet (FK composite, N9). Domaine : `VERSION_TYPES`, `VERSION_TYPE_ALIASES` (vocabulaire anglais du cahier des charges), `planVersion()` miroir exact des règles SQL. Les **vues** comparatives (diff initial/projeté, as-built) ne sont pas implémentées : seul le modèle et la création typée existent.

## 10. Contrat de synchronisation Gestion Pro

`packages/releve-domain/src/gp-sync.ts` — statut **`contract-only`**, aucune écriture GP.

- Sections contractuelles (`GP_SYNC_SECTIONS`) : `client`, `chantier`, `building`, `floor`, `room`, `walls`, `openings`, `measurements`, `quantities`, `photos`, `annotations`, `materials`, `exports` (+ `equipments`, informatif).
- **Une enveloppe = un chantier** du projet ↔ un chantier GP (`chantier_ambiguous` si non précisé sur un projet multi-chantiers). Chantier GP cible : celui du chantier Tools, à défaut celui du site principal.
- Règles figées : GP autoritaire sur client, chantier et prix ; **aucun prix transmis** (testé) ; on transmet une **version** immuable (`source.versionType` inclus) ; idempotence `tools-releve:{releve}:v{n}:gp-chantier:{gp}` ; mm → m à 3 décimales ; ouvertures classées `door` / `window` / `other`.
- Pas de chiffrage. Bloquants listés dans `GP_SYNC_READINESS` (RPC d'import GP, double autorisation, unité m³ absente de `UNITES` GP) — lot 17.

## 11. UI minimale (Tools, routes statiques)

| Écran | Route | Contenu |
|---|---|---|
| Mes relevés | `/releves` | liste (statut, partage, lien GP, date) ; bouton « Nouveau relevé » si `create` |
| Nouveau relevé | `/releves/nouveau` | projet (nom, référence, client, date) + premier chantier ; ouvre la fiche |
| Fiche relevé | `/releves/fiche?id=` | identité, structure, partage ; **chantiers** (liste, ajout) ; **versions typées** (historique avec base, création typée) |
| Bâtiments / étages / pièces | `/releves/structure?id=&chantier=&batiment=&etage=` | sélecteur de chantier, trois colonnes bâtiments → étages → zones et pièces, ajout / retrait |

- Paramètres de requête validés (UUID uniquement, un niveau n'est lu que si son parent l'est).
- Sans `releve-metre` : écran « module premium en préversion », sans prix ni achat. Pages `noindex`, hors sitemap ; lien d'accueil réservé aux détenteurs de la capability.
- Pas de LiDAR, AR, scan, ni plan automatique.

## 12. Tests

### 12.1 pgTAP — `supabase/tests/elsatia_tools_releve_metre_lot2_complements.test.sql` (66)

| Bloc | Couverture |
|---|---|
| K. Offres (9) | catalogue, non-activation (CHECK), `releve_pro` = Pro + add-on, aucun prix en base, non-régression Free / Pro, bundle résolu |
| L. Chantier (17) | création, tenant/auteur imposés, hiérarchie complète à 6 niveaux, bâtiment sans chantier (ambigu / par défaut / pas de doublon), FK composite, immuabilité, permission GP, cascade et restauration, journal |
| M. RLS (28) | owner, org member métreur, org member consultation, admin, unauthorized ×2, other tenant, anon, service role, stockage photos/documents/exports |
| N. Versions (12) | initial unique, corrigé sur la dernière, projeté sur base explicite, as-built, type inconnu, initial manquant, base d'un autre projet, immuabilité, consultation |

`elsatia_tools_releve_metre_foundation_v1.test.sql` : A6 pointe désormais la signature `tools_releve_creer_version(uuid,text,text,uuid)` ; 74/74 inchangés sinon.

### 12.2 Vitest

- Domaine : `versioning.test.ts` (nouveau), `service.test.ts` (versions typées, multi-chantiers, chantier par défaut), `hierarchy.test.ts` (chantier), `gp-sync.test.ts` (13 sections, enveloppe par chantier), `sql-parity.test.ts` (types de version, 18 capabilities Pro, catalogue d'offres, extension), `entitlement.test.ts` (prix à source unique).
- Tools : `releve-adapter.test.ts` (premier chantier créé sans `entreprise_id`, `chantier_id` envoyé, RPC de version typée), `navigation.test.ts` (chantier, fiche), `access.test.ts` (parité Pro, bundle Relevé Pro).

### 12.3 Commandes

```text
scripts/local-postgres-bootstrap/rebuild_db.sh pgtap_after          → 337 migrations OK
pg_prove elsatia_tools_releve_metre_lot2_complements.test.sql       → 66/66
pg_prove elsatia_tools_releve_metre_foundation_v1.test.sql          → 74/74
pg_prove *.test.sql (avant, 336 migrations)                          → 127 fichiers, 2 906 tests, 11 fichiers en échec
pg_prove *.test.sql (après, 337 migrations)                          → 128 fichiers, 2 972 tests, les 11 MÊMES, mêmes compteurs
npx vitest run packages/releve-domain                                → 94/94
apps/tools: npx vitest run                                           → 2 006/2 006
npx vitest run (racine)                                              → 1 947/1 947
npx tsc --noEmit (racine, apps/tools)                                → 0 erreur
npx eslint (racine) ; apps/tools: npm run lint                       → 0 erreur
apps/tools: npm run build ; npm run build:native                     → OK
npx next build (Gestion Pro)                                         → OK
node scripts/verify-migrations.mjs                                   → 337 valides
```

Échecs pgTAP antérieurs et inchangés (banc PostgreSQL local sans Supabase complet) : `platform_stripe_state_attestation_r72` (stub `pgsodium`), 7 fichiers `studio_*` (fixture incompatible avec la politique d'inscription Studio), `purge_entreprise_architecture_v2`, `purge_entreprise_supprimee`, `elsatia_tools_cloud_sync_entitlement_closure_v1` (bloc `service_role` sans GRANT dans le banc). Aucun ne touche un objet Relevé.

## 13. Limites et décisions ouvertes

| Sujet | État |
|---|---|
| Relevé Pro inclut Tools Pro | **outillé mais à confirmer** par le dirigeant (lot 21) ; réversible sans migration de données |
| Site principal vs chantiers | `tools_releves.chantier_*` reste l'en-tête du projet et amorce le premier chantier ; il n'est pas resynchronisé si les chantiers changent |
| Vues de versions (diff, projeté, as-built) | modèle et création seulement |
| Hors ligne | en ligne (PostgREST) ; identifiants client + révisions prêts pour le dépôt IndexedDB (lot 3) |
| Storage | enregistrement média en deux temps ; purge des objets orphelins et rétention photo : lot 11 |
| GP | contrat seulement ; RPC d'import, double autorisation, unité m³ : lot 17 |
| Qualification | locale uniquement ; pas de Preview / production dans ce lot |

## Annexe — fichiers du lot (complément)

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260926000501_tools_releve_metre_lot2_complements.sql` | offres, résolveur, niveau chantier, versions typées |
| `supabase/tests/elsatia_tools_releve_metre_lot2_complements.test.sql` | pgTAP, 66 tests |
| `packages/releve-domain/src/{model,ids,validation,hierarchy,repository,service,entitlement,storage,gp-sync,versioning}.ts` | domaine |
| `apps/tools/src/lib/releve/{mapping,supabase-repository,navigation}.ts` | adaptateur et navigation |
| `apps/tools/src/components/releve/{ReleveListWorkspace,ReleveNewWorkspace,ReleveFicheWorkspace,ReleveStructureWorkspace,labels}.tsx?` | UI minimale |
| `apps/tools/src/app/releves/{nouveau,fiche}/page.tsx` | nouvelles routes statiques |
