# ELSATIA Studio — port de la fondation dédiée sur le train V3 & préparation hébergée V1

Date : 2026-09-27 · Branche : `claude/kind-mendel-wmcqt3` · Base : `integration/elsatia-canonical-train-v3`
@ `ef7443c` · Source comparée : `claude/sweet-lovelace-jsjh31` @ `11efe66` (fondation « B + I1 »,
`docs/qualification/ELSATIA_STUDIO_DEDICATED_IDENTITY_FOUNDATION_V1.md`).

**Aucun déploiement.** Aucun Vercel, aucun projet Supabase distant créé, lié ou interrogé, aucune
Production. Tout est prouvé localement : PostgreSQL 16, GoTrue **v2.192.0** compilé depuis les
sources, PostgREST v12.2.3, application Studio réelle (`next build` + `next start`).
**Studio reste EXCLU de la première Preview** : les variables de la GP Preview restent vides et
`STUDIO_ACCESS_MODE=closed` (fail-closed) ; la seule pièce qui entre dans le train Preview est la
migration d'identité centrale, **inerte** tant qu'aucun passage n'a eu lieu (§4.3).

## Verdict

```
STUDIO V3 FOUNDATION LOCALLY QUALIFIED
```

- Le port est **propre** : les deux commits qualifiés rejoués sur V3, deux conflits textuels
  résolus par union, aucun code POC réintroduit en Production.
- **Identité : 69/69 tests, trois exécutions consécutives.** Ce total comprend 29 tests contre les
  vrais GoTrue/PostgREST/PostgreSQL et 3 tests e2e contre l'application Studio construite ; la base
  Studio reçoit désormais la **chaîne dédiée complète** (métier + identité + admission).
- **Projet dédié seul : 11 migrations, 409 assertions pgTAP.** Les 11 migrations s'appliquent sur
  une base vierge sans aucune table GP.
- **Aucune régression.** GP : 1898 tests passent, 32 ignorés (les 32 tests réels/e2e, qui
  exigent la pile). Studio : 281/281. Typecheck, lint et builds de production OK.
- **Deux défauts trouvés en portant, corrigés et testés (§5.3, §9) :**
  - La politique d'inscription héritée (`closed`) aurait **bloqué le premier espace** de tout
    compte provisionné par le pont.
  - La lecture seule **ne couvrait pas** 9 chemins d'écriture sur 23.

---

## 1. Base

| | Commit | Remarque |
|---|---|---|
| Train V3 (base) | `ef7443c` | 340 migrations, dernière `20260926000505` |
| Fondation Studio | `a7a5a0d` + `11efe66` | branche partie du train V1 (`1c1fed6`) ; 31 commits V3 absents de la branche |
| Déjà présents dans V3 (non reportés) | — | dossier de décision, page propriétaire, *decision record*, POC (`docs/architecture/poc/…`) |

Branche de travail recréée sur V3 (elle ne portait que `main`).

## 2. Port

| Commit | Contenu | Résultat |
|---|---|---|
| `1d96d5a` | `git cherry-pick` de `a7a5a0d` + `11efe66` | propre, sauf `.env.example` et `src/lib/supabase/proxy.ts` (listes V3 ↔ identité) : **union** des deux côtés |
| `496641b` | alignement sur les gardes V3 | voir ci-dessous |
| `701f60c` | chaîne du projet dédié + garde de cibles | §4-5 |
| `ab126e2` | mode mot de passe interdit en Preview/Production + lecture seule complète | §6, §9 |

Ajustements imposés par V3 (sans changer le comportement qualifié) :

1. **Horodatage.** `20260926000347_elsatia_identity_broker.sql` → **`20260927100000_…`**.
   L'ancien numéro précédait la dernière migration V3 (`…000505`) : un `supabase db push` vers une
   base qui a déjà `…000505` l'aurait refusée comme hors ordre (ou exigé `--include-all`).
   Contenu inchangé. Pile locale et README du POC mis à jour.
2. **Manifeste d'environnement** (`config/env-manifest.json`) :
   - 14 variables déclarées : GP émetteur, Studio vérificateur ; 3 secrets.
   - `ELSATIA_APPLICATION_ENV` est désormais lue aussi par Studio.
   - Les codes d'erreur du contrat sont ignorés comme littéraux.
   - Les harnais de test exclus avec justification.
   - Gabarits `.env` complétés, avec des valeurs Preview vides.
   - Avancement noté sur `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`.
3. **`STUDIO_AUTH_SERVICE_KEY`.** C'est la **même** clé `service_role` du projet Studio que
   `STUDIO_STORAGE_SERVICE_KEY` ; elle est donc rattachée au constat existant
   `F-STUDIO-SERVICE-KEY-NAME` (nom non canonique).
4. **Attendus du train Preview** régénérés par l'outil officiel (`npm run sync:train-expectations`) :
   341 migrations, dernière `20260927100000`.
5. **CI Studio** (`.github/workflows/studio-foundation.yml`) :
   - elle se déclenche aussi sur `packages/elsatia-identity/**` ;
   - elle exécute la garde de cibles et ses tests.

## 3. Classification

| Classe | Fichiers |
|---|---|
| **PRODUCTION** | `packages/elsatia-identity/src/*` (contrat, JWS ES256, trousseau/rotation, émetteur, vérificateur, JWKS distant, broker Studio, outbox, adaptateurs Supabase), `package.json` · `packages/elsatia-identity/scripts/keygen.mjs` (outil d'exploitation : génération/rotation de clé) |
| **PRODUCTION — GP** | `src/app/identity/studio/handoff/route.ts`, `src/app/api/elsatia-identity/jwks/route.ts`, `src/app/api/cron/elsatia-identity/route.ts`, `src/lib/elsatia-identity/config.ts`, `src/app/actions/auth.ts` + `src/app/login/page.tsx` (retour `next=/identity/…` seul), `src/lib/security/headers.ts` (CSP `form-action` ciblée), `src/proxy.ts`, `src/lib/supabase/proxy.ts`, `tsconfig.json`, `supabase/migrations/20260927100000_elsatia_identity_broker.sql` |
| **PRODUCTION — Studio** | `apps/studio/src/app/auth/elsatia/{start,exchange,signout}`, `apps/studio/src/app/api/elsatia/{lifecycle,reconcile}`, `src/lib/identity{,-policy,-session}.ts`, login/signup/actions, `workspaces.ts`, `media-service.ts`, `projects.ts`, route média, `database.ts`, `globals.css`, `next.config.ts`, `tsconfig.json`, `package.json`/lock, `supabase/config.toml`, `supabase/migrations/*` (11), `supabase/migration-targets.json`, `scripts/verify-identity-mode.mjs` (prebuild) |
| **PRODUCTION — gardes de livraison** | `scripts/verify-migration-targets.mjs` (branchée sur `npm run verify:migrations`), manifeste et gabarits `.env*` |
| **TEST_HARNESS** | `packages/elsatia-identity/tests/*` (mémoire, réel, e2e), `packages/elsatia-identity/scripts/{local-stack.sh, gateway.mjs, smtp-sink.mjs}`, `src/lib/elsatia-identity/config.test.ts`, `apps/studio/tests/{identity,identity-guard,read-only-policy,boundaries,…}.test.ts`, `apps/studio/supabase/tests/*`, `apps/studio/scripts/dedicated-db-check.sh`, `apps/studio/scripts/local-test.mjs` (pose `STUDIO_IDENTITY_MODE=local`), `scripts/verify-migration-targets.test.mjs`, `vitest.config.ts` |
| **POC_ONLY** | `docs/architecture/poc/studio-dedicated-identity-exchange/*.mjs` — déjà dans V3, **importé par aucune application** (vérifié par recherche), marqué « remplacé ». Non étendu, non porté en Production. |
| **DOC_ONLY** | ce rapport, `ELSATIA_STUDIO_DEDICATED_IDENTITY_FOUNDATION_V1.md` (rapport historique, référence l'ancien horodatage), README du POC |

## 4. Base Studio : deux cibles, jamais croisées

### 4.1 Cibles

| Cible | Dossier | Commande (au moment de la mise en service) |
|---|---|---|
| **Supabase central** (partagé : GP, Colors, Tools, Réserves, identité ELSATIA) | `supabase/migrations` (341) | `supabase db push` depuis la racine, projet GP lié |
| **Supabase Studio dédié** | `apps/studio/supabase/migrations` (11) | `supabase db push --workdir apps/studio`, projet Studio lié **dans ce workdir** |

Destinées au **central** : `20260927100000_elsatia_identity_broker.sql`, avec sujets, outbox et
trigger sur `auth.users`. S'y ajoutent les 9 migrations Studio historiques, gelées (§5).

Destinées au **Studio dédié** : 9 copies gelées + `20260926120000_studio_identity_foundation.sql`
+ `20260927110000_studio_dedicated_admission.sql`.

### 4.2 Garde : aucune migration Studio dédiée ne part sur le projet GP

`apps/studio/supabase/migration-targets.json` classe chaque fichier Studio (copie gelée /
dédiée). `scripts/verify-migration-targets.mjs` fait partie de `npm run verify:migrations` et de la
CI Studio. Invariants :

| Code | Règle | Test négatif |
|---|---|---|
| T1 | chaque migration Studio est classée une fois, et existe | ✔ |
| T2 | copie gelée = source racine, octet pour octet | ✔ |
| T3 | **aucune nouvelle migration Studio à la racine** (elle partirait sur le projet partagé) | ✔ |
| T4 | **une migration dédiée n'existe pas à la racine** | ✔ (copie simulée → T3+T4+T5) |
| T5 | aucune migration racine ne touche `studio_identity` | ✔ |
| T6 | aucune migration Studio ne touche un objet du projet partagé (`elsatia_identity_*`, `entreprises`, …) | ✔ |
| T7 | `project_id` distincts (`btp-platform` ≠ `elsatia-studio`) | ✔ |
| T8 | noms et horodatages Studio valides/uniques | — |

Côté hébergé, le lien CLI est par workdir (`supabase/.temp/project-ref`). La checklist (§10)
exige deux liens distincts et une vérification du *ref* avant tout `db push`.

### 4.3 Effet sur la première Preview (Studio exclu)

La seule migration nouvelle du train Preview est l'identité centrale. Elle est **inerte**, pour
trois raisons :

- le trigger n'écrit que pour les comptes présents dans `elsatia_identity_subjects` ;
- cette table n'est alimentée que par un passage, et `STUDIO_ACCESS_MODE=closed` les refuse tous ;
- les tables sont fermées (RLS sans policy, aucun privilège client, RPC `service_role`).

Le train complet (341 migrations) a été rejoué sur une base vierge (`rebuild_db.sh`) : OK.

## 5. Migrations métier Studio

### 5.1 Inventaire exact (les « 9 »)

| # | Migration (racine, train V3) | Objets | Dépendances externes |
|---|---|---|---|
| 1 | `20260912120000_studio_workspace_foundation` | espaces, membres, rôles | `auth.users` |
| 2 | `20260912140000_studio_media_upload` | projets, médias, limites, bucket `studio-originals` | `auth.users`, `storage.*` |
| 3 | `20260912160000_studio_project_management` | cycle de vie, duplication, couverture, ordre | `storage.objects` |
| 4 | `20260912230000_studio_timeline` | timelines, clips | `auth.users` |
| 5 | `20260913010000_studio_render_engine` | rendus, outbox, bucket `studio-renders` | `auth.users`, `storage.*` |
| 6 | `20260913020000_studio_templates` | validation de présentation | `storage.objects` |
| 7 | `20260913030000_studio_editor_transactions` | sauvegarde éditeur | — |
| 8 | `20260913040000_studio_media_analysis` | analyse IA | `auth.users` |
| 9 | `20260922000325_studio_signup_policy` | politique d'inscription (table + garde dans `studio_create_workspace`) | `auth.users` |

Aucune ne référence un objet GP. Ce ne sont pas les 7 migrations du **lot post-H**
(`fix/studio-signup-closed-v1` @ `634651a0` : `render_admission`, `export_profiles`,
`brand_kit`, `shares_watermark`, `audio_music`, `invitations`, `account_deletion`, avec ~61
fichiers `apps/studio`). Ce lot n'est dans aucun train et reste hors périmètre (§13).

### 5.2 Plan de port

| Étape | État |
|---|---|
| P1 Copier les 9 dans `apps/studio/supabase/migrations`, **mêmes horodatages** (historique identique à la racine) | **fait** |
| P2 Geler les 9 à la racine (T2/T3) | **fait** |
| P3 Scinder `studio_workspace_foundation.test.sql` (1 assertion de coexistence GP) | **fait** : `apps/studio/supabase/tests/studio_workspace_foundation_dedicated.test.sql` |
| P4 Rejouer la chaîne dédiée seule + pgTAP (substitut du 2ᵉ `db reset` de CI) | **fait** : `apps/studio/scripts/dedicated-db-check.sh` |
| P5 Adapter l'admission au pont (§5.3) | **fait** |
| P6 Retirer les 9 du train **partagé** | **non fait — décision propriétaire** (ci-dessous) |
| P7 Lot post-H → `apps/studio/supabase` (après ses propres corrections, notamment la suppression de compte, §8) | à planifier |

**Pourquoi geler plutôt que retirer (P6).** La Preview Supabase existante `pgvvpqyjziyapbbkydmc`
porte l'ancienne lignée et son historique distant n'est pas relevé
(`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`). Si ces versions y sont déjà appliquées, les
supprimer du dépôt ferait échouer `db push` (« remote migration versions not found locally »).

Tant qu'elles restent, le projet partagé porte des tables Studio **vides et mortes** : aucun
code Studio ne pointe vers lui. Les retirer suppose de relever l'historique, puis de
`supabase migration repair --status reverted` et de supprimer les objets sur les projets
partagés. C'est une décision **propriétaire**, à prendre avant la Production.

### 5.3 Défaut trouvé et corrigé : admission au premier espace

Les deux défauts ci-dessous sont corrigés par la nouvelle migration **dédiée**
`20260927110000_studio_dedicated_admission.sql`.

- **Premier espace bloqué.** Sur le projet dédié, la migration 9 laisse `studio_signup_policy` à
  `closed` : `studio_create_workspace` aurait refusé (« Inscription fermée ») le **premier espace**
  de tout compte provisionné par le pont, alors que la plateforme lui a accordé le droit.
  L'e2e de la fondation ne le voyait pas, faute de tables métier dans la base Studio.
- **Lecture seule contournable.** Un compte lié mais **en lecture seule** pouvait créer un espace
  par RPC directe.

La correction : `studio_identity_caller_access()` (interne, non exposée) donne
`full | read_only | blocked | unlinked`, et `studio_create_workspace` l'applique :

| Appelant | Décision |
|---|---|
| lié par le pont, compte central actif, droit accordé | **admis** (malgré `closed`) |
| lié, droit retiré | refus `42501` « Accès Studio en lecture seule » |
| lié, compte désactivé/supprimé | refus `42501` |
| non lié (instances jetables en mode `local`) | politique héritée **inchangée** (fail-closed) |

Prouvé deux fois : sur PostgreSQL seul (pgTAP, 10 assertions) et sur GoTrue + PostgREST réels
(5 tests). Parmi eux : l'inscription publique est refusée par GoTrue Studio, et la fonction
d'accès n'est pas appelable par `authenticated`.

## 6. Auth

| Exigence | Mise en œuvre | Preuve |
|---|---|---|
| **Signup Studio : closed** | GoTrue Studio `enable_signup=false` (config.toml) ; `/signup` → `/login` ; action `signup()` → `/login` ; utilisateurs créés **uniquement** par la clé service du pont ; `studio_create_workspace` admet par le pont, pas par l'inscription | e2e (redirection), réel (`signUp` refusé), pgTAP |
| **Login : « Continuer avec mon compte ELSATIA »** | page `/login` en mode `elsatia` : bouton seul, **aucun champ mot de passe** ; action `login()` → `/auth/elsatia/start` | e2e (`not.toContain('type="password"')`) |
| **Local password mode interdit en Preview/Production** | **nouveau** : `identityMode()` ignore `local` dès que `ELSATIA_APPLICATION_ENV` ou `VERCEL_ENV` vaut `preview`/`production` (fail-closed vers le pont) ; **garde de build** `apps/studio/scripts/verify-identity-mode.mjs` dans le `prebuild` (échec du build) ; manifeste : `STUDIO_IDENTITY_MODE` attendu `elsatia` en preview/production | `apps/studio/tests/identity.test.ts` (5 environnements refusés, 4 admis, casse et espaces) ; exécution manuelle du prebuild (`VERCEL_ENV=preview` → code 1) |

Le préflight du manifeste ne vérifie que les drapeaux booléens. C'est pourquoi l'interdiction
est portée par le code et par le prebuild, pas par le préflight.

## 7. Révocation (conservée à l'identique)

Toutes les propriétés qualifiées sont conservées et rejouées sur V3 (tests réels, ×3) :

- **Événement signé.** `elsatia-lifecycle+jwt` ES256, porteur de l'état, `seq` croissante,
  `jti` dédoublonné.
- **Ban.** Ban GoTrue Studio, avec `ban_desired` et `ban_confirmed`.
- **Suppression des sessions.** Dans la **même transaction** que le changement d'état
  (`studio_identity_apply_lifecycle`). Ensuite : `GET /user` renvoie 403, le refresh 400.
- **Réconciliation.**
  - GP : `elsatia_identity_resync`, qui réémet les états divergents.
  - Studio : `POST /api/elsatia/reconcile`, qui rejoue les bans non confirmés et purge les `jti`
    et sessions orphelines.
- **Réessais.** Outbox avec recul exponentiel (15 s → 1 h), marquée morte après 30 essais.
  Borne ultime : revalidation après 12 h, refus après 24 h.

Propagation mesurée < 5 s en local. L'e2e le montre sur l'application réelle : une page protégée
répond 200, puis, après le webhook, **307 vers /login**.

## 8. RGPD : liaison avec la purge centrale (conception)

Constat V3 : la purge centrale est **par entreprise** (planificateur `RGPD_PURGE_PLANIFICATEUR_MODE`,
désactivé sans décision écrite). Aucun code GP ne supprime aujourd'hui `auth.users`. Le compte
ELSATIA est « supprimé » quand la ligne `auth.users` est supprimée ou reçoit `deleted_at`, par le
tableau de bord, l'API admin ou un futur flux RGPD. Le trigger central couvre **tous** ces
chemins.

```
central account deleted (auth.users DELETE / deleted_at)
  → trigger elsatia_identity_on_auth_user_change → outbox « deleted » (même transaction)
  → webhook signé → Studio : subject_state = deleted, sessions supprimées, ban      [FAIT, prouvé]
  → Studio blocked : tout passage refusé, toute requête → /login                      [FAIT, prouvé]
  → Studio business data purge/anonymization                                          [À CONSTRUIRE]
```

Conception de la dernière étape, **sans durée légale inventée** :

1. **Déclencheur.** L'état `deleted` appliqué ouvre une demande d'effacement Studio. Table
   `studio_identity.erasure_requests(subject, user_id, opened_at, status, decision_ref)`, créée
   dans la même transaction que `apply_lifecycle`. Elle est idempotente par sujet.
2. **Exécution gardée comme la purge centrale.** Mode `off | dry-run | execute` : `off` par
   défaut, et `execute` exige une référence de décision propriétaire écrite (même contrat que
   `RGPD_PURGE_DECISION_REF`). **Le délai de conservation n'est pas fixé ici.** Il vient de la
   décision juridique : `LEGAL_DECISION_REQUIRED`. Sans lui, rien ne s'exécute (fail-closed).
3. **Portée.**
   - **Espaces dont l'utilisateur est seul propriétaire** : suppression des projets, timelines,
     rendus, analyses et métadonnées médias, **et** des objets Storage `studio-originals` et
     `studio-renders`. Il faut supprimer les fichiers, pas seulement les déréférencer : c'est le
     défaut constaté côté GP pour l'anonymisation salarié.
   - **Espaces partagés** : retrait de l'adhésion. Si l'utilisateur est propriétaire, transfert
     à un administrateur existant, sinon archivage. Décision produit.
4. **Fin.**
   - Suppression de l'utilisateur **Auth Studio** (`deleteUser` sur le **seul** projet Studio :
     sûr en B, il ne touche pas le compte ELSATIA).
   - La FK `on delete restrict` impose l'ordre : données d'abord.
   - `links` et `sessions` suivent en cascade.
   - `subject_state` est conservé (sujet opaque, état `deleted`) pour refuser tout jeton tardif.
5. **Côté central.** `elsatia_identity_subjects` conserve (user_id, sujet) après suppression,
   pour pouvoir réémettre « deleted ». Il faut une règle de fin : effacement quand Studio a
   confirmé l'effacement (accusé de réception à ajouter au contrat v1 : `reason=erasure_done`).
   Pas de délai inventé.
6. **Export.** L'export « mes données » de GP ne couvre pas Studio. Il faudra un export Studio
   dédié (droit d'accès), hors de ce lot.

Le **lot post-H** `studio_account_deletion` ne peut pas être porté tel quel. Il est déclenché par
l'utilisateur Studio, pas par le compte central. Il doit être réécrit sur ce modèle.

## 9. Lecture seule

### 9.1 Inventaire des écritures Studio

Base (chaîne dédiée) : `authenticated` n'a **aucun** privilège INSERT/UPDATE/DELETE de table, et
Storage est `server_only` pour les clients. **Toutes les écritures passent par 22 RPC** volatiles
exécutables par `authenticated`, plus 2 écritures serveur (URL d'upload signée, statut d'échec),
précédées d'une autorisation projet.

| Domaine | Écritures | Garde **avant** ce lot | Garde **après** |
|---|---|---|---|
| Espaces (Server Actions) | `studio_create_workspace` (onboarding, pro), `studio_rename_workspace`, `studio_archive_workspace`, `studio_set_member` | **aucune** | `requireWritableStudioUser()` / `canWrite(user.access)` + base (création) |
| Projets | `studio_create_project` (route média), `studio_save_project` (création) | **aucune** | `writableContext()` |
| | `studio_save_project` (édition), `studio_set_project_cover`, `studio_remove_project_media`, `studio_order_project_media` | `authorizeProject(id, true)` | inchangé |
| | `studio_project_lifecycle` (archiver/restaurer/supprimer), `studio_duplicate_project` | **aucune** (`authorizeProject(id)`) | `authorizeProject(id, true)` |
| Médias | `studio_reserve_media`, URL d'upload signée, `studio_finish_media` (service), `studio_delete_media`, statut d'échec | `authorize*(…, true)` | inchangé |
| Timelines/éditeur | `studio_save_timeline`, `studio_activate_timeline`, `studio_delete_timeline`, `studio_save_editor` | `authorizeProject(id, true)` | inchangé |
| Rendus | `studio_request_render`, `studio_request_editor_render`, `studio_cancel_render` | `authorizeProject(id, true)` | inchangé |
| Analyse | `studio_request_analysis`, `studio_cancel_analysis` | `authorizeProject(id, true)` | inchangé |

Cela fait **9 chemins non protégés sur 23**, et ils sont désormais tous gardés.

### 9.2 Politique

- **Une seule règle.** Écriture ⇔ `access = "full"`, soit compte central actif + droit Studio
  accordé. Sinon, lecture seule : lecture conservée, **jamais de suppression de données** pour
  retrait de droit.
- **Une seule garde applicative** :
  - `assertWritable` / `writableContext` pour l'API ;
  - `requireWritableStudioUser` / `canWrite` pour les Server Actions ;
  - message stable `READ_ONLY_MESSAGE`, HTTP **403**.
- **Garde statique** `apps/studio/tests/read-only-policy.test.ts` :
  - toute RPC appelée doit être classée lecture ou écriture ;
  - toute écriture doit être précédée d'une garde dans la même fonction.
  - Vérifié par mutation : retirer une garde fait échouer le test.
- **Défense en profondeur base.** Déjà en place pour la création d'espace (§5.3). **Étape
  suivante recommandée** : une migration dédiée ajoutant
  `if public.studio_identity_caller_access() in ('read_only','blocked') then raise …` en tête des
  21 autres RPC de §9.1. C'est mécanique (même fonction, même message), mais cela réécrit 21
  corps de fonctions qualifiés par leurs suites pgTAP. Ce lot ne le fait pas, pour ne pas modifier
  du code métier non requalifié. La couche applicative couvre tout chemin passant par l'app ; un
  appel PostgREST direct en lecture seule reste possible jusque-là. Ce risque est borné : le
  compte est actif, et seul le droit commercial est retiré.

## 10. Checklist hébergée (à exécuter à la mise en service — rien n'est fait ici)

> Ordre : Studio **Preview** d'abord, jamais la Production en premier. Chaque case produit une
> preuve archivée (capture, sortie de commande sans secret).

### 10.1 Supabase Studio (projet)

- [ ] Créer **deux** projets dédiés : `elsatia-studio-preview` et `elsatia-studio-production`.
  Ce sont des organisations/plans à décider : la limite de 2 projets actifs de l'organisation
  actuelle est atteinte (`PREVIEW-PROJECT-INVENTORY`).
- [ ] Région UE, identique à GP (eu-west-3). PITR/sauvegardes dimensionnées pour la vidéo.
  Politique de rétention propre à Studio, découplée de la paie GP.
- [ ] `supabase link --workdir apps/studio --project-ref <studio-ref>`.
  Vérifier : `cat apps/studio/supabase/.temp/project-ref` ≠ ref GP ; `supabase/.temp/project-ref`
  **inchangé** ; `npm run verify:migrations` vert.
- [ ] Contrôle croisé avant tout push : le ref lié à la racine est celui de GP
  (`scripts/garde-scripts-production.mjs`, `verifierRefLieeCli`).

### 10.2 Auth (GoTrue Studio)

- [ ] Reporter `apps/studio/supabase/config.toml` dans le tableau de bord (ces réglages ne sont
  pas poussés par `db push`) :
  - `enable_signup=false` (e-mail **et** global), sans anonyme, sans liaison manuelle, SMS off ;
  - `jwt_expiry=600` ;
  - rotation des refresh tokens, `refresh_token_reuse_interval=10` ;
  - `minimum_password_length=12`, confirmations actives, changement d'e-mail sécurisé.
- [ ] `site_url` = origine Studio de l'environnement.
  `additional_redirect_urls` = `https://<studio>/auth/elsatia/exchange` uniquement.
- [ ] Preuve : `POST /auth/v1/signup` avec la clé publique → `422 signup_disabled`.
- [ ] SMTP Studio : expéditeur vérifié. Peu utilisé, car les liens magiques sont consommés
  côté serveur.

### 10.3 Postgres (projet Studio)

- [ ] `supabase db push --workdir apps/studio` : 11 migrations. Vérifier
  `supabase migration list --workdir apps/studio` (11 appliquées, aucune version GP).
- [ ] Le rôle de migration peut créer les RPC `SECURITY DEFINER` qui suppriment dans
  `auth.sessions` : **à vérifier sur le plan souscrit** ; échec = blocage.
- [ ] Après push :
  - aucune table non `studio_*` en `public` ;
  - schéma `studio_identity` présent ;
  - `studio_signup_policy.mode = 'closed'`.
- [ ] Ne **jamais** poser `studio_signup_policy` à `open` sur un projet hébergé : c'est réservé
  aux instances jetables.

### 10.4 Postgres (projet central / GP)

- [ ] Migration `20260927100000_elsatia_identity_broker` appliquée par le train normal. Vérifier
  que le rôle de migration peut créer un trigger sur `auth.users`. Précédent : `handle_new_user`.
- [ ] Contrôle d'inertie tant que Studio n'est pas ouvert :
  `select count(*) from elsatia_identity_subjects` = 0.

### 10.5 Storage (projet Studio)

- [ ] Buckets `studio-originals` et `studio-renders` créés par les migrations : privés, 1 Gio par
  fichier. Limite globale du projet ≥ 1 Gio.
- [ ] Policies restrictives `studio_*_server_only` présentes. Test : upload direct avec un jeton
  utilisateur → refusé.
- [ ] Sauvegarde des objets vidéo : les sauvegardes Postgres ne couvrent pas Storage. Stratégie
  à décider.

### 10.6 Worker vidéo (`workers/studio-video`)

- [ ] Hébergeur à choisir (`DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`),
  runbook `docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md`.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = **projet Studio**. `STUDIO_STORAGE_SERVICE_KEY` = clé service
  du **projet Studio** : le rayon d'impact est borné à Studio, c'est le bénéfice de B.
- [ ] Aucune variable GP dans l'environnement du worker.

### 10.7 Redis

- [ ] `STUDIO_REDIS_URL` (worker) : instance propre à l'environnement, TLS (`rediss://`), mot de
  passe, non partagée avec la Production.
- [ ] Le rate limit GP a sa propre Redis/Upstash : ne pas mutualiser sans décision.

### 10.8 Webhooks

- [ ] GP `ELSATIA_STUDIO_LIFECYCLE_URL=https://<studio>/api/elsatia/lifecycle`.
- [ ] Studio `/api/elsatia/lifecycle` : aucune authentification par secret ; c'est la **signature
  ES256** qui l'authentifie. Accessible publiquement, derrière la protection Vercel (bypass si la
  Preview est protégée).
- [ ] Webhook de base **Supabase GP** : `INSERT` sur `public.elsatia_identity_outbox` →
  `POST https://<gp>/api/cron/elsatia-identity`, avec `Authorization: Bearer <CRON_SECRET>`.
  C'est ce qui donne une latence de quelques secondes.
- [ ] Preuve : ban d'un compte de test → Studio `GET /user` 403 en < 1 min.

### 10.9 Cron / reconcile

- [ ] GP : planification de secours de `/api/cron/elsatia-identity` toutes les 5 à 15 min.
  Attention à la limite de crons du plan Vercel ; sinon, planificateur externe. La même route
  rattrape toute notification perdue.
- [ ] GP : `elsatia_identity_resync` (réémission des états divergents) dans une planification
  quotidienne.
- [ ] Studio : `POST /api/elsatia/reconcile` avec `Authorization: Bearer <STUDIO_CRON_SECRET>`,
  toutes les 15 min à 1 h (bans non confirmés, purges `jti`/sessions).
- [ ] Supervision : alerte si des lignes d'outbox sont marquées mortes (`dead_at`) ou si
  `ban_drift` persiste.

### 10.10 Secrets et variables

| Où | Variable | Nature |
|---|---|---|
| GP | `ELSATIA_IDENTITY_ISSUER` | `https://<gp>/identity`, **différent** par environnement |
| GP | `ELSATIA_IDENTITY_SIGNING_KEYS` | **SECRET** ; trousseau **propre** à chaque environnement (jamais la clé Production en Preview) |
| GP | `ELSATIA_STUDIO_EXCHANGE_URL`, `ELSATIA_STUDIO_LIFECYCLE_URL` | https Studio |
| GP | `STUDIO_ACCESS_MODE` / `STUDIO_ACCESS_ALLOWLIST` | `closed` tant que non ouvert ; allowlist pour la recette |
| GP | `CRON_SECRET` | existant |
| Studio | `ELSATIA_APPLICATION_ENV` | `preview` / `production` (**obligatoire** : active l'interdiction du mode local) |
| Studio | `STUDIO_IDENTITY_MODE` | `elsatia` (ou absent) — `local` **refusé au build** |
| Studio | `ELSATIA_IDENTITY_ISSUER` | = valeur GP du même environnement |
| Studio | `ELSATIA_IDENTITY_JWKS` **ou** `ELSATIA_IDENTITY_JWKS_URL` | public ; l'épinglé est plus robuste, l'URL plus simple à faire tourner |
| Studio | `ELSATIA_IDENTITY_HANDOFF_URL` | `https://<gp>/identity/studio/handoff` |
| Studio | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **projet Studio** |
| Studio | `STUDIO_AUTH_SERVICE_KEY` = `STUDIO_STORAGE_SERVICE_KEY` | **SECRET**, clé service **Studio** |
| Studio | `STUDIO_CRON_SECRET` | **SECRET**, distinct de `CRON_SECRET` |
| Studio | `STUDIO_LEGAL_PUBLISHED` | `1` seulement quand les conditions Studio sont publiées (sinon aucun compte provisionné) |

- [ ] `npm run preflight:env -- --environment <env> --app gestion_pro,studio` sur chaque
  environnement.
- [ ] `npm run verify:secrets` : aucun secret dans le dépôt.

### 10.11 Rotation de clés

1. `node packages/elsatia-identity/scripts/keygen.mjs --rotate <config actuelle>`. La nouvelle
   clé devient `current` ; l'ancienne devient `previous`, publiée 48 h (≤ 7 jours, sinon config
   refusée).
2. Déployer GP avec la nouvelle valeur.
3. Si le JWKS est épinglé côté Studio, mettre à jour `ELSATIA_IDENTITY_JWKS` **dans la fenêtre**.
4. Après `previous_retire_at`, retirer `previous` et redéployer GP.
5. Preuve :
   - un jeton signé par l'ancienne clé est accepté dans la fenêtre (test réel) ;
   - `GET /api/elsatia-identity/jwks` publie 2 puis 1 clé.

Compromission : rotation **sans** `previous` (coupure des passages en cours seulement ; les
sessions Studio ouvertes ne sont pas affectées).

## 11. Tests (rejoués sur ce port)

| Suite | Résultat |
|---|---|
| **Identity suite** `npx vitest run packages/elsatia-identity`, avec pile réelle + app Studio construite | **69/69, ×3 exécutions** (contrat 16, broker 21, réel 29 dont 5 nouveaux, e2e 3) |
| Projet dédié seul `apps/studio/scripts/dedicated-db-check.sh` (PG16) | 11 migrations, 0 table GP ; pgTAP : admission 10, fondation scindée 58, signup 14, analyse 45, éditeur 22, upload 40, gestion 105, rendu 45, templates 18, timeline 52 → **409 ok, 0 échec** |
| Train partagé complet `rebuild_db.sh` (PG16) | 341 migrations OK ; suites pgTAP Studio racine OK (politique `open` comme `local-test.mjs`) |
| **Studio** `npm test` / `typecheck` / `lint` / `next build` | **281/281** (dont lecture seule 2, mode 2 nouveaux) · OK · OK · OK |
| **GP identity + GP** `npx vitest run` (racine) | **1898 passed, 32 skipped** (= les 29 réels + 3 e2e sans pile), 0 échec |
| GP `tsc --noEmit` / `eslint` / `next build` | OK · 0 erreur (15 avertissements, tous hors de ce lot) · **OK** (routes `/identity/studio/handoff`, `/api/elsatia-identity/jwks`, `/api/cron/elsatia-identity` construites) |
| `verify:migrations` (+ cibles) / `test:migration-targets` / `verify:env-manifest` / `test:env-manifest` / `verify:secrets` / `verify:train-expectations` | OK · 7/7 · OK · 67/67 · aucun secret · OK |

Constat de la reprise des tests réels :
- Le port `59990` sert de port **injoignable** à deux tests de panne.
- Une passerelle de test lancée dessus les faisait échouer (faux négatif).
- La passerelle e2e utilise donc un autre port.

Reproduire :

```bash
STACK_BIN=<gotrue v2.192.0 + postgrest v12> packages/elsatia-identity/scripts/local-stack.sh start
source /var/tmp/elsatia-stack/env.sh
npx vitest run packages/elsatia-identity           # 66 ; +3 e2e avec STUDIO_APP_URL et E2E_*
apps/studio/scripts/dedicated-db-check.sh          # projet dédié seul + pgTAP
packages/elsatia-identity/scripts/local-stack.sh stop
```

## 12. No deploy

Aucun appel Vercel, aucune commande `supabase link`, `db push` ou `functions deploy`, aucune clé
réelle. Les clés utilisées ont été générées à l'exécution et jetées. `apps/studio/.env.local`
(e2e) est ignoré par git et supprimé en fin de session.

## 13. Reste à faire / décisions

| # | Sujet | Nature |
|---|---|---|
| 1 | Retirer les 9 migrations Studio du train partagé (P6) | décision propriétaire, après relevé de l'historique Preview |
| 2 | Créer les projets Studio (plan/organisation, limite de 2 projets) | décision propriétaire + checklist §10 |
| 3 | Purge/anonymisation Studio sur compte supprimé (§8) : table de demandes, exécution gardée, accusé `erasure_done` | à construire ; **durée = décision juridique** |
| 4 | Lecture seule en base sur les 21 autres RPC (§9.2) | lot suivant, mécanique |
| 5 | Lot post-H (7 migrations + ~61 fichiers) vers `apps/studio/supabase`, suppression de compte réécrite (§8) | lot suivant |
| 6 | UI de rattachement `ACCOUNT_LINK_REQUIRED` | sans objet sur un projet neuf |
| 7 | Amender `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (exception Studio) | documentaire |
| 8 | Valeur de Production de `STUDIO_ACCESS_MODE` | décision produit (équivalent de `STUDIO-SIGNUP-DEFAULT`) |
