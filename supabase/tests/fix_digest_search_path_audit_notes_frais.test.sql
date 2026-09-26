-- Train canonique V1 : test repris de claude/amazing-pascal-7lddkv (d42df217) SANS sa migration
-- GP : la propriété vérifiée est déjà portée par le tronc (preuve : ce test passe sur le train,
-- voir docs/qualification/ELSATIA_CANONICAL_TRAIN_EXECUTION_V1.md §STEP 6).
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
