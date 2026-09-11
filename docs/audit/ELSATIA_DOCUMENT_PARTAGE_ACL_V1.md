# ELSATIA-DOCUMENT-PARTAGE-ACL-V1 — lien client et PDF joint cassés par la 255

Date : 2026-09-11 · Base : Train V3 `integration/elsatia-ecosystem-train-v3-commercial-platform-v1`
@ `59e960a` (= `52d3282` + rapport d'audit, aucune différence de code ni de migration) ·
Branche : `fix/document-partage-service-role-acl-v1` · Non poussée, non fusionnée, non déployée.

## Verdict

**Hypothèse PROUVÉE.** Dès que `20260902000255_acl_reconciliation_v1.sql` est appliquée, les
pages `/document/[token]` (lien envoyé au client) et `/imprimer/partage/[token]` (PDF
téléchargeable **et** pièce jointe des e-mails) renvoient 404, et l'e-mail part sans pièce
jointe avec un lien lui-même en 404. La 255 fait partie du delta de cutover Production.

## Preuves (bases jetables uniquement, jamais `btp-platform`)

| Preuve | Résultat |
|---|---|
| Clone jetable de la pile E2E Train V3 : `set role service_role; select count(*) from public.devis` | `permission denied for table devis` (idem `factures`, `lignes_devis`, `lignes_factures`, `prestations_catalogue`, `clients`, `pieces_jointes_devis`, `acces_externes_documents`) — alors que `service_role` a `BYPASSRLS` |
| Chemin applicatif exact : `supabase-js` + clé `service_role` contre PostgREST de la pile E2E, requête de `chargerDonneesDevisImprimable` | `{ data: null, code: "42501" }` → `notFound()` |
| **Causalité** : conteneur jetable, Train V3 installé à neuf jusqu'au rang 252, puis la 255 seule | avant : `service_role` lit `devis` (`count=0`, SELECT = true sur les 6 tables) ; après la 255 seule : `permission denied` ; aucune migration postérieure ne rétablit rien |

L'en-tête de la 255 affirme que ses REVOKE « constituent un no-op sur une base Fresh » : c'est
**faux** pour `service_role` — une base fraîche reçoit ces droits par les privilèges par défaut
Supabase, et la 255 les retire.

## Correctif proposé (le plus étroit)

Aucune table regrantée. Une fonction `public.document_commercial_public_par_token(p_token text)
returns jsonb`, SECURITY DEFINER, `search_path = ''` :

- hache le jeton en clair (SHA-256 hex, identique à `hacherTokenPartage()`) : l'empreinte
  stockée ne suffit pas à ouvrir le document ;
- jeton révoqué, expiré, inconnu, ou pointant un document d'une autre entreprise → `NULL` ;
- renvoie uniquement ce que `DocumentImprimable` imprime : jamais `notes_internes`, seulement
  les 23 colonnes d'en-tête de l'entreprise (ni Stripe, ni banque, ni code d'adhésion),
  snapshot destinataire réduit aux clés de l'en-tête (ni e-mail, ni téléphone, ni contact),
  fiche client lue seulement pour un brouillon ;
- **exécutable par `service_role` seul** (ni PUBLIC, ni anon, ni authenticated) : aucun point
  d'entrée PostgREST ouvert à internet, liste blanche anon du test de surface inchangée.
  `service_role` ne lit toujours aucune table documentaire ni aucune empreinte : sans jeton en
  clair, il n'obtient rien.

Fichiers :

- `docs/migrations-proposees/document-partage-public-par-jeton-v1.sql.proposed` — sans numéro ;
- `docs/migrations-proposees/document-partage-public-par-jeton-v1.pgtap.sql.proposed` — 40
  assertions, à placer dans `supabase/tests/` avec la migration numérotée ;
- `src/lib/documents-commerciaux.ts` — un seul mapping devis/facture partagé entre lecture
  authentifiée et lecture par jeton ; nouveau `chargerDonneesDocumentPartage()` ; une panne de
  lecture **lève une erreur** au lieu de se déguiser en 404 (c'est ce qui masquait la
  régression) ;
- les deux pages appellent `chargerDonneesDocumentPartage(createAdminClient(), token)` ;
- `src/lib/documents-commerciaux.test.ts` — 8 tests, dont une garde : les pages ne lisent
  aucune table.

Livraison : SQL d'abord, code ensuite, dans le même train. Retour arrière :
`drop function if exists public.document_commercial_public_par_token(text);`.

## Vérifications

| Contrôle | Résultat |
|---|---|
| pgTAP proposé, Train V3 frais complet, **sans** la fonction | rouge (test 1, puis transaction avortée) |
| pgTAP proposé, Train V3 frais complet, **avec** la fonction | **40/40** |
| Suites voisines sur la même base (`isolation_multitenant_surface`, `client_document_snapshot_v1`, `verrouiller_facture_emise`, `pieces_jointes_v1_suppression_devis`) | 10/10, 28/28, 6/6, 6/6 |
| pgTAP proposé sur le clone E2E | 39/40 — l'écart vient des données du clone (l'entreprise `a0000000-…-0001` y existe déjà sous le nom « RECETTE_A_ENTREPRISE », la fixture ne l'écrase pas), pas du correctif |
| vitest (`documents-commerciaux`, `documents-partage`, `documents-envoi`) | 38/38 |
| `tsc --noEmit` racine | OK |
| eslint des 4 fichiers modifiés | OK |

Non fait : `npm run verify` complet, build, recette navigateur d'un vrai lien.

## Constats annexes

1. **La pile E2E Train V3 n'a pas `USAGE` de `PUBLIC` sur le schéma `public`**
   (`=U/pg_database_owner` absent), contrairement à une installation fraîche, à `ledger-p0` et à
   `btp-platform`. Sur cette pile, tout appel RPC en `anon` échoue, y compris l'ancien
   `document_commercial_par_token` et `reserves_invitation_consulter`. Le correctif ne dépend
   pas de ce droit. À vérifier en lecture seule en Production :
   `select has_schema_privilege('anon','public','USAGE');`.
2. **La 255 casse bien d'autres flux `service_role`.** Après la 255, `service_role` n'a de
   privilège que sur 7 tables de `public` : `entreprises` (SELECT, et UPDATE sur 81 colonnes),
   `signatures_documents`, `entitlements_utilisateurs_elsatia`,
   `historique_entitlements_elsatia` et les 3 tables `tools_monetization_*`. Refus vérifiés par
   requête réelle : `employes`, `stripe_webhook_events` (INSERT), `lots_virements`,
   `notifications_utilisateurs` ; refus confirmés par le catalogue : `journal_audit_paie`,
   `periodes_paie`, `parametres_relances`. D'après la lecture du code (à confirmer flux par
   flux) :
   - webhook Stripe Connect des factures clients et webhook Boutique en 500 permanent ;
   - comptage `employes` à null dans `stripe-abonnement.ts` → quantité « comptes
     supplémentaires » à 0, avec suppression possible de l'item Stripe ;
   - import de bulletins de paie (« Salarié introuvable »), export de paie, callback Powens ;
   - notifications push, relances automatiques, resynchronisation des périodes de paie ;
   - journaux `journal_audit_paie` et `journal_activite` perdus.

   Ne sont **pas** cassés : les mises à jour d'`entreprises` (statut d'abonnement,
   `stripe_customer_id`, option IA — couvertes par les droits par colonne), le limiteur de
   débit, les RPC `*_service` et la monétisation Tools. **À traiter comme bloquant du cutover
   dans un lot dédié.**
3. Pré-existant, hors périmètre : les photos et signatures du PDF public pointent vers
   `/api/devis/pieces-jointes/…` et `/api/employes/…/signature`, qui exigent vraisemblablement
   une session ; elles seraient alors cassées dans le PDF anonyme. `resoudreTokenPartage()`
   n'est plus appelé que par son test.

## Contraintes respectées

Aucune migration existante modifiée, aucun numéro réservé, aucun déploiement, aucun push, aucun
`git clean/reset/rebase/amend/force-push`. `supabase_db_btp-platform` n'a subi que des lectures
de catalogue. Base jetable `acl_sr_jetable`, conteneur `acl255-preuve-jetable` et fichiers
temporaires supprimés en fin de lot ; la pile E2E n'a pas été modifiée.
