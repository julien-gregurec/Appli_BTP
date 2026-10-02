# ELSATIA — POST-V9 HARDENING V1 (candidat V9.1)

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v9-final` @ `6392131aa02cecc9991358915963068de8292d24` (389 migrations, dernière `20261002001113`) |
| Branche | `integration/elsatia-post-v9-hardening-v1` (créée pour cette mission ; V9 historique **non modifiée**) |
| Migrations ajoutées | `20261002001301_post_v9_service_role_fonctions_manquantes_v1`, `20261002001302_post_v9_sec4_entreprise_active_garde_v1` (après **tous** les numéros déjà réservés : `…1114-1116` Relevé, `…1201-1203` RGPD, intégrables plus tard sans renumérotation) |
| Déploiement | **aucun** : ni Preview, ni Production, ni Stripe (Test ou Live), ni merge `main` |
| Environnement | PostgreSQL 16 + pgTAP 1.3, Node 22, Vitest 4, Next 16.3.5, PostgREST 12.2.3 réel, passerelle auth locale, Playwright 1.62 + Chromium 1194 (WebKit **absent**) |

## 1. Synthèse

| Point | Reproduit ? | Déjà corrigé ? | Correction | Tests | Migration | Verdict |
|---|---|---|---|---|---|---|
| Lot A — 9 fonctions `*_service` | **oui** : 0/9 présentes sur V9, 9 appelants (PGRST202 → flux fermés) | non | portage sémantique des §5, §6, §8 de `service-role-flux-acl-v1.sql.proposed` ; `paie_import_*` **non** portées (SEC-6) | pgTAP 57 (ROUGE V9 → VERT) ; PostgREST réel ; route cron push réelle ; Vitest appelants | `…1301` | **FIXED** |
| SEC-4 — `entreprise_active_id` sans `WITH CHECK` | **oui** : un ouvrier de A pointe vers B, `contexte_abonnement_courant` révèle le nom de B | non | garde `BEFORE INSERT OR UPDATE OF entreprise_active_id` limitée aux écritures directes `authenticated`/`anon` | pgTAP 18 (6 ROUGES V9 → 18/18) | `…1302` | **FIXED** |
| SEC-5 — PDF de partage public | **oui** : Chromium lancé avant tout contrôle, Host falsifiable, aucun plafond, nom de fichier injectable | non | jeton résolu en base avant Chromium, origine figée `NEXT_PUBLIC_APP_URL`, nom issu du document, plafond IP `api:shared-pdf` 20/10 min | Vitest 6 (ROUGES V9 → VERTS) ; HTTP réel (404 sans rendu, 429, PDF 200) | — | **FIXED** |
| SEC-6 — import paie à secret global | **oui** (structurel) ; route **fermée** en V9 (503 : RPC absentes) | non | aucune : credential par tenant = décision produit/ops | témoin `it.fails` + test « fermé 503 » | — | **DECISION_REQUIRED** |
| Lot C — onboarding bloquant | **oui** : aucune sortie sur `src/app/onboarding/*` | non | `SortieOnboarding` : « Retour à l'accueil » / « Se déconnecter », logout serveur réel, destinations en liste blanche | Vitest 7 (2 ROUGES V9) ; Playwright 4 (clavier, mobile, logout réel, sans boucle, sans fuite) | — | **FIXED** |
| Lot D — V9-01 fuseau | **oui** : 5 écrans ; serveur UTC → 09:00 Paris stocké 09:00 UTC | non | contrat explicite `date-heure-locale.ts` + `ChampDateHeure` (fuseau navigateur transmis, repli Europe/Paris) | Vitest 34 (25 contrat + 9 action, dont 7 ROUGES V9) ; Playwright 5 (Paris, UTC, Tokyo, New York) | — | **FIXED** |
| Lot E — V9-02 Safari / date de fin | **oui** (logique) : vider un `datetime-local` impossible sous Safari, et une valeur invalide devenait « sans fin » | non | case explicite « Sans date de fin », `autocomplete="off"`, valeur invalide refusée | Vitest (composant 4, action 4) ; Playwright Chromium 4 (création, modification, suppression, réouverture, expiration) ; **WebKit non exécutable ici** | — | **FIXED** (WebKit : NOT_PROVEN) |
| Lot F — pied de facture Stripe | **oui** (audit) : pied posé à la seule création du Customer | non | **aucune modification** ; correctif code qualifié mais non appliqué ; runbook séparé | — | — | **DECISION_REQUIRED** |
| Lot G — contrôles | — | — | — | §9 | — | voir §9 |

## 2. Lot A — fonctions `*_service` historiquement manquantes

### 2.1 Inventaire sur V9 (`6392131a`)

| Fonction (signature appelée) | Présente V9 | Appelant(s) | Effet V9 |
|---|---|---|---|
| `compter_comptes_application_service(uuid)` | non | `src/lib/stripe-abonnement.ts` (`reconcilierAbonnementStripe`) | lève « Comptage des comptes facturables impossible » : aucune synchro de la quantité Stripe |
| `relances_auto_parametres_service()` | non | `src/lib/relances-config.ts` | cron de relances : `erreur` systématique |
| `relances_auto_candidats_service(uuid, text, integer)` | non | `src/lib/relances-moteur.ts` | idem |
| `relance_document_service(uuid, text, uuid)` | non | `src/lib/relances-moteur.ts` | idem |
| `relance_nouveau_lien_partage_service(uuid, text, uuid, text, timestamptz)` | non | `src/lib/documents-partage.ts` | relance auto sans lien |
| `push_notifications_en_attente_service(timestamptz, integer)` | non | `src/app/api/cron/notifications-push/route.ts` | cron push : HTTP 500 |
| `push_preparer_notification_service(uuid)` | non | `src/lib/push.ts` | aucune notification poussée |
| `push_marquer_notification_envoyee_service(uuid)` | non | `src/lib/push.ts` | — |
| `push_supprimer_abonnement_service(uuid, uuid)` | non | `src/lib/push.ts` | abonnements morts jamais purgés |

Aucune autre définition dans les 389 migrations ; une seule surcharge de chaque nom après correctif. Schéma V9
vérifié colonne par colonne contre la proposition (`employes.compte_application_statut`, `parametres_relances`,
`devis`/`factures`/`clients.relance_auto_exclue`, `client_snapshot`, `relances_documents`,
`acces_externes_documents.cree_par` nullable, `notifications_utilisateurs.push_envoyee_at`,
`preferences_notifications_push`, `push_abonnements`) : compatible sans adaptation.

### 2.2 Correctif

`20261002001301` reprend **à l'identique** les sections 5, 6 et 8 de la proposition : SECURITY DEFINER,
`search_path = public, pg_temp`, propriétaire `postgres`, `revoke all … from public, anon, authenticated`,
`grant execute … to service_role`. Volontairement non portés : sections 1-4 (hors des 9 fonctions ; Connect et
Boutique déjà présents en V9) et section 7 `paie_import_*` (rouvrirait l'import paie à secret global, SEC-6).
La proposition est annotée pour éviter un double portage.

### 2.3 Preuves

| Preuve | V9 | Hardening |
|---|---|---|
| pgTAP `post_v9_service_role_fonctions_v1` (57) | **ROUGE** : 4 not ok + 59 erreurs (fonctions absentes) | **57/57** |
| Flux légitimes (pgTAP, sous `service_role`) : décompte A = 2 actifs + 1 pause, entreprise inconnue 0 ; paramètres, candidats (plafond), document + client courant + historique, nouveau lien (révocation, un seul actif, `cree_par` NULL, empreinte invalide 22023) ; push (liste, contenu, préférence, suppression par propriétaire seul, marquage) | — | ✅ |
| Multi-tenant (pgTAP) : candidats, document et nouveau lien d'une autre entreprise refusés/null ; abonnement push de B intact ; authenticated et anon 42501 | — | ✅ |
| PostgREST 12.2.3 réel (clé service / clé anon) | — | service 200/204 sur les 7 appels ; anon **401 / 42501** |
| Route réelle `GET /api/cron/notifications-push` (GP compilé) | 500 attendu (RPC absente) | **200 `{"traitees":1}`**, notification marquée |
| Vitest appelants (`stripe-abonnement`, `relances-moteur-service`, `push`) | verts (mocks) | verts |

## 3. Lot B — SEC-4 / SEC-5 / SEC-6

Identification (sans supposition) : `docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md` §4, l. 65 et
186-188 nomme **SEC-4** = « `entreprise_active_id` sans `WITH CHECK` », **SEC-5** = « rate limit de la route PDF
de partage », **SEC-6** = « secret global de l'import paie », tous trois issus de
`docs/qualification/ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2.md` §7.

### 3.1 SEC-4 — FIXED

Reproduction V9 (pgTAP, rôle `authenticated`, ouvrier de A) : `update utilisateurs set entreprise_active_id = <B>`
**réussit** ; `contexte_abonnement_courant()` renvoie alors le **nom de B**. Policy V9 : `USING (id = auth.uid())`,
aucun `WITH CHECK` ; `GRANT UPDATE (entreprise_active_id)` à authenticated.

Correctif `20261002001302` : `utilisateurs_entreprise_active_garde()` (SECURITY INVOKER) ne bride que
`current_user in ('authenticated','anon')` ; nouvelle valeur NULL, inchangée, ou acceptée par
`entreprise_active_autorisee(uuid)` (SECURITY DEFINER, répond pour `auth.uid()` seulement : appartenance non
`desactive` ou accès support en cours). Les six écrivains légitimes (`creer_entreprise_bootstrap`,
`rejoindre_entreprise_par_code`, `activer_compte_employe`, `plateforme_entrer_entreprise`,
`plateforme_quitter_entreprise`, `tools_changer_entreprise_active`) sont SECURITY DEFINER, non modifiés, hors
garde — le flux d'onboarding « entreprise avant appartenance » (création atomique) n'est pas affecté.

| pgTAP `post_v9_sec4_entreprise_active_v1` (18) | V9 | Hardening |
|---|---|---|
| exploit refusé (42501), aucune fuite de nom, contexte inchangé, base inchangée, voie upsert refusée | **5 ROUGES** | ✅ |
| profil modifiable, bascule vers sa propre entreprise, NULL, création atomique, adhésion par code (en attente), bascule multi-appartenance, propriétaire non bridé | ✅ | ✅ |
| garde présente ; toute fonction écrivant `entreprise_active_id` est SECURITY DEFINER | 1 ROUGE / ✅ | ✅ |

Résiduel documenté : la garde ne réécrit pas les pointeurs **déjà** posés (voir §9.3, mesure sur données
d'upgrade) ; `contexte_abonnement_courant` n'est pas modifié (patch complémentaire possible : jointure
d'appartenance — non appliqué, il touche l'écran « en attente de validation »).

### 3.2 SEC-5 — FIXED

| Témoin (Vitest `pdf/route.test.ts`) | V9 | Hardening |
|---|---|---|
| jeton inconnu/expiré → 404 **sans** Chromium | ROUGE (200, rendu lancé) | ✅ |
| jeton mal formé → 404 sans base ni Chromium | ROUGE | ✅ |
| erreur de résolution → 404 sans Chromium | ROUGE | ✅ |
| Host falsifié (`169.254.169.254`) → Chromium visite l'origine configurée | ROUGE (SSRF) | ✅ |
| nom de fichier issu du document, pas de `?numero=` | ROUGE (`devis-pirate.pdf`) | ✅ |
| plafond IP `api:shared-pdf`, connecté ou non ; `/imprimer/partage` hors plafond (appelé par Chromium depuis le serveur) | ROUGE | ✅ |

HTTP réel (GP compilé, PostgREST réel) : 20 × **404 en ~20 ms** (aucun rendu), puis **429** au 21ᵉ ; jeton
valide avec `Host: evil.example` et `?numero=pirate&type=facture` → **200 `application/pdf`**, `%PDF-`,
`filename="devis-DEV-PV9-001.pdf"`. La résolution (`document_commercial_public_par_token`) est `STABLE`, sans
effet de bord (double appel route + page sans conséquence).

### 3.3 SEC-6 — DECISION_REQUIRED

État V9 : `PAYROLL_IMPORT_SECRET` unique, tenant choisi par `entreprise_reference` du corps. La route est
**fermée en pratique** (RPC `paie_import_*` absentes → 503 avant toute écriture) et le reste dans ce candidat
(les RPC ne sont pas portées). Témoins : `route-sec6.test.ts` — « fermé 503 » vert ; « un secret ne doit pas viser
deux tenants » en **échec attendu** (`it.fails`) tant que le défaut est ouvert. Correctif recommandé
(non minimal, provisioning à arbitrer) : credential par tenant ou HMAC couvrant corps + horodatage, ligne d'audit,
puis portage des deux RPC. `DECISION_REQUIRED:POST-V9-SEC6-PAYROLL-CREDENTIAL`.

## 4. Lot C — onboarding bloquant — FIXED

Parcours : utilisateur authentifié sans entreprise → `/onboarding` (redirigé par `getContexteEntreprise`), qui
n'offrait aucune sortie ; l'accueil `/` renvoie un utilisateur connecté vers `/dashboard` → `/onboarding`.

Correctif : `src/components/SortieOnboarding.tsx` (nav « Quitter la configuration du compte », deux boutons
natifs dans des formulaires — fonctionne sans JavaScript), `logoutAction(formData?)` ferme **réellement** la
session (`signOut`) puis redirige vers une destination en **liste blanche** (`src/lib/auth/sortie.ts` :
`accueil` → `/`, tout le reste → `/login`). Compte dépôt : jamais déconnecté sans mot de passe (inchangé).

| Preuve | Résultat |
|---|---|
| Vitest `sortie-onboarding.test.ts` (7) | V9 : 2 ROUGES (page sans sortie ; « accueil » menait à `/login`) → 7/7 |
| Playwright : présence, aucune donnée d'organisation (`PV9 Entreprise A`, `PV9 Tenant Secret B` absents) | ✅ |
| Playwright : « Se déconnecter » → `/login` ; `/onboarding` et `/dashboard` renvoient ensuite à `/login` (session fermée) | ✅ |
| Playwright clavier : bouton atteint par Tab, anneau de focus visible, Entrée → `/` sans boucle ; `/dashboard` → `/login` | ✅ |
| Playwright mobile 375 px (tactile) : boutons visibles, hauteur ≥ 44 px, aucun défilement horizontal, tap → `/` | ✅ |

## 5. Lot D — V9-01 fuseau — FIXED

Écrans concernés (inventaire exhaustif des `datetime-local`) :

| Écran | Parsing V9 | Rendu V9 | Servi en V3 |
|---|---|---|---|
| `/plateforme/entreprises/[id]/applications` (accès + habilitations, 4 champs) — **origine de V9-01** | `new Date(v)` serveur ; invalide → `null` | `getTimezoneOffset()` serveur | oui |
| `/chantiers/[id]/emails` (`recu_at`) | `new Date(v)` serveur | défaut `toISOString().slice(0,16)` (UTC) | oui (module cœur) |
| `/plateforme/communications` (`debutAt`, `finAt`) | chaîne brute → `new Date` | — | oui |
| `/crm` (`a_rappeler_at`) | chaîne brute → `timestamptz` (session UTC) | — | non (BETA) |
| `/appels-offres` (`date_limite`) | idem | — | non (DISABLED) |

Le même défaut touche les cinq : correctif écran par écran avec un **contrat unique**
(`src/lib/date-heure-locale.ts`) plutôt qu'un patch global : saisie = heure murale + fuseau IANA du navigateur
(`<nom>__fuseau`, posé par `ChampDateHeure`) ; conversion serveur explicite ; stockage UTC ; rendu dans le même
fuseau. Sans JavaScript, saisie et rendu utilisent `Europe/Paris` (cohérents). Changement d'heure : règle
« compatible » (heure inexistante poussée vers l'avant, heure ambiguë = première occurrence). Une valeur saisie
invalide est **refusée** (V9 la transformait en « pas de date »). `valeurDateHeureLocale` (rendu au fuseau du
serveur) est retirée.

| Preuve | Résultat |
|---|---|
| Vitest `date-heure-locale.test.ts` : Paris (hiver/été), UTC, Tokyo (+9), New York (−5/−4), Kolkata (+5:30), aller-retour, indépendance du fuseau serveur (UTC, Paris, Tokyo, Los Angeles), DST Paris/New York, invalides, contre-épreuve de l’ancienne conversion | 25/25 |
| Vitest `multi-app-dates.test.ts` (action serveur, `TZ=UTC`) | V9 : **7/9 ROUGES** → 9/9 |
| Playwright (serveur `TZ=UTC`, navigateur émulé) : habilitation 15/07/2026 09:00 → Paris `07:00Z`, UTC `09:00Z`, Tokyo `00:00Z`, New York `13:00Z` ; e-mail de chantier saisi à Tokyo → `00:00Z` | 5/5 |

## 6. Lot E — V9-02 Safari / « Sans date de fin » — FIXED (WebKit NOT_PROVEN)

`ChampDateHeure` avec `libelleSansValeur="Sans date de fin"` sur les deux champs « Valide jusqu'au » : case
cochée par défaut si aucune date n'est enregistrée ; cochée → champ désactivé et vidé, le serveur ignore toute
valeur résiduelle (`<nom>__aucune=1` → NULL) — contournement indépendant de la capacité de Safari à vider un
`datetime-local`. `autocomplete="off"` sur les champs date-heure (justification : l'autoremplissage Safari peut
réinjecter une valeur dans un champ que l'utilisateur ne sait pas vider).

| Preuve | Résultat |
|---|---|
| Vitest composant (rendu serveur : valeur au fuseau de référence, fuseau transmis, case cochée/décochée, champ désactivé, libellé associé) | 4/4 |
| Vitest action : création avec date, suppression par la case malgré une valeur résiduelle, date invalide refusée, fin < début refusée | 4/4 |
| Playwright Chromium (série) : création 31/12/2030 18:00 Paris → `17:00Z`, réouverture identique ; réouverture depuis New York → `12:00`, ré-enregistrement sans dérive ; suppression → NULL, réouverture case cochée + champ désactivé ; expiration (fin passée → « Expirée ») | 4/4 |
| Safari / WebKit Playwright | **NOT_PROVEN** : aucun binaire WebKit dans l'environnement, `playwright install` proscrit. Le correctif ne dépend d'aucun comportement propre à WebKit (case à cocher + serveur). À rejouer : `npx playwright test tests/e2e/post-v9-hardening.spec.ts --project=tablet-webkit` (retirer le filtre `@responsive`) sur un poste disposant de WebKit |

## 7. Lot F — pied de facture Stripe — DECISION_REQUIRED (audit seul)

Constat, impact (nul aujourd'hui — Live fermé ; réel après ouverture Live si l'identité prouvée évolue), différence
Test/Live, correctif code qualifié (synchronisation sur `invoice.created` brouillon + Customer existant avant
Checkout) mais **non appliqué** (il modifierait à l'exécution des Customers et factures Live existants) et
procédure de backfill Test : `docs/runbooks/ELSATIA_STRIPE_FOOTER_EXISTING_CUSTOMERS_V1.md`.
**Aucune mutation Stripe**, Test comme Live. `DECISION_REQUIRED:POST-V9-STRIPE-FOOTER-SYNC`.

## 8. Fichiers

- Migrations : `supabase/migrations/20261002001301_…`, `20261002001302_…`.
- pgTAP : `supabase/tests/post_v9_service_role_fonctions_v1.test.sql`, `post_v9_sec4_entreprise_active_v1.test.sql`.
- Code : `src/app/api/documents/partage/[token]/pdf/route.ts`, `src/lib/security/rate-limit.ts`,
  `src/app/actions/auth.ts`, `src/lib/auth/sortie.ts`, `src/components/SortieOnboarding.tsx`,
  `src/app/onboarding/page.tsx`, `src/lib/date-heure-locale.ts`, `src/components/ChampDateHeure.tsx`,
  `src/app/actions/{multi-app,appels-offres,suite-metier,emails-chantiers,plateforme-communications}.ts`,
  `src/app/(app)/{plateforme/entreprises/[entrepriseId]/applications,appels-offres,crm,chantiers/[id]/emails}/page.tsx`,
  `src/components/CommunicationRedaction.tsx`, `src/lib/multi-app.ts`.
- Tests : `src/app/api/documents/partage/[token]/pdf/route.test.ts`, `src/app/api/paie/import/route-sec6.test.ts`,
  `src/app/onboarding/sortie-onboarding.test.ts`, `src/lib/date-heure-locale.test.ts`,
  `src/app/actions/multi-app-dates.test.ts`, `src/components/ChampDateHeure.test.ts`, `src/lib/multi-app.test.ts`.
- Recette : `tests/e2e/post-v9-hardening.spec.ts`, `tests/e2e/post-v9-pile-locale/preparer-base.sh`,
  `tests/e2e/colors-pile-locale/passerelle.mjs` (option `PASSERELLE_AAL2_EMAILS`, vide par défaut : comportement
  historique inchangé), `config/env-manifest.json` (déclaration de la variable).
- Contrôles : `scripts/qualification/upgrade-v9-post-v9-hardening.sh`, DB verify contrôle 39,
  attendus du train resynchronisés (`npm run sync:train-expectations`).
- Docs : ce rapport, `docs/runbooks/ELSATIA_STRIPE_FOOTER_EXISTING_CUSTOMERS_V1.md`, annotation de
  `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed`.

## 9. Lot G — contrôles

### 9.1 Tableau

| Contrôle | V9 `6392131a` (référence) | Hardening | Verdict |
|---|---|---|---|
| `verify:migrations` | 389 valides | **391 valides**, noms et horodatages uniques | ✅ |
| `test:migration-targets` | — | partagé 391, Studio dédié 23 | ✅ |
| Intégrité des 389 migrations V9 | — | `git diff --stat 6392131a -- supabase/migrations` : **2 fichiers ajoutés, 0 modifié, 0 supprimé** | ✅ |
| `verify:secrets` | — | 3 622 fichiers, aucun secret | ✅ |
| `verify:env-manifest` / `test:env-manifest` | OK / 67 | OK / **67/67** (variable de recette `PASSERELLE_AAL2_EMAILS` déclarée) | ✅ |
| `sync:` puis `verify:train-expectations` | 389, `…1113`, 38 contrôles | **391, `…1302`, 39 contrôles** | ✅ |
| DB verify (`ELSATIA_PREVIEW_DB_VERIFY_V1.sql`) sur base fresh locale | 36/39 (contrôle 39 **ROUGE**) | **37/39** — les 2 KO restants (`url_preview`, propriétaire plateforme) sont des données d'environnement hébergé, identiques sur V9 | ✅ |
| pgTAP ciblé (2 suites post-V9, 75 tests) | **ROUGE** (10 not ok, 59 erreurs) | **75/75** (fresh) ; **75/75** sur base upgradée peuplée | ✅ |
| pgTAP complet (`pgtap-run-v3.sh`) | 165/174 propres, 8 917 ok (= rapport V9) | **167/176 propres, 8 992 ok** ; seule différence : les 2 nouvelles suites. Les 9 suites non propres sont **les mêmes** que V9 (pgsodium réel, suites Studio du projet partagé, Tools cloud sync) | ✅ |
| Vitest GP (racine + packages) | 2 845 ✓ / 189 ignorés | **2 897 ✓**, 1 échec attendu (`it.fails` SEC-6), 189 ignorés, 0 échec | ✅ |
| Typecheck GP (`tsc --noEmit`) | — | 0 erreur | ✅ |
| Lint GP (`eslint`) | 0 erreur, 15 avertissements | 0 erreur, **15 avertissements identiques** | ✅ |
| Build GP (`next build`) | — | ✅ (`exit 0`) | ✅ |
| Apps Tools / Réserves / Colors / Studio | — | **non touchées** (aucun fichier de `apps/`), non rebâties ; la passerelle de recette partagée garde son comportement par défaut | n/a |
| Playwright ciblé (`post-v9-hardening.spec.ts`, Chromium, serveur `TZ=UTC`) | — | **13/13** + rejeu C/D **8/8** | ✅ |
| Safari / WebKit | — | binaire absent, `playwright install` proscrit | **NOT_PROVEN** |
| Multi-tenant | — | pgTAP (isolation des 9 RPC, SEC-4 inter-tenant), sonde RLS réelle d'upgrade (2 499 cellules, 0 écart), suites d'isolation du pgTAP complet identiques à V9 | ✅ |
| Auth | — | Vitest `auth.test.ts` + `sortie-onboarding.test.ts`, Playwright logout réel, pgTAP onboarding (bootstrap, adhésion) sous garde SEC-4 | ✅ |
| SEC-5 HTTP réel | — | 20 × 404 (~20 ms, sans rendu) puis 429 ; PDF légitime 200 | ✅ |
| Upgrade V9 → hardening, passe **historique** (V3 → V9, 52 utilisateurs) | V8 → V9 rejoué : 47/47, schéma = fresh V9 | 0 écart lignes (284 tables), checksums 117/117, policies 658 = 658, droits 0, EXECUTE 0, **sonde RLS 51 × 2 499 cellules 0 écart**, 11 fonctions nouvelles (1 seule exécutable par l'API : `entreprise_active_autorisee`) ; schéma + ACL **identiques** au fresh hardening (36 416 lignes, 2 333 ACL) ; contrôles V9 **47/47** ; pgTAP post-V9 75/75 | ✅ |
| Upgrade V9 → hardening, passe **volumétrique** (500 → 20 000 lignes) | V8 → V9 rejoué : 33/33, schéma = fresh V9, 76 utilisateurs | 0 écart lignes (284 tables), checksums 117/117, policies 658 = 658, droits 0, EXECUTE 0, 11 fonctions nouvelles (1 exécutable API) ; schéma + ACL **identiques** au fresh hardening ; contrôles V9 **33/33** ; pgTAP post-V9 **75/75** | ✅ |
| Fresh install | 389/389 | **391/391** (`rebuild_db.sh`) | ✅ |

### 9.2 Reproduire

```bash
git fetch origin integration/elsatia-post-v9-hardening-v1 && git checkout integration/elsatia-post-v9-hardening-v1
npm ci && (cd tests/e2e/colors-pile-locale && npm ci)
scripts/local-postgres-bootstrap/rebuild_db.sh hard_fresh                                   # 391/391
scripts/qualification/pgtap-run-v3.sh hard_fresh 'post_v9_*.test.sql'                       # 75/75
scripts/qualification/pgtap-run-v3.sh hard_fresh                                            # 167/176
npx vitest run && npx tsc --noEmit --incremental false && npx eslint
npm run verify:migrations && npm run verify:secrets && npm run verify:env-manifest && npm run verify:train-expectations
# Upgrade avec données : base V9 peuplée depuis un worktree V9 VIERGE (le harnais V9 exige ses 17 migrations)
git worktree add --detach /var/tmp/v9wt 6392131aa02cecc9991358915963068de8292d24
(cd /var/tmp/v9wt && UPG_PASSE=historique UPG_OUT=/var/tmp/upg scripts/qualification/upgrade-v8-v9.sh upg_v9 <fresh-v9>)
scripts/qualification/upgrade-v9-post-v9-hardening.sh upg_v9 hard_fresh /var/tmp/upg/v7/gotrue.sql \
  scripts/local-postgres-bootstrap/upgrade_v7_v8_business_checks.sql
# Navigateur (variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service HS256, NEXT_PUBLIC_SUPABASE_URL,
# RATE_LIMIT_HMAC_KEY, NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100, POSTGREST_BIN, PW_CHROME_PATH,
# PASSERELLE_AAL2_EMAILS=plateforme@pv9.invalid)
tests/e2e/post-v9-pile-locale/preparer-base.sh pv9_e2e hard_fresh
tests/e2e/finance-pile-locale/demarrer-pile.sh pv9_e2e /tmp/pv9-logs
npx next build && TZ=UTC npx next start -p 3100 &
E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test tests/e2e/post-v9-hardening.spec.ts --project=desktop-chromium --workers=1   # 13/13
```

Note d'outillage : `pkill -f <motif>` tue le shell appelant si le motif figure dans la commande (déjà signalé
en V8) ; arrêter `next-server` par PID.

### 9.3 Observations (sans correctif dans ce lot)

- **SEC-4, pointeurs existants** : la garde ne réécrit pas les `entreprise_active_id` déjà posés. Mesure sur les
  bases upgradées (historique et volumétrique) : 51 pointeurs chacune, **0** sans appartenance ni accès support. À rejouer sur la Preview avant
  intégration :
  `select count(*) from utilisateurs u where entreprise_active_id is not null and not exists (select 1 from utilisateurs_entreprises ue where ue.utilisateur_id = u.id and ue.entreprise_id = u.entreprise_active_id and ue.statut <> 'desactive');`
- **Push, cron de secours** : `push_notifications_en_attente_service` (portée à l'identique) ne trie pas et plafonne
  à 200 ; la base historisée compte 300 notifications en attente sur 25 h. Le chemin normal est le webhook temps
  réel ; un tri `created_at` relève d'un lot ultérieur (`DEFERRED`).
- **Affichage serveur des horodatages** : hors champs de saisie, des rendus serveur `toLocaleString("fr-FR")` sans
  `timeZone` (ex. historique des e-mails de chantier) affichent l'heure UTC du serveur. Hors périmètre de V9-01
  (saisie) ; à traiter par un lot d'affichage dédié (`DEFERRED`).
- **Branche de session** : `claude/laughing-brown-kx0daj` (identique à `main`) n'a pas pu être alignée — la mise à
  jour exigeait une réécriture forcée, refusée par la politique d'exécution. Le candidat est publié sur
  `integration/elsatia-post-v9-hardening-v1` (création, aucune branche existante modifiée).


## 10. Statuts par point

| Point | Statut | Référence |
|---|---|---|
| Lot A — `compter_comptes_application_service` | **FIXED** | `…1301`, pgTAP, PostgREST réel |
| Lot A — `relances_auto_parametres_service` | **FIXED** | idem |
| Lot A — `relances_auto_candidats_service` | **FIXED** | idem |
| Lot A — `relance_document_service` | **FIXED** | idem |
| Lot A — `relance_nouveau_lien_partage_service` | **FIXED** | idem |
| Lot A — `push_notifications_en_attente_service` | **FIXED** | idem + route cron réelle |
| Lot A — `push_preparer_notification_service` | **FIXED** | idem |
| Lot A — `push_marquer_notification_envoyee_service` | **FIXED** | idem |
| Lot A — `push_supprimer_abonnement_service` | **FIXED** | idem |
| Lot A — `paie_import_*_service` (hors liste, même proposition) | **DECISION_REQUIRED** | lié à SEC-6 |
| SEC-4 | **FIXED** | `…1302` |
| SEC-5 | **FIXED** | route + politique `api:shared-pdf` |
| SEC-6 | **DECISION_REQUIRED** | `POST-V9-SEC6-PAYROLL-CREDENTIAL` |
| Lot C — onboarding bloquant | **FIXED** | `SortieOnboarding` |
| Lot D — V9-01 | **FIXED** | contrat `date-heure-locale` (5 écrans) |
| Lot E — V9-02 | **FIXED** (Chromium) ; Safari réel **NOT_PROVEN** | `ChampDateHeure` « Sans date de fin » |
| Lot F — pied de facture Stripe | **DECISION_REQUIRED** | `POST-V9-STRIPE-FOOTER-SYNC`, runbook |
| Observation push (tri / plafond) | **DEFERRED** | §9.3 |
| Observation affichage serveur des horodatages | **DEFERRED** | §9.3 |
| Aucun point | ALREADY_FIXED | aucun des points demandés n'était corrigé dans V9 |


## 11. Verdict

**POST_V9_HARDENING_LOCALLY_QUALIFIED**

- Branche : `integration/elsatia-post-v9-hardening-v1`
- SHA : tête de la branche — le commit qui ajoute ce rapport (communiqué avec la remise) ; code, migrations et
  recette identiques au commit `66c5a3db`, à la suite pgTAP `post_v9_service_role_fonctions_v1` près (fenêtre push
  bornée à la transaction, §9.3), revalidée sur fresh, V9 (rouge) et les deux bases upgradées
- Base : `6392131aa02cecc9991358915963068de8292d24` (V9 finale, intacte)

Toutes les corrections techniques demandées sont faites et prouvées localement (rouge sur V9 → vert, upgrade avec
données sans écart, fresh install, pgTAP complet identique à V9 hors nouvelles suites). Réserves, non bloquantes
pour la qualification locale, à lever avant intégration :
`DECISION_REQUIRED` SEC-6 et pied de facture Stripe ; Safari/WebKit réel non exécuté ; preuve hébergée (Preview)
non faite par construction. Intégration recommandée **après** la qualification Preview de V9, par
fast-forward de ce candidat (2 migrations postérieures au ledger V9).

