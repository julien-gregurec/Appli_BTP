# ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — flux `service_role` cassés par la 255

Date : 2026-09-11 · Base : Train V3 `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`
@ `59e960a` · Branche : `fix/service-role-flux-acl-255-v1` (worktree
`/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/service-role-flux-acl-v1`) · Poussée sans force pour
préservation (SHA dans le message de livraison, vérifié par `git ls-remote`), **non fusionnée, non
déployée, aucune migration numérotée**. Lot jumeau déjà préservé pour le lien client / PDF :
`fix/document-partage-service-role-acl-v1` @ `aa430ceb08b89fa769f5e3cf41c0473c34ec176a`
(`docs/audit/ELSATIA_DOCUMENT_PARTAGE_ACL_V1.md`).

**Verdict de validation (2026-09-11) : CORRECTIF SERVICE_ROLE PRÉSERVÉ — PRÊT POUR INTÉGRATION
SOUS CONDITIONS** (conditions et réserves en fin de section « Vérifications »).

## Verdict

**Hypothèse PROUVÉE pour 11 flux sur les 11 suspects**, par requête réelle. Dès que
`20260902000255_acl_reconciliation_v1.sql` est appliquée (elle fait partie du delta de cutover
Production), les webhooks Stripe Connect et Boutique répondent 500 à chaque évènement, la
réconciliation d'abonnement **supprime l'item Stripe « comptes supplémentaires »**, l'import et
l'export de paie échouent, le retour Powens ne réconcilie plus rien, aucune notification push ni
relance automatique ne part, et deux journaux d'audit ne sont plus écrits. **Bloquant cutover.**

Constat de sécurité en plus : la 255 a retiré l'EXECUTE de `boutique_finaliser_commande_payee` à
`service_role` mais l'a **laissé à `authenticated`** — tout utilisateur connecté peut marquer
payée sa propre commande Boutique sans payer. Et même sans cette RPC, la règle RLS
`boutique_commandes_maj` laisse le client propriétaire (droit `gerer_boutique`) écrire
`statut = 'payee'` par un simple PATCH PostgREST, ou insérer une commande déjà payée.
**Décision D1 (validée le 2026-09-11) appliquée** : EXECUTE retiré à `authenticated`/`anon`,
rendu au seul chemin serveur, et déclencheur qui réserve l'état « payee » aux fonctions serveur.

## Méthode

- **Clone jetable** `acl_flux_jetable` de la base de la pile E2E Train V3 (`pg_dump`/`pg_restore`
  en `supabase_admin` dans le conteneur `supabase_db_elsatia-train-v3-e2e`) ; la base `postgres` de
  la pile n'a subi aucune écriture. Aucune opération sur `supabase_db_btp-platform`.
- Chaque appel `supabase-js` du code traduit en SQL exact (sélection, filtres, `count`, jointure
  d'embed, `upsert … on conflict`), joué seul dans
  `begin; set local role service_role; set_config('request.jwt.claims','{"role":"service_role"}'); <requête>; rollback;`
  (les claims reproduisent PostgREST : sans eux, `utilisation_stockage_entreprise` refuse à tort).
- EXECUTE des RPC appelées vérifié au catalogue ; droits par colonne lus dans
  `information_schema.column_privileges` (jamais `has_table_privilege` seul).
- Même preuve rejouée sur une **installation fraîche** Train V3 (278 migrations, conteneur jetable
  `acl-flux-fresh-jetable`, harnais `ELSATIA-STACKS/train-v3-dbtest/harness.sh`).

Script de preuve : 58 requêtes → **32 refusées en `42501`**, 26 acceptées (contrôles), avec des
refus identiques ligne à ligne sur le clone E2E et sur la base fraîche.

## Flux par flux

| # | Flux (fichier) | Requêtes refusées `42501` | Effet réel après la 255 | Correctif proposé |
|---|---|---|---|---|
| 1 | Webhook Stripe Connect, factures clients (`src/app/api/stripe/webhook/route.ts`) | INSERT `stripe_webhook_events` ; SELECT `factures` ; INSERT `paiements` ; UPDATE `factures` (payée / expirée) | 500 « Journal indisponible » à chaque évènement : aucun paiement par carte d'une facture client n'est enregistré | GRANT INSERT sur 4 colonnes de `stripe_webhook_events` ; `stripe_connect_encaisser_facture_service`, `stripe_connect_expirer_checkout_facture_service` |
| 2 | Webhook Boutique (`src/app/api/stripe/boutique/webhook/route.ts`) | INSERT `stripe_webhook_events` ; EXECUTE `boutique_finaliser_commande_payee` ; UPDATE `boutique_commandes` | 500 à chaque évènement | même GRANT ; EXECUTE rendu à `service_role` **et retiré à `authenticated`** ; `boutique_expirer_commande_service` ; déclencheur D1 `boutique_commandes_paiement_serveur_seul` |
| 3 | Réconciliation des comptes supplémentaires (`src/lib/stripe-abonnement.ts`, appelée par le cron quotidien, le webhook abonnement et le changement de statut d'un compte) | `count` sur `employes` | `count = null` → quantité 0 → **DELETE de l'item Stripe** : sous-facturation silencieuse | `compter_comptes_application_service` ; le code échoue désormais explicitement au lieu de compter 0 |
| 4 | Cron paie, resynchronisation des périodes ouvertes (`src/app/api/cron/abonnements/route.ts`) | SELECT `periodes_paie` | aucune période resynchronisée (erreur dans le JSON du cron) | GRANT SELECT (`id`, `entreprise_id`, `statut`) — `synchroniser_periode_paie_service` reste exécutable |
| 5 | Relances automatiques (`src/lib/relances-cron.ts`, `relances-config.ts`, `relances-moteur.ts`) | SELECT `parametres_relances`, `devis`, `factures`, `relances_documents` ; UPDATE/INSERT `acces_externes_documents` | `data = null` pris pour « aucune entreprise » : **aucune relance automatique ne part, sans erreur** | `relances_auto_parametres_service`, `relances_auto_candidats_service`, `relance_document_service`, `relance_nouveau_lien_partage_service` ; « chemin de service » du moteur, réservé au cron |
| 6 | Import des bulletins par l'expert-comptable (`src/app/api/paie/import/route.ts`) | SELECT `employes`, `bulletins_paie` ; INSERT `bulletins_paie`, `journal_paiements_bancaires` | 404 « Salarié introuvable » pour tout bulletin | `paie_import_preparer_bulletin_service`, `paie_import_enregistrer_bulletin_service` (bulletin + trace bancaire atomiques) |
| 7 | Export d'une période de paie (`src/app/api/paie/periodes/[id]/export/route.ts`) | INSERT `journal_audit_paie` ; UPDATE `periodes_paie` | `journaliserExport` lève → **400 « Export de paie impossible »** : l'export est refusé à l'utilisateur | GRANT INSERT sur 8 colonnes de `journal_audit_paie` ; GRANT UPDATE (`date_export`, `updated_at`) de `periodes_paie` — **aucun code modifié** |
| 8 | Téléchargement d'une pièce de paie (`src/app/api/paie/documents/[id]/route.ts`) | INSERT `journal_audit_paie` | erreur ignorée : pièce servie **sans trace d'audit**, anomalie d'intégrité non journalisée | même GRANT INSERT — aucun code modifié |
| 9 | Retour bancaire Powens (`src/app/api/paiements-bancaires/powens/callback/route.ts`) | SELECT `lots_virements` | « Lot bancaire introuvable » : lot jamais réconcilié | GRANT SELECT (`id`, `entreprise_id`, `provider_payment_id`) — `reconcilier_lot_virements` reste exécutable ; aucun code modifié |
| 10 | Notifications push (`src/lib/push.ts`, webhook `api/webhooks/notifications-push`, cron `api/cron/notifications-push`) | SELECT/UPDATE `notifications_utilisateurs` ; SELECT `preferences_notifications_push` ; SELECT/DELETE `push_abonnements` | webhook : rien n'est poussé ; cron : 500 | `push_notifications_en_attente_service`, `push_preparer_notification_service`, `push_marquer_notification_envoyee_service`, `push_supprimer_abonnement_service` |
| 11 | Signature d'un document en son nom (`src/app/actions/signatures-documents.ts`) | INSERT `journal_activite` | erreur ignorée : signature enregistrée, **trace d'activité perdue** | GRANT INSERT sur 7 colonnes de `journal_activite` — aucun code modifié |

**Vérifiés non cassés** (même méthode) : toutes les lectures et mises à jour d'`entreprises` du
périmètre (statut d'abonnement, dernière facture, `stripe_customer_id`, option IA, onboarding
Connect — couvertes par les droits par colonne) ; `signatures_documents` ; Storage
(`bulletins-paie`, `documents-employes`) ; les RPC `*_service` d'abonnement, de stockage, de
capacité et de remise ; `notifier_pointages_manquants_et_a_valider` ; `reconcilier_lot_virements` ;
`relance_reclamer`/`relance_finaliser` ; `consommer_rate_limit` (limiteur du proxy) ; les RPC du cron
Réserves (`apps/reserves`). Les refus métier observés sur ces RPC (« Période introuvable », « Lot
introuvable ») viennent des identifiants aléatoires du script, pas d'un droit.

## Correctif proposé

Règle, du plus étroit au moins étroit :

1. **Journaux en ajout seul** écrits par le serveur (`stripe_webhook_events`, `journal_audit_paie`,
   `journal_activite`) : GRANT INSERT sur les seules colonnes écrites. Ni SELECT, ni UPDATE, ni
   DELETE — l'immuabilité reste entière, le code ne change pas, la détection de doublon par 23505
   est intacte.
2. **Identifiants techniques** (`periodes_paie`, `lots_virements`) : GRANT SELECT/UPDATE sur les
   seules colonnes lues ou écrites (ni montants, ni statut, ni IBAN).
3. **Données métier ou personnelles, ou écritures multi-tables** : fonction `SECURITY DEFINER`
   `*_service`, `search_path = public, pg_temp`, exécutable par `service_role` **seul** (ni PUBLIC,
   ni anon, ni authenticated) — même schéma que la 262 (webhook abonnement). **Aucune table métier
   n'est regrantée**, même par colonne (14 tables contrôlées en pgTAP).

Fichiers :

- `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed` — sans numéro, 14 fonctions +
  6 grants par colonne + correction de l'EXECUTE Boutique + déclencheur D1, retour arrière en fin
  de fichier ;
- `docs/migrations-proposees/service-role-flux-acl-v1.pgtap.sql.proposed` — **148 assertions**
  (dont 14 pour D1), à placer dans `supabase/tests/service_role_flux_acl_v1.test.sql` avec la
  migration numérotée ;
- recette E2E ciblée : `tests/e2e/service-role-flux-acl.spec.ts` (9 parcours, inactif sauf
  `E2E_ACL_FLUX=1`) et `tests/e2e/support/` (simulateur local Stripe Test / Brevo / Powens /
  points d'envoi push, préchargement d'interception qui refuse toute clé `sk_live`, amorçage) ;
- code (seuls les flux 1, 2, 3, 5, 6, 10 changent) : `src/app/api/stripe/webhook/route.ts`,
  `src/app/api/stripe/boutique/webhook/route.ts`, `src/lib/stripe-abonnement.ts`,
  `src/lib/relances-{config,cron,moteur}.ts`, `src/lib/documents-partage.ts`
  (`obtenirNouveauTokenPartageService`), `src/app/api/paie/import/route.ts`, `src/lib/push.ts`,
  `src/app/api/cron/notifications-push/route.ts` ;
- tests : `src/app/api/stripe/webhook/route.test.ts` (7), `src/app/api/paie/import/route.test.ts`
  (4), `src/lib/push.test.ts` (5), `src/lib/relances-moteur-service.test.ts` (5),
  `src/lib/stripe-abonnement.test.ts` (+1), et une **garde statique**
  `src/lib/supabase/service-role-acl.test.ts` qui refuse tout `<client admin>.from("<table>")` hors
  des tables ouvertes à `service_role`.

Livraison : **SQL d'abord, code ensuite, dans le même train**. Les grants des flux 4, 7, 8, 9, 11
réparent sans code ; le code des autres flux appelle les nouvelles fonctions et échoue visiblement
tant qu'elles n'existent pas.

### Décision D1 — seul le chemin serveur marque une commande Boutique payée

`boutique_finaliser_commande_payee` n'est plus exécutable que par `service_role`, c'est-à-dire par
le webhook Boutique après vérification de la signature Stripe, du mode (`STRIPE_WEBHOOK_EXPECTED_MODE`)
et de `payment_status`. Le déclencheur `boutique_commandes_paiement_serveur_seul` (BEFORE INSERT OR
UPDATE, **sans** SECURITY DEFINER pour que `current_user` reste le rôle appelant) refuse en `42501`
à `anon` et `authenticated` toute entrée dans l'état « payee » et toute modification d'une commande
payée ; les fonctions serveur, qui s'exécutent en propriétaire, ne sont pas concernées. Les
écritures légitimes du client (`brouillon` → `en_attente_paiement` → `annulee`, coordonnées de
livraison, session Checkout — seules écritures du code, `src/app/actions/boutique.ts`) restent
permises.

| Exigence D1 | Preuve pgTAP (base fraîche) | Preuve PostgREST réelle | Preuve E2E |
|---|---|---|---|
| refus pour `anon` | appel réel → `42501` ; pas d'EXECUTE au catalogue | `42501` | — |
| refus pour `authenticated` | utilisateur d'une autre entreprise → `42501` | `42501` | — |
| refus pour le client propriétaire | RPC → `42501`, avec `a_permission(…, 'gerer_boutique')` vrai (la RLS lui ouvre bien la table) | `42501` | jeton GoTrue réel de l'administrateur A → `42501` |
| autorisation du seul chemin technique | `service_role` finalise → `payee` | `OK`, puis `payee` en base | webhook signé → `payee` + dépense fournisseur |
| pas de contournement par appel direct | PATCH `statut='payee'` → `42501` ; INSERT d'une commande déjà payée → `42501` ; commande payée non modifiable → `42501` ; écriture légitime du client toujours appliquée | idem (4 cas) | PATCH `statut='payee'` → `42501`, écriture légitime → 200 |

### Changements de comportement voulus

- Webhook Connect : une panne d'encaissement répond 500 (avant : 200 silencieux). Un identifiant de
  facture ou d'entreprise non UUID reste ignoré comme avant.
- Réconciliation des comptes : un comptage impossible lève une erreur ; les trois appelants la
  tolèrent déjà (action employés `.catch`, cron par entreprise, webhook abonnement qui annule sa
  réservation et laisse Stripe réessayer) — plus jamais de suppression d'item sur un comptage absent.
- Import paie : panne de lecture → 503 « Import temporairement indisponible » (avant : 404 « Salarié
  introuvable ») ; bulletin et trace bancaire écrits dans la même transaction.
- Relances : panne de chargement visible dans le JSON du cron (`relances.erreur`), panne par
  entreprise comptée en échec ; le lien de partage émis par le cron a `cree_par = NULL` (le code
  passait l'identifiant d'entreprise, refusé par la clé étrangère vers `utilisateurs` : l'e-mail
  partait sans lien) ; le client n'est lu que s'il appartient à l'entreprise du document.
- Push : une panne de lecture est journalisée et laisse la notification en attente pour le cron.
- Boutique : `authenticated` perd l'EXECUTE de `boutique_finaliser_commande_payee`.

## Vérifications

| Contrôle | Résultat |
|---|---|
Mesures sur l'**arbre final** (après décision D1), sauf mention « premier passage ».

| Contrôle | Résultat |
|---|---|
| Preuve SQL sur le clone E2E, sans correctif (premier passage) | 32 refus `42501` sur 11 flux, 26 requêtes de contrôle acceptées |
| Preuve SQL sur base fraîche Train V3, sans correctif (premier passage) | 32 refus `42501`, **mêmes requêtes** (diff limité aux données : entreprise de recette absente) |
| pgTAP proposé, base fraîche, **sans** le correctif (premier passage) | rouge : 0 assertion passée, 14 `not ok` (fonctions absentes) puis transaction avortée |
| pgTAP proposé, base fraîche (harnais `train-v3-dbtest`, 278 migrations), **avec** le correctif | **148/148** (dont 14 D1 et 1 sur l'échelle du montant encaissé) ; SQL final **réappliqué** sans erreur (rejouable) ; la nouvelle assertion d'échelle est **rouge** contre la fonction d'avant correctif (`50.0000000000000000`) |
| 70 suites pgTAP existantes, même base, avec le correctif | **70/70, 1 902 assertions, 0 échec** — identique à la référence sans correctif : aucune régression |
| PostgREST réel : `postgrest-js` + Kong + PostgREST v14.14 d'une **pile Supabase dédiée** (`acl-flux-e2e`, SQL proposé appliqué, fixture chargée), jetons `service_role`, `anon` et utilisateurs réels | **36/36 conformes** : les 11 flux passent avec les appels exacts du code, lectures directes toujours refusées, 8 cas D1 conformes |
| `npm run verify` complet | **ÉCHEC, préexistant** : `vitest` 1 746/1 749 — 3 tests en dépassement de délai à froid (`xlsx.test.ts`, contrôle de mode du webhook Boutique + un échec par contagion). **Identiques sur la base `59e960a` sans le lot** (1 722/1 725, mêmes 3 tests, 7,2 s et 8,1 s) ; passent isolément (9/9 en 4 s). Aucun délai modifié. |
| — typecheck (4 applications) | OK |
| — lint (4 applications) | 0 erreur ; 4 avertissements, tous dans des fichiers antérieurs au lot |
| — `verify:migrations` | OK — 278 migrations valides (aucune migration ajoutée ni modifiée) |
| — `verify:secrets` | OK — 1 725 fichiers suivis, aucun secret |
| — `verify:stripe-prices` | OK — 27 prix Stripe **Test** alignés sur le catalogue (lecture seule par la CLI Stripe du poste) |
| — builds, lancés à part après l'échec vitest | **OK** : `next build` + tools (563 s), reserves (138 s), colors (87 s) — colors en mode recette déclaré `ELSATIA_APPLICATION_ENV=local` : dans son mode « publié » par défaut, son contrôle préalable exige une URL Supabase https et 3 variables propres à Colors (attendu sur une recette locale ; le lot ne modifie aucun fichier de `apps/`) |
| vitest des fichiers du lot | 139/139 au premier passage ; garde statique réécrite (pré-filtre `git grep`) après un dépassement de délai sous charge |
| E2E Playwright ciblés (`tests/e2e/service-role-flux-acl.spec.ts`, `next start` du build de production + pile dédiée + simulateur local) | **9/9 en un seul passage** (5,5 s), après amorçage versionné rejouable : Connect (paiement unique, doublon, expiration) ; Boutique (webhook → `payee` + dépense fournisseur, expiration) ; D1 (jeton GoTrue réel du propriétaire : RPC et PATCH `42501`) ; abonnement `invoice.paid` ; cron quotidien (comptes supplémentaires : `quantity=1`, **aucun DELETE** d'item Stripe ; période de paie synchronisée ; relance envoyée, lien sans auteur) ; import de bulletin (bulletin `a_verifier`, trace bancaire, fichier en Storage) ; export de paie par une vraie session (CSV servi, audit + date d'export) ; Powens (lot réconcilié) ; push (envoi chiffré réel vers HTTPS local, abonnement 410 supprimé, webhook et cron) |
| typecheck racine sur l'arbre final (après les derniers ajustements du spec) | OK |
| `verify:secrets` / `verify:migrations` sur l'arbre final | OK / OK |
| `git diff --check` | OK |

**Défaut du lot trouvé et corrigé pendant cette validation** : la fonction
`stripe_connect_encaisser_facture_service` divisait les centimes par 100 sans arrondir ;
`paiements.montant` étant un `numeric` sans échelle, le paiement était stocké
`50.0000000000000000` (valeur juste, représentation polluée pour l'affichage et les exports).
Corrigé par `round(…, 2)` ; assertion pgTAP ajoutée (rouge avant, verte après) ; parcours E2E
vert (`1|50.00`). La garde statique `service-role-acl.test.ts` a aussi été réécrite (pré-filtre
`git grep`) : elle dépassait 5 s sous la charge d'une suite complète.

**Enseignements du harnais E2E** (aucun ne relève du lot, tous documentés dans
`tests/e2e/support/`) : sous `next start` (production), le limiteur de débit exige
`RATE_LIMIT_HMAC_KEY` et répond 503 sans elle ; GoTrue refuse les utilisateurs de la fixture
pgTAP tant que leurs colonnes de jetons sont NULL ; la fixture donne `mode_compte_depot` au poste
administrateur A (redirection vers la borne de stock) et laisse `entreprise_active_id` nul ;
`exporter_paie` est une fonctionnalité « avancée » que l'offre Mini n'ouvre pas ; les UUID de la
fixture ne sont pas conformes RFC 4122 (refusés à juste titre par le webhook abonnement) ;
`page.request` de Playwright n'envoie pas les cookies `Secure` sur `http://127.0.0.1`.

### Réserves et conditions d'intégration

1. **Rejeu Stripe** : aucune clé Stripe Test n'est disponible sur le poste pour l'application
   (seule la CLI sert au contrôle des prix, en lecture). Les évènements Connect, Boutique et
   abonnement sont des évènements **mode Test signés localement** avec les secrets de recette, et
   l'API Stripe appelée par le serveur (réconciliation des comptes) est **simulée** localement ;
   aucun objet n'a été créé dans le compte Stripe Test. À rejouer avec `stripe listen` /
   `stripe trigger` contre un déploiement de préversion avant la mise en service.
2. **Tests vitest préexistants** instables sous charge (3 tests ci-dessus) : à stabiliser dans un
   lot distinct (import à froid dans le premier test) ; ils échouent déjà sur la base.
3. **Signature d'un document** (flux 11) et **téléchargement d'une pièce de paie** (flux 8) : prouvés
   en pgTAP et par PostgREST réel, pas en E2E (il faudrait une signature et une pièce en Storage).
4. **Transport push** : chiffrement et envoi réels vers un point HTTPS local (certificat de
   recette) ; pas vers un vrai service push de navigateur.
5. **Intégration** : SQL proposé à numéroter au prochain train, livré AVANT le code, dans le même
   train que `fix/document-partage-service-role-acl-v1` ; D2 (TRUNCATE) et D3 (idempotence du
   webhook Connect) restent ouverts pour un lot de sécurité distinct.

## Constats annexes

1. **Faille Boutique** (ci-dessus) : à traiter comme P0 sécurité dès que la Boutique est activée ;
   aujourd'hui masquée par le flag et le catalogue vide.
2. **Idempotence du webhook Connect (décision D3 : documenté, NON corrigé ici — lot de sécurité
   distinct)**. Scénario précis de perte d'un évènement, identique pour le webhook Boutique :
   1. Stripe envoie `checkout.session.completed` (id `evt_X`) pour une facture client payée ;
   2. la route insère `evt_X` dans `stripe_webhook_events` — la réservation est **validée
      immédiatement** (requête autonome, pas de transaction commune avec le traitement) ;
   3. le traitement échoue après la réservation : RPC d'encaissement en erreur (panne, droit,
      verrou, délai), ou fonction serverless interrompue ; la route répond 500 (ou rien) ;
   4. Stripe renvoie `evt_X` plus tard (reprises automatiques jusqu'à 3 jours) ;
   5. l'INSERT lève 23505 : la route répond `200 { duplicate: true }` **sans rien traiter** ;
   6. Stripe considère l'évènement livré et cesse les reprises : la facture reste impayée dans
      ELSATIA alors que le client a payé, sans aucune alerte ; seul un rapprochement manuel le
      révèle. Avant ce lot, l'étape 3 était même silencieuse (réponse 200).

   Invariants exigés du futur correctif :
   - **nouvel essai après échec** : un évènement dont le traitement a échoué doit pouvoir être
     retraité au renvoi suivant (réservation annulée ou marquée `echec`, jamais laissée « reçue ») ;
   - **idempotence après succès** : un évènement traité avec succès ne produit aucun effet au
     renvoi (réponse 200 `duplicate`) ;
   - **journalisation de l'erreur** : chaque échec est consigné (identifiant d'évènement, type,
     code d'erreur, horodatage, nombre d'essais) sans donnée de carte ni secret, et visible ;
   - **aucun double effet métier** : ni double paiement (`paiements.stripe_session_id` unique déjà
     en place), ni double décrément de stock Boutique, ni double dépense fournisseur, même si deux
     livraisons concurrentes du même évènement arrivent (réservation + traitement dans une même
     transaction, ou verrou par évènement) ;
   - **même garde de mode** que le webhook Boutique (`livemode` confronté à l'environnement).

   Modèle existant à reprendre : la 262 pour le webhook abonnement
   (`reserver_evenement_abonnement_service` / `finaliser_…` / `annuler_…`).
3. **Lien de relance** : même avant la 255, le cron passait l'identifiant d'entreprise comme
   `cree_par` → violation de clé étrangère → e-mails de relance automatiques sans lien. Corrigé par
   `relance_nouveau_lien_partage_service`.
4. Les pages publiques de partage (`/document/[token]`, `/imprimer/partage/[token]`) sont corrigées
   par la branche jumelle ; les deux lots doivent entrer dans le même train.
5. Le clone de la pile E2E n'a pas l'`USAGE` de PUBLIC sur `public` (déjà noté par le lot jumeau) :
   sans effet ici, `service_role` a son propre `USAGE`.
6. **`TRUNCATE` resté à `service_role` (décision D2 : documenté, NON corrigé ici — lot de
   sécurité distinct)**. Sur une installation fraîche du Train V3 (278 migrations, harnais
   `train-v3-dbtest`), mesuré le 2026-09-11 :
   - `service_role` a `REFERENCES, TRIGGER, TRUNCATE` sur **200 des 220 tables** de `public`
     (liste exacte en **annexe A** ; `information_schema` en compte 201 car le même droit figure aussi
     sur la vue `mes_remises_visibles`) et `MAINTAIN` sur 205 relations ;
   - origine : le privilège par défaut `postgres` sur `public`
     (`{postgres=arwdDxtm/postgres,authenticated=m/postgres,service_role=Dxtm/postgres}`) accorde
     `D` (TRUNCATE), `x` (REFERENCES), `t` (TRIGGER) et `m` (MAINTAIN) à toute table créée ; la 255
     ne retire que SELECT/INSERT/UPDATE/DELETE ;
   - les 20 tables SANS TRUNCATE (migrations qui révoquent tout explicitement) :
     `colors_analyses_ocr, colors_emplacements, colors_mouvements, colors_nettoyages_photos,
     colors_parametres, colors_seaux, contrats_abonnement, generations_tarifaires,
     historique_capacite_personnes, historique_contrats_abonnement, historique_modules_entreprises,
     historique_remises_commerciales, modules_entreprises, modules_gestion_pro,
     modules_gestion_pro_tarifs, operations_capacite_stripe, plateforme_operations_remise,
     plateforme_operations_remise_historique, plateforme_verrous_remise_stripe,
     remises_commerciales` ;
   - risque : `TRUNCATE` ne déclenche ni `journal_paie_immuable` ni aucun déclencheur
     BEFORE UPDATE/DELETE : la clé de service peut vider d'un coup les journaux d'audit
     (`journal_audit_paie`, `journal_activite`, `journal_paiements_bancaires`…) et toute table
     métier. Aucun code n'utilise `TRUNCATE`.
   - Le clone de la pile E2E (montée différemment) n'a **pas** ces privilèges par défaut :
     l'état de Production ne peut pas être déduit, il faut le **lire**.

   Requête d'audit Production, **strictement en lecture seule** (transaction `read only`, aucun
   verrou d'écriture, aucun effet) :

   ```sql
   begin transaction read only;
   select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
   from information_schema.role_table_grants
   where grantee = 'service_role' and table_schema = 'public'
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
   group by table_name
   order by table_name;
   select count(*) filter (where has_table_privilege('service_role', c.oid, 'TRUNCATE')) as tables_truncate,
          count(*) filter (where has_table_privilege('service_role', c.oid, 'MAINTAIN')) as tables_maintain,
          count(*) as tables_public
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');
   select defaclrole::regrole as role_createur, defaclobjtype as type_objet, defaclacl as droits_par_defaut
   from pg_default_acl where defaclnamespace = 'public'::regnamespace;
   rollback;
   ```

   Le correctif (REVOKE TRUNCATE/TRIGGER/REFERENCES/MAINTAIN de `service_role` et révision du
   privilège par défaut) relève du lot de sécurité distinct, après lecture de la Production.

## Contraintes respectées

Aucune migration existante modifiée, aucun numéro réservé, aucun déploiement, aucune fusion ;
push **sans force** de la seule branche du lot ; aucun `git clean/reset/rebase/amend/force-push`.
Aucun accès Stripe Live (le préchargement de recette refuse toute clé `sk_live`/`rk_live`). Aucune
base partagée ni de Production touchée : `supabase_db_btp-platform` et les piles des autres lots
non modifiées ; au premier passage la base `postgres` de la pile E2E Train V3 n'a subi que des
lectures (`pg_dump`). Toutes les mesures de validation ont tourné sur des objets **dédiés au lot**
et jetables : conteneur `acl-flux-fresh-jetable` (harnais), pile `elsatia-acl-flux-e2e` (script
`ELSATIA-STACKS/acl-flux-e2e/pile.sh`, ports 60421/60422), simulateur local 3197/3198, serveur de
recette 3110 — arrêtés et supprimés en fin de lot. Les secrets employés sont des valeurs de
démonstration/recette ; aucun secret réel n'a été lu ni affiché.

## Annexe A — tables où `service_role` garde TRUNCATE (installation fraîche Train V3)

Mesure du 2026-09-11, base fraîche de 278 migrations (harnais `train-v3-dbtest`), avant et après le SQL
proposé (qui n'y touche pas) : `has_table_privilege('service_role', table, 'TRUNCATE')` vrai pour **200 des
220 tables** de `public` ; le même privilège figure aussi sur mes_remises_visibles (vue) (sans effet sur une vue).
Chaque table porte aussi REFERENCES et TRIGGER.

`abonnement_evenements`, `abonnement_stockage_releves`, `abonnements_entreprises`, `absences_paie`, `acces_applications_entreprises`, `acces_externes_documents`, `acces_support_log`, `affectations`, `affectations_vehicules`, `alertes_operationnelles_delegations`, `alertes_operationnelles_ignorees`, `anomalies_paie`, `appareils_comptes`, `appels_contacts`, `appels_offres`, `applications_elsatia`, `article_teintes`, `articles_stock`, `assistance_actions_interdites`, `assistance_domaines_sensibles`, `assistance_evenements`, `assistance_motifs`, `assistance_notifications`, `assistance_perimetres`, `assistance_roles_correspondance`, `assistance_sessions`, `assistance_sessions_applications`, `avenants`, `bons_livraison`, `boutique_commandes`, `boutique_lignes_commande`, `boutique_produits`, `bulletins_paie`, `catalogue_options_abonnement`, `catalogue_services_mise_en_service`, `categories_notes_frais`, `champs_personnalises`, `chantier_transferts`, `chantiers`, `charges_recurrentes`, `cles_api`, `clients`, `codes_acces`, `codes_identification`, `commandes_fournisseurs`, `communications`, `communications_audiences`, `communications_journal`, `communications_lectures`, `communications_pieces_jointes`, `communications_preferences`, `comptes_rendus_chantier`, `compteurs_reference`, `connecteurs_externes`, `connexions_bancaires`, `connexions_email`, `contacts_clients`, `contrats_entretien`, `conversations_internes`, `coordonnees_bancaires`, `deductions_paie`, `demandes_conges`, `depenses_fournisseurs`, `devis`, `documents_chantier`, `documents_notes_frais`, `doe_generations`, `dossiers_paie_salaries`, `ecritures_comptables_importees`, `elements_export_notes_frais`, `emails_chantier`, `employes`, `employes_cout_horaire`, `entitlements_utilisateurs_elsatia`, `entreprise_besoins`, `entreprise_feature_flags`, `entreprises`, `equipes_chantiers`, `exports_notes_frais`, `facturation_comptes_mensuelle`, `factures`, `factures_abonnement`, `fiches_techniques_articles`, `fournisseurs`, `grands_deplacements`, `habilitations_applications_utilisateurs`, `habilitations_employe`, `historique_acces_applications`, `historique_entitlements_elsatia`, `historique_mutations_plateforme`, `historique_tarification`, `indemnites_deplacement_paie`, `interventions`, `inventaires`, `journal_abus_securite`, `journal_activite`, `journal_audit_notes_frais`, `journal_audit_paie`, `journal_ia`, `journal_paiements_bancaires`, `legal_holds_notes_frais`, `lignes_avenants`, `lignes_commande`, `lignes_devis`, `lignes_factures`, `lignes_inventaire`, `lignes_metres`, `lignes_modeles_devis`, `lignes_situations`, `lots_virements`, `messages_internes`, `metres`, `modeles_devis`, `modeles_roles_predefinis`, `mouvements_outillage`, `mouvements_stock`, `notes_frais`, `notifications_utilisateurs`, `options_abonnement_entreprises`, `ordres_virements`, `outils`, `paiements`, `parametres_paie_entreprise`, `parametres_relances`, `periodes_paie`, `permissions_disponibles`, `permissions_poste`, `pieces_jointes_devis`, `pieces_jointes_messages`, `pieces_jointes_paie`, `planning_evenements`, `plans_abonnement`, `plateforme_acces_entreprises`, `plateforme_admins`, `plateforme_journal_actions`, `plateforme_reinitialisations_mot_de_passe`, `pointages`, `politiques_conservation_notes_frais`, `postes`, `preferences_notifications_push`, `prestations_catalogue`, `primes_paie`, `profils_paie_employes`, `promotions_commerciales`, `push_abonnements`, `rate_limits_applicatifs`, `reglements_fournisseurs`, `regularisations_paie`, `relances_documents`, `relances_impayes`, `releves_kilometrage`, `remises_banque`, `remises_banque_paiements`, `reserves`, `reserves_annuaire_publication`, `reserves_chantiers`, `reserves_conversations`, `reserves_conversations_lectures`, `reserves_evenements_notifications`, `reserves_historique`, `reserves_intervenants`, `reserves_invitations`, `reserves_messages`, `reserves_mutations_appliquees`, `reserves_notifications_envois`, `reserves_notifications_lectures`, `reserves_notifications_types`, `reserves_photos`, `reserves_plans`, `reserves_preferences_notifications`, `reserves_transitions`, `roles_applications_elsatia`, `sessions_pointage`, `signatures_documents`, `situations_travaux`, `sous_traitants_chantiers`, `stripe_webhook_events`, `suggestions_ocr_notes_frais`, `support_messages`, `taches`, `tarifs_fournisseurs`, `temps_travail_paie`, `tentatives_acces_notes_frais`, `tentatives_borne_stock`, `tools_demandes_suppression_compte`, `tools_monetization_customers`, `tools_monetization_events`, `tools_monetization_subscriptions`, `tools_projects`, `types_chantier`, `utilisateurs`, `utilisateurs_entreprises`, `valeurs_champs_personnalises`, `validations_notes_frais`, `validations_paie`, `vehicules`, `verifications_zone_pointage`, `versions_documents_notes_frais`, `zones_deplacement_paie`, `zones_depot`
