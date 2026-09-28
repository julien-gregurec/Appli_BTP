# ELSATIA Studio — port et requalification du lot post-H (V1)

Date : 2026-09-28 · Branche : `claude/modest-pasteur-izfaqm` · Base : `claude/ecstatic-hawking-2hz6n8`
@ `fb7082c6` (STUDIO V3 FOUNDATION LOCALLY QUALIFIED + STUDIO DB GUARDS LOCALLY QUALIFIED).

## Verdict

**STUDIO POST-H LOCALLY QUALIFIED**

Le lot post-H (43 commits, 159 fichiers, 8 migrations dont les 7 migrations métier annoncées) a été
retrouvé sur une seule branche, classé fichier par fichier, et porté sur la fondation Studio actuelle
(B + I1, projet Supabase dédié, passage signé, gardes base, fondation RGPD). Les 7 migrations sont
**réécrites** pour le projet dédié (aucune à la racine) ; la suppression de compte initiée par Studio,
le hook d'inscription, l'inscription publique et le mot de passe local ne sont **pas** portés.
Tout est vérifié localement : 829 assertions pgTAP sur la chaîne dédiée, identité B+I1 73/73 ×3
(GoTrue + PostgREST réels, app Studio démarrée), contrôle GoTrue/PostgREST post-H 24/24,
Studio Vitest 338/338, worker 42/42, GP sans régression. Aucun déploiement.

Les points qui restent sont des **décisions propriétaires ou juridiques** (§14). Aucun ne bloque la
qualification locale.

---

## 1. Base

| Élément | Valeur |
|---|---|
| Base demandée | `origin/claude/ecstatic-hawking-2hz6n8` @ `fb7082c6` |
| Branche de travail | `claude/modest-pasteur-izfaqm` (`4d92ddbe`, ancêtre strict de la base) → avance rapide sur `fb7082c6`, sans perte |
| Fondation vérifiée avant port | `dedicated-db-check.sh` : 14 migrations, **543 ok / 0 échec** (identique au rapport DB GUARDS) |

## 2. Lot post-H retrouvé (sans deviner)

`git fetch --all --prune` (318 références). Preuves :

1. `ELSATIA_STUDIO_V3_PORT_HOSTED_READINESS_V1.md` §5.1 nomme le lot : `fix/studio-signup-closed-v1`
   @ `634651a0`, 7 migrations `render_admission`, `export_profiles`, `brand_kit`, `shares_watermark`,
   `audio_music`, `invitations`, `account_deletion`, « ~61 fichiers ».
2. Balayage de **toutes** les branches distantes : seule `origin/fix/studio-signup-closed-v1`
   (`634651a0`) contient `studio_render_admission` / `studio_brand_kit`.
3. Frontière « H » : `214d47fd docs(studio): document Lot H analysis contract and qualification`
   (dernier commit du Lot H ; `origin/feat/elsatia-studio-v1` s'arrête à H). Le premier commit
   post-H est `ffb900bf docs(studio): startup report and finalisation master ledger`.
4. Lot post-H = `214d47fd..634651a0` : **43 commits (35 hors merges)**, **159 fichiers**, dont 59
   sous `apps/studio/src` (les « ~61 fichiers » annoncés), 8 migrations `supabase/migrations/2026092{0,1}*`
   (les 7 métier + `20260921070000_studio_signup_policy`, hook Auth) et leurs 16 liens symboliques
   `apps/studio/supabase/migrations`.

Lots contenus : S1 admission de rendu/kill-switch/quota, S2 éditeur, S3 UX auth (réinitialisation de
mot de passe), S4/J1 profil 720p + journal d'usage, I Brand Kit, J2 partages + filigrane, S5 vignettes,
M musique, invitations, RGPD (suppression de compte), pages légales, Supabase dédié (liens symboliques),
inscription fermée (hook Auth).

## 3. Inventaire

Méthode : pour chaque fichier du diff `214d47fd..634651a0`, comparaison des blobs base / H / post-H :
48 fichiers **inchangés dans la base depuis H** (post-H repris exactement), 82 **absents** de la base,
29 **divergents** (fusion 3-voies `git merge-file`, base = H). Chaque fichier est ensuite classé ;
tableau complet en **annexe A**.

| Classe | Fichiers | Contenu |
|---|---|---|
| REUSABLE | 64 | éditeur, rendus, vignettes, musique (UI), Brand Kit, partages, invitations, pages légales, observabilité, domaine, worker |
| SUPERSEDED | 22 | liens symboliques de migrations (16), config dédiée, hook Auth, test de fondation, `studio-supabase-check.mjs`, `config.ts` |
| CONFLICT | 10 | résolus à la main (`actions.ts`, `settings/page.tsx`, `proxy.ts`, `login`/`signup`, scripts locaux, `.env.example`) |
| MIGRATION | 7 | les 7 migrations métier (§4) |
| TEST | 25 | pgTAP post-H (6 portées), Vitest, Playwright, tests worker |
| DOC | 10 | rapports de l'ère projet partagé : non importés (référencés par commit) |
| DISCARD | 21 | mot de passe local, inscription publique, suppression de compte Studio, gabarits e-mail GoTrue, contrôles de montée H→post-H |
| **Total** | **159** | |

## 4. Migrations

### 4.1 Classement des 8 migrations du lot

| Migration post-H (racine) | Classement | Sort |
|---|---|---|
| `20260920010000_studio_render_admission` | **Studio dedicated · needs rewrite** | → `20260929100000_studio_render_admission` |
| `20260920030000_studio_export_profiles` | **Studio dedicated · needs rewrite** | → `20260929110000_studio_export_profiles` |
| `20260920050000_studio_brand_kit` | **Studio dedicated · needs rewrite** | → `20260929120000_studio_brand_kit` |
| `20260920070000_studio_shares_watermark` | **Studio dedicated · needs rewrite** | → `20260929130000_studio_shares_watermark` |
| `20260921010000_studio_audio_music` | **Studio dedicated** (corps inchangé) | → `20260929140000_studio_audio_music` |
| `20260921030000_studio_invitations` | **Studio dedicated · needs rewrite** | → `20260929150000_studio_invitations` |
| `20260921050000_studio_account_deletion` | **obsolete** (remplacée) | non portée : fondation RGPD `20260928110000` + extension `20260929160000` |
| `20260921070000_studio_signup_policy` (hook Auth) | **obsolete** (hors des 7) | non portée : `20260922000325` + `20260927110000_studio_dedicated_admission` |
| — | **central GP** | **aucune** : rien du lot ne relève du projet partagé |

Pourquoi réécrire plutôt que copier :

- **Horodatages** : `202609200*`/`202609210*` sont **antérieurs** à la fondation dédiée
  (`20260922…`–`20260928…`). Copiés tels quels, ils s'appliqueraient **avant** la garde centrale et la
  fondation RGPD (fenêtre sans garde, `db push` hors ordre). Nouveaux horodatages `20260929*`, après
  `20260928120000_studio_storage_write_guard`.
- **Appliquées brutes** sur la chaîne dédiée (essai `posth_raw`), les 7 passent, mais leurs 5 nouvelles
  tables n'ont **ni garde ni couverture RGPD** et le hook échoue (`studio_signup_policy` existe).

Chaque migration réécrite garde le corps post-H (auditable contre la source) et ajoute, **dans la même
transaction** : trigger `studio_write_guard`, `studio_guard.user_tables()` redéfinie en entier si la
table est modifiable par l'utilisateur, appartenance aux chemins système, retrait des droits de table
directs (`anon`, `authenticated`, `service_role`).

| Migration dédiée | Ajouts au corps post-H |
|---|---|
| `20260929100000_studio_render_admission` | garde sur `studio_render_limits` (réglage opérateur SQL uniquement) |
| `20260929110000_studio_export_profiles` | garde sur `studio_usage_events` ; table ajoutée aux chemins `render_worker` (trigger de publication) et `rgpd_erasure` |
| `20260929120000_studio_brand_kit` | garde ; `studio_brand_kits` table utilisateur ; chemin `rgpd_erasure` |
| `20260929130000_studio_shares_watermark` | `studio_guard.account_live(uuid)` ; résolution publique coupée si l'espace est fermé **ou si le compte ELSATIA du propriétaire n'est plus actif** ; garde ; table utilisateur ; `rgpd_erasure` |
| `20260929140000_studio_audio_music` | aucun (pas de nouvelle table ; audio = `studio_media_assets` + `studio-originals`, déjà gardés) |
| `20260929150000_studio_invitations` | acceptation liée à l'adresse **ELSATIA** (`studio_identity.links.email`) ; invitation `unavailable`/refusée si l'invitant n'est plus actif ; `studio_pending_invitation_for` (porte d'inscription publique) **retirée** ; garde ; table utilisateur ; `rgpd_erasure` |
| `20260929160000_studio_post_h_guard_rgpd` | chemin utilisateur `exposure_revocation` (§7) ; effacement RGPD étendu aux tables post-H (§8) |

### 4.2 Bon projet, prouvé

- `apps/studio/supabase/migration-targets.json` : les 7 fichiers en `dedicated_only`.
  `npm run verify:migrations` → « partagé 341 · Studio dédié 21 (9 copies gelées + 12 dédiées) ».
- `rebuild_db.sh` (train partagé) : **341 migrations**, **0** des 5 tables post-H présentes.
- `dedicated-db-check.sh` : 21 migrations, **0 table non Studio** dans le projet dédié.

## 5. Port

Porté (compatible B + I1, projet dédié, passage signé, gardes, RGPD) : admission de rendu bornée et
quota des réservations abandonnées, profil `hd720`, journal d'usage + page d'usage, Brand Kit (page,
logo appliqué aux modèles), liens de partage révocables (page publique `/s/<jeton>`, URL signée de
60 s), filigrane serveur, musique importée (MP3/M4A/WAV, mixage worker), invitations par e-mail,
vignettes d'images, confirmation avant retrait d'un média utilisé, corrections éditeur (S2),
pages légales (gabarits LEGAL REVIEW REQUIRED), journalisation d'erreurs sans PII, délais de rendu
proportionnels, battement de cœur tolérant.

Adaptations applicatives :

| Fichier | Adaptation |
|---|---|
| `src/app/actions.ts` | `saveBrandKit`, `inviteMember`, `revokeInvitation`, `acceptInvitation` : `canWrite(user.access)` / `requireWritableStudioUser()` comme les autres écritures |
| `src/lib/invitations.ts` | garde d'écriture dans `inviteMember`/`acceptInvitation` ; `hasPendingInvitation` retiré |
| `src/lib/shares.ts` | révocation avec autorisation de **lecture** (admise en lecture seule, bornée en base) |
| `src/app/invitations/[token]/page.tsx` | « Se connecter avec mon compte ELSATIA » ; plus de lien d'inscription |
| `src/app/settings/page.tsx` | usage conservé ; « Supprimer mon compte » (mot de passe) remplacé par le renvoi vers ELSATIA |
| `src/lib/legal.ts` | droits RGPD : suppression depuis ELSATIA (plus « dans Paramètres ») |
| `src/lib/mailer.ts` | clé `STUDIO_RESEND_API_KEY` propre à Studio |
| `src/proxy.ts` | kill-switch de la base conservé ; cache privé 600 s des vignettes |
| `config/env-manifest.json` | `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`, `STUDIO_RESEND_API_KEY`, `STUDIO_LEGAL_TEXT_VERSION` déclarées |
| `tests/read-only-policy.test.ts` | 14 RPC post-H classées (§7) + test de confinement des résolutions/révocations |

## 6. Auth — rien de réintroduit

| Interdit | Preuve |
|---|---|
| Signup Studio public | hook/`studio_pending_invitation_for`/`signup-gate`/`entitlement` non portés ; GoTrue dédié `POST /signup` → **422** ; RPC absente (PostgREST **404**) ; pgTAP `hasnt_function` ; `/signup` redirige vers `/login` en mode `elsatia` (base inchangée) |
| Mot de passe local Preview/Production | `/forgot-password`, `/reset-password`, `/auth/recovery`, gabarits `recovery.html`/`confirmation.html`, `requestPasswordReset`/`updatePassword`, suppression par mot de passe : **non portés** (absents du build) ; `auth/confirm` de la base conservé ; `verify-identity-mode` inchangé |
| Base métier Supabase partagée | 0 migration post-H à la racine (`verify:migrations`, `rebuild_db.sh`) ; tout dans `apps/studio/supabase` |

L'invitation ne crée pas de compte : l'invité se connecte par le passage signé ELSATIA ; l'acceptation
compare l'adresse **du compte ELSATIA** (`links.email`, mise à jour à chaque passage), jamais l'e-mail
Auth local (prouvé : un e-mail Auth différent est refusé).

## 7. Lecture seule et classification des RPC

Toutes les nouvelles écritures passent par `studio_guard.assert_write` (trigger d'instruction sur
chaque nouvelle table ; aucun droit de table direct). Inventaire des RPC `authenticated` volatiles
porté de **22 à 29** (test de la base mis à jour, « nouvelle RPC = revue »).

| RPC | Classe | Appelant | Lecture seule (droit retiré) |
|---|---|---|---|
| `studio_save_brand_kit`, `studio_attach_brand_logo` | écriture utilisateur | `authenticated` | refusée (app + base) |
| `studio_create_render_share` | écriture utilisateur | `authenticated` | refusée |
| `studio_invite_member`, `studio_accept_invitation` | écriture utilisateur | `authenticated` | refusée |
| `studio_request_render`, `studio_reserve_media` (corps remplacés) | écriture utilisateur | `authenticated` | refusée (inchangé) |
| `studio_revoke_render_share`, `studio_revoke_invitation` | **révocation** (chemin `exposure_revocation`) | `authenticated` | **admise** : UPDATE des seules tables de partage/invitation ; refusée pour un compte bloqué |
| `studio_workspace_usage`, `studio_get_brand_kit`, `studio_list_brand_logo_candidates`, `studio_list_render_shares`, `studio_list_invitations` | lecture (STABLE) | `authenticated` | admise |
| `studio_resolve_render_share`, `studio_resolve_invitation` | résolution publique (STABLE) | `service_role` seul | sans objet |
| `studio_record_export_usage` (trigger) | système, chemin `render_worker` | publication worker | admis (rendu déjà accepté) |
| triggers `studio_render_watermark_stamp`, `studio_render_music_stamp`, `studio_timeline_music_guard`, `studio_brand_logo_guard` | modifient `NEW` / refusent | — | aucune écriture propre |

Chemin utilisateur `exposure_revocation` (colonne `studio_guard.system_paths.user_callable`) : seul
chemin qu'un appel utilisateur peut porter ; UPDATE uniquement, tables bornées, compte `blocked`
refusé ; un chemin non `user_callable` posé par un utilisateur est ignoré (règles ordinaires,
comportement de la base inchangé). Raison : retirer une exposition publique doit rester possible
après la perte du droit ou en mode global `read_only`.

## 8. RGPD

| Donnée / table | Contenu personnel | Classe | Mise en œuvre |
|---|---|---|---|
| `studio_brand_kits` (espace effacé) | raison sociale, slogan, téléphone, site, e-mail, logo | **DELETE** | avant les médias (FK logo) |
| `studio_brand_kits.updated_by` dans l'espace d'autrui | acteur | **DECISION_REQUIRED** | compté dans `authored_in_shared_workspaces` ; bloque la clôture |
| `studio_render_shares` (espace effacé) | hachés, créateur, échéances | **DELETE** | avant les rendus ; lien **coupé immédiatement** dès que le compte n'est plus actif |
| `studio_render_shares.created_by` chez autrui | acteur | **DECISION_REQUIRED** | idem |
| `studio_workspace_invitations` de l'espace effacé | e-mails d'invités (tiers) | **DELETE** | |
| invitations adressées à la personne ailleurs | son e-mail | **DELETE** | `invitations_addressed` |
| `accepted_by` = la personne ailleurs | acteur | **ANONYMIZE** | mis à NULL ; clôture refusée sinon |
| `invited_by` = la personne chez autrui | acteur | **DECISION_REQUIRED** | |
| invitations révoquées/expirées/acceptées d'espaces vivants (e-mails de tiers) | e-mails | **DECISION_REQUIRED** | aucune durée inventée, aucune purge implémentée |
| `studio_usage_events` | compteurs par espace | **DELETE** | cascade + suppression explicite |
| `studio_render_limits`, `render_watermark` | aucune | sans objet (réglage) | — |
| Musique importée (`studio_media_assets` audio + objet `studio-originals`) | fichier utilisateur | **DELETE** | chemin existant (file Storage) |
| Instantanés de rendu (filigrane, ligne d'actif audio) | noms de fichiers | **DELETE** | avec les jobs (existant) |
| E-mails d'invitation via Resend | adresse de l'invité | **DECISION_REQUIRED** | sous-traitant et mentions légales à décider ; sans fournisseur rien n'est envoyé |
| Journaux d'erreur (`instrumentation.ts`) | aucun (route, méthode, digest) | sans objet | — |

`erasure_inventory`, `erasure_execute` et `erasure_finalize` sont remplacées à l'identique plus ces
ajouts ; mode `off` par défaut, décision écrite et délai décidés inchangés. Prouvé bout en bout
(pgTAP §11) : effacement complet puis suppression réelle de l'utilisateur Auth (aucune FK post-H
ne l'empêche), et cas bloqué (3 contenus chez autrui → `awaiting_decision`, rien touché).

## 9. Storage

Aucun nouveau bucket, aucune nouvelle donnée Storage persistée : l'audio passe par la réservation
`studio-originals` (garde Storage : réservation vivante, auteur en accès complet), les exports
partagés sont les objets `studio-renders` existants (lecture par URL signée de 60 s), les vignettes
sont calculées à la volée (`sharp`, non stockées). La liste MIME du bucket `studio-originals` est
élargie à l'audio. Les suppressions restent soumises à la garde (objet non référencé seulement) ;
les objets d'un espace effacé passent par `erasure_storage_queue`.

## 10. Worker (`workers/studio-video`)

| Job | Retries | Cleanup | Révocation | Lecture seule | Effacement |
|---|---|---|---|---|---|
| **render** (+ filigrane, musique) | relance utilisateur ≤ 3 (`retry_of`, inchangé) ; battement toléré 5 échecs avant `HEARTBEAT_LOST` ; délai `max(configuré, 3×durée+60 s)` borné à 7200 s | répertoire scratch supprimé (inchangé) ; `reconcile.ts` : objets orphelins > 1 h, dry-run par défaut | `studio_render_progress` faux (bail perdu/annulé) → arrêt immédiat | chemin `render_worker` (`allowed_in_read_only`) : un rendu **déjà accepté** se termine ; aucun nouveau rendu (admission refusée) | job effacé → progression fausse → arrêt ; publication refusée (garde Storage : aucun bail vivant) |
| **analysis** | inchangé par post-H | inchangé | inchangé | inchangé | lignes effacées (existant) |
| **media** (vignettes) | sans objet (synchrone) | aucun stockage | autorisation par requête ; cache navigateur privé ≤ 600 s | lecture | média effacé → 404 |
| **exports / partages** | sans objet | — | révocation, expiration, espace fermé ou compte non actif → résolution nulle ; URL signée ≤ 60 s | révocation admise | lignes + objets effacés |
| **usage** | idempotent (`unique(job_id,kind)`) | — | — | chemin `render_worker` | DELETE |

`STUDIO_RECONCILE_ALLOW_REMOTE_HOST` (déjà au manifeste) : réconciliation distante seulement pour
l'hôte exact nommé par l'opérateur. Environnement de test : `ffmpeg-static` sans `drawtext` sur cet
hôte → `STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg` (FFmpeg 6.1.1) ; l'analyse exige `opencv-python-headless`
+ `numpy` (`analysis/requirements.txt`). La base échouait de même sans ces outils (3/6 fichiers).

## 11. Tests

| Suite | Résultat |
|---|---|
| **pgTAP chaîne dédiée** `apps/studio/scripts/dedicated-db-check.sh` | 21 migrations ; **829 ok, 0 échec** (19 suites) : fondation 543 inchangées + post-H portées 203 (admission 21, profils 33, Brand Kit 44, partages 37, musique 37, invitations 31) + **nouvelle** `studio_post_h_guard_rgpd` 83 |
| **Identité B + I1** `npx vitest run packages/elsatia-identity` (GoTrue v2.192.0 + PostgREST 12.2.3 réels, app Studio `next start` avec le code porté) | **73/73 ×3** (dont 3 e2e navigateur) |
| **GoTrue / PostgREST post-H** `packages/elsatia-identity/scripts/studio-post-h-smoke.mjs` | **24/24** : signup 422, RPC d'écriture 42501 hors pont, tables hachées illisibles, écritures directes refusées (5 tables × 2 rôles), résolutions service seul, RPC écartées 404 |
| **Studio Vitest** `apps/studio npm test` | **338/338** (base 291 : +47) |
| Studio `typecheck` / `lint` / `next build` | OK / 0 problème / OK (routes `/brand-kit`, `/invitations/[token]`, `/legal/[doc]`, `/s/[token]` ; aucune route mot de passe) |
| **Worker** `vitest` / `tsc` / `eslint` | **42/42** (base 32/32) / OK / OK |
| **GP** `npx vitest run` (sans pile) | **1898 passed**, 36 ignorés, 0 échec (= baseline) |
| GP `typecheck` / `lint` / `next build` | OK / 0 erreur (15 avertissements préexistants) / OK |
| Train partagé `rebuild_db.sh` | **341 migrations** OK ; 0 table post-H |
| `verify:migrations` / `test:migration-targets` / `verify:secrets` / `verify:env-manifest` / `test:env-manifest` / `verify:train-expectations` | OK partout |
| Playwright Studio (`*.spec.ts`) | **non exécuté** : `local-test.mjs` (CLI Supabase + Docker jetable) rejoue le train partagé, qui ne porte pas les migrations dédiées (limite déjà notée par la fondation, §16 du rapport DB GUARDS) |

Reproduire :

```bash
apps/studio/scripts/dedicated-db-check.sh                                   # PG16 + pgTAP locaux
STACK_BIN=<gotrue v2.192.0 + postgrest v12> packages/elsatia-identity/scripts/local-stack.sh start
source /var/tmp/elsatia-stack/env.sh
node packages/elsatia-identity/scripts/studio-post-h-smoke.mjs
npx vitest run packages/elsatia-identity      # +3 e2e avec STUDIO_APP_URL, E2E_SIGNING_KEYS, E2E_CRON_SECRET
(cd apps/studio && npm test && npm run typecheck && npm run lint && npm run build)
(cd workers/studio-video && STUDIO_FFMPEG_PATH=/usr/bin/ffmpeg STUDIO_FFPROBE_PATH=/usr/bin/ffprobe \
   STUDIO_ANALYSIS_PYTHON=<python avec analysis/requirements.txt> npx vitest run)
packages/elsatia-identity/scripts/local-stack.sh stop
```

## 12. Aucun déploiement

Aucun Supabase distant, aucun Vercel, aucune Production. Toutes les exécutions : PostgreSQL 16 local,
GoTrue/PostgREST locaux (`127.0.0.1`), `next start` local.

## 13. Risques résiduels (acceptés, documentés)

| # | Point | Portée |
|---|---|---|
| R1 | URL signée d'un export partagé valable ≤ 60 s après révocation | fenêtre bornée, déjà délivrée |
| R2 | Vignette en cache navigateur privé ≤ 600 s après perte d'accès | l'utilisateur les avait déjà vues |
| R3 | Lien d'invitation (secret) affiché une fois dans l'URL de la page Membres quand aucun fournisseur d'e-mail n'est posé | `Referrer-Policy: no-referrer` ; historique du navigateur de l'administrateur |
| R4 | Garde CI : la chaîne dédiée n'est prouvée que par `dedicated-db-check.sh` (pas de job CI dédié) | recommandation D6 de la fondation, inchangée |

## 14. Décisions requises (aucune valeur inventée)

| Code | Décision |
|---|---|
| `DECISION_REQUIRED:STUDIO-INVITATION-RETENTION` | durée de conservation des invitations closes (e-mails de tiers) dans les espaces vivants |
| `DECISION_REQUIRED:STUDIO-MAIL-SUBPROCESSOR` | Resend (ou autre) comme sous-traitant des e-mails d'invitation ; mentions légales |
| `DECISION_REQUIRED:STUDIO-SHARED-CONTENT-ERASURE` | sort des Brand Kits, liens et invitations créés par une personne effacée dans l'espace d'autrui (même règle que les projets/médias de la fondation) |
| `DECISION_REQUIRED:STUDIO-SHARE-READONLY` | liens publics conservés quand le droit Studio est retiré mais le compte actif (choix actuel : conservés, révocables) |
| `LEGAL REVIEW REQUIRED` | textes `/legal/*` (gabarits), droits sur la musique importée |

---

## Annexe A — inventaire fichier par fichier

| Fichier (diff `214d47fd..634651a0`) | Git | Classe | Décision |
|---|---|---|---|
| `apps/studio/.env.example` | M | CONFLICT | version de la base conservée |
| `apps/studio/README.md` | M | REUSABLE | section post-H réécrite (sans hook Auth ni `/auth/recovery`) |
| `apps/studio/playwright.config.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/postcss.config.mjs` | A | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/scripts/e2e-gate.mjs` | M | CONFLICT | version de la base conservée (hunks post-H : `/auth/recovery`, contrôle post-H écarté) |
| `apps/studio/scripts/local-test.mjs` | M | CONFLICT | version de la base conservée (hunks post-H : `/auth/recovery`, contrôle post-H écarté) |
| `apps/studio/scripts/post-h-migration-check.mjs` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260920010000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260920030000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260920050000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260920070000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260921010000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260921030000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/rollback-post-h/20260921050000.sql` | A | DISCARD | contrôle de montée H→post-H sur les anciens horodatages du train partagé ; aucune donnée H hébergée |
| `apps/studio/scripts/runtime-check.mjs` | M | CONFLICT | conflits résolus côté base ; reste du diff post-H appliqué |
| `apps/studio/scripts/storage-reconcile.mjs` | M | CONFLICT | fusion 3-voies : RPC bornées de la base + garde d'hôte distant post-H |
| `apps/studio/scripts/studio-supabase-check.mjs` | A | SUPERSEDED | remplacé par `scripts/verify-migration-targets.mjs` |
| `apps/studio/src/app/actions.ts` | M | CONFLICT | port manuel : marque + invitations sous `canWrite`/`requireWritableStudioUser` ; reset/suppression/porte d'inscription écartés |
| `apps/studio/src/app/api/media/[...path]/route.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/src/app/api/projects/[[...path]]/route.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/api/renders/[projectId]/route.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/api/timelines/[projectId]/route.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/auth/callback/route.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/auth/confirm/route.ts` | M | DISCARD | type `recovery` → `/reset-password` ; version de la base conservée |
| `apps/studio/src/app/auth/recovery/route.ts` | A | DISCARD | mot de passe local (interdit en Preview/Production) |
| `apps/studio/src/app/brand-kit/page.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/dashboard/loading.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/dashboard/page.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/error.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/forgot-password/page.tsx` | A | DISCARD | mot de passe local (interdit en Preview/Production) |
| `apps/studio/src/app/globals.css` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/src/app/invitations/[token]/page.tsx` | A | REUSABLE | adapté : « Se connecter avec mon compte ELSATIA » (plus de lien d'inscription) |
| `apps/studio/src/app/layout.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/legal/[doc]/page.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/login/page.tsx` | M | CONFLICT | version de la base conservée (hunks post-H = parcours mot de passe/inscription) |
| `apps/studio/src/app/not-found.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/projects/[projectId]/page.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/reset-password/page.tsx` | A | DISCARD | mot de passe local (interdit en Preview/Production) |
| `apps/studio/src/app/s/[token]/media/route.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/s/[token]/page.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/settings/loading.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/app/settings/members/page.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/app/settings/page.tsx` | M | CONFLICT | usage conservé ; bloc « supprimer mon compte » remplacé par le renvoi vers ELSATIA |
| `apps/studio/src/app/signup/page.tsx` | M | CONFLICT | version de la base conservée (hunks post-H = parcours mot de passe/inscription) |
| `apps/studio/src/components/LegalLinks.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/components/MediaLibrary.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/MusicPanel.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/components/Notice.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/RenderPanel.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/SharedVideo.tsx` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/components/Shell.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/TemplateGallery.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/TimelineEditor.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/components/VideoEditor.tsx` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/instrumentation.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/account-deletion.ts` | A | DISCARD | suppression de compte initiée par Studio (mot de passe) ; compte géré par ELSATIA |
| `apps/studio/src/lib/brand-kit.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/config.ts` | M | SUPERSEDED | `studioEnabled` existe déjà dans `@elsatia/studio-domain` |
| `apps/studio/src/lib/database.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/src/lib/editor-autosave.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/lib/entitlement.ts` | A | DISCARD | inscription publique / récupération de mot de passe |
| `apps/studio/src/lib/invitations.ts` | A | REUSABLE | adapté : garde d'écriture (invitation, acceptation) ; `hasPendingInvitation` retiré |
| `apps/studio/src/lib/legal.ts` | A | REUSABLE | adapté : droits RGPD via ELSATIA (plus de suppression dans Paramètres) |
| `apps/studio/src/lib/mailer.ts` | A | REUSABLE | adapté : `STUDIO_RESEND_API_KEY` (clé propre à Studio, manifeste) |
| `apps/studio/src/lib/media-inspection.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/lib/media-service.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/src/lib/notices.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/observability.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/projects.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `apps/studio/src/lib/render-labels.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/render-refusal.ts` | A | REUSABLE | nouveau, repris tel quel |
| `apps/studio/src/lib/renders.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/lib/shares.ts` | A | REUSABLE | adapté : révocation sans garde d'écriture applicative (admise en lecture seule, bornée en base) |
| `apps/studio/src/lib/signup-gate.ts` | A | DISCARD | inscription publique / récupération de mot de passe |
| `apps/studio/src/lib/timelines.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/src/proxy.ts` | M | CONFLICT | kill-switch de la base conservé ; cache privé des miniatures porté |
| `apps/studio/supabase/config.toml` | A | SUPERSEDED | config dédiée de la base conservée |
| `apps/studio/supabase/migrations/20260912120000_studio_workspace_foundation.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260912140000_studio_media_upload.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260912160000_studio_project_management.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260912230000_studio_timeline.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260913010000_studio_render_engine.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260913020000_studio_templates.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260913030000_studio_editor_transactions.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260913040000_studio_media_analysis.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260920010000_studio_render_admission.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260920030000_studio_export_profiles.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260920050000_studio_brand_kit.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260920070000_studio_shares_watermark.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260921010000_studio_audio_music.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260921030000_studio_invitations.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260921050000_studio_account_deletion.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/migrations/20260921070000_studio_signup_policy.sql` | A | SUPERSEDED | lien symbolique vers la racine ; la base porte des copies réelles, les post-H sont réécrites (202609291…) |
| `apps/studio/supabase/templates/confirmation.html` | A | DISCARD | gabarits e-mail confirmation/récupération de mot de passe GoTrue |
| `apps/studio/supabase/templates/recovery.html` | A | DISCARD | gabarits e-mail confirmation/récupération de mot de passe GoTrue |
| `apps/studio/tests/acceptance-real.spec.ts` | A | TEST | nouveau, repris tel quel |
| `apps/studio/tests/acceptance.spec.ts` | A | TEST | nouveau, repris tel quel |
| `apps/studio/tests/account.spec.ts` | A | DISCARD | suppression de compte initiée par Studio (mot de passe) ; compte géré par ELSATIA |
| `apps/studio/tests/admission.test.ts` | A | TEST | bloc kill-switch retiré (couvert par la base) |
| `apps/studio/tests/analysis.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/auth-recovery.spec.ts` | A | DISCARD | inscription publique / récupération de mot de passe |
| `apps/studio/tests/editor.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/editor.test.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/foundation.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/media-fixtures.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/media.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/media.test.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/observability.test.ts` | A | TEST | nouveau, repris tel quel |
| `apps/studio/tests/projects.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/render-labels.test.ts` | A | TEST | nouveau, repris tel quel |
| `apps/studio/tests/render.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/signup-gate.test.ts` | A | DISCARD | inscription publique / récupération de mot de passe |
| `apps/studio/tests/templates.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/tests/text.test.ts` | A | TEST | nouveau, repris tel quel |
| `apps/studio/tests/timeline.spec.ts` | M | TEST | repris tel quel (fichier inchangé dans la base depuis H) |
| `apps/studio/vitest.config.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `docs/qualification/ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_FINALISATION_MASTER_LEDGER.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_FINALISATION_REPORT_V2.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_FINALISATION_STARTUP_REPORT.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_HEIC_HEVC_STRATEGY.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_NIGHT_LOTS_REPORT.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_OVERNIGHT_FINALISATION_REPORT.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_PREVIEW_PRODUCTION_CHECKLISTS.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_REAL_SOURCE_ACCEPTANCE.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `docs/qualification/ELSATIA_STUDIO_SUPABASE_DEDICATED_RUNBOOK.md` | A | DOC | non importé : rapports de l'ère projet partagé / hook Auth ; référencés par commit (`634651a0`) |
| `packages/studio-domain/src/analysis.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `packages/studio-domain/src/brand.ts` | A | REUSABLE | nouveau, repris tel quel |
| `packages/studio-domain/src/editor.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `packages/studio-domain/src/index.ts` | M | REUSABLE | fusion 3-voies automatique sans conflit |
| `packages/studio-domain/src/media.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `packages/studio-domain/src/presentation.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `packages/studio-domain/src/render.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `packages/studio-domain/src/templates.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `packages/studio-domain/src/timeline.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `supabase/migrations/20260920010000_studio_render_admission.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260920030000_studio_export_profiles.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260920050000_studio_brand_kit.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260920070000_studio_shares_watermark.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260921010000_studio_audio_music.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260921030000_studio_invitations.sql` | A | MIGRATION | **jamais à la racine** ; réécrite en `apps/studio/supabase/migrations/202609291…` |
| `supabase/migrations/20260921050000_studio_account_deletion.sql` | A | MIGRATION | **non portée** (suppression initiée par Studio) : remplacée par la fondation RGPD 20260928110000 + 20260929160000 |
| `supabase/migrations/20260921070000_studio_signup_policy.sql` | A | SUPERSEDED | hook Auth `before_user_created` : remplacé par 20260922000325 + admission dédiée (B + I1) |
| `supabase/tests/studio_account_deletion.test.sql` | A | DISCARD | teste la suppression post-H non portée ; couvert par studio_rgpd_erasure + studio_post_h_guard_rgpd |
| `supabase/tests/studio_audio_music.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_brand_kit.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_export_profiles.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_invitations.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_render_admission.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_shares_watermark.test.sql` | A | TEST | portée dans `apps/studio/supabase/tests/` (fixtures Storage sous `storage_maintenance`, politique ouverte dans la transaction) |
| `supabase/tests/studio_signup_policy.test.sql` | A | SUPERSEDED | version de la base conservée |
| `supabase/tests/studio_workspace_foundation.test.sql` | M | SUPERSEDED | scindée par la base (`studio_workspace_foundation_dedicated.test.sql`) |
| `workers/studio-video/src/reconcile.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `workers/studio-video/src/render.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `workers/studio-video/src/text-layout.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `workers/studio-video/src/timeouts.ts` | A | REUSABLE | nouveau, repris tel quel |
| `workers/studio-video/src/worker.ts` | M | REUSABLE | repris tel quel (fichier inchangé dans la base depuis H) |
| `workers/studio-video/tests/render.test.ts` | M | TEST | fusion 3-voies automatique sans conflit |
| `workers/studio-video/tests/timeouts.test.ts` | A | TEST | nouveau, repris tel quel |
