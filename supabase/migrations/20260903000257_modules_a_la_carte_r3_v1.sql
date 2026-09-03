-- ELSATIA-MODULES-A-LA-CARTE-R3-V1
-- Socle des modules optionnels de Gestion Pro : catalogue canonique + entitlement
-- entreprise + garde serveur. Aucun prix module, aucun Stripe, aucune Production.
--
-- Principe d'accès : ENTITLEMENT ENTREPRISE + HABILITATION/PERMISSION UTILISATEUR.
-- R3 n'ÉLARGIT jamais un accès existant en le retirant : l'entitlement module
-- s'ajoute EN OU au contrôle plan actuel (permissionIncluseDansOffre). Un client
-- qui a aujourd'hui accès à une fonction incluse dans son offre la garde.
--
-- Additif : aucune migration historique modifiée, aucun élargissement ACL,
-- functions SECURITY DEFINER bornées (tenant + AAL2 pour la plateforme).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catalogue canonique des modules Gestion Pro
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.modules_gestion_pro (
  code text primary key,
  nom text not null,
  description text,
  categorie text not null default 'gestion'
    check (categorie in ('terrain','gestion','finance','integration','infra')),
  -- actif : vendable/activable ; bientot : annoncé, pas encore livré ;
  -- interne : géré ailleurs (ex. capacité) ; non_vendable : pas de promesse commerciale.
  statut_catalogue text not null default 'bientot'
    check (statut_catalogue in ('actif','bientot','interne','non_vendable')),
  ordre integer not null default 100,
  -- entreprise : entitlement explicite ; plan : dérivé du forfait ;
  -- consommation : mesuré (quota) et non pas porte de module.
  mode_activation text not null default 'entreprise'
    check (mode_activation in ('entreprise','plan','consommation')),
  multi_plateforme boolean not null default true,
  offline_requis boolean not null default false,
  donnees_persistantes boolean not null default false,
  mode_apres_desactivation text not null default 'inaccessible'
    check (mode_apres_desactivation in ('lecture_seule','inaccessible','export_uniquement')),
  -- Permissions "porte d'entrée" que ce module débloque (jamais des droits fins).
  permissions_couvertes text[] not null default '{}',
  -- Forfaits qui incluent ce module sans achat séparé (source canonique unique).
  plans_inclus text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modules_gestion_pro enable row level security;
drop policy if exists modules_gestion_pro_lecture on public.modules_gestion_pro;
create policy modules_gestion_pro_lecture on public.modules_gestion_pro
  for select to authenticated using (true);

revoke all on table public.modules_gestion_pro from anon, authenticated, service_role;
grant select on table public.modules_gestion_pro to authenticated;

insert into public.modules_gestion_pro
  (code, nom, description, categorie, statut_catalogue, ordre, mode_activation,
   multi_plateforme, offline_requis, donnees_persistantes, mode_apres_desactivation,
   permissions_couvertes, plans_inclus)
values
  ('chantier','Suivi de chantier','Chantiers, équipes, avancement, documents.','terrain','actif',10,'entreprise',
   true,true,true,'lecture_seule',
   array['acces_chantiers','gerer_chantiers'], array['mini','pro','business','entreprise','sur_mesure']),
  ('pointage','Pointage','Saisie et validation des heures sur chantier.','terrain','actif',20,'entreprise',
   true,true,true,'lecture_seule',
   array['acces_pointage','gerer_pointage','saisir_son_pointage','valider_pointages'],
   array['pro','business','entreprise','sur_mesure']),
  ('planning_avance','Planning avancé','Optimisation, contraintes et vues avancées du planning.','terrain','bientot',30,'entreprise',
   true,false,false,'inaccessible', array[]::text[], array[]::text[]),
  ('scan_ocr','Scan & OCR','Numérisation et extraction automatique des documents.','terrain','bientot',40,'entreprise',
   true,true,true,'export_uniquement', array[]::text[], array[]::text[]),
  ('notes_frais','Notes de frais','Dépenses et justificatifs des équipes.','gestion','actif',50,'entreprise',
   true,false,true,'lecture_seule',
   array['saisir_ses_notes_frais','gerer_notes_frais'], array['pro','business','entreprise','sur_mesure']),
  ('vehicules','Véhicules & flotte','Suivi des véhicules, entretien et affectations.','gestion','actif',60,'entreprise',
   true,false,true,'lecture_seule',
   array['acces_flotte','gerer_flotte'], array['business','entreprise','sur_mesure']),
  ('materiel','Matériel & outillage','Parc matériel, prêts et maintenance légère.','gestion','actif',70,'entreprise',
   true,false,true,'lecture_seule',
   array['acces_outillage','gerer_outillage'], array['business','entreprise','sur_mesure']),
  ('stock','Stock & dépôt','Articles, mouvements, inventaires et borne dépôt.','terrain','actif',80,'entreprise',
   true,true,true,'lecture_seule',
   array['acces_stock','gerer_stock','utiliser_borne_stock'], array['business','entreprise','sur_mesure']),
  ('maintenance','Maintenance','Plans de maintenance et interventions préventives.','gestion','bientot',90,'entreprise',
   true,false,true,'lecture_seule', array[]::text[], array[]::text[]),
  ('safety','Sécurité & prévention','Registres sécurité, causeries, incidents.','terrain','bientot',100,'entreprise',
   true,true,true,'lecture_seule', array[]::text[], array[]::text[]),
  ('forms','Formulaires terrain','Formulaires personnalisés remplis sur le terrain.','terrain','bientot',110,'entreprise',
   true,true,true,'export_uniquement', array[]::text[], array[]::text[]),
  ('signature','Signature électronique','Signature des devis, PV et documents.','gestion','bientot',120,'entreprise',
   true,false,true,'export_uniquement', array[]::text[], array[]::text[]),
  ('connect','Connecteurs & API','Intégrations externes et échanges de données.','integration','bientot',130,'entreprise',
   true,false,false,'inaccessible',
   array['acces_connecteurs','gerer_connecteurs'], array[]::text[]),
  ('rentabilite_avancee','Rentabilité avancée','Analyse fine des coûts et de la marge chantier.','finance','actif',140,'entreprise',
   true,false,false,'inaccessible',
   array['acces_rentabilite','voir_rentabilite','acces_exports'], array['business','entreprise','sur_mesure']),
  ('facturation_electronique','Facturation électronique','Émission et réception conformes (réforme e-invoicing).','finance','bientot',150,'entreprise',
   true,false,true,'export_uniquement', array[]::text[], array[]::text[]),
  ('automations','Automatisations','Règles et scénarios automatisés.','gestion','bientot',160,'entreprise',
   true,false,true,'inaccessible', array[]::text[], array[]::text[]),
  ('ia','Assistant IA','Accès aux fonctions d''assistance IA (consommation gérée séparément).','gestion','actif',170,'entreprise',
   true,false,false,'inaccessible',
   array['acces_ia'], array['mini','pro','business','entreprise','sur_mesure']),
  ('stockage_supplementaire','Stockage supplémentaire','Capacité de stockage documentaire additionnelle.','infra','interne',180,'consommation',
   true,false,true,'lecture_seule', array[]::text[], array[]::text[]),
  ('sauvegarde_renforcee','Sauvegarde renforcée','Rétention et restauration étendues.','infra','non_vendable',190,'entreprise',
   true,false,false,'inaccessible', array[]::text[], array[]::text[])
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Entitlement entreprise par module (droit commercial, verrouillé côté client)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.modules_entreprises (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  module_code text not null references public.modules_gestion_pro(code) on delete restrict,
  actif boolean not null default true,
  origine text not null default 'admin'
    check (origine in ('plan','achat','offert','essai','admin','migration')),
  plan_source text,
  reference_externe text,
  source text not null default 'admin_plateforme'
    check (source in ('admin_plateforme','stripe','systeme','plan')),
  valide_du date not null default current_date,
  valide_jusqu date,
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entreprise_id, module_code),
  check (valide_jusqu is null or valide_jusqu >= valide_du)
);
create index if not exists modules_entreprises_actif_idx
  on public.modules_entreprises(entreprise_id, actif);

alter table public.modules_entreprises enable row level security;
alter table public.modules_entreprises force row level security;

-- Lecture seule pour les membres / la plateforme. AUCUNE écriture directe :
-- l'activation/désactivation passe exclusivement par la RPC plateforme (AAL2)
-- ou, plus tard, par le webhook Stripe (R4). `authenticated` ne peut pas
-- s'accorder lui-même un module.
drop policy if exists modules_entreprises_lecture on public.modules_entreprises;
create policy modules_entreprises_lecture on public.modules_entreprises
  for select using (
    public.est_plateforme_admin() or public.est_membre_actif(entreprise_id)
  );

revoke all on table public.modules_entreprises from anon, authenticated, service_role;
grant select on table public.modules_entreprises to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Historique (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.historique_modules_entreprises (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  module_code text not null,
  action text not null check (action in ('active','desactive','prolonge','expire','ajuste')),
  origine text,
  source text,
  reference_externe text,
  ancien jsonb,
  nouveau jsonb,
  acteur_id uuid references auth.users(id),
  motif text,
  created_at timestamptz not null default now()
);
create index if not exists historique_modules_entreprises_idx
  on public.historique_modules_entreprises(entreprise_id, created_at desc);

alter table public.historique_modules_entreprises enable row level security;
drop policy if exists historique_modules_lecture on public.historique_modules_entreprises;
create policy historique_modules_lecture on public.historique_modules_entreprises
  for select using (
    public.est_plateforme_admin()
    or (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, 'gerer_parametres'))
  );

revoke all on table public.historique_modules_entreprises from anon, authenticated, service_role;
grant select on table public.historique_modules_entreprises to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Résolution de l'entitlement (catalogue + entitlement explicite + plan)
-- ─────────────────────────────────────────────────────────────────────────────

-- Vrai si l'entreprise a le module actif : entitlement explicite dans sa fenêtre
-- de validité, OU module inclus dans le forfait courant (source canonique
-- plans_inclus). Le statut catalogue non 'actif' n'est jamais débloqué par un
-- plan, mais un entitlement explicite (essai/offert/admin) reste possible.
create or replace function public.module_gestion_pro_actif_entreprise(
  p_entreprise_id uuid,
  p_module_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offre text;
  v_plan text;
  v_statut text;
  v_plans_inclus text[];
  v_explicite boolean;
begin
  select statut_catalogue, plans_inclus into v_statut, v_plans_inclus
  from public.modules_gestion_pro where code = p_module_code;
  if not found then
    return false;
  end if;

  select exists (
    select 1 from public.modules_entreprises me
    where me.entreprise_id = p_entreprise_id
      and me.module_code = p_module_code
      and me.actif
      and me.valide_du <= current_date
      and (me.valide_jusqu is null or me.valide_jusqu >= current_date)
  ) into v_explicite;
  if v_explicite then
    return true;
  end if;

  -- Inclusion par forfait (uniquement pour un module au catalogue 'actif').
  if v_statut = 'actif' then
    select nullif(btrim(lower(abonnement_offre)), '') into v_offre
    from public.entreprises where id = p_entreprise_id;
    v_plan := case v_offre
                when 'essentiel' then 'mini'
                when 'premium'   then 'business'
                when null        then 'mini'
                else coalesce(v_offre, 'mini')
              end;
    return v_plan = any(v_plans_inclus);
  end if;

  return false;
end;
$$;

-- Garde serveur canonique : tenant + entitlement + (option) permission métier.
create or replace function public.a_acces_module_gestion_pro(
  p_entreprise_id uuid,
  p_module_code text,
  p_permission text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    return false;
  end if;
  if not public.module_gestion_pro_actif_entreprise(p_entreprise_id, p_module_code) then
    return false;
  end if;
  if p_permission is not null and not public.a_permission(p_entreprise_id, p_permission) then
    return false;
  end if;
  return true;
end;
$$;

-- Utilisé par le proxy applicatif : une des permissions "porte d'entrée" est-elle
-- débloquée par un module ACTIF explicitement acquis par l'entreprise ? (OU avec
-- permissionIncluseDansOffre côté code : ne retire jamais un accès existant.)
create or replace function public.acces_module_pour_permission(
  p_entreprise_id uuid,
  p_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.modules_entreprises me
    join public.modules_gestion_pro m on m.code = me.module_code
    where me.entreprise_id = p_entreprise_id
      and me.actif
      and me.valide_du <= current_date
      and (me.valide_jusqu is null or me.valide_jusqu >= current_date)
      and m.statut_catalogue = 'actif'
      and m.permissions_couvertes && coalesce(p_permissions, '{}')
  );
$$;

-- Vue consolidée pour l'UI abonnement.
create or replace function public.modules_entreprise_etat(p_entreprise_id uuid)
returns table(
  module_code text,
  nom text,
  description text,
  categorie text,
  statut_catalogue text,
  ordre integer,
  mode_apres_desactivation text,
  inclus_plan boolean,
  entitlement_actif boolean,
  origine text,
  valide_du date,
  valide_jusqu date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offre text;
  v_plan text;
begin
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select nullif(btrim(lower(abonnement_offre)), '') into v_offre
  from public.entreprises where id = p_entreprise_id;
  v_plan := case v_offre when 'essentiel' then 'mini' when 'premium' then 'business'
                         when null then 'mini' else coalesce(v_offre, 'mini') end;
  return query
    select m.code, m.nom, m.description, m.categorie, m.statut_catalogue, m.ordre,
           m.mode_apres_desactivation,
           (m.statut_catalogue = 'actif' and v_plan = any(m.plans_inclus)) as inclus_plan,
           coalesce(me.actif, false)
             and coalesce(me.valide_du, current_date) <= current_date
             and (me.valide_jusqu is null or me.valide_jusqu >= current_date) as entitlement_actif,
           me.origine, me.valide_du, me.valide_jusqu
    from public.modules_gestion_pro m
    left join public.modules_entreprises me
      on me.module_code = m.code and me.entreprise_id = p_entreprise_id
    where m.statut_catalogue <> 'interne'
    order by m.ordre;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Mutation sécurisée (plateforme uniquement, AAL2) — prépare aussi R4 Stripe
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.plateforme_definir_module_entreprise(
  p_entreprise_id uuid,
  p_module_code text,
  p_actif boolean,
  p_origine text default 'admin',
  p_valide_du date default current_date,
  p_valide_jusqu date default null,
  p_reference_externe text default null,
  p_motif text default null,
  p_source text default 'admin_plateforme'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien jsonb;
  v_acteur uuid;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  perform public.plateforme_exiger_session_aal2();

  if not exists (select 1 from public.modules_gestion_pro where code = p_module_code) then
    raise exception 'Module inconnu' using errcode = 'P0002';
  end if;
  if p_origine not in ('plan','achat','offert','essai','admin','migration') then
    raise exception 'Origine invalide' using errcode = '22023';
  end if;
  if p_source not in ('admin_plateforme','stripe','systeme','plan') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;
  if p_valide_jusqu is not null and p_valide_jusqu < coalesce(p_valide_du, current_date) then
    raise exception 'Fenêtre de validité invalide' using errcode = '22023';
  end if;

  begin
    v_acteur := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  exception when others then v_acteur := null;
  end;

  select to_jsonb(me.*) into v_ancien
  from public.modules_entreprises me
  where me.entreprise_id = p_entreprise_id and me.module_code = p_module_code;

  insert into public.modules_entreprises as me (
    entreprise_id, module_code, actif, origine, plan_source, reference_externe,
    source, valide_du, valide_jusqu, motif, updated_at
  ) values (
    p_entreprise_id, p_module_code, p_actif, p_origine, null,
    nullif(btrim(p_reference_externe), ''), p_source,
    coalesce(p_valide_du, current_date), p_valide_jusqu,
    nullif(btrim(p_motif), ''), now()
  )
  on conflict (entreprise_id, module_code) do update
    set actif = excluded.actif,
        origine = excluded.origine,
        reference_externe = excluded.reference_externe,
        source = excluded.source,
        valide_du = excluded.valide_du,
        valide_jusqu = excluded.valide_jusqu,
        motif = excluded.motif,
        updated_at = now();

  insert into public.historique_modules_entreprises(
    entreprise_id, module_code, action, origine, source, reference_externe,
    ancien, nouveau, acteur_id, motif
  ) values (
    p_entreprise_id, p_module_code,
    case when p_actif then 'active' else 'desactive' end,
    p_origine, p_source, nullif(btrim(p_reference_externe), ''),
    v_ancien,
    jsonb_build_object('actif', p_actif, 'origine', p_origine,
                       'valide_du', coalesce(p_valide_du, current_date),
                       'valide_jusqu', p_valide_jusqu),
    v_acteur, nullif(btrim(p_motif), '')
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ACL des fonctions (aligné sur la réconciliation ACL canonique)
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.module_gestion_pro_actif_entreprise(uuid, text) from public, anon;
revoke all on function public.a_acces_module_gestion_pro(uuid, text, text)     from public, anon;
revoke all on function public.acces_module_pour_permission(uuid, text[])        from public, anon;
revoke all on function public.modules_entreprise_etat(uuid)                     from public, anon, service_role;
revoke all on function public.plateforme_definir_module_entreprise(uuid, text, boolean, text, date, date, text, text, text)
  from public, anon, service_role;

grant execute on function public.module_gestion_pro_actif_entreprise(uuid, text) to authenticated;
grant execute on function public.a_acces_module_gestion_pro(uuid, text, text)     to authenticated;
grant execute on function public.acces_module_pour_permission(uuid, text[])        to authenticated;
grant execute on function public.modules_entreprise_etat(uuid)                     to authenticated;
grant execute on function public.plateforme_definir_module_entreprise(uuid, text, boolean, text, date, date, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
