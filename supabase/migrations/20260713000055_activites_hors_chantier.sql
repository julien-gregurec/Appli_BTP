-- Le planning accepte aussi les temps internes et absences planifiées sans chantier.
alter table public.affectations
  alter column chantier_id drop not null,
  add column if not exists type_activite text not null default 'chantier',
  add column if not exists lieu_activite text;

alter table public.affectations drop constraint if exists affectations_type_activite_check;
alter table public.affectations add constraint affectations_type_activite_check
  check (type_activite in ('chantier','bureau','depot','visite_medicale','formation','conge','autre'));

alter table public.affectations drop constraint if exists affectations_lieu_coherent_check;
alter table public.affectations add constraint affectations_lieu_coherent_check
  check (
    (type_activite = 'chantier' and chantier_id is not null)
    or (type_activite <> 'chantier' and chantier_id is null)
  );

drop index if exists public.affectations_tache_unique;
create unique index affectations_tache_unique
  on public.affectations(
    entreprise_id,
    employe_id,
    date,
    type_activite,
    coalesce(chantier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(tache,''),
    coalesce(lieu_activite,'')
  );

notify pgrst, 'reload schema';
