-- La lecture des documents sensibles (carte BTP / signature d'un autre salarié,
-- factures fournisseurs, preuves de pointage) est désormais bornée à la permission
-- métier via une policy RESTRICTIVE, pas seulement à l'appartenance à l'entreprise.
-- Voir 20260922000187_restreint_lecture_documents_sensibles.sql.
--
-- Limité à des vérifications de schéma/privilèges (pas de fixture storage.objects ni
-- d'insertion dans employes, dont les triggers de génération d'identifiant n'ont pas
-- été rejoués contre une base réelle dans cette session — voir §9 du rapport de
-- qualification).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select function_returns(
  'public',
  'peut_lire_document_employe_sensible',
  array['text'],
  'boolean',
  'le garde de lecture des documents employé existe avec la bonne signature'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.peut_lire_document_employe_sensible(text)',
    'execute'
  ),
  'les membres authentifiés peuvent évaluer le garde de lecture'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.peut_lire_document_employe_sensible(text)',
    'execute'
  ),
  'un appelant anonyme ne peut pas évaluer le garde de lecture'
);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'role_gestion_fichiers_select'
      and permissive = 'RESTRICTIVE'
      and cmd = 'SELECT'
  ),
  'une policy RESTRICTIVE de lecture existe pour storage.objects (documents-employes/factures-fournisseurs/pointage-preuves)'
);

select * from finish();
rollback;
