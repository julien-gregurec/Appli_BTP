# ELSATIA — Runbook exécutable de cutover Production V1

**Lot :** `ELSATIA-PRODUCTION-CUTOVER-PREFLIGHT-V1` — 2026-09-07
**Nature :** procédure **préparée, non exécutée**. **Production touchée : NON.**

Audit d'appui : `docs/audits/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_V1.md`.
Critères binaires : `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_GO_NO_GO_V1.md`.
Rollback détaillé (stratégies A/B/C, matrice de scénarios) : `ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

> **Précédence.** Là où `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` (branche
> `docs/gp-cutover-documentation-closure-v1`) est disponible, **il fait foi**. Le présent runbook
> est la version exécutable produite sur la branche courante ; il en reprend les gates et y ajoute
> trois contrôles issus de l'audit de ce lot : la **sentinelle d'objets non gardés** (T-45), le
> **gate déplacé avant la migration #6** (T0), et le **contournement des outils manquants** (J-1).

---

## Fiche cible — à relire à voix haute avant d'ouvrir la fenêtre

```
SHA APPLICATIF CIBLE : 996be15c136f09d9977375e700462b503a1720c3
BRANCHE SOURCE       : feat/elsatia-commercial-canonical-r1-r2-r3-v1
PRODUCTION BRANCH    : release/commercialisation-v1   (jamais main, feat/*, integration/*)
LEDGER               : 210  ->  263
MIGRATIONS           : 53   (append-only : 53 A / 0 M / 0 D)
FLAG OBLIGATOIRE     : --include-all   (13 des 53 ont un horodatage < max Production)
1er GESTE IRRÉVERSIBLE : migration #6   20260818000205  (drop column employes.cout_horaire)
POINT DE NON-RETOUR ACL: migration #43  20260902000255_acl_reconciliation_v1
PROJET PRODUCTION    : exhvuzegsefmoguxoiak (eu-west-3)
PROJET PREVIEW       : pgvvpqyjziyapbbkydmc  <- la CLI locale est liée ICI
STRIPE               : TEST pendant toute la fenêtre. Aucune clé sk_live_.
HOTFIX POST-CUTOVER  : 7ba62c5315213bf21b9ed8553408fc678e943327 (0 migration)
```

**Périmées, jamais des consignes :** `c1930ab`, `a81f317`, `b371641`, `1d15289` · ledger 253/261 ·
gap 50/51 · baseline 211.

---

## Rôles — à renseigner avant T0

| Rôle | Responsabilité | Nom |
|---|---|---|
| **A** | opérateur DB : baseline, sauvegardes, migrations | **ACTION JULIEN** |
| **B** | opérateur applicatif : promotion Git, déploiement Vercel, variables | **ACTION JULIEN** |
| **C** | **décideur GO / ROLLBACK** — seul habilité à prononcer un rollback | **ACTION JULIEN — sans nom, NO-GO** |
| **D** | vérificateur : smoke tests post-cutover | **ACTION JULIEN** |
| **E** | second admin plateforme `total` MFA | **ACTION JULIEN** |

Un même humain peut porter A et B. **C doit être distinct de A** : celui qui exécute ne décide pas
seul d'arrêter.

---

## Convention de lecture

Chaque pas : **action → attendu → GO/STOP → responsable → preuve à archiver**.
Un **GATE** est binaire : tout écart = **STOP**, pas d'appréciation.

---

# J-1 — Prérequis hors fenêtre (aucune Production touchée)

| # | Action | Attendu | Resp. | Preuve |
|---|---|---|---|---|
| J1 | `git fetch origin` puis vérifier `git rev-parse origin/release/commercialisation-v1` | à jour ; local aligné sur origin | B | sortie |
| J2 | `git merge-base --is-ancestor origin/release/commercialisation-v1 996be15` | **vrai** → fast-forward possible | B | sortie |
| J3 | `git log -1 --format=%H 996be15` | `996be15c136f09d9977375e700462b503a1720c3` | B | sortie |
| J4 | **Suite de tests pré-cutover T1→T18** (audit §10) sur `996be15` | tous verts ; T3 pgTAP **100 %** | A+B | journaux |
| J5 | **Résoudre O-1** : trancher la voie d'accès DB (CLI Supabase `--db-url` **ou** `libpq` installé) et la **tester contre Preview** | une commande de lecture ledger fonctionne bout en bout | A | sortie |
| J6 | **Résoudre O-2** : `npx vercel whoami` | authentifié sur le bon compte | B | sortie |
| J7 | Volume DR monté, arborescence présente, ≥ 50 Gio libres, aucun conteneur Docker écrivant dessus | OK | A | `df -h`, `ls` |
| J8 | Second admin (rôle E) : compte Auth créé, **TOTP enrôlé et vérifié par la personne** | prêt à activation post-cutover | Julien | attestation orale |
| J9 | Plan **Supabase Pro actif** + **une sauvegarde managée réellement listée** | oui | Julien | capture |
| J10 | Fiche variables Vercel Production relue — **noms et présence uniquement** | complète | B | checklist |
| J11 | Couple Ed25519 prêt (`STRIPE_STATE_ATTESTATION_KEY_ID` + clé privée B64) — **pas encore posé** | prêt | B | runbook Ed25519 |
| J12 | Gel du dépôt : **aucune migration ajoutée**, ledger figé à 263 | confirmé | tous | `npm run verify:migrations` |

**GATE J-1 :** un seul `non` → la fenêtre n'est pas ouverte.

---

# T-60 — Gel, revalidation Git, lecture baseline

| # | Action | Attendu | Resp. |
|---|---|---|---|
| 1 | Annoncer l'ouverture de fenêtre ; A, B, C, D joignables | tous présents | C |
| 2 | `git fetch origin` puis revalider J2 et J3 | inchangés | B |
| 3 | Vérifier `cat supabase/.temp/project-ref` | `pgvvpqyjziyapbbkydmc` (**Preview**) — confirme qu'aucun `--linked` ne visera Production | A |
| 4 | Charger la chaîne Production dans `PROD_URL` **en variable de shell uniquement** — jamais dans un fichier, un log, un ticket | variable posée | A |

---

# T-45 — GATE P0-1 : baseline Production (lecture seule)

Quatre lectures. **Aucune écriture.** Toutes les sorties sont archivées dans le volume DR.

### Requête 1 — ledger

```bash
supabase migration list --db-url "$PROD_URL"
```
**Attendu :** colonne `Remote` = **210 lignes**, dernière = `20260824000231`.

### Requête 2 — comptage brut et version max

```sql
select count(*) as ledger, max(version) as derniere
from supabase_migrations.schema_migrations;
```
**Attendu :** `210 | 20260824000231`.

### Requête 3 — écart ledger ↔ dépôt

Comparer la liste `Remote` aux 210 fichiers de `5777abb`.
**Attendu :** ensembles **identiques**, et les 53 du gap **toutes absentes**.

### Requête 4 — SENTINELLES (contrôle ajouté par ce lot)

Quatre objets sont créés **sans garde `if not exists`** par les migrations #6, #7 et #11. Si l'un
existe déjà en Production (dérive hors ledger — précédent avéré, cf. migration `…000231`), la
migration **échoue en dur au milieu de la fenêtre**.

```sql
select
  to_regclass('public.employes_cout_horaire')  as t_employes_cout_horaire,
  to_regclass('public.avenants')               as t_avenants,
  to_regclass('public.lignes_avenants')        as t_lignes_avenants,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='pointages'
       and column_name='cout_horaire_applique') as c_cout_horaire_applique;
```
**Attendu : `null | null | null | 0`.**

### Requête 5 — signature `plateforme_entreprises` (observation)

```sql
select pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='plateforme_entreprises' and p.pronargs=0;
```
Noter si le résultat contient `option_ia_statut` : détermine si la migration #14 fera un `drop
function` réel ou un no-op. **Informatif, pas bloquant.**

### Checklist binaire du GATE P0-1

| Contrôle | Attendu | Constaté | GO/STOP |
|---|---|---|---|
| Ledger Production | **210** | ____ | ____ |
| Dernière version | `20260824000231` | ____ | ____ |
| Les 53 du gap absentes | oui | ____ | ____ |
| Aucun fichier appliqué en Prod absent du dépôt | oui | ____ | ____ |
| `employes_cout_horaire` | **absente** | ____ | ____ |
| `avenants` | **absente** | ____ | ____ |
| `lignes_avenants` | **absente** | ____ | ____ |
| `pointages.cout_horaire_applique` | **absente** | ____ | ____ |

> **Un seul écart → STOP. La fenêtre est refermée sans aucune écriture.** Ledger ≠ 210 : l'écart
> est analysé hors fenêtre, ce runbook est recalculé, une nouvelle fenêtre est planifiée. Une
> sentinelle présente : la migration correspondante doit être rendue idempotente **dans une
> migration additionnelle**, testée en Fresh + Restore, avant toute nouvelle fenêtre. **Jamais de
> correctif improvisé pendant la fenêtre.**

---

# T-30 — Sauvegardes (P0-3)

`backup_id` = horodatage UTC unique, commun à toutes les sauvegardes. Ex. `20260907T143000Z`.

| # | Action | Attendu | Resp. |
|---|---|---|---|
| 5 | **B1** — snapshot managé Supabase (Dashboard) | id + horodatage notés ; rétention ≥ T0+24 h | A |
| 6 | Réactiver le rôle `elsatia_backup` le temps du dump | actif | A |
| 7 | **B2** — `supabase db dump --db-url "$PROD_URL" -f "$DR/database/elsatia_prod_<backup_id>.dump"` | fichier créé **dans le volume DR chiffré** | A |
| 8 | SHA-256 du dump, **calculé puis relu** | valeurs identiques | A |
| 9 | **B3** — backup Storage (13 buckets) puis `verify-storage-backup` | **PASS** | A |
| 10 | **B4** — métadonnées Auth : nb utilisateurs, nb facteurs TOTP (**jamais les secrets**) | archivé | A |
| 11 | **B5** — état avant migration : ledger complet, inventaire ACL (`aclexplode` + policies), `plateforme_admins`, sorties des requêtes 1→5 | archivé | A |
| 12 | **B6** — manifeste unique reliant B2/B3/B4/B5 par `backup_id` | cohérent | A |
| 13 | Refermer le rôle `elsatia_backup` (NOLOGIN) | fermé | A |

---

# T-15 — Preuve de restauration (B7)

| # | Action | Attendu | Resp. |
|---|---|---|---|
| 14 | Restaurer B2 dans une **base probe jetable** — jamais Preview, jamais Production | restauration sans erreur | A |
| 15 | Relire les sentinelles sur la probe : ledger **210**, dernière version `…000231` | identiques à T-45 | A |
| 16 | Détruire la probe | détruite | A |

> **STOP si la restauration échoue.** Sans sauvegarde restaurable prouvée, il n'y a pas de
> rollback : la fenêtre est refermée, aucune migration n'est appliquée.

---

# T0 — GATE GO/NO-GO migration, puis application

### GATE T0 — dernière décision avant toute écriture

Prononcé par **C**, à voix haute, tous présents. Voir la **carte GO-T0** du document GO/NO-GO.

> ⚠ **Le premier geste irréversible est la migration #6, pas la #43.**
> `…000205` exécute `alter table public.employes drop column cout_horaire`. La donnée est recopiée
> avant dans `employes_cout_horaire`, donc **aucune perte** — mais la structure ne revient pas
> sans restauration. À partir du pas 18 ci-dessous, tout retour arrière est une **restauration de
> sauvegarde**, avec perte de tout ce qui a été écrit depuis T-30.

| # | Action | Attendu | Resp. |
|---|---|---|---|
| 17 | Maintenance **ON** (si retenue) | bandeau actif | B |
| 18 | **Appliquer les migrations :** `supabase migration up --db-url "$PROD_URL" --include-all` | 53 appliquées, **0 erreur** | A |

**Le flag `--include-all` n'est pas optionnel.** Sans lui, les 13 migrations `…000200`–`…000215`
sont ignorées et le schéma final est faux.

**En cas d'échec en cours d'application — ne rien improviser :**
- noter **le numéro exact de la migration en échec** et le message intégral ;
- **ne pas relancer**, **ne pas éditer une migration**, **ne pas appliquer un correctif manuel** ;
- appeler **C** ;
- échec **avant #6** → forward-fix hors fenêtre possible, aucune écriture destructive n'a eu lieu ;
- échec **entre #6 et #43** → décision **C** : restauration (B) ou forward-fix préparé (A) ;
- échec **après #43** → restauration (B) par défaut, sauf décision explicite de **C**.

---

# T+10 — Contrôles ledger

| # | Contrôle | Attendu | Resp. |
|---|---|---|---|
| 19 | `select count(*), max(version) from supabase_migrations.schema_migrations;` | **`263`** et **`20260905000265`** | A |
| 20 | Sentinelles inversées : les 4 objets du GATE P0-1 **existent maintenant** | `employes_cout_horaire`, `avenants`, `lignes_avenants` non nulles ; `cout_horaire_applique` = 1 | A |
| 21 | `employes.cout_horaire` **n'existe plus** ; `employes_cout_horaire` contient **autant de lignes qu'`employes`** | égalité stricte | A |
| 22 | Socle multi-app présent (tables de `…000234`) | présentes | A |
| 23 | Colors : tables de `…000246` présentes | présentes | A |
| 24 | Tools : tables entitlements de `…000236`(30/08) présentes | présentes | A |
| 25 | `plateforme_entreprises` : nouvelle signature, sans `option_ia_statut` | conforme | A |
| 26 | `notify pgrst` pris en compte — schéma PostgREST rechargé | API à jour | A |

**STOP** si 19, 21 ou 22 échoue.

---

# T+20 — GATE point de décision migration

**C** prononce, sur la seule base des pas 19→26 :
- **GO** → poursuivre en T+30 ;
- **ROLLBACK** → §Rollback ci-dessous.

Le point de non-retour ACL (#43) est franchi. Un retour arrière à partir d'ici est une
**restauration**.

---

# T+30 — Promotion et déploiement applicatif

| # | Action | Attendu | Resp. |
|---|---|---|---|
| 27 | `git fetch origin` | à jour | B |
| 28 | Promotion **fast-forward strict** de `996be15` dans `release/commercialisation-v1` | `git merge --ff-only 996be15` réussit — **aucun merge commit, aucun force-push** | B |
| 29 | `git push origin release/commercialisation-v1` | poussé | B |
| 30 | Déploiement Vercel sur la **Production Branch `release/commercialisation-v1`** — **jamais `main`** | build vert, région `fra1` | B |
| 31 | **Ed25519 — ordre strict, jamais inversé :** (1) poser `STRIPE_STATE_ATTESTATION_KEY_ID` et `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` côté Vercel, (2) **ensuite** remplir la registry en base | le registry ne peut être rempli qu'**après** que le ledger a atteint `…000245` | B |
| 32 | **Réaffirmer** (réécrire, ne pas « vérifier ») les 3 flags non relisibles : `ABONNEMENTS_PUBLICS_OUVERTS=false`, `STRIPE_WEBHOOK_EXPECTED_MODE=test`, `DISABLE_EMAIL_LOGIN=false` | réécrits | B |
| 33 | Redéploiement après pose des variables | build vert | B |
| 34 | Maintenance **OFF** | site ouvert | B |

---

# T+45 — Smoke tests post-cutover

Sur Production réelle, sans créer de donnée client. **Toute anomalie remonte immédiatement à C.**

### Gestion Pro — `https://app.elsatia.fr`

| # | Test | Attendu |
|---|---|---|
| G1 | Login e-mail + mot de passe | session ouverte, tableau de bord chargé |
| G2 | Tableau de bord | KPI affichés, aucune erreur console |
| G3 | Clients — liste et fiche | pagination et détail OK |
| G4 | Devis — liste, ouverture, **création d'un brouillon puis suppression** | cycle complet |
| G5 | Facturation — liste, ouverture d'une facture | affichage correct ; verrou « facture émise » actif |
| G6 | `/abonnement` — **compteur personnes actives X/Y** (R1) | compteur affiché |
| G7 | `/abonnement` — section **Modules** (R3) : inclus / ajoutés / disponibles | 3 sections affichées |
| G8 | Module non inclus → `/abonnement/module-non-inclus` | page terminale, **pas de boucle de redirection** |
| G9 | Prévisualisation de capacité **+1** (sans « Confirmer ») | montant proratisé affiché |

### AAL2 / plateforme

| # | Test | Attendu |
|---|---|---|
| P1 | Login AAL1 de l'admin — les sessions pré-cutover sont re-challengées | comportement voulu |
| P2 | Challenge TOTP → AAL2 | session élevée |
| P3 | Accès `/plateforme` en AAL2 | autorisé |
| P4 | Matrice de refus : non authentifié → refus · AAL1 → challenge · AAL2 non-admin → refus · AAL2 admin inactif → refus | 4 refus conformes |
| P5 | **Activer le second admin (rôle E)** : `plateforme_rattacher_admin` puis `plateforme_activer_admin`, exécutées par le premier admin en AAL2, la cible ayant son TOTP vérifié | second admin `total` **actif** |
| P6 | Login indépendant du second admin jusqu'en AAL2 | **bus factor levé** |

> **P5/P6 lèvent E-04.** Aucun `insert` direct dans `plateforme_admins` : la base refuse
> auto-rattachement et auto-activation, et c'est voulu.

### Tools — `https://tools.elsatia.fr`

| # | Test | Attendu |
|---|---|---|
| T1 | Usage **free** hors connexion | inchangé |
| T2 | Création / login du **compte commun** | session ouverte |
| T3 | Lecture de l'**entitlement** de l'utilisateur | statut correct (`free` attendu) |
| T4 | **Synchronisation cloud** d'un projet | projet remonté |
| T5 | **Les 8 routes `/api/tools/monetization/**` répondent** (plus de 404/500) | **preuve que le socle 236–240 est en place** |
| T6 | Vérification d'achat côté serveur, en **Stripe TEST** | chaîne complète OK |

### Colors — `https://colors.elsatia.fr`

| # | Test | Attendu |
|---|---|---|
| C1 | Login | **plus de mur de connexion** |
| C2 | Dashboard | chargé |
| C3 | Rôle organisation (`colors_admin_organisation`) | permissions appliquées |

> ⚠ Colors reste au **canon applicatif non déployé** (`30fed99`, E-14). Le cutover lève le
> blocage **base** ; le déploiement Colors est un geste **distinct et postérieur**.

### Réserves

**Aucun test.** Aucune migration du gap ne concerne Réserves : ni application, ni package, ni
entrée au catalogue d'accès, contrat d'intégration non écrit (E-21). **Ligne close.**

### Stripe — TEST uniquement

| # | Test | Attendu |
|---|---|---|
| S1 | `STRIPE_WEBHOOK_EXPECTED_MODE` = `test` | confirmé par smoke contrôlé |
| S2 | Un aller-retour webhook abonnement **Test signé** → `synchroniser_abonnement_stripe_service` | traité |
| S3 | Événement `livemode=true` | **rejeté fermé** |
| S4 | Entreprise inconnue | erreur contrôlée, aucun log sensible |

**Aucun paiement réel. Aucune clé `sk_live_`.**

---

# T+60 — GATE GO/NO-GO global

**C** prononce :
- **GO** → surveillance rapprochée ;
- **ROLLBACK** → §Rollback.

---

# T+90 → T+120 — Surveillance et clôture

| # | Action | Resp. |
|---|---|---|
| 35 | Sentry : aucune nouvelle famille d'erreur | D |
| 36 | Logs Vercel : pas de 5xx récurrent | B |
| 37 | Supabase : connexions, requêtes lentes, taille DB | A |
| 38 | Rejouer G1, T3, C1 à T+120 | D |
| 39 | Archiver dans le volume DR : sorties du GATE P0-1, manifestes, journal des 53 migrations, résultats des smokes, décisions de C horodatées | A |
| 40 | Clôture prononcée ; relier la CLI Supabase à **Preview** si elle a été reliée ailleurs | A+C |

---

# Post-cutover — Hotfix pilote `7ba62c`

Séparé, **jamais** dans la même fenêtre.

| # | Action | Attendu |
|---|---|---|
| H1 | `npm run db:start && npm run test:db` | **PASS** — lève la réserve E-11 (le démon Docker est disponible) |
| H2 | Vérifier `7ba62c5` : **0 migration**, ledger reste **263** | confirmé |
| H3 | Promotion fast-forward dans `release/commercialisation-v1` puis déploiement | applicatif seul |
| H4 | Reprendre la documentation depuis `docs/gp-cutover-documentation-closure-on-hotfix-v1` | évite de réintroduire une checklist périmée |

---

# Rollback

## Principe

**Aucune migration `down` n'existe dans le dépôt.** Le rollback n'est jamais un « défaire ». Trois
stratégies, détaillées dans `ELSATIA_PRODUCTION_ROLLBACK_V1.md` §5 :

- **A — Forward-fix** (à privilégier) : corriger en avant par une migration additionnelle.
- **B — Restauration snapshot / dump** : retour à l'état T-30. **Perte de toutes les écritures
  postérieures.**
- **C — Bundle d'urgence de compatibilité** : redéployer l'applicatif précédent contre le schéma
  263. **Réservé aux cas où le schéma est sain et seul l'applicatif est en cause.**

## Matrice par étape

| Étape | Rollback possible ? | Comment | Perte de données | Restauration nécessaire | Irréversible |
|---|---|---|---|:--:|:--:|
| J-1 → T-15 | ✅ trivial | refermer la fenêtre | non | non | non |
| GATE P0-1 (T-45) | ✅ trivial | STOP, aucune écriture | non | non | non |
| Sauvegardes (T-30) | ✅ trivial | STOP | non | non | non |
| **Migrations #1 → #5** | ✅ | A — forward-fix hors fenêtre | non | non | non |
| **Migration #6 (`…000205`)** | ⚠ | **B obligatoire** | données préservées (recopie), **structure non** | **oui** | **OUI — 1er geste irréversible** |
| Migrations #7 → #42 | ⚠ | B, ou A si le défaut est isolé | selon | probable | partiellement |
| **Migration #43 (`…000255`)** | ❌ | **B** | oui, depuis T-30 | **oui** | **OUI — point de non-retour ACL** |
| Migrations #44 → #53 | ❌ | B | oui | oui | oui |
| Promotion Git (T+30) | ✅ | `git reset --hard` sur le SHA précédent + redéploiement | non | non | non |
| Déploiement Vercel | ✅ | rollback de déploiement Vercel | non | non | non |
| Pose des variables | ✅ | restaurer les valeurs précédentes | non | non | non |
| **Activation du second admin (P5)** | ⚠ | désactivation par un admin `total` en AAL2 | non | non | non |

## Procédure B — restauration

1. **C** prononce le rollback, à voix haute, horodaté.
2. Maintenance **ON** immédiatement.
3. Restauration : snapshot managé B1 si disponible (le plus rapide), **sinon** dump B2.
4. Vérifier le ledger restauré : **210**, dernière version `…000231`.
5. Vérifier les 4 sentinelles : **absentes** (état pré-cutover).
6. Restaurer le Storage (B3) **après** la DB, **jamais avant**.
7. Rétablir l'applicatif : `release/commercialisation-v1` sur le SHA pré-cutover, redéploiement.
8. Sessions : les sessions AAL2 ouvertes pendant la fenêtre deviennent incohérentes → invalidation
   des sessions actives.
9. Maintenance **OFF**, puis smokes G1, G2, G3.
10. Post-mortem écrit **avant** toute nouvelle tentative de fenêtre.

## Critères de rollback immédiat, sans délibération

- La migration échoue et l'état de la base ne peut pas être caractérisé avec certitude.
- Le ledger post-migration ≠ **263**.
- G1 (login GP) échoue.
- Perte d'accès admin plateforme, sans second admin activé.
- Fuite de données inter-entreprises constatée (isolation multi-tenant rompue).
- Un événement Stripe `livemode=true` est **accepté** au lieu d'être rejeté.

---

# Interdictions permanentes pendant la fenêtre

- Aucun `--linked` sans avoir revérifié `supabase/.temp/project-ref` juste avant.
- Aucune édition de migration, aucun correctif SQL manuel improvisé.
- Aucun `force-push`, aucun merge commit sur `release/commercialisation-v1`.
- Aucun déploiement depuis `main`, `feat/*` ou `integration/*`.
- Aucune clé `sk_live_`, aucun produit, prix ou webhook Stripe Live.
- Aucune modification DNS.
- Aucun secret affiché, copié dans un ticket, un log ou un manifeste.
- Aucun `insert` direct dans `plateforme_admins`, aucun contournement d'AAL2.
- Aucun `DELETE FROM auth.mfa_factors` comme procédure normale.
- Aucune impression de document cutover depuis une branche autre que
  `docs/gp-cutover-documentation-closure-v1` (ou ce lot).
