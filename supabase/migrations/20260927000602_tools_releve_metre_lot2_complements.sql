-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — FOUNDATION V1 — COMPLÉMENTS
--
-- Complète 20260927000601_tools_releve_metre_foundation_v1 pour couvrir intégralement le
-- contrat du lot 2 (rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT2_FOUNDATION_V1.md) :
--
--   1. niveau **Chantier** explicite dans la hiérarchie :
--        Projet Relevé → Chantier → Bâtiment → Étage → Zone → Pièce
--      (un projet peut couvrir plusieurs chantiers ; un bâtiment appartient à un chantier du
--      MÊME relevé, garanti par clé étrangère composite). Rétro-compatible : un bâtiment créé
--      sans chantier est rattaché au chantier unique du relevé, créé au besoin à partir du
--      « site principal » porté par le projet (`tools_releves.chantier_*`) ;
--   2. **versions typées** : initial / corrige / projete / as_built, avec version de base ;
--   3. **catalogue d'offres** Tools (sans prix) qui prépare « Relevé Pro inclut Tools Pro » :
--      un détenteur de `releve-metre` reçoit les capabilities Tools Pro par le résolveur.
--      Aucun SKU, aucun prix, aucune écriture de facturation ; `releve_pro` ne peut pas être
--      marqué commercialement actif sans une nouvelle migration (lot 21).
--
-- Tools Free / Tools Pro sans add-on : résolution strictement inchangée (aucune offre ne se
-- déclenche sans `releve-metre`).

-- ── 1. Catalogue d'offres (relation Relevé Pro ⊃ Tools Pro) ───────────────────
-- Référentiel descriptif : quelles capabilities une offre ouvre et quelles offres elle
-- inclut. Les PRIX n'y figurent pas : prix de référence dans un seul endroit, le domaine
-- (`packages/releve-domain/src/entitlement.ts`, RELEVE_METRE_OFFER), jamais affichés.
create table public.tools_offres_catalogue (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  libelle text not null check (btrim(libelle) <> '' and char_length(libelle) <= 120),
  -- Capability dont la détention signale l'offre. NULL = palier de base (Tools Pro), qui
  -- n'est jamais déduit : il vient des lignes d'entitlement elles-mêmes.
  capability_cle text,
  capabilities text[] not null,
  offres_incluses text[] not null default '{}'::text[],
  commercialement_active boolean not null default false,
  statut text not null default 'reference' check (statut in ('reference', 'active', 'retiree')),
  updated_at timestamptz not null default now(),
  -- Garde-fou « aucune activation commerciale automatique » : lever ce CHECK est une
  -- décision écrite du lot 21, par migration relue.
  constraint tools_offres_releve_pro_non_commercial
    check (code <> 'releve_pro' or (not commercialement_active and statut = 'reference')),
  constraint tools_offres_pas_d_auto_inclusion check (not (code = any(offres_incluses)))
);

insert into public.tools_offres_catalogue (code, libelle, capability_cle, capabilities, offres_incluses, commercialement_active, statut) values
  ('tools_pro', 'Tools Pro', null, public.tools_capabilities_pro(), '{}', true, 'active'),
  ('releve_pro', 'Relevé & Métré Pro', 'releve-metre', public.tools_capabilities_addon(), array['tools_pro'], false, 'reference')
on conflict (code) do update set
  libelle = excluded.libelle, capability_cle = excluded.capability_cle, capabilities = excluded.capabilities,
  offres_incluses = excluded.offres_incluses, updated_at = now();

alter table public.tools_offres_catalogue enable row level security;
revoke all on public.tools_offres_catalogue from public, anon, authenticated;
grant select on public.tools_offres_catalogue to authenticated;
grant select, insert, update, delete on public.tools_offres_catalogue to service_role;
create policy tools_offres_catalogue_select on public.tools_offres_catalogue
  for select to authenticated using (true);

-- Capabilities d'une offre, offres incluses comprises (un niveau d'inclusion suffit : les
-- offres de base n'en incluent aucune).
create or replace function public.tools_capabilities_offre(p_code text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c order by c), '{}'::text[]) from (
    select unnest(o.capabilities) c from public.tools_offres_catalogue o where o.code = p_code
    union
    select unnest(i.capabilities) from public.tools_offres_catalogue o
      join public.tools_offres_catalogue i on i.code = any(o.offres_incluses)
    where o.code = p_code
  ) t;
$$;

-- Étend des capabilities résolues avec celles des offres qu'elles signalent. Sans capability
-- clé (Tools Free, Tools Pro), l'ensemble est renvoyé tel quel (trié, dédoublonné).
create or replace function public.tools_capabilities_etendues(p_capabilities text[])
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c order by c), '{}'::text[]) from (
    select unnest(coalesce(p_capabilities, '{}'::text[])) c
    union
    select unnest(public.tools_capabilities_offre(o.code)) from public.tools_offres_catalogue o
    where o.capability_cle is not null and o.capability_cle = any(coalesce(p_capabilities, '{}'::text[]))
  ) t;
$$;

revoke all on function public.tools_capabilities_offre(text) from public, anon;
revoke all on function public.tools_capabilities_etendues(text[]) from public, anon;
grant execute on function public.tools_capabilities_offre(text), public.tools_capabilities_etendues(text[]) to authenticated, service_role;

-- Résolveur : identique à 20260927000601, à UNE ligne près (extension par offre dans la
-- branche Pro). Free inchangé ; Pro sans `releve-metre` : même ensemble, trié.
create or replace function public.tools_resoudre_entitlements()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text;
  v_expire_le timestamptz;
  v_capabilities text[];
  v_sources jsonb;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;

  if public.plateforme_est_superuser() then
    return jsonb_build_object(
      'application', 'tools', 'tier', 'pro',
      'capabilities', to_jsonb(public.tools_capabilities_catalogue()),
      'source', 'plateforme',
      'sources', jsonb_build_array(jsonb_build_object(
        'source', 'plateforme', 'status', 'active', 'expires_at', null, 'renews_at', null
      )),
      'expires_at', null, 'validated_at', now(), 'cache_version', 1, 'grace_seconds', 604800
    );
  end if;

  select e.source, e.expire_le into v_source, v_expire_le
  from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now())
  order by e.priorite desc,
    case e.source when 'internal' then 5 when 'elsatia' then 4 when 'apple' then 3 when 'google' then 2 when 'web' then 1 else 0 end desc,
    e.created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('source', e.source, 'status', e.status,
    'expires_at', e.expire_le, 'renews_at', e.renews_at) order by e.priorite desc), '[]'::jsonb)
  into v_sources from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());

  if v_source is null then
    return jsonb_build_object('application','tools','tier','free','capabilities',jsonb_build_array(
      'basic-calculation','basic-tracing','site-instructions'),'source','free-default','sources',v_sources,
      'expires_at',null,'validated_at',now(),'cache_version',1,'grace_seconds',604800);
  end if;

  select coalesce(array_agg(distinct capability order by capability), '{}'::text[]) into v_capabilities
  from public.entitlements_utilisateurs_elsatia e, unnest(e.capabilities) capability
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active','grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());
  -- Relevé Pro inclut Tools Pro (catalogue d'offres) : seule différence avec la version précédente.
  v_capabilities := public.tools_capabilities_etendues(v_capabilities);
  return jsonb_build_object('application','tools','tier','pro','capabilities',to_jsonb(v_capabilities),
    'source',v_source,'sources',v_sources,'expires_at',v_expire_le,'validated_at',now(),
    'cache_version',1,'grace_seconds',604800);
end;
$$;
revoke all on function public.tools_resoudre_entitlements() from public, anon, service_role;
grant execute on function public.tools_resoudre_entitlements() to authenticated;

-- ── 2. Niveau Chantier ───────────────────────────────────────────────────────
create table public.tools_releves_chantiers (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 180),
  adresse text check (adresse is null or char_length(adresse) <= 400),
  code_postal text check (code_postal is null or code_postal ~ '^[0-9A-Za-z -]{2,12}$'),
  ville text check (ville is null or char_length(ville) <= 120),
  -- Lien faible vers le chantier Gestion Pro (GP autoritaire), même entreprise exigée.
  chantier_gp_id uuid references public.chantiers(id) on delete set null,
  ordre integer not null default 0 check (ordre between 0 and 10000),
  notes text check (notes is null or char_length(notes) <= 4000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  unique (id, releve_id)
);
create index tools_releves_chantiers_releve_idx on public.tools_releves_chantiers (releve_id, ordre);
create index tools_releves_chantiers_gp_idx on public.tools_releves_chantiers (chantier_gp_id) where chantier_gp_id is not null;

-- Lien GP d'un chantier de relevé : même règle que pour le projet (même entreprise, toujours ;
-- permission GP `acces_chantiers` pour l'utilisateur qui pose un NOUVEAU lien). Recopier le
-- lien déjà validé sur le projet ne redemande pas la permission.
create or replace function public.tools_releve_chantier_liens_gp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.chantier_gp_id is not null and (tg_op = 'INSERT' or new.chantier_gp_id is distinct from old.chantier_gp_id) then
    if not exists (select 1 from public.chantiers c where c.id = new.chantier_gp_id and c.entreprise_id = new.entreprise_id) then
      raise exception 'Chantier Gestion Pro introuvable dans cette entreprise' using errcode = '42501';
    end if;
    if auth.uid() is not null
       and not exists (select 1 from public.tools_releves r where r.id = new.releve_id and r.chantier_gp_id = new.chantier_gp_id)
       and not public.a_permission(new.entreprise_id, 'acces_chantiers') then
      raise exception 'Lien chantier : permission Gestion Pro « acces_chantiers » requise' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Déclencheurs communs aux tables filles (métadonnées serveur, audit) + lien GP.
create trigger tools_releves_chantiers_avant_ecriture before insert or update on public.tools_releves_chantiers
  for each row execute function public.tools_releve_enfant_avant_ecriture();
create trigger tools_releves_chantiers_liens_gp before insert or update on public.tools_releves_chantiers
  for each row execute function public.tools_releve_chantier_liens_gp();
create trigger tools_releves_chantiers_journal after insert or update on public.tools_releves_chantiers
  for each row execute function public.tools_releve_journaliser();
create trigger tools_releves_chantiers_cascade after update of deleted_at on public.tools_releves_chantiers
  for each row execute function public.tools_releve_cascade_suppression();

-- Rattachement des bâtiments existants : un chantier par relevé, depuis le site principal.
alter table public.tools_releves_batiments add column chantier_id uuid;

insert into public.tools_releves_chantiers (entreprise_id, releve_id, nom, adresse, code_postal, ville, chantier_gp_id, created_by, updated_by)
select r.entreprise_id, r.id, r.chantier_nom, r.chantier_adresse, r.chantier_code_postal, r.chantier_ville, r.chantier_gp_id,
       r.created_by, r.created_by
from public.tools_releves r
where exists (select 1 from public.tools_releves_batiments b where b.releve_id = r.id);

update public.tools_releves_batiments b set chantier_id = c.id
from public.tools_releves_chantiers c where c.releve_id = b.releve_id and b.chantier_id is null;

alter table public.tools_releves_batiments
  alter column chantier_id set not null,
  add constraint tools_releves_batiments_chantier_fkey
    foreign key (chantier_id, releve_id) references public.tools_releves_chantiers(id, releve_id) on delete cascade;
create index tools_releves_batiments_chantier_idx on public.tools_releves_batiments (chantier_id, ordre);

-- Chantier par défaut : un bâtiment créé sans chantier rejoint le chantier actif unique du
-- relevé ; s'il n'y en a aucun, il est créé depuis le site principal du projet. Plusieurs
-- chantiers actifs : le client doit préciser lequel. S'exécute après
-- `tools_releves_batiments_avant_ecriture` (ordre alphabétique) qui a déjà vérifié le relevé.
create or replace function public.tools_releve_batiment_chantier_defaut()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre integer; v_chantier uuid;
begin
  if new.chantier_id is not null then return new; end if;
  -- Aucun effet de bord pour qui ne peut pas écrire : la RLS refuserait de toute façon.
  if auth.uid() is not null and not public.tools_releve_peut(new.releve_id, 'edit') then
    raise exception 'Modification du relevé non autorisée' using errcode = '42501';
  end if;
  select count(*)::int, min(c.id::text)::uuid into v_nombre, v_chantier
  from public.tools_releves_chantiers c where c.releve_id = new.releve_id and c.deleted_at is null;
  if v_nombre > 1 then
    raise exception 'Plusieurs chantiers dans ce relevé : précisez le chantier du bâtiment' using errcode = '23502';
  end if;
  if v_nombre = 0 then
    insert into public.tools_releves_chantiers (releve_id, nom, adresse, code_postal, ville, chantier_gp_id)
    select r.id, r.chantier_nom, r.chantier_adresse, r.chantier_code_postal, r.chantier_ville, r.chantier_gp_id
    from public.tools_releves r where r.id = new.releve_id
    returning id into v_chantier;
  end if;
  new.chantier_id := v_chantier;
  return new;
end;
$$;
create trigger tools_releves_batiments_chantier_defaut before insert on public.tools_releves_batiments
  for each row execute function public.tools_releve_batiment_chantier_defaut();

-- Cascade : chantier → bâtiments (le reste suit par les déclencheurs existants).
create or replace function public.tools_releve_cascade_suppression()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_supprime boolean := new.deleted_at is not null;
begin
  if new.deleted_at is not distinct from old.deleted_at then return null; end if;
  if tg_table_name = 'tools_releves_chantiers' then
    update public.tools_releves_batiments set deleted_at = new.deleted_at
    where chantier_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  elsif tg_table_name = 'tools_releves_batiments' then
    update public.tools_releves_etages set deleted_at = new.deleted_at
    where batiment_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  elsif tg_table_name = 'tools_releves_etages' then
    update public.tools_releves_zones set deleted_at = new.deleted_at
    where etage_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
    update public.tools_releves_pieces set deleted_at = new.deleted_at
    where etage_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
    update public.tools_releves_elements set deleted_at = new.deleted_at
    where etage_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  elsif tg_table_name = 'tools_releves_pieces' then
    update public.tools_releves_elements set deleted_at = new.deleted_at
    where piece_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  elsif tg_table_name = 'tools_releves_elements' then
    update public.tools_releves_elements set deleted_at = new.deleted_at
    where parent_element_id = new.id and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  end if;
  return null;
end;
$$;

-- Journal : nouvelle entité `chantier`.
alter table public.tools_releves_journal drop constraint if exists tools_releves_journal_entite_check;
alter table public.tools_releves_journal add constraint tools_releves_journal_entite_check
  check (entite in ('releve','chantier','batiment','etage','zone','piece','element','media','version'));

create or replace function public.tools_releve_journaliser()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_action text; v_champs text[];
begin
  if tg_op = 'INSERT' then
    v_action := 'creation'; v_champs := '{}'::text[];
  else
    select coalesce(array_agg(n.key order by n.key), '{}'::text[]) into v_champs
    from jsonb_each(v_new) n
    where n.key not in ('revision','updated_at','updated_by','deleted_by') and n.value is distinct from v_old -> n.key;
    v_action := case
      when v_new->'deleted_at' is distinct from v_old->'deleted_at' then
        case when v_new->>'deleted_at' is null then 'restauration' else 'suppression' end
      when v_new->'visibilite' is distinct from v_old->'visibilite' then 'partage'
      when v_new->'proprietaire_id' is distinct from v_old->'proprietaire_id' then 'transfert'
      else 'modification' end;
  end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id)
  values (
    (v_new->>'entreprise_id')::uuid,
    coalesce(v_new->>'releve_id', v_new->>'id')::uuid,
    case tg_table_name
      when 'tools_releves' then 'releve' when 'tools_releves_chantiers' then 'chantier'
      when 'tools_releves_batiments' then 'batiment'
      when 'tools_releves_etages' then 'etage' when 'tools_releves_zones' then 'zone'
      when 'tools_releves_pieces' then 'piece' when 'tools_releves_elements' then 'element'
      when 'tools_releves_medias' then 'media' end,
    (v_new->>'id')::uuid, v_action, v_champs, auth.uid()
  );
  return null;
end;
$$;

alter table public.tools_releves_chantiers enable row level security;
create policy tools_releves_chantiers_select on public.tools_releves_chantiers
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
create policy tools_releves_chantiers_insert on public.tools_releves_chantiers
  for insert to authenticated with check (public.tools_releve_peut(releve_id, 'edit'));
create policy tools_releves_chantiers_update on public.tools_releves_chantiers
  for update to authenticated
  using (public.tools_releve_peut(releve_id, 'edit'))
  with check (public.tools_releve_peut(releve_id, 'edit'));

revoke all on public.tools_releves_chantiers from public, anon, authenticated;
grant select, insert, update on public.tools_releves_chantiers to authenticated;
grant select, insert, update, delete on public.tools_releves_chantiers to service_role;

-- ── 3. Versions typées ───────────────────────────────────────────────────────
-- initial   : état relevé de l'existant (au plus une par relevé, toujours la première) ;
-- corrige   : correction d'une version précédente (erreur de cote, oubli) ;
-- projete   : état projeté (plan rénové, variantes `etat = 'projet'`, lot 14) ;
-- as_built  : état réellement construit / réceptionné (DOE).
alter table public.tools_releves_versions
  add column type_version text not null default 'initial'
    check (type_version in ('initial','corrige','projete','as_built')),
  add column version_base_id uuid;
update public.tools_releves_versions set type_version = 'corrige' where numero > 1;
alter table public.tools_releves_versions
  alter column type_version drop default,
  add constraint tools_releves_versions_base_fkey
    foreign key (version_base_id, releve_id) references public.tools_releves_versions(id, releve_id) on delete restrict,
  add constraint tools_releves_versions_base_coherente
    check (type_version <> 'initial' or version_base_id is null);
create unique index tools_releves_versions_initial_unique
  on public.tools_releves_versions (releve_id) where type_version = 'initial';

drop function if exists public.tools_releve_creer_version(uuid, text);
create or replace function public.tools_releve_creer_version(
  p_releve_id uuid, p_libelle text default null, p_type_version text default null, p_version_base_id uuid default null
)
returns public.tools_releves_versions
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_releve public.tools_releves; v_contenu jsonb; v_numero integer; v_type text; v_base uuid;
  v_version public.tools_releves_versions;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.tools_releve_peut(p_releve_id, 'edit') then
    raise exception 'Création de version non autorisée' using errcode = '42501';
  end if;
  select * into v_releve from public.tools_releves where id = p_releve_id for update;
  select coalesce(max(numero), 0) + 1 into v_numero from public.tools_releves_versions where releve_id = p_releve_id;

  v_type := coalesce(p_type_version, case when v_numero = 1 then 'initial' else 'corrige' end);
  if v_type not in ('initial','corrige','projete','as_built') then
    raise exception 'Type de version inconnu : %', v_type using errcode = '22023';
  end if;
  if v_type = 'initial' then
    if v_numero > 1 then
      raise exception 'La version initiale est unique et toujours la première' using errcode = '23505';
    end if;
    if p_version_base_id is not null then
      raise exception 'Une version initiale n''a pas de version de base' using errcode = '22023';
    end if;
  else
    if v_numero = 1 then
      raise exception 'Créez d''abord la version initiale du relevé' using errcode = '22023';
    end if;
    v_base := coalesce(p_version_base_id,
      (select v.id from public.tools_releves_versions v where v.releve_id = p_releve_id order by v.numero desc limit 1));
    if not exists (select 1 from public.tools_releves_versions v where v.id = v_base and v.releve_id = p_releve_id) then
      raise exception 'Version de base introuvable dans ce relevé' using errcode = '42501';
    end if;
  end if;

  v_contenu := jsonb_build_object(
    'schema_version', v_releve.schema_version,
    'type_version', v_type,
    'version_base_id', v_base,
    'releve', to_jsonb(v_releve) - array['created_by','updated_by','deleted_by'],
    'chantiers', coalesce((select jsonb_agg(to_jsonb(c) order by c.ordre, c.id) from public.tools_releves_chantiers c where c.releve_id = p_releve_id and c.deleted_at is null), '[]'::jsonb),
    'batiments', coalesce((select jsonb_agg(to_jsonb(b) order by b.ordre, b.id) from public.tools_releves_batiments b where b.releve_id = p_releve_id and b.deleted_at is null), '[]'::jsonb),
    'etages', coalesce((select jsonb_agg(to_jsonb(e) order by e.niveau, e.ordre, e.id) from public.tools_releves_etages e where e.releve_id = p_releve_id and e.deleted_at is null), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.ordre, z.id) from public.tools_releves_zones z where z.releve_id = p_releve_id and z.deleted_at is null), '[]'::jsonb),
    'pieces', coalesce((select jsonb_agg(to_jsonb(p) order by p.ordre, p.id) from public.tools_releves_pieces p where p.releve_id = p_releve_id and p.deleted_at is null), '[]'::jsonb),
    'elements', coalesce((select jsonb_agg(to_jsonb(x) order by x.type, x.id) from public.tools_releves_elements x where x.releve_id = p_releve_id and x.deleted_at is null), '[]'::jsonb),
    'medias', coalesce((select jsonb_agg(to_jsonb(m) order by m.categorie, m.id) from public.tools_releves_medias m where m.releve_id = p_releve_id and m.deleted_at is null), '[]'::jsonb)
  );
  insert into public.tools_releves_versions (entreprise_id, releve_id, numero, libelle, type_version, version_base_id,
                                             revision_source, empreinte, contenu, created_by)
  values (v_releve.entreprise_id, p_releve_id, v_numero, nullif(btrim(p_libelle), ''), v_type, v_base, v_releve.revision,
          encode(extensions.digest(convert_to(v_contenu::text, 'UTF8'), 'sha256'), 'hex'), v_contenu, auth.uid())
  returning * into v_version;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id)
  values (v_releve.entreprise_id, p_releve_id, 'version', v_version.id, 'version', array['numero','type_version'], auth.uid());
  return v_version;
end;
$$;

-- ── 4. Droits des fonctions ──────────────────────────────────────────────────
revoke all on function public.tools_releve_chantier_liens_gp() from public, anon, authenticated;
revoke all on function public.tools_releve_batiment_chantier_defaut() from public, anon, authenticated;
revoke all on function public.tools_releve_creer_version(uuid, text, text, uuid) from public, anon;
grant execute on function public.tools_releve_creer_version(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
