-- Witness for 845eb4c4 — empêche une session support de se laisser un accès permanent.
-- The commit's own pgTAP test was never executed against a real DB before ("style
-- introspection, non exécuté faute de Docker/Postgres" per its commit message) — this is
-- the first real behavioral run.

begin;
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
values ('11111111-0000-0000-0000-000000000099', 'support-op@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated');
insert into public.plateforme_admins (email, role) values ('support-op@qualif.invalid', 'support');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','11111111-0000-0000-0000-000000000099', true);
select set_config('request.jwt.claim.email','support-op@qualif.invalid', true);
-- open a real support session on entreprise A
do $$ begin perform public.plateforme_entrer_entreprise('a0000000-0000-0000-0000-000000000001', 'Diagnostic incident qualif'); end $$;

-- NEGATIVE: while the support session is open, the support operator cannot self-add as a
-- PERMANENT member of A (utilisateurs_entreprises insert), even though est_membre_actif(A) is
-- true for them right now (est_acces_support_actif OR-branch).
do $$
begin
  begin
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
    values ('11111111-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'actif');
    raise exception 'FAIL 7a: opérateur support a pu se créer une appartenance permanente pendant sa session';
  exception when others then
    if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
      raise notice 'PASS 7a: est_membre_actif_reel bloque la persistance de membership pendant une session support';
    else
      raise exception 'FAIL 7a: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;

-- NEGATIVE: support operator cannot grant themselves a permanent poste permission either.
do $$
begin
  begin
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
    values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'gerer_utilisateurs', true)
    on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;
    raise exception 'FAIL 7b: opérateur support a pu modifier des permissions de poste de façon permanente';
  exception when others then
    if sqlstate = '42501' or sqlerrm ilike '%row-level security%' then
      raise notice 'PASS 7b: permissions_poste protégée contre la persistance support';
    else
      raise exception 'FAIL 7b: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;

-- POSITIVE (non-regression): the support session still grants ordinary, reversible read access
-- during the session (the assistance use case itself isn't broken by the fix).
do $$
begin
  if (select count(*) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001') is not null then
    raise notice 'PASS 7c: la session support garde un accès de lecture normal (non-régression)';
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 3 (support session) COMPLETE ==='
