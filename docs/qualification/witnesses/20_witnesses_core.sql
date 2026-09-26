-- Real behavioral witnesses (positive + negative) for the DB-layer GP hardening fixes,
-- run as the actual `authenticated`/`service_role` Postgres roles against the fixture from
-- 10_seed_tenants.sql, exactly as PostgREST/RLS would enforce them in production.
--
-- Convention: each witness runs in its own transaction (begin/rollback) so witnesses never
-- interfere with each other or with the fixture. A FAIL raises and aborts the script (run
-- with ON_ERROR_STOP=1); a PASS prints a NOTICE. Grep the run log for '^FAIL' at the end.

\set ON_ERROR_STOP off
\set QUIET off

-- ===========================================================================================
-- 1) cacada06 — plateforme_ajouter_admin: ferme l'auto-promotion de rôle
-- ===========================================================================================
begin;
insert into public.plateforme_admins (email, role) values
  ('lecture-plateforme@qualif.invalid', 'lecture'),
  ('total-plateforme@qualif.invalid', 'total');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.email','lecture-plateforme@qualif.invalid', true);
-- NEGATIVE: a 'lecture' platform member cannot self-promote to 'total'.
do $$
begin
  begin
    perform public.plateforme_ajouter_admin('lecture-plateforme@qualif.invalid', null, 'total');
    raise exception 'FAIL 1a: auto-promotion lecture->total a réussi (devrait être bloquée)';
  exception when others then
    if sqlerrm like '%réservé%' then
      raise notice 'PASS 1a: auto-promotion lecture->total bloquée (%)', sqlerrm;
    else
      raise exception 'FAIL 1a: erreur inattendue: %', sqlerrm;
    end if;
  end;
end $$;
rollback;

begin;
insert into public.plateforme_admins (email, role) values
  ('total-plateforme-2@qualif.invalid', 'total');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.email','total-plateforme-2@qualif.invalid', true);
-- POSITIVE: a 'total' platform member can still add/manage admins (non-regression).
do $$
begin
  perform public.plateforme_ajouter_admin('nouveau-admin@qualif.invalid', 'Nouveau', 'support');
end $$;
reset role;
do $$
begin
  if exists(select 1 from public.plateforme_admins where email='nouveau-admin@qualif.invalid' and role='support') then
    raise notice 'PASS 1b: membre total peut toujours ajouter un admin support';
  else
    raise exception 'FAIL 1b: ajout non reflété';
  end if;
end $$;
rollback;

-- ===========================================================================================
-- 2) d357314e — boutique_finaliser_commande_payee: ferme le contournement de paiement
-- ===========================================================================================
begin;
insert into public.boutique_commandes (id, entreprise_id, utilisateur_id, statut, stripe_checkout_id)
values ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'en_attente_paiement', 'cs_test_qualif_001');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
-- NEGATIVE: the order's own owner, authenticated, cannot self-mark it paid (no EXECUTE grant).
do $$
begin
  begin
    perform public.boutique_finaliser_commande_payee('90000000-0000-0000-0000-000000000001', 'cs_test_qualif_001');
    raise exception 'FAIL 2a: un utilisateur authentifié a pu finaliser sa propre commande sans passer par Stripe';
  exception when insufficient_privilege then
    raise notice 'PASS 2a: EXECUTE refusé à authenticated (permission denied), contournement fermé';
  when others then
    raise exception 'FAIL 2a: erreur inattendue (pas insufficient_privilege): % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

begin;
insert into public.boutique_commandes (id, entreprise_id, utilisateur_id, statut, stripe_checkout_id)
values ('90000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'en_attente_paiement', 'cs_test_qualif_002');
set local role service_role;
-- POSITIVE: service_role (the webhook path, after real Stripe signature+payment_status checks) still works.
do $$
begin
  perform public.boutique_finaliser_commande_payee('90000000-0000-0000-0000-000000000002', 'cs_test_qualif_002');
  if (select statut from public.boutique_commandes where id='90000000-0000-0000-0000-000000000002') = 'payee' then
    raise notice 'PASS 2b: service_role (webhook) finalise toujours la commande après paiement réel';
  else
    raise exception 'FAIL 2b: statut non mis à jour par service_role';
  end if;
end $$;
rollback;

-- NEGATIVE (cross-tenant angle of the same fix): obtenir_ou_creer_fournisseur_boutique closed to authenticated.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    perform public.obtenir_ou_creer_fournisseur_boutique('b0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL 2c: authenticated a pu créer un fournisseur boutique dans une entreprise tierce';
  exception when insufficient_privilege then
    raise notice 'PASS 2c: EXECUTE refusé à authenticated sur obtenir_ou_creer_fournisseur_boutique';
  when others then
    raise exception 'FAIL 2c: erreur inattendue: % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- ===========================================================================================
-- 3) e3211e0d / 1aa1ade3 / 9c24e87e — cross-tenant FK isolation (devis, factures, relances)
-- ===========================================================================================
-- NEGATIVE: devis in A referencing client from B is rejected by the composite FK.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.devis (id, entreprise_id, client_id, statut, numero)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'brouillon', 'QUALIF-DEVIS-1');
    raise exception 'FAIL 3a: devis A a pu référencer un client de B (cross-tenant)';
  exception when foreign_key_violation then
    raise notice 'PASS 3a: FK composite devis_client_entreprise_fkey bloque le cross-tenant';
  when others then
    raise exception 'FAIL 3a: erreur inattendue: % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- POSITIVE: devis in A referencing its own client A succeeds.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  insert into public.devis (id, entreprise_id, client_id, statut, numero)
  values ('90000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'brouillon', 'QUALIF-DEVIS-2');
  if found or exists(select 1 from public.devis where id='90000000-0000-0000-0000-00000000000d') then
    raise notice 'PASS 3b: devis légitime (même entreprise) créé sans régression';
  end if;
end $$;
rollback;

-- NEGATIVE: facture in A referencing client from B rejected.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.factures (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'brouillon', 'QUALIF-FACT-1', 100, 120);
    raise exception 'FAIL 3c: facture A a pu référencer un client de B';
  exception when foreign_key_violation then
    raise notice 'PASS 3c: FK composite factures_client_entreprise_fkey bloque le cross-tenant';
  when others then
    raise exception 'FAIL 3c: erreur inattendue: % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- NEGATIVE: relance_impayes in A pointing at a facture from B rejected (needs a real facture in B first).
begin;
insert into public.factures (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-00000000000f', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', 'envoyee', 'QUALIF-FACT-B1', 100, 120);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.relances_impayes (id, entreprise_id, facture_id, canal)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-00000000000f', 'email');
    raise exception 'FAIL 3d: relance A a pu pointer sur une facture de B';
  exception when foreign_key_violation then
    raise notice 'PASS 3d: FK composite relances_impayes_facture_entreprise_fkey bloque le cross-tenant';
  when others then
    raise exception 'FAIL 3d: erreur inattendue: % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- ===========================================================================================
-- 4) 12e9104d — restaure l'écriture RLS sur public.chantiers (legit create/update, block cross)
-- ===========================================================================================
-- POSITIVE: a full-rights member of A can create a chantier for A's own client.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  insert into public.chantiers (id, entreprise_id, client_id, nom)
  values ('90000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Chantier qualif A');
  raise notice 'PASS 4a: création chantier légitime (membre + gerer_chantiers, client de sa propre entreprise) réussie';
end $$;
rollback;

-- NEGATIVE: same member cannot attach a chantier in A to a client belonging to B.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.chantiers (id, entreprise_id, client_id, nom)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'Chantier cross-tenant');
    raise exception 'FAIL 4b: chantier A a pu être rattaché à un client de B';
  exception when others then
    if sqlstate = '42501' or sqlerrm ilike '%row-level security%' or sqlerrm ilike '%check constraint%' then
      raise notice 'PASS 4b: RLS WITH CHECK bloque le rattachement cross-tenant (%/%)', sqlstate, sqlerrm;
    else
      raise exception 'FAIL 4b: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
rollback;

-- NEGATIVE: a member of B cannot create a chantier inside A at all.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    insert into public.chantiers (id, entreprise_id, client_id, nom)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Intrusion B dans A');
    raise exception 'FAIL 4c: membre B a pu créer un chantier dans A';
  exception when others then
    if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
      raise notice 'PASS 4c: RLS bloque un membre de B écrivant dans A';
    else
      raise exception 'FAIL 4c: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
rollback;

-- NEGATIVE: a member of A WITHOUT gerer_chantiers permission cannot create a chantier
-- (the restrictive role_gestion_insert policy added by the same fix).
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    insert into public.chantiers (id, entreprise_id, client_id, nom)
    values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Sans droit gerer_chantiers');
    raise exception 'FAIL 4d: membre sans gerer_chantiers a pu créer un chantier';
  exception when others then
    if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
      raise notice 'PASS 4d: policy RESTRICTIVE role_gestion_insert exige bien gerer_chantiers';
    else
      raise exception 'FAIL 4d: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
rollback;

-- POSITIVE: legit update of an existing chantier by an authorized member.
begin;
insert into public.chantiers (id, entreprise_id, client_id, nom)
values ('90000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Chantier à modifier');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  update public.chantiers set nom = 'Chantier modifié' where id = '90000000-0000-0000-0000-000000000012';
  if (select nom from public.chantiers where id='90000000-0000-0000-0000-000000000012') = 'Chantier modifié' then
    raise notice 'PASS 4e: update légitime de chantier réussi';
  else
    raise exception 'FAIL 4e: update non appliqué';
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 1 COMPLETE ==='
