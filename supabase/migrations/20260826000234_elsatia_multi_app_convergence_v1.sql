-- ELSATIA multi-app convergence V1 : socle canonique commun Gestion Pro + Colors.
-- Reprend le schéma le plus mature déjà construit côté Colors (btp-platform,
-- d44e0bf/e67c817/fbe26cc), porté à la main (pas de fusion Git entre les deux dépôts),
-- adapté à l'état réel d'elsatia-main : réutilise est_plateforme_admin() et
-- est_membre_actif() déjà existants au lieu de dupliquer une seconde notion
-- d'admin global / d'appartenance active. Aucun droit n'est accordé automatiquement
-- par cette migration.

create table public.applications_elsatia (
  code text primary key check(code ~ '^[a-z][a-z0-9_]{1,49}$'),
  nom text not null check(btrim(nom)<>''),
  description text,
  actif boolean not null default true,
  ordre integer not null default 0,
  url_locale text,
  url_preview text,
  url_production text,
  icone text,
  statut_produit text not null default 'disponible'
    check(statut_produit in ('disponible','bientot','interne')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications_elsatia
  add constraint applications_elsatia_url_locale_http
    check(url_locale is null or url_locale ~ '^https?://[^[:space:]]+$'),
  add constraint applications_elsatia_url_preview_https
    check(url_preview is null or url_preview ~ '^https://[^[:space:]]+$'),
  add constraint applications_elsatia_url_production_https
    check(url_production is null or url_production ~ '^https://[^[:space:]]+$');

insert into public.applications_elsatia(code,nom,description,ordre,url_locale,url_production,icone) values
  ('gestion_pro','ELSATIA Gestion Pro','Gestion d''entreprise BTP',10,'http://localhost:3000','https://app.elsatia.fr','gestion_pro'),
  ('colors','ELSATIA Colors','Stocks, produits, teintes et nuanciers de peinture',20,'http://localhost:3010','https://colors.elsatia.fr','colors')
on conflict(code) do update set nom=excluded.nom,description=excluded.description,ordre=excluded.ordre;

create table public.roles_applications_elsatia (
  application_code text not null references public.applications_elsatia(code) on delete restrict,
  code text not null check(code ~ '^[a-z][a-z0-9_]{1,79}$'),
  nom text not null check(btrim(nom)<>''),
  description text,
  actif boolean not null default true,
  ordre integer not null default 0,
  primary key(application_code,code)
);

insert into public.roles_applications_elsatia(application_code,code,nom,ordre) values
  ('gestion_pro','gestion_pro_admin','Administrateur ELSATIA Gestion Pro',10),
  ('gestion_pro','gestion_pro_utilisateur','Utilisateur ELSATIA Gestion Pro',20),
  ('colors','colors_admin_organisation','Administrateur ELSATIA Colors',10),
  ('colors','colors_gestionnaire_stock','Gestionnaire de stock ELSATIA Colors',20),
  ('colors','colors_utilisateur_depot','Utilisateur de dépôt ELSATIA Colors',30),
  ('colors','colors_consultation','Consultation ELSATIA Colors',40)
on conflict(application_code,code) do update set nom=excluded.nom,ordre=excluded.ordre;

-- Cette table matérialise le droit d'usage de l'organisation. La source commerciale
-- (abonnement, essai, offre groupée ou attribution manuelle) reste configurable et ne
-- participe pas directement à la décision d'autorisation.
create table public.acces_applications_entreprises (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  application_code text not null references public.applications_elsatia(code) on delete restrict,
  autorise boolean not null default false,
  source text,
  reference_externe text,
  valide_du timestamptz,
  valide_jusqu_au timestamptz,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entreprise_id,application_code),
  check(valide_du is null or valide_jusqu_au is null or valide_jusqu_au>valide_du)
);

-- Une habilitation est propre à une application. Elle ne dérive ni d'un poste, ni d'une
-- permission métier Gestion Pro, ni d'un rôle détenu dans une autre application.
create table public.habilitations_applications_utilisateurs (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null,
  application_code text not null,
  role_code text not null,
  autorise boolean not null default true,
  valide_du timestamptz,
  valide_jusqu_au timestamptz,
  attribue_par uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entreprise_id,utilisateur_id,application_code),
  foreign key(utilisateur_id,entreprise_id)
    references public.utilisateurs_entreprises(utilisateur_id,entreprise_id) on delete cascade,
  foreign key(application_code,role_code)
    references public.roles_applications_elsatia(application_code,code) on delete restrict,
  check(valide_du is null or valide_jusqu_au is null or valide_jusqu_au>valide_du)
);

create index acces_applications_entreprises_decision_idx
  on public.acces_applications_entreprises(entreprise_id,application_code,autorise);
create index habilitations_applications_utilisateurs_decision_idx
  on public.habilitations_applications_utilisateurs(utilisateur_id,entreprise_id,application_code,autorise);

-- Audit append-only des changements de droits (activation/désactivation/habilitation).
create table public.historique_acces_applications (
  id uuid primary key default gen_random_uuid(),
  cible_type text not null check (cible_type in ('entreprise', 'utilisateur')),
  cible_id uuid not null,
  application_code text not null,
  action text not null,
  auteur_email text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at_multi_applications()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;

create trigger applications_elsatia_updated before update on public.applications_elsatia
for each row execute function public.set_updated_at_multi_applications();
create trigger acces_applications_entreprises_updated before update on public.acces_applications_entreprises
for each row execute function public.set_updated_at_multi_applications();
create trigger habilitations_applications_utilisateurs_updated before update on public.habilitations_applications_utilisateurs
for each row execute function public.set_updated_at_multi_applications();
revoke all on function public.set_updated_at_multi_applications() from public,anon,authenticated;

-- Décision centrale : admin plateforme global (est_plateforme_admin, déjà utilisé dans
-- ~40 endroits de Gestion Pro) a un bypass total sur le catalogue actif — mais cela ne
-- donne accès qu'à la notion applicative « application autorisée », jamais un accès SQL
-- cross-tenant aux données métier (clients/chantiers/etc restent gouvernées par leurs
-- propres RLS existantes, inchangées par cette migration). Pour un utilisateur normal :
-- appartenance active (est_membre_actif, déjà existant) ET organisation autorisée dans
-- sa fenêtre de validité ET utilisateur habilité dans sa fenêtre de validité, avec un
-- rôle actif propre à l'application.
create or replace function public.a_acces_application(
  p_entreprise_id uuid,
  p_application_code text
) returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.uid() is not null
    and (
      (
        public.est_plateforme_admin()
        and exists(select 1 from public.applications_elsatia a where a.code=p_application_code and a.actif)
      )
      or (
        p_entreprise_id is not null
        and public.est_membre_actif(p_entreprise_id)
        and exists(
          select 1 from public.acces_applications_entreprises ae
          join public.applications_elsatia a on a.code=ae.application_code and a.actif
          where ae.entreprise_id=p_entreprise_id
            and ae.application_code=p_application_code
            and ae.autorise
            and (ae.valide_du is null or ae.valide_du<=now())
            and (ae.valide_jusqu_au is null or ae.valide_jusqu_au>now())
        )
        and exists(
          select 1 from public.habilitations_applications_utilisateurs hu
          join public.roles_applications_elsatia r
            on r.application_code=hu.application_code and r.code=hu.role_code and r.actif
          where hu.entreprise_id=p_entreprise_id
            and hu.utilisateur_id=auth.uid()
            and hu.application_code=p_application_code
            and hu.autorise
            and (hu.valide_du is null or hu.valide_du<=now())
            and (hu.valide_jusqu_au is null or hu.valide_jusqu_au>now())
        )
      )
    );
$$;

create or replace function public.applications_autorisees(
  p_entreprise_id uuid
) returns table(
  application_code text, nom text, role_code text,
  url_locale text, url_preview text, url_production text, icone text,
  est_admin_plateforme boolean
)
language sql
security definer
stable
set search_path=public
as $$
  select a.code,a.nom,'administrateur_plateforme_global'::text,
         a.url_locale,a.url_preview,a.url_production,a.icone,true
  from public.applications_elsatia a
  where a.actif and public.est_plateforme_admin()

  union all

  select a.code,a.nom,hu.role_code,
         a.url_locale,a.url_preview,a.url_production,a.icone,false
  from public.applications_elsatia a
  join public.habilitations_applications_utilisateurs hu
    on hu.application_code=a.code
   and hu.entreprise_id=p_entreprise_id
   and hu.utilisateur_id=auth.uid()
  where not public.est_plateforme_admin()
    and public.a_acces_application(p_entreprise_id,a.code)
  order by 1;
$$;

-- Contexte de session consommé par les applications sœurs (ex. Colors) pour résoudre
-- l'utilisateur + son entreprise active, avec repli « Administration ELSATIA » pour un
-- admin plateforme sans appartenance active.
create or replace function public.contexte_application_courant()
returns table(
  utilisateur_id uuid, prenom text, entreprise_id uuid, entreprise_nom text,
  est_admin_plateforme boolean
)
language sql
security definer
stable
set search_path=public
as $$
  select u.id,u.prenom,e.id,e.nom,public.est_plateforme_admin()
  from public.utilisateurs u
  join public.utilisateurs_entreprises ue
    on ue.utilisateur_id=u.id
   and ue.entreprise_id=u.entreprise_active_id
   and ue.statut='actif'
  join public.entreprises e on e.id=ue.entreprise_id
  where u.id=auth.uid()

  union all

  select au.id,u.prenom,null::uuid,'Administration ELSATIA'::text,true
  from auth.users au
  left join public.utilisateurs u on u.id=au.id
  where au.id=auth.uid()
    and public.est_plateforme_admin()
    and not exists(
      select 1
      from public.utilisateurs ux
      join public.utilisateurs_entreprises ue
        on ue.utilisateur_id=ux.id
       and ue.entreprise_id=ux.entreprise_active_id
       and ue.statut='actif'
      where ux.id=auth.uid()
    );
$$;

alter table public.applications_elsatia enable row level security;
alter table public.roles_applications_elsatia enable row level security;
alter table public.acces_applications_entreprises enable row level security;
alter table public.habilitations_applications_utilisateurs enable row level security;
alter table public.historique_acces_applications enable row level security;

create policy applications_elsatia_lecture on public.applications_elsatia
  for select to authenticated using(actif or public.est_plateforme_admin());
create policy roles_applications_elsatia_lecture on public.roles_applications_elsatia
  for select to authenticated using(actif or public.est_plateforme_admin());
create policy acces_applications_entreprises_lecture on public.acces_applications_entreprises
  for select to authenticated using(public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());
-- Restreint à sa propre ligne ou à un gestionnaire d'accès de l'entreprise (peut_gerer_acces,
-- déjà existant) : un membre normal ne peut pas parcourir les habilitations d'un tiers.
create policy habilitations_applications_utilisateurs_lecture on public.habilitations_applications_utilisateurs
  for select to authenticated using(
    utilisateur_id=auth.uid()
    or public.peut_gerer_acces(entreprise_id)
    or public.est_plateforme_admin()
  );
create policy historique_acces_applications_lecture on public.historique_acces_applications
  for select to authenticated using(public.est_plateforme_admin());

-- Les mutations restent réservées aux RPC ci-dessous : aucune policy INSERT/UPDATE/DELETE
-- pour authenticated, aucune fonction de mutation publique en dehors de celles-ci.
grant select on public.applications_elsatia,public.roles_applications_elsatia,
  public.acces_applications_entreprises,public.habilitations_applications_utilisateurs,
  public.historique_acces_applications to authenticated;
revoke all on function public.a_acces_application(uuid,text) from public,anon;
revoke all on function public.applications_autorisees(uuid) from public,anon;
revoke all on function public.contexte_application_courant() from public,anon;
grant execute on function public.a_acces_application(uuid,text) to authenticated;
grant execute on function public.applications_autorisees(uuid) to authenticated;
grant execute on function public.contexte_application_courant() to authenticated;

-- RPC d'administration (absentes du socle Colors d'origine — "le portail d'administration
-- des applications reste à construire" selon sa propre documentation). Réservées à l'admin
-- plateforme global, journalisées dans historique_acces_applications.
create or replace function public.plateforme_activer_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null,
  p_source text default null,
  p_reference_externe text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source,reference_externe,valide_du,valide_jusqu_au)
  values (p_entreprise_id,p_application_code,true,p_source,p_reference_externe,p_valide_du,p_valide_jusqu_au)
  on conflict (entreprise_id,application_code) do update
    set autorise=true, source=excluded.source, reference_externe=excluded.reference_externe,
        valide_du=excluded.valide_du, valide_jusqu_au=excluded.valide_jusqu_au;
  insert into public.historique_acces_applications(cible_type,cible_id,application_code,action,auteur_email)
  values ('entreprise',p_entreprise_id,p_application_code,'activation',auth.email());
end;
$$;

create or replace function public.plateforme_desactiver_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.acces_applications_entreprises set autorise=false
  where entreprise_id=p_entreprise_id and application_code=p_application_code;
  insert into public.historique_acces_applications(cible_type,cible_id,application_code,action,auteur_email)
  values ('entreprise',p_entreprise_id,p_application_code,'desactivation',auth.email());
end;
$$;

create or replace function public.plateforme_habiliter_utilisateur_application(
  p_utilisateur_id uuid,
  p_entreprise_id uuid,
  p_application_code text,
  p_role_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,autorise,valide_du,valide_jusqu_au,attribue_par)
  values (p_entreprise_id,p_utilisateur_id,p_application_code,p_role_code,true,p_valide_du,p_valide_jusqu_au,auth.uid())
  on conflict (entreprise_id,utilisateur_id,application_code) do update
    set role_code=excluded.role_code, autorise=true, valide_du=excluded.valide_du,
        valide_jusqu_au=excluded.valide_jusqu_au, attribue_par=excluded.attribue_par;
  insert into public.historique_acces_applications(cible_type,cible_id,application_code,action,auteur_email)
  values ('utilisateur',p_utilisateur_id,p_application_code,'habilitation:'||p_role_code,auth.email());
end;
$$;

create or replace function public.plateforme_retirer_habilitation_application(
  p_utilisateur_id uuid,
  p_entreprise_id uuid,
  p_application_code text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.habilitations_applications_utilisateurs set autorise=false
  where entreprise_id=p_entreprise_id and utilisateur_id=p_utilisateur_id and application_code=p_application_code;
  insert into public.historique_acces_applications(cible_type,cible_id,application_code,action,auteur_email)
  values ('utilisateur',p_utilisateur_id,p_application_code,'retrait_habilitation',auth.email());
end;
$$;

revoke all on function public.plateforme_activer_application_entreprise(uuid,text,timestamptz,timestamptz,text,text) from public,anon;
revoke all on function public.plateforme_desactiver_application_entreprise(uuid,text) from public,anon;
revoke all on function public.plateforme_habiliter_utilisateur_application(uuid,uuid,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.plateforme_retirer_habilitation_application(uuid,uuid,text) from public,anon;
grant execute on function public.plateforme_activer_application_entreprise(uuid,text,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.plateforme_desactiver_application_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_habiliter_utilisateur_application(uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.plateforme_retirer_habilitation_application(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
