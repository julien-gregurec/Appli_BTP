-- Witnesses for HR/payroll storage RLS (00da9fc4, fd5bc653) and misc DB fixes
-- (af9374e6 direct-insert paiements, ef49ef51 idempotence factures, d46f7f1f immutabilité
-- facture émise, f630956f verrou devis accepté, 14694edf tarification Mini,
-- b16db673 revoke TRUNCATE/TRIGGER/REFERENCES, 97e3aff0 postgrest embeds).

-- ===========================================================================================
-- 5) 00da9fc4 — fiabilise la policy documents-paie: self-read allowed, stranger denied,
--    payroll-manager allowed regardless.
-- ===========================================================================================
begin;
insert into storage.buckets (id, name) values ('documents-paie','documents-paie') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-paie', 'a0000000-0000-0000-0000-000000000001/bulletin-eeeeeeee-08-2026.pdf');
-- POSITIVE: the employee who owns the payslip (est_employe_paie_courant) can read it.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000005', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-paie' and name like '%bulletin-eeeeeeee%') then
    raise notice 'PASS 5a: l''employé propriétaire du bulletin peut le lire';
  else
    raise exception 'FAIL 5a: employé propriétaire ne peut pas lire son propre bulletin';
  end if;
end $$;
rollback;

begin;
insert into storage.buckets (id, name) values ('documents-paie','documents-paie') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-paie', 'a0000000-0000-0000-0000-000000000001/bulletin-eeeeeeee-08-2026.pdf');
-- NEGATIVE: an unrelated member of the same company, without voir_paie_confidentielle/gerer_paie,
-- and who isn't the payslip's own employee, cannot read it.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','ffffffff-0000-0000-0000-000000000006', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-paie' and name like '%bulletin-eeeeeeee%') then
    raise exception 'FAIL 5b: un collègue sans droit paie a pu lire le bulletin d''un autre employé';
  else
    raise notice 'PASS 5b: collègue sans droit paie ne voit pas le bulletin (policy documents_paie_select)';
  end if;
end $$;
rollback;

begin;
insert into storage.buckets (id, name) values ('documents-paie','documents-paie') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-paie', 'a0000000-0000-0000-0000-000000000001/bulletin-eeeeeeee-08-2026.pdf');
-- POSITIVE: the payroll manager (gerer_paie) can read anyone's payslip.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000004', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-paie' and name like '%bulletin-eeeeeeee%') then
    raise notice 'PASS 5c: le gestionnaire paie (gerer_paie) lit le bulletin de n''importe quel employé';
  else
    raise exception 'FAIL 5c: gestionnaire paie ne peut pas lire un bulletin';
  end if;
end $$;
rollback;

-- ===========================================================================================
-- 6) fd5bc653 — restreint la lecture des documents RH/fournisseurs/pointage sensibles
-- ===========================================================================================
begin;
insert into storage.buckets (id, name) values ('documents-employes','documents-employes') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-employes', 'a0000000-0000-0000-0000-000000000001/carte-eeeeeeee.pdf');
-- POSITIVE: the employee reads their own carte BTP.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000005', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-employes' and name like '%carte-eeeeeeee%') then
    raise notice 'PASS 6a: l''employé lit sa propre carte BTP';
  else
    raise exception 'FAIL 6a: employé ne peut pas lire sa propre carte BTP';
  end if;
end $$;
rollback;

begin;
insert into storage.buckets (id, name) values ('documents-employes','documents-employes') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-employes', 'a0000000-0000-0000-0000-000000000001/carte-eeeeeeee.pdf');
-- NEGATIVE: a random active member (no gerer_employes, not the card's owner) cannot read a colleague's carte BTP.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','ffffffff-0000-0000-0000-000000000006', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-employes' and name like '%carte-eeeeeeee%') then
    raise exception 'FAIL 6b: un membre actif sans gerer_employes a pu lire la carte BTP d''un collègue';
  else
    raise notice 'PASS 6b: membre sans gerer_employes ne lit pas la carte BTP d''un collègue (élévation intra-entreprise fermée)';
  end if;
end $$;
rollback;

begin;
insert into storage.buckets (id, name) values ('documents-employes','documents-employes') on conflict do nothing;
insert into storage.objects (bucket_id, name)
values ('documents-employes', 'a0000000-0000-0000-0000-000000000001/photo-eeeeeeee.jpg');
-- POSITIVE (non-regression): any active member can still read the employee PHOTO (directory use case).
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated', true);
select set_config('request.jwt.claim.sub','ffffffff-0000-0000-0000-000000000006', true);
do $$
begin
  if exists (select 1 from storage.objects where bucket_id='documents-employes' and name like '%photo-eeeeeeee%') then
    raise notice 'PASS 6c: la photo employé reste lisible par tout membre actif (non-régression annuaire)';
  else
    raise exception 'FAIL 6c: régression — la photo employé n''est plus lisible par un membre actif';
  end if;
end $$;
rollback;

\echo '=== WITNESS BATCH 2 (HR/storage) COMPLETE ==='
