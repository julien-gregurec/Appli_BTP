-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — ARCHITECTURE FOUNDATION V1
--
-- Pose les fondations serveur du sous-produit premium Relevé & Métré, qui reste DANS
-- ELSATIA Tools (même application `tools`, même compte, même résolveur d'entitlements).
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md
-- Domaine TypeScript miroir : packages/releve-domain (matrice de permissions, énumérations,
-- bornes et contrat de stockage identiques — un test Vitest vérifie la parité).
--
-- Ce que cette migration fait :
--   1. rôles Tools dédiés (admin / métreur / consultation) ;
--   2. capability add-on `releve-metre` : catalogue SQL unique, attribution plateforme
--      autorisée, garde-fou « aucune activation commerciale » sur la table d'entitlements,
--      propriétaire global inclus pour les tests internes ;
--   3. prédicats d'autorisation view/create/edit/delete/share/export/sync-gp ;
--   4. hiérarchie relationnelle chantier → bâtiment → étage → zone → pièce, avec clés
--      étrangères COMPOSITES qui rendent structurellement impossible un rattachement
--      inter-relevé ou inter-entreprise ;
--   5. éléments métier (mur, ouverture, équipement, mesure, photo, annotation, matériau,
--      quantité) dans une table générique typée ;
--   6. médias, versions immuables, journal d'audit append-only, journal d'envoi GP ;
--   7. bucket Storage privé `tools-releves` et ses policies ;
--   8. RLS tenant-safe et droits explicites.
--
-- Ce qu'elle ne fait PAS : aucun SKU (le CHECK `tools_monetization_subscriptions.product_sku`
-- est inchangé), aucun prix, aucun produit Stripe/Store, aucune écriture dans les tables
-- Gestion Pro, aucune capture AR/LiDAR. Tools Free / Tools Pro / entitlements personnels
-- et accès d'organisation existants sont inchangés.

-- ── 1. Rôles applicatifs Tools ───────────────────────────────────────────────
-- Une habilitation Tools reste unique par (entreprise, utilisateur) : ces rôles ouvrent
-- l'accès applicatif Tools comme `tools_pro`, et précisent en plus le profil Relevé.
-- `tools_pro` (R8) est traité comme un métreur par `tools_releve_profil()`.
insert into public.roles_applications_elsatia (application_code, code, nom, description, ordre) values
  ('tools', 'tools_releve_admin', 'Administrateur Relevé & Métré',
   'Tous les relevés de l''entreprise : modification, partage, suppression, transmission Gestion Pro', 20),
  ('tools', 'tools_releve_metreur', 'Métreur Relevé & Métré',
   'Crée et modifie ses relevés et les relevés partagés de l''entreprise', 30),
  ('tools', 'tools_releve_consultation', 'Consultation Relevé & Métré',
   'Lecture et export des relevés partagés', 40)
on conflict (application_code, code) do update
  set nom = excluded.nom, description = excluded.description, ordre = excluded.ordre;

-- ── 2. Entitlement premium `releve-metre` ────────────────────────────────────
-- Catalogue unique des capabilities Tools. Les 18 capabilities Pro étaient recopiées à
-- quatre endroits (audit lot 1 §7.1) ; les nouvelles fonctions n'utilisent plus que celles-ci.
create or replace function public.tools_capabilities_pro()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'basic-calculation','basic-tracing','site-instructions','advanced-layout','dimensioned-plan',
    'export-pdf','export-svg','saved-projects','advanced-tracing','promotion-free',
    'advanced-geometry','construction-points','design-shapes','derived-quantities',
    'print-plan','native-share','project-duplicate','project-archive'
  ]::text[];
$$;

-- Capabilities vendues séparément du palier Pro : jamais incluses par défaut dans `pro`.
create or replace function public.tools_capabilities_addon()
returns text[] language sql immutable set search_path = public as $$
  select array['releve-metre']::text[];
$$;

create or replace function public.tools_capabilities_catalogue()
returns text[] language sql immutable set search_path = public as $$
  select public.tools_capabilities_pro() || public.tools_capabilities_addon();
$$;

revoke all on function public.tools_capabilities_pro() from public, anon;
revoke all on function public.tools_capabilities_addon() from public, anon;
revoke all on function public.tools_capabilities_catalogue() from public, anon;
grant execute on function public.tools_capabilities_pro(), public.tools_capabilities_addon(),
  public.tools_capabilities_catalogue() to authenticated;

-- Garde-fou « aucune activation commerciale automatique » : tant que le module n'est pas
-- commercialisé, `releve-metre` ne peut être porté que par une attribution interne
-- (`internal`) ou ELSATIA (`elsatia`). Une ligne issue d'un achat web / Apple / Google qui
-- la contiendrait est rejetée, quel que soit le chemin d'écriture (RPC, webhook, SQL).
-- La levée de ce garde-fou fait partie du lot 21 (commercialisation), sur décision écrite.
create or replace function public.tools_garde_releve_metre_non_commercial()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.application_code = 'tools'
     and 'releve-metre' = any(coalesce(new.capabilities, '{}'::text[]))
     and new.source not in ('internal', 'elsatia') then
    raise exception 'Relevé & Métré n''est pas commercialisé : attribution interne uniquement'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.tools_garde_releve_metre_non_commercial() from public, anon, authenticated;

drop trigger if exists tools_releve_metre_non_commercial on public.entitlements_utilisateurs_elsatia;
create trigger tools_releve_metre_non_commercial
  before insert or update of capabilities, source on public.entitlements_utilisateurs_elsatia
  for each row execute function public.tools_garde_releve_metre_non_commercial();

-- Attribution plateforme (rôle total/facturation + AAL2 via le wrapper public inchangé) :
-- seule modification, la liste blanche lit désormais le catalogue, qui inclut `releve-metre`.
create or replace function public.tools_attribuer_entitlement_utilisateur_interne(p_utilisateur_id uuid, p_application_code text, p_niveau text, p_capabilities text[], p_source text, p_priorite integer DEFAULT 0, p_valide_du timestamp with time zone DEFAULT now(), p_expire_le timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reference_externe text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_action text;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  if not exists (select 1 from auth.users where id = p_utilisateur_id) then
    raise exception 'Utilisateur ELSATIA introuvable';
  end if;
  if p_application_code <> 'tools' or p_niveau not in ('free', 'pro')
     or p_source not in ('web', 'apple', 'google', 'elsatia', 'internal') then
    raise exception 'Entitlement invalide';
  end if;
  if p_priorite not between 0 and 1000
     or p_expire_le is not null and p_expire_le <= coalesce(p_valide_du, now())
     or exists (
       select 1 from unnest(coalesce(p_capabilities, '{}'::text[])) capability
       where capability <> all(public.tools_capabilities_catalogue())
     ) then
    raise exception 'Paramètres d''entitlement invalides';
  end if;

  select id into v_id
  from public.entitlements_utilisateurs_elsatia
  where utilisateur_id = p_utilisateur_id
    and application_code = p_application_code
    and source = p_source
    and coalesce(metadata->>'reference_externe', '') = coalesce(p_reference_externe, '')
  for update;

  v_action := case when v_id is null then 'granted' else 'updated' end;
  if v_id is null then
    insert into public.entitlements_utilisateurs_elsatia (
      utilisateur_id, application_code, niveau, capabilities, source, priorite,
      valide_du, expire_le, metadata, attribue_par
    ) values (
      p_utilisateur_id, p_application_code, p_niveau, coalesce(p_capabilities, '{}'::text[]),
      p_source, p_priorite, coalesce(p_valide_du, now()), p_expire_le,
      jsonb_strip_nulls(jsonb_build_object('reference_externe', p_reference_externe)), auth.uid()
    ) returning id into v_id;
  else
    update public.entitlements_utilisateurs_elsatia set
      niveau = p_niveau,
      capabilities = coalesce(p_capabilities, '{}'::text[]),
      priorite = p_priorite,
      valide_du = coalesce(p_valide_du, now()),
      expire_le = p_expire_le,
      revoked_at = null,
      revoked_reason = null,
      attribue_par = auth.uid()
    where id = v_id;
  end if;

  insert into public.historique_entitlements_elsatia (
    entitlement_id, utilisateur_id, application_code, action, source, niveau, auteur_id
  ) values (v_id, p_utilisateur_id, p_application_code, v_action, p_source, p_niveau, auth.uid());
  return v_id;
end;
$function$;

-- Résolveur : seule la branche « propriétaire global » change — elle reçoit tout le
-- catalogue, add-on compris, pour que l'équipe puisse tester le module sans achat.
-- Les branches Free et Pro sont reprises à l'identique : un Tools Pro existant ne reçoit
-- que les capabilities de ses propres lignes, donc jamais `releve-metre` sans attribution.
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
  return jsonb_build_object('application','tools','tier','pro','capabilities',to_jsonb(v_capabilities),
    'source',v_source,'sources',v_sources,'expires_at',v_expire_le,'validated_at',now(),
    'cache_version',1,'grace_seconds',604800);
end;
$$;
revoke all on function public.tools_resoudre_entitlements() from public, anon, service_role;
grant execute on function public.tools_resoudre_entitlements() to authenticated;

-- ── 3. Prédicats d'autorisation ──────────────────────────────────────────────
-- Dimension « entitlement personnel » : capability `releve-metre` résolue par le serveur,
-- jamais lue depuis le client. Même source que le client (cohérence d'affichage).
create or replace function public.tools_a_droit_releve_metre()
returns boolean language plpgsql security definer stable set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  return coalesce((public.tools_resoudre_entitlements() -> 'capabilities') ? 'releve-metre', false);
end;
$$;

-- Rôle Tools de l'utilisateur courant, uniquement s'il est membre ACTIF réel de
-- l'entreprise (une session support plateforme n'y donne aucun rôle) et que l'entreprise
-- dispose de l'accès applicatif Tools (dimension « organisation »).
create or replace function public.tools_releve_role_courant(p_entreprise_id uuid)
returns text language sql security definer stable set search_path = public as $$
  select h.role_code
  from public.habilitations_applications_utilisateurs h
  join public.roles_applications_elsatia r
    on r.application_code = h.application_code and r.code = h.role_code and r.actif
  where h.entreprise_id = p_entreprise_id
    and h.utilisateur_id = auth.uid()
    and h.application_code = 'tools'
    and h.role_code in ('tools_releve_admin', 'tools_releve_metreur', 'tools_releve_consultation', 'tools_pro')
    and h.autorise
    and (h.valide_du is null or h.valide_du <= now())
    and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
    and exists (
      select 1 from public.utilisateurs_entreprises ue
      where ue.entreprise_id = p_entreprise_id and ue.utilisateur_id = auth.uid() and ue.statut = 'actif'
    )
    and public.est_membre_actif(p_entreprise_id)
    and public.a_acces_application(p_entreprise_id, 'tools')
  limit 1;
$$;

create or replace function public.tools_releve_profil(p_role text)
returns text language sql immutable set search_path = public as $$
  select case p_role
    when 'tools_releve_admin' then 'admin'
    when 'tools_releve_consultation' then 'consultation'
    when 'tools_releve_metreur' then 'metreur'
    when 'tools_pro' then 'metreur'
  end;
$$;

-- Niveau organisation (miroir de `tenantDecision`, packages/releve-domain/src/permissions.ts).
-- Session support plateforme : lecture seule, sans rôle ni entitlement, comme Réserves.
create or replace function public.tools_releve_action_autorisee(p_entreprise_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_role text; v_profil text;
begin
  if auth.uid() is null or p_entreprise_id is null
     or p_action not in ('view','create','edit','delete','share','export','sync-gp') then
    return false;
  end if;
  v_role := public.tools_releve_role_courant(p_entreprise_id);
  if v_role is null then
    return p_action = 'view' and public.est_plateforme_admin() and public.est_acces_support_actif(p_entreprise_id);
  end if;
  if not public.tools_a_droit_releve_metre() then return false; end if;
  v_profil := public.tools_releve_profil(v_role);
  if p_action in ('view','export') then return true; end if;
  if v_profil = 'consultation' then return false; end if;
  if p_action = 'sync-gp' then return public.a_permission(p_entreprise_id, 'gerer_ouvrages'); end if;
  return true;
end;
$$;

-- ── 4. Relevé (racine) et hiérarchie ─────────────────────────────────────────
-- Colonnes communes à toutes les tables : entreprise_id (tenant), created_at/updated_at,
-- created_by/updated_by (ownership & audit), revision (concurrence optimiste, incrémentée
-- par trigger), deleted_at/deleted_by (suppression douce restaurable). Les identifiants
-- sont générés côté client (UUID) pour la saisie hors ligne des lots suivants.
create table public.tools_releves (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  proprietaire_id uuid not null default auth.uid() references public.utilisateurs(id) on delete restrict,
  type_projet text not null default 'releve' check (type_projet = 'releve'),
  schema_version integer not null default 1 check (schema_version between 1 and 1000),
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 160),
  reference text check (reference is null or (btrim(reference) <> '' and char_length(reference) <= 80)),
  statut text not null default 'brouillon' check (statut in ('brouillon','en_cours','termine','archive')),
  visibilite text not null default 'prive' check (visibilite in ('prive','entreprise')),
  -- Chantier : libellé local toujours présent + lien faible facultatif vers Gestion Pro.
  chantier_nom text not null check (btrim(chantier_nom) <> '' and char_length(chantier_nom) <= 180),
  chantier_adresse text check (chantier_adresse is null or char_length(chantier_adresse) <= 400),
  chantier_code_postal text check (chantier_code_postal is null or chantier_code_postal ~ '^[0-9A-Za-z -]{2,12}$'),
  chantier_ville text check (chantier_ville is null or char_length(chantier_ville) <= 120),
  chantier_gp_id uuid references public.chantiers(id) on delete set null,
  client_nom text check (client_nom is null or char_length(client_nom) <= 180),
  client_gp_id uuid references public.clients(id) on delete set null,
  date_releve date,
  notes text check (notes is null or char_length(notes) <= 4000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  -- Cible des clés étrangères composites : un enfant ne peut désigner qu'un relevé de SA
  -- propre entreprise.
  unique (id, entreprise_id)
);
create index tools_releves_entreprise_idx on public.tools_releves (entreprise_id, updated_at desc) where deleted_at is null;
create index tools_releves_proprietaire_idx on public.tools_releves (entreprise_id, proprietaire_id);
create index tools_releves_chantier_gp_idx on public.tools_releves (chantier_gp_id) where chantier_gp_id is not null;

create table public.tools_releves_batiments (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 120),
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
create index tools_releves_batiments_releve_idx on public.tools_releves_batiments (releve_id, ordre);

create table public.tools_releves_etages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  batiment_id uuid not null,
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 120),
  niveau integer not null check (niveau between -10 and 200),
  altitude_mm numeric(12,1) check (altitude_mm is null or altitude_mm between -1000000 and 1000000),
  hauteur_sous_plafond_mm numeric(8,1) check (hauteur_sous_plafond_mm is null or hauteur_sous_plafond_mm between 500 and 20000),
  etat text not null default 'existant' check (etat in ('existant','projet')),
  ordre integer not null default 0 check (ordre between 0 and 10000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  -- Le bâtiment parent appartient forcément au même relevé.
  foreign key (batiment_id, releve_id) references public.tools_releves_batiments(id, releve_id) on delete cascade,
  unique (id, releve_id)
);
create index tools_releves_etages_batiment_idx on public.tools_releves_etages (batiment_id, niveau, ordre);
create index tools_releves_etages_releve_idx on public.tools_releves_etages (releve_id);

create table public.tools_releves_zones (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  etage_id uuid not null,
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 120),
  type text not null default 'logement' check (type in ('logement','lot','parties_communes','local_technique','exterieur','autre')),
  ordre integer not null default 0 check (ordre between 0 and 10000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (etage_id, releve_id) references public.tools_releves_etages(id, releve_id) on delete cascade,
  unique (id, releve_id),
  unique (id, etage_id)
);
create index tools_releves_zones_etage_idx on public.tools_releves_zones (etage_id, ordre);
create index tools_releves_zones_releve_idx on public.tools_releves_zones (releve_id);

create table public.tools_releves_pieces (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  etage_id uuid not null,
  zone_id uuid,
  nom text not null check (btrim(nom) <> '' and char_length(nom) <= 120),
  usage text not null default 'autre' check (usage in (
    'sejour','chambre','cuisine','salle_de_bain','salle_d_eau','wc','entree','degagement',
    'bureau','cellier','buanderie','garage','cave','combles','escalier','exterieur','autre'
  )),
  hauteur_sous_plafond_mm numeric(8,1) check (hauteur_sous_plafond_mm is null or hauteur_sous_plafond_mm between 500 and 20000),
  ordre integer not null default 0 check (ordre between 0 and 10000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (etage_id, releve_id) references public.tools_releves_etages(id, releve_id) on delete cascade,
  -- La zone, si elle est renseignée, est sur le MÊME étage que la pièce. Une zone
  -- supprimée définitivement laisse la pièce directement rattachée à l'étage.
  foreign key (zone_id, etage_id) references public.tools_releves_zones(id, etage_id) on delete set null (zone_id),
  unique (id, releve_id),
  unique (id, etage_id)
);
create index tools_releves_pieces_etage_idx on public.tools_releves_pieces (etage_id, ordre);
create index tools_releves_pieces_zone_idx on public.tools_releves_pieces (zone_id) where zone_id is not null;
create index tools_releves_pieces_releve_idx on public.tools_releves_pieces (releve_id);

-- ── 5. Éléments métier ───────────────────────────────────────────────────────
-- Table générique typée : Mur, Ouverture, Equipement, Mesure, PhotoAnchor, Annotation,
-- Materiau, Quantite. Les rattachements (étage, pièce, mur hôte) sont des colonnes
-- contrôlées par clés étrangères composites ; la géométrie et les attributs vivent dans
-- `donnees`, validés par `tools_releve_element_donnees_valides()` (clés et types
-- essentiels) et, finement, par packages/releve-domain/src/validation.ts.
create or replace function public.tools_releve_element_donnees_valides(p_type text, p_donnees jsonb)
returns boolean language sql immutable set search_path = public as $$
  -- `coalesce(…, false)` : une clé absente rend l'expression NULL, qu'un CHECK accepterait.
  select coalesce(jsonb_typeof(p_donnees) = 'object' and case p_type
    when 'mur' then jsonb_typeof(p_donnees->'a') = 'object' and jsonb_typeof(p_donnees->'b') = 'object'
      and jsonb_typeof(p_donnees->'a'->'x') = 'number' and jsonb_typeof(p_donnees->'a'->'y') = 'number'
      and jsonb_typeof(p_donnees->'b'->'x') = 'number' and jsonb_typeof(p_donnees->'b'->'y') = 'number'
      and jsonb_typeof(p_donnees->'epaisseurMm') = 'number' and (p_donnees->>'epaisseurMm')::numeric > 0
      and p_donnees->>'typeMur' in ('exterieur','porteur','cloison','doublage')
    when 'ouverture' then jsonb_typeof(p_donnees->'decalageMm') = 'number' and (p_donnees->>'decalageMm')::numeric >= 0
      and jsonb_typeof(p_donnees->'largeurMm') = 'number' and (p_donnees->>'largeurMm')::numeric > 0
      and jsonb_typeof(p_donnees->'hauteurMm') = 'number' and (p_donnees->>'hauteurMm')::numeric > 0
      and p_donnees->>'typeOuverture' in ('porte','fenetre','porte_fenetre','baie','tremie','passage')
    when 'equipement' then p_donnees->>'categorie' in ('mobilier','electricite','plomberie','cvc','eclairage','autre')
      and jsonb_typeof(p_donnees->'position') = 'object' and coalesce(btrim(p_donnees->>'libelle'), '') <> ''
    when 'mesure' then jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'typeMesure' in ('longueur','hauteur','diagonale','angle','surface')
      and p_donnees->>'unite' in ('mm','rad','mm2')
      and p_donnees->>'source' in ('manuel','laser','photo','ar','lidar')
      and jsonb_typeof(p_donnees->'cible') = 'object'
    when 'photo_anchor' then coalesce(p_donnees->>'mediaId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_donnees->'ancre') = 'object'
    when 'annotation' then coalesce(btrim(p_donnees->>'texte'), '') <> '' and char_length(p_donnees->>'texte') <= 2000
      and jsonb_typeof(p_donnees->'ancre') = 'object'
    when 'materiau' then coalesce(btrim(p_donnees->>'libelle'), '') <> ''
      and p_donnees->>'categorie' in ('sol','mur','plafond','plinthe','menuiserie','autre')
      and p_donnees->>'unite' in ('m2','ml','m3','u')
    when 'quantite' then coalesce(btrim(p_donnees->>'cle'), '') <> '' and coalesce(btrim(p_donnees->>'formule'), '') <> ''
      and jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'unite' in ('m2','ml','m3','u') and p_donnees->>'qualite' in ('exacte','estimee')
    else false
  end, false);
$$;

create table public.tools_releves_elements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  type text not null check (type in ('mur','ouverture','equipement','mesure','photo_anchor','annotation','materiau','quantite')),
  etage_id uuid,
  piece_id uuid,
  parent_element_id uuid,
  schema_version integer not null default 1 check (schema_version between 1 and 1000),
  donnees jsonb not null check (pg_column_size(donnees) <= 65536),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (etage_id, releve_id) references public.tools_releves_etages(id, releve_id) on delete cascade,
  foreign key (piece_id, etage_id) references public.tools_releves_pieces(id, etage_id) on delete cascade,
  foreign key (parent_element_id, releve_id) references public.tools_releves_elements(id, releve_id) on delete cascade,
  unique (id, releve_id),
  check (public.tools_releve_element_donnees_valides(type, donnees)),
  check (type not in ('mur','ouverture','equipement') or etage_id is not null),
  check ((type = 'ouverture') = (parent_element_id is not null)),
  check (piece_id is null or etage_id is not null)
);
create index tools_releves_elements_releve_idx on public.tools_releves_elements (releve_id, type) where deleted_at is null;
create index tools_releves_elements_etage_idx on public.tools_releves_elements (etage_id) where etage_id is not null;
create index tools_releves_elements_piece_idx on public.tools_releves_elements (piece_id) where piece_id is not null;
create index tools_releves_elements_parent_idx on public.tools_releves_elements (parent_element_id) where parent_element_id is not null;

-- ── 6. Médias, versions, audit, journal GP ───────────────────────────────────
-- Un média décrit un fichier du bucket privé `tools-releves`. Le chemin est contraint à la
-- forme canonique {entreprise}/{relevé}/{catégorie}/{id}.{ext} : il ne peut désigner que
-- le relevé et l'entreprise de la ligne.
create table public.tools_releves_medias (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  categorie text not null check (categorie in ('photos','annotations','documents','exports')),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type text not null,
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 52428800),
  nom_fichier text check (nom_fichier is null or char_length(nom_fichier) <= 260),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  check (storage_path ~ ('^' || entreprise_id::text || '/' || releve_id::text || '/' || categorie || '/' || id::text || '\.[a-z0-9]{2,5}$')),
  check (case categorie
    when 'photos' then mime_type in ('image/jpeg','image/png','image/webp') and taille_octets <= 15728640
    when 'annotations' then mime_type in ('audio/webm','audio/mp4','audio/mpeg','image/png') and taille_octets <= 10485760
    when 'documents' then mime_type in ('application/pdf','image/jpeg','image/png') and taille_octets <= 26214400
    when 'exports' then mime_type in ('application/pdf','image/vnd.dxf','image/svg+xml','text/csv')
    else false end)
);
create index tools_releves_medias_releve_idx on public.tools_releves_medias (releve_id, categorie) where deleted_at is null;

-- Version : instantané IMMUABLE du relevé (structure + éléments + médias actifs), numéroté
-- par relevé, avec empreinte SHA-256 du contenu. Distinct de `revision` (concurrence).
-- Écrit uniquement par `tools_releve_creer_version()` ; jamais modifié ni supprimé.
create table public.tools_releves_versions (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  numero integer not null check (numero > 0),
  libelle text check (libelle is null or (btrim(libelle) <> '' and char_length(libelle) <= 200)),
  revision_source bigint not null,
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  contenu jsonb not null check (jsonb_typeof(contenu) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  unique (releve_id, numero),
  unique (id, releve_id)
);

-- Journal d'audit append-only, alimenté exclusivement par triggers et RPC.
create table public.tools_releves_journal (
  id bigint generated always as identity primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  releve_id uuid not null references public.tools_releves(id) on delete cascade,
  entite text not null check (entite in ('releve','batiment','etage','zone','piece','element','media','version')),
  entite_id uuid not null,
  action text not null check (action in ('creation','modification','suppression','restauration','partage','transfert','version')),
  champs text[] not null default '{}'::text[],
  auteur_id uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index tools_releves_journal_releve_idx on public.tools_releves_journal (releve_id, created_at desc);

-- Journal d'envoi vers Gestion Pro. Créé dès la fondation pour figer l'idempotence
-- (contrat packages/releve-domain/src/gp-sync.ts) ; AUCUNE fonction ne l'alimente au lot 2 :
-- la cible GP (RPC d'import, double autorisation, unité m³) n'est pas prête.
create table public.tools_releves_exports_gp (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  version_id uuid not null,
  chantier_gp_id uuid references public.chantiers(id) on delete set null,
  contract_version integer not null default 1 check (contract_version > 0),
  idempotency_key text not null unique check (char_length(idempotency_key) between 10 and 300),
  statut text not null default 'prepare' check (statut in ('prepare','envoye','applique','rejete')),
  metre_gp_id uuid references public.metres(id) on delete set null,
  erreur text check (erreur is null or char_length(erreur) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (version_id, releve_id) references public.tools_releves_versions(id, releve_id) on delete cascade
);
create index tools_releves_exports_gp_releve_idx on public.tools_releves_exports_gp (releve_id, created_at desc);

-- ── 7. Autorisation au niveau objet ──────────────────────────────────────────
-- Miroir exact de `canPerform()` (packages/releve-domain/src/permissions.ts) :
--
-- | action  | admin      | métreur / tools_pro        | consultation | support plateforme |
-- |---------|------------|----------------------------|--------------|--------------------|
-- | view    | tous       | propres + partagés         | partagés     | tous (lecture)     |
-- | edit    | tous       | propres + partagés         | non          | non                |
-- | delete  | tous       | propres                    | non          | non                |
-- | share   | tous       | propres                    | non          | non                |
-- | export  | = view     | = view                     | = view       | non                |
-- | sync-gp | tous + GP  | propres + partagés, + GP   | non          | non                |
--
-- Relevé supprimé : seuls `view` et `delete` (corbeille, restauration), pour le
-- propriétaire métreur et l'administrateur.
create or replace function public.tools_releve_peut(p_releve_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_entreprise uuid; v_proprietaire uuid; v_visibilite text; v_supprime boolean;
  v_role text; v_profil text; v_proprio boolean;
begin
  if auth.uid() is null or p_releve_id is null then return false; end if;
  select r.entreprise_id, r.proprietaire_id, r.visibilite, r.deleted_at is not null
    into v_entreprise, v_proprietaire, v_visibilite, v_supprime
  from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null then return false; end if;
  if p_action = 'create' or not public.tools_releve_action_autorisee(v_entreprise, p_action) then return false; end if;

  v_role := public.tools_releve_role_courant(v_entreprise);
  if v_role is null then
    -- Session support : lecture seule des relevés actifs.
    return p_action = 'view' and not v_supprime;
  end if;
  v_profil := public.tools_releve_profil(v_role);
  v_proprio := v_proprietaire = auth.uid();

  if v_supprime then
    return p_action in ('view','delete') and (v_profil = 'admin' or (v_profil = 'metreur' and v_proprio));
  end if;
  if p_action in ('view','export') then
    return v_profil = 'admin' or v_proprio or v_visibilite = 'entreprise';
  end if;
  if p_action in ('edit','sync-gp') then
    return v_profil = 'admin' or (v_profil = 'metreur' and (v_proprio or v_visibilite = 'entreprise'));
  end if;
  if p_action in ('delete','share') then
    return v_profil = 'admin' or (v_profil = 'metreur' and v_proprio);
  end if;
  return false;
end;
$$;

-- Actions autorisées sur un relevé, pour l'interface (une seule requête par relevé).
create or replace function public.tools_releve_actions(p_releve_id uuid)
returns text[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(a order by o), '{}'::text[])
  from unnest(array['view','edit','delete','share','export','sync-gp']) with ordinality as t(a, o)
  where public.tools_releve_peut(p_releve_id, a);
$$;

-- Contexte d'acteur pour le client (miroir de `ReleveActorContext`) : rôle, entitlement,
-- accès organisation et permission GP. Aucune donnée d'un autre tenant n'en sort.
create or replace function public.tools_releve_contexte(p_entreprise_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  v_role := public.tools_releve_role_courant(p_entreprise_id);
  return jsonb_build_object(
    'entreprise_id', p_entreprise_id,
    'tenant_has_tools', public.a_acces_application(p_entreprise_id, 'tools') and public.est_membre_actif(p_entreprise_id),
    'has_releve_capability', public.tools_a_droit_releve_metre(),
    'role', v_role,
    'gp_gerer_ouvrages', case when v_role is null then false else public.a_permission(p_entreprise_id, 'gerer_ouvrages') end
  );
end;
$$;

-- ── 8. Triggers : métadonnées, gardes, cascade, audit ────────────────────────
create or replace function public.tools_releve_avant_ecriture()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_meta constant text[] := array['revision','updated_at','updated_by','deleted_at','deleted_by','visibilite','proprietaire_id'];
  v_contenu boolean;
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then raise exception 'Un relevé ne peut pas être créé supprimé'; end if;
    new.revision := 1; new.created_at := now(); new.updated_at := now(); new.deleted_by := null;
    if v_uid is not null then
      new.proprietaire_id := v_uid; new.created_by := v_uid; new.updated_by := v_uid;
    end if;
  else
    if new.id <> old.id or new.entreprise_id <> old.entreprise_id or new.created_at <> old.created_at
       or new.created_by is distinct from old.created_by or new.type_projet <> old.type_projet then
      raise exception 'Colonnes immuables du relevé' using errcode = '42501';
    end if;
    if v_uid is not null then
      if new.deleted_at is distinct from old.deleted_at then
        if not public.tools_releve_peut(old.id, 'delete') then
          raise exception 'Suppression du relevé non autorisée' using errcode = '42501';
        end if;
        new.deleted_at := case when new.deleted_at is null then null else now() end;
        new.deleted_by := case when new.deleted_at is null then null else v_uid end;
      end if;
      if new.visibilite <> old.visibilite and not public.tools_releve_peut(old.id, 'share') then
        raise exception 'Partage du relevé non autorisé' using errcode = '42501';
      end if;
      if new.proprietaire_id <> old.proprietaire_id then
        if public.tools_releve_profil(public.tools_releve_role_courant(old.entreprise_id)) is distinct from 'admin' then
          raise exception 'Seul un administrateur Relevé peut transférer un relevé' using errcode = '42501';
        end if;
        if not exists (select 1 from public.utilisateurs_entreprises ue
                       where ue.entreprise_id = old.entreprise_id and ue.utilisateur_id = new.proprietaire_id and ue.statut = 'actif') then
          raise exception 'Le nouveau propriétaire doit être membre actif de l''entreprise';
        end if;
      end if;
      v_contenu := (to_jsonb(new) - v_meta) is distinct from (to_jsonb(old) - v_meta);
      if (v_contenu or (new.deleted_at is not distinct from old.deleted_at
                        and new.visibilite = old.visibilite and new.proprietaire_id = old.proprietaire_id))
         and not public.tools_releve_peut(old.id, 'edit') then
        raise exception 'Modification du relevé non autorisée' using errcode = '42501';
      end if;
    end if;
    new.revision := old.revision + 1; new.updated_at := now(); new.updated_by := coalesce(v_uid, old.updated_by);
  end if;

  -- Liens Gestion Pro : même entreprise (toujours, service_role compris) et permission GP
  -- de lecture pour l'utilisateur qui pose le lien. GP reste autoritaire sur ces fiches.
  if new.chantier_gp_id is not null and (tg_op = 'INSERT' or new.chantier_gp_id is distinct from old.chantier_gp_id) then
    if not exists (select 1 from public.chantiers c where c.id = new.chantier_gp_id and c.entreprise_id = new.entreprise_id) then
      raise exception 'Chantier Gestion Pro introuvable dans cette entreprise' using errcode = '42501';
    end if;
    if v_uid is not null and not public.a_permission(new.entreprise_id, 'acces_chantiers') then
      raise exception 'Lien chantier : permission Gestion Pro « acces_chantiers » requise' using errcode = '42501';
    end if;
  end if;
  if new.client_gp_id is not null and (tg_op = 'INSERT' or new.client_gp_id is distinct from old.client_gp_id) then
    if not exists (select 1 from public.clients c where c.id = new.client_gp_id and c.entreprise_id = new.entreprise_id) then
      raise exception 'Client Gestion Pro introuvable dans cette entreprise' using errcode = '42501';
    end if;
    if v_uid is not null and not public.a_permission(new.entreprise_id, 'acces_clients') then
      raise exception 'Lien client : permission Gestion Pro « acces_clients » requise' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Tables filles (structure, éléments, médias) : entreprise déduite du relevé, relevé
-- actif exigé à la création, colonnes de rattachement au relevé immuables, métadonnées
-- serveur. L'autorisation elle-même est portée par la RLS (`tools_releve_peut`).
create or replace function public.tools_releve_enfant_avant_ecriture()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_entreprise uuid; v_supprime timestamptz;
begin
  if tg_op = 'INSERT' then
    select r.entreprise_id, r.deleted_at into v_entreprise, v_supprime from public.tools_releves r where r.id = new.releve_id;
    if v_entreprise is null then raise exception 'Relevé introuvable' using errcode = '42501'; end if;
    if v_supprime is not null then
      raise exception 'Relevé supprimé : restaurez-le avant de le modifier' using errcode = '42501';
    end if;
    if new.entreprise_id is null then new.entreprise_id := v_entreprise; end if;
    if new.deleted_at is not null then raise exception 'Un élément ne peut pas être créé supprimé'; end if;
    new.revision := 1; new.created_at := now(); new.updated_at := now(); new.deleted_by := null;
    if v_uid is not null then new.created_by := v_uid; new.updated_by := v_uid; end if;
  else
    if new.id <> old.id or new.entreprise_id <> old.entreprise_id or new.releve_id <> old.releve_id
       or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Colonnes immuables' using errcode = '42501';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      -- Horodatage serveur : la cascade propage cette valeur exacte, qui sert ensuite de
      -- clé de restauration (now() est constant dans la transaction).
      if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); end if;
      new.deleted_by := case when new.deleted_at is null then null else coalesce(v_uid, old.deleted_by) end;
    end if;
    new.revision := old.revision + 1; new.updated_at := now(); new.updated_by := coalesce(v_uid, old.updated_by);
  end if;
  -- Instructions imbriquées : PL/pgSQL ne prépare `new.type` que pour la table qui l'a.
  if tg_table_name = 'tools_releves_elements' then
    if new.type = 'ouverture' and new.parent_element_id is not null and not exists (
      select 1 from public.tools_releves_elements m
      where m.id = new.parent_element_id and m.type = 'mur' and m.etage_id = new.etage_id
    ) then
      raise exception 'Une ouverture doit être hébergée par un mur du même étage';
    end if;
  end if;
  return new;
end;
$$;

-- Suppression douce en cascade (et restauration symétrique) : bâtiment → étages ;
-- étage → zones, pièces, éléments ; pièce → éléments ; mur → ouvertures. La restauration
-- ne ranime que les descendants supprimés par la même cascade (même horodatage). Une zone
-- supprimée n'emporte pas ses pièces : c'est un regroupement, pas un contenant physique.
create or replace function public.tools_releve_cascade_suppression()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_supprime boolean := new.deleted_at is not null;
begin
  if new.deleted_at is not distinct from old.deleted_at then return null; end if;
  if tg_table_name = 'tools_releves_batiments' then
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

-- Audit append-only : qui, quoi, quand, quels champs. Jamais le contenu (RGPD : le journal
-- ne duplique ni adresses ni notes).
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
      when 'tools_releves' then 'releve' when 'tools_releves_batiments' then 'batiment'
      when 'tools_releves_etages' then 'etage' when 'tools_releves_zones' then 'zone'
      when 'tools_releves_pieces' then 'piece' when 'tools_releves_elements' then 'element'
      when 'tools_releves_medias' then 'media' end,
    (v_new->>'id')::uuid, v_action, v_champs, auth.uid()
  );
  return null;
end;
$$;

create trigger tools_releves_avant_ecriture before insert or update on public.tools_releves
  for each row execute function public.tools_releve_avant_ecriture();
create trigger tools_releves_journal after insert or update on public.tools_releves
  for each row execute function public.tools_releve_journaliser();

do $$
declare v_table text;
begin
  foreach v_table in array array['tools_releves_batiments','tools_releves_etages','tools_releves_zones',
                                 'tools_releves_pieces','tools_releves_elements','tools_releves_medias'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tools_releve_enfant_avant_ecriture()', v_table || '_avant_ecriture', v_table);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.tools_releve_journaliser()', v_table || '_journal', v_table);
  end loop;
  foreach v_table in array array['tools_releves_batiments','tools_releves_etages','tools_releves_pieces','tools_releves_elements'] loop
    execute format('create trigger %I after update of deleted_at on public.%I for each row execute function public.tools_releve_cascade_suppression()', v_table || '_cascade', v_table);
  end loop;
end $$;

-- ── 9. Versions ──────────────────────────────────────────────────────────────
-- Instantané immuable de l'état courant (éléments supprimés exclus), numéroté et
-- empreinté. Base de la future transmission GP (on envoie une version, jamais l'état vivant).
create or replace function public.tools_releve_creer_version(p_releve_id uuid, p_libelle text default null)
returns public.tools_releves_versions
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_releve public.tools_releves; v_contenu jsonb; v_numero integer; v_version public.tools_releves_versions;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.tools_releve_peut(p_releve_id, 'edit') then
    raise exception 'Création de version non autorisée' using errcode = '42501';
  end if;
  select * into v_releve from public.tools_releves where id = p_releve_id for update;
  select coalesce(max(numero), 0) + 1 into v_numero from public.tools_releves_versions where releve_id = p_releve_id;
  v_contenu := jsonb_build_object(
    'schema_version', v_releve.schema_version,
    'releve', to_jsonb(v_releve) - array['created_by','updated_by','deleted_by'],
    'batiments', coalesce((select jsonb_agg(to_jsonb(b) order by b.ordre, b.id) from public.tools_releves_batiments b where b.releve_id = p_releve_id and b.deleted_at is null), '[]'::jsonb),
    'etages', coalesce((select jsonb_agg(to_jsonb(e) order by e.niveau, e.ordre, e.id) from public.tools_releves_etages e where e.releve_id = p_releve_id and e.deleted_at is null), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.ordre, z.id) from public.tools_releves_zones z where z.releve_id = p_releve_id and z.deleted_at is null), '[]'::jsonb),
    'pieces', coalesce((select jsonb_agg(to_jsonb(p) order by p.ordre, p.id) from public.tools_releves_pieces p where p.releve_id = p_releve_id and p.deleted_at is null), '[]'::jsonb),
    'elements', coalesce((select jsonb_agg(to_jsonb(x) order by x.type, x.id) from public.tools_releves_elements x where x.releve_id = p_releve_id and x.deleted_at is null), '[]'::jsonb),
    'medias', coalesce((select jsonb_agg(to_jsonb(m) order by m.categorie, m.id) from public.tools_releves_medias m where m.releve_id = p_releve_id and m.deleted_at is null), '[]'::jsonb)
  );
  insert into public.tools_releves_versions (entreprise_id, releve_id, numero, libelle, revision_source, empreinte, contenu, created_by)
  values (v_releve.entreprise_id, p_releve_id, v_numero, nullif(btrim(p_libelle), ''), v_releve.revision,
          encode(extensions.digest(convert_to(v_contenu::text, 'UTF8'), 'sha256'), 'hex'), v_contenu, auth.uid())
  returning * into v_version;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id)
  values (v_releve.entreprise_id, p_releve_id, 'version', v_version.id, 'version', array['numero'], auth.uid());
  return v_version;
end;
$$;

-- ── 10. Row Level Security ───────────────────────────────────────────────────
alter table public.tools_releves enable row level security;
alter table public.tools_releves_batiments enable row level security;
alter table public.tools_releves_etages enable row level security;
alter table public.tools_releves_zones enable row level security;
alter table public.tools_releves_pieces enable row level security;
alter table public.tools_releves_elements enable row level security;
alter table public.tools_releves_medias enable row level security;
alter table public.tools_releves_versions enable row level security;
alter table public.tools_releves_journal enable row level security;
alter table public.tools_releves_exports_gp enable row level security;

-- Relevé : création dans une entreprise où l'on a `create`, propriétaire = soi (forcé par
-- trigger). Lecture/écriture décidées par `tools_releve_peut` ; le détail des changements
-- autorisés (partage, suppression, transfert) est contrôlé par le trigger de garde.
create policy tools_releves_select on public.tools_releves
  for select to authenticated using (public.tools_releve_peut(id, 'view'));
create policy tools_releves_insert on public.tools_releves
  for insert to authenticated with check (
    proprietaire_id = auth.uid() and deleted_at is null
    and public.tools_releve_action_autorisee(entreprise_id, 'create')
  );
create policy tools_releves_update on public.tools_releves
  for update to authenticated
  using (public.tools_releve_peut(id, 'view'))
  with check (public.tools_releve_action_autorisee(entreprise_id, 'view'));

do $$
declare v_table text;
begin
  foreach v_table in array array['tools_releves_batiments','tools_releves_etages','tools_releves_zones',
                                 'tools_releves_pieces','tools_releves_elements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.tools_releve_peut(releve_id, %L))', v_table || '_select', v_table, 'view');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.tools_releve_peut(releve_id, %L))', v_table || '_insert', v_table, 'edit');
    execute format('create policy %I on public.%I for update to authenticated using (public.tools_releve_peut(releve_id, %L)) with check (public.tools_releve_peut(releve_id, %L))', v_table || '_update', v_table, 'edit', 'edit');
  end loop;
end $$;

-- Médias : un export généré exige `export` ; photos, annotations et documents exigent `edit`.
create policy tools_releves_medias_select on public.tools_releves_medias
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
create policy tools_releves_medias_insert on public.tools_releves_medias
  for insert to authenticated with check (
    public.tools_releve_peut(releve_id, case when categorie = 'exports' then 'export' else 'edit' end)
  );
create policy tools_releves_medias_update on public.tools_releves_medias
  for update to authenticated
  using (public.tools_releve_peut(releve_id, 'edit'))
  with check (public.tools_releve_peut(releve_id, 'edit'));

create policy tools_releves_versions_select on public.tools_releves_versions
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
create policy tools_releves_journal_select on public.tools_releves_journal
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
create policy tools_releves_exports_gp_select on public.tools_releves_exports_gp
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));

-- ── 11. Stockage privé ───────────────────────────────────────────────────────
-- Chemin : {entreprise}/{relevé}/{catégorie}/{média}.{ext} (packages/releve-domain/src/storage.ts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tools-releves', 'tools-releves', false, 52428800,
  array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/mpeg',
        'application/pdf','image/vnd.dxf','image/svg+xml','text/csv']
)
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Décompose le chemin, refuse toute forme non canonique, vérifie que le couple
-- (entreprise, relevé) existe RÉELLEMENT, puis applique la permission de l'opération.
create or replace function public.tools_releve_storage_autorise(p_chemin text, p_operation text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_dossiers text[]; v_entreprise uuid; v_releve uuid; v_categorie text; v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is null or p_chemin is null or p_chemin like '%..%' then return false; end if;
  v_dossiers := storage.foldername(p_chemin);
  if coalesce(array_length(v_dossiers, 1), 0) <> 3 then return false; end if;
  if v_dossiers[1] !~ v_uuid or v_dossiers[2] !~ v_uuid then return false; end if;
  v_categorie := v_dossiers[3];
  if v_categorie not in ('photos','annotations','documents','exports') then return false; end if;
  if storage.filename(p_chemin) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$' then return false; end if;
  v_entreprise := v_dossiers[1]::uuid; v_releve := v_dossiers[2]::uuid;
  if not exists (select 1 from public.tools_releves r where r.id = v_releve and r.entreprise_id = v_entreprise) then
    return false;
  end if;
  return case p_operation
    when 'lecture' then public.tools_releve_peut(v_releve, 'view')
    when 'ecriture' then public.tools_releve_peut(v_releve, case when v_categorie = 'exports' then 'export' else 'edit' end)
    when 'suppression' then public.tools_releve_peut(v_releve, 'delete')
    else false end;
end;
$$;

drop policy if exists tools_releves_storage_select on storage.objects;
create policy tools_releves_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tools-releves' and public.tools_releve_storage_autorise(name, 'lecture'));
drop policy if exists tools_releves_storage_insert on storage.objects;
create policy tools_releves_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tools-releves' and public.tools_releve_storage_autorise(name, 'ecriture'));
-- Pas de policy `update` : un fichier déposé n'est jamais écrasé (nouvel identifiant).
drop policy if exists tools_releves_storage_delete on storage.objects;
create policy tools_releves_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tools-releves' and public.tools_releve_storage_autorise(name, 'suppression'));

-- ── 12. Droits ───────────────────────────────────────────────────────────────
-- Les privilèges par défaut de Supabase accordent tout à anon/authenticated sur une
-- nouvelle table : ils sont retirés explicitement, puis seuls les droits utiles sont rendus.
revoke all on public.tools_releves, public.tools_releves_batiments, public.tools_releves_etages,
  public.tools_releves_zones, public.tools_releves_pieces, public.tools_releves_elements,
  public.tools_releves_medias, public.tools_releves_versions, public.tools_releves_journal,
  public.tools_releves_exports_gp
from public, anon, authenticated;

grant select, insert, update on public.tools_releves, public.tools_releves_batiments, public.tools_releves_etages,
  public.tools_releves_zones, public.tools_releves_pieces, public.tools_releves_elements, public.tools_releves_medias
to authenticated;
-- Versions, journal et envois GP : lecture seule. Aucune suppression physique n'est
-- ouverte à l'application (suppression douce uniquement) ; la purge RGPD d'une entreprise
-- passe par la cascade `entreprises` côté service_role.
grant select on public.tools_releves_versions, public.tools_releves_journal, public.tools_releves_exports_gp to authenticated;

grant select, insert, update, delete on public.tools_releves, public.tools_releves_batiments, public.tools_releves_etages,
  public.tools_releves_zones, public.tools_releves_pieces, public.tools_releves_elements, public.tools_releves_medias,
  public.tools_releves_versions, public.tools_releves_journal, public.tools_releves_exports_gp
to service_role;

-- Fonctions de trigger : jamais appelables directement.
revoke all on function public.tools_releve_avant_ecriture() from public, anon, authenticated;
revoke all on function public.tools_releve_enfant_avant_ecriture() from public, anon, authenticated;
revoke all on function public.tools_releve_cascade_suppression() from public, anon, authenticated;
revoke all on function public.tools_releve_journaliser() from public, anon, authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.tools_a_droit_releve_metre()',
    'public.tools_releve_role_courant(uuid)',
    'public.tools_releve_profil(text)',
    'public.tools_releve_action_autorisee(uuid,text)',
    'public.tools_releve_peut(uuid,text)',
    'public.tools_releve_actions(uuid)',
    'public.tools_releve_contexte(uuid)',
    'public.tools_releve_element_donnees_valides(text,jsonb)',
    'public.tools_releve_storage_autorise(text,text)',
    'public.tools_releve_creer_version(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
