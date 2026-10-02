V9_BASE_SHA=6392131aa02cecc9991358915963068de8292d24
HARDENING_SHA=877a4b9f284150e5d4f06fd68250f3ea19ff62a1
V9_1_SHA=voir §9 (commit de tête de `integration/elsatia-canonical-train-v9.1`, qui ajoute ce rapport)
MIGRATION_COUNT=391
SERVICE_RPC_EXPECTED=11
SERVICE_RPC_PRESENT=9
SEC6_STATUS=DECISION_REQUIRED_SEC6

# ELSATIA — CANONICAL TRAIN V9.1 — convergence après POST-V9 HARDENING

| | |
|---|---|
| Base | V9 finale `6392131a` (389 migrations, `…1113`), **non modifiée** (`integration/elsatia-canonical-train-v9-final` intacte) |
| Apport | hardening qualifié `877a4b9f` (`ELSATIA_POST_V9_HARDENING_V1.md`) |
| Candidat | `integration/elsatia-canonical-train-v9.1` (création ; aucune branche existante réécrite) |
| Ajouts propres à V9.1 | ce rapport ; `src/lib/post-v9-flux-service.postgrest.test.ts` (flux de service réels contre PostgREST, ignoré sans pile locale) |
| SQL | **aucune** migration nouvelle par rapport au hardening |
| Interdits respectés | aucun déploiement, aucune Preview, aucune Production, aucun Stripe (Test ou Live), aucun merge `main`, aucun secret réel |

## 1. Phase 1 — inventaire exact des RPC `*_service`

Source du chiffre 11 : `docs/qualification/ELSATIA_V9_COMMERCIALIZATION_GATE_V2.md` §C (branche
`claude/youthful-cori-j4y3ci`), « inventaire refait sur V9 389 » : 30 noms `*_service` appelés par `.rpc('…')`
dans `src/`, `apps/*/src`, `packages/`, confrontés à `pg_proc` → 19 présents, **11 absents** (blocker B01).

Inventaire refait ici, indépendamment : extraction de tous les appels `.rpc("…_service")` (y compris
multi-lignes) → **30 noms** ; confrontation au catalogue de deux bases **reconstruites de zéro** :
`v91_v9_fresh` (worktree vierge `6392131a`, 389/389) et `v91_hard_fresh` (`877a4b9f`, 391/391).
Absents sur V9 389 : **11** (les mêmes que le gate). Absents sur le candidat 391 : **2**. Les 19 autres sont
présents sur les deux.

| # | Fonction | Signature | Caller(s) applicatif(s) | V9 389 | 391 | Migration | Grants (391) | service_role seul | Flux |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `compter_comptes_application_service` | `(p_entreprise_id uuid) → integer` | `src/lib/stripe-abonnement.ts:866` (`reconcilierAbonnementStripe`, appelé aussi par le webhook `checkout.session.completed`) | non | **oui** | `20261002001301` | EXECUTE : service_role ; aucun pour PUBLIC, anon, authenticated | **oui** | décompte Stripe des comptes facturables |
| 2 | `relances_auto_parametres_service` | `() → setof parametres_relances` | `src/lib/relances-config.ts:51` | non | **oui** | `…1301` | idem | **oui** | cron des relances automatiques |
| 3 | `relances_auto_candidats_service` | `(uuid, text, integer) → table(id uuid)` | `src/lib/relances-moteur.ts:124` | non | **oui** | `…1301` | idem | **oui** | idem |
| 4 | `relance_document_service` | `(uuid, text, uuid) → jsonb` | `src/lib/relances-moteur.ts:114` | non | **oui** | `…1301` | idem | **oui** | idem (éligibilité, client courant, historique) |
| 5 | `relance_nouveau_lien_partage_service` | `(uuid, text, uuid, text, timestamptz) → void` | `src/lib/documents-partage.ts:32` | non | **oui** | `…1301` | idem | **oui** | lien de partage des relances automatiques |
| 6 | `push_notifications_en_attente_service` | `(timestamptz, integer) → table(id uuid)` | `src/app/api/cron/notifications-push/route.ts:20` | non | **oui** | `…1301` | idem | **oui** | cron push de secours |
| 7 | `push_preparer_notification_service` | `(uuid) → jsonb` | `src/lib/push.ts:63` | non | **oui** | `…1301` | idem | **oui** | envoi push (webhook + cron) |
| 8 | `push_marquer_notification_envoyee_service` | `(uuid) → void` | `src/lib/push.ts:86` | non | **oui** | `…1301` | idem | **oui** | envoi push |
| 9 | `push_supprimer_abonnement_service` | `(uuid, uuid) → void` | `src/lib/push.ts:81` | non | **oui** | `…1301` | idem | **oui** | nettoyage des abonnements morts |
| 10 | `paie_import_preparer_bulletin_service` | `(uuid, text, date) → table(employe_id uuid, version integer)` (proposée) | `src/app/api/paie/import/route.ts:37` | non | **non** | aucune (§7 de `service-role-flux-acl-v1.sql.proposed`, **volontairement non portée**) | — | — | import paie expert-comptable |
| 11 | `paie_import_enregistrer_bulletin_service` | `(uuid, uuid, date, integer, numeric, date, text, bigint, text, text, text) → uuid` (proposée) | `src/app/api/paie/import/route.ts:51` | non | **non** | idem | — | — | idem |

Les 9 fonctions présentes sont toutes SECURITY DEFINER, `search_path=public, pg_temp`, propriétaire `postgres`,
EXECUTE réservé à `service_role` (vérifié par `has_function_privilege` et `aclexplode` : ni PUBLIC, ni anon, ni
authenticated). Une seule surcharge par nom.

**Pourquoi 9 et 11.** Le gate compte toutes les RPC appelées et absentes (11). Le hardening a porté les 9 qui ne
dépendent d'aucune décision et a **délibérément exclu** les 2 `paie_import_*` : les porter rendrait de nouveau
fonctionnel l'import de paie protégé par un **secret global unique** qui choisit le tenant dans le corps de la
requête (SEC-6). Le rapport hardening le dit (§2.2, migration `…1301` l. 19-22, test pgTAP
« SEC-6 : import paie non réouvert »). Aucune autre fonction n'est manquante.

**Verdict intermédiaire : `SERVICE_RPC_INVENTORY_RECONCILED`** — 11 attendues = 9 présentes + 2 absentes par
décision de sécurité tracée ; aucune absence inexpliquée ; aucune migration supplémentaire requise.

## 2. Phase 2 — SEC-6

| Élément | État constaté |
|---|---|
| Contrat actuel | `POST /api/paie/import` : `Authorization: Bearer <PAYROLL_IMPORT_SECRET>` (≥ 32 caractères, comparaison `timingSafeEqual`), formulaire multipart (`entreprise_reference`, `employe_reference`, `periode`, montant, PDF ≤ 20 Mo, en-tête `%PDF-`). Le tenant est **choisi par le corps** (`entreprises.reference_interne`) |
| Ancien secret global | toujours le seul mécanisme (`src/app/api/paie/import/route.ts:5-12`) ; déclaré au manifeste (`PAYROLL_IMPORT_SECRET`, secret, facultatif) ; absent → 401 |
| Modèle par entreprise prévu | **aucun** : ni table, ni colonne, ni fonction SQL, ni code, ni migration proposée, dans aucune des branches du dépôt (recherche `supabase/migrations/` et `src/` sur toutes les branches d'origin : seuls `route.ts` et ses tests) |
| Fonctions SQL disponibles | aucune pour l'import (`paie_import_*` non portées) ; la route répond 503 après résolution de l'entreprise |
| Anti-rejeu | **aucun** (ni horodatage, ni nonce, ni HMAC du corps) ; seul un plafond IP `api:payroll-import` 30/5 min |
| Gestion des clés | variable d'environnement unique, rotation manuelle, aucune ligne d'audit |
| UI de gestion | **aucune** |
| Documentation | recommandation de la red team V2 §7 (« credential par tenant/HMAC couvrant corps + horodatage + ligne d'audit ») ; gate commercial V2 §D (P1 ou NOT_IN_SCOPE selon D13) ; rapport hardening §3.3 |

Le 503 n'est **pas** compté comme une correction : c'est l'effet de l'absence des RPC. Aucun modèle qualifié
n'existe à porter ; concevoir l'identifiant par entreprise (format, remise au cabinet comptable, rotation,
révocation, UI) relève d'arbitrages produit et opérationnels. **`DECISION_REQUIRED_SEC6`**. L'import n'est pas
rouvert : les deux RPC restent absentes, et le test pgTAP `post_v9_service_role_fonctions_v1` échoue si l'une
d'elles apparaît.

## 3. Phase 3 — migrations

| Contrôle | Résultat |
|---|---|
| V9 | 389 fichiers à `6392131a` |
| Candidat | 391 |
| Différence | `git diff --name-status 6392131a HEAD -- supabase/migrations` : **A** `…1301`, **A** `…1302` ; 0 M, 0 D |
| Intégrité octet pour octet | blob git de chacun des 389 fichiers V9 = `git hash-object` du fichier du candidat : **389/389 identiques** |
| Numérotation | `…1301`, `…1302` > `…1203` > `…1116` > `…1113` : aucune collision avec les lots réservés Relevé `…1114-1116` et RGPD `…1201-1203` |
| Compatibilité d'ordre | il n'existe aucun horodatage libre entre `…1113` et `…1114` (secondes consécutives) ; les lots réservés, s'ils sont intégrés **après** un déploiement de V9.1, seront antérieurs à `…1302` : `supabase db push --include-all` (ou renumérotation) sera requis. Ils sont indépendants de `…1301`/`…1302` (aucune table créée ni modifiée par ces deux migrations) |
| Migration supplémentaire | **aucune** (inventaire réconcilié) |

## 4. Phase 4 — non-régression

Toutes les mesures ci-dessous ont été refaites pour V9.1 sur des bases **reconstruites de zéro** dans cette mission.

| Contrôle | V9 389 (`v91_v9_fresh`) | Candidat 391 (`v91_hard_fresh`) | Verdict |
|---|---|---|---|
| `verify:migrations` / `test:migration-targets` | — | 391 valides / 7 tests verts | ✅ |
| `verify:train-expectations` | — | 391, dernière `…1302`, DB verify 39 contrôles : attendus à jour | ✅ |
| `verify:secrets` | — | 3 641 fichiers, aucun secret | ✅ |
| `verify:env-manifest` / `test:env-manifest` | — | OK / 67/67 | ✅ |
| DB verify (39 contrôles) | 36 ok ; KO : `url_preview`, propriétaire plateforme (données hébergées), **contrôle 39** | **37 ok** ; KO : `url_preview`, propriétaire plateforme (identiques à V9) | ✅ |
| pgTAP ciblé (`post_v9_*`, 75) | 10 not ok + 59 erreurs (**ROUGE**) | **75/75** | ✅ |
| pgTAP complet (176 suites) | 165 propres, 8 934 ok | **167 propres, 8 992 ok** ; seules différences : les 2 suites post-V9 ; 9 suites non propres identiques (pgsodium réel, Studio dans le projet partagé, Tools cloud sync) | ✅ |
| Vitest GP complet | (V9 : 2 845) | **2 897 ✓**, 1 échec attendu (témoin SEC-6), 193 ignorés (dont la nouvelle suite PostgREST sans pile) | ✅ |
| Typecheck GP | — | 0 erreur | ✅ |
| Lint GP | 0 erreur, 15 avertissements | 0 erreur, 15 avertissements identiques | ✅ |
| Build GP (`next build`) | — | exit 0 | ✅ |
| PostgREST réel, clés service / anon | `PGRST202` (fonctions absentes) | service 200 ; anon **42501** | ✅ |
| Flux comptage Stripe (RPC du code, PostgREST réel) | **ROUGE** (PGRST202) | 3 = vérité PostgreSQL (2 actifs + 1 pause, « fermé » exclu) | ✅ |
| Flux relances (moteur `traiterRelancesAutomatiques` complet, service_role) | **ROUGE** (« Chargement des paramètres de relances impossible ») | devis relancé `envoyee`, e-mail avec lien `/document/…`, un seul lien actif, `cree_par` NULL | ✅ |
| Flux push (`traiterNotificationPush`, web-push simulé 410) | **ROUGE** (rien d'envoyé) | abonnement mort supprimé, notification marquée ; route réelle `GET /api/cron/notifications-push` : **200 `{"traitees":1}`** | ✅ |
| Flux import paie | — | **non qualifiable** : SEC-6 (`DECISION_REQUIRED_SEC6`), RPC volontairement absentes | n/a |
| SEC-5 HTTP réel (GP compilé) | — | 20 × 404 sans rendu puis 429 | ✅ |
| Upgrade V9 → candidat, base **historisée** (V3 → V9, 52 utilisateurs) | — | 0 écart (284 tables, checksums 117/117, policies 658, droits 0, EXECUTE 0) ; **sonde RLS 51 × 2 499 cellules : 0 écart** ; 11 fonctions nouvelles dont 1 exécutable par l'API (`entreprise_active_autorisee`) ; schéma + ACL = fresh (36 416 lignes, 2 333 ACL) ; contrôles V9 **47/47** ; pgTAP post-V9 75/75 | ✅ |
| Upgrade V9 → candidat, base **volumétrique** (76 utilisateurs, jeux 500 → 20 000 lignes) | harnais V9 rejoué : 33/33, schéma = fresh V9 | 0 écart (284 tables, checksums 117/117, policies 658, droits 0, EXECUTE 0) ; 11 fonctions nouvelles dont 1 exécutable par l'API ; schéma + ACL = fresh ; contrôles V9 **33/33** ; pgTAP post-V9 75/75 | ✅ |
| Fresh install | 389/389 | **391/391** | ✅ |
| Playwright (onboarding, fuseaux, fin d'habilitation) | — | code UI identique au hardening : 13/13 (`ELSATIA_POST_V9_HARDENING_V1.md` §9) ; non rejoué | ✅ (repris) |

Corrections d'outillage faites pendant cette mission :
- `scripts/qualification/upgrade-v9-post-v9-hardening.sh` résout désormais `gotrue.sql` et le fichier de contrôles
  en chemin absolu (un chemin relatif était lu après `cd supabase/tests` : contrôles « 0/? »).
- Contrôle métier V9 **L01** (compteur de rate limit historique, fenêtre 3 600 s) : dépendant de l'heure du seed.
  Sur une base volumétrique vieille de plusieurs heures, il échoue **à l'identique sur la base V9 non upgradée**
  (`have (t,10) want (t,3)`) : ce n'est pas une régression. La passe volumétrique a donc été rejouée en
  enchaînant seed V9 et upgrade sans délai.


## 5. Phase 5 — classification des restes

| Reste | Classe | Justification |
|---|---|---|
| SEC-6 — import paie à secret global | **DECISION_REQUIRED** (P1 si l'import paie est promis au lancement ; NOT_IN_SCOPE sinon, décision D13 du gate) | aucun modèle par entreprise dans le dépôt ; route non fonctionnelle et non rouverte ; exploitation exige le secret (non P0 faute de chemin d'écriture prouvé) |
| Pied de facture Stripe des clients existants | **DECISION_REQUIRED** (P2 aujourd'hui ; P1 avant ouverture Live si l'identité prouvée évolue) | Live fermé, factures Live brouillon suspendues ; le correctif qualifié modifierait des objets Live à l'exécution ; runbook `ELSATIA_STRIPE_FOOTER_EXISTING_CUSTOMERS_V1.md` |
| Safari / WebKit réel | **P2** | trou de preuve, pas défaut constaté : le correctif (case + serveur) ne dépend d'aucun comportement WebKit ; Chromium 13/13 ; WebKit absent de l'environnement |
| Cron push : plafond 200, sans `ORDER BY` | **P2** | chemin de secours (le webhook temps réel est le chemin normal) ; 300 notifications en attente mesurées sur la base historisée ; aucune perte de donnée, seulement des notifications non poussées |
| Horodatages rendus en UTC serveur | **P2** | affichage seulement (les saisies sont corrigées par V9-01) ; 111 appels `toLocale*("fr-FR")` sans `timeZone` dans 50 fichiers rendus côté serveur ; aucune donnée stockée fausse |

Aucun P0 ouvert. Aucun P1 promu en P0.

## 6. Défauts structurels

| Défaut structurel | État |
|---|---|
| RPC appelées par le code et absentes du train | **fermé** pour les 9 flux livrables ; les 2 restantes sont bloquées par une décision de sécurité documentée et testée |
| SEC-4 (fuite d'organisation par `entreprise_active_id`) | **fermé** (`…1302`) |
| SEC-5 (PDF public : rendu avant contrôle, SSRF, plafond) | **fermé** |
| Onboarding sans sortie, V9-01, V9-02 | **fermés** |
| SEC-6 | **décision** (pas un défaut de convergence : aucun modèle à porter) |

## 7. Reproduire

```bash
git fetch origin integration/elsatia-canonical-train-v9.1 && git checkout integration/elsatia-canonical-train-v9.1
npm ci && (cd tests/e2e/colors-pile-locale && npm ci)
git worktree add --detach /var/tmp/v9wt 6392131aa02cecc9991358915963068de8292d24
/var/tmp/v9wt/scripts/local-postgres-bootstrap/rebuild_db.sh v91_v9_fresh                 # 389/389
scripts/local-postgres-bootstrap/rebuild_db.sh v91_hard_fresh                             # 391/391
scripts/qualification/pgtap-run-v3.sh v91_v9_fresh ; scripts/qualification/pgtap-run-v3.sh v91_hard_fresh
# Flux de service réels : pile locale (variables : voir ELSATIA_POST_V9_HARDENING_V1.md §9.2)
tests/e2e/post-v9-pile-locale/preparer-base.sh pv91_e2e v91_hard_fresh
tests/e2e/finance-pile-locale/demarrer-pile.sh pv91_e2e /tmp/pv91-logs
PV9_FLUX_URL=http://127.0.0.1:54321 PV9_FLUX_DB=pv91_e2e PV9_FLUX_SERVICE_KEY=… PV9_FLUX_ANON_KEY=… \
  npx vitest run src/lib/post-v9-flux-service.postgrest.test.ts                          # 4/4 (V9 : 4 ROUGES)
# Upgrades avec données : harnais V9 depuis le worktree vierge, puis
scripts/qualification/upgrade-v9-post-v9-hardening.sh upg_v9_hist v91_hard_fresh <gotrue.sql> scripts/local-postgres-bootstrap/upgrade_v7_v8_business_checks.sql
UPGRADE_SNAPSHOT_SANS_SONDE=1 scripts/qualification/upgrade-v9-post-v9-hardening.sh upg_v9_vol v91_hard_fresh <gotrue.sql> scripts/local-postgres-bootstrap/upgrade_v8_v9_business_checks.sql
```

## 8. Verdict

**ELSATIA_CANONICAL_TRAIN_V9_1_LOCALLY_QUALIFIED**

- Inventaire : `SERVICE_RPC_INVENTORY_RECONCILED` (11 = 9 portées + 2 exclues par décision de sécurité tracée).
- Défauts structurels de convergence fermés ; aucun P0 ouvert.
- Restes : SEC-6 et pied de facture Stripe en `DECISION_REQUIRED` ; WebKit réel, cron push (200, sans tri) et
  horodatages affichés en UTC serveur en P2.
- La qualification est **locale** : la preuve hébergée (Preview, Stripe Test réel, Storage/GoTrue hébergés) reste à
  faire, hors périmètre de cette mission.

## 9. Publication

- `integration/elsatia-canonical-train-v9.1` : **créée** à partir du hardening `877a4b9f` + le commit de ce
  rapport (fast-forward, aucune réécriture). Le SHA exact est celui de la tête de cette branche, communiqué
  avec la remise (un commit ne peut pas contenir son propre SHA).
- `integration/elsatia-canonical-train-v9-final` (`6392131a`) : **non modifiée**, référence historique.
- `integration/elsatia-post-v9-hardening-v1` (`877a4b9f`) : non modifiée.
