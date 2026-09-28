# ELSATIA Studio — gardes d'écriture en base & fondation RGPD V1

Date : 2026-09-28 · Branche : `claude/ecstatic-hawking-2hz6n8` · Base : `claude/kind-mendel-wmcqt3`
@ `f762d61` (fondation Studio V3 qualifiée, `ELSATIA_STUDIO_V3_PORT_HOSTED_READINESS_V1.md`).

**Aucun déploiement.** Aucun Vercel, aucun projet Supabase distant créé, lié ou interrogé, aucune
clé réelle. Tout est prouvé localement :

- PostgreSQL 16 et pgTAP (compilé depuis les sources) ;
- GoTrue **v2.192.0** compilé depuis les sources, PostgREST **v12.2.3** ;
- application Studio réelle (`next build` + `next start`).

Tous les tests base portent sur la **chaîne Studio dédiée** (`apps/studio/supabase/migrations`),
sans aucune table GP.

## Verdict

```
STUDIO DB GUARDS LOCALLY QUALIFIED
```

- **Lecture seule imposée par la base, plus par l'application seule.** Une garde centrale unique
  (`studio_guard.assert_write`) est posée par trigger d'instruction sur **les 24 tables Studio**.
  Le contournement a été testé par appel RPC direct :
  - 22/22 RPC refusées en pgTAP ;
  - 12 appels refusés en HTTP 403 via le vrai PostgREST avec un vrai jeton GoTrue.
- **Storage lié à la base.** Aucun téléversement sans réservation vivante d'un auteur en accès
  complet. Aucune suppression d'objet encore référencé.
- **Chemins système explicitement bornés** : liste fermée de 7 chemins, chacun limité à ses
  tables. La clé service ne peut plus écrire une table directement.
  - **Défaut trouvé et corrigé** : `service_role` détenait encore INSERT/UPDATE/DELETE/TRUNCATE
    directs sur 4 tables.
- **Compte ELSATIA supprimé.** Studio bloque le login et invalide les sessions (déjà prouvé). Il
  **ouvre désormais la demande RGPD dans la même transaction**.
- **Effacement.** Il est idempotent, rejouable et audité (journal immuable). Il est **fermé par
  défaut** (`off`) et exige une décision écrite et un délai **décidé**. Aucune durée n'est inventée.
- **Aucune régression :**
  - identité 73/73 ×3 (69 + 4 nouveaux tests réels) ;
  - base dédiée 543/543 (409 + 63 + 71) ;
  - Studio Vitest 291/291 ;
  - GP Vitest 1898 réussis ;
  - typecheck, lint et builds OK.

---

## 1. Base

La branche de travail ne portait que des commits déjà contenus dans `claude/kind-mendel-wmcqt3`
(ancêtre strict). Elle a été recréée sur `f762d61`, sans perte. Point de départ rejoué à
l'identique : 11 migrations dédiées, 409/409 pgTAP.

## 2. Inventaire des écritures (catalogue réel, pas estimé)

Mesuré par requête sur `pg_proc` / `information_schema` de la base dédiée (§15).

| Catégorie | Avant ce lot | Détail |
|---|---|---|
| RPC **volatiles** exécutables par `authenticated` | **22** (chiffre confirmé) | `studio_create_workspace`, `studio_rename_workspace`, `studio_archive_workspace`, `studio_set_member`, `studio_create_project`, `studio_save_project`, `studio_project_lifecycle`, `studio_duplicate_project`, `studio_set_project_cover`, `studio_remove_project_media`, `studio_delete_media`, `studio_order_project_media`, `studio_reserve_media`, `studio_save_timeline`, `studio_activate_timeline`, `studio_delete_timeline`, `studio_save_editor`, `studio_request_render`, `studio_request_editor_render`, `studio_cancel_render`, `studio_request_analysis`, `studio_cancel_analysis` |
| RPC de lecture (`stable`) `authenticated` | 8 | `studio_dashboard_stats`, `studio_project_summaries`, `studio_list_project_media`, `studio_project_media_stats`, `studio_get_timeline`, `studio_list_analysis`, `studio_my_role`, `studio_identity_session_status` |
| RPC `service_role` seules | 21 (19 volatiles + 2 stables) | pont d'identité (11), worker de rendu (4), worker d'analyse (4), `studio_finish_media`, `studio_expire_media` |
| **Droits de table directs `service_role`** | **4 tables : INSERT, UPDATE, DELETE, TRUNCATE** | `studio_projects`, `studio_media_assets`, `studio_project_assets`, `studio_media_limits` (privilèges par défaut du schéma `public`, jamais retirés) — **défaut** |
| Mises à jour de statut directes (clé service) | 3 | `media-service.ts` (échec de validation), `storage-reconcile.mjs` (objet manquant, purge constatée) |
| Écritures Storage | 2 buckets, 5 sites | URL d'upload signée (originaux) ; upload du worker (rendus) ; `remove` : réconciliation des originaux, rendu non publié (worker), orphelins de rendus (worker) |

Le « 23 » du rapport précédent comptait `studio_save_project` deux fois (création et édition).
Le catalogue compte **22 fonctions**.

**Après ce lot :**

- toujours 22 RPC d'écriture `authenticated`, verrouillées par un test d'inventaire (toute
  nouvelle RPC fait échouer la suite) ;
- `service_role` : 3 RPC média bornées et 7 RPC RGPD en plus ;
- **0** droit d'écriture de table pour anon, authenticated et service_role (§15, testé) ;
- 0 écriture de statut directe.

## 3. Garde centrale en base

Migration `20260928100000_studio_db_write_guard.sql` (projet dédié uniquement).

**Mécanisme.** Un schéma privé `studio_guard` porte une seule décision :
`studio_guard.assert_write(table, opération)`. Elle est appelée par un trigger **d'instruction**
`BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE` posé sur chaque table Studio :

- 13 tables métier/configuration de `public` ;
- 5 tables d'identité, puis les 4 tables RGPD (§7) ;
- les 2 tables de `studio_guard`.

Trigger d'instruction, et non de ligne, pour trois raisons :

- un seul contrôle par instruction, même pour une sauvegarde de 1 000 clips ;
- `TRUNCATE` est couvert (il ne déclenche aucun trigger de ligne) ;
- une instruction qui ne touche aucune ligne est refusée elle aussi.

Aucun corps de RPC métier n'est réécrit, à une exception près : `studio_finish_media` (voir §5).

**Contexte de l'appelant** (`studio_guard.caller_context`). Il est lu dans les claims du jeton
(`request.jwt.claims`), à défaut dans le rôle posé par `SET ROLE`. SECURITY DEFINER ne modifie pas
ce rôle ; c'est vérifié.

| Contexte | Origine | Décision |
|---|---|---|
| `user` | jeton utilisateur (PostgREST, storage-api) | table métier ET mode global `read_write` ET accès `full` (compte central actif + droit Studio accordé). Un compte `unlinked` n'est admis que si `allow_unlinked_writes` (instances jetables). Sinon **42501 « Accès Studio en lecture seule »** |
| `service` | clé service | **uniquement** dans un chemin système déclaré, et seulement sur les tables de ce chemin. Hors chemin : 42501 `STUDIO_SYSTEM_PATH_REQUIRED` |
| `operator` | connexion SQL directe sans jeton (migrations, éditeur SQL, GoTrue) | admis ; borné s'il déclare un chemin. Non joignable par l'API : PostgREST et storage-api posent toujours rôle et claims |
| `anon` / rôle inconnu / claims illisibles | — | refus (fail-closed) |

**Interrupteur global** `studio_guard.control` (ligne unique) :

- `mode` : `read_write` (défaut) | `read_only` ;
- `allow_unlinked_writes` : `false` par défaut ;
- ligne absente = lecture seule.

Il ne se change qu'en SQL : aucun rôle API n'a de droit sur `studio_guard`.

**Chemins système** `studio_guard.system_paths` : une liste fermée, revue en migration. Une
fonction système porte `SET studio.write_path = '<chemin>'` : le paramètre est posé par PostgreSQL
pendant l'appel, jamais par le client. Pour un utilisateur, un chemin déclaré est ignoré (testé).

## 4. Lecture seule : matrice prouvée

Deux sources de lecture seule :

- **par compte** : droit Studio retiré, ou compte central désactivé/supprimé ;
- **globale** : `control.mode = 'read_only'`.

| Opération | Accès complet | Lecture seule (compte ou globale) | Preuve |
|---|---|---|---|
| SELECT (tables, RPC de lecture) | ✔ | ✔ | pgTAP, réel (lecture de l'espace) |
| INSERT / UPDATE / DELETE via les 22 RPC | ✔ | **✘ 42501** | pgTAP 22/22 + empreinte des données inchangée ; réel 12 RPC → **HTTP 403** |
| Écriture de table directe (REST) | ✘ (aucun privilège) | ✘ | pgTAP, réel |
| TRUNCATE | ✘ | ✘ | pgTAP |
| **Upload Storage** (`studio-originals`) | ✔ si réservation vivante | **✘** même avec une réservation antérieure au retrait | pgTAP |
| **Delete Storage** d'un objet référencé | ✘ | ✘ | pgTAP |
| Delete Storage d'un orphelin (ligne déjà supprimée par une RPC gardée) | ✔ | — (la suppression logique est déjà refusée) | pgTAP, réel (RGPD) |
| Déplacement / renommage d'objet Studio | ✘ | ✘ | pgTAP |

Jamais de suppression de données pour retrait de droit : la lecture seule ne fait que refuser.

**Garde Storage** (`20260928120000_studio_storage_write_guard.sql`, trigger de ligne sur
`storage.objects`, buckets Studio seulement). Toute écriture d'objet est liée à un état de base
lui-même gardé :

- **original** : réservation `pending`/`uploading`/`uploaded` non expirée portant exactement cette
  clé, auteur en accès complet, mode `read_write` ;
- **rendu** : job actif dont le bail figure dans la clé ;
- **suppression** : seulement un objet qu'aucune ligne vivante ne référence ;
- **mise à jour sans changement de contenu** (horodatages) : admise.

Ici, pas d'exemption « operator » : storage-api peut écrire sans claims. La maintenance passe par
le chemin explicite `storage_maintenance`. Migration placée en **dernier** : si l'hébergé refusait
le trigger, les autres s'appliqueraient déjà et l'échec serait visible (§16, H1).

## 5. Chemins système (non cassés, bornés)

| Chemin | Fonctions (clause `SET`) | Tables autorisées | En lecture seule globale |
|---|---|---|---|
| `identity` | `studio_identity_{consume_handoff, accept_handoff, link, record_handoff, register_session, apply_lifecycle, confirm_ban, revoke_sessions, purge}` | 5 tables `studio_identity` + demandes et journal RGPD | **maintenu** (révocation, réconciliation) |
| `media_finalize` | `studio_finish_media` | `studio_media_assets`, `studio_media_analysis` | refusé |
| `media_cleanup` | `studio_expire_media`, **`studio_fail_media`**, **`studio_mark_media_missing`**, **`studio_mark_media_purged`** (nouvelles : remplacent les 3 écritures directes) | médias, références, projets, analyses | maintenu (hygiène) |
| `render_worker` | `studio_render_{dispatch, progress}`, `studio_claim_render`, `studio_complete_render` | jobs, sorties | maintenu (travail déjà accepté) |
| `analysis_worker` | `studio_analysis_{dispatch, touch}`, `studio_claim_analysis`, `studio_finish_analysis` | analyses | maintenu |
| `rgpd_erasure` | 5 RPC d'effacement (§7) | tables métier, liste d'admission, lien, sessions, tables RGPD | maintenu (futur worker RGPD) |
| `storage_maintenance` | aucune (opérateur, `SET LOCAL` explicite) | `storage.objects` | maintenu |

**`studio_finish_media`.** L'acteur est fourni par le serveur, que la garde de chemin ne voit pas.
La fonction vérifie donc elle-même `studio_guard.user_write_access(acteur) = 'full'`. Un droit
retiré entre la réservation et la confirmation entraîne un refus. Le corps est identique à la
version qualifiée, plus cette seule ligne.

**Application.**

- `media-service.ts` : `studio_fail_media` remplace le `.update()` direct de la clé service.
- `storage-reconcile.mjs` : `studio_mark_media_missing` et `studio_mark_media_purged` remplacent
  les deux `.update()` directs. `studio_mark_media_purged` refuse si l'objet existe encore ou si
  une référence subsiste.
- `read-only-policy.test.ts` classe ces RPC comme « système » et vérifie qu'elles ne sont
  appelées que par les modules serveur à clé service.

Prouvé :

- les suites des workers (rendu 45, analyse 45) passent inchangées sous la garde ;
- révocation et purge d'identité passent en lecture seule globale ;
- un chemin ne peut pas écrire hors de ses tables, et un chemin inconnu est refusé (pgTAP) ;
- **mutation** : retirer le chemin de `studio_render_dispatch` fait échouer 2 tests.

## 6. Contournement : la base est la protection

| Test | Moyen | Résultat |
|---|---|---|
| 22 RPC d'écriture, compte lié en lecture seule | pgTAP (`role authenticated` + `sub`, exactement comme PostgREST) | 22/22 → 42501 « Accès Studio en lecture seule » ; empreinte des 8 tables de l'espace inchangée |
| Même compte, droit rétabli | pgTAP | mêmes appels admis : seule la garde bloquait |
| 12 RPC (espaces, projets, cycle de vie, duplication, ordre, réservation, analyse) | **vrai PostgREST + vrai jeton GoTrue Studio** | HTTP **403**, `42501`, données inchangées |
| PATCH de table direct, jeton utilisateur | vrai PostgREST | 42501 |
| PATCH de table direct, clé service | vrai PostgREST | 42501 (droit retiré) ; **même avec un GRANT ajouté** : « Écriture service hors chemin système » |
| Mode global lecture seule | vrai PostgREST | utilisateur 403 « Studio en lecture seule » ; `studio_identity_revoke_sessions` OK, puis `GET /user` 403 |
| Compte central supprimé ; compte non lié | pgTAP | refus ; le non lié n'est admis qu'avec `allow_unlinked_writes` |
| anon, rôle de jeton inconnu, claims illisibles | pgTAP | refus |
| **Mutations** | trigger désactivé sur `studio_workspaces` / garde Storage / ouverture RGPD / chemin worker | 33 / 6 / 3 / 2 tests en échec : les suites détectent chaque retrait. Restauré : 63/63 et 71/71 |

## 7. Événement « compte ELSATIA supprimé »

```
auth.users DELETE / deleted_at (central)
  → outbox « deleted » (même transaction, trigger central)                        [existant]
  → webhook signé ES256 → studio_identity_apply_lifecycle, UNE transaction :
      subject_state = deleted          → tout passage refusé (login bloqué)        [existant]
      sessions GoTrue + pont supprimées → GET /user 403, refresh 400              [existant]
      ban_desired → ban GoTrue, confirmé/rejoué par la réconciliation            [existant]
      trigger → studio_identity.erasure_requests (pending) + journal « opened »   [NOUVEAU]
  → garde centrale : accès « blocked » → toute écriture refusée                   [NOUVEAU]
```

Détails :

- **Une demande par sujet.** Un événement rejoué ou périmé ne crée rien.
- **Sujet jamais venu sur Studio** : aucune demande (pas de données).
- **Réactivation avant toute exécution** : demande `superseded`. Une nouvelle suppression la
  rouvre, et le délai repart.
- **Réactivation pendant l'effacement** : journal `reactivated_during_erasure`, et l'exécution
  refuse (`refused_not_deleted`).

Prouvé en pgTAP, et de bout en bout sur la pile réelle : suppression du compte central → outbox →
webhook → Studio.

## 8. Inventaire des données Studio (classification)

| Données | Classe | Traitement |
|---|---|---|
| **Espaces** dont l'utilisateur est propriétaire **et seul membre** | DELETE | espace + adhésions |
| **Espaces partagés** possédés par l'utilisateur | **DECISION_REQUIRED** | transfert à un admin ou archivage : décision produit. Rien n'est touché ; la clôture est bloquée |
| **Adhésions** dans les espaces d'autrui | DELETE | hors rôle `owner` |
| **Projets**, références média, couverture, ordre (espaces effaçables) | DELETE | |
| **Contenus créés par l'utilisateur dans des espaces d'autrui** (projets, médias, montages, rendus, analyses) | **DECISION_REQUIRED** | ce sont les données de l'espace (responsable = propriétaire de l'espace). Conservation ou réattribution à décider ; clés `on delete restrict` : rien n'est cassé |
| **Médias** : lignes + objets `studio-originals` | DELETE | base puis Storage (§10) |
| **Exports** (rendus publiés `studio-renders`) | DELETE | base puis Storage |
| **Jobs** : rendus (snapshot du montage, noms de fichiers), outbox, analyses (résultats IA) | DELETE | |
| **Montages** et clips | DELETE | |
| **Commentaires** | sans objet | aucune table de commentaires dans V3 (lot post-H non porté) |
| Liste d'admission (e-mail exact) | DELETE | entrée retirée ; les `@domaine` sont conservés |
| `studio_identity.links` (e-mail) et `sessions` | DELETE | à la clôture |
| Utilisateur **Auth Studio** (GoTrue du projet dédié) | DELETE | par l'API admin, après les données (FK `restrict` = ordre imposé) |
| `studio_identity.subject_state` | **RETAIN** + ANONYMIZE | seuls restent le sujet opaque, l'état `deleted` et la séquence (refus des jetons tardifs) ; droit, plan et échéance mis à NULL. **Durée : DECISION_REQUIRED** |
| `studio_identity.lifecycle_events` | RETAIN | purge à 180 j **préexistante** (fondation B + I1), non modifiée ici |
| `consumed_handoffs` | aucune donnée personnelle | purge 1 h après expiration (existant) |
| Demandes RGPD + journal `erasure_events` | **RETAIN** (preuve d'effacement) | compteurs et statuts seulement, `user_id` mis à NULL à la clôture. **Durée : DECISION_REQUIRED**, aucune purge implémentée |
| **Audit** : erasure_events | RETAIN, **immuable** | trigger : UPDATE, DELETE et TRUNCATE refusés |
| **Références de facturation** | hors base Studio | seuls `plan`/`valid_until` (reflet du droit central) → ANONYMIZE. La facturation (Stripe, pièces comptables) est **centrale (GP)** et suit sa propre obligation : non traitée ici, sans décision |

L'inventaire (compteurs par classe) est calculé en base (`studio_identity.erasure_inventory`) et
enregistré sur la demande à chaque plan.

## 9. Aucune durée inventée (fail-closed)

`studio_identity.erasure_policy` :

- `mode` : `off` (**défaut**) | `dry_run` | `execute` ;
- `decision_ref` : référence de la décision écrite ;
- `grace_period` : **aucune valeur par défaut**.

Une contrainte interdit `execute` sans `decision_ref` **et** `grace_period` (testée).

| Paramètre | Statut |
|---|---|
| Délai entre suppression du compte et effacement Studio | **DECISION_REQUIRED** (NULL = rien ne s'exécute) |
| Conservation du sujet opaque `deleted` | **DECISION_REQUIRED** |
| Conservation du journal d'effacement | **DECISION_REQUIRED** |
| Espaces partagés / contenus chez autrui | **DECISION_REQUIRED** (produit/juridique) |

Les suites de test posent `grace_period = '0'` / `'1 day'`. Ce sont des **valeurs de test**,
jamais livrées.

## 10. Médias : purge préparée

| Élément | Traitement |
|---|---|
| Base | lignes supprimées dans l'ordre des clés étrangères, **après** mise en file Storage (sinon les clés seraient perdues) |
| Storage `studio-originals` | une entrée `object` par média non purgé |
| Storage `studio-renders` (exports) | une entrée `object` par rendu publié |
| **Fichiers dérivés, vignettes, artefacts** | une entrée `prefix` `studio/<espace>/` **par bucket** : tout ce qui reste sous l'espace (rendu avorté, dérivé futur, vignette) est listé et supprimé, référencé ou non. Aucune vignette n'existe aujourd'hui en V3 ; le balayage les couvrira |
| Artefacts du worker | Redis : seuls des identifiants de job opaques, `removeOnComplete`/`removeOnFail`. Répertoires temporaires : supprimés en `finally`, balayage > 1 h (`cleanup.ts`). Un job en cours après effacement ne peut plus publier : ligne supprimée, bail invalide, garde Storage refuse l'objet |
| Constat | `studio_erasure_storage_done` **vérifie en base** qu'aucun objet ne subsiste (clé ou préfixe) avant d'enregistrer |

**Exécuteur** `apps/studio/src/lib/erasure-runner.ts` et route
`POST /api/elsatia/erasure` (`Bearer STUDIO_CRON_SECRET`, même modèle que `/reconcile`).

- Il n'exécute que ce que SQL ne peut pas faire : `storage.remove` et `auth.admin.deleteUser`
  (404 = déjà fait).
- Tout le reste est décidé par la base.
- Il s'arrête au moindre doute : pas de constat sans suppression, pas de clôture sans constat, pas
  de suppression Auth sans clôture.
- Journal sans donnée personnelle.

## 11. Immutabilité

- Rien de DECISION_REQUIRED n'est touché : espace partagé, contenus chez autrui, rôle `owner`
  (testé).
- La clôture est **refusée** tant qu'il en reste. L'utilisateur Auth n'est donc jamais supprimé
  en cassant une donnée conservée, et les FK `restrict` le garantiraient de toute façon.
- Journal immuable.
- Aucune donnée n'est supprimée pour un retrait de droit (lecture seule).

## 12. Rejouable, idempotent, auditable

| Propriété | Mécanisme | Preuve |
|---|---|---|
| Idempotent | périmètre recalculé à chaque appel ; file Storage `unique (demande, bucket, clé)` ; `finalize`/`confirm` rejouables | pgTAP (exécution ×2 sans doublon, clôture ×2), réel (cycle rejoué sans effet) |
| Rejouable | états `pending → awaiting_decision → storage_pending → auth_pending → completed` repris à chaque cycle | Vitest : Storage refusé → rien d'autre ; Auth 404 → constat |
| Auditable | `erasure_events` : opened, planned, db_erased, data_erased, completed (+ superseded, reopened, refused_not_deleted, reactivated_during_erasure), avec `decision_ref` et compteurs | pgTAP (séquence exacte, aucune donnée personnelle), réel |
| Concurrence | `select … for update` sur la demande | — |

## 13. Supabase dédié uniquement

- 3 migrations nouvelles, toutes dans `apps/studio/supabase/migrations` et classées `dedicated_only`
  dans `migration-targets.json` :
  - `20260928100000_studio_db_write_guard`
  - `20260928110000_studio_rgpd_erasure_foundation`
  - `20260928120000_studio_storage_write_guard`
- `verify:migrations` : T1–T8 verts. Partagé 341 (inchangé), dédié 14 (9 gelées + 5 dédiées).
- Chaîne dédiée seule sur base vierge : 14 migrations, **0 table non `studio_*`** en `public`.
- Train partagé inchangé (aucune migration racine ajoutée, attendus Preview identiques). Rejoué :
  341 migrations OK.
- Modifications de tests racine, sans effet sur le projet partagé :
  - trois suites Studio (`editor`, `render_engine`, `templates`) posaient des objets Storage pour
    des médias **déjà forcés `ready`**, raccourci que le flux réel ne produit jamais ;
  - la garde Storage le refuse, à juste titre ;
  - ces fixtures déclarent donc `studio.write_path = 'storage_maintenance'` (paramètre inconnu et
    inerte sur le projet partagé) ;
  - rejouées sur le train partagé : 22/45/18, inchangé.

## 14. Auth : suite B + I1 rejouée

Pile réelle (GoTrue v2.192.0 ×2, PostgREST v12.2.3 ×2, 2 clusters PG16), chaîne dédiée complète
**avec les gardes**, application Studio construite et démarrée.

| Propriété | Tests | Résultat |
|---|---|---|
| Échange signé (ES256, audience, émetteur, expiration) | réel | ✔ |
| `jti` à usage unique (3 soumissions concurrentes → 1 succès) | réel | ✔ |
| Révocation (ban + sessions + événement signé → 403 / refresh 400) | réel + e2e app | ✔ |
| Réessais (outbox, recul, livraison au retour) | réel | ✔ |
| Réconciliation (bans, jti, sessions ; réémission plateforme) | réel + e2e app | ✔ |
| Rotation de clé (fenêtre `previous`) | réel | ✔ |
| **Nouveaux** : contournement RPC, clé service, lecture seule globale, RGPD de bout en bout | réel | ✔ |

**73/73, trois exécutions consécutives** (69 précédents + 4 nouveaux ; dont 3 e2e contre
`next start`).

## 15. Tests

| Suite | Résultat |
|---|---|
| **pgTAP chaîne dédiée** `apps/studio/scripts/dedicated-db-check.sh` | 14 migrations ; **543 ok, 0 échec** : garde 63 (nouveau), admission 10, RGPD 71 (nouveau), fondation 58, signup 14, analyse 45, éditeur 22, upload 40, gestion 105, rendu 45, templates 18, timeline 52 |
| **Identité** `npx vitest run packages/elsatia-identity` (pile réelle + app) | **73/73 ×3** |
| **Studio** `npm test` | **291/291** (+9 exécuteur RGPD, +1 politique lecture seule) |
| Studio `typecheck` / `lint` / `next build` | OK / 0 problème / OK (route `/api/elsatia/erasure` construite) |
| Route RGPD sur l'app démarrée | sans secret → 401 ; avec secret, défaut → `{"mode":"off", …}` |
| **GP** `npx vitest run` (racine, sans pile) | **1898 passed**, 36 ignorés (= 32 réels/e2e précédents + 4 nouveaux réels, qui exigent la pile), 0 échec |
| GP `tsc --noEmit` / `eslint` / `next build` | OK / 0 erreur (15 avertissements, tous hors de ce lot, inchangés) / OK |
| `verify:migrations` / `test:migration-targets` / `verify:env-manifest` / `test:env-manifest` / `verify:secrets` / `verify:train-expectations` | OK / 7/7 / OK / 67/67 / aucun secret / OK |
| Train partagé `rebuild_db.sh` | 341 migrations OK |

Reproduire :

```bash
STACK_BIN=<gotrue v2.192.0 + postgrest v12> packages/elsatia-identity/scripts/local-stack.sh start
source /var/tmp/elsatia-stack/env.sh
apps/studio/scripts/dedicated-db-check.sh                 # 543 pgTAP (PG16 + pgTAP locaux)
npx vitest run packages/elsatia-identity                  # 70 ; +3 e2e avec STUDIO_APP_URL, E2E_SIGNING_KEYS, E2E_CRON_SECRET
(cd apps/studio && npm test && npm run typecheck && npm run lint)
packages/elsatia-identity/scripts/local-stack.sh stop
```

La CI Studio (`studio-foundation.yml`) rejoue le train **partagé** (`local-test.mjs`), qui ne
porte pas ces migrations dédiées. La chaîne dédiée reste prouvée par `dedicated-db-check.sh`,
substitut déjà documenté. Recommandation : ajouter à la CI un job PG16 + pgTAP qui l'exécute
(§16, D6).

## 16. Reste à faire, décisions, checklist hébergée

**Décisions (aucune prise ici) :**

| # | Sujet | Nature |
|---|---|---|
| D1 | Délai avant effacement Studio (`grace_period`) + `decision_ref` | **juridique** — sans elle, `execute` est impossible |
| D2 | Durée de conservation du sujet opaque `deleted` et du journal d'effacement | juridique |
| D3 | Espaces partagés possédés par un compte supprimé : transfert ou archivage | produit |
| D4 | Contenus créés dans l'espace d'autrui : conservation, réattribution ou suppression | produit + juridique |
| D5 | Accusé `erasure_done` vers la plateforme (contrat v1) pour purger `elsatia_identity_subjects` côté central | contrat, lot suivant |
| D6 | Job CI dédié (PG16 + pgTAP) pour `dedicated-db-check.sh` | outillage |
| D7 | Export « mes données » Studio (droit d'accès) | lot suivant (inchangé, §8 du rapport V3) |

**Ajouts à la checklist hébergée (§10 du rapport V3) :**

- **H1**. Vérifier que le rôle de migration peut créer un trigger sur `storage.objects` du projet
  Studio. En cas de refus, `db push` échoue sur la dernière migration seulement, et la décision
  est à prendre avant ouverture.
- **H2**. Vérifier que storage-api de la version hébergée fait l'upload signé via un `INSERT`
  (ou un upsert) sur `storage.objects` : la garde s'y attache. Preuve : upload signé d'un média
  réservé OK ; même upload après retrait du droit → refus.
- **H3**. Après push : `select mode, allow_unlinked_writes from studio_guard.control` doit donner
  `read_write`, `false`. **Ne jamais** poser `allow_unlinked_writes = true` sur un projet hébergé.
- **H4**. `select mode from studio_identity.erasure_policy` doit donner `off` jusqu'à D1.
- **H5**. Planifier `POST /api/elsatia/erasure` (même secret et même cadence que `/reconcile`).
  Il reste inerte tant que le mode est `off`.
- **H6**. Supervision : alerte si des demandes restent en `awaiting_decision` ou
  `storage_pending` au-delà du délai décidé.

**Risque résiduel borné.** Un rendu ou une analyse **déjà acceptés** se terminent si le droit est
retiré en cours : chemins `render_worker`/`analysis_worker`, publication visible des seuls membres
de l'espace. Si le compte est **effacé**, la publication devient impossible (ligne supprimée,
garde Storage).

## 17. Fichiers

| Classe | Fichiers |
|---|---|
| PRODUCTION — base Studio dédiée | `apps/studio/supabase/migrations/20260928100000_studio_db_write_guard.sql`, `…110000_studio_rgpd_erasure_foundation.sql`, `…120000_studio_storage_write_guard.sql`, `apps/studio/supabase/migration-targets.json` |
| PRODUCTION — Studio | `apps/studio/src/lib/erasure-runner.ts`, `apps/studio/src/app/api/elsatia/erasure/route.ts`, `apps/studio/src/lib/media-service.ts`, `apps/studio/scripts/storage-reconcile.mjs` |
| TEST_HARNESS | `apps/studio/supabase/tests/studio_db_write_guard.test.sql`, `…/studio_rgpd_erasure.test.sql`, `apps/studio/tests/erasure-runner.test.ts`, `apps/studio/tests/read-only-policy.test.ts`, `packages/elsatia-identity/tests/real.test.ts`, `apps/studio/scripts/dedicated-db-check.sh` (opt-in explicite `allow_unlinked_writes` pour l'instance jetable), `supabase/tests/studio_{editor,render_engine,templates}.test.sql` (fixture maintenance) |
| DOC | ce rapport |

Aucun fichier GP de production modifié. Aucune migration du train partagé ajoutée ou modifiée.
