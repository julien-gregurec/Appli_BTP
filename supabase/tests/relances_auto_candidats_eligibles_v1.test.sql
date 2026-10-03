-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-B : sélection des candidats de relance automatique
-- (migration 20261003000201). Témoin : ROUGE sur V9.1 (famine), VERT après.
-- Contrat complet (dates, fournisseur indisponible, replay, 10 000 factures) :
--   scripts/perf/hardening/tests/relances_auto_contract.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir fixtures/isolation_multitenant.inc

insert into public.parametres_relances (entreprise_id, devis_auto_actif, factures_auto_actif) values
  ('a0000000-0000-0000-0000-000000000001', true, true)
on conflict (entreprise_id) do update set devis_auto_actif = true, factures_auto_actif = true;
update public.clients set email = 'client-a@invalid.local' where entreprise_id = 'a0000000-0000-0000-0000-000000000001';

-- 200 factures échues déjà relancées au maximum (3), puis une facture saine échue.
insert into public.factures (id, entreprise_id, numero, client_id, statut, date_echeance, montant_ht, montant_tva, montant_ttc)
select md5('max' || g)::uuid, 'a0000000-0000-0000-0000-000000000001', 'RLV_MAX_' || g, 'a3000000-0000-0000-0000-000000000001',
       'envoyee', current_date - 90, 100, 20, 120
from generate_series(1, 200) g;
insert into public.relances_documents (entreprise_id, type_document, document_id, niveau, statut, date_envoi)
select 'a0000000-0000-0000-0000-000000000001', 'facture', md5('max' || g)::uuid, n, 'envoyee', now() - interval '30 days'
from generate_series(1, 200) g cross join generate_series(1, 3) n;
insert into public.factures (id, entreprise_id, numero, client_id, statut, date_echeance, montant_ht, montant_tva, montant_ttc) values
  ('aa000000-0000-0000-0000-0000000005a1', 'a0000000-0000-0000-0000-000000000001', 'RLV_SAINE', 'a3000000-0000-0000-0000-000000000001',
   'envoyee', current_date - 20, 100, 20, 120);

select ok('aa000000-0000-0000-0000-0000000005a1'::uuid in
          (select id from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'facture', 200)),
  'famine : 200 factures au maximum de relances n''évincent pas la facture saine');
select is((select count(*)::int from public.relances_auto_candidats_service('a0000000-0000-0000-0000-000000000001', 'facture', 200) c
           where c.id in (select md5('max' || g)::uuid from generate_series(1, 200) g)), 0,
  'le plafond porte sur les candidats potentiellement éligibles');
select is((select count(*)::int from public.relances_auto_candidats_service('b0000000-0000-0000-0000-000000000001', 'facture', 200) c
           join public.factures f on f.id = c.id where f.entreprise_id <> 'b0000000-0000-0000-0000-000000000001'), 0,
  'multi-tenant : aucun candidat hors tenant');
select ok(pg_get_functiondef('public.relances_auto_candidats_selection(uuid,text,integer)'::regprocedure) ~* 'order\s+by',
  'tri explicite');

-- Sélection unique pour la simulation : SECURITY INVOKER, soumise à la RLS de la session.
select ok(not (select prosecdef from pg_proc where oid = 'public.relances_auto_candidats_selection(uuid,text,integer)'::regprocedure),
  'relances_auto_candidats_selection est SECURITY INVOKER');
select ok(not has_function_privilege('anon', 'public.relances_auto_candidats_selection(uuid,text,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.relances_auto_candidats_service(uuid,text,integer)', 'execute'),
  'droits : sélection refusée à anon, chemin de service refusé à authenticated');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.relances_auto_candidats_selection('a0000000-0000-0000-0000-000000000001', 'facture', 200)), 0,
  'session de B : aucun candidat de A (RLS)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok('aa000000-0000-0000-0000-0000000005a1'::uuid in
          (select id from public.relances_auto_candidats_selection('a0000000-0000-0000-0000-000000000001', 'facture', 200)),
  'session de A (simulation) : même sélection que le cron');
reset role;

select * from finish();
rollback;
