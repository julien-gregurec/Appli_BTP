# ELSATIA Tools — Relevé & Métré — Lot 2 — Architecture Foundation V1

**Date** : 2026-09-26
**Base** : `origin/integration/elsatia-canonical-train-v2` @ `819ebe56` (train canonique V2, 335 migrations), plus le commit docs du lot 1 (`fe3362d9`) rapporté par cherry-pick
**Branche** : `claude/dazzling-gates-uzfkvz`
**Entrées** : [Audit lot 1](./ELSATIA_TOOLS_RELEVE_METRE_EXISTING_AUDIT_V1.md) · [Roadmap V1](./ELSATIA_TOOLS_RELEVE_METRE_ROADMAP_V1.md)
**Hors périmètre, volontairement** : capture caméra / AR / LiDAR, moteur de plan, synchronisation GP réelle, paiement, SKU, activation commerciale.

---

## 0. Verdict

> **RELEVE METRE LOT 2 FOUNDATION QUALIFIED**

Les fondations serveur, domaine et interface minimale sont en place et testées pour de vrai :

| Contrôle | Résultat (exécuté dans cette session) |
|---|---|
| pgTAP nouveau fichier `elsatia_tools_releve_metre_foundation_v1.test.sql` | **74 / 74** sur une base rejouée de zéro (336 migrations) |
| pgTAP suite complète (127 fichiers, 2 906 tests) | **aucune régression** : les 11 mêmes fichiers échouent avant et après, pour des limites connues du banc local (voir §12.3) |
| Vitest domaine `packages/releve-domain` | **81 / 81** (8 fichiers) |
| Vitest `apps/tools` | **2 004 / 2 004** (176 fichiers ; base 1 992 / 174) |
| Vitest racine (GP + packages) | **1 934 / 1 934** (165 fichiers) |
| `tsc` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements, tous antérieurs et hors des fichiers ajoutés) |
| `next build --webpack` Tools (web) et `build:native` (export statique Capacitor) | OK ; `/releves` et `/releves/structure` statiques |
| `next build` Gestion Pro (racine) | OK |

Les cinq conditions de l'audit (§0.2) sont tranchées ou explicitement bornées (§2.2). Deux sujets restent à confirmer par le produit, sans bloquer le lot 3 : Relevé Pro inclut-il Tools Pro (hypothèse retenue : oui), et la politique de purge RGPD des photos (lot 11).

---

## 1. Base

- `git fetch` : le **train canonique V2** existe désormais (`integration/elsatia-canonical-train-v2`, 17:10 UTC). Il est plus récent que le V1 audité au lot 1. La branche de travail a été repositionnée dessus.
- Les documents du lot 1 vivaient sur `claude/happy-ritchie-7ji6xa` (base V1). Ils sont rapportés tels quels (`git cherry-pick fe3362d9`), sans conflit.
- Santé de la base, mesurée avant toute modification : Tools 174 fichiers / 1 992 tests verts ; pgTAP 126 fichiers dont 11 en échec connu (§12.3).

---

## 2. Décisions matérialisées

### 2.1 Décisions produit reçues

| Décision | Où elle est matérialisée |
|---|---|
| Nouveau type de projet « relevé » | `TOOLS_PROJECT_KINDS = ["calculateur","atelier","releve"]` (domaine) ; colonne `tools_releves.type_projet = 'releve'` ; agrégat distinct de `ToolProject` et `TracingProject` |
| Relevé & Métré reste dans Tools | même application `tools`, mêmes rôles `roles_applications_elsatia`, même résolveur `tools_resoudre_entitlements()`, routes `apps/tools/src/app/releves/*` |
| Module premium | capability d'**add-on**, jamais incluse dans le palier Pro ; UI verrouillée sans elle ; gate serveur (RLS) |
| Capability candidate `releve-metre` | `tools_capabilities_addon()` (SQL), `ADDON_CAPABILITIES` (Tools), `RELEVE_METRE_CAPABILITY` (domaine) |
| 24,90 € HT / mois / utilisateur ; 249 € HT / an / utilisateur | `RELEVE_METRE_OFFER` (`monthlyPriceCents: 2490`, `annualPriceCents: 24900`, `perUser`, `vat: "HT"`, `status: "working-price"`) — **uniquement dans le code de domaine, jamais affichés** |
| Aucune activation commerciale automatique | `commercialActivation: false` ; aucun SKU accepté par la base ; **trigger** `tools_releve_metre_non_commercial` qui refuse `releve-metre` sur toute ligne d'entitlement de source `web`/`apple`/`google` ; aucun bouton d'achat |

### 2.2 Les cinq conditions de fondation de l'audit (§0.2)

| # | Condition | Décision lot 2 |
|---|---|---|
| 1 | Modèle de projet | Nouvel agrégat `Releve`, **distinct** de `TracingProject`. Persistance **hybride** (§3.1) : hiérarchie relationnelle + éléments métier dans une table générique typée. La géométrie future reste un modèle métier au-dessus d'Engine B (pas de 3ᵉ moteur). |
| 2 | Entitlement add-on | Fait : catalogue SQL unique, add-on hors palier Pro, résolveur inchangé pour Free/Pro, attribution plateforme autorisée (§7). |
| 3 | Cohérence tarifaire | Prix de travail figés en code. **Hypothèse de travail** : Relevé Pro *inclut* Tools Pro (`includesToolsPro: true`, et techniquement une ligne `releve-metre` est une ligne `niveau = 'pro'`). **À confirmer** par le dirigeant avant le lot 21. |
| 4 | Stratégie capture | Hors lot 2. Le modèle réserve `source ∈ {manuel, laser, photo, ar, lidar}` pour les mesures et la catégorie de stockage `photos` ; aucune capacité matérielle n'est revendiquée. Ordre conservé de la roadmap : saisie guidée + photo (4a) avant tout spike AR/LiDAR (4b). |
| 5 | Stockage cloud | Bucket privé `tools-releves`, chemins tenant/relevé, quotas par catégorie (§8). Purge : cascade `entreprises → tools_releves → *` côté service_role. **Reste au lot 11** : purge des objets Storage orphelins et politique de rétention photo. |

---

## 3. Architecture (ADR)

### 3.1 Persistance : hiérarchie relationnelle + éléments génériques typés

L'audit proposait un document JSON unique par relevé (pattern `tools_projects`). Le lot 2 retient un **hybride**, pour trois raisons :

1. **Le serveur doit autoriser par nœud.** La matrice view/edit/share et l'isolation tenant doivent s'appliquer à chaque bâtiment, étage, pièce ; un blob JSON ne se protège qu'en bloc.
2. **Les clés étrangères composites rendent l'erreur impossible, pas seulement détectée.** `(batiment_id, releve_id) → tools_releves_batiments(id, releve_id)`, `(zone_id, etage_id) → tools_releves_zones(id, etage_id)`, `(releve_id, entreprise_id) → tools_releves(id, entreprise_id)` : un étage ne peut pas pendre sous le bâtiment d'un autre relevé, une pièce ne peut pas être dans la zone d'un autre étage, un enfant ne peut pas porter un `entreprise_id` forgé (tests pgTAP C6, C7, E7).
3. **La géométrie n'est pas encore stable.** Murs, ouvertures, mesures… évolueront aux lots 5 à 12. Ils vivent dans `tools_releves_elements` (discriminant `type`, rattachements en colonnes contrôlées, attributs dans `donnees jsonb` validés côté SQL pour les clés essentielles et côté domaine finement). Ajouter un attribut ne demandera pas de migration.

Le hors-ligne (lot 3) garde le principe de l'audit : identifiants générés côté client (UUID), révision optimiste par ligne, file de mutations locale.

### 3.2 Domaine partagé `packages/releve-domain`

Package sans dépendance (ni React, ni Supabase), consommé par Tools web, le WebView Capacitor et un futur module natif de capture :

| Module | Rôle |
|---|---|
| `model.ts` | 14 entités, énumérations partagées avec le SQL, conventions (mm, rad, Y-up Engine B) |
| `validation.ts` | saisies et charges d'éléments ; bornes **identiques** aux CHECK SQL ; jamais d'exception implicite |
| `hierarchy.ts` | arbre chantier → bâtiment → étage → zone → pièce, contrôles d'intégrité, descendants de cascade |
| `permissions.ts` | matrice view/create/edit/delete/share/export/sync-gp (miroir de `tools_releve_peut`) |
| `entitlement.ts` | capability `releve-metre`, offre en prix de travail, garde-fou de non-activation |
| `storage.ts` | contrat de chemins du bucket `tools-releves` |
| `gp-sync.ts` | contrat v1 de transmission vers Gestion Pro (non branché) |
| `repository.ts` | port `ReleveRepository` + implémentation mémoire (spécification exécutable) |
| `service.ts` | cas d'usage : valide → autorise → délègue au dépôt |

Un test de **parité** (`sql-parity.test.ts`) lit la migration et échoue dès qu'une énumération, une borne ou une liste MIME diverge entre TypeScript et SQL.

### 3.3 Tools

- `apps/tools/src/lib/releve/` : adaptateur Supabase du port (`SupabaseReleveRepository`), mapping ligne ↔ domaine, contexte d'acteur (`tools_releve_contexte`), navigation par paramètres de requête.
- Aucun composant React ne contient de règle métier : ils appellent `ReleveService`.
- Tools n'a ni route API ni server action (export statique natif) : tout passe par PostgREST sous RLS, comme les projets calculateur.

---

## 4. Modèle de données

Migration : `supabase/migrations/20260926000401_tools_releve_metre_foundation_v1.sql`.

Colonnes communes à toutes les tables métier : `entreprise_id` (tenant), `created_at/updated_at`, `created_by/updated_by` (ownership, audit), `revision` (concurrence optimiste, incrémentée par trigger), `deleted_at/deleted_by` (suppression douce restaurable). Les métadonnées sont **imposées par le serveur** (triggers) : le client ne peut ni antidater, ni changer d'auteur, ni changer de relevé ou d'entreprise.

| Entité | Stockage | Points clés |
|---|---|---|
| **Releve** | `tools_releves` | `proprietaire_id` (forcé = appelant), `visibilite` prive/entreprise, `statut`, chantier local + `chantier_gp_id` / `client_gp_id` (liens faibles GP, même entreprise exigée), `schema_version` |
| **Batiment** | `tools_releves_batiments` | ordre, notes |
| **Etage** | `tools_releves_etages` | `niveau` −10…200, altitude, hauteur sous plafond, `etat` existant/projet (plan rénové, lot 14) |
| **Zone** | `tools_releves_zones` | type (logement, lot, parties communes…) |
| **Piece** | `tools_releves_pieces` | usage (17 valeurs), HSP, zone facultative sur le même étage |
| **Mur** | `tools_releves_elements` `type='mur'` | `a`, `b` (mm), épaisseur > 0, type ; étage obligatoire |
| **Ouverture** | idem `type='ouverture'` | hébergée par un **mur du même étage** (`parent_element_id`), décalage, largeur, hauteur, allège, sens |
| **Equipement** | idem `type='equipement'` | catégorie (mobilier, électricité, plomberie, CVC, éclairage), position, rotation |
| **Mesure** | idem `type='mesure'` | cible, type, valeur, unité cohérente (mm/rad/mm²), source (manuel…lidar), précision |
| **PhotoAnchor** | idem `type='photo_anchor'` | média + ancre (point d'étage ou entité) |
| **Annotation** | idem `type='annotation'` | texte ≤ 2 000, ancre, note vocale facultative |
| **Materiau** | idem `type='materiau'` | catégorie, unité ⊂ unités GP, perte %, référence prestation GP (suggestion, jamais un prix) |
| **Quantite** | idem `type='quantite'` | **dérivée** (clé, formule, qualité exacte/estimée) : cache pour export et GP |
| **Version** | `tools_releves_versions` | instantané **immuable** (structure + éléments + médias actifs), numéro par relevé, empreinte SHA-256 ; créé uniquement par `tools_releve_creer_version()` |

Tables de support : `tools_releves_medias` (fichiers du bucket), `tools_releves_journal` (audit append-only), `tools_releves_exports_gp` (journal d'idempotence GP, sans écrivain au lot 2).

**Suppression douce en cascade** (trigger) : bâtiment → étages ; étage → zones, pièces, éléments ; pièce → éléments ; mur → ouvertures. La restauration est symétrique et **ne ranime que ce que la même cascade a supprimé** (même horodatage serveur). Une zone supprimée n'emporte pas ses pièces (regroupement, pas contenant). Aucune suppression physique n'est ouverte à l'application.

**Audit** : chaque création / modification / suppression / restauration / partage / transfert / version produit une ligne `tools_releves_journal` (entité, identifiant, action, **noms** des champs modifiés, auteur, horodatage). Le journal ne recopie aucun contenu (adresse, notes) : pas de duplication de données personnelles.

**Future sync GP** : `chantier_gp_id`, `client_gp_id`, `materiau.gpPrestationRef`, versions immuables et journal `tools_releves_exports_gp` (clé d'idempotence unique) sont en place dès maintenant.

---

## 5. Hiérarchie

```text
chantier  (porté par le relevé : libellé local + lien GP facultatif)
└─ bâtiment
   └─ étage   (niveau, HSP, existant | projet)
      ├─ zone (facultative)
      │  └─ pièce
      └─ pièce hors zone
```

Aucune dépendance à un scan : chaque niveau se crée à la main (UI §11, service §3.2). `buildReleveTree()` produit l'arbre de navigation (tri par niveau puis ordre), `checkStructureIntegrity()` détecte en local ce que les clés composites interdisent en base (cache corrompu, fusion hors ligne erronée) et signale deux étages « existant » au même niveau.

---

## 6. Permissions

Trois dimensions **toutes obligatoires** : organisation (`a_acces_application(entreprise,'tools')` + membre actif réel), entitlement personnel (`releve-metre`, prix par utilisateur), rôle Tools.

Rôles ajoutés à `roles_applications_elsatia` : `tools_releve_admin`, `tools_releve_metreur`, `tools_releve_consultation`. Le rôle historique `tools_pro` est traité comme un métreur.

| action | admin | métreur / `tools_pro` | consultation | support plateforme |
|---|---|---|---|---|
| view | tous | propres + partagés | partagés | tous, lecture seule, sous session support |
| create | oui | oui | non | non |
| edit | tous | propres + partagés | non | non |
| delete | tous | propres | non | non |
| share | tous | propres | non | non |
| export | = view | = view | = view | non |
| sync-gp | tous **+** GP `gerer_ouvrages` | propres + partagés **+** GP `gerer_ouvrages` | non | non |

Relevé à la corbeille : seuls `view` et `delete` (restauration), pour le propriétaire et l'administrateur. Transfert de propriété : administrateur uniquement, vers un membre actif.

**RLS tenant-safe** : `tools_releve_peut(releve_id, action)` porte toutes les policies (SELECT/INSERT/UPDATE) des tables filles ; la table racine combine RLS et un trigger de garde qui distingue *modifier* (`edit`), *partager* (`share`), *supprimer/restaurer* (`delete`) et *transférer* (admin). `anon` n'a aucun droit ; `authenticated` n'a ni DELETE ni TRUNCATE ; versions, journal et envois GP sont en lecture seule. Les privilèges par défaut de Supabase sont révoqués explicitement avant d'accorder les droits utiles.

Le client lit son contexte via `tools_releve_contexte(entreprise)` et les actions ouvertes sur un relevé via `tools_releve_actions(releve)` ; il n'en déduit jamais un droit.

---

## 7. Entitlement premium

| Élément | Avant | Après |
|---|---|---|
| Liste des capabilities | 18 codées en dur à 4 endroits SQL | `tools_capabilities_pro()` (18, inchangées) + `tools_capabilities_addon()` (`releve-metre`) + `tools_capabilities_catalogue()` |
| Résolveur `tools_resoudre_entitlements()` | — | **Branches Free et Pro strictement identiques** ; seule la branche propriétaire global reçoit le catalogue complet (tests internes) |
| Attribution plateforme (rôle total/facturation + AAL2) | liste blanche de 18 | liste blanche = catalogue (inclut `releve-metre`) |
| Achat web / Apple / Google | — | ne peut **jamais** porter `releve-metre` (trigger, testé B2, B3, I4) |
| SKU `tools_monetization_subscriptions` | `tools_pro_monthly/annual` | **inchangé** (B4) |
| Client Tools | `CAPABILITIES` (18), `pro = CAPABILITIES` | `PRO_CAPABILITIES` (18) ; `ADDON_CAPABILITIES` ; `pro = PRO_CAPABILITIES` → un Pro n'obtient jamais l'add-on par déduction ; `entitlementToAccess` conserve l'add-on seulement s'il vient du serveur sur un palier Pro |

Non-régression prouvée : Tools Free (B8), Tools Pro sans add-on (B5, B6, B7, H1 — cloud-sync des projets calculateur inchangé), entitlements personnels (B9), accès d'organisation (E1–E8), suites existantes `elsatia_tools_r8/r9/r10`, `platform_global_owner_all_apps_v1` vertes ; `access.test.ts`, `entitlements.test.ts`, `monetization.test.ts` verts sans modification de leurs assertions Free/Pro.

Activation interne pour les pilotes : `plateforme_attribuer_entitlement_utilisateur(utilisateur, 'tools', 'pro', tools_capabilities_catalogue(), 'internal')` + une habilitation Tools Relevé dans l'entreprise.

---

## 8. Contrat de stockage

Bucket **privé** `tools-releves` (aucune URL publique ; lecture par URL signée courte). Chemin canonique :

```text
{entrepriseId}/{releveId}/{categorie}/{mediaId}.{extension}
```

| Catégorie | Types | Taille max | Écriture exige |
|---|---|---|---|
| `photos` | JPEG, PNG, WEBP | 15 Mo | `edit` |
| `annotations` | WEBM, M4A, MP3 (notes vocales), PNG (croquis) | 10 Mo | `edit` |
| `documents` | PDF, JPEG, PNG | 25 Mo | `edit` |
| `exports` | PDF, DXF, SVG, CSV | 50 Mo | `export` |

`tools_releve_storage_autorise(chemin, opération)` refuse toute forme non canonique (traversée, catégorie inconnue, nom de fichier non UUID) et vérifie que le couple (entreprise, relevé) **existe réellement** avant d'appliquer la permission ; lecture = `view`, dépôt = `edit`/`export`, suppression = `delete`, aucun écrasement (pas de policy UPDATE). La table `tools_releves_medias` impose par CHECK que `storage_path` corresponde exactement à son entreprise, son relevé, sa catégorie et son identifiant, et que le type/la taille respectent la catégorie. Côté client : `buildStoragePath`, `parseStoragePath`, `checkMediaUpload`.

---

## 9. API / domaine

`ReleveService` (domaine) expose : `list`, `listDeleted`, `create`, `get`, `rename`, `setVisibility`, `remove`, `restore`, `addBatiment`, `addEtage`, `addZone`, `addPiece`, `renameNode`, `removeNode`, `restoreNode`, `createVersion`, `listVersions`. Chaque opération valide, vérifie la permission (même matrice que le serveur), puis délègue au port `ReleveRepository`.

Adaptateurs : `InMemoryReleveRepository` (tests, spécification) et `SupabaseReleveRepository` (Tools web + Capacitor). Un futur module natif de capture n'aura qu'à fournir des éléments (`validateElementDraft`) et un adaptateur.

RPC serveur ajoutés : `tools_releve_contexte`, `tools_releve_actions`, `tools_releve_peut`, `tools_releve_action_autorisee`, `tools_a_droit_releve_metre`, `tools_releve_creer_version`, `tools_releve_storage_autorise` (tous fermés à `anon`).

---

## 10. Contrat de synchronisation Gestion Pro

`packages/releve-domain/src/gp-sync.ts` — contrat v1, **statut `contract-only`**.

Enveloppe `ReleveGpEnvelope` couvrant les onze sections demandées : `client`, `chantier`, `structure`, `plan`, `measures`, `quantities`, `photos`, `annotations`, `materials`, `openings`, `exports`. `buildGpEnvelope(aggregate, version)` est une fonction pure et testée.

Règles figées :
- **GP autoritaire** sur client, chantier, prix. Tools ne transmet **aucun prix** (testé).
- On transmet une **Version** immuable, jamais l'état vivant ; `idempotencyKey = tools-releve:{releve}:v{numero}:gp-chantier:{chantier}`.
- mm → m à la frontière, 3 décimales (`numeric(12,3)`) ; `m2/ml/m3/u` → `m²/ml/m³/u`.
- Préconditions bloquantes : chantier GP lié, version du même relevé et du même tenant, ouvertures avec mur hôte, photos avec fichier.

Pourquoi pas de sync réelle : la cible GP n'est pas prête. `metres`, `lignes_metres`, `documents_chantier` existent, mais il manque le RPC d'import `SECURITY DEFINER` avec double autorisation (`releve-metre` + `gerer_ouvrages`), et **`UNITES` GP (`src/lib/devis.ts`) ne contient pas « m³ »** — constat du lot 2, à corriger avant de transmettre des volumes. Ces trois points sont listés dans `GP_SYNC_READINESS.blockers` (lot 17).

Liens GP déjà sécurisés : poser `chantier_gp_id` / `client_gp_id` exige la même entreprise (même en service_role) et la permission GP `acces_chantiers` / `acces_clients` (G5, G6).

---

## 11. Interface minimale

| Route | Contenu |
|---|---|
| `/releves` | liste des relevés visibles (statut, partage, lien GP, date), formulaire de création (nom, chantier, adresse, CP, ville, client) |
| `/releves/structure?id=…&batiment=…&etage=…` | fil d'Ariane chantier › bâtiment › étage ; trois colonnes bâtiments → étages (libellé RDC / R+n) → zones et pièces ; ajout et retrait à chaque niveau ; partage ; figer une version |

- Routes **statiques** (export natif Capacitor) : la sélection voyage en paramètres de requête, identifiants non UUID ignorés.
- Sans `releve-metre` : écran « Module premium en préversion » **sans prix ni bouton d'achat**. Sans compte / sans entreprise : message dédié.
- Le lien « Relevés » de l'accueil n'apparaît qu'aux comptes détenteurs de la capability ; les pages sont `noindex` et absentes du sitemap.
- Pas de moteur de capture, pas de plan, pas d'éléments saisis dans l'UI à ce lot.

---

## 12. Tests

### 12.1 pgTAP — `supabase/tests/elsatia_tools_releve_metre_foundation_v1.test.sql` (74 tests)

| Bloc | Couverture |
|---|---|
| A. Surface | 10 tables avec RLS ; `anon` sans droit ; pas de DELETE/DDL ; versions/journal/GP en lecture seule ; 3 rôles ; fonctions fermées |
| B. Entitlement | add-on hors Pro ; achat web/Apple/Google refusé ; SKU inchangé ; Pro sans add-on refusé côté serveur ; Free sans rien ; attribution interne résolue |
| C. Hiérarchie | création complète sans scan ; tenant et auteur imposés ; clés composites (étage greffé, zone d'un autre étage) ; mur / ouverture hébergée / quantité ; charge invalide ; ouverture sans mur ou sur un non-mur |
| D. Matrice | consultation, `tools_pro`, admin ; partage journalisé ; refus de modifier / partager / supprimer / transférer ; sync-gp conditionné à `gerer_ouvrages` |
| E. Cross-tenant | lecture, écriture, création forgée, `entreprise_id` forgé sur un enfant |
| F. Cycle de vie | cascade de suppression et restauration symétrique ; pas de DELETE ; relevé immuable pour un enfant ; versions numérotées, empreintées, immuables ; journal ; corbeille bloquant l'écriture |
| G. Stockage et GP | chemin canonique / forgé / traversée ; média cohérent ; lecture cross-tenant refusée ; lien chantier GP d'une autre entreprise refusé |
| I. Plateforme | propriétaire global reçoit l'add-on ; aucune lecture client sans session support ; attribution interne acceptée, source d'achat refusée même pour la plateforme |
| H. Non-régression | cloud-sync Tools Pro inchangé |

### 12.2 Vitest

- `packages/releve-domain` : permissions (matrice complète, parité SQL), validation, hiérarchie, service (hiérarchie complète, cascade, versions, conflit, permissions, cross-tenant, corbeille), stockage, contrat GP, entitlement, parité SQL.
- `apps/tools` : `access.test.ts` (add-on jamais déduit d'un palier, accepté seulement du serveur sur un Pro), `releve-adapter.test.ts` (mapping, pas de métadonnées envoyées, révision conditionnelle, message d'erreur RLS sans détail SQL, versions par RPC), `navigation.test.ts`.

### 12.3 Commandes et résultats

```text
scripts/local-postgres-bootstrap/rebuild_db.sh pgtap_base     → OK : 336 migrations appliquées
pg_prove elsatia_tools_releve_metre_foundation_v1.test.sql    → 74/74 PASS
pg_prove *.test.sql (avant)                                    → 126 fichiers, 11 en échec
pg_prove *.test.sql (après)                                    → 127 fichiers, 2 906 tests, les 11 MÊMES en échec
npx vitest run (racine)                                        → 165 fichiers, 1 934 tests OK
apps/tools: npx vitest run                                     → 176 fichiers, 2 004 tests OK
npx tsc --noEmit (racine, apps/tools)                          → 0 erreur
npx eslint (racine) ; apps/tools: npm run lint                 → 0 erreur
apps/tools: npm run build (NEXT_PUBLIC_TOOLS_ENV=local)        → OK
apps/tools: npm run build:native                               → OK (out/releves, out/releves/structure)
npx next build (Gestion Pro, racine)                           → OK (non-régression des alias partagés)
node scripts/verify-migrations.mjs                             → 336 migrations valides
```

Échecs pgTAP **antérieurs et inchangés** (banc PostgreSQL local sans Supabase) : `platform_stripe_state_attestation_r72` (stub `pgsodium`, documenté), les 7 fichiers `studio_*` (« Inscription fermée » : fixture incompatible avec la politique d'inscription Studio), `purge_entreprise_architecture_v2` et `purge_entreprise_supprimee` (purge de chantiers), `elsatia_tools_cloud_sync_entitlement_closure_v1` (bloc I : `service_role` sans GRANT sur `tools_projects` dans le banc). Aucun n'implique les objets de ce lot ; numéros de tests en échec identiques avant/après (ex. `purge_entreprise_architecture_v2` : 9-14, 16, 24 dans les deux cas).

---

## 13. Limites et risques connus

| Sujet | État |
|---|---|
| Hors ligne | Le lot 2 est en ligne (PostgREST). Identifiants client, révisions et port de dépôt sont prêts pour le dépôt IndexedDB du lot 3. |
| Performance RLS | `tools_releve_peut()` est évalué par ligne ; adapté aux volumes d'un relevé (centaines de lignes). À mesurer au lot 20 (étage de 2 000 entités) ; index déjà posés sur `releve_id`. |
| Propriétaire supprimé | `proprietaire_id` est `on delete restrict` (comme Réserves) : un utilisateur propriétaire de relevés doit être remplacé (transfert admin) avant suppression de son profil. À intégrer au parcours de suppression de compte Tools. |
| Storage | Les objets déposés ne sont pas encore liés automatiquement à une ligne `tools_releves_medias` (enregistrement en deux temps). Purge des objets orphelins : lot 11. |
| Restauration d'un nœud dont le parent est supprimé | acceptée ; le nœud reste masqué tant que le parent l'est. |
| Prix | Prix de travail en code uniquement ; inclusion de Tools Pro = hypothèse à confirmer. |
| GP | Contrat seulement ; `m³` absent des unités GP ; RPC d'import à écrire (lot 17). |

---

## 14. Suite (lot 3)

1. Dépôt IndexedDB `elsatia-releve[-company:<id>]` + file de mutations, sur le port `ReleveRepository` (spécification = `InMemoryReleveRepository`).
2. Écran d'administration des habilitations Relevé (rôles) côté GP ou plateforme.
3. Saisie des éléments (mur, ouverture, mesure) via `validateElementDraft`, avant le moteur de plan (lot 5).
4. Pour le produit : confirmer « Relevé Pro inclut Tools Pro » et la politique photo RGPD.

---

## Annexe — fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260926000401_tools_releve_metre_foundation_v1.sql` | migration (rôles, entitlement, tables, triggers, RLS, stockage, RPC) |
| `supabase/tests/elsatia_tools_releve_metre_foundation_v1.test.sql` | pgTAP, 74 tests |
| `packages/releve-domain/**` | domaine partagé + 8 fichiers de tests |
| `apps/tools/src/lib/access.ts` | `PRO_CAPABILITIES` / `ADDON_CAPABILITIES` |
| `apps/tools/src/lib/releve/**` | adaptateur Supabase, mapping, contexte, navigation (+ tests) |
| `apps/tools/src/components/releve/**`, `apps/tools/src/app/releves/**` | UI minimale |
| `apps/tools/src/components/HomeDashboard.tsx` | lien « Relevés » réservé aux détenteurs de la capability |
| `tsconfig.json`, `vitest.config.ts`, `apps/tools/{tsconfig.json,vitest.config.ts,next.config.ts}` | résolution de `@elsatia/releve-domain` |
