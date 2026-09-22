-- Vérifie le correctif de la migration 20260922000195 : verrou d'intégrité sur les devis
-- acceptés (et leurs lignes), et initialisation automatique de la période d'essai des
-- nouvelles entreprises.
--
-- Portage adapté (introspection de schéma, `fixtures/isolation_multitenant.inc` absent de ce
-- dépôt) — voir correctif_rls_ecriture_chantiers.test.sql pour la même note. L'écart
-- volontaire par rapport à la source (chantier_id exclu du verrou) est vérifié explicitement
-- ci-dessous, pas seulement documenté en commentaire.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_column('public', 'entreprises', 'abonnement_essai_debut', 'la colonne de début d''essai existe');

select has_trigger('public', 'devis', 'verrou_devis_accepte', 'le verrou d''intégrité existe sur devis');
select has_trigger('public', 'lignes_devis', 'verrou_lignes_devis_accepte', 'le verrou d''intégrité existe sur lignes_devis');
select has_trigger('public', 'entreprises', 'initialiser_essai_entreprise', 'l''initialisation d''essai existe sur entreprises');

select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_devis_accepte()'::regprocedure) like '%new.statut is distinct from old.statut%',
  'le verrou couvre bien le statut'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_devis_accepte()'::regprocedure) like '%new.montant_ttc is distinct from old.montant_ttc%',
  'le verrou couvre bien les montants'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_devis_accepte()'::regprocedure) not like '%new.chantier_id is distinct from old.chantier_id%',
  'le verrou N''inclut PAS chantier_id (écart volontaire : associerDevisChantierAction réassigne un devis accepté)'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.initialiser_essai_entreprise()'::regprocedure) like '%abonnement_essai_fin%abonnement_essai_debut%',
  'la date de fin d''essai est bien dérivée de la date de début'
);
select ok(
  (select tgenabled from pg_trigger where tgname = 'verrou_devis_accepte' and tgrelid = 'public.devis'::regclass) = 'O',
  'le verrou devis est activé (pas désactivé)'
);

select * from finish();
rollback;
