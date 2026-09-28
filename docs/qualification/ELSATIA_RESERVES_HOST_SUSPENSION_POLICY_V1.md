# ELSATIA Réserves — Host Suspension Policy V1 (décision D-01)

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (train canonique V3, 340 migrations — le plus récent contenant Réserves) |
| Branche | `claude/relaxed-carson-way87a` |
| Migration | `20260927000506_reserves_hote_suspendu_lecture_seule_v1.sql` (train : **341**, dernière `20260927000506`) |
| Application | `apps/reserves` (Next 16.3.5, port 3020) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) |
| Navigateur | Chromium 1194 (Playwright 1.62.1), Réserves compilé (`next build` + `next start`), passerelle locale `tests/e2e/colors-pile-locale/passerelle.mjs` |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge. |

## Verdict

```
RESERVES SUSPENSION POLICY LOCALLY QUALIFIED
```

La décision D-01 — **mode lecture seule** — est appliquée **en base** : quand l'organisation
hôte perd son entitlement Réserves (suspension, suspension programmée échue, abonnement
annulé, accès applicatif retiré ou échu), l'entreprise intervenante invitée **consulte** tout
ce qu'elle voyait (réserves assignées, historique, photos, plan, échanges, document
imprimable, PDF) et **ne peut plus rien écrire**, par aucun chemin : écran, RPC, `PATCH`
direct, Storage, file hors-ligne. La règle s'applique **à la requête suivante** d'une
session déjà ouverte, et l'écriture **revient au rétablissement** sans reconnexion ni
nouvelle invitation. Aucune tentative bloquée ne laisse de trace. Chaque garantie est
prouvée **rouge sans le correctif, verte avec**.

**Pourquoi pas `BLOCKED`** : aucune porte rouge imputable au lot. Réserves pgTAP 690/690,
Playwright 66/66 (+1 cas non exécutable connu, antérieur au lot), Vitest 186/186, suite pgTAP
maximale sans régression (dette identique au train V3), DB verify Preview 18/18 contrôles
bloquants verts.

**Limite** (inchangée depuis la qualification V1, hors périmètre) : la pile locale reste une
passerelle — Storage réel (S3), GoTrue réel et e-mail ne sont pas couverts. Rien d'exécuté à
distance : la migration doit être appliquée et vérifiée sur la Preview (contrôle 18 du DB
verify, §7).

---

## 1. Base

- `git fetch origin` ; trains candidats comparés : `integration/elsatia-canonical-train-v3`
  (2026-09-27, rapport de convergence finale V3) est le plus récent et contient `apps/reserves`,
  les 7 suites pgTAP Réserves et les correctifs R-01…R-05 (`…503`). Aucun train V4 n'existe
  sur le dépôt.
- La branche de travail est repartie de ce train (elle pointait sur `main`, qui ne contient pas
  Réserves).
- Migration placée **après** `20260926000505`, dernière du train ; numéro `…506` libre sur
  toutes les branches distantes.

## 2. Constat de départ (D-01, qualification V1 §3.8)

`reserves_intervenant_courant` ne regarde pas l'état du tenant hôte : quand l'hôte était
suspendu, ses propres utilisateurs perdaient tout (`est_membre_actif`), mais l'intervenant
actif continuait d'accepter, refuser, commenter, déposer des photos, demander des levées et
rejouer sa file. **Reproduit** : sur une base au train V3 sans la migration, la nouvelle suite
pgTAP échoue sur **toutes** les assertions d'écriture (§5.1).

## 3. Politique appliquée

| Domaine | Comportement quand l'hôte est fermé |
|---|---|
| **Lecture** (intervenant) | **Inchangée** : réserves assignées, détail, historique complet, photos (URL signées), plan et repères, échanges, tableau de bord, document imprimable, **PDF**. |
| **Écriture** (intervenant) | **Refusée** : acceptation, refus de responsabilité, commentaire, dépôt de photo (réservation, dépôt Storage, confirmation), retrait de photo, demande de levée, transition différée, rejeu hors-ligne (commentaire, levée, photo), modification directe, pagination d'un plan, rattachement à une intervention en attente. |
| Curseurs de lecture | **Autorisés** : « marquer comme lu » (conversation, notifications) est de la consultation. |
| Données du tenant de l'intervenant | **Non touchées** (préférences de notification, publication annuaire). |
| Utilisateurs de l'hôte | **Règles commerciales existantes** (déjà : 0 lecture, écriture refusée) — non modifiées. |
| Facturation | **Non modifiée.** Le prédicat **lit** `entreprises.abonnement_statut`, `suspension_prevue_at` et `acces_applications_entreprises` ; il n'écrit rien. |
| Rétablissement | Automatique à la requête suivante : aucune ligne d'intervenant, d'invitation ou d'habilitation n'est modifiée par la suspension. |

**« Hôte fermé »** = même définition que les règles commerciales existantes, au niveau
tenant : `abonnement_statut ∈ {suspendu, annule}`, **ou** suspension programmée échue,
**ou** entitlement `reserves` non autorisé / hors période de validité / application inactive.

## 4. Mise en œuvre (`20260927000506`)

Deux niveaux **indépendants**, pour que la règle tienne même si l'un venait à être contourné :

1. **`reserves_acteur_courant`** — pivot de toutes les écritures de l'intervenant (vérifié :
   aucune lecture ne l'utilise ; toutes passent par `reserves_lecture_autorisee` /
   `reserves_intervenant_courant`, **non modifiés**). Corps V1 inchangé, plus une condition
   sur la branche intervenant : si l'hôte est fermé, **exception** `42501`
   « Organisation hôte suspendue : cette réserve est en lecture seule. », indice stable
   `RESERVES_HOTE_SUSPENDU`. Couvre les 8 RPC d'écriture de l'intervenant **et** la policy
   d'écriture Storage (`reserves_storage_photo_autorisee(…, true)`).
   Exception plutôt que `NULL` : un `NULL` produirait « non autorisé », indiscernable d'une
   révocation, alors que les droits de l'intervenant sont intacts, seulement suspendus.
2. **Trigger `reserves_garde_hote_suspendu`** (`before insert or update or delete`) sur les
   **10 tables de l'hôte** : `reserves`, `reserves_historique`, `reserves_messages`,
   `reserves_conversations`, `reserves_photos`, `reserves_mutations_appliquees`,
   `reserves_plans`, `reserves_chantiers`, `reserves_intervenants`, `reserves_invitations`.
   Refuse toute écriture d'un **tiers** (utilisateur authentifié, non administrateur
   plateforme, **non membre** de l'hôte) tant que l'hôte est fermé. Prouvé utile : il bloque
   deux chemins qui ne passent pas par `reserves_acteur_courant`
   (`reserves_enregistrer_pagination`, `reserves_rejoindre_intervention`).
   Non concernés, à dessein : clé serveur / cron / purge RGPD (`auth.uid()` nul), support
   plateforme, et **membres de l'hôte** — ce qui préserve **R-04** (un membre de l'hôte sans
   module Réserves supprime un chantier Gestion Pro lié : le détachement n'est pas bloqué).

Fonctions ajoutées :

| Fonction | Exposition | Rôle |
|---|---|---|
| `reserves_hote_ecriture_ouverte(uuid)` | **aucune** (`revoke` à `authenticated`) | prédicat tenant ; l'exposer ferait un oracle de l'état commercial de toute organisation |
| `reserves_lecture_seule_hote(uuid)` | `authenticated` | pour l'écran ; `NULL` si l'appelant ne lit pas la réserve (pas d'oracle) |
| `reserves_chantier_lecture_seule_hote(uuid)` | `authenticated` | idem au niveau chantier, `NULL` si l'appelant n'y intervient pas |
| `reserves_garde_hote_suspendu()` | trigger | niveau 2 |

**Application** (`apps/reserves`) — l'autorité reste la base, l'écran s'aligne :
`lib/suspension-hote.ts` (module pur : reconnaissance du refus par son indice, motif de la
file hors-ligne, commandes masquées) ; bandeau `BandeauLectureSeule` sur la fiche réserve et
la fiche chantier ; masquage de J’accepte / Je refuse / Demander la levée / Joindre la photo
/ Retirer une photo / Envoyer ; routes `/api/offline/mutations` et `/api/offline/photo` : le
refus devient `refus` avec un motif explicite (« … votre saisie reste sur cet appareil et
pourra être renvoyée quand l’accès sera rétabli »).

## 5. Preuves

### 5.1 pgTAP — `supabase/tests/reserves_host_suspension_policy_v1.test.sql` (96 assertions)

| § | Preuve | Assertions |
|---|---|---|
| 1 | état de référence, hôte actif (écran non gelé) | 1.01–1.03 |
| 2 | **même session JWT** (session_id constant) après suspension : réserves, détail, historique complet, photos (RPC + objets Storage), plan, repère, échanges, chantier, tableau de bord, **6 lectures du PDF** (`export_entete/chantier/historique/photos/intervenants`) ; empreinte de **toute** la vue de l'intervenant identique à l'avant-suspension ; « marquer comme lu » autorisé | 2.01–2.20 |
| 3 | refus **en base** avec message et SQLSTATE exacts : acceptation, refus, commentaire, réservation photo, **écriture Storage d'un emplacement réservé avant la suspension**, confirmation, retrait, demande de levée, 2 transitions différées, `PATCH` direct (0 ligne), historique forgé, pagination du plan ; statuts intacts ; indice `RESERVES_HOTE_SUSPENDU` | 3.01–3.15 |
| 4 | **audit** : empreinte complète de l'hôte (historique, messages, conversations, photos et leur état, objets, registre d'idempotence, notifications, statuts, intervenants, plans) inchangée ; emplacement réservé resté non publié | 4.01–4.05 |
| 5 | **file hors-ligne** : clés tirées avant la suspension — commentaire, demande de levée, acceptation, photo (emplacement déjà réservé : **pas** de retour idempotent silencieux), nouvelle photo — toutes refusées ; empreinte inchangée | 5.01–5.08 |
| 6 | hôte suspendu : règles existantes (0 lecture, refus « non autorisé », auto-levée de suspension refusée), état commercial non modifié par le lot | 6.01–6.05 |
| 7 | autres fermetures : suspension programmée échue / à venir, entitlement retiré, échu, abonnement annulé | 7.01–7.10 |
| 8 | garde centrale : rattachement à une invitation en attente refusé, **rollback complet** (aucune habilitation partielle), clé serveur non concernée, 10 tables gardées, prédicat non exposé | 8.01–8.08 |
| 9 | **rétablissement dans la même session** : acceptation, commentaire rejoué avec sa clé d'origine, téléversement interrompu repris et confirmé, levée différée appliquée puis rejeu idempotent ; intervenant **non recréé ni modifié**, **aucune nouvelle invitation**, historique = exactement les actions appliquées ; la désignation en attente de D est honorée telle quelle | 9.01–9.15 |
| 10 | non-oracle (B, et C sur la réserve de D : `NULL`, refus existant), préférences du tenant de l'intervenant libres, **R-04 préservé** | 10.01–10.07 |

| Passe | Résultat |
|---|---|
| Nouvelle suite, base avec `…506` | ✅ **96/96** |
| Nouvelle suite, base **sans** `…506` (3 fonctions d'écran remplacées par des bouchons pour que le plan s'exécute) | ❌ **47/96** échecs : toutes les écritures (§3, §5), l'audit (§4), la garde (§8), et les cas qui en découlent (§7, §9) ; les **lectures** (§2) passent déjà — c'est exactement le constat D-01 |
| Suites Réserves (8 fichiers) | ✅ **690/690** (594 existantes inchangées + 96) |
| Suite maximale, base neuve 341 migrations | 134 fichiers ; **125 propres** ; les 9 non verts sont **exactement la dette connue du train V3** (7 `studio_*`, `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1`) |

### 5.2 Vitest (`apps/reserves`)

✅ **186/186** (14 fichiers ; 178 existants + 8 dans `lib/suspension-hote.test.ts` :
reconnaissance du refus par l'indice et par le message, non-confusion avec les autres refus,
motif de la file, masquage exhaustif des commandes). `typecheck` ✅, `lint` ✅, `build` ✅.

### 5.3 Playwright — `tests/e2e/reserves-host-suspension.spec.ts` (7 tests)

Décor autonome `scripts/e2e/prepare-reserves-suspension-hote.sql` (hôte H, intervenant S,
**isolés** du décor V3–V6 : suspendre A casserait les autres recettes en cas d'arrêt), branché
dans `preparer-base.sh` et `recette-reserves-v4.sh`. **Une seule session navigateur** pour toute
la recette ; la suspension est posée depuis « un autre appareil » par la clé serveur — le
chemin du webhook de facturation, **inchangé**.

| Test | Prouve |
|---|---|
| hôte actif | S voit la réserve, « J’accepte » et « Envoyer » proposés, dépôt de photo par la route de la file |
| file préparée avant la suspension | commentaire + demande de levée saisis **réseau coupé**, suspension pendant la coupure, retour du réseau : la file est refusée, **conservée en échec** avec le motif « lecture seule », et le serveur n'a **rien** reçu |
| session déjà ouverte : lecture | sans reconnexion : bandeau « Lecture seule », historique, photo affichée, liste, chantier ; **aucune** commande d'écriture |
| PDF | document imprimable 200 (les deux réserves) ; **PDF réel 200**, `application/pdf`, `%PDF-` |
| API | 6 RPC d'écriture → **403**, message et indice exacts ; `PATCH` → `[]` ; rejeu `/api/offline/mutations` avec les clés d'avant → `refus` ×2 ; `/api/offline/photo` → 409 `refus` ; **empreinte inchangée** |
| hôte suspendu | règles existantes (0 lecture, refus qui n'est **pas** le nouveau) |
| rétablissement | même session : bandeau disparu, « J’accepte » cliqué avec succès ; la **file conservée repart** et se vide ; R1 `acceptee`, R2 `levee_demandee`, commentaire hors-ligne présent **une fois** ; intervenant identique, pas de nouvelle invitation |

| Passe | Résultat |
|---|---|
| Spec suspension, avec `…506` | ✅ **7/7** |
| Spec suspension, `…506` neutralisée sur la base e2e | ❌ échec au premier constat post-suspension (la file est **transmise** au lieu d'être refusée) ; mode série : suite interrompue |
| Non-régression Réserves (ordre V3 → V4 → V4 mobile → V5 → V6) | ✅ V3 1/1 · V4 listes/PDF 11/11 · V4 mobile 6/6 · V5 13/13 · V6 sécurité 23/23 · V6 performance 5/5 = **59/59** |
| Total Réserves | ✅ **66/66** |

**Cas non exécutable (antérieur au lot, documenté par la qualification V1 §4.3)** : V5
« un rechargement hors ligne ne perd ni le cache ni la file » — l'émulation `setOffline` de
Chromium 1194 ne s'applique pas aux `fetch` du service worker lors d'un `reload`. Rejoué
ici : même échec ; en mode série il interrompt la suite, qui est donc passée avec
`--grep-invert "rechargement hors ligne"`, comme en V1.

### 5.4 Correspondance avec la mission

| Exigence | Preuve |
|---|---|
| 1 Base | §1 |
| 2 Read (réserve, historique, photos, plan, documents) | P 2.01–2.18 ; E « lecture », « PDF » |
| 3 Write block (acceptation, refus, commentaire, upload, demande de levée, modification, transition différée, offline replay) | P 3.01–3.13, 5.01–5.06 ; E « API », « file » |
| 4 Contrôle en base/API | niveau 1 + trigger (§4) ; P §3 ; E 403 PostgREST, `PATCH` |
| 5 Session existante | P : `session_id` constant de §1 à §9 ; E : un seul contexte navigateur |
| 6 Restore sans recréer l'invitation | P 9.01–9.15 ; E « rétablissement » |
| 7 Utilisateurs hôte / Billing | P 6.01–6.05, 10.06–10.07 ; aucun fichier de facturation modifié |
| 8 Audit sans faux historique | P 4.01–4.05, 5.08, 8.03, 9.11 ; E empreinte |
| 9 Offline : mutation d'avant, rejouée après → refusée | P §5 ; E « file », « API » |
| 10 PDF | P 2.12–2.16 ; E « PDF » (200, `%PDF-`) |
| 11 Tests pgTAP / Vitest / Playwright / session mid-flight / offline queue | §5.1–5.3 |

## 6. Comportements notables (choix assumés)

- **Rejeu d'une mutation déjà appliquée avant la suspension** : refusé lui aussi (le contrôle
  d'autorisation précède le contrôle d'idempotence, comme partout dans le domaine). Aucune
  perte : la saisie reste sur l'appareil en échec avec son motif ; au rétablissement, le
  rejeu répond `rejeu` et la file se vide (P 9.07).
- **File hors-ligne** : un refus passe la mutation en `echec` ; la file la remet d'elle-même en
  envoi jusqu'à 5 tentatives, puis attend un geste (« Réessayer »). La saisie n'est jamais
  supprimée.
- **Course suspension ↔ téléversement** : si l'hôte est suspendu **entre** la réservation d'un
  emplacement photo et le dépôt de l'objet, le dépôt échoue (policy Storage) → `echec`
  réessayable ; la ligne reste non publiée (P 4.05) et le rejeu suivant est refusé proprement.
- **Invitation en attente** : un intervenant qui n'avait pas encore rejoint ne peut pas
  rejoindre un hôte suspendu ; son invitation reste valable et est honorée au rétablissement
  (P 8.01–8.03, 9.13).
- **Utilisateur à la fois membre de l'hôte et intervenant** : exempté du trigger (membre de
  l'hôte), mais toujours bloqué par le niveau 1 (le chemin hôte exige un hôte actif, le chemin
  intervenant refuse).

## 7. Preview (à exécuter à distance, non fait ici)

- Train : **341** migrations, dernière **`20260927000506`** — attendus régénérés par
  `npm run sync:train-expectations` (DB verify, runbook V3, pack d'exécution, rapport V3).
- `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` : **contrôle 18** ajouté (bloquant) —
  garde présente sur les 10 tables et prédicat non exposé. Prouvé **GO** sur une base neuve à
  341 migrations, **NO-GO** sur une base sans `…506`. `npm run test:preview-pack` 27/27.

## 8. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260927000506_reserves_hote_suspendu_lecture_seule_v1.sql` | migration additive |
| `supabase/tests/reserves_host_suspension_policy_v1.test.sql` | pgTAP (96) |
| `apps/reserves/src/lib/suspension-hote.ts` (+ `.test.ts`) | module pur + Vitest (8) |
| `apps/reserves/src/components/BandeauLectureSeule.tsx` | bandeau |
| `apps/reserves/src/app/(reserves)/reserves/[id]/page.tsx`, `chantiers/[id]/page.tsx` | lecture seule à l'écran |
| `apps/reserves/src/app/api/offline/mutations/route.ts`, `photo/route.ts` | motif de refus explicite |
| `apps/reserves/src/lib/donnees.ts` | lecture de l'état « lecture seule » |
| `tests/e2e/reserves-host-suspension.spec.ts` | Playwright (7) |
| `scripts/e2e/prepare-reserves-suspension-hote.sql`, `preparer-base.sh`, `recette-reserves-v4.sh` | décor e2e isolé |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôle 18 |
| rapports V3 et Réserves V1 | D-01 marquée tranchée ; attendus du train régénérés |

Aucun fichier de facturation (Stripe, webhooks, `entreprises`, `acces_applications_entreprises`)
n'est modifié.

## 9. Reproduire

```bash
git checkout claude/relaxed-carson-way87a && npm ci && npm --prefix apps/reserves ci
npm --prefix tests/e2e/colors-pile-locale ci
pg_ctlcluster 16 main start
apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

# pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh qualif
su postgres -c "psql -d qualif -c 'create extension pgtap with schema extensions' -c 'alter database qualif set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d qualif reserves_*.test.sql"      # 690/690

# Application
cd apps/reserves && npm run typecheck && npm run lint && npm test && npm run build  # 186/186

# E2E (variables : voir ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md §7)
tests/e2e/reserves-pile-locale/preparer-base.sh reserves_e2e   # inclut le décor H/S
su postgres -c "psql -d reserves_e2e" < scripts/e2e/prepare-reserves-v6-charge.sql
node tests/e2e/colors-pile-locale/passerelle.mjs &
node scripts/e2e/amorcer-recette-v4.mjs
npm --prefix apps/reserves run start &
npx playwright test tests/e2e/reserves-host-suspension.spec.ts --project=desktop-chromium --workers=1  # 7/7
for s in v3-collaboration v4-listes-pdf v4-offline-mobile v6-securite v6-performance; do
  npx playwright test tests/e2e/reserves-$s.spec.ts --project=desktop-chromium --workers=1
done
npx playwright test tests/e2e/reserves-v5-offline.spec.ts --project=desktop-chromium --workers=1 \
  --grep-invert "rechargement hors ligne"
```
