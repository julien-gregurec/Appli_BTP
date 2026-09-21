begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temp table tarifs_v2_repro (
  id integer primary key,
  actif boolean not null,
  valide_du date not null,
  valide_au date,
  prix_mensuel_ht numeric,
  prix_annuel_ht numeric,
  devis_obligatoire boolean not null
);

insert into tarifs_v2_repro values
  (1, true, current_date, null, 699, 8388, true);

select throws_like(
  $$alter table tarifs_v2_repro add constraint repro_tarif_public_coherent
    check (not actif or (devis_obligatoire and prix_mensuel_ht is null and prix_annuel_ht is null)
      or (not devis_obligatoire and prix_mensuel_ht is not null and prix_annuel_ht is not null))$$,
  '%is violated by some row%',
  '201 isolée : le plan sur_mesure historique actif et tarifé bloque la contrainte publique'
);

update tarifs_v2_repro set actif = false, valide_au = current_date where id = 1;

select lives_ok(
  $$alter table tarifs_v2_repro add constraint repro_tarif_public_coherent
    check (not actif or (devis_obligatoire and prix_mensuel_ht is null and prix_annuel_ht is null)
      or (not devis_obligatoire and prix_mensuel_ht is not null and prix_annuel_ht is not null))$$,
  'précondition 201 : désactiver sans supprimer rend la contrainte applicable'
);

select lives_ok(
  $$alter table tarifs_v2_repro add constraint repro_dates
    check (valide_au is null or valide_au >= valide_du)$$,
  'précondition 201 : la chronologie restaurée accepte la contrainte de dates'
);

select ok(
  exists (select 1 from pg_constraint where conrelid='public.plans_abonnement'::regclass and conname='plans_abonnement_check'),
  'contrainte chronologique canonique présente'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.plans_abonnement'::regclass and conname='plans_abonnement_tarif_public_coherent'),
  'contrainte tarifaire canonique présente'
);
select is(
  (select count(*) from public.plans_abonnement where valide_au is not null and valide_au < valide_du),
  0::bigint,
  'aucune date tarifaire invalide'
);
select is(
  (select count(*) from public.plans_abonnement where actif and not (
    (devis_obligatoire and prix_mensuel_ht is null and prix_annuel_ht is null)
    or (not devis_obligatoire and prix_mensuel_ht is not null and prix_annuel_ht is not null and prix_mensuel_ht >= 0 and prix_annuel_ht >= 0)
  )),
  0::bigint,
  'aucun plan actif incohérent'
);
select is(
  to_regclass('public.migration_tarifs_v2_reconciliation_v2'),
  null::regclass,
  'table de travail de réconciliation supprimée'
);
select ok(
  to_regprocedure('public.plateforme_appliquer_remise(uuid,text,text)') is null
  and position('anon' in pg_get_functiondef('public.valider_preuve_pointage(uuid,uuid,text,text)'::regprocedure)) = 0,
  'net-effect Production : surcharge remise legacy et branche anon absentes'
);

select * from finish();
rollback;
