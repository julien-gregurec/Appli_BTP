begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public','codes_identification','Le registre des QR codes existe');
select has_table('public','tentatives_borne_stock','Les tentatives de code sont journalisées');
select has_column('public','employes','code_stock_hash','Le code personnel est uniquement conservé sous forme hachée');
select has_column('public','mouvements_stock','employe_id','Le mouvement est attribué à un employé');
select has_column('public','mouvements_stock','saisi_via_borne','La provenance borne est enregistrée');
select ok((select relrowsecurity from pg_class where oid='public.codes_identification'::regclass),'RLS active sur les QR codes');
select ok((select relrowsecurity from pg_class where oid='public.tentatives_borne_stock'::regclass),'RLS active sur les tentatives');
select function_returns('public','enregistrer_mouvement_stock_borne',array['uuid','text','text','text','numeric','uuid','text','uuid','text'],'uuid','La borne utilise une RPC atomique');
select function_returns('public','definir_code_stock_employe',array['uuid','uuid','text','boolean'],'void','Le code est défini côté base');
select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name='employes' and column_name='code_stock'),0,'Aucune colonne ne conserve le code personnel en clair');

select * from finish();
rollback;
