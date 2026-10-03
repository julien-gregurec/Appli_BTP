# ELSATIA — Soak / performance / concurrence / endurance post-V9 (V1)

| | |
|---|---|
| Date | 2026-10-02 / 2026-10-03 (mission autonome) |
| Tête qualifiée | `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f284150e5d4f06fd68250f3ea19ff62a1` — **aucune branche V9.1 canonique finale n'existait sur `origin` au démarrage** (vérifié par `git ls-remote`), donc priorité 2 appliquée |
| Branche de mesure | `qualification/elsatia-soak-performance-v1` (scripts, tests rouges, preuves ; **aucune migration**) |
| Branche correctif | `fix/elsatia-soak-files-service-ordre-v1` (1 migration triviale + 1 test pgTAP, § F) |
| Déploiement | **Aucun.** Ni Preview, ni Production, ni Supabase hébergé, ni Stripe réel, ni merge. Aucun secret : clés JWT et mots de passe de banc générés localement, `.env.local` non versionné. |
| Checkpoint | `docs/qualification/ELSATIA_SOAK_PERFORMANCE_CHECKPOINT.md` |
| Preuves brutes | `docs/qualification/soak/` (JSON / logs / EXPLAIN) |

## 0. Verdict

**`ELSATIA_SOAK_PERFORMANCE_PARTIAL`**

Pas de P0. Aucune fuite inter-tenant, aucun double numéro, aucun double paiement au-delà du dû, aucun
deadlock, aucune erreur de sérialisation, aucune dérive du heap JS, aucun processus Chromium orphelin.
La qualification est **partielle** pour quatre raisons, toutes documentées plus bas :

1. **Défauts confirmés non corrigés dans cette mission** (architecture) : cron push (F, 9 tests rouges) et
   sélection des relances automatiques (G, 2 tests rouges) — perte silencieuse de travail au-delà de 200.
2. **RLS évaluée ligne à ligne** (≈ 1 ms/ligne) : coût dominant de toute lecture PostgREST directe, y compris
   des lectures croisées *vides* (3,1 s pour 5 000 lignes d'un autre tenant) ; prototype ×100 prouvé (§ RLS).
3. **Limites de capacité** au-delà de la cible PME 20–40 salariés : `/employes` (32 Mo HTML à 500 salariés,
   RSS serveur 2,7 Go), `/planning` (8 Mo), `/dashboard` CPU-bound au-delà de ~10 000 alertes ouvertes.
4. **Volumétrie 250 000 non atteinte** pour devis/factures (génération interrompue après 7 101 s, § 2) ;
   100 000 : voir § 2. Les mesures ont été prises sur un conteneur 4 vCPU **partagé** avec les
   générateurs : les latences sont pessimistes (signalé à chaque fois qu'un chiffre en dépend).

---

## 1. Environnement

| Élément | Valeur |
|---|---|
| Machine | conteneur 4 vCPU, 16 Go, sans swap, Node 22.22.0 |
| PostgreSQL | 16.14 local, **391 migrations** de la tête rejouées sans erreur (`scripts/local-postgres-bootstrap/rebuild_db.sh`) |
| PostgREST | v12.2.3 binaire officiel, `db-max-rows = 1000` (comme `supabase/config.toml`), `db-pool = 10` |
| GoTrue | v2.196.0 compilé depuis les sources (auth réel, JWT signés) |
| Next | `next build` puis `next start` (**jamais `next dev`**), échantillonneur mémoire in-process `scripts/perf/memory/sampler.cjs` |
| Chromium PDF | `@sparticuz/chromium` du dépôt, file `src/lib/pdf/file-pdf.ts` par défaut (`PDF_CONCURRENCE=2`, `PDF_FILE_MAX=10`) |
| pgTAP | paquet `postgresql-16-pgtap` |
| Bases | `soak` (mesure SQL/PostgREST, schéma auth minimal), `soak_app` (schéma GoTrue réel, pile complète Next) |

Écarts méthodologiques assumés : Postgres 16 (prod : 17) ; pas de `statement_timeout` plateforme
(Supabase hébergé en pose un par rôle, **non versionné dans le dépôt**) ; pool PostgREST local 10 ;
machine partagée avec la génération de données pendant une partie des mesures.

Artefacts de banc corrigés en cours de route (aucun n'est un défaut produit) : JWT `service_role` de banc
portant un `sub` (la vraie clé n'en a pas → `auth.uid()` non nul → faux refus 42501) ; fixture accordant
`mode_compte_depot` (redirection de toute l'application vers `/stock/borne`) ; `auth.users.created_at` nul
(GoTrue 500) ; insertion de 42 000 affectations en une transaction (« out of shared memory » : le trigger
`trg_verifier_heures_affectation` prend un verrou consultatif par ligne — l'application insère au plus
un jour × N salariés par appel, sans risque) ; sonde Chromium comptant le processus `node -e` lui-même.

## 2. Volumétrie générée

Générateur `scripts/perf/soak/volume_tenant.sql` (données 100 % synthétiques, `@soak.invalid`), un tenant
par palier, + fixture capacité historique `scripts/perf/generate_fixture.sql` (tenants A et B).

| Tenant | Devis | Factures | Notifications | Documents | Tâches | Chantiers | Salariés | Pointages | Affectations | Génération |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| T11 | 1 000 | 1 000 | 1 000 | 1 000 | 1 000 | 100 | 20 | — | — | 11 s |
| T12 | 5 000 | 5 000 | 5 000 | 5 000 | 5 000 | 500 | 20 | — | — | 57 s |
| T13 | 20 000 | 20 000 | 20 000 | 20 000 | 20 000 | 2 000 | 20 | — | — | 422 s |
| T14 | 50 000 | 50 000 | 50 000 | 50 000 | 50 000 | 5 000 | 20 | — | — | 2 865 s |
| T15 | 100 000 (cible) | | | | | | | | | voir § 2.1 |
| T16 | 250 000 (cible) | | | | | | | | | **abandonné** après 7 101 s |
| T21 | 1 000 | 1 000 | | | | 100 | 100 | 87 724 (5 ans) | 9 000 | 65 s |
| T22 | 1 000 | 1 000 | | | | 100 | **500** | 159 321 (1 an) | 45 000 | 72 s |
| A (fixture) | 5 012 | 3 000 | 1 200 | ~800 | — | 150 | 40 | 46 650 | — | — |

Totaux base `soak` : > 250 000 pointages, 108 749 tâches, > 80 000 devis et factures.

### 2.1 Pourquoi 250 000 n'a pas été atteint

Le coût d'écriture est dominé par les triggers des lignes de documents : **une seule ligne de devis
insérée coûte 13–25 ms** (`EXPLAIN ANALYZE` : `recalc_devis_apres_insertion_lignes` 18,9 ms, dont la mise à
jour imbriquée du devis et ses propres triggers). Linéaire (1k → 20k : ×38 de durée pour ×20 de volume),
mais 500 000 lignes représentent plusieurs heures sur ce conteneur. Le palier 250 000 a été arrêté pour
libérer la machine avant le long run. Ce n'est **pas** un défaut applicatif (l'éditeur enregistre quelques
dizaines de lignes par appel), mais c'est la cause du constat J6 (création d'un devis de 50 000 lignes :
135 s).

Constat secondaire de la génération : `trg_set_entreprise_reference` appelle
`next_reference(null,'entreprise',…)` — **un compteur global** dont le verrou est tenu jusqu'au commit.
Une transaction longue qui crée une entreprise bloque toute autre création d'entreprise (inscriptions).
Sans effet avec les transactions courtes de l'application (**P2-9**).

---

## 3. Tableau de synthèse

Latences en ms. « Mémoire » = RSS du serveur Next (pages) ou de Chromium (PDF). « Plan » = cause
dominante observée par `EXPLAIN ANALYZE`. Baseline = palier 1k ou tenant A.

| Flux | Volume | P50 | P95 | Max | Erreurs | Mémoire | DB plan | Verdict |
|---|---|---:|---:|---:|---|---|---|---|
| RPC `dashboard_indicateurs` | 1k | 21 | 26 | 26 | 0 | 147 Ko | agrégats + cache | PASS |
| RPC `dashboard_indicateurs` | 5k | 50 | 59 | 59 | 0 | 730 Ko | idem | PASS |
| RPC `dashboard_indicateurs` | 20k | 163 | 187 | 187 | 0 | 2,9 Mo | jsonb_agg de 14 635 alertes | DEGRADATION |
| RPC `dashboard_indicateurs` | 50k | 1 659 | 1 827 | 1 827 | 0 | 7,3 Mo | jsonb_agg de 36 988 alertes (machine chargée) | DEGRADATION |
| Exactitude dashboard (alertes, totaux, cache) | 5k / 20k | — | — | — | **0 écart** | — | — | PASS |
| Page `/dashboard` 10 VU | A (5k) | 2 205 | 2 555 | 2 623 | 0 | 1 065 Mo après GC, stable sur 1 000 req | — | PASS |
| Page `/dashboard` 10 VU | T14 50k | 16 137 | 18 371 | 30 737 | 0 (2 × 307) | 1 058 Mo après GC ; ELU 1 ; délai boucle p99 10,8 s | CPU Node (`construireAlertes` sur 37 k éléments) | DEGRADATION |
| RPC `devis_liste_paginee` p1 | 5k → 50k | 48 → 185 | 58 → 657 | | 0 | 7 Ko | `count(*) over ()` sur tout le filtre | PASS |
| RPC `devis_liste_paginee` recherche | 50k | 868 | 976 | 976 | 0 | 7 Ko | ILIKE ×5 colonnes + fenêtre | DEGRADATION |
| RPC `factures_liste_paginee` p1 | 50k | 329 | 349 | 349 | 0 | 7 Ko | idem | PASS |
| PostgREST direct `factures` sans limite | 20k | 22 238 | 26 627 | | 0 | tronqué 1 000 (`max_rows`) | RLS ×2 par ligne + `count=exact` | FAIL (chemin non utilisé par les pages) |
| Planning semaine (RPC) | 40 / 100 / 500 sal. | 86 / 415 / 4 311 | 136 / 956 / 4 438 | | 0 | 43 Ko / 348 Ko / 1,7 Mo | 2 × `peut_consulter_*` par salarié | PASS / PASS / DEGRADATION |
| Planning 20 lecteurs simultanés | 500 sal. | 10 020 | 22 133 | 24 270 | **85 / 200** (504 pool) | | idem | FAIL |
| Page `/planning` 10 VU | 500 sal. | 21 545 | 45 702 | 48 496 | 0 | 8 Mo HTML ; 791 Mo après GC | | DEGRADATION |
| Totaux pointages du mois | 500 sal. | 424 | 447 | 447 | 0 (500/500 lignes) | | | PASS |
| Lecture période 12 mois (`pointages_equipe_periode`) | 500 sal., 157 987 lignes | 4 944 | 5 288 | | 0, exact | 69 Mo jsonb | | DEGRADATION |
| Page `/pointage/gestion` 10 VU | 500 sal. | 9 197 | 11 869 | 14 395 | 0 | 625 Ko ; heap 150 → 192 Mo puis retombe | | DEGRADATION |
| Création pointages concurrents (32) | 500 | 57 | 136 | 242 | 0 (500/500) | | | PASS |
| Page `/employes` 10 VU | 500 sal. | 27 997 | 29 823 | 57 224 | 0 | **32 Mo HTML ; RSS 2,7 Go, 1,9 Go après GC** | | FAIL capacité (hors cible PME) |
| Numérotation 400 factures émises, 32 concurrents | — | 209 | 440 | 672 | 0 | | upsert compteur (verrou ligne) | PASS |
| Paiements concurrents même facture (32 × 50 %) | — | 51 | 71 | 71 | 30 refus métier | | `FOR UPDATE` facture | PASS |
| Devis → facture ×16, acompte 60 % ×16, avoir ×16 | — | 33–47 | 40–58 | | 15 refus métier chacun | | `FOR UPDATE` devis | PASS |
| Rejeu Stripe 2 405 livraisons, 24 concurrents | 805 évts | 33 | 105 | 377 | 0 | | réservation + ordre | PASS |
| PDF devis 1 / 10 / 50 / 100 (conc. 1/10/25/50) | — | 622 / 2 278 / 1 105 / 2 102 | — / 3 545 / 4 933 / 6 211 | 9 063 | 0 / 0 / 38 × 503 / 88 × 503 (saturation voulue) | Chromium ≤ 2 proc., ≤ 789 Mo | file bornée | PASS |
| PDF abandon client en plein rendu ×10 | 1 000 lignes | | | | — | **0 orphelin à +1 s** | | PASS |
| Cloisonnement A/B/C entrelacé | 1 500 req | 870 | 16 708 | 19 723 | **0 fuite, 0 5xx** | | | PASS |
| Long run 60 min | voir § L | | | | | | | voir § L |

---

## 4. Résultats par domaine

### A — Dashboard

* **Exactitude** : à 5k et 20k, `factures_alertes`, `devis_alertes`, `factures_total`,
  `factures_encaisse_total` et `devis_acceptes_total` renvoyés par l'API sont **identiques** à la vérité
  SQL superuser (`docs/qualification/soak/domain_a_tenant12.json`, `…13.json`). `devis_liste_paginee`
  renvoie le total exact (5 000, 20 000). `gp_options_chantiers` renvoie 2 000/2 000 chantiers (jsonb, pas
  de `max_rows`). Le cache `entreprises_dashboard_cache` reste exact après la charge concurrente D (écart 0).
* **Aucune troncature à 1 000** sur les chemins du tableau de bord : toutes les sources passent par des RPC
  `jsonb`. La lecture PostgREST directe sans limite est bien tronquée à 1 000 (`max_rows`) — chemin non
  utilisé par les pages (`domain_a_dashboard_serie1.log`).
* **Croissance** : la charge utile de `dashboard_indicateurs` est linéaire dans le nombre d'alertes
  ouvertes (≈ 200 octets/alerte : 147 Ko → 7,3 Mo). Le centre d'alertes (`construireAlertes`,
  `repartirAlertes`) traite **toutes** les alertes en Node à chaque rendu avant de n'en envoyer que 30 :
  à 37 000 alertes, la page monopolise le cœur Node (ELU 1, délai de boucle p99 10,8 s) → p50 16 s à
  10 VU. Volume irréaliste pour une PME (24 859 factures impayées), mais la croissance est linéaire sans
  plafond (**P2-1**). Entre 20k et 50k la RPC passe de 163 à 1 659 ms (×10 pour ×2,5) : mesure prise
  machine saturée, à re-mesurer à vide (§ 7).

### B — Planning

* Exact à 40 / 100 / 500 salariés (affectations API = SQL : 0 / 500 / 2 500 sur la semaine). Pas de N+1
  dans la page (une RPC `planning_semaine`, boucles en mémoire). Pas de vue « mois » dans l'UI : la RPC
  accepte une plage de 31 jours (1,5 s, 7,7 Mo à 500 salariés).
* Coût serveur à 500 salariés : **1,1 s** (`EXPLAIN ANALYZE`), dominé par la CTE `visibles` qui appelle
  `peut_consulter_affectation_employe` **et** `peut_consulter_pointage_employe` pour chacun des 500
  salariés (≈ 1 ms/appel). À 20 lecteurs simultanés : p50 10 s, **85 / 200 réponses 504** (pool
  PostgREST de 10 saturé) → FAIL à cette échelle (**P2-3**). Conflits : le trigger
  `trg_verifier_heures_affectation` (verrou consultatif par salarié/jour, plafond 24 h) a correctement
  sérialisé les insertions concurrentes ; aucun deadlock.

### C — Pointages

* 100 et 500 salariés, 1 à 5 ans d'historique : totaux du mois exacts (100/100, 500/500 lignes), lecture
  de période exacte (14 619 / 14 619 sur un mois ; 157 987 lignes sur 12 mois en 4,9 s, 69 Mo — la
  garde `LECTURE_TROP_VOLUMINEUSE` à 250 000 n'est pas atteinte).
* Création concurrente (32 simultanés, 500 salariés) : 500/500, p95 136 ms, 0 erreur.
* **Corrections** : 16 régularisations identiques et chevauchantes (même salarié, même jour,
  09:00–12:00) sont **toutes acceptées** — 17 pointages, ≈ 56 h le même jour. Ce n'est pas une course :
  `creer_pointage_regularisation` n'a ni contrôle de chevauchement ni plafond journalier (le séquentiel
  donne le même résultat). Action réservée au responsable, motif obligatoire et tracé (**P2-6**).
* **Export / verrouillage** : il n'existe **ni route d'export des pointages** ni **verrouillage de période
  de pointage** dans la tête (recherche exhaustive : `verrou|cloture|periode_verrouillee`). Non mesurable ;
  la lecture complète `pointages_equipe_periode` sert d'équivalent volumétrique. L'export paie
  (`paie_export_contenu`) n'a pas été chargé.
* Observation hors charge : `src/lib/pointages-gestion.ts` et `src/app/(app)/pointage/page.tsx` bornent les
  sessions avec un décalage **`+02:00` codé en dur** (faux en heure d'hiver, à partir du 2026-10-25) —
  signalé, non qualifié ici (**P2-12**).

### D — Facturation (PostgreSQL concurrent)

`docs/qualification/soak/domain_d_concurrence.json` — 32 clients PostgREST réels, JWT, RLS.

| Scénario | Résultat |
|---|---|
| D1 400 factures créées + émises en parallèle | 400 numéros distincts, contigus, compteur +400 : **pas de double numéro** |
| D2 32 paiements de 50 % simultanés, même facture | **2 acceptés**, 30 refusés « dépasse le reste dû », payé = TTC : pas de sur-paiement |
| D3 double clic : 2 paiements identiques (10 %, même référence) | **les deux enregistrés** (pas de clé d'idempotence ; borné par le reste dû) — DEGRADATION (**P2-4**) |
| D4 16 × devis → facture | 1 facture, 15 refus |
| D5 16 × acompte 60 % | 1 acompte (plafond contractuel), 15 refus |
| D6 16 × avoir sur la même facture | 1 avoir, 15 `avoir_existant:<id>` |
| D7 20 × réclamation de relance même niveau | 1 verrou |
| D8 cache dashboard après charge | écart 0,00 |
| Deadlocks / 40001 / 40P01 | **0** |

**Lost update prouvé au niveau SQL** (`scripts/perf/soak/race/lignes_lost_update.sh`) : deux insertions
de lignes *concurrentes* dans le même devis/facture laissent un total faux (montant_ht = ancien + 1 au lieu
de ancien + 1 001) : `recalc_totaux_devis` / `recalc_totaux_facture` somment les lignes **sans verrouiller
le document d'abord**. Les chemins applicatifs (`modifier_devis_brouillon`, `modifier_facture_brouillon`,
créations) verrouillent le document `FOR UPDATE` : **non atteignable par l'interface** ; atteignable par un
INSERT PostgREST direct (droit `insert` accordé à `authenticated`). Auto-réparé à la modification suivante.
**P2-5** (correctif : `select … for update` en tête des deux fonctions de recalcul).

Calcul TVA / rentabilité : les totaux recalculés sur 80 000+ documents sont restés cohérents avec la somme
des lignes ; la rentabilité n'a pas été mise en charge séparément (déjà qualifiée par
`ELSATIA_RENTABILITE_DATA_CORRECTNESS_V1`).

### E — Stripe synthétique (aucun Stripe réel)

* **Rejeu massif** (`domain_e_stripe_replay.mjs`, chemin base de la route webhook) : 20 entreprises ×
  40 événements `invoice.paid`/`payment_failed`, chaque événement livré 3 fois, ordre mélangé,
  24 livraisons simultanées, + 5 événements vieux de 30 jours livrés en dernier : 2 405 livraisons,
  **1 600 doublons reconnus, 805 décisions pour 805 événements, événements anciens « perime », statut final
  = événement le plus récent pour 20/20** → PASS (`domain_e_stripe_replay.json`).
* Harnais de concurrence existants rejoués sur la base volumineuse : ordre (15 ok), essai (7 ok),
  réabonnement (20 ok), cycle de vie / comptes supplémentaires (22 ok), suspension par application (27 ok) —
  **91 ok, 0 échec** (`E_*.log`).

### F — Cron push (défaut reporté)

Reproduit et caractérisé (`scripts/perf/soak/tests/cron_push_red.test.sql`, pgTAP ; route :
`cron-push-route.soak.test.ts`, Vitest avec le vrai `traiterNotificationPush`).

| N en attente (créées sur 23 h) | Après 2 passages quotidiens | Test |
|---|---|---|
| 50 / 199 / 200 | 0 restante | vert |
| **201** | **1 perdue définitivement** | rouge |
| **300** | **100 perdues** | rouge |
| **1 000** | **800 perdues** | rouge |

* **Ordre non déterministe** : `LIMIT 200` sans `ORDER BY` ; le plan réel est un *Bitmap Heap Scan* → ordre
  physique. Sur 300 en attente (150 récentes écrites d'abord), un passage a traité les 150 récentes et
  **50 des 150 anciennes** — celles qui sortent les premières de la fenêtre de 25 h (rouge F7, F8).
* **Notification jamais traitée** : au-delà de 200 par jour, ou si le cron saute un jour (F9 : 20/20
  perdues), tout ce qui sort de la fenêtre `now() - 25 h` n'est plus jamais sélectionné.
* **Équité** : un tenant avec 1 000 notifications prend les 200 places ; B et C ne sont pas servis (F10).
* **Reprise** : des passages immédiats successifs reprennent correctement les restantes (F11 vert).
* **Concurrence** : deux exécutions simultanées lisent les mêmes ids → double push (F12).
* **Message empoisonné** : une notification dont la préparation échoue reste en attente et occupe une place
  à chaque passage ; 200 d'entre elles bloquent toutes les autres (rouge Vitest).
* Observation : sans clés VAPID, chaque notification est **marquée envoyée sans push** (consommée).

**Correctif trivial et sûr appliqué sur branche isolée** `fix/elsatia-soak-files-service-ordre-v1`
(`8fba2be3`) : migration `20261002001901_push_file_attente_ordre_explicite_v1.sql`
(`order by n.created_at, n.id`, signature et droits inchangés) + test pgTAP dédié ; pgTAP 61/61 (nouveau
test + suite `post_v9_service_role_fonctions_v1`), `verify-migrations` OK, attendus du train synchronisés.
Effet : F7/F8 passent au vert ; F4–F6, F9, F10, F12 et le test « poison » **restent rouges** (architecture).

**Proposition détaillée (non implémentée)** :
1. RPC à pagination par curseur `(created_at, id) > p_apres`, triée, plafonnée ; la route boucle jusqu'à
   épuisement ou budget de temps (≈ 45 s, sous `maxDuration`) au lieu d'un seul lot de 200 ;
2. supprimer la fenêtre glissante de 25 h au profit d'une **expiration explicite** (ex. 7 jours, notification
   alors marquée `expiree` et comptée) — plus aucune perte silencieuse ;
3. **réservation atomique** : `update … set push_reservee_at = now() where id in (select … for update skip
   locked) returning id` (nouvelle colonne), libérée après 10 min — supprime le double push (cron/cron et
   cron/webhook) ;
4. compteur de tentatives : au-delà de 3 échecs de préparation, `push_echec_at` → sortie de file (poison) ;
5. équité : `row_number() over (partition by entreprise_id order by created_at)` dans la sélection ;
6. ne marquer « envoyée » que si un envoi a eu lieu ou si l'utilisateur n'a ni abonnement ni préférence
   active ; VAPID absent → laisser en attente et alerter.

### G — Relances automatiques

`scripts/perf/soak/tests/relances_auto_red.test.sql` (RPC de service de la tête : `relances_auto_*`).

* **Famine prouvée (rouge G2)** : `relances_auto_candidats_service` = `LIMIT 200` **sans `ORDER BY` ni
  filtre d'éligibilité** ; l'éligibilité (nombre max, délais, week-end, pause) est évaluée ensuite en
  TypeScript, document par document. 200 factures déjà relancées au maximum (inéligibles pour toujours,
  mais restées `envoyee`/`en_retard`) **évincent durablement** une facture saine en retard : elle n'est
  jamais relancée. Cas réaliste pour une entreprise qui accumule des impayés anciens.
* G3 (rouge) : pas d'ordre explicite. **Ajouter seulement un `ORDER BY` ancien→récent aggraverait la
  famine** (les inéligibles anciens seraient toujours en tête) : correctif non trivial, non appliqué.
* Verts : cloisonnement (G4), prévention des doublons par `relance_reclamer` (G5, et D7 : 20 réclamations
  simultanées → 1 verrou), reprise après indisponibilité du fournisseur e-mail (G6 : un niveau en `echec`
  est réclamable à nouveau).
* Débit : le cron traite les entreprises **séquentiellement**, avec 1–2 RPC par candidat (≤ 400/entreprise)
  sans `maxDuration` déclarée sur `/api/cron/abonnements` : la durée croît linéairement avec le nombre
  d'entreprises actives (à surveiller avant de dépasser quelques dizaines de tenants avec relances).
* **Proposition** : pousser dans le SQL les filtres d'inéligibilité *définitive* (relances envoyées ≥
  `nombre_max`, `date_echeance >= today`, soldées, exclusions) et trier par « date de dernière relance la
  plus ancienne d'abord » (`nulls first`) ; curseur de reprise par entreprise.

### H — PDF / Chromium

`docs/qualification/soak/domain_h_pdf.json`.

* 1 / 10 / 50 / 100 PDF : file bornée à **2 navigateurs**, file d'attente 10, au-delà **503 + `Retry-After:
  10`** (38/50 et 88/100 refusés proprement). Pic Chromium 789 Mo (devis de 1 000 lignes), Next ≤ 566 Mo.
* Jeton invalide (×30) : 404 en ≈ 60 ms **sans lancer Chromium** ; malformé : 404 ; quota partage public
  20 / 10 min / IP effectif (429). Jeton valide : 200, puis 429 après 20.
* **Nettoyage** : 0 processus Chromium 4 s après chaque phase ; 10 abandons client en plein rendu (devis de
  1 000 lignes) → `annulation` journalisée, **0 orphelin à +1 s**.
* **P2-2** : la génération authentifiée visite `/imprimer/devis/<id>` **avec le cookie de l'utilisateur** et
  consomme donc son quota `pages:print` (30/min) ; quand il est épuisé, la route PDF renvoie **502
  « Génération du PDF impossible »** (au lieu de 429) **après avoir lancé Chromium**. Reproduit : 70
  impressions puis 70 PDF → 10 × 429, 60 × 502.

### I — Mémoire Next

`domain_i_memoire_serie1.log`, `…serie2.json`. GC forcé à chaque palier.

* **Pas de fuite JS** : heap après GC 95–116 Mo sur toutes les séries (100 → 1 000 requêtes `/dashboard`,
  100 → 500 sur les pages lourdes) ; nombre de contextes natifs stable (4 → 9).
* **RSS en paliers** : le RSS après GC suit la **plus grosse réponse servie** et n'est pas rendu au système
  (allocateur) : 946 Mo (dashboard 50k) → 1 065 Mo → **1 911 Mo après `/employes` 500 salariés** (32 Mo par
  réponse, pic 2,7 Go), puis stable sur 1 000 requêtes supplémentaires. Pas de dérive, mais un conteneur de
  1–2 Go serait tué par l'OOM killer sur `/employes` à 500 salariés (**P2-7**).
* `/pointage/gestion` 500 salariés : heap 150 → 192 Mo sur 500 requêtes, retombé à 109 Mo en fin de
  campagne : cache transitoire, pas de fuite.
* 2 réponses `307` sur 1 000 `/dashboard` (T14) : voir § L.

### J — Abus d'API (local)

`domain_j_abus.json`, `domain_j_login.json`.

| Sonde | Résultat | Verdict |
|---|---|---|
| Login : 8 mauvais mots de passe, même compte/IP (vrai formulaire, Chromium) | 5 refus puis « Trop de tentatives » ; **bon mot de passe aussi bloqué** ; autre compte même IP : connecté | PASS |
| JWT signé autre clé / `alg: none` / expiré / tronqué | 401 ×4 ; cookie forgé → 307 `/login` | PASS |
| Export comptable 2000 → 2099 (50k) | 200, 2,9 s, 5,5 Mo (plafond SQL 250 000 lignes) ; quota 10/min → 429 | PASS |
| Page publique `/document/<jeton>` ×300 jetons aléatoires | 404, **aucun quota** (chaque appel = RPC admin) | P2-8 |
| Codes d'adhésion : 500 essais aléatoires via RPC | 400 « invalide », **≈ 690 essais/s, aucun freinage** ; code 8 car. / 31 symboles (≈ 2⁴⁰) tiré par `random()` (non cryptographique) ; un succès crée une demande « en attente » et **révèle le nom de l'entreprise** | P2-8 |
| PostgREST `limit=1000000` / `offset=1e9` (50k) | 1 000 lignes (206) mais **96 s** ; offset : **47 s** (RLS par ligne) — non borné localement (pas de `statement_timeout` versionné) | P1-2 |
| RPC pagination `p_taille=maxint` | 400 `integer out of range` ; `p_taille=1e6` → borné 200 | PASS |
| Pages `?page=1e9` / `?page=-5` | 200, bornées | PASS |
| `creer_devis_brouillon` 1 000 / 10 000 / 50 000 lignes (0,3 / 3 / 16 Mo) via PostgREST | **acceptés** : 1,3 s / 28 s / **135 s** (aucun plafond de lignes ; la limite 2 Mo des Server Actions ne protège pas l'accès PostgREST direct) | P2-10 |

### K — Multi-tenant sous charge

`domain_k_multitenant.json` : 1 500 requêtes entrelacées A / B / C (C = tenant 5k), dont requêtes **sans
filtre tenant** (RLS seule), lectures croisées et RPC dashboard croisée. Checksum md5 des ids par tenant
comparé à la vérité SQL : **0 fuite, 0 écart de checksum, 0 réponse 5xx** ; lectures croisées vides, RPC
croisée renvoie des agrégats nuls. Un premier passage à 24 concurrents avait produit des 504 (pool
PostgREST 10 saturé) — classés à part : une 5xx n'expose aucune donnée.

Coût notable : la lecture croisée *vide* `/devis?entreprise_id=eq.<autre>` prend **13 s** sous charge (la RLS
est évaluée sur chaque ligne de l'autre tenant). Voir **P1-2**.

### L — Long run

_(complété en § 8)_

---

## 5. Top 20 des requêtes / flux les plus coûteux

| # | Requête / flux | Mesure | Cause (EXPLAIN / profil) | Piste |
|---|---|---|---|---|
| 1 | PostgREST `devis?limit=1000000` (50k) | 96 s | RLS `a_permission` + `est_membre_actif` par ligne | RLS InitPlan (P1-2) |
| 2 | PostgREST `devis?offset=1e9` (50k) | 47 s | idem, toutes les lignes évaluées | idem + `statement_timeout` |
| 3 | `factures` + `count=exact` (20k) | 22 s | idem sur 20 000 lignes | idem |
| 4 | `/employes` 500 salariés, 10 VU | p50 28 s, 32 Mo | rendu inline des droits de chaque salarié | P2-7 |
| 5 | `/planning` 500 salariés, 10 VU | p50 21,5 s, 8 Mo | grille complète + 1,1 s SQL | P2-3 |
| 6 | `/dashboard` 37 k alertes, 10 VU | p50 16 s | CPU Node `construireAlertes` | P2-1 |
| 7 | `/pointage/gestion` 500 salariés | p50 9,2 s | 4 RPC + rendu | P2-3 |
| 8 | Lecture croisée vide `devis` (5k autre tenant) | 3,1 s (13 s sous charge) | RLS par ligne | P1-2 (prototype : 2 ms) |
| 9 | `pointages_equipe_periode` 12 mois, 500 sal. | 4,9 s, 69 Mo | jsonb de 157 987 lignes | pagination |
| 10 | `planning_semaine` 500 salariés | 1,1 s serveur | `peut_consulter_*` × 2 × 500 | permission globale d'abord |
| 11 | `dashboard_indicateurs` 50k | 1,66 s, 7,3 Mo | jsonb_agg des alertes | agréger/compter en SQL, page 30 |
| 12 | `creer_devis_brouillon` 50 000 lignes | 135 s | trigger recalcul + update devis par ligne | plafond de lignes |
| 13 | PostgREST `devis` 1 000 lignes propres (50k) | 848 ms | RLS par ligne | P1-2 (prototype : 7 ms) |
| 14 | `devis_liste_paginee` recherche (50k) | 868 ms | ILIKE ×5 + `count(*) over ()` | trigram / compte borné |
| 15 | Tâches d'un chantier (`taches.chantier_id`) | 570 ms (seq scan 108 749 lignes) | **index manquant** | index proposé (§ 6) |
| 16 | `pointages_gestion_totaux_mois` 500 sal. | 424 ms | agrégat mensuel | acceptable |
| 17 | `factures_liste_paginee` p1 (50k) | 329 ms | fenêtre sur tout le filtre | compte borné |
| 18 | Export comptable « ventes » 2000-2099 (50k) | 2,9 s, 5,5 Mo | volume | acceptable (plafond 250 000) |
| 19 | PDF devis 1 000 lignes | 1,9–3,6 s, Chromium 562 Mo | rendu | file bornée OK |
| 20 | Insertion d'une ligne de devis | 13–25 ms | `recalc_devis_apres_insertion_lignes` 18,9 ms | acceptable (UI) |

## 6. Index

Règle respectée : **aucun index créé en dehors d'une transaction annulée.**

| Candidat | Requête | Avant | Plan avant | Index proposé | Coût écriture | Taille | Après |
|---|---|---|---|---|---|---|---|
| **1** | `src/app/(app)/chantiers/[id]/page.tsx:77` — `taches` d'un chantier `order by created_at` | **570 ms** (268–940 ms selon charge) | `Seq Scan on taches`, 108 735 lignes rejetées pour 14 | `create index taches_chantier_created_idx on public.taches (chantier_id, created_at);` | 5 000 insertions : 64 ms avec / 75 ms sans (bruit) | **1 Mo** (table 15 Mo) | **63 ms** (`Bitmap Index Scan` ; le reste = RLS sur 14 lignes) |

Preuve : `docs/qualification/soak/index_taches_chantier_explain.txt`, script
`scripts/perf/soak/index/taches_chantier.sql`. `taches` est la seule table « lignes » sans index sur sa clé
de rattachement, et la page chantier la lit en seq scan **sur tous les tenants**.

Aucun autre index n'est justifié par les mesures : les lenteurs restantes viennent de la RLS par ligne, de
la taille des réponses ou du CPU Node, pas d'un plan sans index.

**Prototype RLS (pas un index, ROLLBACK)** — `scripts/perf/soak/index/rls_initplan_devis.sql`,
`docs/qualification/soak/rls_initplan_devis_explain.txt` : policies de `devis` réécrites en
`entreprise_id in (select …)` (ensemble des entreprises autorisées calculé **une fois** par requête,
`InitPlan`) au lieu de `a_permission(entreprise_id, …)` par ligne :

| Requête (tenant 50 000 devis) | Avant | Après |
|---|---:|---:|
| 1 000 devis du tenant | 848 ms | **7 ms** |
| Lecture croisée vide (tenant A, 5 012 devis) | 3 116 ms | **2 ms** |
| Lignes visibles sans filtre | — | 50 000 (exactement le tenant) |

---

## 7. Classement

### P0
**Aucun.** Aucune perte de données métier, aucune fuite inter-tenant, aucune corruption atteignable par
l'application, aucun blocage de flux critique.

### P1
* **P1-1 — Cron de secours push : perte silencieuse** au-delà de 200 notifications en attente par jour
  (fenêtre 25 h), ordre physique, double push en exécution concurrente, famine par message empoisonné.
  9 rouges pgTAP + 4 rouges Vitest. Ordre corrigé (branche `fix/…`), le reste est une proposition (§ F).
* **P1-2 — RLS évaluée ligne à ligne** (`a_permission` + `est_membre_actif`, SECURITY DEFINER non
  inlinables, ≈ 1 ms/ligne) : toute lecture PostgREST directe coûte proportionnellement au nombre de
  lignes **examinées**, y compris celles d'un autre tenant (lecture croisée vide : 3–13 s ; `limit=1e6` :
  96 s) ; pool PostgREST saturé (504) dès 20–24 lectures concurrentes. Amplification accessible à tout
  utilisateur authentifié, bornée uniquement par le `statement_timeout` de la plateforme (non versionné).
  Prototype `InitPlan` : ×120 à ×1 500 (§ 6). Migration à concevoir table par table (inclure la branche
  « accès support » d'`a_permission`).
* **P1-3 — Relances automatiques : famine** — 200 documents ouverts mais définitivement inéligibles
  bloquent toute relance des autres (rouge G2) ; correctif = filtrer l'inéligibilité définitive en SQL
  (§ G).

### P2
* **P2-1** Centre d'alertes du dashboard : charge utile et CPU Node linéaires dans le nombre d'alertes
  ouvertes (7,3 Mo, p50 16 s à 37 000 alertes) — paginer/agréger en SQL.
* **P2-2** PDF authentifié : consomme le quota `/imprimer` (30/min) → 502 au lieu de 429, Chromium lancé
  pour rien.
* **P2-3** Planning / pointages à 500 salariés : 1,1 s SQL (contrôles par salarié), 8 Mo HTML, 504 à
  20 lecteurs.
* **P2-4** Paiement : pas de clé d'idempotence (double clic = 2 paiements, borné au reste dû).
* **P2-5** Lost update des totaux sur insertions de lignes concurrentes (SQL direct uniquement).
* **P2-6** Régularisation de pointage : ni contrôle de chevauchement ni plafond journalier (56 h/jour
  acceptées).
* **P2-7** `/employes` : 32 Mo HTML à 500 salariés (droits rendus inline), RSS 2,7 Go.
* **P2-8** Surfaces sans quota : page publique `/document/<jeton>`, `rejoindre_entreprise_par_code`
  (~690 essais/s, `random()`, révèle le nom de l'entreprise en cas de succès).
* **P2-9** Création d'entreprise sérialisée par un compteur global tenu jusqu'au commit.
* **P2-10** `creer_devis_brouillon` sans plafond de lignes (16 Mo / 135 s acceptés via PostgREST) ; aucun
  `statement_timeout` versionné dans le dépôt.
* **P2-11** RPC `setof`/`table` encore soumises à `max_rows = 1000` : `pointages_gestion_totaux_mois`
  (> 1 000 salariés), `chantiers_pointage_disponibles` (> 1 000 chantiers), `employes_delegables_alertes` ;
  lectures `postes` / `permissions_disponibles` non paginées sur `/employes`.
* **P2-12** Décalage horaire `+02:00` codé en dur dans les bornes de sessions de pointage.
* **P2-13** Index `taches(chantier_id, created_at)` (§ 6).
* **P2-14** Push : sans VAPID, les notifications sont consommées sans envoi.

## 8. Long run (L)

_(en cours de rédaction — résultats ci-dessous)_
