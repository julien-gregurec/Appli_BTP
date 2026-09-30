# ELSATIA — GP POINTAGES > 1000 & FACTURE BROUILLON FIX V1

```
BASE          = origin/integration/elsatia-canonical-train-v7 @ 547f0b6f
BRANCHE       = claude/busy-ramanujan-cbyclu
MIGRATIONS    = 359 → 361 (+ 20260930000101, 20260930000102)
DATE          = 2026-09-30
MOTEUR        = PostgreSQL 16.14 réel + pgTAP 1.3 (amorce scripts/local-postgres-bootstrap),
                PostgREST v12.2.3 réel (db-max-rows = 1000, comme supabase/config.toml),
                GoTrue v2.196.0 compilé, local_supabase_proxy.mjs, next dev, Chromium 1194
```

La branche Performance V5 n'a **pas** servi de base : elle n'a été lue que pour son rapport
(`origin/claude/brave-carson-cj8ofz:docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md`,
défauts « B2 — troncature silencieuse à 1 000 lignes » et « B4 — édition de facture brouillon
cassée »). Dans cette mission ils sont nommés **B1** (pointages) et **B2** (facture).

## 0. Verdict

**ELSATIA GP DATA CORRECTNESS LOCALLY QUALIFIED** — pour le périmètre de la mission (B1, B2).

| | Avant (V7) | Après |
| --- | --- | --- |
| B1 — totaux mensuels à 1 462 pointages | 5 322,52 h affichées pour 7 762,37 h réelles, **38/38 salariés faux** | 7 762,37 h, 0 écart, au centième |
| B1 — totaux à 20 000 pointages | 5 317,34 h pour 106 348,26 h, **500/500 faux** | exact, 0,65 s, 200 Ko |
| B2 — enregistrer une facture brouillon | `permission denied for function recalc_totaux_facture` | enregistré, totaux recalculés |
| B2 — droits | — | **rien de rouvert** : recalc_totaux_facture toujours fermé, facture émise/payée/annulée immuable, autre entreprise refusée |

Réserve hors périmètre (§ 9) : la même classe de défaut (lecture PostgREST non bornée,
agrégée côté Next) existe dans la **rentabilité** (`src/lib/rentabilite.ts`, `/rentabilite`)
et la fiche chantier — prouvée (`Content-Range: 0-999/20002`), **non corrigée ici**, chantier
dédié recommandé.

## 1. B1 — Pointages : reproduction et cause

### 1.1 Reproduction

Jeu : `scripts/perf/pointages_mois_charge.sql` (N pointages dans un mois, 38 salariés minimum puis
1 pour 40 pointages, ~70 % adossés à une session GPS avec 2 contrôles de zone, heures non rondes pour
qu'une ligne perdue se voie). Chemin **historique** rejoué à l'identique (même `select`, mêmes
filtres, même boucle d'addition) contre le vrai PostgREST, comparé à la vérité DB (superutilisateur) :

| N | Salariés | Vérité DB (h) | Lignes reçues | Total affiché (h) | Salariés faux |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 38 | 2 636,60 | 500 | 2 636,60 | 0 |
| 1 000 | 38 | 5 317,55 | 1 000 | 5 317,55 | 0 |
| **1 462** | 38 | **7 762,37** | **1 000** | **5 322,52** | **38** |
| 5 000 | 125 | 26 586,09 | 1 000 | 5 322,45 | 125 |
| 20 000 | 500 | 106 348,26 | 1 000 | 5 317,34 | 500 |

Même constat dans le navigateur réel (page V7, gérant pilote, 1 477 pointages dont 15 de la
fixture) : « Salarié Charge 0025 : 140,74999999999997 h » affiché pour 199,73 h en base
(`/home/user/work/pw_red_pointages.log`, reproduit en § 7.3).

### 1.2 Cause racine

| Hypothèse | Verdict |
| --- | --- |
| Limite PostgREST | **Oui** : `max_rows = 1000` (`supabase/config.toml`, même valeur hébergée) plafonne toute réponse **sans erreur** ; supabase-js ne signale rien. |
| `range` | Aucun `.range()` dans la page : la réponse est coupée par le serveur, pas par le client. |
| Pagination absente | **Oui** : la page lisait **tout le mois** (pointages, sessions, contrôles de zone) en une requête chacune. |
| RPC | Aucune RPC : pas d'agrégat en base. |
| Requête client | **Oui** : l'addition « Total par employé » se faisait dans le serveur Next sur des lignes tronquées (et en flottant : `140.74999999999997`). |

Les **trois** lectures de la page étaient touchées (1 462 pointages ⇒ 1 024 sessions et 2 048
contrôles : sessions et contrôles également tronqués à 1 000).

Remplacer 1 000 par une valeur plus grande a été écarté : à 20 000 pointages la page aurait chargé
≈ 8,7 Mo de pointages (437 o/ligne mesurés) pour afficher quelques centaines de totaux, et le
problème ressurgirait au seuil suivant.

## 2. B1 — Correctif

**Principe : le total est calculé par PostgreSQL ; la page ne reçoit jamais les pointages du mois.**

Migration `20260930000101_pointages_gestion_totaux_mois_v1.sql` :

| Objet | Rôle |
| --- | --- |
| `pointages_gestion_totaux_mois(entreprise, début, fin)` | une ligne par salarié : nb, heures normales, sup., total (numeric exact) |
| `pointages_gestion_compteurs_mois(entreprise, début, fin, début_at, fin_at)` | totaux exacts sessions / anciennes saisies / contrôles de zone (pagination, en-têtes) |
| `pointages_gestion_anciennes_saisies_ids(entreprise, début, fin, limite ≤ 200, décalage)` | identifiants d'une page de pointages sans session GPS |
| index `sessions_pointage (pointage_id)` partiel | anti-jointure « pointage sans session » et FK `ON DELETE SET NULL` |
| index `verifications_zone_pointage (entreprise_id, created_at desc)` | contrôles du mois (parcours complet de la table, tous tenants, auparavant) |

**Sécurité** : les trois fonctions sont `SECURITY DEFINER`, `search_path = public`, EXECUTE pour
`authenticated` seul (retiré à `public`/`anon`). Elles refusent (42501) sans `auth.uid()` ou si
`est_membre_actif(entreprise)` est faux (membre désactivé, entreprise suspendue, autre tenant), puis
appliquent **les mêmes prédicats que les policies**, mais une fois par salarié au lieu d'une fois
par ligne :

- `pointages` / `sessions_pointage` : `est_membre_actif` + `peut_consulter_pointage_employe(entreprise, salarié)`
  (policies `membres pointages`, `sessions_pointage_membres`, `role_pointage_select`) ;
- `verifications_zone_pointage` : `est_membre_actif` et (salarié du compte ou `gerer_pointage` ou
  `valider_pointages`) (policy `verifications_zone_autorisees`).

La dérive entre ces fonctions et la RLS est gardée par des tests de **parité** : pour chaque profil
(admin, ouvrier, chef d'équipe, conducteur, comptable, dirigeant), le résultat de la RPC est comparé
au même agrégat calculé **sous `authenticated` avec la RLS réelle** (§ 5). Si une policy change,
ces tests échouent.

Les lignes détaillées (sessions, anciennes saisies, contrôles) restent lues par PostgREST **sous
la RLS normale**, avec leurs relations, mais par pages de 50 : la RPC des anciennes saisies ne fournit
que des identifiants, que la page relit ensuite sous RLS.

**Application** : `src/lib/pointages-gestion.ts` (chargeurs), `src/app/(app)/pointage/gestion/page.tsx`
(totaux, compteurs, pagination `?page=` / `?page_anciennes=`, bandeau d'erreur sans total partiel si
la RPC échoue). Les contrôles de zone des sessions affichées sont lus par tranches de 1 000 jusqu'à
épuisement (jamais tronqués).

Changement de comportement assumé : « Anciennes saisies » = pointages du mois **sans aucune**
session GPS liée (anti-jointure), au lieu de « non liés à une session du mois affiché ». Une session
n'est liée qu'au pointage créé à sa clôture (`cloturer_session_pointage`, même salarié, même jour) :
les deux définitions coïncident hors cas de bord de fuseau.

### 2.1 Deux pièges trouvés en mesurant (et corrigés)

1. **`count=exact` sous RLS** : première version paginée avec `count: "exact"` PostgREST → 15,8 s
   (sessions), 39,6 s (anciennes saisies), 29,0 s (contrôles) à 20 000 pointages : la RLS évalue
   `peut_consulter_pointage_employe` + `est_membre_actif` **par ligne** (~2 ms/ligne mesurés, EXPLAIN
   ANALYZE : 43 s pour 20 000 lignes). D'où la RPC de compteurs.
2. **Pushdown du planner** : le filtre de visibilité posé sur l'agrégat par salarié ne porte que sur
   la colonne de regroupement ; PostgreSQL le **redescend dans le parcours** et l'évalue par ligne
   (totaux 21 s, compteurs 30 s, identifiants 17 s). Corrigé par des CTE `MATERIALIZED`
   → 0,41 s / 0,42 s / 0,39 s.

## 3. B2 — Facture brouillon : reproduction et cause

**Reproduction SQL** (`authenticated`, dirigeant A) :

```
ERROR:  permission denied for function recalc_totaux_facture
CONTEXT:  SQL statement "SELECT public.recalc_totaux_facture(p_facture_id)"
PL/pgSQL function modifier_facture_brouillon(uuid,jsonb,jsonb) line 51 at PERFORM
```

**Reproduction navigateur** (base V7, gérant pilote : devis accepté → « Créer une facture depuis ce
devis » → « Modifier » → modification → « Enregistrer les modifications ») : l'écran reste sur
`/factures/:id/modifier` avec « Impossible de créer cette facture… », et le journal PostgreSQL
enregistre :

```
2026-09-30 22:00:04.773 UTC [23679] authenticator@pilot_gp ERROR:  permission denied for function recalc_totaux_facture
2026-09-30 22:00:04.773 UTC [23679] authenticator@pilot_gp CONTEXT:  SQL statement "SELECT public.recalc_totaux_facture(p_facture_id)"
	PL/pgSQL function modifier_facture_brouillon(uuid,jsonb,jsonb) line 51 at PERFORM
```

**Cause** : `modifier_facture_brouillon` (20260710000017) est `SECURITY INVOKER` et se termine par
`perform public.recalc_totaux_facture(p_facture_id)`. La réconciliation ACL `20260902000255` a retiré,
volontairement, `EXECUTE` à `authenticated` sur `recalc_totaux_facture` (fonction `SECURITY DEFINER`
qui réécrit les montants de n'importe quelle facture sans contrôle d'appartenance).

**Audit du même motif** sur tout le schéma (toute fonction INVOKER exécutable par `authenticated`
appelant une fonction que `authenticated` ne peut pas exécuter) : **un seul cas**, celui-ci.

## 4. B2 — Correctif

Migration `20260930000102_modifier_facture_brouillon_sans_recalc_direct_v1.sql` : même fonction,
**sans** l'appel direct. Il était redondant : le trigger `recalc_facture_apres_ligne` (FOR EACH ROW,
`trg_recalc_facture` SECURITY DEFINER) recalcule déjà les totaux à chaque ligne supprimée puis
insérée. Seul « aucune ligne avant ni après » ne déclenche aucun trigger : couvert par une remise à 0,
identique au résultat de `recalc_totaux_facture` sur une facture vide.

**Rien n'est rouvert** : `recalc_totaux_facture` reste fermé à `authenticated` ; la RPC reste
`SECURITY INVOKER` (RLS `factures`/`lignes_factures`, `verrouiller_facture_emise`,
`trg_lignes_factures_brouillon_only` sous l'identité de l'appelant) ; ACL réaffirmée
(`authenticated` seul ; `public`, `anon`, `service_role` retirés — état V7 inchangé).

## 5. RED → GREEN

| Bug | Test | RED (base V7) | GREEN (correctif) |
| --- | --- | --- | --- |
| B2 | pgTAP `gp_facture_brouillon_modification_v1` (34) | **15 échecs**, tous `permission denied for function recalc_totaux_facture` ; les 19 assertions de sécurité passent déjà | 34/34 |
| B1 | pgTAP `gp_pointages_totaux_mois_v1` (43) | échec : fonction absente | 43/43 |
| B1 | Vitest intégration `pointages-gestion.integration.test.ts` (vrai PostgREST, 5 volumes) | 5/5 échecs (RPC absente ; chemin historique faux dès 1 462) | 5/5 |
| B1+B2 | Vitest `pointages-gestion.test.ts`, `facture-brouillon-droits.test.ts` (sans base) | 3 échecs (page lit le mois entier ; RPC appelle recalc) | 15/15 |
| B1+B2 | Playwright `gp-pointages-facture-fix-v1.spec.ts` (navigateur réel) | pointages : totaux faux (140,75 ≠ 199,73) ; facture : reste sur `/modifier`, `permission denied` au journal | 4/4 |

### 5.1 Matrice RLS facture (pgTAP, `authenticated`)

| Cas | Attendu | Résultat |
| --- | --- | --- |
| Même entreprise, dirigeant A | brouillon modifiable, totaux exacts (287,25 HT / 45,17 TVA / 332,42 TTC) | ✅ |
| Même entreprise, administrateur A | modifiable (1 200 TTC) | ✅ |
| Sans ligne / aucune ligne avant ni après | accepté, montants 0 | ✅ |
| Facture **émise** (envoyee) | RPC refusée ; UPDATE montant refusé ; suppression de ligne refusée ; TTC inchangé | ✅ |
| Facture **payée** | RPC refusée ; ajout de ligne refusé | ✅ |
| Facture **annulée** (figée) | RPC refusée ; lignes inchangées | ✅ |
| **Autre entreprise** (dirigeant B) | facture de A « introuvable » ; client de A non rattachable ; sa propre facture modifiable | ✅ |
| Ouvrier A, conducteur A (sans `acces_factures`) | refusé | ✅ |
| anon | EXECUTE refusé (42501) | ✅ |
| `recalc_totaux_facture` direct sous `authenticated` | 42501 | ✅ |

### 5.2 Matrice pointages (pgTAP)

Vérité DB exacte (1 462 pointages, bruit hors période et chez B) ; parité RLS des totaux, des
compteurs et des pages d'anciennes saisies pour 6 profils (admin, ouvrier = ses seuls pointages,
chef d'équipe, conducteur, comptable = rien, dirigeant) ; pagination sans perte ni doublon ; refus
cross-tenant, membre désactivé, entreprise suspendue, sans identité, anon ; bornes et paramètres
(période inversée, > 366 jours, page > 200).

## 6. Test d'échelle — vérité DB, vrai PostgREST

`GP_POINTAGES_* npx vitest run src/lib/pointages-gestion.integration.test.ts` (dirigeant A, JWT réel,
PostgREST `db-max-rows = 1000`). **Après** = chargement réel de la page : totaux + compteurs +
1re page de sessions + 1re page d'anciennes saisies + contrôles de ces sessions.

| N | Vérité DB (h) | Avant : total | Avant : faux | Avant : ms / octets | Après : total | Après : faux | Après : ms / octets |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 2 636,60 | 2 636,60 | 0 | 585 / 218 498 | 2 636,60 | 0 | 1 023* / 110 415 |
| 1 000 | 5 317,55 | 5 317,55 | 0 | 1 443 / 436 998 | 5 317,55 | 0 | 225 / 110 490 |
| **1 462** | **7 762,37** | 5 322,52 | **38/38** | 2 009 / 437 002 | **7 762,37** | **0** | **239 / 110 536** |
| 5 000 | 26 586,09 | 5 322,45 | 125/125 | 6 620 / 436 998 | 26 586,09 | 0 | 291 / 127 307 |
| 20 000 | 106 348,26 | 5 317,34 | 500/500 | 1 288 / 436 998 | 106 348,26 | 0 | 650 / 199 704 |

\* premier passage à froid. Compteurs également exacts à tous les volumes : sessions 350 / 700 /
1 024 / 3 500 / 14 000, anciennes saisies 150 / 300 / 438 / 1 500 / 6 000, contrôles 700 → 28 000,
contrôles de la page = base. « Avant » ne charge jamais plus de 437 Ko **parce qu'il est tronqué** ;
lire réellement 20 000 lignes aurait coûté ≈ 8,7 Mo.

## 7. Performance

### 7.1 Requêtes (20 000 pointages, PostgREST, dirigeant)

| Requête | Avant | Après |
| --- | ---: | ---: |
| Totaux par salarié | faux (tronqué) | 0,41 s (RPC) |
| Nombre de sessions (`count=exact` sous RLS) | 15,8 s | 0,42 s (RPC compteurs, les 3 compteurs) |
| Nombre d'anciennes saisies | 39,6 s | (inclus ci-dessus) |
| Nombre de contrôles de zone | 29,0 s | (inclus ci-dessus) |
| Page d'anciennes saisies (anti-jointure PostgREST) | 37,0 s | 0,39 s (identifiants) + relecture de 50 lignes |
| Page de sessions (50) | 0,09 s | 0,18 s |

### 7.2 Navigateur réel (`next dev`, gérant pilote ; HTML de la page)

| N (+15 fixture) | Avant : durée / HTML / total affiché | Après : durée / HTML / total affiché | Vérité |
| ---: | --- | --- | ---: |
| 500 | 6,6 s / 2,83 Mo / 2 757,10 | 3,1 s* / 0,61 Mo / 2 757,10 | 2 757,10 |
| 1 000 | 11,8 s / 4,91 Mo / **5 379,20** | 2,5 s / 0,61 Mo / 5 438,05 | 5 438,05 |
| 1 462 | 15,3 s / 5,79 Mo / **5 345,86** | 2,3 s / 0,61 Mo / 7 882,87 | 7 882,87 |
| 5 000 | 23,1 s / 5,87 Mo / **5 369,03** | 2,6 s / 0,69 Mo / 26 706,59 | 26 706,59 |
| 20 000 | 15,6 s / 6,23 Mo / **5 350,07** | 4,3 s / 1,05 Mo / 106 468,76 | 106 468,76 |

\* compilation à froid. `next dev` : durées absolues non représentatives de la Production, ratio et
volumes significatifs. La page n'envoie plus au navigateur que les totaux (une ligne par salarié) et
50 sessions / 50 anciennes saisies ; à 20 000 le HTML restant est dominé par les 515 totaux et les
listes du formulaire de régularisation.

### 7.3 Pourquoi 1 000 était déjà faux dans le navigateur

La fixture pilote porte 15 pointages en août : 1 000 + 15 = 1 015 > 1 000.

## 8. Non-régression

| Contrôle | Résultat |
| --- | --- |
| pgTAP, suite complète (155 fichiers) | **146 propres, 4 599 tests** ; les 9 non propres sont exactement ceux de V7 (7 suites Studio du projet partagé, `platform_stripe_state_attestation_r72` — pgsodium réel absent, `elsatia_tools_cloud_sync_entitlement_closure_v1` — amorce). Base V7 : les mêmes 9 + les 2 nouvelles suites (RED). **0 régression.** Factures (`verrouiller_facture_emise`, `correctif_*_factures`, `fa08`, relances, RGPD purge facture émise), devis, pointages (PT-05/06/08, terrain mobile), planning, comptabilité/notes de frais : propres. |
| Vitest racine | 193 fichiers, **2 414 tests** passés (3 fichiers / 41 tests ignorés : intégrations sans pile) |
| Playwright nouveaux | 4/4 (§ 5) |
| Playwright pilote v2 + v3 (connexion 5 profils, gardes d'URL, parcours) | **29/32** ; les 3 échecs sont hors changement, voir § 8.1 |
| typecheck (`tsc --noEmit`, racine) | 0 erreur |
| lint (`eslint`, racine) | 0 erreur ; 15 avertissements préexistants, aucun dans les fichiers modifiés |
| build GP (`npm run build:gestion-pro`, prebuild manifeste d'environnement compris) | ✅ exit 0 |
| `verify:migrations`, `verify:train-expectations` | OK (361 migrations ; attendus Preview resynchronisés : `npm run sync:train-expectations`) |

Sous-applications (`apps/tools`, `apps/reserves`, `apps/colors`) : non modifiées, non relancées
(leurs dépendances ne sont pas installées dans ce bac à sable).

### 8.1 Résultats complémentaires

Pilote v2 + v3 sur la pile de cette mission (après correctif) : 29 passés, 3 échecs :

- **NF-01**, **PE-06** : `FAIL` déjà documentés tels quels par
  `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md` (§ résultats, « 6/8 ») — note de frais / signature, non touchés ;
- **ON-02** (logo de l'entreprise) : attend `getByAltText('Logo actuel')` servi par Storage ; le proxy
  de cette mission tournait **sans** `STORAGE_URL` (`/storage/v1` → 501 par construction,
  `local_supabase_proxy.mjs`), le mock Storage de la recette V3 n'était pas lancé. Environnement, sans
  lien avec pointages ou factures.

Parcours factures (création depuis devis, modification, émission, isolation), devis (devis accepté →
facture), pointages (gestion, pagination) couverts par la spec de cette mission ; planning et
comptabilité/notes de frais par pgTAP (propres) et les parcours pilotes.

## 9. Hors périmètre, constaté

1. **Rentabilité tronquée (même classe que B1, probablement P0 métier)** :
   `calculerRentabiliteChantiers` (`src/lib/rentabilite.ts`), `/rentabilite` (`page.tsx` l. 21) et
   `src/app/actions/rentabilite.ts` lisent `pointages` (et `factures`, `devis`,
   `depenses_fournisseurs`, …) de toute l'entreprise sans pagination puis agrègent en JS. Preuve :
   `GET /pointages?select=chantier_id,employe_id,heures_normales,heures_supplementaires&entreprise_id=eq.A`
   → `Content-Range: 0-999/20002`. Marges et coûts de main-d'œuvre faux au-delà de 1 000 lignes.
   Aussi : pointages de la fiche chantier (`chantiers/[id]/page.tsx` l. 80). Recommandation :
   même motif que ce correctif (agrégats SQL + parité RLS pgTAP).
2. **Suppression d'une facture brouillon avec lignes** : `delete from factures` échoue (cascade sur
   `lignes_factures` → `trg_lignes_factures_brouillon_only` ne trouve plus la facture et la traite
   comme émise). Aucun chemin applicatif ne supprime de facture aujourd'hui : latent.
3. **Comptable sans `acces_clients`** : `modifier_facture_brouillon` lui répond « Client
   introuvable » (lecture RLS de `clients`). Préexistant, inchangé.

## 10. Reproduire

```bash
# Base + pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh gp_green
cd supabase/tests && pg_prove -d gp_green gp_facture_brouillon_modification_v1.test.sql gp_pointages_totaux_mois_v1.test.sql

# Échelle, vrai PostgREST (db-max-rows = 1000) sur une base + fixture isolation_multitenant
GP_POINTAGES_REST_URL=http://localhost:3001 GP_POINTAGES_JWT_SECRET=<secret PostgREST> \
GP_POINTAGES_DB=<db> GP_POINTAGES_ENTREPRISE=a0000000-0000-0000-0000-000000000001 \
GP_POINTAGES_SUB=10000000-0000-0000-0000-000000000006 npx vitest run src/lib/pointages-gestion.integration.test.ts

# Navigateur réel : pile pilote (GoTrue + PostgREST :3002 max-rows 1000 + proxy :54321 + next dev :3100)
scripts/local-postgres-bootstrap/gotrue_pilot_bootstrap.sh pilot_gp
scripts/local-postgres-bootstrap/run_pilot_auth_scenarios.sh pilot_gp
PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome GP_FIX_DB=pilot_gp GP_FIX_POINTAGES=1462 \
  npx playwright test tests/e2e/gp-pointages-facture-fix-v1.spec.ts --project=desktop-chromium
```

Gestes de test uniquement (dans la spec) : report de la fin d'essai de la fixture pilote (datée de sa
création), purge du limiteur de connexion, création d'un devis accepté de recette par passage.
