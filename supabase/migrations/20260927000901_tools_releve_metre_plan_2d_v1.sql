-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 5 — PLAN 2D (BUILDING EDITOR FOUNDATION V1)
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT5_PLAN_2D_V1.md
--
-- Posée APRÈS le Lot 4 (20260927000801). Plage 9xx réservée au Lot 5.
--
-- Strictement ADDITIF par rapport à 601–801 (aucune ligne existante invalidée, aucune donnée migrée,
-- aucune garde existante affaiblie) :
--   1. `tools_releves_plans` : plan 2D d'un ÉTAGE dans un état documenté (initial / corrige / projete /
--      as_built — mêmes valeurs que les versions du relevé). Numéroté par étage, dérivé d'un plan de
--      base, révision optimiste (conflit détecté), cadre (repère des ancres photo `plan` normalisées),
--      contours de pièces (géométrie associée aux pièces métier du Lot 3, surface calculée par le
--      SERVEUR). Un plan FIGÉ est immuable : on en dérive un plan corrigé / projeté / as built.
--   2. `tools_releves_elements.plan_id` (facultatif) : murs et ouvertures appartiennent à un plan. Les
--      murs / ouvertures créés avant le Lot 5 (plan_id nul) sont adoptés par le plan initial de l'étage.
--   3. Gardes : élément et plan cohérents (même étage, ouverture dans le plan de son mur) ; plan figé →
--      ni création, ni modification de ses éléments (seule la suppression douce EN CASCADE d'un parent,
--      et la restauration, restent possibles) ; colonnes du plan immuables.
--   4. RPC SECURITY DEFINER à contrôle explicite (`tools_releve_peut(…, 'edit')`) — seule voie d'écriture
--      des plans (aucun droit INSERT / UPDATE direct pour `authenticated`) :
--        `tools_releve_plan_creer`       création (initial unique et premier ; dérivé = copie du plan de base) ;
--        `tools_releve_plan_enregistrer` sauvegarde atomique par lot (murs, ouvertures, suppressions,
--                                        contours, cadre, réglages) avec révision attendue (40001 si conflit) ;
--        `tools_releve_plan_figer`       gel + empreinte SHA-256 + version du relevé quand la chaîne le permet.
--   5. Cascade : la suppression douce (et la restauration) d'un étage emporte ses plans.
--   6. Versions du relevé : l'instantané (`tools_releve_creer_version`) inclut désormais les plans.
--   7. Journal : entité `plan` (création, modification, gel) — identifiants et compteurs seulement.
-- RGPD : `entreprise_id` présent → export et purge génériques (20260926000505, 20260923000331).
-- Miroir TypeScript : packages/releve-domain/src/plan.ts (parité testée : sql-parity.test.ts).

-- ── 0. Journal : entité « plan » ─────────────────────────────────────────────
alter table public.tools_releves_journal drop constraint if exists tools_releves_journal_entite_check;
alter table public.tools_releves_journal add constraint tools_releves_journal_entite_check
  check (entite in ('releve','chantier','batiment','etage','zone','piece','element','media','version','plan'));

-- ── 1. Validateurs (purs, utilisés par les CHECK) ─────────────────────────────
-- Point du repère étage, en millimètres, borné à ±1 km (RELEVE_COORDINATE_LIMIT_MM).
create or replace function public.tools_releve_plan_point_valide(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p) = 'object'
    and jsonb_typeof(p->'x') = 'number' and jsonb_typeof(p->'y') = 'number'
    and abs((p->>'x')::numeric) <= 1000000 and abs((p->>'y')::numeric) <= 1000000, false);
$$;

-- Cadre : rectangle du repère étage sur lequel sont normalisées les ancres photo `plan` (0–1).
create or replace function public.tools_releve_plan_cadre_valide(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p) = 'object'
    and jsonb_typeof(p->'minX') = 'number' and jsonb_typeof(p->'minY') = 'number'
    and jsonb_typeof(p->'maxX') = 'number' and jsonb_typeof(p->'maxY') = 'number'
    and (p->>'maxX')::numeric - (p->>'minX')::numeric >= 100
    and (p->>'maxY')::numeric - (p->>'minY')::numeric >= 100
    and abs((p->>'minX')::numeric) <= 1000000 and abs((p->>'maxX')::numeric) <= 1000000
    and abs((p->>'minY')::numeric) <= 1000000 and abs((p->>'maxY')::numeric) <= 1000000, false);
$$;

-- Contours de pièces : [{ pieceId, points[3..1000], murIds?[], graine?, surfaceMm2? }], une pièce au plus une fois.
create or replace function public.tools_releve_plan_contours_valides(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare v_c jsonb; v_pieces text[] := '{}';
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 500 then return false; end if;
  for v_c in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_c) <> 'object' then return false; end if;
    if coalesce(v_c->>'pieceId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    if (v_c->>'pieceId') = any(v_pieces) then return false; end if;
    v_pieces := v_pieces || (v_c->>'pieceId');
    if jsonb_typeof(v_c->'points') <> 'array' or jsonb_array_length(v_c->'points') not between 3 and 1000 then return false; end if;
    if exists (select 1 from jsonb_array_elements(v_c->'points') pt where not public.tools_releve_plan_point_valide(pt)) then return false; end if;
    if v_c ? 'murIds' and (jsonb_typeof(v_c->'murIds') <> 'array' or exists (
      select 1 from jsonb_array_elements(v_c->'murIds') m
      where jsonb_typeof(m) <> 'string' or (m #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then return false; end if;
    if v_c ? 'graine' and v_c->'graine' <> 'null'::jsonb and not public.tools_releve_plan_point_valide(v_c->'graine') then return false; end if;
  end loop;
  return true;
end;
$$;

-- Aire (mm²) d'un contour par la formule du lacet — même calcul que `polygonArea` d'Engine B.
create or replace function public.tools_releve_plan_surface(p_points jsonb)
returns numeric language sql immutable set search_path = public as $$
  with pts as (
    select (e.value->>'x')::numeric as x, (e.value->>'y')::numeric as y, e.ordinality as i, count(*) over () as n
    from jsonb_array_elements(p_points) with ordinality e
  )
  select round(abs(coalesce(sum(a.x * b.y - b.x * a.y), 0)) / 2, 1)
  from pts a join pts b on b.i = case when a.i = a.n then 1 else a.i + 1 end;
$$;

-- ── 2. Table des plans ───────────────────────────────────────────────────────
create table public.tools_releves_plans (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  etage_id uuid not null,
  etat_documente text not null check (etat_documente in ('initial','corrige','projete','as_built')),
  numero integer not null check (numero between 1 and 1000),
  plan_base_id uuid,
  libelle text check (libelle is null or char_length(libelle) <= 200),
  cadre jsonb not null default '{"minX":0,"minY":0,"maxX":20000,"maxY":15000}'::jsonb
    check (public.tools_releve_plan_cadre_valide(cadre)),
  reglages jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reglages) = 'object' and pg_column_size(reglages) <= 8000),
  contours jsonb not null default '[]'::jsonb
    check (pg_column_size(contours) <= 1048576 and public.tools_releve_plan_contours_valides(contours)),
  revision bigint not null default 1 check (revision > 0),
  fige_le timestamptz,
  fige_par uuid references public.utilisateurs(id) on delete set null,
  version_id uuid,
  empreinte text check (empreinte is null or empreinte ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (etage_id, releve_id) references public.tools_releves_etages(id, releve_id) on delete cascade,
  foreign key (plan_base_id, releve_id) references public.tools_releves_plans(id, releve_id),
  foreign key (version_id, releve_id) references public.tools_releves_versions(id, releve_id),
  unique (id, releve_id),
  unique (etage_id, numero),
  check (etat_documente <> 'initial' or plan_base_id is null),
  check ((fige_le is null) = (empreinte is null)),
  check (fige_le is not null or version_id is null)
);
create index tools_releves_plans_releve_idx on public.tools_releves_plans (releve_id);
create index tools_releves_plans_base_idx on public.tools_releves_plans (plan_base_id) where plan_base_id is not null;
-- Un seul plan MODIFIABLE par étage et par état : on corrige un plan figé en en dérivant un nouveau.
create unique index tools_releves_plans_modifiable_unique
  on public.tools_releves_plans (etage_id, etat_documente) where deleted_at is null and fige_le is null;
-- Le plan initial est unique par étage (comme la version initiale d'un relevé).
create unique index tools_releves_plans_initial_unique
  on public.tools_releves_plans (etage_id) where etat_documente = 'initial';

-- ── 3. Murs et ouvertures rattachés à un plan ─────────────────────────────────
alter table public.tools_releves_elements
  add column plan_id uuid,
  add constraint tools_releves_elements_plan_fkey
    foreign key (plan_id, releve_id) references public.tools_releves_plans(id, releve_id) on delete cascade,
  add constraint tools_releves_elements_plan_type check (plan_id is null or type in ('mur','ouverture'));
create index tools_releves_elements_plan_idx on public.tools_releves_elements (plan_id) where plan_id is not null;

-- ── 4. Gardes ────────────────────────────────────────────────────────────────
-- Métadonnées d'écriture ignorées pour comparer un contenu figé.
create or replace function public.tools_releve_plan_sans_meta(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select p - array['revision','updated_at','updated_by','deleted_at','deleted_by'];
$$;

-- Plan : colonnes d'identité immuables ; gel à sens unique ; plan figé immuable (suppression douce
-- seulement en cascade de son étage, restauration libre). S'exécute après `_avant_ecriture`.
create or replace function public.tools_releve_plan_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.fige_le is not null or new.version_id is not null or new.empreinte is not null then
      raise exception 'Un plan ne peut pas être créé figé' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.etage_id <> old.etage_id or new.etat_documente <> old.etat_documente or new.numero <> old.numero
     or new.plan_base_id is distinct from old.plan_base_id then
    raise exception 'Colonnes immuables du plan' using errcode = '42501';
  end if;
  if old.fige_le is null then
    return new;  -- gel éventuel : fige_le / empreinte posés ensemble (CHECK), par tools_releve_plan_figer
  end if;
  -- Plan figé.
  if new.fige_le is distinct from old.fige_le or new.fige_par is distinct from old.fige_par
     or new.empreinte is distinct from old.empreinte
     or (old.version_id is not null and new.version_id is distinct from old.version_id) then
    raise exception 'Plan figé : le gel est définitif' using errcode = '42501';
  end if;
  if public.tools_releve_plan_sans_meta(to_jsonb(new)) - 'version_id' <> public.tools_releve_plan_sans_meta(to_jsonb(old)) - 'version_id' then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null
     and not exists (select 1 from public.tools_releves_etages e where e.id = old.etage_id and e.deleted_at is not null) then
    raise exception 'Plan figé : il ne peut pas être supprimé' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Élément de plan : même étage que le plan, ouverture dans le plan de son mur, plan actif ; plan
-- figé → aucune création ni modification (suppression douce seulement en cascade d'un parent).
create or replace function public.tools_releve_element_plan_garde()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_parent_plan uuid; v_parent_supprime boolean;
begin
  if tg_op = 'UPDATE' and old.plan_id is not null and new.plan_id is distinct from old.plan_id then
    raise exception 'Un élément de plan ne change pas de plan' using errcode = '42501';
  end if;
  if new.type = 'ouverture' and new.parent_element_id is not null then
    select m.plan_id into v_parent_plan from public.tools_releves_elements m where m.id = new.parent_element_id;
    if v_parent_plan is distinct from new.plan_id then
      raise exception 'Une ouverture appartient au plan de son mur' using errcode = '42501';
    end if;
  end if;
  if new.plan_id is null then return new; end if;

  select * into v_plan from public.tools_releves_plans p where p.id = new.plan_id;
  if v_plan.etage_id <> new.etage_id then
    raise exception 'Un élément de plan est sur l''étage de son plan' using errcode = '42501';
  end if;
  if v_plan.fige_le is null then
    if (tg_op = 'INSERT' or old.plan_id is null) and v_plan.deleted_at is not null then
      raise exception 'Plan supprimé' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Plan figé.
  if tg_op = 'INSERT' or old.plan_id is null then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  if public.tools_releve_plan_sans_meta(to_jsonb(new)) <> public.tools_releve_plan_sans_meta(to_jsonb(old)) then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    v_parent_supprime :=
      exists (select 1 from public.tools_releves_etages e where e.id = new.etage_id and e.deleted_at is not null)
      or exists (select 1 from public.tools_releves_pieces p where p.id = new.piece_id and p.deleted_at is not null)
      or exists (select 1 from public.tools_releves_elements m where m.id = new.parent_element_id and m.deleted_at is not null)
      or v_plan.deleted_at is not null;
    if not v_parent_supprime then
      raise exception 'Plan figé : ses murs et ouvertures ne se suppriment pas' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Étage supprimé / restauré → ses plans (même horodatage, restauration symétrique).
create or replace function public.tools_releve_plan_cascade_etage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not distinct from old.deleted_at then return null; end if;
  update public.tools_releves_plans set deleted_at = new.deleted_at
  where etage_id = new.id
    and (case when new.deleted_at is not null then deleted_at is null else deleted_at = old.deleted_at end);
  return null;
end;
$$;

-- Métadonnées serveur (entreprise, révision, auteur) : trigger générique des tables filles.
create trigger tools_releves_plans_avant_ecriture before insert or update on public.tools_releves_plans
  for each row execute function public.tools_releve_enfant_avant_ecriture();
create trigger tools_releves_plans_garde before insert or update on public.tools_releves_plans
  for each row execute function public.tools_releve_plan_garde();
create trigger tools_releves_elements_plan_garde before insert or update on public.tools_releves_elements
  for each row execute function public.tools_releve_element_plan_garde();
create trigger tools_releves_etages_cascade_plans after update of deleted_at on public.tools_releves_etages
  for each row execute function public.tools_releve_plan_cascade_etage();

-- ── 5. Contenu canonique d'un plan (empreinte du gel, export) ─────────────────
create or replace function public.tools_releve_plan_contenu(p_plan_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', jsonb_build_object('id', p.id, 'releve_id', p.releve_id, 'etage_id', p.etage_id,
      'etat_documente', p.etat_documente, 'numero', p.numero, 'plan_base_id', p.plan_base_id,
      'cadre', p.cadre, 'contours', p.contours),
    'murs', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'piece_id', x.piece_id, 'donnees', x.donnees) order by x.id)
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'mur' and x.deleted_at is null), '[]'::jsonb),
    'ouvertures', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'mur_id', x.parent_element_id, 'donnees', x.donnees) order by x.id)
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'ouverture' and x.deleted_at is null), '[]'::jsonb))
  from public.tools_releves_plans p where p.id = p_plan_id;
$$;

-- ── 6. Création ──────────────────────────────────────────────────────────────
create or replace function public.tools_releve_plan_creer(
  p_etage_id uuid, p_etat text default 'initial', p_plan_base_id uuid default null, p_libelle text default null
)
returns public.tools_releves_plans
language plpgsql security definer set search_path = public as $$
declare
  v_etage public.tools_releves_etages; v_base public.tools_releves_plans; v_plan public.tools_releves_plans;
  v_numero integer; v_map jsonb := '{}'::jsonb; v_id uuid; r record; v_adoptes integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_etage from public.tools_releves_etages e where e.id = p_etage_id;
  if v_etage.id is null or not public.tools_releve_peut(v_etage.releve_id, 'edit') then
    raise exception 'Création de plan non autorisée' using errcode = '42501';
  end if;
  if v_etage.deleted_at is not null then raise exception 'Étage supprimé : restaurez-le d''abord' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('initial','corrige','projete','as_built') then
    raise exception 'État de plan inconnu : %', p_etat using errcode = '22023';
  end if;
  -- Numérotation sérialisée par étage.
  perform 1 from public.tools_releves_etages e where e.id = p_etage_id for update;
  select coalesce(max(numero), 0) + 1 into v_numero from public.tools_releves_plans where etage_id = p_etage_id;

  if p_etat = 'initial' then
    if v_numero > 1 then raise exception 'Le plan initial est unique et toujours le premier de l''étage' using errcode = '23505'; end if;
    if p_plan_base_id is not null then raise exception 'Un plan initial n''a pas de plan de base' using errcode = '22023'; end if;
  else
    if v_numero = 1 then raise exception 'Créez d''abord le plan initial de l''étage' using errcode = '22023'; end if;
    select * into v_base from public.tools_releves_plans p
    where p.id = coalesce(p_plan_base_id, (select q.id from public.tools_releves_plans q
                                            where q.etage_id = p_etage_id and q.deleted_at is null order by q.numero desc limit 1))
      and p.etage_id = p_etage_id and p.deleted_at is null;
    if v_base.id is null then raise exception 'Plan de base introuvable sur cet étage' using errcode = '42501'; end if;
  end if;
  if exists (select 1 from public.tools_releves_plans p where p.etage_id = p_etage_id and p.etat_documente = p_etat
             and p.fige_le is null and p.deleted_at is null) then
    raise exception 'Un plan modifiable dans cet état existe déjà pour l''étage' using errcode = '23505';
  end if;

  insert into public.tools_releves_plans (releve_id, etage_id, etat_documente, numero, plan_base_id, libelle, cadre, reglages)
  values (v_etage.releve_id, p_etage_id, p_etat, v_numero, v_base.id, nullif(btrim(p_libelle), ''),
          coalesce(v_base.cadre, '{"minX":0,"minY":0,"maxX":20000,"maxY":15000}'::jsonb), coalesce(v_base.reglages, '{}'::jsonb))
  returning * into v_plan;

  if p_etat = 'initial' then
    -- Adoption des murs / ouvertures relevés avant le Lot 5 (sans plan) : murs d'abord.
    update public.tools_releves_elements set plan_id = v_plan.id
    where etage_id = p_etage_id and type = 'mur' and plan_id is null and deleted_at is null;
    get diagnostics v_adoptes = row_count;
    update public.tools_releves_elements o set plan_id = v_plan.id
    where o.etage_id = p_etage_id and o.type = 'ouverture' and o.plan_id is null and o.deleted_at is null
      and exists (select 1 from public.tools_releves_elements m where m.id = o.parent_element_id and m.plan_id = v_plan.id);
  else
    -- Copie du plan de base : nouveaux identifiants, lignée `origineId` (photos rattachées aux murs d'origine).
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'mur' and x.deleted_at is null order by x.id loop
      v_id := gen_random_uuid();
      v_map := v_map || jsonb_build_object(r.id::text, v_id::text);
      insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, plan_id, schema_version, donnees)
      values (v_id, r.releve_id, 'mur', r.etage_id, r.piece_id, v_plan.id, r.schema_version,
              r.donnees || jsonb_build_object('origineId', r.id::text));
    end loop;
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'ouverture' and x.deleted_at is null
               and v_map ? x.parent_element_id::text order by x.id loop
      insert into public.tools_releves_elements (releve_id, type, etage_id, piece_id, parent_element_id, plan_id, schema_version, donnees)
      values (r.releve_id, 'ouverture', r.etage_id, r.piece_id, (v_map->>r.parent_element_id::text)::uuid, v_plan.id, r.schema_version,
              r.donnees || jsonb_build_object('origineId', r.id::text));
    end loop;
    update public.tools_releves_plans set contours = coalesce((
      select jsonb_agg(c.value || jsonb_build_object('murIds', coalesce((
        select jsonb_agg(v_map->(m #>> '{}')) from jsonb_array_elements(coalesce(c.value->'murIds', '[]'::jsonb)) m
        where v_map ? (m #>> '{}')), '[]'::jsonb)) order by c.ordinality)
      from jsonb_array_elements(v_base.contours) with ordinality c), '[]'::jsonb)
    where id = v_plan.id;
  end if;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'creation', array['etat_documente','numero'], auth.uid(),
          jsonb_build_object('etage_id', p_etage_id, 'numero', v_numero, 'plan_base_id', v_base.id, 'adoptes', v_adoptes));
  select * into v_plan from public.tools_releves_plans where id = v_plan.id;
  return v_plan;
end;
$$;

-- ── 7. Enregistrement par lot (autosave) ─────────────────────────────────────
-- p_modifications = {
--   murs:        [{ id, pieceId?, donnees: { a, b, epaisseurMm, hauteurMm, typeMur, origineId? } }]   (création ou mise à jour)
--   ouvertures:  [{ id, murId, donnees: { decalageMm, largeurMm, hauteurMm, allegeMm, typeOuverture, sens } }]
--   supprimes:   [id…]  (murs ou ouvertures du plan ; un mur emporte ses ouvertures)
--   contours:    [{ pieceId, points, murIds?, graine? }] | absent  (remplace l'ensemble ; surface recalculée ici)
--   cadre:       { minX, minY, maxX, maxY } | absent
--   reglages:    { … } | absent
-- }
-- Révision attendue ≠ révision du plan → 40001 (conflit : rien n'est écrit).
create or replace function public.tools_releve_plan_enregistrer(p_plan_id uuid, p_revision bigint, p_modifications jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan public.tools_releves_plans; v_mods jsonb := coalesce(p_modifications, '{}'::jsonb);
  v_item jsonb; v_id uuid; v_piece uuid; v_existant public.tools_releves_elements; v_mur public.tools_releves_elements;
  v_longueur numeric; v_murs integer := 0; v_ouvertures integer := 0; v_supprimes integer := 0;
  v_contours jsonb; v_champs text[] := '{}'; v_n integer;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if jsonb_typeof(v_mods) <> 'object' then raise exception 'Modifications invalides' using errcode = '22023'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null then raise exception 'Plan supprimé' using errcode = '42501'; end if;
  if v_plan.fige_le is not null then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  if v_plan.revision <> p_revision then
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été écrasé' using errcode = '40001', detail = v_plan.revision::text;
  end if;
  if jsonb_array_length(coalesce(v_mods->'murs', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(v_mods->'ouvertures', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(v_mods->'supprimes', '[]'::jsonb)) > 10000 then
    raise exception 'Lot trop volumineux' using errcode = '22023';
  end if;

  -- Murs.
  for v_item in select value from jsonb_array_elements(coalesce(v_mods->'murs', '[]'::jsonb)) loop
    v_id := (v_item->>'id')::uuid;
    v_piece := nullif(v_item->>'pieceId', '')::uuid;
    if not public.tools_releve_plan_point_valide(v_item->'donnees'->'a') or not public.tools_releve_plan_point_valide(v_item->'donnees'->'b')
       or ((v_item->'donnees'->'a'->>'x')::numeric = (v_item->'donnees'->'b'->>'x')::numeric
           and (v_item->'donnees'->'a'->>'y')::numeric = (v_item->'donnees'->'b'->>'y')::numeric) then
      raise exception 'Mur invalide (extrémités) : %', v_id using errcode = '22023';
    end if;
    if jsonb_typeof(v_item->'donnees'->'epaisseurMm') <> 'number' or (v_item->'donnees'->>'epaisseurMm')::numeric > 2000
       or (jsonb_typeof(v_item->'donnees'->'hauteurMm') = 'number' and (v_item->'donnees'->>'hauteurMm')::numeric not between 500 and 20000) then
      raise exception 'Mur invalide (épaisseur ou hauteur) : %', v_id using errcode = '22023';
    end if;
    if v_piece is not null and not exists (select 1 from public.tools_releves_pieces p where p.id = v_piece and p.etage_id = v_plan.etage_id) then
      raise exception 'Pièce hors de l''étage du plan' using errcode = '42501';
    end if;
    select * into v_existant from public.tools_releves_elements x where x.id = v_id;
    if v_existant.id is null then
      insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, plan_id, donnees)
      values (v_id, v_plan.releve_id, 'mur', v_plan.etage_id, v_piece, v_plan.id, v_item->'donnees');
      v_murs := v_murs + 1;
    else
      if v_existant.plan_id is distinct from v_plan.id or v_existant.type <> 'mur' then
        raise exception 'Élément étranger au plan : %', v_id using errcode = '42501';
      end if;
      if v_existant.donnees is distinct from v_item->'donnees' or v_existant.piece_id is distinct from v_piece or v_existant.deleted_at is not null then
        update public.tools_releves_elements set donnees = v_item->'donnees', piece_id = v_piece, deleted_at = null where id = v_id;
        v_murs := v_murs + 1;
      end if;
    end if;
  end loop;

  -- Ouvertures (après les murs : un mur créé dans le même lot peut les héberger).
  for v_item in select value from jsonb_array_elements(coalesce(v_mods->'ouvertures', '[]'::jsonb)) loop
    v_id := (v_item->>'id')::uuid;
    select * into v_mur from public.tools_releves_elements m
    where m.id = (v_item->>'murId')::uuid and m.plan_id = v_plan.id and m.type = 'mur' and m.deleted_at is null;
    if v_mur.id is null then raise exception 'Mur hôte absent du plan : %', v_item->>'murId' using errcode = '42501'; end if;
    v_longueur := sqrt(((v_mur.donnees->'b'->>'x')::numeric - (v_mur.donnees->'a'->>'x')::numeric) ^ 2
                     + ((v_mur.donnees->'b'->>'y')::numeric - (v_mur.donnees->'a'->>'y')::numeric) ^ 2);
    if jsonb_typeof(v_item->'donnees'->'decalageMm') <> 'number' or jsonb_typeof(v_item->'donnees'->'largeurMm') <> 'number'
       or (v_item->'donnees'->>'decalageMm')::numeric + (v_item->'donnees'->>'largeurMm')::numeric > v_longueur + 1 then
      raise exception 'Ouverture hors de son mur : %', v_id using errcode = '22023';
    end if;
    select * into v_existant from public.tools_releves_elements x where x.id = v_id;
    if v_existant.id is null then
      insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, parent_element_id, plan_id, donnees)
      values (v_id, v_plan.releve_id, 'ouverture', v_plan.etage_id, v_mur.piece_id, v_mur.id, v_plan.id, v_item->'donnees');
      v_ouvertures := v_ouvertures + 1;
    else
      if v_existant.plan_id is distinct from v_plan.id or v_existant.type <> 'ouverture' then
        raise exception 'Élément étranger au plan : %', v_id using errcode = '42501';
      end if;
      if v_existant.donnees is distinct from v_item->'donnees' or v_existant.parent_element_id <> v_mur.id or v_existant.deleted_at is not null then
        update public.tools_releves_elements set donnees = v_item->'donnees', parent_element_id = v_mur.id, deleted_at = null where id = v_id;
        v_ouvertures := v_ouvertures + 1;
      end if;
    end if;
  end loop;

  -- Suppressions (douces, restaurables : la cascade Lot 2 emporte les ouvertures d'un mur).
  if jsonb_typeof(v_mods->'supprimes') = 'array' then
    update public.tools_releves_elements set deleted_at = now()
    where plan_id = v_plan.id and deleted_at is null
      and id in (select (s #>> '{}')::uuid from jsonb_array_elements(v_mods->'supprimes') s);
    get diagnostics v_supprimes = row_count;
  end if;

  -- Contours : pièces du même étage, actives ; surface calculée ici (jamais celle du client).
  if v_mods ? 'contours' then
    if not public.tools_releve_plan_contours_valides(v_mods->'contours') then
      raise exception 'Contours de pièces invalides' using errcode = '22023';
    end if;
    select count(*) into v_n from jsonb_array_elements(v_mods->'contours') c
    where not exists (select 1 from public.tools_releves_pieces p where p.id = (c.value->>'pieceId')::uuid
                        and p.etage_id = v_plan.etage_id and p.deleted_at is null);
    if v_n > 0 then raise exception 'Contour rattaché à une pièce absente de l''étage' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(c.value || jsonb_build_object('surfaceMm2', public.tools_releve_plan_surface(c.value->'points')) order by c.ordinality), '[]'::jsonb)
      into v_contours from jsonb_array_elements(v_mods->'contours') with ordinality c;
    v_champs := v_champs || 'contours'::text;
  else
    v_contours := v_plan.contours;
  end if;
  if v_mods ? 'cadre' then v_champs := v_champs || 'cadre'::text; end if;
  if v_mods ? 'reglages' then v_champs := v_champs || 'reglages'::text; end if;
  if v_murs > 0 then v_champs := v_champs || 'murs'::text; end if;
  if v_ouvertures > 0 then v_champs := v_champs || 'ouvertures'::text; end if;
  if v_supprimes > 0 then v_champs := v_champs || 'supprimes'::text; end if;

  -- La révision du plan avance à chaque enregistrement : c'est elle qui détecte les conflits.
  update public.tools_releves_plans set
    contours = v_contours,
    cadre = case when v_mods ? 'cadre' then v_mods->'cadre' else cadre end,
    reglages = case when v_mods ? 'reglages' then v_mods->'reglages' else reglages end
  where id = v_plan.id
  returning * into v_plan;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', v_champs, auth.uid(),
          jsonb_build_object('murs', v_murs, 'ouvertures', v_ouvertures, 'supprimes', v_supprimes));

  return jsonb_build_object('revision', v_plan.revision, 'murs', v_murs, 'ouvertures', v_ouvertures,
                            'supprimes', v_supprimes, 'contours', v_plan.contours);
end;
$$;

-- ── 8. Gel ───────────────────────────────────────────────────────────────────
-- Fige le plan (immuable ensuite) avec l'empreinte SHA-256 de son contenu canonique. Crée aussi une
-- VERSION du relevé du même type quand la chaîne des versions le permet (initiale : aucune version
-- encore ; autres : une version initiale existe) ; sinon le plan est figé seul (version_id nul).
create or replace function public.tools_releve_plan_figer(p_plan_id uuid, p_revision bigint, p_libelle text default null)
returns public.tools_releves_plans
language plpgsql security definer set search_path = public, extensions as $$
declare v_plan public.tools_releves_plans; v_version public.tools_releves_versions; v_creer boolean;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null then raise exception 'Plan supprimé' using errcode = '42501'; end if;
  if v_plan.fige_le is not null then raise exception 'Plan déjà figé' using errcode = '42501'; end if;
  if v_plan.revision <> p_revision then
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été figé' using errcode = '40001', detail = v_plan.revision::text;
  end if;

  update public.tools_releves_plans set
    fige_le = now(), fige_par = auth.uid(),
    empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(p_plan_id)::text, 'UTF8'), 'sha256'), 'hex'),
    libelle = coalesce(nullif(btrim(p_libelle), ''), libelle)
  where id = p_plan_id;

  v_creer := case when v_plan.etat_documente = 'initial'
    then not exists (select 1 from public.tools_releves_versions v where v.releve_id = v_plan.releve_id)
    else exists (select 1 from public.tools_releves_versions v where v.releve_id = v_plan.releve_id and v.type_version = 'initial') end;
  if v_creer then
    v_version := public.tools_releve_creer_version(v_plan.releve_id, coalesce(nullif(btrim(p_libelle), ''), 'Plan figé'), v_plan.etat_documente, null);
    update public.tools_releves_plans set version_id = v_version.id where id = p_plan_id;
  end if;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'version', array['fige_le'], auth.uid(),
          jsonb_build_object('version_id', v_version.id));
  select * into v_plan from public.tools_releves_plans where id = p_plan_id;
  return v_plan;
end;
$$;

-- ── 9. Versions du relevé : l'instantané inclut les plans ─────────────────────
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
    'medias', coalesce((select jsonb_agg(to_jsonb(m) order by m.categorie, m.id) from public.tools_releves_medias m where m.releve_id = p_releve_id and m.deleted_at is null), '[]'::jsonb),
    -- Lot 5 : plans 2D (murs et ouvertures sont déjà dans `elements`, avec leur plan_id).
    'plans', coalesce((select jsonb_agg(to_jsonb(pl) order by pl.etage_id, pl.numero) from public.tools_releves_plans pl where pl.releve_id = p_releve_id and pl.deleted_at is null), '[]'::jsonb)
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

-- ── 10. RLS et droits ────────────────────────────────────────────────────────
alter table public.tools_releves_plans enable row level security;
create policy tools_releves_plans_select on public.tools_releves_plans
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
-- Lecture seule pour les utilisateurs : toute écriture passe par les RPC ci-dessus (contrôle explicite).
revoke all on public.tools_releves_plans from public, anon, authenticated;
grant select on public.tools_releves_plans to authenticated;
grant select, insert, update, delete on public.tools_releves_plans to service_role;

revoke all on function public.tools_releve_plan_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_element_plan_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_plan_cascade_etage() from public, anon, authenticated;
revoke all on function public.tools_releve_plan_contenu(uuid) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_creer(uuid, text, uuid, text) from public, anon;
revoke all on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) from public, anon;
revoke all on function public.tools_releve_plan_figer(uuid, bigint, text) from public, anon;
revoke all on function public.tools_releve_creer_version(uuid, text, text, uuid) from public, anon;
grant execute on function public.tools_releve_plan_creer(uuid, text, uuid, text) to authenticated;
grant execute on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) to authenticated;
grant execute on function public.tools_releve_plan_figer(uuid, bigint, text) to authenticated;
grant execute on function public.tools_releve_creer_version(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
