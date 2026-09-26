-- Witness for f630956f — verrouille les devis acceptés et initialise l'expiration des essais
-- gratuits. Commit message flags this as "Non rejoué contre une base réelle" — first real run.

-- NEGATIVE: an accepted devis cannot be modified anymore (service_role too — trigger, not RLS).
begin;
insert into public.devis (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'accepte', 'QUALIF-DEVIS-LOCK', 500, 600);
set local role service_role;
do $$
begin
  begin
    update public.devis set montant_ht = 1 where id = '90000000-0000-0000-0000-000000000031';
    raise exception 'FAIL 10a: un devis accepté a pu être modifié';
  exception when others then
    if sqlerrm ilike '%plus être modifié%' then
      raise notice 'PASS 10a: trigger verrou_devis_accepte bloque la modification post-acceptation';
    else raise exception 'FAIL 10a: erreur inattendue: % / %', sqlstate, sqlerrm; end if;
  end;
end $$;
do $$
begin
  begin
    delete from public.devis where id = '90000000-0000-0000-0000-000000000031';
    raise exception 'FAIL 10b: un devis accepté a pu être supprimé';
  exception when others then
    if sqlerrm ilike '%plus être supprimé%' then
      raise notice 'PASS 10b: trigger bloque la suppression post-acceptation';
    else raise exception 'FAIL 10b: erreur inattendue: % / %', sqlstate, sqlerrm; end if;
  end;
end $$;
rollback;

-- POSITIVE (non-regression): chantier_id stays reassignable on an accepted devis (deliberate exclusion).
begin;
insert into public.chantiers (id, entreprise_id, client_id, nom)
values ('90000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Autre chantier A');
insert into public.devis (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'accepte', 'QUALIF-DEVIS-CHANTIER', 500, 600);
set local role service_role;
do $$
begin
  update public.devis set chantier_id = '90000000-0000-0000-0000-000000000032' where id = '90000000-0000-0000-0000-000000000033';
  if (select chantier_id from public.devis where id='90000000-0000-0000-0000-000000000033') = '90000000-0000-0000-0000-000000000032' then
    raise notice 'PASS 10c: chantier_id reste réassignable sur un devis accepté (exclusion volontaire respectée)';
  else
    raise exception 'FAIL 10c: réassignation légitime de chantier_id bloquée par erreur';
  end if;
end $$;
rollback;

-- POSITIVE: a newly created entreprise gets a real 30-day trial expiration date, not NULL.
begin;
insert into public.entreprises (id, nom) values ('90000000-0000-0000-0000-000000000034', 'Entreprise essai qualif');
do $$
declare v_debut date; v_fin date;
begin
  select abonnement_essai_debut, abonnement_essai_fin into v_debut, v_fin
  from public.entreprises where id = '90000000-0000-0000-0000-000000000034';
  if v_fin is null then
    raise exception 'FAIL 10d: abonnement_essai_fin reste NULL — l''essai gratuit ne s''arrête jamais';
  elsif v_fin = v_debut + 30 then
    raise notice 'PASS 10d: nouvelle entreprise reçoit une date de fin d''essai réelle (debut+30j)';
  else
    raise exception 'FAIL 10d: date de fin d''essai incohérente (debut=%, fin=%)', v_debut, v_fin;
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 5 (devis verrou + essai) COMPLETE ==='
