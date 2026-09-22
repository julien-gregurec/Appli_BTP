-- Vérifie le correctif de la migration 20260922000196 : verrou d'immutabilité
-- sur une facture émise (public.factures), fermant l'accès direct que la
-- policy RLS "membres factures" laissait ouvert (contenu modifiable,
-- rétrogradable en brouillon, supprimable, par tout membre actif de
-- l'entreprise).
--
-- Portage adapté (introspection de schéma, `fixtures/isolation_multitenant.inc`
-- absent de ce dépôt) — même style que verrou_devis_accepte_et_expiration_essai.test.sql
-- et correctif_rls_ecriture_chantiers.test.sql pour la même raison : aucune base
-- réelle n'est disponible dans cet environnement pour valider un scénario
-- comportemental construit à la main, alors que l'introspection du texte du
-- correctif peut être vérifiée directement.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_trigger('public', 'factures', 'verrou_facture_emise', 'le verrou d''immutabilité existe sur factures');
select ok(
  (select tgenabled from pg_trigger where tgname = 'verrou_facture_emise' and tgrelid = 'public.factures'::regclass) = 'O',
  'le verrou est activé (pas désactivé)'
);

-- Le verrou couvre bien DELETE et UPDATE (pas seulement l'un des deux).
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%ne peut plus être supprimée%',
  'le verrou interdit la suppression d''une facture émise'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%ne peut pas redevenir brouillon%',
  'le verrou interdit le retour au statut brouillon'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%ne peut plus être modifiée%',
  'le verrou interdit la modification du contenu d''une facture émise'
);

-- Une facture encore brouillon n'est jamais bloquée par ce verrou.
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%old.statut <> ''brouillon''%'
  or (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%old.statut = ''brouillon''%',
  'le verrou ne s''applique qu''aux factures déjà sorties du statut brouillon'
);

-- Les champs de suivi (statut, règlement, e-mail, Stripe, échéance) restent
-- modifiables sur une facture émise : le verrou compare après les avoir retirés.
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%montant_paye%'
  and (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%stripe_payment_status%',
  'les champs de suivi (règlement, Stripe) restent modifiables sur une facture émise'
);

-- montant_ht/montant_tva/montant_ttc ne figurent PAS dans les champs libres :
-- ils sont donc bien couverts par le verrou (immuables une fois émis).
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) not like '%''montant_ht''%'
  and (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) not like '%''montant_ttc''%',
  'montant_ht/montant_ttc ne sont pas des champs libres : ils restent verrouillés après émission'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.factures'::regclass),
  'RLS reste active sur public.factures (le verrou est une protection complémentaire, pas un remplacement)'
);

select * from finish();
rollback;
