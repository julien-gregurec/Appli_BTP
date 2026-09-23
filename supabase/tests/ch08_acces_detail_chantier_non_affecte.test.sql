-- CH-08 : accès au détail d'un chantier non affecté.
--
-- Le garde serveur existe déjà et est correct : la policy RLS de lecture de
-- public.chantiers est lecture_chantiers_selon_permission, qui délègue à
-- peut_consulter_chantier(entreprise_id, id) — un poste en
-- 'voir_chantiers_assignes' sans 'acces_chantiers' ne voit que les chantiers où
-- il est activement affecté. Ce test le verrouille, dans les deux sens, pour que
-- la dérive qui a produit le FAIL CH-08 de la V3 (le poste 'Ouvrier' de la
-- fixture pilote portait acces_chantiers, donc la vue globale) ne puisse pas
-- revenir sans casser un test.
--
-- Le contrôle de la fixture pilote elle-même est en plus dans
-- tests/e2e/pilot-acceptance-v3.spec.ts (CH-08) et dans l'assertion 7 ci-dessous.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","email":"ouvrier-a@invalid.local","role":"authenticated"}', true);

-- 1/2. Le prédicat : affecté -> oui, non affecté -> non.
select ok(
  public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001'),
  '1. ouvrier A affecté -> chantier consultable (positive witness)'
);
select ok(
  not public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000002'),
  '2. ouvrier A non affecté -> chantier NON consultable (negative witness)'
);

-- 3/4. Effet réel via SELECT : l'URL directe ne rend aucune ligne, donc la page
--      détail répond notFound().
select is(
  (select count(*)::int from public.chantiers where id='a4000000-0000-0000-0000-000000000002'),
  0,
  '3. lecture directe par id du chantier non affecté -> aucune ligne (URL directe refusée)'
);
select bag_eq(
  $$select id::text from public.chantiers$$,
  $$values ('a4000000-0000-0000-0000-000000000001')$$,
  '4. l''ouvrier ne voit que le chantier où il est affecté'
);

-- 5. Non-régression : un poste avec 'acces_chantiers' (conducteur travaux A) garde
--    la vue globale — un tel poste n'est jamais affecté à un chantier, le bloquer
--    sur l'affectation casserait un accès légitime.
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","email":"conducteur-a@invalid.local","role":"authenticated"}', true);
select ok(
  public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000002'),
  '5. conducteur travaux A (acces_chantiers) -> chantier non affecté consultable (non-régression)'
);

-- 6. Cross-tenant : l'ouvrier B ne consulte aucun chantier de A, affecté ou non.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","email":"ouvrier-b@invalid.local","role":"authenticated"}', true);
select ok(
  not public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001'),
  '6. ouvrier B -> aucun chantier de l''entreprise A (cross-tenant)'
);
select is(
  (select count(*)::int from public.chantiers where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  0,
  '6b. et aucune ligne de chantier de A ne lui est lisible'
);

-- 7. Le catalogue canonique des rôles prédéfinis reste la référence : un 'ouvrier'
--    porte voir_chantiers_assignes et jamais acces_chantiers/gerer_chantiers.
--    C'est exactement la propriété que la fixture pilote avait perdue.
reset role;
select ok(
  (select 'voir_chantiers_assignes' = any(permissions)
       and not ('acces_chantiers' = any(permissions))
       and not ('gerer_chantiers' = any(permissions))
     from public.modeles_roles_predefinis where cle='ouvrier'),
  '7. rôle canonique ''ouvrier'' : voir_chantiers_assignes, sans droit de vue globale sur les chantiers'
);
select ok(
  (select 'voir_chantiers_assignes' = any(permissions)
       and not ('acces_chantiers' = any(permissions))
     from public.modeles_roles_predefinis where cle='chef_equipe'),
  '7b. idem pour le rôle canonique ''chef_equipe'''
);

select * from finish();
rollback;
