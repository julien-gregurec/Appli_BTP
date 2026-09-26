# ELSATIA — Pilot Remaining Fails Closure (V2)

Mission autonome longue, sans supervision. Périmètre : les 6 `FAIL` restants après le
lot quick wins — `NF-01`, `FA-08`, `PL-03`, `PT-08`, `PE-07`, `CH-09`. Règle tenue du
début à la fin : **reproduire avant de corriger**, correctif minimal, aucun `PASS`
sans exécution réelle, aucun statut vague.

Résultat : les 6 cas sont fermés, chacun avec une preuve DB (pgTAP) et une preuve UI
(Playwright sur la pile locale réelle). En les rejouant, trois défauts supplémentaires
ont été trouvés et corrigés (§4), dont une faille d'enforcement DB sur les notes de
frais et une régression laissée par le lot précédent.

---

## 0. Base de travail

| Élément | Référence |
|---|---|
| Branche poussée (seule) | `claude/festive-tesla-xl5out` |
| Base | `origin/claude/brave-feynman-6ogvtq` (`b2d4bc7b`, lot quick wins), avance rapide |
| `origin/claude/loving-turing-aaopod` (`4056c5f3`, V3) | ancêtre de la base — contenu intégralement |
| `origin/claude/eager-ptolemy-ro5m59` (`0bcc3559`, triage) | son unique commit de doc est déjà repris dans la base (`a5d08e0b`) |
| Documents lus | `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md`, `ELSATIA_PILOT_REMAINING_FAILS_TRIAGE_V1.md`, `ELSATIA_PILOT_QUICK_WINS_CLOSURE_V1.md` |

`git fetch --all --prune` exécuté en préalable.

**Correction d'un signalement antérieur.** La V3 (§0) avait classé le bloc d'`AGENTS.md`
(« lire `node_modules/next/dist/docs/` ») comme une probable injection, car ce chemin
n'existait pas dans son environnement. Après `npm ci`, il existe bien : Next.js 16 fournit
sa documentation dans le paquet. Elle a servi ici (`allowedDevOrigins`, cause de NF-01).
Le signalement V3 était une conséquence de `node_modules` absents, pas une injection.

### Environnement

- PostgreSQL 16.13 local, `pgTAP` 1.3 ; GoTrue compilé depuis les sources, PostgREST v12.2.3
  (binaire), mock Storage, proxy local ; tout est monté par `npm run pilot:acceptance:v3`.
- `next dev -p 3100` + Chromium Playwright (`/opt/pw-browsers/chromium-1194`).
- Le conteneur a redémarré pendant la mission : le travail était sauvegardé par un
  commit WIP poussé, puis la pile a été remontée et **toutes les preuves ci-dessous ont
  été rejouées après le redémarrage**.

---

## 1. Tableau de clôture

| ID | BEFORE (mesuré) | ROOT CAUSE | FIX | DB PROOF | UI PROOF | STATUS |
|---|---|---|---|---|---|---|
| **NF-01** | Test V3 rejoué : le formulaire n'est **jamais soumis** (aucun `POST`) ; fichier attaché mais 0 aperçu, pas de case de confirmation. La redirection `/login` décrite en V3 **ne se reproduit pas**. | **`ENVIRONMENT_GAP` + `TEST_BUG`**, puis **`REAL_PRODUCT_BUG`** mis au jour. (1) La recette cible `127.0.0.1:3100` ; `next dev` (Next 16) bloque ses ressources dev (chunks JS, HMR) pour toute origine autre que `localhost` si elle n'est pas dans `allowedDevOrigins` → pages rendues côté serveur, **aucun composant client hydraté**. (2) Le test ne remplissait pas « Montant TTC », champ `required`. (3) Une fois (1)+(2) corrigés, 2 rejeux sur 5 échouaient : cliquer « Soumettre » pendant l'upload fait échouer l'upload (RLS : la note n'est plus en brouillon), l'API laisse une ligne `documents_notes_frais` **sans fichier**, et `transition_note_frais` ne vérifiait que cette ligne → note `soumis` **sans aucun justificatif stocké** (constaté en base : 1 document, 0 version, 0 objet). | `next.config.ts` : `allowedDevOrigins: ["127.0.0.1"]` (développement uniquement). Test : saisie du TTC, attente de l'aperçu puis de l'accusé d'upload, témoin DB. **Migration 332** : la soumission exige une version `original` enregistrée (écrite seulement après l'upload Storage réussi). | `nf01_soumission_note_frais_justificatif_stocke.test.sql` **8/8** ; la même suite sur la base sans correctif (318 migrations) échoue aux tests 2, 3 et 5 : la faille est reproduite. | `pilot-acceptance-v3.spec.ts` §NF-01 : ouvrier → brouillon → justificatif → `soumis`, témoin DB `soumis\|1` ; **5/5 rejeux**. | ✅ **PASS** |
| **FA-08** | Fixture pilote, `FAC-PILOTE-004` `envoyee` avec une échéance à J-5 : reste `envoyee`. Seules fonctions qui calculent `en_retard` : `recalc_paiements_facture` (déclenchée par un paiement) et un trigger de synchro ; aucun `pg_cron`, aucun job cron. | **`REAL_PRODUCT_BUG`** (fonction absente) : rien ne réévalue le statut au seul passage du temps. | **Migration 328** : `marquer_factures_en_retard()`, idempotente, réservée au `service_role`. Bascule seulement `envoyee` → `en_retard` si l'échéance est strictement dépassée et le reste à payer > 0 : même précédence que `recalc_paiements_facture` (`payee_partiel` l'emporte, aucun statut terminal ni brouillon ne bouge). Appelée chaque jour par le cron Vercel existant `/api/cron/abonnements` (pas de nouveau cron, plan Hobby), dès que l'endpoint est authentifié, sans appel externe. | `fa08_bascule_factures_en_retard.test.sql` **18/18** (positive/negative witnesses, service_role seul, idempotence, cohérence avec recalc, cross-tenant) ; vitest cron **13/13**. | `pilot-remaining-fails-v2.spec.ts` §FA-08 : appel réel du cron → `FAC-PILOTE-006` `en_retard`, `FAC-PILOTE-004` (soldée) inchangée, « En retard » affiché dans `/factures`. | ✅ **PASS** |
| **PL-03** | Sous l'identité RLS du conducteur (`gerer_planning`) : `UPDATE` d'affectation (heures 7→4, date décalée) réussi, **0 ligne** ajoutée dans toutes les tables `*histor*`/`*journal*`/`*audit*`. | **`REAL_PRODUCT_BUG`** (fonction absente) : `UPDATE`/`DELETE` nus, aucun trigger d'audit. | **Migration 329** : `affectations_historique` en ajout seul (même modèle que `reserves_historique`) alimentée par le trigger `trg_historiser_affectation` : avant, après, champs modifiés, auteur, horodatage. `UPDATE` sans changement ignoré ; suppressions en cascade (purge d'employé ou de chantier, RGPD) non historisées. Lecture : mêmes personnes que l'affectation (prédicat PL-05). | `pl03_historique_affectations.test.sql` **24/24** | `pilot-remaining-fails-v2.spec.ts` §PL-03 : le chef de chantier modifie une affectation dans `/planning` → `modification\|heures\|7.00\|3.50\|<uid chef>`. | ✅ **PASS** |
| **PT-08** | `INSERT` direct dans `pointages` refusé même au dirigeant (`WITH CHECK (false)`) ; les seules RPC de création prennent l'employé depuis `auth.uid()` ; la valeur `origine_pointage='regularisation_responsable'` existe depuis `20260715000081` mais **rien ne l'écrit**. | **`REAL_PRODUCT_BUG`** (fonction absente). | **Migration 330** : RPC `creer_pointage_regularisation`, calquée sur `declarer_pointage_oublie` (même calcul d'heures, même fenêtre de 31 jours, statut `a_verifier` → circuit de validation PT-05/06). Droit `gerer_pointage` requis, salarié actif et chantier de la même entreprise, motif obligatoire, auteur dans `regularise_par`, salarié notifié. Formulaire replié sur `/pointage/gestion` et badge « Régularisation responsable ». | `pt08_regularisation_pointage_responsable.test.sql` **26/26** | `pilot-remaining-fails-v2.spec.ts` §PT-08 : le gérant saisit un pointage au nom de l'ouvrier, témoin DB exact (8 h, origine, auteur, notification) ; formulaire absent pour l'ouvrier. | ✅ **PASS** |
| **PE-07** | Fixture, JWT portant `session_id` : l'ouvrier enregistre son téléphone, le dirigeant le révoque → **la même session lit toujours ses pointages** (`est_membre_actif = true`), et le rappel suivant d'`enregistrer_appareil_courant` **remet `revoque_at` à null** : la révocation s'annule d'elle-même. | **`REAL_PRODUCT_BUG`** (sécurité) : la révocation ne touchait qu'une ligne de facturation, reliée à aucune session. | **Migration 331** : l'appareil mémorise la session GoTrue qui l'enregistre (claim `session_id`) ; la révocation inscrit cette session dans `sessions_revoquees` et supprime la ligne `auth.sessions` si le rôle propriétaire y a droit (le refresh token devient invalide) ; `est_membre_actif`, `est_membre_actif_reel` et `a_permission` renvoient `false` pour une session révoquée (RLS fermée immédiatement, sur un jeton encore valide) ; `contexte_acces_proxy` expose `session_revoquee` et le proxy fait `signOut` puis redirige vers `/login` ; une session révoquée ne peut plus se ré-enregistrer. Révocation ciblée : les autres appareils ne sont pas touchés. | `pe07_revocation_appareil_invalide_session.test.sql` **22/22** | `pilot-remaining-fails-v2.spec.ts` §PE-07 (3/3 rejeux) : le gérant clique « Révoquer » → `sessions_revoquees` +1, `auth.sessions` −1 ; le **même JWT non expiré** ne lit plus rien via PostgREST direct (`[]`, contre >0 avant) ; navigation suivante → `/login` ; la session du gérant reste intacte. | ✅ **PASS** |
| **CH-09** | Page `/chantiers/[id]/localisation` : formulaire GPS seulement, aucune carte, aucune adresse. Les 7 chantiers pilote ont une adresse mais pas de coordonnées. | **`REAL_PRODUCT_BUG`** (fonction absente). | `CarteChantier` + `src/lib/carte-tuiles.ts` : carte à tuiles OpenStreetMap (Web Mercator, grille 5×3 centrée, marqueur, cercle du rayon de pointage, attribution OSM). **Aucune dépendance, aucune clé d'API, CSP inchangée** (`img-src https:` l'autorisait déjà ; `frame-src` et `script-src` intacts). Sans coordonnées : adresse, message et lien de recherche OSM, sans géocodage côté serveur. | Sans objet (aucun changement de schéma) ; coordonnées vérifiées en base après enregistrement. | vitest `carte-tuiles.test.ts` **6/6** ; `pilot-remaining-fails-v2.spec.ts` §CH-09 : sans position → adresse + message, aucune carte ; géolocalisation réelle via le bouton du produit → carte `data-latitude=45.7578`, tuile centrale `16/33647/23378`, 15 tuiles, marqueur, adresse, coordonnées en base. | ✅ **PASS** |

Classement de départ (étape « reproduce first ») : `REAL_PRODUCT_BUG` pour FA-08, PL-03,
PT-08, PE-07 et CH-09. `ENVIRONMENT_GAP` + `TEST_BUG` pour NF-01, qui a ensuite révélé un
`REAL_PRODUCT_BUG` distinct. Aucun `FIXTURE_BUG` ni `FALSE_POSITIVE` parmi les six.

---

## 2. Enforcement DB (§3 de la mission)

Chaque règle métier ou de sécurité ajoutée ou révélée par ce lot est portée par la base,
donc valable pour tout chemin d'accès (pages, server actions, PostgREST direct, RPC) :

| Règle | Avant | Garde DB |
|---|---|---|
| Soumettre une note de frais exige un justificatif **stocké** | ligne document seule (contournable par un upload interrompu) | `transition_note_frais` exige une version `original` (332) |
| Seul le cron bascule les statuts de masse | — | `marquer_factures_en_retard` : `EXECUTE` révoqué pour `public/anon/authenticated`, `service_role` seul (328) |
| Historique des affectations inaltérable | — | écriture seulement par trigger `SECURITY DEFINER` ; `INSERT/UPDATE/DELETE` révoqués pour `authenticated` (329) |
| Régularisation de pointage réservée à `gerer_pointage`, même entreprise | impossible (aucun chemin) | contrôles dans la RPC ; `INSERT` direct toujours `WITH CHECK (false)` (330) |
| Appareil révoqué = session fermée | ligne de facturation seulement | `sessions_revoquees` consultée par `est_membre_actif`/`a_permission`, appelées directement par **463 des 599** policies RLS `public`/`storage` (331) |

---

## 3. Session / RLS / tenant (§4 de la mission)

| Cas | Positive witness | Negative witness | Cross-tenant | Changement de rôle | Utilisateur inactif | Entreprise suspendue |
|---|---|---|---|---|---|---|
| NF-01 | soumission avec version stockée | document orphelin refusé | ouvrier B refusé sur la note de A | — (droit personnel) | refusé, JWT encore valide | refusé |
| FA-08 | échue + impayée → `en_retard` | échéance du jour/future, `payee_partiel`, `payee`, brouillon, annulée, sans échéance : inchangées | job global, lecture cloisonnée (B ne voit pas A) | — (service_role seul ; dirigeant refusé) | — | — |
| PL-03 | modification → 1 ligne avant/après/auteur | `UPDATE` sans changement → 0 ; cascade → 0 ; écriture directe refusée | B ne lit ni ne modifie A | ouvrier → conducteur : vue globale sans reconnexion | 0 ligne | 0 ligne, même au dirigeant |
| PT-08 | conducteur crée pour l'ouvrier | ouvrier refusé ; motif, date, durée, salarié sorti refusés | salarié ou chantier de B refusé ; dirigeant B refusé sur A | ouvrier → conducteur : droit acquis immédiatement | refusé | refusé |
| PE-07 | session du téléphone lit avant révocation | lit 0 après ; ne peut plus se ré-enregistrer | B non affecté ; B ne peut pas révoquer chez A | — | (déjà couvert par `est_membre_actif`) | (idem) |

Scénarios de session live du socle (`run_pilot_auth_scenarios.sh`) : **25 PASS + 1 NOTE,
0 FAIL**, identiques avant et après ce lot.

---

## 4. Défauts supplémentaires trouvés en rejouant

1. **Hydratation absente dans toute la recette navigateur** (cause de NF-01, et vraie
   cause de l'échec PE-06 de la V3). Avec `127.0.0.1`, aucun composant client ne
   s'exécutait. Tout test passé sans JS jusqu'ici était un test sans hydratation.
   Correctif dev-only dans `next.config.ts`.
2. **PE-06** (hors des six, classé `AUTOMATION_FALSE_POSITIVE` par le lot précédent) :
   une fois l'hydratation rétablie, le geste tombait hors du viewport (le canvas est sous
   la ligne de flottaison). Test : `scrollIntoViewIfNeeded()` avant la mesure, et remise à
   zéro de la signature pour que le test soit rejouable. **PE-06 passe désormais de bout en
   bout**, avec la signature enregistrée en base.
3. **Limiteur de connexions dans `pilot-acceptance-v2.spec.ts`** : 24 connexions contre
   un plafond de 10 en 10 min par IP (protection réelle, voulue). Sans hydratation, les cas
   au-delà du 10ᵉ « passaient » sur une page 429 sans données. Une fois l'hydratation
   rétablie, ils échouaient (6/24). Les trois specs pilote purgent désormais
   `rate_limits_applicatifs` avant chaque test (geste de test uniquement) : **24/24**, avec
   `redirected=true` réellement mesuré sur chaque garde d'URL.
4. **Régression du lot précédent** : `peut_consulter_affectation_employe` (PL-05,
   migration 327) était exécutable par `anon`. Détecté par
   `isolation_multitenant_surface` et `security_remediation_anon_execute_revocation_v1`
   lors de la suite pgTAP complète, que le lot quick wins n'avait pas rejouée. Révoqué
   dans la migration 329.

---

## 5. Limites assumées

- **PE-07**
  - Un appareil vu pour la dernière fois *avant* la migration 331 n'a pas encore de
    `session_id`. Il est lié à sa session à son prochain passage (au plus un par jour et par
    onglet). En attendant, sa révocation est enregistrée mais ne vise aucune session.
  - 17 RPC `SECURITY DEFINER` contrôlent l'appartenance directement, sans passer par
    `est_membre_actif`/`a_permission`. Un jeton révoqué pourrait encore les appeler jusqu'à
    son expiration (≤ 1 h). Sa durée de vie est bornée par la suppression de
    `auth.sessions`, qui empêche le refresh.
  - Que le rôle propriétaire des migrations ait le droit de supprimer dans `auth.sessions`
    sur le projet Supabase de production reste à **vérifier à distance**. S'il ne l'a pas,
    l'appel est ignoré sans erreur et la RLS reste la barrière.
- **FA-08** : en production, la bascule tourne seulement si le cron Vercel appelle
  l'endpoint avec `CRON_SECRET` et qu'une de ses deux portes est ouverte
  (`FEATURE_CRONS_ENABLED` ou `FEATURE_RELANCES_AUTO_ENABLED`). C'est de la configuration
  d'environnement, à vérifier au déploiement.
- **CH-09** : les tuiles viennent de `tile.openstreetmap.org` (attribution affichée ; la
  politique d'usage OSM vise un volume modéré). Le test vérifie les URL des tuiles, pas le
  chargement des images depuis Internet.
- **PT-08** : le poste « Administration » du catalogue canonique ne porte pas
  `gerer_pointage`. La régularisation est ouverte aux postes qui l'ont (gérant, RH,
  directeur/chef de chantier). Les rôles n'ont pas été modifiés.

---

## 6. Régression complète (§7)

| Vérification | Résultat |
|---|---|
| `npm run typecheck` (racine + `apps/tools`, `apps/reserves`, `apps/colors`) | ✅ exit 0 |
| `eslint .` | ✅ 19 problèmes (4 erreurs, 15 warnings), **identique au baseline** `b2d4bc7b` |
| `vitest run` | ✅ **154 fichiers, 1 796 tests**, 0 échec |
| `verify:migrations` | ✅ **323 migrations** valides, noms et horodatages uniques |
| pgTAP ciblé (6 suites du lot : fa08, pl03, pt08, pe07, nf01 + pl05) | ✅ 18 + 24 + 26 + 22 + 8 + 12 |
| pgTAP complet, base neuve à 323 migrations | ✅ **104 fichiers, 2 721 tests** ; seul échec `platform_stripe_state_attestation_r72` (14/30), pré-existant et documenté (pgsodium factice) |
| `npm run pilot:acceptance:v3` à froid intermédiaire (322 migrations, avant 332) | ✅ 70 PASS / 1 MANUAL_EXPECTED sur 71 ; scénarios auth 25 PASS + 1 NOTE |
| Playwright `pilot-acceptance-v2` / `-v3` / `pilot-remaining-fails-v2` | ✅ **24/24, 8/8, 6/6** (38/38) |
| Passage final à froid, 323 migrations | ✅ voir §6 bis |

### 6 bis. Passage final à froid

Une seule chaîne, depuis zéro, sur l'état final de la branche
(`pilot:acceptance:v3` puis `next dev` puis les trois specs, séquentiellement) :

| Étape | Résultat |
|---|---|
| Reconstruction de `pilot_gp` | ✅ `OK: 323 migrations applied` |
| Backend (GoTrue + PostgREST réels, 71 cas) | ✅ **70 PASS / 1 MANUAL_EXPECTED** |
| Scénarios auth/session | ✅ **25 PASS, 0 FAIL** (+ la NOTE historique sur le ban GoTrue) |
| `pilot-acceptance-v2.spec.ts` | ✅ **24/24** |
| `pilot-acceptance-v3.spec.ts` | ✅ **8/8** (dont NF-01, PE-06, CH-08) |
| `pilot-remaining-fails-v2.spec.ts` | ✅ **6/6** (CH-09, PL-03, PT-08 ×2, PE-07, FA-08) |

---

## 7. Matrice 143

```
                V3        Quick wins V1          Cette mission (V2)
PASS            125       125 (3 fermés en DB,   135
                          e2e non rejoué)
FAIL             10        7 + PE-06 tranché       0
MANUAL_EXPECTED   5        5                       5
REMOTE_ONLY       3        3                       3
Total           143       143                     143
```

Les 10 anciens `FAIL` sont `PASS`. Six sont fermés par cette mission. `CH-08`, `CM-06` et
`PL-05` avaient été corrigés en base par le lot quick wins : leurs preuves pgTAP ont été
rejouées ici, et CH-08 est aussi vert en e2e. `PE-06` passe désormais de bout en bout.

Les cas `MANUAL_EXPECTED` (PA-03, RG-05, SUP-03, SUP-04, SEC-05) et `REMOTE_ONLY`
(DV-11, MS-04, DOC-02) n'ont pas été touchés : aucun travail de ce lot ne permettait de
les convertir.

Matrice complète en annexe.

---

## 8. Fichiers touchés

- **Migrations (5)**
  - `20260923000328_fa08_bascule_factures_en_retard.sql`
  - `…329_pl03_historique_affectations.sql`
  - `…330_pt08_regularisation_pointage_responsable.sql`
  - `…331_pe07_revocation_appareil_invalide_session.sql`
  - `…332_nf01_soumission_note_frais_justificatif_stocke.sql`
- **pgTAP (5)** : `fa08_…`, `pl03_…`, `pt08_…`, `pe07_…`, `nf01_…` sous `supabase/tests/`
- **Produit**
  - `src/app/api/cron/abonnements/route.ts` (+ test)
  - `src/lib/supabase/proxy.ts`
  - `src/app/actions/pointages.ts`
  - `src/app/(app)/pointage/gestion/page.tsx`
  - `src/app/(app)/chantiers/[id]/localisation/page.tsx`
  - `src/components/CarteChantier.tsx`
  - `src/lib/carte-tuiles.ts` (+ test)
  - `next.config.ts` (dev uniquement)
- **Recette**
  - `tests/e2e/pilot-remaining-fails-v2.spec.ts` (nouveau)
  - `tests/e2e/pilot-acceptance-v3.spec.ts` (NF-01, PE-06, purge du limiteur)
  - `tests/e2e/pilot-acceptance-v2.spec.ts` (purge du limiteur)

---

## Verdict

> ### PILOT LOCALLY QUALIFIED WITH MANUAL/REMOTE CASES

- **0 `FAIL`** sur 143. Les 6 cas visés sont fermés avec une preuve DB et une preuve UI
  exécutées. Les 4 déjà corrigés en base ont été revérifiés, et deux d'entre eux (CH-08,
  PE-06) l'ont été pour la première fois de bout en bout.
- Ce qui reste hors local est nommé et borné :
  - 5 `MANUAL_EXPECTED` (jugement humain ou procédure support) ;
  - 3 `REMOTE_ONLY` (appel LLM réel) ;
  - 3 vérifications de configuration de production (§5) : droit sur `auth.sessions`,
    portes du cron, volume de tuiles OSM.
- Ce verdict est local : pile GoTrue/PostgREST reconstruite, Storage mocké, `next dev`.
  Il ne remplace pas une recette sur l'environnement de production.

---

## Annexe — Matrice complète des 143 contrôles (V2 de clôture)

### Onboarding (ON)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| ON-01 | Créer entreprise depuis `/onboarding` | PASS | V1 §4.1 : `creer_entreprise_bootstrap()` exécutée réellement sous JWT GoTrue frais, entreprise créée, gérant affecté |
| ON-02 | Paramètres SIRET/adresse/logo | PASS | V3 : exécuté en direct via Playwright, `tests/e2e/pilot-acceptance-v3.spec.ts:52` — verdict PASS confirmé cette session |
| ON-03 | Installer 9 rôles prédéfinis | PASS | V2json id=ON-03, verdict PASS : `installer_roles_predefinis` exécutée réellement (tenant B) |
| ON-04 | Fiche salarié sans e-mail, n° inscription généré | PASS | V1 §4.1 : trigger `trg_numero_inscription_employe` exercé 4× à froid, 28 employés, aucune collision |
| ON-05 | Activation compte salarié via n° inscription | PASS | V1 §4.1 : `activer_compte_employe()` exécutée pour les 5 profils pilote sous leur propre JWT réel |
| ON-06 | Chantier sans client refusé | PASS | V1 §4.1 : `INSERT chantiers(...,client_id=NULL,...)` exécuté → `ERROR: null value ... violates not-null constraint` |
| ON-07 | Devis envoyé par e-mail avec PDF | PASS | BASE : `src/lib/documents-envoi.test.ts` (vitest), statut→envoyé, PDF joint, lien généré |
| ON-08 | Wizard onboarding 6 étapes | PASS | V3 : exécuté en direct via Playwright, `tests/e2e/pilot-acceptance-v3.spec.ts:82` — verdict PASS confirmé cette session |

### Dashboard (DB)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| DB-01 | KPI dashboard cohérents | PASS | BASE : `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` (pgTAP) |
| DB-02 | Ignorer/rétablir une alerte | PASS | V2json id=DB-02, verdict PASS (cycle ignorer→disparaît→rétablir exécuté réellement) |
| DB-03 | Déléguer une alerte | PASS | BASE : `alertes_operationnelles_delegations.test.sql` (pgTAP) |

### Clients (CL)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| CL-01 | Créer client particulier | PASS | V2json id=CL-01, verdict PASS |
| CL-02 | Créer client professionnel | PASS | V2json id=CL-02, verdict PASS |
| CL-03 | Modifier conditions de paiement client | PASS | V2json id=CL-03, verdict PASS |
| CL-04 | Création rapide client depuis devis | PASS | V2json id=CL-04, verdict PASS |
| CL-05 | Accès direct `/clients` par un ouvrier → refusé | PASS | V2 §4.3 + V3 : re-testé en navigateur réel (`[URL-GUARD CL-05] redirected=true`) ; V3 a identifié la vraie cause (guard `droitRequis && ctx.droit_acces!==true` dans `src/lib/supabase/proxy.ts` depuis commit `160eb146`, 2026-07-22, antérieur au rapport FULL_REHEARSAL_V2 qui n'avait fait que de la lecture de code statique, jamais de navigateur réel). Note P2/durcissement : `clients/page.tsx` ignore toujours silencieusement le champ `error` de la RPC — lacune de défense en profondeur latente si le guard middleware était mal configuré, mais non exploitable aujourd'hui car le guard bloque en amont |
| CL-06 | Plafonnement `delai_paiement_jours` à 365 | PASS | V1 §4.1 : `UPDATE clients SET delai_paiement_jours=400` exécuté → `ERROR: violates check constraint` |

### Chantiers (CH)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| CH-01 | Créer chantier lié à un client | PASS | V2json id=CH-01, verdict PASS |
| CH-02 | Changer statut chantier | PASS | V2json id=CH-02, verdict PASS |
| CH-03 | Ajouter/basculer une tâche | PASS | V2json id=CH-03, verdict PASS |
| CH-04 | Photo compte-rendu chantier | PASS | BASE : `pieces_jointes_v1_photos_comptes_rendus.test.sql` (pgTAP) |
| CH-05 | Générer le DOE | PASS | V3 : exécuté en direct via Playwright, `tests/e2e/pilot-acceptance-v3.spec.ts:112` — document généré, verdict PASS confirmé cette session |
| CH-06 | Convertir devis accepté en chantier | PASS | BASE : `workflow_devis_v1_chantier_depuis_devis.test.sql` + `workflow-devis.test.ts` |
| CH-07 | Affecter/retirer employé d'un chantier | PASS | V2json id=CH-07, verdict PASS |
| CH-08 | Ouvrier accède au détail d'un chantier non affecté | **PASS** | Lot quick wins (seed réaligné sur `modeles_roles_predefinis` + garde `peut_consulter_chantier` en tête de page) ; pgTAP `ch08_acces_detail_chantier_non_affecte` 9/9 ; **e2e rejoué cette mission** : `pilot-acceptance-v3.spec.ts` §CH-08 (assertif) vert, 3 passages |
| CH-09 | Carte affichée sur `/chantiers/[id]/localisation` | **PASS** | Cette mission : carte à tuiles OpenStreetMap (`CarteChantier`, `src/lib/carte-tuiles.ts`, sans dépendance ni clé, CSP inchangée), adresse affichée ; vitest `carte-tuiles.test.ts` 6/6 ; e2e `pilot-remaining-fails-v2.spec.ts` §CH-09 : sans position → adresse + message, géolocalisation réelle via le bouton produit → carte centrée (tuile 16/33647/23378), marqueur, 15 tuiles, coordonnées en base |
### Devis (DV)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| DV-01 | Créer devis brouillon, calculs HT/TTC | PASS | V2json id=DV-01, verdict PASS |
| DV-02 | Dupliquer un devis | PASS | V2json id=DV-02, verdict PASS |
| DV-03 | Envoyer devis par e-mail | PASS | BASE : même preuve qu'ON-07 (`documents-envoi.test.ts`) |
| DV-04 | Lien public devis envoyé | PASS | BASE : `document_partage_public_par_jeton_v1.test.sql` |
| DV-05 | Lien public devis brouillon → refusé | PASS | BASE : même fichier, jeton valide mais devis brouillon → `null` |
| DV-06 | Devis `envoye`→`accepte`, notification | PASS | BASE : `gp_pilot_notification_devis_accepte.test.sql` |
| DV-07 | Refuser un devis | PASS | V2json id=DV-07, verdict PASS |
| DV-08 | `/mes-travaux` sans prix affiché | PASS | V2json id=DV-08, verdict PASS ; confirmé aussi côté rendu par V2 Playwright (aucun montant affiché) |
| DV-09 | Accès direct `/devis` par un ouvrier → refusé | PASS | V2 §4.3 + V3 : même mécanisme et même explication que CL-05 (guard middleware `proxy.ts` depuis `160eb146`) ; re-testé en navigateur réel, `[URL-GUARD DV-09] redirected=true` |
| DV-10 | Signature interne devis, horodatée | PASS | V2json id=DV-10, verdict PASS (exécuté sous JWT `service_role`, seul rôle autorisé en écriture par RLS) |
| DV-11 | Devis assisté par IA | **REMOTE_ONLY** | V1 §5/V2 §3 : `genererDevisIAAction` dépend d'un appel LLM réel ; aucun mock/substitut construit dans aucune des sessions, structurellement hors de portée du sandbox |
| DV-12 | Devis sans chantier associé | PASS | BASE : `devis.chantier_id` sans contrainte NOT NULL (preuve directe de schéma) |

### Factures (FA) et avoirs (AV)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| FA-01 | Facture depuis devis accepté | PASS | V2json id=FA-01, verdict PASS |
| FA-02 | Émission facture, lignes verrouillées | PASS | BASE : `verrouiller_facture_emise.test.sql` |
| FA-03 | Facture d'acompte | PASS | V2json id=FA-03, verdict PASS |
| FA-04 | Situation d'avancement | PASS | V2json id=FA-04, verdict PASS |
| FA-05 | Paiement partiel → `payee_partiel` | PASS | V2json id=FA-05, verdict PASS |
| FA-06 | Paiement soldant → `payee` | PASS | V2json id=FA-06, verdict PASS |
| FA-07 | Paiement > montant TTC refusé | PASS | BASE : `gp_pilot_paiement_avoir_idempotence.test.sql`, protection TOCTOU, reproduite en concurrence réelle (§12.1) |
| FA-08 | Facture bascule `en_retard` automatiquement | **PASS** | Cette mission : `marquer_factures_en_retard()` (migration 328, service_role seul) appelée chaque jour par `/api/cron/abonnements` ; pgTAP `fa08_bascule_factures_en_retard` 18/18 ; vitest cron 13/13 ; e2e : appel réel du cron → FAC-PILOTE-006 `en_retard`, FAC-PILOTE-004 soldée inchangée, « En retard » affiché dans `/factures` |
| FA-09 | Relance manuelle facture en retard | PASS | BASE : `src/app/actions/relances.test.ts` |
| FA-10 | Échéance gelée après émission | PASS | V2json id=FA-10, verdict PASS (Server Action bloque bien ; le trigger DB laisse volontairement `date_echeance` libre par choix documenté, non un défaut) |
| AV-01 | Avoir sur facture soldée | PASS | BASE (corrigé en session originale) : `gp_pilot_paiement_avoir_idempotence.test.sql`, facture→`avoir_emis` |
| AV-02 | Second avoir sur même facture refusé | PASS | BASE : même fichier, index unique anti-doublon |
| AV-03 | Lien public facture | PASS | BASE : `document_partage_public_par_jeton_v1.test.sql` |
| AV-04 | Accès direct `/factures` par un ouvrier → refusé | PASS | V2 §4.2 : `[URL-GUARD AV-04] path=/factures finalUrl=/dashboard status=200 redirected=true`, navigateur réel |

### Commandes et fournisseurs (CM / FR)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| CM-01 | Créer un fournisseur | PASS | V2json id=CM-01, verdict PASS |
| CM-02 | Commande fournisseur liée à un chantier | PASS | V2json id=CM-02, verdict PASS |
| CM-03 | Envoyer commande, statut `envoyee` | PASS | V2json id=CM-03, verdict PASS |
| CM-04 | Réception partielle, stock crédité | PASS | BASE : `gp_reception_commande_stock_transactionnel_v1.test.sql` |
| CM-05 | Réception finale | PASS | BASE : même fichier |
| CM-06 | Supprimer commande brouillon sans effet stock | **PASS** | Lot quick wins : trigger `BEFORE DELETE` `trg_commande_fournisseur_suppression_statut` (migration 326) ; pgTAP `cm06_suppression_commande_fournisseur_statut` 11/11, rejoué cette mission sur base neuve (323 migrations) |
| CM-07 | Accès direct `/fournisseurs` par un ouvrier → refusé | PASS | V2 §4.2 : `[URL-GUARD CM-07] redirected=true`, navigateur réel |
| FR-01 | Désactiver un fournisseur | PASS | V2json id=FR-01, verdict PASS |
| FR-02 | Création rapide fournisseur | PASS | V2json id=FR-02, verdict PASS |
| FR-03 | Lier dépense fournisseur à commande reçue | PASS | V2json id=FR-03, verdict PASS |

### Stock (ST)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| ST-01 | Sortie stock borne avec code personnel | PASS | V2json id=ST-01, verdict PASS |
| ST-02 | Entrée de stock | PASS | BASE : `gp_reception_commande_stock_transactionnel_v1.test.sql` (via réception) |
| ST-03 | Article sous seuil d'alerte signalé | PASS | V2json id=ST-03, verdict PASS |
| ST-04 | Modifier prix d'achat article | PASS | V2json id=ST-04, verdict PASS |
| ST-05 | Import stock Excel/CSV sans doublon | PASS | V2json id=ST-05, verdict PASS |
| ST-06 | Clôturer un inventaire, écarts calculés | PASS | BASE : `src/lib/inventaires.test.ts` |
| ST-07 | Borne stock mauvais code → refusé | PASS | V2json id=ST-07, verdict PASS |
| ST-08 | Accès `/stock` conforme à `acces_stock` | PASS | V2 §4.2 : `[URL-GUARD ST-08] redirected=true`, navigateur réel |

### Dépenses et notes de frais (DP / NF)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| DP-01 | Dépense fournisseur, montants cohérents | PASS | BASE : `src/lib/tva.test.ts` |
| DP-02 | Règlement fournisseur partiel | PASS | V2json id=DP-02, verdict PASS |
| DP-03 | Justificatif joint à une dépense | PASS | V3/V2json id=DP-03, verdict PASS : exécuté pour de vrai via `local_storage_mock.mjs` (real `storage.objects`/`storage.buckets` + RLS réelle, octets sur disque local) — upload HTTP 200 réel, justificatif visible |
| DP-04 | Classer dépense sur un chantier | PASS | V2json id=DP-04, verdict PASS |
| DP-05 | Export ZIP notes de frais, manifeste SHA-256 | PASS | BASE : `src/lib/expenses/export.test.ts` + `integrity.test.ts` |
| NF-01 | Note de frais + justificatif photo (ouvrier) | **PASS** | Cette mission : cause V3 = harnais (Next 16 bloque les ressources dev pour l'origine `127.0.0.1` → aucune hydratation) + test qui ne remplissait pas le TTC requis ; en le corrigeant, une vraie faille DB est apparue (soumission acceptée sans fichier stocké) → migration 332 ; pgTAP `nf01_…` 8/8 (échoue sur la base sans correctif) ; e2e ouvrier : brouillon → justificatif → `soumis`, témoin DB `soumis|1`, 5/5 rejeux |
| NF-02 | Valider une note de frais | PASS | V2json id=NF-02, verdict PASS |
| NF-03 | Refuser une note avec motif | PASS | V2json id=NF-03, verdict PASS |
| NF-04 | Marquer note validée comme remboursée | PASS | V2json id=NF-04, verdict PASS (exécuté en UPDATE direct sous JWT `service_role`, documenté ainsi) |
| NF-05 | Modifier une note déjà validée → refusé | PASS | V2json id=NF-05, verdict PASS |

### Personnel et paie (PE / PA)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| PE-01 | Fiche salarié complète, coût horaire | PASS | V2json id=PE-01, verdict PASS |
| PE-02 | Taux/coût horaire visible gérant/RH/compta uniquement | PASS | BASE (corrigé en session originale) : `securiser_taux_horaire_facture_employe.test.sql` |
| PE-03 | Taux horaire non exposé à un collègue | PASS | BASE (corrigé) : même fichier, policy RESTRICTIVE, 0 ligne renvoyée à un ouvrier |
| PE-04 | Import/suppression carte BTP | PASS | V2json id=PE-04, verdict PASS |
| PE-05 | Anonymiser salarié parti, purge Storage | PASS | V3/V2json id=PE-05, verdict PASS : exécuté pour de vrai via `local_storage_mock.mjs` — fichier existant avant anonymisation confirmé, `anonymiserEmployeAction` purge réellement le fichier Storage (pas seulement les colonnes) |
| PE-06 | Signature électronique employé, réutilisable | **PASS** | Lot quick wins : cause V3 réfutée (sonde) ; **e2e rejoué cette mission** : vert après hydratation réelle + `scrollIntoViewIfNeeded` avant le geste (le canvas est sous la ligne de flottaison) ; signature stockée en base (`signature_storage_path` non nul) |
| PE-07 | Révoquer appareil mobile d'un salarié parti | **PASS** | Cette mission : la révocation inscrit la session GoTrue de l'appareil dans `sessions_revoquees` (+ suppression `auth.sessions`), `est_membre_actif`/`a_permission` renvoient false pour elle, le proxy déconnecte, plus de dé-révocation (migration 331) ; pgTAP `pe07_…` 22/22 ; e2e : gérant révoque → le même JWT non expiré ne lit plus rien via PostgREST direct (`[]`), navigation suivante renvoyée sur `/login`, session du gérant intacte |
| PA-01 | Créer une période de paie | PASS | V2json id=PA-01, verdict PASS |
| PA-02 | Dossier de paie individuel | PASS | V3 : exécuté en direct via Playwright, `tests/e2e/pilot-acceptance-v3.spec.ts:230-263`. Note explicite : réalisé avec le profil **gérant** et non **admin** — le poste « Administration » de cette fixture a `consulter_sa_paie`/`voir_paie_confidentielle`/`gerer_paie` tous à `false` (vérifié via `a_permission()`), seul gérant les détient réellement dans cette fixture pilote |
| PA-03 | Justifier une anomalie de paie | **MANUAL_EXPECTED** | V2 §4.5/V2json id=PA-03, verdict MANUAL_EXPECTED : mécanisme confirmé présent (`anomalies_paie.justification`) mais fixture pilote sans anomalie `niveau='bloquant'` non justifiée — fabriquer une anomalie pour la faire disparaître aussitôt aurait été une preuve non représentative |
| PA-04 | Accès direct `/paie` par un ouvrier → refusé | PASS | V2 §4.2 : `[URL-GUARD PA-04] redirected=true`, navigateur réel |
| PA-05 | Accès direct `/paie` par un chef de chantier → refusé | PASS | V3 : exécuté en direct via Playwright cette session, `tests/e2e/pilot-acceptance-v2.spec.ts:60-93` (`PA_05_CASE`, profil `chef_chantier`) — seul des 8 cas « preuve renforcée » que V2 n'avait pas rejoué en navigateur, maintenant fermé |
| PA-06 | Paramétrer profil de paie salarié | PASS | V2json id=PA-06, verdict PASS |

### Planning (PL)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| PL-01 | Créer affectation planning | PASS | V2json id=PL-01, verdict PASS |
| PL-02 | Affecter employé inactif → refusé avec message | PASS | V3/V2json id=PL-02, verdict PASS : **corrigé cette session** par `supabase/migrations/20260922000325_pl02_garde_fou_affectation_employe_actif.sql` (trigger BEFORE INSERT/UPDATE sur `affectations` exigeant un employé `statut='actif'`), 9/9 pgTAP (`supabase/tests/pl02_affectation_employe_actif.test.sql`), et `run_pilot_acceptance_v2.mjs` confirme que le bypass SQL direct est désormais bloqué au niveau DB (plus seulement en couche Server Action) |
| PL-03 | Historique de modification d'affectation | **PASS** | Cette mission : `affectations_historique` append-only alimentée par trigger (migration 329) ; pgTAP `pl03_…` 24/24 ; e2e : le chef de chantier modifie une affectation dans `/planning` → ligne `modification|heures|7.00|3.50|<auteur>` |
| PL-04 | Suppression groupée d'affectations | PASS | V2json id=PL-04, verdict PASS |
| PL-05 | Planning : ouvrier ne voit que ses affectations | **PASS** | Lot quick wins : policy RESTRICTIVE `role_affectation_select` (migration 327) ; pgTAP `pl05_…` 12/12 rejoué cette mission ; ce lot a en plus révoqué l'EXECUTE `anon` resté sur `peut_consulter_affectation_employe` (détecté par la suite pgTAP complète) |
| PL-06 | Heures cumulées équipe (`voir_heures_chantiers`) | PASS | V2json id=PL-06, verdict PASS |

### Pointage (PT)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| PT-01 | Pointer arrivée avec GPS | PASS | V2json id=PT-01, verdict PASS |
| PT-02 | Pointer arrivée sans GPS (motif) | PASS | V2json id=PT-02, verdict PASS |
| PT-03 | Pointer départ, heures calculées | PASS | V2json id=PT-03, verdict PASS |
| PT-04 | Déclarer pointage oublié a posteriori | PASS | V2json id=PT-04, verdict PASS |
| PT-05 | Valider pointage `a_verifier` | PASS | BASE : `terrain_mobile_v1d2_validation_pointage_runtime.test.sql` |
| PT-06 | Rejeter un pointage avec preuve | PASS | BASE : même fichier, motif obligatoire |
| PT-07 | Supprimer pointage validé → refusé | PASS | V2json id=PT-07, verdict PASS (vérifié par lecture avant/après pour éviter un faux positif) |
| PT-08 | Créer pointage pour un salarié depuis l'admin | **PASS** | Cette mission : RPC `creer_pointage_regularisation` (droit `gerer_pointage`, motif obligatoire, origine `regularisation_responsable`, auteur `regularise_par`, statut `a_verifier`, salarié notifié) + formulaire `/pointage/gestion` (migration 330) ; pgTAP `pt08_…` 26/26 ; e2e : le gérant saisit un pointage au nom de l'ouvrier, témoin DB exact ; formulaire absent pour l'ouvrier |
### Congés (CG)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| CG-01 | Déposer une demande de congés | PASS | V2json id=CG-01, verdict PASS |
| CG-02 | Approuver une demande, sync planning | PASS | V2json id=CG-02, verdict PASS |
| CG-03 | Refuser une demande avec motif | PASS | V2json id=CG-03, verdict PASS |
| CG-04 | Modifier une demande déjà approuvée → refusé | PASS | V2json id=CG-04, verdict PASS |

### Exports (EX)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| EX-01 | Export comptable Excel/CSV | PASS | V3 : exécuté en direct via Playwright, `tests/e2e/pilot-acceptance-v3.spec.ts:317-332` — téléchargement `.xlsx` déclenché, fichier non vide, verdict PASS confirmé cette session |
| EX-02 | Export RGPD données entreprise | PASS | V2json id=EX-02, verdict PASS |
| EX-03 | Accès `/exports` par un ouvrier → refusé | PASS | V2 §4.2 : `[URL-GUARD EX-03] redirected=true`, navigateur réel |
| EX-04 | Export comptable sur période sans données | PASS | V2json id=EX-04, verdict PASS |
| EX-05 | Export ZIP notes de frais, manifeste SHA-256 | PASS | BASE : `src/lib/expenses/export.test.ts` |

### Messagerie (MS)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| MS-01 | Créer conversation interne liée à un chantier | PASS | V2json id=MS-01, verdict PASS |
| MS-02 | Envoyer message + photo dans conversation | PASS | V2json id=MS-02, verdict PASS |
| MS-03 | Conversation d'un chantier non affecté → refusée/non listée | PASS | V2json id=MS-03, verdict PASS |
| MS-04 | Suggestion de réponse IA en messagerie | **REMOTE_ONLY** | V3 : investigué cette session, non exécuté — `src/lib/ai/providers/openai.ts` appelle le SDK OpenAI directement, nécessite une vraie `OPENAI_API_KEY` ; aucun mock/substitut local construit dans aucune session. Même bucket que les autres cas dépendant d'un service LLM externe réel |

### Documents et DOE (DOC)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| DOC-01 | Ajouter un document à un chantier | PASS | V2json id=DOC-01, verdict PASS (contourné pour `INSERT...RETURNING` via requête séparée, cf. V2 §8) |
| DOC-02 | Analyser un document par IA | **REMOTE_ONLY** | V1 §5/V2 §3 : `analyserDocumentIAAction` dépend d'un appel LLM réel, structurellement hors de portée du sandbox, inchangé en V3 |
| DOC-03 | PDF public devis/facture via lien partagé | PASS | BASE : `document_partage_public_par_jeton_v1.test.sql` |
| DOC-04 | Média protégé via route de partage scopée au jeton | PASS | BASE : `gp_pilot_document_partage_medias.test.sql` |

### RGPD (RG)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| RG-01 | Export données entreprise, droit vérifié | PASS | BASE : `gp_pilot_rgpd_manifeste_fichiers.test.sql` |
| RG-02 | Demande suppression entreprise, délai 30j | PASS | V2json id=RG-02, verdict PASS |
| RG-03 | Annuler suppression en cours de délai | PASS | V2json id=RG-03, verdict PASS |
| RG-04 | Anonymiser salarié parti (RGPD) | PASS | V2json id=RG-04, verdict PASS |
| RG-05 | Accès aux données personnelles (salarié) | **MANUAL_EXPECTED** | BASE (inchangé) : procédure documentée (`REGISTRE_TRAITEMENTS_RGPD.md`), l'entreprise pilote est responsable de traitement — décision de routage support, pas un code testable |

### Sécurité et cloisonnement des rôles (SEC)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| SEC-01 | Accès `/employes/[id]/modifier` collègue → refusé | PASS | V2 §4.2 : `[URL-GUARD SEC-01] redirected=true`, navigateur réel |
| SEC-02 | Accès `/parametres/acces` → refusé | PASS | V2 §4.2 : `[URL-GUARD SEC-02] redirected=true`, navigateur réel |
| SEC-03 | Accès `/rentabilite` et `/tresorerie` → refusé | PASS | V2 §4.2 : `[URL-GUARD SEC-03a/b] redirected=true` (les deux routes), navigateur réel |
| SEC-04 | Isolation multi-entreprise (écriture croisée) | PASS | BASE : `isolation_multitenant_comportement.test.sql`, 56 assertions |
| SEC-05 | Inspection Network, aucune donnée RH d'un tiers | **MANUAL_EXPECTED** | BASE (inchangé) : nécessite une inspection manuelle de l'onglet Network en session live |
| SEC-06 | Mutation RH reconstruite à la main → refusée | PASS | V2json id=SEC-06, verdict PASS |
| SEC-07 | Session support ne s'auto-attribue pas de siège/permission | PASS | V2json id=SEC-07, verdict PASS |
| SEC-08 | Auto-promotion rôle plateforme `total` → refusée | PASS | BASE (corrigé) : `gp_pilot_plateforme_admin_role_total.test.sql` |
| SEC-09 | Devis/facture brouillon ni envoyable ni public | PASS | BASE : `document_partage_public_par_jeton_v1.test.sql` |
| SEC-10 | Facture émise ne reçoit aucune nouvelle ligne | PASS | V2json id=SEC-10, verdict PASS |

### Support et incident (SUP)

| ID | Critère résumé | Statut | Preuve/Justification |
| --- | --- | --- | --- |
| SUP-01 | Message support depuis `/plateforme/support` | PASS | BASE : `src/app/actions/support.test.ts` |
| SUP-02 | Répondre à un message support | PASS | BASE : même fichier, notification exacte au bon destinataire |
| SUP-03 | Procédure perte d'accès (mot de passe oublié) | **MANUAL_EXPECTED** | BASE (inchangé) : procédure humaine documentée, 4 points de vérification d'identité |
| SUP-04 | Checklist incident « facture bloquée » | **MANUAL_EXPECTED** | BASE (inchangé) : mécanisme technique sous-jacent prouvé (FA-02), la checklist de triage elle-même est une procédure support |

