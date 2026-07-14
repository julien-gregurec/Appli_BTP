-- Equipes permanentes de chantier : ouvriers, encadrement et conducteurs de travaux.
-- Une affectation d'equipe est distincte d'une ligne de planning journaliere.

create table if not exists public.equipes_chantiers (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null,
  employe_id uuid not null,
  role_chantier text not null default 'ouvrier'
    check (role_chantier in ('ouvrier','chef_equipe','chef_chantier','conducteur_travaux','autre')),
  date_debut date not null default current_date,
  date_fin date,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipes_chantiers_chantier_entreprise_fk
    foreign key (chantier_id, entreprise_id)
    references public.chantiers(id, entreprise_id) on delete cascade,
  constraint equipes_chantiers_employe_entreprise_fk
    foreign key (employe_id, entreprise_id)
    references public.employes(id, entreprise_id) on delete cascade,
  constraint equipes_chantiers_dates_check
    check (date_fin is null or date_fin >= date_debut)
);

create unique index if not exists equipes_chantiers_affectation_active_unique
  on public.equipes_chantiers(entreprise_id, chantier_id, employe_id)
  where date_fin is null;
create index if not exists equipes_chantiers_par_chantier_idx
  on public.equipes_chantiers(entreprise_id, chantier_id, date_fin, role_chantier);
create index if not exists equipes_chantiers_par_employe_idx
  on public.equipes_chantiers(entreprise_id, employe_id, date_fin);

alter table public.equipes_chantiers enable row level security;

drop policy if exists equipes_chantiers_lecture on public.equipes_chantiers;
create policy equipes_chantiers_lecture on public.equipes_chantiers
  for select to authenticated
  using (
    public.est_membre_actif(entreprise_id)
    and (
      public.a_permission(entreprise_id, 'acces_chantiers')
      or exists (
        select 1 from public.employes e
        where e.id = equipes_chantiers.employe_id
          and e.entreprise_id = equipes_chantiers.entreprise_id
          and e.utilisateur_id = auth.uid()
      )
    )
  );

drop policy if exists equipes_chantiers_gestion_insert on public.equipes_chantiers;
create policy equipes_chantiers_gestion_insert on public.equipes_chantiers
  for insert to authenticated
  with check (public.a_permission(entreprise_id, 'gerer_chantiers'));
drop policy if exists equipes_chantiers_gestion_update on public.equipes_chantiers;
create policy equipes_chantiers_gestion_update on public.equipes_chantiers
  for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_chantiers'))
  with check (public.a_permission(entreprise_id, 'gerer_chantiers'));
drop policy if exists equipes_chantiers_gestion_delete on public.equipes_chantiers;
create policy equipes_chantiers_gestion_delete on public.equipes_chantiers
  for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_chantiers'));

-- Le mode prototype reste utilisable pour les installations qui l'ont conservé.
drop policy if exists equipes_chantiers_prototype on public.equipes_chantiers;
create policy equipes_chantiers_prototype on public.equipes_chantiers
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.equipes_chantiers to anon, authenticated;

-- Reprend le responsable historique comme conducteur de travaux.
insert into public.equipes_chantiers(
  entreprise_id, chantier_id, employe_id, role_chantier, date_debut, note
)
select c.entreprise_id, c.id, c.responsable_id, 'conducteur_travaux',
       coalesce(c.date_debut_prevue, current_date),
       'Responsable repris depuis la fiche chantier'
from public.chantiers c
join public.employes e
  on e.id = c.responsable_id and e.entreprise_id = c.entreprise_id
where c.responsable_id is not null
on conflict do nothing;

-- Les personnes déjà planifiées sur un chantier actif apparaissent dans l'équipe.
insert into public.equipes_chantiers(
  entreprise_id, chantier_id, employe_id, role_chantier, date_debut, note
)
select a.entreprise_id, a.chantier_id, a.employe_id, 'ouvrier', min(a.date),
       'Affectation reprise depuis le planning'
from public.affectations a
join public.chantiers c
  on c.id = a.chantier_id and c.entreprise_id = a.entreprise_id
where a.chantier_id is not null
  and c.statut not in ('termine','facture','archive','annule')
group by a.entreprise_id, a.chantier_id, a.employe_id
on conflict do nothing;

-- Mes travaux considère désormais l'équipe permanente, tout en conservant la
-- compatibilité avec les anciennes lignes de planning.
create or replace function public.mes_devis_chantiers_sans_prix(p_entreprise_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_employe uuid;v_resultat jsonb;
begin
 if not public.a_permission(p_entreprise_id,'voir_devis_chantier_sans_prix') then raise exception 'Accès refusé';end if;
 select id into v_employe from public.employes where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut not in ('sorti','suspendu') limit 1;
 if v_employe is null then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(x order by x->>'chantier',x->>'numero'),'[]'::jsonb) into v_resultat from (
  select jsonb_build_object('id',d.id,'numero',d.numero,'statut',d.statut,'date_emission',d.date_emission,'chantier_id',c.id,'chantier',c.nom,'notes',d.notes_client,
   'lignes',(select coalesce(jsonb_agg(jsonb_build_object('designation',l.designation,'description',l.description,'quantite',l.quantite,'unite',l.unite) order by l.ordre),'[]'::jsonb) from public.lignes_devis l where l.devis_id=d.id)) x
  from public.devis d join public.chantiers c on c.id=d.chantier_id and c.entreprise_id=d.entreprise_id
  where d.entreprise_id=p_entreprise_id and d.statut in ('envoye','accepte')
    and (
      exists(select 1 from public.equipes_chantiers ec where ec.entreprise_id=d.entreprise_id and ec.chantier_id=d.chantier_id and ec.employe_id=v_employe and ec.date_fin is null)
      or exists(select 1 from public.affectations a where a.entreprise_id=d.entreprise_id and a.chantier_id=d.chantier_id and a.employe_id=v_employe)
    )
 ) q;
 return v_resultat;
end;$$;
revoke all on function public.mes_devis_chantiers_sans_prix(uuid) from public,anon;
grant execute on function public.mes_devis_chantiers_sans_prix(uuid) to authenticated;

notify pgrst, 'reload schema';
