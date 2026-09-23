-- 8) af9374e6 — ferme l'INSERT direct sur paiements
begin;
insert into public.factures (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'envoyee', 'QUALIF-FACT-PAY', 100, 120);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
-- NEGATIVE: authenticated can no longer INSERT directly into paiements (must go through the RPC).
do $$
begin
  begin
    insert into public.paiements (id, facture_id, montant, mode, date)
    values (gen_random_uuid(), '90000000-0000-0000-0000-000000000021', 120, 'virement', current_date);
    raise exception 'FAIL 8a: authenticated a pu insérer directement dans paiements (double encaissement possible)';
  exception when insufficient_privilege then
    raise notice 'PASS 8a: INSERT direct sur paiements refusé à authenticated (revoke insert)';
  when others then
    raise exception 'FAIL 8a: erreur inattendue: % / %', sqlstate, sqlerrm;
  end;
end $$;
rollback;

-- POSITIVE (non-regression): SELECT on paiements is untouched.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
begin
  perform count(*) from public.paiements;
  raise notice 'PASS 8b: SELECT sur paiements toujours autorisé (non-régression)';
end $$;
rollback;

-- ===========================================================================================
-- 9) d46f7f1f — verrouille l'immutabilité d'une facture émise en base
-- ===========================================================================================
begin;
insert into public.factures (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'envoyee', 'QUALIF-FACT-LOCK', 100, 120);
-- NEGATIVE: even service_role (bypassing RLS entirely) cannot change montant_ht after emission —
-- the trigger, not RLS, is the guard here, so it must hold regardless of the calling role.
set local role service_role;
do $$
begin
  begin
    update public.factures set montant_ht = 999 where id = '90000000-0000-0000-0000-000000000022';
    raise exception 'FAIL 9a: le montant d''une facture émise a pu être modifié (trigger contourné)';
  exception when others then
    if sqlerrm ilike '%plus être modifiée%' or sqlerrm ilike '%déjà été émise%' then
      raise notice 'PASS 9a: trigger verrou_facture_emise bloque la modification du montant post-émission';
    else
      raise exception 'FAIL 9a: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
-- NEGATIVE: cannot revert to brouillon either.
do $$
begin
  begin
    update public.factures set statut = 'brouillon' where id = '90000000-0000-0000-0000-000000000022';
    raise exception 'FAIL 9b: une facture émise a pu redevenir brouillon';
  exception when others then
    if sqlerrm ilike '%redevenir brouillon%' then
      raise notice 'PASS 9b: trigger bloque le retour à brouillon post-émission';
    else
      raise exception 'FAIL 9b: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
-- NEGATIVE: cannot delete an emitted invoice.
do $$
begin
  begin
    delete from public.factures where id = '90000000-0000-0000-0000-000000000022';
    raise exception 'FAIL 9c: une facture émise a pu être supprimée';
  exception when others then
    if sqlerrm ilike '%plus être supprimée%' then
      raise notice 'PASS 9c: trigger bloque la suppression post-émission';
    else
      raise exception 'FAIL 9c: erreur inattendue: % / %', sqlstate, sqlerrm;
    end if;
  end;
end $$;
-- POSITIVE (non-regression): an allow-listed "free" field stays writable post-emission.
do $$
begin
  update public.factures set notes_internes = 'relance envoyée le ' || current_date where id = '90000000-0000-0000-0000-000000000022';
  if (select notes_internes from public.factures where id='90000000-0000-0000-0000-000000000022') like 'relance envoyée%' then
    raise notice 'PASS 9d: champ libre (notes_internes) toujours modifiable post-émission';
  else
    raise exception 'FAIL 9d: champ libre légitime bloqué par erreur';
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 4 (misc finance) COMPLETE ==='
