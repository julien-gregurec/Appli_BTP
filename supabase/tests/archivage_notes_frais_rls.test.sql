begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_table('public','documents_notes_frais','La table des documents existe');
select has_table('public','journal_audit_notes_frais','Le journal append-only existe');
select has_table('public','legal_holds_notes_frais','Le gel juridique existe');
select policies_are('public','notes_frais',array['notes_frais_delete_authenticated','notes_frais_insert_authenticated','notes_frais_select_authenticated','notes_frais_update_authenticated'],'Les notes ont uniquement les politiques strictes attendues');
select policies_are('public','journal_audit_notes_frais',array['audit_notes_frais_select'],'Le journal ne possède aucune politique de mutation');

select ok((select relrowsecurity from pg_class where oid='public.notes_frais'::regclass),'RLS est active sur les dépenses');
select ok((select relrowsecurity from pg_class where oid='public.versions_documents_notes_frais'::regclass),'RLS est active sur les versions');
select is((select public from storage.buckets where id='notes-frais'),false,'Le bucket des originaux est privé');
select is((select public from storage.buckets where id='notes-frais-exports'),false,'Le bucket des exports est privé');

select * from finish();
rollback;
