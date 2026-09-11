# ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — flux `service_role` cassés par la 255

Date : 2026-09-11 · Base : Train V3 `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`
@ `59e960a` · Branche : `fix/service-role-flux-acl-255-v1` (worktree
`/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/service-role-flux-acl-v1`) · Non poussée, non fusionnée,
non déployée. Lot jumeau déjà livré pour le lien client / PDF : `fix/document-partage-service-role-acl-v1`
(`docs/audit/ELSATIA_DOCUMENT_PARTAGE_ACL_V1.md`).

## Verdict

**Hypothèse PROUVÉE pour 11 flux sur les 11 suspects**, par requête réelle. Dès que
`20260902000255_acl_reconciliation_v1.sql` est appliquée (elle fait partie du delta de cutover
Production), les webhooks Stripe Connect et Boutique répondent 500 à chaque évènement, la
réconciliation d'abonnement **supprime l'item Stripe « comptes supplémentaires »**, l'import et
l'export de paie échouent, le retour Powens ne réconcilie plus rien, aucune notification push ni
relance automatique ne part, et deux journaux d'audit ne sont plus écrits. **Bloquant cutover.**

Constat de sécurité en plus : la 255 a retiré l'EXECUTE de `boutique_finaliser_commande_payee` à
`service_role` mais l'a **laissé à `authenticated`** — tout utilisateur connecté peut marquer
payée sa propre commande Boutique sans payer. Corrigé dans le SQL proposé.

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
| 2 | Webhook Boutique (`src/app/api/stripe/boutique/webhook/route.ts`) | INSERT `stripe_webhook_events` ; EXECUTE `boutique_finaliser_commande_payee` ; UPDATE `boutique_commandes` | 500 à chaque évènement | même GRANT ; EXECUTE rendu à `service_role` **et retiré à `authenticated`** ; `boutique_expirer_commande_service` |
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
  6 grants par colonne + correction de l'EXECUTE Boutique, retour arrière en fin de fichier ;
- `docs/migrations-proposees/service-role-flux-acl-v1.pgtap.sql.proposed` — 133 assertions, à
  placer dans `supabase/tests/service_role_flux_acl_v1.test.sql` avec la migration numérotée ;
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
| Preuve SQL sur le clone E2E, sans correctif | 32 refus `42501` sur 11 flux, 26 requêtes de contrôle acceptées |
| Preuve SQL sur base fraîche Train V3, sans correctif | 32 refus `42501`, **mêmes requêtes** (diff limité aux données : entreprise de recette absente) |
| pgTAP proposé, base fraîche, **sans** le correctif | rouge : 0 assertion passée, 14 `not ok` (fonctions absentes) puis transaction avortée |
| pgTAP proposé, base fraîche, **avec** le correctif | **133/133** |
| pgTAP proposé, clone E2E, avec le correctif | **133/133** (assertions de comptage limitées à leurs propres lignes : le clone garde les écritures de la preuve PostgREST) |
| 70 suites pgTAP existantes, base fraîche **avec** le correctif | **70/70, 1 902 assertions, 0 échec** — identique à la référence sans correctif (`auditE-final.log`) : aucune régression |
| Chemin applicatif réel : `postgrest-js` (celui de supabase-js) + JWT `service_role` contre un PostgREST v14.14 jetable branché sur le clone corrigé | **29/29 conformes** — les 11 flux passent avec les appels exacts du code (dont INSERT par colonne sans `RETURNING`, UPDATE filtré sur colonnes accordées, doublon → 23505) ; lectures directes de `factures`, `employes`, journaux, montants de lot toujours refusées ; `anon` refusé |
| vitest (14 fichiers : webhooks, cron, import paie, push, relances, abonnement, partage, garde) | **139/139** |
| `tsc --noEmit` racine | OK |
| eslint des 16 fichiers touchés | OK |

Non fait : `npm run verify` complet, `next build`, E2E Playwright, recette navigateur, évènement
Stripe réel (Test) rejoué de bout en bout.

## Constats annexes

1. **Faille Boutique** (ci-dessus) : à traiter comme P0 sécurité dès que la Boutique est activée ;
   aujourd'hui masquée par le flag et le catalogue vide.
2. **Idempotence du webhook Connect** : l'évènement est réservé dans `stripe_webhook_events` avant
   traitement ; si le traitement échoue, le renvoi de Stripe est vu comme un doublon et l'évènement
   est perdu. Préexistant ; la 262 l'a résolu pour le webhook abonnement par une annulation de
   réservation — même traitement à prévoir ici (non fait : il faudrait un DELETE ou une RPC
   d'annulation).
3. **Lien de relance** : même avant la 255, le cron passait l'identifiant d'entreprise comme
   `cree_par` → violation de clé étrangère → e-mails de relance automatiques sans lien. Corrigé par
   `relance_nouveau_lien_partage_service`.
4. Les pages publiques de partage (`/document/[token]`, `/imprimer/partage/[token]`) sont corrigées
   par la branche jumelle ; les deux lots doivent entrer dans le même train.
5. Le clone de la pile E2E n'a pas l'`USAGE` de PUBLIC sur `public` (déjà noté par le lot jumeau) :
   sans effet ici, `service_role` a son propre `USAGE`.
6. **`TRUNCATE` resté à `service_role`** sur une installation fraîche : les privilèges par défaut de
   `postgres` sur `public` donnent `service_role=Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) à
   toute table créée ; la 255 ne retire que SELECT/INSERT/UPDATE/DELETE. Or `TRUNCATE` ne déclenche
   pas `journal_paie_immuable` (BEFORE UPDATE/DELETE) : la clé de service peut vider les journaux
   d'audit. Le clone E2E n'a pas ces privilèges par défaut — l'état de Production est donc à lire
   avant de conclure : `select table_name from information_schema.role_table_grants where
   grantee='service_role' and privilege_type='TRUNCATE' and table_schema='public';`. Hors périmètre
   de ce lot (aucun code n'en dépend) ; à trancher dans le lot ACL suivant.

## Contraintes respectées

Aucune migration existante modifiée, aucun numéro réservé, aucun déploiement, aucun push, aucun
`git clean/reset/rebase/amend/force-push`. `supabase_db_btp-platform` non touché. La base `postgres`
de la pile E2E n'a subi que des lectures (`pg_dump`) ; les objets jetables (base
`acl_flux_jetable`, conteneurs `acl-flux-fresh-jetable` et `acl-flux-postgrest-jetable`, fichiers
`/tmp` des conteneurs) sont supprimés en fin de lot. Le secret JWT de la pile E2E n'a été lu que
par le conteneur PostgREST jetable et le script de preuve, jamais affiché.
