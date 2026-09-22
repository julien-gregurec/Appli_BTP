-- Vérifie le correctif de la migration 20260922000194 : public.ajouter_audit_note_frais
-- appelle désormais extensions.digest(...) (qualifié), plus digest(...) nu — la fonction,
-- security definer avec search_path=public seul, ne résolvait jamais digest() puisque
-- pgcrypto est installé dans le schéma extensions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_function(
  'public', 'ajouter_audit_note_frais',
  array['uuid','text','text','uuid','text','text','jsonb','text','text','text'],
  'la fonction existe toujours avec la même signature'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text)'::regprocedure)
    like '%extensions.digest(%',
  'le corps de la fonction appelle extensions.digest (qualifié)'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text)'::regprocedure)
    not like '%encode(digest(%',
  'le corps de la fonction n''appelle plus digest(...) sans qualification de schéma'
);

select * from finish();
rollback;
