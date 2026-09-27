# ELSATIA Tools — Relevé & Métré — Lot 2 — Foundation Recovery & Verification V2

**Date** : 2026-09-27
**Branche** : `claude/friendly-cori-c3tw3n` (voir §1, DECISION_REQUIRED D1)
**Base canonique** : `integration/elsatia-canonical-train-v3` @ `ef7443c0` (verdict V3 : *CANONICAL TRAIN V3 READY FOR REMOTE PREVIEW EXECUTION*)
**Nature** : rapport autonome. Il se lit sans l'ancienne conversation : tout ce qui est affirmé ici a été relu dans le dépôt ou ré-exécuté dans cette session.
**Hors périmètre, volontairement** : AR, LiDAR, scan automatique, IA de reconnaissance, métré complet, plan rénové complet, estimation, PDF final, synchronisation GP réelle, chiffrage, activation commerciale, déploiement, preview, production, merge vers `main`.

---

## 0. Verdict

> **RELEVE METRE LOT 2 LOCALLY QUALIFIED**

Le Lot 2 avait bien été réalisé (sur le train **V2**, jamais porté sur V3). Il a été retrouvé, porté sur V3, **vérifié exigence par exigence**, et **corrigé** là où il était faux ou incomplet :

| Constat | Traitement |
|---|---|
| Migrations `…0401` / `…0501` en **collision** avec le V3 (`20260926000501` déjà pris) et antérieures à sa dernière migration | renumérotées `20260927000601` / `…602`, SQL inchangé |
| **Défaut bloquant** : l'UI web ne pouvait pas créer de relevé — `INSERT … RETURNING` (PostgREST) refusé par la RLS. Jamais vu car ni pgTAP ni l'UI n'avaient été exercés contre un vrai PostgREST | migration corrective `…603`, pgTAP R1–R12, Playwright réel |
| Contrat des éléments incomplet vs le présent cahier des charges (mesures largeur/volume/distance, source « calculé », formes d'annotation, metadata d'ouverture, revêtements, liens quantité → mur/ouverture/ouvrage) | migration **additive** `…604` + domaine TS, parité testée |
| Contrat GP sans `zone`, `coverings`, `equipments` contractuel, `versions` | 4 sections ajoutées (17 au total) |
| Compatibilité RGPD (export, purge d'entreprise, Storage) jamais prouvée | pgTAP P1–P13 : export complet, purge complète, fichiers supprimés, autres tenants intacts |
| Aucune preuve navigateur | Playwright 4/4 sur pile réelle GoTrue + PostgREST + RLS (desktop, smartphone, tablette) |

« Locally qualified » : prouvé sur PostgreSQL 16 avec les vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST et un vrai navigateur ; **pas** sur le vrai service Storage (métadonnées `storage.objects` + policies réelles, octets non testés), ni en Preview, ni en production.

### Chiffres clés

| Contrôle (exécuté dans cette session, sur HEAD) | Résultat |
|---|---|
| Install fraîche (PostgreSQL 16, bootstrap local) | **344 / 344** migrations |
| Upgrade V3 (340, avec données pilote) → HEAD (+4) | OK ; **schéma identique** à l'install fraîche (`pg_dump -s`, privilèges inclus : 0 ligne de diff) ; résolveur d'entitlements **identique** pour les 28 utilisateurs pilotes ; assertions pilote OK |
| `verify-migrations` | 344 valides, noms et horodatages uniques |
| pgTAP Relevé (4 fichiers) | **174 / 174** (install fraîche **et** base upgradée) |
| pgTAP suite complète | 137 fichiers, 3 369 tests ; **mêmes 9 fichiers en échec que le V3 pur** (133 fichiers, 3 195 tests), mêmes compteurs — limites connues du banc (§14.3) |
| Vitest `packages/releve-domain` | **106 / 106** (9 fichiers) |
| Vitest racine (Gestion Pro + packages) | **1 960 / 1 960** (166 fichiers) |
| Vitest `apps/tools` | **2 006 / 2 006** (176 fichiers) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements antérieurs, aucun dans un fichier Relevé) |
| Build Tools web (`next build --webpack`) | OK — `/releves`, `/releves/nouveau`, `/releves/fiche`, `/releves/structure` statiques |
| Build Tools natif (export Capacitor) | OK — `out/releves/{index,nouveau,fiche,structure}` |
| Build Gestion Pro (`next build`) | OK |
| Playwright `tests/e2e/tools-releve-lot2.spec.ts` | **4 / 4** (pile réelle, §12.4) |

---

## 1. Branche utilisée

- Travail et push sur **`claude/friendly-cori-c3tw3n`**, branche imposée par la session d'exécution, recréée **depuis `origin/integration/elsatia-canonical-train-v3`** (et non depuis `main`).
- **DECISION_REQUIRED D1** — le cahier des charges *recommandait* `claude/tools-releve-metre-lot2-recovery-v2`. La contrainte de session interdit de pousser ailleurs sans autorisation explicite : choix conservateur = branche de session. Le contenu est identique ; pour obtenir le nom recommandé : `git push origin claude/friendly-cori-c3tw3n:claude/tools-releve-metre-lot2-recovery-v2`.
- Aucune PR ouverte, aucun merge, aucun déploiement.

## 2. Base canonique

`origin/integration/elsatia-canonical-train-v3` @ `ef7443c0` (« rapport de convergence finale du train canonique V3 »), 340 migrations, dernière : `20260926000505_rgpd_export_tables_enfants.sql`.
Entre la base du Lot 2 retrouvé (V2 @ `819ebe56`) et V3 : 12 commits, 5 migrations (`20260926000501…505`, RGPD et Réserves) ; **aucun fichier en commun** avec le Lot 2 (cherry-pick sans conflit) ; aucune de ces migrations ne touche `tools_*`, `storage.*` ni les rôles applicatifs.

## 3. Ancien travail retrouvé

`git fetch --all --prune` puis recherche dans `git log --all` (`relev`, `metre`, `métré`, `LOT 2`, `lot2`, `architecture foundation`), `git branch -a`, les arbres `docs/product/`, `supabase/migrations/`, `apps/tools/`, `packages/` de toutes les branches distantes.

| Branche distante | Base | Contenu | Statut |
|---|---|---|---|
| `claude/happy-ritchie-7ji6xa` | train V1 | `fe3362d9` Lot 1 (audit + roadmap) | ancêtre documentaire, remplacé |
| `claude/dazzling-gates-uzfkvz` | train V2 | `88a2b794` Lot 1, `d3c39068` première passe Lot 2 | inclus dans la suivante |
| **`claude/funny-knuth-ykfc0j`** | train V2 `819ebe56` | `88a2b794`, `d3c39068`, `d4adee8c` (wip), `3e90717f` « Lot 2 — fondation qualifiée localement » | **Lot 2 le plus complet → porté** |

Le train V3 **ne contient aucun** de ces commits ni fichiers (`docs/product/` n'existait pas sur V3). Le commit V3 `c30190cd` mentionne la collision « 401 » avec la branche Tools relevé métré, sans la porter.

Documents Lot 1 retrouvés et portés : `ELSATIA_TOOLS_RELEVE_METRE_EXISTING_AUDIT_V1.md` (verdict *RELEVE METRE ARCHITECTURE READY FOR LOT 2*), `ELSATIA_TOOLS_RELEVE_METRE_ROADMAP_V1.md`. Rapports Lot 2 antérieurs portés tels quels (historique) : `…_ARCHITECTURE_FOUNDATION_V1.md`, `…_LOT2_FOUNDATION_V1.md`. **Le présent document les remplace comme référence.**

## 4. Commits

Sur `integration/elsatia-canonical-train-v3` :

| Commit | Origine | Objet |
|---|---|---|
| `bf9cc6e7` | cherry-pick `88a2b794` | Lot 1 — audit et roadmap |
| `6ab889d2` | cherry-pick `d3c39068` | Lot 2 — fondation (domaine, migration, UI liste/structure) |
| `9a113234` | cherry-pick `d4adee8c` | Lot 2 — niveau chantier, versions typées, offres Relevé Pro |
| `ceb6044f` | cherry-pick `3e90717f` | Lot 2 — compléments et rapport V1 |
| `7c67855a` | **ce lot** | renumérotation 401/501 → 601/602 |
| `6ffcf93f` | **ce lot** | pgTAP RGPD (export, purge, Storage) |
| `8195283f` | **ce lot** | correctif RLS `INSERT … RETURNING` (603), pgTAP R1–R12, Playwright, pile e2e |
| `4b1cf23b` | **ce lot** | contrat des éléments et contrat GP complétés (604, additive) |
| `6a289a81` | **ce lot** | contrat de lecture par URL signée |
| *(ce rapport)* | **ce lot** | rapport Recovery V2 |

## 5. Migrations

| Migration | Statut | Contenu |
|---|---|---|
| `20260927000601_tools_releve_metre_foundation_v1.sql` | **portée** (ex-`20260926000401`, SQL identique) | rôles Relevé, capability add-on, garde non commerciale, résolveur, 10 tables, triggers, RLS, bucket et policies Storage, RPC |
| `20260927000602_tools_releve_metre_lot2_complements.sql` | **portée** (ex-`20260926000501`, SQL identique hors commentaire) | catalogue d'offres, Relevé Pro ⊃ Tools Pro, niveau Chantier, versions typées |
| `20260927000603_tools_releve_metre_select_policy_ligne.sql` | **ajoutée** | correctif RLS (§10.2) |
| `20260927000604_tools_releve_metre_contrat_elements_v2.sql` | **ajoutée** | validateur d'éléments étendu, strictement additif (§6.2) |

- **Numérotation** : plage neuve `20260927000601…604`, strictement après la dernière migration V3 (`20260926000505`) et après tout numéro vu sur une branche distante (maximum observé : `20260927000402`). Aucune migration appliquée du train n'a été modifiée.
- **Fresh install** : 344/344. **Upgrade depuis V3 avec données** : 601→604 appliquées sur une base V3 + fixture pilote + entitlements Tools Pro existants ; schéma final identique à l'install fraîche ; résolveur inchangé pour tous les utilisateurs existants.
- **Idempotence** : ces migrations sont, comme tout le train, **à application unique** (suivies par `supabase_migrations`). Une ré-application manuelle de 601 échoue explicitement (`relation "tools_releves" already exists`) — **mais** ses `create or replace` exécutés avant l'échec réécrivent le résolveur de 602 : constaté dans cette session, sans conséquence sur le train (jamais rejoué). À ne jamais rejouer à la main.
- **DECISION_REQUIRED D2** : `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` attend `(340, '20260926000505')` pour la preview **V3**. Non modifié (cette branche n'est pas le train). Si le Lot 2 rejoint un train : `(344, '20260927000604')`.

## 6. Modèle de données

### 6.1 Objets base

| Objet | Nombre | Détail |
|---|---|---|
| Tables | **12** | `tools_releves`, `_chantiers`, `_batiments`, `_etages`, `_zones`, `_pieces`, `_elements`, `_medias`, `_versions`, `_journal`, `_exports_gp`, `tools_offres_catalogue` |
| Bucket Storage | 1 | `tools-releves`, **privé** |
| Fonctions `tools_releve*` / `tools_capabilities*` / `tools_offre*` | 24 | dont `tools_releve_peut`, `tools_releve_peut_ligne` (603), `tools_releve_element_donnees_valides` (604) |
| Policies RLS | 31 | tables Relevé, catalogue, `storage.objects` |
| Triggers | 23 | garde, cascade de suppression douce, journal, révision |

Chaque niveau de hiérarchie porte : `id` UUID (générable côté client), `entreprise_id`, parent (FK **composite** avec `releve_id`, un enfant ne peut pas changer de projet ni pendre sous le projet d'autrui), `nom`, `ordre` (sauf le projet), `created_at/updated_at`, `created_by/updated_by`, `revision` (concurrence optimiste), `deleted_at/deleted_by` (suppression douce en cascade, restauration symétrique), RLS, journal (`tools_releves_journal`, entités `releve, chantier, batiment, etage, zone, piece, element, media, version`).

### 6.2 Domaine — classification des entités

`packages/releve-domain/src/model.ts` (aucune dépendance, ni Next.js ni React). Les éléments métier sont stockés dans `tools_releves_elements` (`type` + `donnees` JSONB validé par CHECK SQL et par `validation.ts`, parité testée).

| Entité | Type domaine | Classement | Commentaire |
|---|---|---|---|
| Releve | `Releve` (`type_projet = 'releve'`) | **IMPLEMENTED** | CRUD, partage, statut, lien GP |
| Chantier | `Chantier` | **IMPLEMENTED** | niveau réel (table), multi-chantiers |
| Batiment | `Batiment` | **IMPLEMENTED** | |
| Etage | `Etage` (`etat` existant / projet) | **IMPLEMENTED** | |
| Zone | `Zone` (facultative) | **IMPLEMENTED** | |
| Piece | `Piece` (usage) | **IMPLEMENTED** | |
| Wall | `Mur` / `Wall` | **FOUNDATION_ONLY** | segment `a→b` (mm), épaisseur, hauteur, type, pièce, pièces adjacentes (604), matériau (604) ; longueur **dérivée** du segment ; ouvertures par `parent_element_id`. Pas d'éditeur |
| Opening | `Ouverture` / `Opening` | **FOUNDATION_ONLY** | mur hôte obligatoire (même étage), décalage, largeur, hauteur, allège, sens, type, metadata (604) |
| Door | `Porte` / `Door` (+ `isPorte`) | **FOUNDATION_ONLY** | porte, porte-fenêtre |
| Window | `Fenetre` / `Window` (+ `isFenetre`) | **FOUNDATION_ONLY** | fenêtre, baie ; `OUVERTURE_FAMILLES` : porte / fenêtre / baie / ouverture libre (trémie, passage) |
| Equipment | `Equipement` / `Equipment` | **FOUNDATION_ONLY** | catégorie, position, rotation, dimensions |
| Measurement | `Mesure` / `Measurement` | **FOUNDATION_ONLY** | longueur, **largeur**, hauteur, diagonale, **distance**, angle, surface, **volume** ; unité imposée par type ; source manuel / **calculé** / laser / photo / ar / lidar (`mesureMode` : manuel / calculé / capturé) ; cible ; précision ; date. `ar`/`lidar` réservés, aucune capture |
| PhotoAnchor | `PhotoAnchor` | **FOUNDATION_ONLY** | média + ancre (point d'un étage, ou entité : projet, bâtiment, étage, zone, pièce, élément — mur, équipement…) + direction |
| Annotation | `Annotation` | **FOUNDATION_ONLY** | ancre, texte, note vocale, **forme** (texte, flèche, cercle, zone, cote, symbole, commentaire) et **géométrie** (604). Pas d'éditeur |
| Material | `Materiau` / `Material` | **FOUNDATION_ONLY** | support (sol, mur, plafond, plinthe, menuiserie), unité, perte, référence prestation GP, **revêtement** (peinture, carrelage, faïence, parquet, stratifié, moquette, PVC, panneau décoratif, papier peint, enduit, béton…) (604) ; pas de catalogue |
| Quantity | `Quantite` / `Quantity` | **FOUNDATION_ONLY** | m², ml, m³, u ; formule ; qualité ; pièce ; matériau ; **sources** (pièce, mur, ouverture…) et **ouvrage GP** (604) ; jamais un prix |
| Version | `Version` | **IMPLEMENTED** | typée, immuable, empreinte SHA-256, base, auteur, date |

Aucune entité n'est **MISSING** ni **NEEDS_REFACTOR**. La 604 est **strictement additive** : chaque ancienne valeur reste admise (test `sql-parity` « sur-ensemble de 601 » ; pgTAP C1). L'appariement type ↔ unité des mesures reste appliqué par le domaine seul (le durcir en SQL invaliderait à la mise à jour d'éventuelles lignes existantes) — **DECISION_REQUIRED D3**, choix conservateur.

## 7. Architecture

```text
apps/tools (Next.js, web + Capacitor)          packages/releve-domain (TS pur, 0 dépendance)
  app/releves/{,nouveau,fiche,structure}          model · ids · validation · hierarchy · versioning
  components/releve/*  (UI minimale)      ──►     permissions · entitlement · storage · gp-sync
  lib/releve/supabase-repository.ts (adaptateur)  repository (port) · service (ReleveService)
            │ PostgREST / RPC
            ▼
  PostgreSQL : tools_releves* + RLS + triggers + RPC ; Storage : bucket privé tools-releves
```

- **Couche métier réutilisable** (§21) : `ReleveService` + port `ReleveRepository` ; un dépôt mémoire sert aux tests, l'adaptateur Supabase à Tools. Rien n'importe Next.js ou React : réutilisable par un futur mobile, un module de capture natif, un worker ou la synchro GP.
- **Géométrie** (§7) : pas de nouveau moteur. `MurDonnees` = segment en millimètres (`Point2D`, même convention que le moteur Tools), longueur dérivée. L'éditeur bâtiment (lots 5–7) s'appuiera sur le moteur 2D existant (snap, hit-test, aires, undo/redo).
- **Type de projet** (§4) : `TOOLS_PROJECT_KINDS = ["calculateur", "atelier", "releve"]`, colonne `type_projet = 'releve'` immuable. L'Atelier et `TracingProject` ne sont **pas** modifiés. Le type est distinguable en domaine, persistance (tables dédiées), UI (routes `/releves`), permissions (rôles et actions dédiés), exports (catégorie Storage `exports` du projet) et synchro GP (enveloppe dédiée).

## 8. Capability premium `releve-metre`

- Capability d'**add-on** (`tools_capabilities_addon()`, `ADDON_CAPABILITIES`), jamais déduite du palier Pro : un Tools Pro existant ne l'obtient pas (pgTAP B5/B6/K7, R9).
- **Aucune activation commerciale** : trigger refusant `releve-metre` sur toute source d'achat (`web`, `apple`, `google`), même en `service_role` ; `releve_pro` ne peut pas être `commercialement_active` (CHECK) ; `isReleveMetrePurchasable() === false` ; ni SKU, ni bouton d'achat, ni prix à l'écran.
- **Prix** 24,90 € HT/mois/utilisateur et 249 € HT/an/utilisateur : **une seule source**, `RELEVE_METRE_OFFER` (`packages/releve-domain/src/entitlement.ts`, `status: "working-price"`). Un test parcourt `apps/tools/src`, le domaine et **toutes** les migrations `*_tools_releve_metre_*` et échoue si le prix apparaît ailleurs ; aucune colonne de prix en base.
- Free, Pro, droits personnels, droits d'organisation et droits projet : inchangés (suites `elsatia_tools_r8/r9/r10`, `platform_global_owner_all_apps_v1` vertes ; résolveur identique pour les 28 utilisateurs pilotes après upgrade).
- Activation interne pilote : `plateforme_attribuer_entitlement_utilisateur(…, 'tools', 'pro', array['releve-metre'], 'internal')` + rôle Tools Relevé dans l'entreprise.

## 9. Relation avec Tools Pro

Catalogue `tools_offres_catalogue` (sans prix) : `releve_pro` inclut `tools_pro`. Le résolveur étend les capabilities par les offres incluses : `['releve-metre']` seul ouvre les 18 capabilities Pro (pgTAP K8). Miroir domaine `TOOLS_OFFERS`, `expandOfferCapabilities()` ; parité avec `PRO_CAPABILITIES` de Tools testée. Pas de duplication de droits : une seule liste Pro (`tools_capabilities_pro()`), étendue, jamais recopiée. **Stripe, stores, webhooks, abonnements : non modifiés.** Décision de travail à confirmer par le dirigeant avant la commercialisation (**DECISION_REQUIRED D4**) ; réversible sans migration de données (vider `offres_incluses`).

## 10. Storage, RLS, sécurité

### 10.1 Storage (§11)

| Cahier des charges | Convention réelle (bucket privé `tools-releves`) |
|---|---|
| `releve/{project}/photos` | `{entreprise}/{projet}/photos/{media}.{ext}` |
| `releve/{project}/documents` | `{entreprise}/{projet}/documents/…` |
| `releve/{project}/exports` | `{entreprise}/{projet}/exports/…` |
| (notes vocales, croquis) | `{entreprise}/{projet}/annotations/…` |

Le préfixe `releve/` est le bucket dédié ; `{entreprise}` précède `{projet}` pour que le tenant soit vérifiable sur le seul chemin. `tools_releve_storage_autorise()` refuse toute forme non canonique, vérifie que le couple (entreprise, projet) existe et applique `view` / `edit` / `export` / `delete`. Pas de policy UPDATE (pas d'écrasement). Lecture **uniquement par URL signée** : `signedUrlRequest()` (ajouté) exige un chemin canonique du tenant et du relevé attendus, durée 600 s ; Supabase ne signe que si la policy SELECT l'autorise. Aucune dépendance à une app native.
**RGPD** : la purge d'entreprise existante du V3 (générique, par `entreprise_id` et premier segment de chemin) couvre les tables **et** les fichiers Relevé — prouvé (P6–P10).

### 10.2 Défaut corrigé : création via PostgREST

Un `INSERT … RETURNING` (ce qu'émet `supabase.from(…).insert(…).select()`) impose à la nouvelle ligne la policy SELECT. Celle de `tools_releves` appelait `tools_releve_peut(id, 'view')`, qui relit la table : la ligne en cours d'insertion y est invisible → **42501 pour tout créateur légitime**. Reproduit en SQL et par PostgREST réel, puis corrigé par la 603 : `tools_releve_peut_ligne(entreprise, propriétaire, visibilité, supprimé, action)` porte la décision à partir des colonnes ; `tools_releve_peut(id, action)` lit la ligne et délègue (une seule matrice) ; la policy SELECT de `tools_releves` évalue la ligne. Tables filles inchangées (leur parent existe déjà). Preuves : R1 échoue sans 603 et passe avec ; parité ligne ↔ identifiant sur 6 acteurs × 3 projets × 7 actions (R11).

### 10.3 Matrice RLS (§19) — testée directement en base

| Acteur | Preuves pgTAP |
|---|---|
| Owner (métreur propriétaire) | L1–L17, M1, M22, N1–N10, R1–R4 |
| Membre d'organisation — métreur | M2, M5–M7, D12–D15 |
| Membre d'organisation — consultation | M8–M10, N11–N12, R7 |
| Admin Relevé | M3, D3–D4, R5–R6 |
| Autre organisation | M16–M21, E1–E8, G4, R8, P2, P11–P13 |
| Authentifié non autorisé (Tools Pro sans add-on ; add-on sans rôle) | M11–M15, B5–B7, R9 |
| Anonyme | M23, A2, R10 |
| Service role | M24–M28 (tenant non forgeable, lien GP inter-entreprise refusé, `releve-metre` jamais sur une source d'achat) |

Aucun accès cross-tenant, y compris par URL directe dans le navigateur (Playwright, test 2).

### 10.4 Permissions métier (§20)

`RELEVE_ACTIONS = view, create, edit, delete, share, export, sync-gp` (SQL `tools_releve_action_autorisee` et domaine, parité testée), sur trois dimensions : accès Tools de l'organisation + membre actif, entitlement personnel `releve-metre`, rôle Tools Relevé (`tools_releve_admin`, `tools_releve_metreur`, `tools_releve_consultation`, `tools_pro`). Cohérent avec l'architecture Tools existante (mêmes `roles_applications_elsatia`, même résolveur, même application).

## 11. Versioning, existant / projeté, hors ligne

- **Versions** (§17) : `initial` (unique, v1), `corrige`, `projete`, `as_built` (alias anglais `corrected`, `projected`, `as-built`) ; identifiant, numéro, **base** (même projet, FK composite), type, date, auteur, empreinte SHA-256, instantané complet ; **immuables** (aucun UPDATE). Plusieurs versions coexistent sans écrasement. La comparaison future s'appuie sur les instantanés et la lignée (transmise à GP, §13). Aucune vue de diff (lot 14).
- **Existant / projeté** (§18) : `etat` d'étage `existant | projet` + versions `projete` / `as_built` : le modèle permet de séparer plan existant et plan rénové sans refonte. Aucun éditeur rénovation.
- **Hors ligne** (§26) : non implémenté (en ligne via PostgREST). Le modèle ne l'empêche pas : UUID générés côté client (`newUuid`, l'UI crée avec ses propres identifiants), `revision` sur chaque ligne et conflit explicite (`ReleveConflictError`), suppression douce (tombstones), journal, versions immuables pour la reprise. Le dépôt IndexedDB et la file de synchronisation sont au Lot 3 (roadmap).

## 12. UI minimale, mobile, Playwright

### 12.1 Écrans (§24)

| Écran | Route |
|---|---|
| Mes relevés | `/releves` |
| Nouveau relevé (projet + premier chantier) | `/releves/nouveau` |
| Fiche relevé (identité, chantiers, partage, versions typées) | `/releves/fiche?id=` |
| Navigation bâtiment → étage → zone / pièce | `/releves/structure?id=&chantier=&batiment=&etage=` |

Sans `releve-metre` : écran « module premium en préversion », sans prix ni achat ; pages `noindex`, hors sitemap ; lien d'accueil réservé aux détenteurs.

### 12.2 Mobile (§25)

Vérifié par Playwright à 390 × 844 (smartphone) et 820 × 1180 (tablette) : liste, fiche et structure utilisables, aucun débordement horizontal. Caméra, AR, LiDAR : **non revendiqués** (non implémentés, non testés).

### 12.3 Pile de recette réelle

`scripts/local-postgres-bootstrap/releve_e2e_stack.sh` : GoTrue compilé depuis les sources, PostgREST (binaire officiel), PostgreSQL 16 avec les 344 migrations, proxy `local_supabase_proxy.mjs` (nouveau CORS **opt-in** `CORS_ORIGINS`, comportement inchangé sans la variable — Tools est un client navigateur pur, Kong répond aux preflights en production), comptes A et B via l'API admin GoTrue, jeu `releve_e2e_seed.sql` (tenant A = entreprise pilote, tenant B créé ; entitlement **interne**).

### 12.4 Playwright (§30) — `tests/e2e/tools-releve-lot2.spec.ts`, 4/4

1. Tenant A : connexion réelle, **création relevé** (+ premier chantier), **création bâtiment**, **étage**, **pièce**, **persistance** après rechargement complet, **navigation** fil d'Ariane fiche ↔ liste.
2. Tenant B : relevé de A absent de la liste, **inaccessible par URL directe** (fiche et structure : « Relevé introuvable ou non accessible »).
3. Smartphone et 4. tablette : parcours sans débordement.

La spec est ignorée sans `RELEVE_E2E_*` (elle ne vise jamais Gestion Pro).

## 13. Contrat GP et cible Gestion Pro

### 13.1 Contrat (§22) — `packages/releve-domain/src/gp-sync.ts`, statut `contract-only`

17 sections : `client`, `chantier`, `building`, `floor`, **`zone`**, `room`, `walls`, `openings`, `measurements`, `quantities`, `photos`, `annotations`, `materials`, **`coverings`**, **`equipments`**, `exports`, **`versions`** (gras : ajoutées par ce lot). Une enveloppe = un chantier Tools ↔ un chantier GP ; on transmet une **version** immuable (et sa lignée) ; idempotence `tools-releve:{releve}:v{n}:gp-chantier:{gp}` ; mm → m (3 décimales), mm² → m², mm³ → m³ ; **aucun prix** (testé). Aucune écriture GP, aucun moteur de devis.

### 13.2 Cible Gestion Pro (§23)

| Objet GP | Existant | Classement | Alimentation future par Relevé |
|---|---|---|---|
| `metres` (« Métré », `chantier_id`, `devis_id`, numéro `MET-…`, écran `/ouvrages`) | oui (`20260715000080`) | **REUSABLE** | un `metres` par enveloppe (chantier GP, version) |
| `lignes_metres` (désignation, formule, longueur, largeur, hauteur, nombre, déduction, résultat, unité) | oui | **MAPPING_REQUIRED** | `quantities[]` → `designation`, `formule`, `resultat`, `unite` ; dimensions depuis `measurements[]` |
| « Métré assisté » (`creerMetreAction` : longueur × largeur/hauteur × nombre − déduction) | oui, saisie manuelle | **REUSABLE** | même forme de ligne, calculée par Tools |
| Bibliothèque d'ouvrages (`modeles_devis`, `lignes_modeles_devis`) | oui | **MAPPING_REQUIRED** | `quantities[].gpOuvrageRef` (ajouté) |
| Articles / prestations (`prestations_catalogue`) | oui | **MAPPING_REQUIRED** | `materials[].gpPrestationRef` (suggestion, jamais un prix) |
| Devis (`devis`, `lignes_devis`) | oui | **REUSABLE** (côté GP) | hors Tools : le chiffrage reste dans GP |
| Pièces jointes (`documents_chantier`) | oui | **REUSABLE** | `photos[]`, `exports[]` |
| RPC d'import `SECURITY DEFINER` + double autorisation (`releve-metre` + `gerer_ouvrages`) | non | **MISSING** | lot 17 |
| Unité « m³ » dans `UNITES` GP (`src/lib/devis.ts` : u, m², ml, h, forfait, kg, L) | non | **MISSING** | à ajouter avant de transmettre des volumes |
| Structure bâtiment / étage / pièce, murs, ouvertures, revêtements, annotations, versions | non | **MISSING** (côté GP) | transmis dans l'enveloppe ; stockage GP à concevoir (lot 17) |

## 14. Tests

### 14.1 Ajoutés / portés

| Suite | Fichier | Tests | Origine |
|---|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_foundation_v1.test.sql` | 74 | porté |
| pgTAP | `elsatia_tools_releve_metre_lot2_complements.test.sql` | 66 | porté |
| pgTAP | `elsatia_tools_releve_metre_recovery_v2.test.sql` | 21 (R1–R12, C1–C9) | **ce lot** |
| pgTAP | `elsatia_tools_releve_metre_rgpd_purge_v1.test.sql` | 13 (P1–P13) | **ce lot** |
| Vitest | `packages/releve-domain` (9 fichiers) | 106 | 94 portés + **12 ce lot** |
| Vitest | `apps/tools` : `releve-adapter`, `navigation`, `access` | 14 | portés |
| Playwright | `tests/e2e/tools-releve-lot2.spec.ts` | 4 | **ce lot** |

Total : **174 pgTAP, 120 Vitest, 4 Playwright** (dont nouveaux dans ce lot : 34 pgTAP, 12 Vitest, 4 Playwright).

Couverture demandée (§28) : hiérarchie (L1–L17, bloc C), RLS et cross-tenant (M, E, D, R, P), capability (B, K, R9), Storage metadata (G, M21–M22, P6, P10), versions (N), contrat GP (non matérialisé en base : Vitest `gp-sync.test.ts`), RGPD (P).

### 14.2 Commandes

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot2                   → 344 migrations OK
(V3 worktree) rebuild_db.sh v3_up + seed pilote + 601…604             → upgrade OK, pg_dump identique
cd supabase/tests && pg_prove -d lot2 elsatia_tools_releve_metre_*    → 174/174
cd supabase/tests && pg_prove -d lot2 *.test.sql                      → 137 fichiers, 3 369 tests, 9 fichiers KO = V3 pur
npx vitest run packages/releve-domain                                 → 106/106
npx vitest run ; (apps/tools) npx vitest run                          → 1 960/1 960 ; 2 006/2 006
npx tsc --noEmit ; (apps/tools) npm run typecheck                     → 0 erreur
npx eslint ; (apps/tools) npm run lint                                → 0 erreur
(apps/tools) NEXT_PUBLIC_TOOLS_ENV=local npm run build / build:native → OK
npx next build                                                        → OK
node scripts/verify-migrations.mjs                                    → 344 valides
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + next dev :3020
  + npx playwright test tests/e2e/tools-releve-lot2.spec.ts           → 4/4
```

### 14.3 Échecs pgTAP préexistants (identiques sur V3 pur)

`platform_stripe_state_attestation_r72` (stub `pgsodium`), 7 fichiers `studio_*` (fixture incompatible avec la politique d'inscription Studio), `elsatia_tools_cloud_sync_entitlement_closure_v1` (bloc `service_role` sans GRANT sur `tools_projects` dans le banc). Même liste et mêmes compteurs avant/après ; aucun ne touche un objet Relevé.

## 15. Régressions (§31)

Aucune. Tools : 176 fichiers Vitest / 2 006 tests verts, parmi lesquels les fichiers de test qui couvrent l'Atelier (23 par nom), les arches (21 les mentionnent), les rosaces (30), le dessin libre (12), la photo calibrée (16), les exports PDF/DXF/SVG/PNG/impression (13), Free/Pro/entitlements (`access`, `billing`) ; cloud sync : pgTAP `elsatia_tools_r8/r9/r10` verts, `cloud_sync_entitlement_closure_v1` dans le même état qu'en V3 pur. Fichiers Tools existants modifiés par le Lot 2 : `next.config.ts` (transpilation du domaine), `HomeDashboard.tsx` (lien « Relevés » si capability), `access.ts` (+ add-on, bundle), `tsconfig.json`, `vitest.config.ts` ; hors Tools : `tsconfig.json` et `vitest.config.ts` racine (inclusion du package), proxy local (CORS opt-in). Les builds Tools web, Tools natif et Gestion Pro passent.

## 16. Limites

| Sujet | État |
|---|---|
| Storage réel | policies et métadonnées prouvées ; upload/signature par le vrai `storage-api` non exécutés |
| Hors ligne | non implémenté (Lot 3) |
| Éditeurs (murs, ouvertures, annotations, cotes) | contrats seulement |
| Comparaison de versions | modèle et lignée seulement |
| Synchro GP | contrat seulement ; RPC, double autorisation, m³ côté GP manquants |
| Export RGPD : manifeste de fichiers | les lignes `tools_releves_medias` (avec `storage_path`) sont exportées, mais `manifeste_fichiers_entreprise()` (V3) ne liste pas le bucket `tools-releves` — non modifié ici (fonction RGPD du train) : **reste à faire** (lot 11) |
| Suppression d'un compte propriétaire | `tools_releves.proprietaire_id → utilisateurs` en `ON DELETE RESTRICT` : supprimer physiquement un utilisateur qui possède des relevés est refusé tant qu'ils ne sont pas transférés ou purgés (la purge d'entreprise, elle, passe — P8). À traiter avec le flux de suppression de compte (lot 11) |
| Site principal vs chantiers | `tools_releves.chantier_*` amorce le premier chantier, non resynchronisé ensuite |
| Qualification | locale uniquement ; aucune Preview, aucune production |

## 17. Écarts avec le Lot 1

| Lot 1 (audit + roadmap) | Réalité après Lot 2 |
|---|---|
| Roadmap Lot 2 = ADR + types + migrations **proposées** (`docs/migrations-proposees/`) | migrations **réelles** + UI minimale livrées (anticipation d'une partie du Lot 3 : tables, gate serveur, écrans liste/structure) ; aucune `docs/migrations-proposees/` |
| Contrat `packages/releve-contracts` v0 | remplacé par `packages/releve-domain` (types + validation + service + contrats) |
| 5 conditions §0.2 | 1 agrégat distinct ✔ ; 2 entitlement add-on ✔ ; 3 Relevé Pro ⊃ Tools Pro outillé, **à confirmer** (D4) ; 4 capture : hors lot, sources réservées ✔ ; 5 stockage : bucket privé + RGPD purge prouvée ✔, manifeste et rétention photo au lot 11 |
| Lot 3 « Structure » | déjà en ligne et testé ; restent l'IndexedDB, la synchro hors ligne, la RPC de sync |
| Mesures, annotations, revêtements | contrats plus riches que prévu au Lot 1 (604) |

## 18. Prêt pour le Lot 3

**Oui.** Le Lot 3 peut démarrer sur cette branche (ou sur le train qui l'intégrera) :

- prêts : hiérarchie Projet → Chantier → Bâtiment → Étage → Zone → Pièce persistée, sécurisée et testée ; service de domaine indépendant du framework ; UUID client et révisions ; création réelle via PostgREST prouvée ; UI minimale ; pile e2e reproductible ;
- à faire au Lot 3 : dépôt IndexedDB `elsatia-releve[-company:<id>]`, file de synchronisation et résolution de conflits, RPC de synchro si retenue, recette hors ligne ;
- non bloquant pour le Lot 3 mais à trancher avant commercialisation : D4 (Relevé Pro ⊃ Tools Pro) ; avant intégration à un train : D2 (runbook preview 344).

## 19. DECISION_REQUIRED (choix conservateurs pris)

| # | Sujet | Choix |
|---|---|---|
| D1 | Nom de branche recommandé vs branche de session | branche de session ; renommage possible par un push de référence |
| D2 | Runbook preview V3 (340 / `…505`) | non modifié ; 344 / `…604` si intégration |
| D3 | Appariement type ↔ unité des mesures en SQL | domaine seul (pas de durcissement rétroactif) |
| D4 | Relevé Pro inclut Tools Pro | outillé, non commercial, à confirmer |
| D5 | Manifeste RGPD de fichiers et `ON DELETE RESTRICT` propriétaire | documentés, non modifiés (fonctions RGPD du train, lot 11) |

---

## 20. Matrice de conformité

Statuts : **EXISTAIT DÉJÀ** (retrouvé, vérifié sur V3) · **CORRIGÉ** · **AJOUTÉ** (par ce lot) · **NON NÉCESSAIRE AU LOT 2** · **RESTE À FAIRE**.

| § | Exigence | Status | Evidence | File / Migration | Test | Remaining work |
|---|---|---|---|---|---|---|
| 0 | Fetch + recherche du travail perdu (branches, log, grep, arbres) | AJOUTÉ | 3 branches, 6 commits identifiés (§3) | — | — | — |
| 1 | Base = train V3, pas `main` | AJOUTÉ | branche recréée depuis `ef7443c0` | — | ancestralité vérifiée | — |
| 1 | Porter l'ancien travail, résoudre collisions, renuméroter | CORRIGÉ | 401/501 → 601/602 | `20260927000601`, `…602` | `verify-migrations` 344 | — |
| 1 | Ne jamais modifier une migration appliquée | EXISTAIT DÉJÀ | aucune migration V3 touchée | — | diff V3..HEAD | — |
| 2 | Retrouver audit et roadmap Lot 1 | EXISTAIT DÉJÀ | portés | `docs/product/…EXISTING_AUDIT_V1.md`, `…ROADMAP_V1.md` | — | — |
| 3 | Relevé dans Tools, pas une nouvelle app | EXISTAIT DÉJÀ | routes `apps/tools/src/app/releves/*` | — | build Tools | — |
| 3 | Positionnement Tools / GP (chiffrage dans GP) | EXISTAIT DÉJÀ | aucun prix transmis, contrat-only | `gp-sync.ts` | `gp-sync.test.ts` | — |
| 3 | Prix 24,90 / 249 € HT, non activé | EXISTAIT DÉJÀ | `RELEVE_METRE_OFFER`, CHECK non commercial | `entitlement.ts`, 602 | K1–K2, K5, `entitlement.test.ts` | D4 |
| 4 | Type de projet `releve` distinct (domaine, persistance, UI, permissions, exports, GP) | EXISTAIT DÉJÀ | §7 | `model.ts`, 601 | A-bloc, `hierarchy.test.ts` | — |
| 4 | Atelier non transformé | EXISTAIT DÉJÀ | `TracingProject` inchangé | — | Vitest Tools 2 006 | — |
| 5 | Hiérarchie Projet → Chantier → Bâtiment → Étage → Zone → Pièce | EXISTAIT DÉJÀ | 6 tables, FK composites | 601, 602 | L1–L4, Playwright 1 | — |
| 5 | Par niveau : id, tenant, parent, nom, ordre, timestamps, auteurs, suppression, RLS, audit | EXISTAIT DÉJÀ | §6.1 (vérifié par `information_schema`) | 601, 602 | L13–L17, M-bloc | — |
| 6 | Releve, Batiment, Etage, Zone, Piece | EXISTAIT DÉJÀ | IMPLEMENTED | `model.ts` | Vitest, pgTAP | — |
| 6 | Wall, Opening, Door, Window, Equipment | EXISTAIT DÉJÀ + AJOUTÉ | FOUNDATION_ONLY ; champs 604 | `model.ts`, 604 | C2–C3, C8–C9 | éditeurs (lots 5–8) |
| 6 | Measurement, PhotoAnchor, Annotation, Material, Quantity | CORRIGÉ | FOUNDATION_ONLY ; contrats complétés | `model.ts`, `validation.ts`, 604 | C1, C4–C7, `validation.test.ts` | éditeurs (lots 9–12) |
| 6 | Version | EXISTAIT DÉJÀ | IMPLEMENTED | 602 | N1–N12 | — |
| 7 | Contrat mur : segment, longueur, épaisseur, hauteur, type, matériau, ouvertures, pièce(s) | CORRIGÉ | matériau et pièces adjacentes ajoutés ; longueur dérivée | `MurDonnees`, 604 | C2, C9 | éditeur mur |
| 7 | Réutiliser le moteur Tools, pas de reconstruction | EXISTAIT DÉJÀ | mm / `Point2D`, aucun moteur | `model.ts` | — | — |
| 8 | Ouvertures porte / fenêtre / baie / ouverture libre | EXISTAIT DÉJÀ + AJOUTÉ | `OUVERTURE_FAMILLES` | `model.ts` | `gp-sync.test.ts` | — |
| 8 | Mur parent, position, largeur, hauteur, type, sens, allège, metadata | CORRIGÉ | metadata ajoutée | 604 | C3, C8 | UI graphique |
| 9 | Capability `releve-metre` add-on distincte | EXISTAIT DÉJÀ | §8 | 601 | B-bloc, K7, R9 | — |
| 9 | Ne casse ni Free, ni Pro, ni droits perso / org / projet | EXISTAIT DÉJÀ | résolveur identique (28 utilisateurs) | 601, 602 | K4, K7, K9, r8/r9/r10, upgrade | — |
| 9 | Aucune activation commerciale | EXISTAIT DÉJÀ | trigger + CHECK | 601, 602 | B2–B3, I4, M27, K2 | — |
| 9 | Prix non dispersé | EXISTAIT DÉJÀ + CORRIGÉ | scan étendu à toutes les migrations Relevé | `entitlement.test.ts` | idem | — |
| 10 | Relevé Pro peut donner Tools Pro sans duplication | EXISTAIT DÉJÀ | catalogue + extension | 602 | K3, K8 | D4 |
| 10 | Stripe réel non modifié | EXISTAIT DÉJÀ | aucun fichier Stripe touché | — | diff | — |
| 11 | Arborescence photos / documents / exports | EXISTAIT DÉJÀ | §10.1 | 601, `storage.ts` | G1–G4 | — |
| 11 | Tenant-safe, ownership projet, bucket privé | EXISTAIT DÉJÀ | `tools_releve_storage_autorise` | 601 | G4, M21–M22 | — |
| 11 | URLs signées | AJOUTÉ | `signedUrlRequest`, TTL 600 s | `storage.ts` | `storage.test.ts` | branchement UI (lot 11) |
| 11 | Suppression compatible RGPD | AJOUTÉ (preuve) | purge V3 couvre tables et fichiers | — | P4–P13 | manifeste fichiers, D5 |
| 11 | Pas de dépendance native | EXISTAIT DÉJÀ | domaine TS pur | — | build natif | — |
| 12 | PhotoAnchor → projet, bâtiment, étage, zone, pièce, mur, équipement, point | EXISTAIT DÉJÀ | `Ancre` point / entité | `model.ts` | `validation.test.ts` | capture (lot 4) |
| 13 | Annotations texte, flèche, cercle, zone, dimension, symbole, commentaire | CORRIGÉ | `ANNOTATION_FORMES` + géométrie | 604 | C5–C6 | éditeur |
| 14 | Mesures longueur, largeur, hauteur, diagonale, surface, volume, angle, distance libre | CORRIGÉ | largeur, distance, volume ajoutés | 604 | C4 | — |
| 14 | Unité, valeur, source, objet lié, manuel / calculé / capturé, précision | CORRIGÉ | source `calcule`, `mesureMode` | 604, `model.ts` | C4, `sql-parity` | — |
| 15 | Matériaux / revêtements (sols, murs, plafonds, faïence, peinture, carrelage, moquette, parquet, PVC, panneaux…) sans catalogue | CORRIGÉ | `REVETEMENT_TYPES` | 604 | C5, C7 | catalogue (lot 10) |
| 16 | Quantités ml, m², m³, u | EXISTAIT DÉJÀ | `QUANTITE_UNITES` | 601 | parité | — |
| 16 | Liens room, wall, opening, material, work item | CORRIGÉ | `sources`, `gpOuvrageRef` ajoutés | 604 | C5 | métré auto (lot 12) |
| 17 | Versions initial / corrected / projected / as-built | EXISTAIT DÉJÀ | §11 | 602 | N1–N12 | — |
| 17 | Id, parent/source, statut, date, auteur, sans écrasement, comparaison future | EXISTAIT DÉJÀ | immuables, empreinte, base | 602 | N8–N10 | vues de diff (lot 14) |
| 18 | Existant / projeté possible | EXISTAIT DÉJÀ | `etat` d'étage + versions | 601, 602 | N | éditeur rénovation (lot 14) |
| 19 | RLS owner, org member, autre org, non autorisé, anon, service role — en base | EXISTAIT DÉJÀ + CORRIGÉ | §10.3 ; faux refus RETURNING corrigé | 601–603 | M, R, P | — |
| 19 | Aucun cross-tenant | EXISTAIT DÉJÀ | base + navigateur | — | E, M16–M21, R8, P2, Playwright 2 | — |
| 20 | Actions view, create, edit, delete, share, export, sync-gp | EXISTAIT DÉJÀ | parité SQL ↔ TS | 601, `permissions.ts` | D-bloc, `permissions.test.ts`, R11 | — |
| 21 | Couche métier hors React / Next | EXISTAIT DÉJÀ | `packages/releve-domain`, 0 dépendance | — | `service.test.ts` | — |
| 22 | Contrat GP : client, chantier, building, floor, zone, room, walls, openings, measurements, quantities, photos, annotations, materials, coverings, equipment, exports, versions | CORRIGÉ | 4 sections ajoutées (17) | `gp-sync.ts` | `gp-sync.test.ts` | RPC d'import (lot 17) |
| 22 | Pas de moteur de devis | EXISTAIT DÉJÀ | contract-only | — | — | — |
| 23 | Existant GP : métré assisté, tables, ouvrages, quantités, articles, devis ; REUSABLE / MISSING / MAPPING_REQUIRED | AJOUTÉ | §13.2 | — | — | RPC, m³, stockage structure GP |
| 24 | Mes relevés, Nouveau relevé, fiche, navigation bâtiment / étage / zone-pièce | EXISTAIT DÉJÀ | §12.1 | `apps/tools/src/app/releves/*` | Playwright 1 | — |
| 24 | Pas de LiDAR / AR / scan / IA / plan auto / rénovation / métrés complets | EXISTAIT DÉJÀ | rien de tel | — | — | lots 4+ |
| 25 | Desktop, tablette, smartphone | AJOUTÉ (preuve) | 390 px et 820 px sans débordement | — | Playwright 3–4 | appareils physiques (lot 19) |
| 25 | Pas de fausse revendication caméra / AR / LiDAR | EXISTAIT DÉJÀ | sources réservées, non implémentées | — | — | lot 4 |
| 26 | Modèle compatible hors ligne (UUID client, sync, reprise, conflits) | EXISTAIT DÉJÀ | §11 | `ids.ts`, `repository.ts` | `service.test.ts` | IndexedDB + sync (Lot 3) |
| 27 | Migrations sur V3, numéros neufs, plage monotone | CORRIGÉ + AJOUTÉ | 601–604 | 601–604 | `verify-migrations` | — |
| 27 | Fresh install, upgrade V3, idempotence, comparaison de schéma | AJOUTÉ (preuve) | §5 | — | 344/344 ; upgrade ; pg_dump 0 diff | ne jamais rejouer à la main |
| 28 | pgTAP hiérarchie, RLS, cross-tenant, capability, Storage, versions, GP | EXISTAIT DÉJÀ + AJOUTÉ | 174 tests | `supabase/tests/elsatia_tools_releve_metre_*` | 174/174 | GP non matérialisé en base |
| 29 | Vitest, typecheck, lint, build Tools, régressions packages | AJOUTÉ (ré-exécution) | §0 | — | 106 / 1 960 / 2 006, 0 erreur, builds OK | — |
| 30 | Playwright création relevé / bâtiment / étage / pièce, navigation, persistance, cross-tenant | AJOUTÉ | 4/4 sur pile réelle | `tests/e2e/tools-releve-lot2.spec.ts`, `releve_e2e_stack.sh` | 4/4 | CI (non branché) |
| 31 | Non-régression Atelier, arches, rosaces, dessin libre, photo calibrée, exports, Free, Pro, cloud sync | AJOUTÉ (ré-exécution) | §15 | — | Vitest Tools, pgTAP r8–r10 | — |
| 32 | Ancien travail non supposé correct ; statut par exigence | AJOUTÉ | ce tableau ; défaut RLS trouvé | — | — | — |
| 33 | Rapport Recovery V2 autonome (18 rubriques) | AJOUTÉ | ce document | `docs/product/…_LOT2_FOUNDATION_RECOVERY_V2.md` | — | — |
| 34 | Matrice de conformité complète | AJOUTÉ | ce tableau | — | — | — |
| 35 | Verdict exact | AJOUTÉ | §0 | — | — | — |
| 36 | Lot 2 déjà fait → ne pas refaire, vérifier sur V3, rejouer, porter | AJOUTÉ | cherry-pick + vérification + correctifs ciblés | — | tout | — |
| 37 | Ne pas partir dans les lots 3+ | EXISTAIT DÉJÀ | aucun AR, LiDAR, scan, IA, métré, rénovation, estimation, PDF, sync GP, chiffrage | — | — | — |
| 38 | Branche dédiée depuis V3, commits petits, pas de PR, pas de merge, push branche | AJOUTÉ | 6 commits de ce lot, push seul | — | — | D1 |
| 39 | Sortie finale | AJOUTÉ | réponse de fin de mission | — | — | — |
