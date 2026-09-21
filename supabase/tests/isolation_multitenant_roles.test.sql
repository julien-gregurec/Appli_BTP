begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

\ir fixtures/isolation_multitenant.inc

set local role authenticated;

-- Chefs d'équipe : chantier assigné et données terrain, sans données commerciales.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select is((select count(*) from public.chantiers), 1::bigint, 'chef équipe A ne voit que le chantier assigné');
select is((select count(*) from public.clients), 0::bigint, 'chef équipe A ne voit aucun client');
select is((select count(*) from public.devis), 0::bigint, 'chef équipe A ne voit aucun devis commercial');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-b@invalid.local', true);
select is((select count(*) from public.chantiers), 1::bigint, 'chef équipe B ne voit que le chantier assigné');
select is((select count(*) from public.clients), 0::bigint, 'chef équipe B ne voit aucun client');
select is((select count(*) from public.devis), 0::bigint, 'chef équipe B ne voit aucun devis commercial');

-- Conducteurs : ressources opérationnelles et commerciales de leur entreprise uniquement.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'conducteur A voit uniquement les clients A');
select is((select count(*) from public.chantiers), 2::bigint, 'conducteur A voit uniquement les chantiers A');
select is((select count(*) from public.devis), 1::bigint, 'conducteur A voit uniquement les devis A');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-b@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'conducteur B voit uniquement les clients B');
select is((select count(*) from public.chantiers), 2::bigint, 'conducteur B voit uniquement les chantiers B');
select is((select count(*) from public.devis), 1::bigint, 'conducteur B voit uniquement les devis B');

-- Comptables : factures/achats de leur entreprise, sans accès client implicite.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.email', 'comptable-a@invalid.local', true);
select is((select count(*) from public.factures), 1::bigint, 'comptable A voit uniquement les factures A');
select is((select count(*) from public.fournisseurs), 1::bigint, 'comptable A voit uniquement les fournisseurs A');
select is((select count(*) from public.commandes_fournisseurs), 1::bigint, 'comptable A voit uniquement les commandes A');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.email', 'comptable-b@invalid.local', true);
select is((select count(*) from public.factures), 1::bigint, 'comptable B voit uniquement les factures B');
select is((select count(*) from public.fournisseurs), 1::bigint, 'comptable B voit uniquement les fournisseurs B');
select is((select count(*) from public.commandes_fournisseurs), 1::bigint, 'comptable B voit uniquement les commandes B');

-- Dirigeants : périmètre complet, toujours isolé par entreprise.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.email', 'dirigeant-a@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'dirigeant A ne voit que les clients A');
select is((select count(*) from public.factures), 1::bigint, 'dirigeant A ne voit que les factures A');
select is((select count(*) from public.notes_frais), 1::bigint, 'dirigeant A ne voit que les notes A');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.email', 'dirigeant-b@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'dirigeant B ne voit que les clients B');
select is((select count(*) from public.factures), 1::bigint, 'dirigeant B ne voit que les factures B');
select is((select count(*) from public.notes_frais), 1::bigint, 'dirigeant B ne voit que les notes B');

reset role;
select * from finish();
rollback;
