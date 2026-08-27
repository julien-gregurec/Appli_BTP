begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

select ok(exists(select 1 from pg_roles where rolname='elsatia_discount_f4_writer' and not rolcanlogin and not rolbypassrls),'rôle F4 NOLOGIN et NOBYPASSRLS');
select is((select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='elsatia_discount_f4_writer' and u.rolname<>'postgres'),0::bigint,'aucun membre applicatif du rôle interne F4');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)'::regprocedure),'elsatia_discount_f4_writer','seul finaliseur F4 propriétaire du rôle interne');
select ok(not has_function_privilege('authenticated','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'finaliseur F4 inaccessible au client');
select ok(has_function_privilege('service_role','public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)','EXECUTE'),'orchestrateur service peut appeler F4');

select ok(not has_column_privilege('authenticated','public.entreprises','remise_stripe_coupon_id','UPDATE'),'authenticated sans UPDATE coupon');
select ok(not has_column_privilege('authenticated','public.entreprises','remise_description','INSERT'),'authenticated sans INSERT description');
select ok(has_column_privilege('authenticated','public.entreprises','nom','UPDATE'),'écriture métier non sensible conservée');
select ok(not has_table_privilege('service_role','public.entreprises','UPDATE'),'service_role sans UPDATE direct table');
select ok(not pg_has_role('authenticated','elsatia_discount_f4_writer','MEMBER'),'authenticated ne peut assumer F4');
select ok(not pg_has_role('service_role','elsatia_discount_f4_writer','MEMBER'),'service_role ne peut assumer F4');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like($$update public.entreprises set remise_description='attaque' where id='a0000000-0000-0000-0000-000000000001'$$,'%permission denied%','administrateur entreprise bloqué');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","plateforme_role":"total"}',true);
select throws_like($$update public.entreprises set remise_description='total' where id='a0000000-0000-0000-0000-000000000001'$$,'%permission denied%','plateforme total AAL2 bloqué');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","plateforme_role":"facturation"}',true);
select throws_like($$update public.entreprises set remise_description='facturation' where id='a0000000-0000-0000-0000-000000000001'$$,'%permission denied%','plateforme facturation AAL2 bloqué');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","plateforme_role":"support"}',true);
select throws_like($$update public.entreprises set remise_description='support' where id='a0000000-0000-0000-0000-000000000001'$$,'%permission denied%','plateforme support AAL2 bloqué');
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","plateforme_role":"lecture"}',true);
select throws_like($$update public.entreprises set remise_description='lecture' where id='a0000000-0000-0000-0000-000000000001'$$,'%permission denied%','plateforme lecture AAL2 bloqué');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like($$insert into public.entreprises(id,nom,remise_description) values('c0000000-0000-0000-0000-000000000001','attaque','remise')$$,'%permission denied%','INSERT avec remise bloqué');
select throws_like($$insert into public.entreprises(id,nom,remise_description) values('c0000000-0000-0000-0000-000000000001','attaque','remise') on conflict(id) do update set remise_description=excluded.remise_description$$,'%permission denied%','UPSERT avec remise bloqué');
select lives_ok($$update public.entreprises set nom='Entreprise Isolation A légitime' where id='a0000000-0000-0000-0000-000000000001'$$,'UPDATE non sensible conservé');
reset role;

create function public.r71_wrapper_non_f4() returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.entreprises set remise_description='wrapper' where id='a0000000-0000-0000-0000-000000000001';
end $$;
select throws_like($$select public.r71_wrapper_non_f4()$$,'%finaliseur F4 requis%','SECURITY DEFINER non-F4 bloqué par le trigger');

grant select on public.entreprises to service_role;
grant update(remise_description) on public.entreprises to service_role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_like($$update public.entreprises set remise_description='service-direct' where id='a0000000-0000-0000-0000-000000000001'$$,'%finaliseur F4 requis%','service_role direct bloqué même avec privilège injecté');
reset role;
revoke update(remise_description) on public.entreprises from service_role;
revoke select on public.entreprises from service_role;

select is((select remise_description from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),null,'aucune tentative directe ne modifie la remise');
select is((select count(*) from public.historique_tarification where entreprise_id='a0000000-0000-0000-0000-000000000001'),0::bigint,'aucun audit mensonger après refus');
select is((select count(*) from public.plateforme_operations_remise where entreprise_id='a0000000-0000-0000-0000-000000000001'),0::bigint,'aucune saga créée par une écriture directe');
select is((select count(*) from information_schema.role_column_grants where table_schema='public' and table_name='entreprises' and grantee in ('anon','authenticated','service_role') and privilege_type in ('INSERT','UPDATE') and column_name like 'remise_%'),0::bigint,'aucun rôle API ne possède de privilège de colonne remise');
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.proowner='elsatia_discount_f4_writer'::regrole and p.oid<>'public.plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)'::regprocedure),0::bigint,'aucun autre SECURITY DEFINER détenu par le rôle F4');

select * from finish();
rollback;
