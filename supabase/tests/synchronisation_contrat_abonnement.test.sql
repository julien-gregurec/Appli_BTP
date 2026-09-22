begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_function('public','contrat_abonnement_par_defaut',array['uuid'],'Le contrat par defaut est calculable pour une entreprise donnee');
select has_function('public','synchroniser_statut_contrat_abonnement',array[]::text[],'Le trigger de synchronisation existe');
select has_trigger('public','entreprises','entreprises_creer_contrat_abonnement','Toute entreprise creee obtient un contrat');
select has_trigger('public','entreprises','entreprises_synchroniser_statut_contrat','Tout changement de statut est repercute sur le contrat');

-- Une entreprise creee directement (hors bootstrap applicatif) doit recevoir un contrat.
insert into public.entreprises(nom, abonnement_statut) values ('Test synchro contrat', 'essai');
select isnt_empty(
  $$ select 1 from public.abonnements_entreprises c
     join public.entreprises e on e.id = c.entreprise_id
     where e.nom = 'Test synchro contrat' $$,
  'Le contrat est cree automatiquement a l''insertion de l''entreprise'
);

-- Une suspension manuelle (hors Stripe) doit se repercuter sur le contrat.
update public.entreprises set abonnement_statut = 'suspendu' where nom = 'Test synchro contrat';
select results_eq(
  $$ select c.statut from public.abonnements_entreprises c
     join public.entreprises e on e.id = c.entreprise_id
     where e.nom = 'Test synchro contrat' $$,
  $$ values ('suspendu'::text) $$,
  'Une suspension manuelle de l''entreprise se repercute sur le contrat'
);

select * from finish();
rollback;
