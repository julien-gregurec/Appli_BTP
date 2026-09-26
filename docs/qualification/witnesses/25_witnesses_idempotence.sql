-- Witness for ef49ef51 — ferme deux trous d'idempotence (encaissement, avoir).

-- 11a/11b: enregistrer_paiement_facture — TOCTOU guard on remaining balance.
begin;
insert into public.factures (id, entreprise_id, client_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'envoyee', 'QUALIF-FACT-IDEMP', 100, 120);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
-- NEGATIVE: a payment exceeding the remaining balance is rejected outright.
do $$
begin
  begin
    perform public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000041', 150);
    raise exception 'FAIL 11a: paiement supérieur au reste dû accepté';
  exception when others then
    if sqlerrm ilike '%dépasse le reste dû%' then
      raise notice 'PASS 11a: paiement > reste dû refusé par la RPC verrouillée';
    else raise exception 'FAIL 11a: erreur inattendue: % / %', sqlstate, sqlerrm; end if;
  end;
end $$;
-- POSITIVE then NEGATIVE: first partial payment succeeds, a second one that would push the
-- total over montant_ttc is rejected (proves montant_paye is re-read post-first-payment, i.e.
-- the TOCTOU window the fix closes is actually closed within the same session/sequence).
do $$
begin
  perform public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000041', 100);
  raise notice 'PASS 11b: premier règlement partiel (100/120) accepté';
end $$;
do $$
begin
  begin
    perform public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000041', 100);
    raise exception 'FAIL 11c: second règlement (100+100=200 > 120) accepté — double encaissement possible';
  exception when others then
    if sqlerrm ilike '%dépasse le reste dû%' then
      raise notice 'PASS 11c: second règlement excédentaire refusé (montant_paye relu avant comparaison)';
    else raise exception 'FAIL 11c: erreur inattendue: % / %', sqlstate, sqlerrm; end if;
  end;
end $$;
rollback;

-- 11d: creer_facture_avancee — duplicate avoir resolves to the existing one, never a second row.
begin;
insert into public.chantiers (id, entreprise_id, client_id, nom)
values ('90000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Chantier avoir qualif');
insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000042', 'accepte', 'QUALIF-DEV-AVOIR', 100, 120);
insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, statut, type, numero, montant_ht, montant_ttc)
values ('90000000-0000-0000-0000-000000000044', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000042', '90000000-0000-0000-0000-000000000043', 'envoyee', 'simple', 'QUALIF-FACT-AVOIR', 100, 120);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
declare v_avoir1 uuid;
begin
  v_avoir1 := public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000043','avoir',100,false,'90000000-0000-0000-0000-000000000044');
  raise notice 'PASS 11d: premier avoir créé (%)', v_avoir1;
end $$;
do $$
begin
  begin
    perform public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000043','avoir',100,false,'90000000-0000-0000-0000-000000000044');
    raise exception 'FAIL 11e: un second avoir identique a pu être créé (doublon de crédit)';
  exception when others then
    if sqlerrm ilike '%avoir_existant%' then
      raise notice 'PASS 11e: second appel identique résout vers l''avoir existant, aucun doublon créé';
    else raise exception 'FAIL 11e: erreur inattendue: % / %', sqlstate, sqlerrm; end if;
  end;
end $$;
do $$
declare v_count int;
begin
  select count(*) into v_count from public.factures where facture_origine_id='90000000-0000-0000-0000-000000000044' and type='avoir';
  if v_count = 1 then
    raise notice 'PASS 11f: exactement un avoir en base malgré 2 appels (index unique partiel tient)';
  else
    raise exception 'FAIL 11f: % avoirs en base au lieu de 1', v_count;
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 6 (idempotence) COMPLETE ==='
