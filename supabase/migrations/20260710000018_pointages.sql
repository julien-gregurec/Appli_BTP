-- Pointage des heures réellement travaillées par employé et chantier.

create table public.pointages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete restrict,
  chantier_id uuid not null references public.chantiers(id) on delete restrict,
  date date not null default current_date,
  heures_normales numeric(5,2) not null default 7 check (heures_normales >= 0 and heures_normales <= 24),
  heures_supplementaires numeric(5,2) not null default 0 check (heures_supplementaires >= 0 and heures_supplementaires <= 24),
  pause_minutes integer not null default 0 check (pause_minutes >= 0 and pause_minutes <= 1440),
  tache text,
  commentaire text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (heures_normales + heures_supplementaires > 0),
  check (heures_normales + heures_supplementaires <= 24)
);

create index pointages_entreprise_date_idx on public.pointages (entreprise_id, date desc);
create index pointages_employe_date_idx on public.pointages (employe_id, date desc);
create index pointages_chantier_date_idx on public.pointages (chantier_id, date desc);

create or replace function public.verifier_pointage_coherence()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.employes where id = new.employe_id and entreprise_id = new.entreprise_id) then
    raise exception 'Employe incompatible avec l entreprise';
  end if;
  if not exists (select 1 from public.chantiers where id = new.chantier_id and entreprise_id = new.entreprise_id) then
    raise exception 'Chantier incompatible avec l entreprise';
  end if;
  return new;
end;
$$;

create trigger verifier_pointage_avant_ecriture
  before insert or update on public.pointages
  for each row execute function public.verifier_pointage_coherence();

alter table public.pointages enable row level security;
create policy "membres pointages" on public.pointages
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "prototype acces anonyme" on public.pointages
  for all to anon using (true) with check (true);
grant select, insert, update, delete on public.pointages to anon, authenticated;

notify pgrst, 'reload schema';
