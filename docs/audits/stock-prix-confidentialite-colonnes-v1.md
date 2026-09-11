# ELSATIA-STOCK-PRIX-CONFIDENTIALITE-COLONNES-V1

**Verdict : fuite PROUVÉE sur base jetable au ledger du Train V3 ; correctif proposé et
recetté (pgTAP 36/36), à livrer AVEC trois modifications applicatives (D1–D3).**
Production : fuite probable, **non mesurée** (aucun accès à la base vivante dans ce lot).

| Élément | Valeur |
|---|---|
| Base | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` @ `59e960a` (= `52d3282` + documentation ; `git diff 52d3282 59e960a -- supabase` vide) |
| Ledger | 278 fichiers, dernier préfixe `20260909000280` |
| Branche du lot | `fix/stock-prix-confidentialite-colonnes-v1` (locale, sans suivi amont, non poussée) |
| Fichiers livrés | `docs/migrations-proposees/stock-prix-confidentialite-colonnes-v1.sql.proposed`, `….pgtap.sql.proposed`, ce rapport |
| Numéro de ledger | **aucun réservé** (maximum connu 281, `integration/colors-pilot-readiness-v1`, non fusionnée — elle ne touche pas `articles_stock`) |
| Migrations existantes | aucune modifiée |
| Déploiement | aucun |

## 1. Cause

| Migration | Effet sur `articles_stock` pour `authenticated` |
|---|---|
| `20260718000108` l. 209-213 | `revoke select` table, puis `grant select(14 colonnes)` sans `prix_achat_ht` ni `prix_vente_ht` ; lecture des prix par `articles_stock_avec_prix` (voir_prix_stock / gerer_prix_stock) |
| `20260729000189` l. 10-12 | `grant select on table public.articles_stock to authenticated` : le privilège TABLE couvre toutes les colonnes, la restriction 00108 devient inopérante |
| `20260902000255` | ne révoque que `service_role` |
| RLS | lecture : `membres articles stock` = `est_membre_actif(entreprise_id)` uniquement |

Pourquoi 00189 a élargi : le rapport `docs/audits/phase-1-isolation-et-rls-rapport-final.md`
(§ 2, point 2) indique que des « opérations légitimes » sur `articles_stock` étaient rejetées
avant la RLS. L'une d'elles est certaine : `/rentabilite` (commit `91cac98`, 2026-07-26, donc
entre 00108 et 00189) lit `mouvements_stock?select=…,article:articles_stock(prix_achat_ht)`,
qui échoue en 42501 pour **tous** les postes sous 00108, puisque le privilège colonne est porté
par le rôle et non par la permission métier. 00189 a résolu ce 42501 en rouvrant toute la table.

## 2. Preuve de la fuite (avant correctif)

Conteneur jetable `elsatia-stockprix-jetable` (`supabase/postgres:17.6.1.143` + prélude
`ELSATIA-STACKS/train-v3-dbtest/prelude.sql`), 278 migrations appliquées dans l'ordre du
préfixe (1 051 s), décor `supabase/tests/fixtures/isolation_multitenant.inc`.
Persona : **ouvrier A** (`10000000-…-0002`), membre actif, `voir_prix_stock = f`,
`gerer_prix_stock = f`.

ACL mesurées : table `authenticated=arwdm` (le `r` vient de 00189) ; colonnes : les 14 grants
00108 sont toujours présents, `prix_achat_ht` et `prix_vente_ht` sans grant colonne — mais
`has_column_privilege(…, 'prix_achat_ht', 'select') = t`.

| Canal | Requête | Résultat |
|---|---|---|
| SQL (`set role authenticated` + `request.jwt.claims`) | `select reference, prix_achat_ht, prix_vente_ht` | `TEST_A_STK_001 | 5.00 | 8.00` |
| SQL | `select *` | ligne complète, prix compris |
| SQL | jointure `mouvements_stock → articles_stock.prix_achat_ht` | `5.00` |
| PostgREST 14.14 réel, JWT ouvrier | `GET /articles_stock?select=reference,prix_achat_ht,prix_vente_ht` | **HTTP 200** `[{"prix_achat_ht":5.00,"prix_vente_ht":8.00}]` |
| PostgREST | `GET /articles_stock` (`*`) | **HTTP 200**, prix compris |
| PostgREST | `GET /mouvements_stock?select=…,article:articles_stock(prix_achat_ht)` | **HTTP 200** `{"prix_achat_ht": 5.00}` |
| PostgREST | `POST /rpc/articles_stock_avec_prix` (voie officielle) | HTTP 400 `P0001 Accès aux prix du stock refusé` |

Isolation multitenant intacte : l'ouvrier A ne voit que l'article de A. La fuite est
**intra-entreprise** : tout membre actif lit les prix d'achat et de revente de son entreprise.

## 3. Recensement des consommateurs (`src/`, `apps/`, `packages/`, `scripts/`)

| Emplacement | Lecture | Prix lus hors RPC ? | Après correctif |
|---|---|---|---|
| `src/app/(app)/stock/page.tsx:40-43` | RPC si `peutVoirPrix`, sinon colonnes explicites sans prix | non | OK |
| `src/app/(app)/stock/[id]/page.tsx:38-39` | idem | non | OK |
| `src/app/(app)/stock/page.tsx:49` | embed `articles_stock(reference,designation,unite)` | non | OK |
| `src/app/(app)/stock/reception/page.tsx:17` | colonnes sans prix | non | OK |
| `src/app/(app)/depot/page.tsx:2`, `src/app/actions/depot.ts:4` | colonnes sans prix ; update `zone_id` | non | OK (PATCH 204) |
| `src/app/(app)/inventaires/page.tsx:17`, `inventaires/[id]/page.tsx:42` | colonnes sans prix | non | OK |
| `src/app/api/inventaires/[id]/cloture/route.ts` | `rpc("lignes_inventaire_avec_prix")` | non | OK |
| `src/app/(app)/dashboard/page.tsx:91` | colonnes sans prix | non | OK |
| `src/lib/ai/copilote.ts:100` | colonnes sans prix | non | OK |
| `src/app/(app)/chantiers/[id]/doe/page.tsx:21`, `src/app/imprimer/doe/[id]/page.tsx:18` | embed `(id,reference,designation,marque)` | non | OK |
| `src/app/actions/stock.ts:30` | insert avec prix, sans `.select()` | — | OK (POST 201) |
| `src/app/actions/stock.ts:53` | update prix, sans `.select()` | — | OK (PATCH 204) |
| `src/app/actions/stock.ts:40,125,132` | `select("id")` | non | OK |
| `src/app/actions/stock.ts:124` | `rpc("importer_articles_stock")` | — | OK |
| **`src/app/(app)/rentabilite/page.tsx:24`** | embed `articles_stock(prix_achat_ht)` | **oui** | **403 / 42501 → D1** |
| **`src/app/actions/rentabilite.ts:28`** | embed `articles_stock(prix_achat_ht)` | **oui** | **403 / 42501 → D1** |
| **`src/app/actions/import.ts:261`** (type `stock`) | upsert PostgREST `on_conflict=entreprise_id,reference` | lecture implicite de `EXCLUDED.prix_*` | **403 / 42501 → D2** |
| **`src/app/(app)/stock/page 2.tsx:13`** | `select("*")` | **oui** | copie Finder non routée (`988fc70`), importée nulle part → **D3** |
| `scripts/seed-*.mjs` | clé service_role | hors périmètre (voir § 8) | — |

Aucun consommateur dans `apps/` ni `packages/`. Mesuré sur la base jetable (`pg_proc`,
`pg_views`, `pg_matviews`) : les 5 fonctions dont le corps cite `prix_achat_ht`/`prix_vente_ht`
sont toutes `security definer` (`couts_stock_par_chantier`, `importer_articles_stock_interne`,
`lignes_inventaire_avec_prix`, `trg_figer_prix_achat_inventaire`, `verifier_droit_prix_stock`),
`articles_stock_avec_prix` (`a.*`) l'est aussi, et **aucune vue ni vue matérialisée** ne
référence `articles_stock`.

## 4. Correctif proposé (`.sql.proposed`, sans numéro)

1. **Garde** : échoue si `articles_stock` ne porte pas exactement les 16 colonnes classées
   (14 publiques + 2 confidentielles). Une colonne ajoutée d'ici l'intégration impose une
   décision au lieu d'être exposée par défaut.
2. `revoke select on table public.articles_stock from authenticated` — retire aussi les
   privilèges colonne, donc l'état final ne dépend pas de l'historique (Fresh, Production 210,
   base déjà corrigée) — puis `grant select(14 colonnes 00108)`.
3. `couts_stock_par_chantier(p_entreprise_id, p_chantier_id default null)` → `(chantier_id, total)`,
   `security definer`, `search_path=public`, gardée par `est_membre_actif` +
   `a_permission('acces_rentabilite')`, calquée sur `couts_indemnites_paie_par_chantier` (00147).
   Même calcul que l'écran actuel (sorties × prix d'achat courant). Agrégat seulement, jamais de
   prix unitaire. Elle n'élargit pas la visibilité des lignes : `mouvements_stock` est déjà lisible
   par tout membre actif.
4. `notify pgrst, 'reload schema'`.

Non touchés : INSERT/UPDATE/DELETE (gardés par la RLS `role_gestion_*` = `gerer_stock` et le
trigger prix 00108), `articles_stock_avec_prix`, `lignes_inventaire_avec_prix`, `anon`, `service_role`.

**Idempotence mesurée** : appliqué deux fois de suite sur la même base, code 0 les deux fois.

## 5. Preuve après correctif

| Canal / persona | Requête | Résultat |
|---|---|---|
| ACL | `has_table_privilege(select)` / `prix_achat_ht` / `prix_vente_ht` | `f / f / f` ; table `authenticated=awdm` |
| SQL, ouvrier A | prix explicites / `*` / jointure mouvements → prix | 42501 ×3 |
| SQL, ouvrier A | colonnes autorisées | OK |
| PostgREST, ouvrier A | R1 prix, R2 `*`, R3 embed | **HTTP 403** `42501` ×3 |
| PostgREST, ouvrier A | R4 colonnes autorisées | HTTP 200 |
| PostgREST, ouvrier A | R5 RPC prix | HTTP 400 P0001 (inchangé) |
| PostgREST, comptable A (`acces_rentabilite`) | R6 `rpc/couts_stock_par_chantier` | HTTP 200 `[{"chantier_id":"a4…01","total":5.0000}]` |
| PostgREST, comptable A | R7 embed actuel de `/rentabilite` | HTTP 403 → D1 obligatoire |
| PostgREST, admin A | R8 RPC prix | HTTP 200, prix complets |
| PostgREST, admin A | R9 PATCH prix (`stock.ts:53`) | HTTP 204 |
| PostgREST, admin A | R10 POST article avec prix (`stock.ts:30`) | HTTP 201 |
| PostgREST, admin A | R11 upsert import (`Prefer: resolution=merge-duplicates,count=exact`, avec ou sans `return=minimal`) | **HTTP 403** `42501` → D2 obligatoire |
| PostgREST, admin A | R12 PATCH `updated_at` (`depot.ts`) | HTTP 204 |
| PostgREST, admin A | R13 `rpc/importer_articles_stock` (`catalogue`, 2 lignes) | HTTP 200 `2`, prix d'achat mis à jour, `prix_vente_ht` intact |

Cause exacte de R11, isolée en SQL : `ON CONFLICT … DO UPDATE SET designation = EXCLUDED.designation`
passe, `SET prix_achat_ht = 7` passe, un insert simple avec prix passe ; seul
`SET prix_achat_ht = EXCLUDED.prix_achat_ht` échoue — PostgreSQL exige le SELECT sur la colonne cible
lue via `EXCLUDED`. PostgREST génère toujours cette forme pour `resolution=merge-duplicates`.

## 6. Suite pgTAP proposée (`.pgtap.sql.proposed`, 36 assertions, décor autonome)

- Base **corrigée** : **36/36 ok**.
- Base **non corrigée** (`avant`) : `not ok 2, 3, 4, 5` (la fuite), puis arrêt à l'assertion 8
  (`couts_stock_par_chantier` absente). La suite détecte donc la régression 00189.

Couverture : colonnes classées (1), ACL table/colonnes/anon/écritures (2-7), sécurité de la RPC
(8-13), ouvrier sans droit (14-20), magasinier `voir_prix_stock` (21-23 : RPC seule voie, écriture
prix toujours refusée sans `gerer_prix_stock`), comptable `acces_rentabilite` (24-28 : total exact,
entrée ignorée, filtre chantier, isolation, pas de prix unitaire), isolation F (29-30), chemins
d'écriture de l'application (31-36 : update, insert, upsert refusé, voie de remplacement,
RETURNING refusé, relecture).

## 7. Non-régression : suite pgTAP complète du Train V3, avant / après

Même état de départ pour les deux bases : `pg_dump` de `postgres` (ledger Train V3 + décor),
restauré dans `avant` puis `apres` (0 erreur de restauration), correctif appliqué sur `apres`
seulement. Verdict par fichier : plan TAP atteint, aucun `not ok`, aucune `ERROR`.

| Base | Correctif | Fichiers | Assertions réussies |
|---|---|---|---|
| `avant` | non | **70/70 PASS** | 1 902 |
| `apres` | oui | **70/70 PASS** + suite proposée **36/36** = 71/71 | 1 938 (= 1 902 + 36) |

Résultat **identique fichier par fichier** entre `avant` et `apres` (`diff` vide). En particulier :
`isolation_multitenant_comportement` (56) et `modules_a_la_carte_r3_v1` (32), qui citent
`articles_stock` ; `isolation_multitenant_roles` (24) et `isolation_multitenant_surface` (10), qui
chargent la fixture insérant des articles avec prix ; `borne_stock_securisee` (11), sur le stock.
Durée totale 2 038 s sous une charge du poste d'environ 14.

## 8. Dépendances applicatives (même déploiement, SQL puis code)

- **D1 — Rentabilité.** Sans modification, `/rentabilite` et l'analyse IA **ne plantent pas** :
  supabase-js renvoie `data: null`, le code fait `?? []`, le coût stock tombe **silencieusement à 0**
  et la marge est surévaluée. Remplacer l'embed de `rentabilite/page.tsx:24` et
  `actions/rentabilite.ts:28` par `rpc("couts_stock_par_chantier", …)`.
- **D2 — Import générique « Stock et codes-barres »** (`actions/import.ts:261`) : passer par
  `rpc("importer_articles_stock", { p_type: "catalogue" | "inventaire", p_lignes })`.
- **D3 — Supprimer `src/app/(app)/stock/page 2.tsx`.**
- Règle : toute écriture sur `articles_stock` reste en `return=minimal` ; un `.select()` après
  `insert`/`update` qui inclurait un prix échoue en 42501 (pgTAP n° 35).

## 9. Décisions à trancher (Julien)

1. **Analyse IA** : gardée par `aAccesIA`, la RPC par `acces_rentabilite`. Un poste IA sans
   `acces_rentabilite` obtiendrait un coût stock vide. Exiger `acces_rentabilite` pour l'analyse,
   ou accepter ?
2. **Import générique vs `importer_articles_stock`** : la fonction existante ne porte pas
   `prix_vente_ht`, et en type `inventaire` elle écrit des mouvements d'ajustement au lieu
   d'écraser `quantite_stock` (plus traçable). Étendre la fonction (lot SQL suivant) ou accepter
   la perte du prix de revente dans cet import ?
3. **Comptable** : `acces_rentabilite` donne le coût stock agrégé par chantier (comportement
   actuel conservé) mais pas les prix unitaires. À confirmer.

## 10. Production — mesure à faire (lecture seule, non faite dans ce lot)

```sql
select has_table_privilege('authenticated', 'public.articles_stock', 'select')                 as fuite_table,
       has_column_privilege('authenticated', 'public.articles_stock', 'prix_achat_ht', 'select') as fuite_prix_achat;
```

`t | t` = fuite confirmée en Production. Aucune écriture, aucune donnée client lue.

## 11. Observations hors périmètre (non corrigées)

- ACL mesurée `service_role=Dxtm` sur `articles_stock` (00255) : `service_role` n'a ni SELECT ni
  INSERT/UPDATE. Les scripts `scripts/seed-*.mjs` qui écrivent `articles_stock` avec la clé
  service_role n'ont pas été rejoués ici.
- `articles_stock_avec_prix` court-circuite le contrôle quand `auth.role() = 'anon'` ; branche
  morte depuis 00157 (EXECUTE retiré à `anon`), à nettoyer un jour.
- `importerDonneesAction` n'a aucune garde TypeScript `gerer_prix_stock` ; le trigger 00108
  bloque néanmoins toute écriture de prix non autorisée.

## 12. Environnement de recette (jetable)

- Conteneur `elsatia-stockprix-jetable` ; bases `postgres` (décor + correctif + écritures R9-R13),
  `avant`, `apres` (même dump, correctif sur `apres` seulement).
- PostgREST `elsatia-stockprix-rest` (`127.0.0.1:60931`, réseau `stockprix-jetable-net`) :
  **arrêté et retiré en fin de lot** ; le conteneur de base reste en place pour inspection.
- Aucune autre pile touchée (train-v3-e2e, Colors, Réserves, base locale au ledger 265 : intactes).
- Retrait complet : `docker rm -f elsatia-stockprix-jetable`.
