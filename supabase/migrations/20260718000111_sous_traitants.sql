-- Sous-traitants : tiers payables, affectations chantier et coûts dédiés.

alter table public.fournisseurs
  add column if not exists type_tiers text not null default 'fournisseur',
  add column if not exists specialite text,
  add column if not exists numero_tva text,
  add column if not exists assurance_rc_pro text,
  add column if not exists assurance_decennale text,
  add column if not exists date_validite_assurance date;

alter table public.fournisseurs drop constraint if exists fournisseurs_type_tiers_check;
alter table public.fournisseurs add constraint fournisseurs_type_tiers_check
  check(type_tiers in ('fournisseur','sous_traitant'));
create index if not exists fournisseurs_type_tiers_idx on public.fournisseurs(entreprise_id,type_tiers,actif,nom);

insert into public.permissions_disponibles(cle,module,description) values
  ('acces_sous_traitants','Sous-traitants','Consulter les sous-traitants, leurs affectations et leurs coûts chantier'),
  ('gerer_sous_traitants','Sous-traitants','Créer et modifier les sous-traitants et leurs affectations chantier')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,false from public.postes p
cross join (values('acces_sous_traitants'),('gerer_sous_traitants')) d(cle)
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

update public.permissions_poste pp set autorise=true from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='acces_sous_traitants'
  and lower(btrim(p.nom)) in ('chef de chantier','conducteur de travaux','directeur travaux','administration','comptable','gérant','gerant','administrateur','admin');
update public.permissions_poste pp set autorise=true from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='gerer_sous_traitants'
  and lower(btrim(p.nom)) in ('conducteur de travaux','directeur travaux','administration','gérant','gerant','administrateur','admin');

update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(permissions || array['acces_sous_traitants']) x
) where cle in ('chef_chantier','conducteur_travaux','directeur_travaux','administration','comptable');
update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(permissions || array['gerer_sous_traitants']) x
) where cle in ('conducteur_travaux','directeur_travaux','administration');

create table if not exists public.sous_traitants_chantiers(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  fournisseur_id uuid not null,
  chantier_id uuid not null,
  mission text not null check(btrim(mission)<>''),
  date_debut date,
  date_fin date,
  montant_previsionnel_ht numeric(12,2) not null default 0 check(montant_previsionnel_ht>=0),
  statut text not null default 'prevue' check(statut in ('prevue','en_cours','terminee','annulee')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,entreprise_id),
  foreign key(fournisseur_id,entreprise_id) references public.fournisseurs(id,entreprise_id) on delete cascade,
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete cascade,
  check(date_fin is null or date_debut is null or date_fin>=date_debut)
);
create index if not exists sous_traitants_chantiers_chantier_idx on public.sous_traitants_chantiers(entreprise_id,chantier_id,statut);
create index if not exists sous_traitants_chantiers_tiers_idx on public.sous_traitants_chantiers(entreprise_id,fournisseur_id,statut);

create or replace function public.verifier_affectation_sous_traitant()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.fournisseurs f where f.id=new.fournisseur_id and f.entreprise_id=new.entreprise_id and f.type_tiers='sous_traitant') then
    raise exception 'Le tiers sélectionné n’est pas un sous-traitant';
  end if;
  new.updated_at=now();
  return new;
end;$$;
drop trigger if exists verifier_affectation_sous_traitant on public.sous_traitants_chantiers;
create trigger verifier_affectation_sous_traitant before insert or update on public.sous_traitants_chantiers
for each row execute function public.verifier_affectation_sous_traitant();

alter table public.sous_traitants_chantiers enable row level security;
drop policy if exists sous_traitants_chantiers_membres on public.sous_traitants_chantiers;
create policy sous_traitants_chantiers_membres on public.sous_traitants_chantiers for all to authenticated
  using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
drop policy if exists role_lecture_select on public.sous_traitants_chantiers;
create policy role_lecture_select on public.sous_traitants_chantiers as restrictive for select to authenticated
  using(public.a_permission(entreprise_id,'acces_sous_traitants'));
drop policy if exists role_gestion_insert on public.sous_traitants_chantiers;
drop policy if exists role_gestion_update on public.sous_traitants_chantiers;
drop policy if exists role_gestion_delete on public.sous_traitants_chantiers;
create policy role_gestion_insert on public.sous_traitants_chantiers as restrictive for insert to authenticated
  with check(public.a_permission(entreprise_id,'gerer_sous_traitants'));
create policy role_gestion_update on public.sous_traitants_chantiers as restrictive for update to authenticated
  using(public.a_permission(entreprise_id,'gerer_sous_traitants')) with check(public.a_permission(entreprise_id,'gerer_sous_traitants'));
create policy role_gestion_delete on public.sous_traitants_chantiers as restrictive for delete to authenticated
  using(public.a_permission(entreprise_id,'gerer_sous_traitants'));

-- La fiche tiers est commune aux fournisseurs. Les gestionnaires sous-traitants
-- peuvent modifier uniquement ce registre, sans recevoir le droit d'achat complet.
drop policy if exists role_gestion_insert on public.fournisseurs;
drop policy if exists role_gestion_update on public.fournisseurs;
drop policy if exists role_gestion_delete on public.fournisseurs;
create policy role_gestion_insert on public.fournisseurs as restrictive for insert to authenticated
  with check(
    public.a_permission(entreprise_id,'gerer_achats')
    or (type_tiers='sous_traitant' and public.a_permission(entreprise_id,'gerer_sous_traitants'))
  );
create policy role_gestion_update on public.fournisseurs as restrictive for update to authenticated
  using(
    public.a_permission(entreprise_id,'gerer_achats')
    or (type_tiers='sous_traitant' and public.a_permission(entreprise_id,'gerer_sous_traitants'))
  )
  with check(
    public.a_permission(entreprise_id,'gerer_achats')
    or (type_tiers='sous_traitant' and public.a_permission(entreprise_id,'gerer_sous_traitants'))
  );
create policy role_gestion_delete on public.fournisseurs as restrictive for delete to authenticated
  using(
    public.a_permission(entreprise_id,'gerer_achats')
    or (type_tiers='sous_traitant' and public.a_permission(entreprise_id,'gerer_sous_traitants'))
  );

grant select,insert,update,delete on public.sous_traitants_chantiers to authenticated;
notify pgrst,'reload schema';
