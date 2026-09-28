# ELSATIA — Production Incident Response & Safe Mode (V1)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v6` @ `9102ec80` (verdict `CANONICAL TRAIN V6 LOCALLY QUALIFIED`, 358 migrations) — **non modifiée** |
| Branche | `claude/serene-franklin-rgu054` |
| Migrations | **360** (+2 : `20260928000701_incident_safe_mode_v1`, `20260928000702_stripe_webhook_reservations_orphelines_v1`) · projet Studio dédié **15** (+1 : `20260928130000_studio_incident_control`) — toutes additives |
| Moteur | PostgreSQL 16.13 + pgTAP (apt), amorce `scripts/local-postgres-bootstrap` ; **GoTrue v2.192.0** et **PostgREST v12.2.3** réels (releases GitHub) ; Redis 7 local ; Node 22.22 ; Gestion Pro en `next dev` |
| Actions distantes | **Aucune.** Aucun déploiement, aucune Preview, aucune Production, aucun appel à un service tiers réel (Stripe/Brevo simulés sur 127.0.0.1). |

## 0. Verdict

**`ELSATIA INCIDENT RESPONSE LOCALLY QUALIFIED`**

⟨VERDICT⟩

---

## 1. Types d'incident — runbooks

`docs/runbooks/incident/` : index + mode sûr en une page (`README.md`), un runbook court par
incident au plan **Détection → Confinement → Diagnostic → Restauration → Validation →
Réouverture** (exigence 15), plus deux procédures transverses.

| Incident | Runbook | Preuve locale |
|---|---|---|
| DB indisponible | `DB_INDISPONIBLE.md` | drill S6 |
| Storage indisponible | `STORAGE_INDISPONIBLE.md` | drill S9, S4 |
| Stripe indisponible | `STRIPE_INDISPONIBLE.md` | drill S11, S2, S7 |
| E-mail indisponible | `EMAIL_INDISPONIBLE.md` | drill S10 |
| Redis indisponible | `REDIS_INDISPONIBLE.md` | drill S12 |
| Auth indisponible | `AUTH_INDISPONIBLE.md` | drill S8 |
| Fuite de secret | `FUITE_SECRET.md` + `SECURITE_INCIDENT.md` | pgTAP (lecture seule bloque service_role), drill S2 |
| Cross-tenant suspecté | `CROSS_TENANT.md` | drill S3 (coupure d'app), pgTAP isolation (inchangés) |
| Migration cassée | `MIGRATION_CASSEE.md` | pgTAP couverture des gardes |
| Corruption de données | `CORRUPTION_DONNEES.md` | drill S2 (gel sans perte) |
| Worker Studio bloqué | `WORKER_STUDIO_BLOQUE.md` | drill S13 |
| Attaque abusive | `ATTAQUE_ABUSIVE.md` | drill S4 (contrôles ciblés) |
| Procédure sécurité (§5) | `SECURITE_INCIDENT.md` | — |
| Ordre post-restauration (§7) | `POST_RESTAURATION.md` | drill S5, S6, S7 |

Le runbook DR V2 renvoie désormais au mode sûr (gel) et à l'ordre post-restauration.

## 2. Safe mode

Table `public.incident_controles` (portée × contrôle), lue par `incident_etat_public()`.
**Aucune donnée n'est supprimée ni modifiée** par un contrôle ; tout est réversible (vérifié :
comptages identiques avant/après chaque gel, pgTAP et drill S2/S6).

| Exigence | Contrôle | Où c'est appliqué |
|---|---|---|
| Lecture seule globale | `lecture_seule` / `global` | **base** : trigger d'instruction `incident_garde_ecriture` sur **les 248 tables** du schéma `public` (13 tables d'infrastructure exemptées : pilotage, limitation anti-abus, révocation de session, journaux de support/plateforme, pont d'identité) — refus **503** (`SQLSTATE PT503`, indice `SAFE_MODE_READ_ONLY`), **service_role et crons compris** ; proxy : mutations d'API 503, webhooks 503 (rejoués par Stripe) |
| Lecture seule par application | `lecture_seule` / `gestion_pro` · `reserves` · `tools` · `colors` · `studio` | idem, limité aux tables de l'application (préfixe) ; les tables **socle** partagées (entreprises, entitlements, abonnements, plateforme, communications) ne sont gelées que par la portée globale — une app en lecture seule ne casse pas les autres |
| Désactivation uploads | `uploads` | **base** : politique **RESTRICTIVE** `storage.objects` (insert/update, `authenticated`), par bucket → application ; proxy : routes de dépôt |
| Désactivation exports | `exports` | proxy (exports comptables, notes de frais, paie, RGPD, PDF, impressions, annuaire plateforme ; Réserves, Colors, Studio) |
| Désactivation paiements | `paiements` | proxy (checkout, liens de paiement, portail, Stripe Connect OAuth, checkout Tools) ; **webhooks toujours reçus** |
| Désactivation invitations | `invitations` | **base** (création `reserves_invitations`, consultation/acceptation par jeton) + proxy (GP accès, Réserves, Colors, Studio) |
| Désactivation liens publics | `liens_publics` | **base** : les 3 fonctions de résolution de jeton sont enveloppées (`…__brut` retirées de tout rôle) + proxy |

Expiration automatique optionnelle (1 min à 7 j). Propagation mesurée : ⟨PROPAGATION⟩.

## 3. Kill-switch — audit de l'existant

| Kill-switch existant | Type | Limite constatée | Suite donnée |
|---|---|---|---|
| `FEATURE_BOUTIQUE_ENABLED`, `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED` | env Vercel, fail-closed | changement = redéploiement ; portée fonctionnelle, pas incident | conservés (feature flags produit) |
| `FEATURE_CRONS_ENABLED` | env, **fail-open** | redéploiement ; tout sauf `false` = actif | conservé ; le mode sûr bloque désormais les crons en lecture seule et pendant la réconciliation, sans redéploiement |
| `STUDIO_ENABLED` | env, fail-open | redéploiement | conservé comme **dernier recours** (base Studio injoignable) ; la coupure normale passe par `studio_guard.control.mode = 'off'` |
| `studio_guard.control.mode` (Studio dédié) | base, `read_write`/`read_only` | aucune trace des bascules, pas de coupure complète | **+ `off`**, journal append-only par trigger (même en SQL direct), motif obligatoire, `studio_guard.set_mode` |
| `entreprise_feature_flags`, `applications_elsatia.actif`, `acces_applications_entreprises` | base, par tenant / catalogue | modifient des **droits commerciaux** : impropres à un confinement réversible | non utilisés comme kill-switch |
| Suspension d'abonnement, hôte Réserves suspendu | base, par tenant | portée tenant | inchangés ; même motif technique (garde en base) repris à l'échelle plateforme |
| `DISABLE_EMAIL_LOGIN` | env, démo locale seulement | — | hors sujet |
| `RGPD_PURGE_PLANIFICATEUR_MODE` | env, off par défaut | redéploiement | conservé ; le cron qui le porte est bloqué par le verrou de réconciliation |
| Limitation anti-abus | base (`rate_limits_applicatifs`), fail-closed | — | **exemptée du gel** : reste active en lecture seule |

Conclusion : l'architecture permettait mieux qu'un flag d'environnement (état en base déjà lu par
chaque requête) → **mode sûr en base, sans redéploiement, propagé en ≤ 10 s**.

## 4. Isolation par application

Portées `gestion_pro`, `reserves`, `tools`, `colors`, `studio` (+ `global`). `app_coupee` d'une
application : 503 sur ses pages et API (proxy), écritures refusées **en base** aux sessions
utilisateur (y compris PostgREST direct), chemins serveur autorisés. Prouvé en S3 : Réserves
coupée → écriture Réserves 503 en direct, GP écrit et reste `OPERATIONAL`, décision proxy Réserves
503 / GP continue. Studio (projet dédié) : `studio_guard.set_mode('off')` → proxy Studio 503 (S13).
Tools (application cliente, sans proxy) : garde en base uniquement (tables `tools_*`, bucket
`tools-releves`) ; ses routes de facturation vivent dans GP.

## 5. Incident de sécurité

`SECURITE_INCIDENT.md` : confinement ≤ 5 min ; révocation de sessions (un compte, tous, Studio) ;
rotation des secrets (tableau par secret : où, ordre, effet de bord, cas `BANK_DATA_ENCRYPTION_KEY`
**à ne pas tourner naïvement**) ; désactivation des jetons applicatifs (`cles_api`, liens de
partage, invitations — SQL vérifié contre le schéma) ; blocage des liens publics ; **suspension des
chemins service_role** : écritures par `lecture_seule` global (la garde en base refuse service_role,
prouvé pgTAP + drill S2), lectures par rotation de la clé secrète.

## 6. Stripe — pas de droit rouvert avant réconciliation

Conclusions DR V2 §12 reprises : Stripe est la source de vérité ; la base restaurée ne connaît
pas les événements postérieurs au point de restauration. Mise en œuvre :
- verrou **`reconciliation_stripe_requise`** (global) : la base **refuse** de lever
  `lecture_seule`/`app_coupee` globaux tant qu'il est posé (indice `RECONCILIATION_STRIPE_REQUISE`) ;
- pendant le verrou : utilisateurs dehors (503, écritures de session refusées en base), **webhooks
  acceptés** (rejeu), **crons refusés** (le cron d'abonnements suspend, convertit des essais IA et
  planifie les purges RGPD : il agirait sur un état commercial périmé) ;
- contrôle `incident_webhooks_stripe_orphelins()` avant attestation.
Prouvé en S5 (réouverture prématurée refusée en HTTP par la base, rejeu accepté et finalisé, cron 503).

**Défaut trouvé et corrigé** (migration `…702`) : les journaux de webhook (`abonnement_evenements`
SaaS, `stripe_webhook_events` Connect/boutique) réservaient l'événement puis le supprimaient en
cas d'échec. Si la base tombe **entre** les deux, la suppression échoue aussi : la réservation
reste et chaque re-livraison Stripe était avalée comme doublon — **événement perdu en silence**,
droit commercial incohérent après l'incident. Correction, sur le modèle déjà en place pour Tools
(reprise d'une ligne `processing` de plus de 5 min) : `finalise_at` posé en fin de traitement ;
une réservation non finalisée depuis plus de 5 min est **reprise** par la livraison suivante
(`reprises_orphelines` compté) ; historique rétro-rempli (aucun rejeu rétroactif). Traitements
métier idempotents (ordre Stripe arbitré en base, encaissement par checkout, finalisation boutique).
pgTAP 30/30 ; drill S7 (orpheline reprise en HTTP réel, livraison concurrente < 5 min = doublon).

## 7. Restauration — ordre documenté

`POST_RESTAURATION.md` : **0. verrouiller avant tout trafic** (le mode sûr est dans la base
restaurée, avec l'état du point de restauration) → **1. DB** (manifeste, `07_verify`, RLS
fonctionnelle) → **2. Storage** (références mortes / orphelins) → **3. Auth** (sessions et comptes
revenus au point de restauration) → **4. Stripe replay** (resend par endpoint depuis `T0`, contrôles,
attestation chiffrée) → **5. jobs RGPD** (preuves hors base, `restaurer-echeance`) → **6. health
checks** → **7. réouverture du trafic** (refusée par la base tant que l'étape 4 n'est pas attestée).

## 8. Health checks

| Sonde | Contrôles | Secret dans la réponse |
|---|---|---|
| GP `GET /api/health` | db (RPC publique via PostgREST), auth (`/auth/v1/health`), storage (`/storage/v1/status`), email et Stripe (**cohérence de configuration** : présence, préfixes, clé `live` interdite hors Production et inversement) ; profonde (`Bearer CRON_SECRET`) : appel Brevo et Stripe en lecture | **aucun** : noms de contrôles + `ok`/`ko`/`non_configure`, jamais de message d'erreur, d'URL ni de valeur (tests unitaires + drill : 0 fuite sur 9 secrets, pendant les pannes aussi) |
| Réserves `GET /api/health` | db, auth, storage | aucun |
| Studio `GET /api/health` | db, auth, storage (projet dédié) ; profonde (`Bearer STUDIO_CRON_SECRET`) : **worker** (rendus sans battement > 60 s, file > 10 min) via `incident_worker_sante()` (service_role, compteurs seulement) | aucun |
| Worker `healthcheck.ts` | Redis PING | journal JSON borné (corrigé : ioredis n'écrit plus hôte/port) |

Statut : `OPERATIONAL` 200, `DEGRADED` 200 (dépendance non critique), `READ_ONLY` 200, `OUTAGE`
503 (base/Auth KO ou application coupée). Cache public 5 s (pas d'amplification de charge).
Colors partage le projet Supabase de GP : pas de route santé propre (le test de sécurité Colors
exige que toute route API exige le contexte ; il n'a pas été affaibli).

## 9. Status

`public.incident_statuts_services` : 12 services (`gestion_pro`, `reserves`, `tools`, `colors`,
`studio`, `db`, `auth`, `storage`, `email`, `stripe`, `redis`, `worker_studio`) ×
`OPERATIONAL`/`DEGRADED`/`READ_ONLY`/`OUTAGE` + message public (≤ 280). Exposé par
`incident_etat_public()` (anon, **SECURITY INVOKER**, droits colonne par colonne : motif, référence
et auteur inaccessibles même en lecture directe). Écriture : console (rôles `total`/`support`, AAL2)
ou `incident_statut_operateur` (SQL). Pas de site Status public construit (hors périmètre).

## 10. Audit trail

`public.incident_journal` **append-only** (UPDATE/DELETE/TRUNCATE refusés par trigger, même au
superutilisateur ; aucun droit d'écriture pour aucun rôle d'API) : acteur (id, libellé, rôle), action,
portée/contrôle ou service, ancien/nouveau, **motif obligatoire (≥ 10)**, référence d'incident.
Continuité avec `plateforme_journal_actions`. Chemin opérateur SQL tracé `operateur_sql:<nom>`.
Studio dédié : `studio_guard.control_journal` alimenté par **trigger** (aucune bascule n'échappe,
même en SQL direct). Console : 50 dernières entrées. Drill S14 : 18/18 bascules tracées, effacement refusé.

## 11. RBAC

- Bascule : rôle plateforme **`total`** + session **AAL2** (`plateforme_exiger_role`,
  `plateforme_exiger_session_aal2`), motif obligatoire. Statut public : `total` ou `support`, AAL2.
- **Un administrateur client ne peut jamais basculer** : il n'a aucune ligne `plateforme_admins`
  → refus 42501 en base (pgTAP ; drill S1 en HTTP réel : 403).
- Refusés, prouvés : admin client AAL2, `support`, `lecture`, `facturation`, `total` sans AAL2,
  `anon`, `service_role` ; aucune tentative refusée ne laisse de trace d'état.
- Chemin de secours (Auth en panne) : `incident_basculer_operateur` exécutable **uniquement** par le
  propriétaire en console SQL (aucun rôle d'API — pgTAP) ; contournement de réparation
  `elsatia.incident_contournement` inopérant sous le rôle `authenticator` (API).

## 12. Simulation — pile locale

`npm run incident:drill` (`scripts/incident/drill.sh` + `scenarios.mjs`) : base jetable avec
**Auth réel (GoTrue)**, **PostgREST réel**, mock Storage à RLS réelle, proxy « Kong », **Redis**,
faux Stripe, faux Brevo, **Gestion Pro en `next dev`**, base Studio dédiée. Garde « local
uniquement » (`exigerCibleLocale`, testée). Résultat : ⟨DRILL⟩

| Scénario | Vérifié côté utilisateur / exploitation |
|---|---|
| S0 nominal | santé 200 `OPERATIONAL`, 0 fuite de secret |
| S1 RBAC | 5 refus (admin client, support, total AAL1, anon, service_role), total AAL2 autorisé, journalisé |
| S2 lecture seule globale | propagation mesurée, mutation 503 + `Retry-After`, **écriture PostgREST directe 503**, lecture 200, `/login` 200, santé `READ_ONLY`, webhook 503 sans réservation, 0 donnée modifiée ; levée → rejeu traité **une fois**, second rejeu = doublon |
| S3 Réserves coupée | isolation (voir §4) |
| S4 liens / invitations / uploads | jeton public 503 (base) + page 503 HTML ; invitation 503 ; upload Storage RLS réelle accepté → refusé → accepté |
| S5 post-restauration | 503 utilisateurs, santé `OUTAGE`, webhook accepté, cron 503, **réouverture prématurée refusée**, 0 orpheline, attestation puis réouverture |
| **S6 DB failure** | santé 503 `db: ko` sans détail d'erreur, `/login` répond, webhook 5xx ; redémarrage → santé 200, événement rejoué **une fois**, comptages identiques |
| S7 webhook interrompu | orpheline détectée puis **reprise** par la re-livraison |
| **S8 Auth failure** | santé 503 `auth: ko` ; sessions existantes utilisables ; pilotage SQL sans Auth |
| **S9 Storage failure** | santé 200 `DEGRADED` (`storage: ko`, db ok) ; retour `OPERATIONAL` |
| **S10 email failure** | sonde `DEGRADED` ; vrai `envoyerEmailBrevo` → erreur **explicite** ; retour → **1 seul** envoi |
| **S11 Stripe unavailable** | sonde `DEGRADED` ; webhooks toujours traités ; santé publique inchangée |
| **S12 Redis failure** | vrai `healthcheck.ts` : 0 → 1 → 0 ; vrai BullMQ : même `jobId` = 1 seul job |
| **S13 Studio worker failure** | job en file conservé ; worker bloqué détecté ; rendu → `failed/WORKER_LOST` + message ; worker arrêté détecté ; job en attente re-dispatché ; Studio `off` → 503 sans redéploiement |
| S14 audit | 18/18 bascules journalisées, effacement refusé, aucun contrôle resté actif |

## 13. Chaos borné

Uniquement local : arrêt/redémarrage du Postgres **local**, gel `SIGSTOP`/`SIGCONT` de GoTrue et du
mock Storage **locaux**, arrêt/redémarrage d'un Redis **local**, mocks Stripe/Brevo mis en panne.
Toutes les URL sont refusées si l'hôte n'est pas la boucle locale ; noms de base validés ; secrets
générés pour le drill. Aucun service tiers, aucune Preview, aucune Production.

## 14. Recovery

| Propriété | Preuve |
|---|---|
| **Pas de doublon** | webhook rejoué après gel/panne DB : 1 ligne, second rejeu = doublon (S2, S6) ; livraison concurrente d'un événement en cours = doublon (S7, pgTAP) ; e-mail : 1 envoi après retour (S10) ; BullMQ : 1 job par `jobId` (S12) |
| **Pas de job perdu silencieusement** | webhook refusé pendant la panne → 5xx → rejoué (S2, S6) ; **réservation orpheline reprise** (S7, défaut corrigé §6) ; rendu Studio interrompu → `failed/WORKER_LOST` visible (S13) ; rendus en file conservés en base pendant la panne Redis (S12–S13) ; e-mail en échec → erreur explicite (S10) |
| **Pas de droit commercial incohérent** | aucun droit modifié par un gel ; réouverture impossible avant réconciliation Stripe (S5) ; crons d'abonnements bloqués pendant la réconciliation (S5) ; événements anciens rejoués = « périmés » sans effet (ordre Stripe, suites pgTAP 137/137 inchangées) |

## 15. Runbooks opérateur

Voir §1 — 12 runbooks + 2 procédures, format commun, commandes SQL vérifiées contre le schéma.

## 16. Automation

`npm run incident:drill` (pile + 15 scénarios, rapport JSON, code de sortie) ;
`npm run test:incident-drill` (garde « local uniquement », JWT, signature Stripe, détection de fuite).

## 17. Tests

⟨TESTS⟩

## 18. Écarts, limites et décisions

⟨LIMITES⟩

## 19. Fichiers

⟨FICHIERS⟩
