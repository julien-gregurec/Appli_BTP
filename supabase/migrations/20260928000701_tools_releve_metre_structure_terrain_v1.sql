-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 3 — STRUCTURE TERRAIN & RELEVÉ MÉTIER V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT3_STRUCTURE_TERRAIN_V1.md
--
-- Complète la hiérarchie du Lot 2 (601–604) pour le relevé de terrain réel. ADDITIF : aucune
-- colonne retirée, chaque ancienne valeur d'énumération reste admise, aucune donnée perdue.
--   1. Chantier : client, référence, description, date, statut, lien client GP (préparé).
--   2. Étage : catégorie de niveau (sous-sol, RDC, étage, entresol, combles…) ; `niveau` devient
--      FACULTATIF et DÉCIMAL (demi-niveau, combles sans numéro) ; altitude déjà présente.
--   3. Zone : types terrain (aile, secteur, appartement, plateau, zone technique).
--   4. Pièce : types (circulation, local technique, stockage), commentaire, statut, surface
--      déclarée (préparation surfaces / volumes avant la géométrie du lot 5).
--   5. Parents : seuls les déplacements cohérents sont permis (pièce ↔ zone du même étage,
--      étage ↔ bâtiment, bâtiment ↔ chantier du même relevé) ; zone et pièce ne changent pas d'étage.
--   6. Audit : actions `renommage`, `deplacement`, `reordre`, `duplication` en plus des existantes.
--   7. RPC SECURITY INVOKER (la RLS s'applique) : réordonner, dupliquer, rechercher.
-- Miroir TypeScript : packages/releve-domain (parité : sql-parity.test.ts).

-- ── 1. Chantier ──────────────────────────────────────────────────────────────
alter table public.tools_releves_chantiers
  add column client_nom text check (client_nom is null or char_length(client_nom) <= 180),
  add column client_gp_id uuid references public.clients(id) on delete set null,
  add column reference text check (reference is null or char_length(reference) <= 80),
  add column description text check (description is null or char_length(description) <= 4000),
  add column date_releve date,
  add column statut text not null default 'en_cours' check (statut in ('a_planifier','en_cours','termine','archive'));
create index tools_releves_chantiers_client_gp_idx on public.tools_releves_chantiers (client_gp_id) where client_gp_id is not null;

-- Lien client GP d'un chantier : même règle que le projet (même entreprise, permission GP
-- `acces_clients` pour poser un nouveau lien ; recopier celui du projet ne la redemande pas).
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
  if new.client_gp_id is not null and (tg_op = 'INSERT' or new.client_gp_id is distinct from old.client_gp_id) then
    if not exists (select 1 from public.clients c where c.id = new.client_gp_id and c.entreprise_id = new.entreprise_id) then
      raise exception 'Client Gestion Pro introuvable dans cette entreprise' using errcode = '42501';
    end if;
    if auth.uid() is not null
       and not exists (select 1 from public.tools_releves r where r.id = new.releve_id and r.client_gp_id = new.client_gp_id)
       and not public.a_permission(new.entreprise_id, 'acces_clients') then
      raise exception 'Lien client : permission Gestion Pro « acces_clients » requise' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ── 2. Étage ─────────────────────────────────────────────────────────────────
alter table public.tools_releves_etages
  add column categorie_niveau text not null default 'etage'
    check (categorie_niveau in ('sous_sol','rdc','entresol','etage','combles','toiture','exterieur','autre'));
-- Catégorie déduite pour les étages existants (même lecture que `niveauLabel` du Lot 2).
update public.tools_releves_etages set categorie_niveau = case when niveau < 0 then 'sous_sol' when niveau = 0 then 'rdc' else 'etage' end;
-- `niveau` : facultatif et décimal (demi-niveau, combles non numérotés). Bornes inchangées.
alter table public.tools_releves_etages
  alter column niveau type numeric(5,1) using niveau::numeric(5,1),
  alter column niveau drop not null;

-- ── 3. Zone ──────────────────────────────────────────────────────────────────
alter table public.tools_releves_zones drop constraint if exists tools_releves_zones_type_check;
alter table public.tools_releves_zones add constraint tools_releves_zones_type_check check (type in (
  'logement','lot','parties_communes','local_technique','exterieur','autre',
  'aile','secteur','appartement','plateau','zone_technique'
));
alter table public.tools_releves_zones
  add column commentaire text check (commentaire is null or char_length(commentaire) <= 4000);

-- ── 4. Pièce ─────────────────────────────────────────────────────────────────
alter table public.tools_releves_pieces drop constraint if exists tools_releves_pieces_usage_check;
alter table public.tools_releves_pieces add constraint tools_releves_pieces_usage_check check (usage in (
  'sejour','chambre','cuisine','salle_de_bain','salle_d_eau','wc','entree','degagement',
  'bureau','cellier','buanderie','garage','cave','combles','escalier','exterieur','autre',
  'circulation','local_technique','stockage'
));
alter table public.tools_releves_pieces
  add column commentaire text check (commentaire is null or char_length(commentaire) <= 4000),
  add column statut text not null default 'a_relever' check (statut in ('a_relever','en_cours','relevee','verifiee')),
  -- Surface DÉCLARÉE (saisie terrain) en mm², en attendant la surface calculée par la géométrie
  -- (lot 5) : la fiche pièce affiche l'une ou l'autre, jamais un mélange silencieux.
  add column surface_declaree_mm2 numeric(14,1) check (surface_declaree_mm2 is null or surface_declaree_mm2 between 1 and 1e12);

-- ── 5. Déplacements cohérents ────────────────────────────────────────────────
create or replace function public.tools_releve_parents_coherents()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'tools_releves_zones' and new.etage_id <> old.etage_id then
    raise exception 'Une zone ne change pas d''étage : dupliquez-la ou recréez-la' using errcode = '42501';
  end if;
  if tg_table_name = 'tools_releves_pieces' and new.etage_id <> old.etage_id then
    raise exception 'Une pièce ne change pas d''étage (ses éléments y sont rattachés)' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.tools_releve_parents_coherents() from public, anon, authenticated;
create trigger tools_releves_zones_parents before update on public.tools_releves_zones
  for each row execute function public.tools_releve_parents_coherents();
create trigger tools_releves_pieces_parents before update on public.tools_releves_pieces
  for each row execute function public.tools_releve_parents_coherents();

-- ── 6. Audit détaillé ────────────────────────────────────────────────────────
alter table public.tools_releves_journal drop constraint if exists tools_releves_journal_action_check;
alter table public.tools_releves_journal add constraint tools_releves_journal_action_check check (action in (
  'creation','modification','suppression','restauration','partage','transfert','version',
  'renommage','deplacement','reordre','duplication'
));

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
    if v_champs = '{}'::text[] then return null; end if; -- écriture sans changement : rien à tracer
    v_action := case
      when v_new->'deleted_at' is distinct from v_old->'deleted_at' then
        case when v_new->>'deleted_at' is null then 'restauration' else 'suppression' end
      when v_new->'visibilite' is distinct from v_old->'visibilite' then 'partage'
      when v_new->'proprietaire_id' is distinct from v_old->'proprietaire_id' then 'transfert'
      when v_champs && array['chantier_id','batiment_id','zone_id'] then 'deplacement'
      when v_champs = array['ordre'] then 'reordre'
      when v_champs = array['nom'] then 'renommage'
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

-- ── 7a. Réordonner des frères ────────────────────────────────────────────────
-- `p_ids` = TOUS les frères actifs, dans l'ordre voulu ; `ordre` devient leur rang (0..n-1).
-- Refuse un ensemble incomplet, mélangé (autre parent / autre relevé), dupliqué ou supprimé :
-- aucun réordre partiel ne peut casser une relation.
create or replace function public.tools_releve_reordonner(p_entite text, p_ids uuid[])
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_table text; v_parent text; v_releve uuid; v_parent_id uuid; v_zone uuid; v_count integer; v_nb_releves integer; v_nb_parents integer; v_siblings integer; v_modifies integer;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  v_table := case p_entite when 'chantier' then 'tools_releves_chantiers' when 'batiment' then 'tools_releves_batiments'
    when 'etage' then 'tools_releves_etages' when 'zone' then 'tools_releves_zones' when 'piece' then 'tools_releves_pieces' end;
  v_parent := case p_entite when 'chantier' then 'releve_id' when 'batiment' then 'chantier_id'
    when 'etage' then 'batiment_id' else 'etage_id' end;
  if v_table is null then raise exception 'Entité inconnue : %', p_entite using errcode = '22023'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'Liste vide ou dupliquée' using errcode = '22023';
  end if;
  execute format('select count(*), count(distinct releve_id), count(distinct %1$I), min(releve_id::text)::uuid, min(%1$I::text)::uuid, %2$s
                    from public.%3$I where id = any($1) and deleted_at is null',
                 v_parent, case when p_entite = 'piece' then 'min(zone_id::text)::uuid' else 'null::uuid' end, v_table)
    into v_count, v_nb_releves, v_nb_parents, v_releve, v_parent_id, v_zone using p_ids;
  if v_count <> array_length(p_ids, 1) or v_nb_releves <> 1 or v_nb_parents <> 1 then
    raise exception 'Éléments introuvables, supprimés ou de parents différents' using errcode = '22023';
  end if;
  -- Refus explicite plutôt qu'un réordre silencieusement ignoré par la RLS (profil consultation).
  if not public.tools_releve_peut(v_releve, 'edit') then
    raise exception 'Réordre non autorisé' using errcode = '42501';
  end if;
  if p_entite = 'piece' then
    -- Les pièces se réordonnent au sein de leur regroupement (même zone, ou sans zone).
    execute 'select count(*) from public.tools_releves_pieces where id = any($1) and zone_id is distinct from $2' into v_count using p_ids, v_zone;
    if v_count > 0 then raise exception 'Pièces de zones différentes' using errcode = '22023'; end if;
    execute 'select count(*) from public.tools_releves_pieces where etage_id = $1 and zone_id is not distinct from $2 and deleted_at is null'
      into v_siblings using v_parent_id, v_zone;
  else
    execute format('select count(*) from public.%I where %I = $1 and deleted_at is null', v_table, v_parent) into v_siblings using v_parent_id;
  end if;
  if v_siblings <> array_length(p_ids, 1) then
    raise exception 'La liste doit contenir tous les éléments du même niveau' using errcode = '22023';
  end if;
  execute format('update public.%I t set ordre = o.rang - 1 from unnest($1) with ordinality as o(id, rang)
                   where t.id = o.id and t.ordre is distinct from o.rang - 1', v_table) using p_ids;
  get diagnostics v_modifies = row_count;
  return v_modifies;
end;
$$;

-- ── 7b. Dupliquer bâtiment / étage / pièce ───────────────────────────────────
-- Le journal est en lecture seule pour `authenticated` : la ligne « duplication » est écrite par
-- ce helper SECURITY DEFINER, strictement borné (droit `edit` sur le relevé, copie ET source dans
-- ce relevé, copie créée dans la transaction courante) — aucune ligne d'audit arbitraire possible.
create or replace function public.tools_releve_journaliser_duplication(p_entite text, p_copie uuid, p_source uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_table text; v_releve uuid; v_entreprise uuid; v_cree timestamptz; v_source_releve uuid;
begin
  v_table := case p_entite when 'batiment' then 'tools_releves_batiments' when 'etage' then 'tools_releves_etages'
    when 'piece' then 'tools_releves_pieces' end;
  if v_table is null or auth.uid() is null then raise exception 'Trace de duplication refusée' using errcode = '42501'; end if;
  execute format('select releve_id, entreprise_id, created_at from public.%I where id = $1', v_table) into v_releve, v_entreprise, v_cree using p_copie;
  execute format('select releve_id from public.%I where id = $1', v_table) into v_source_releve using p_source;
  if v_releve is null or v_source_releve is distinct from v_releve or v_cree <> now()
     or not public.tools_releve_peut(v_releve, 'edit') then
    raise exception 'Trace de duplication refusée' using errcode = '42501';
  end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id)
  values (v_entreprise, v_releve, p_entite, p_copie, 'duplication', array['source:' || p_source::text], auth.uid());
end;
$$;

-- ── 7b bis. Dupliquer bâtiment / étage / pièce ───────────────────────────────────
-- Copie la STRUCTURE seulement (bâtiment → étages → zones → pièces ; étage → zones → pièces ;
-- pièce seule). Jamais les éléments (murs, mesures, photos, équipements…) : une copie est un
-- point de départ à relever, pas une mesure. Statut des pièces remis à « à relever », surfaces
-- déclarées et commentaires non recopiés. SECURITY INVOKER : chaque insertion passe la RLS.
create or replace function public.tools_releve_dupliquer(p_entite text, p_id uuid, p_nom text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_bat public.tools_releves_batiments; v_etage public.tools_releves_etages; v_piece public.tools_releves_pieces;
  v_new uuid := gen_random_uuid(); v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  r_etage record; r_zone record; v_new_etage uuid; v_map jsonb; v_zone uuid; v_releve uuid; v_entreprise uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_entite = 'batiment' then
    select * into v_bat from public.tools_releves_batiments where id = p_id and deleted_at is null;
    if v_bat.id is null then raise exception 'Bâtiment introuvable' using errcode = 'P0002'; end if;
    v_releve := v_bat.releve_id; v_entreprise := v_bat.entreprise_id;
    insert into public.tools_releves_batiments (id, releve_id, chantier_id, nom, ordre, notes)
    values (v_new, v_bat.releve_id, v_bat.chantier_id, left(coalesce(v_nom, v_bat.nom || ' (copie)'), 120),
            (select coalesce(max(ordre), -1) + 1 from public.tools_releves_batiments where chantier_id = v_bat.chantier_id and deleted_at is null), null);
    for r_etage in select * from public.tools_releves_etages where batiment_id = p_id and deleted_at is null order by niveau nulls last, ordre loop
      v_new_etage := gen_random_uuid();
      insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, categorie_niveau, altitude_mm, hauteur_sous_plafond_mm, etat, ordre)
      values (v_new_etage, r_etage.releve_id, v_new, r_etage.nom, r_etage.niveau, r_etage.categorie_niveau, r_etage.altitude_mm, r_etage.hauteur_sous_plafond_mm, r_etage.etat, r_etage.ordre);
      v_map := '{}'::jsonb;
      for r_zone in select * from public.tools_releves_zones where etage_id = r_etage.id and deleted_at is null loop
        v_zone := gen_random_uuid(); v_map := v_map || jsonb_build_object(r_zone.id::text, v_zone);
        insert into public.tools_releves_zones (id, releve_id, etage_id, nom, type, ordre) values (v_zone, r_zone.releve_id, v_new_etage, r_zone.nom, r_zone.type, r_zone.ordre);
      end loop;
      insert into public.tools_releves_pieces (releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
      select p.releve_id, v_new_etage, (v_map ->> p.zone_id::text)::uuid, p.nom, p.usage, p.hauteur_sous_plafond_mm, p.ordre
      from public.tools_releves_pieces p where p.etage_id = r_etage.id and p.deleted_at is null;
    end loop;
  elsif p_entite = 'etage' then
    select * into v_etage from public.tools_releves_etages where id = p_id and deleted_at is null;
    if v_etage.id is null then raise exception 'Étage introuvable' using errcode = 'P0002'; end if;
    v_releve := v_etage.releve_id; v_entreprise := v_etage.entreprise_id;
    -- Étage courant (R+1 → R+2) : niveau suivant du bâtiment ; sinon niveau recopié tel quel.
    insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, categorie_niveau, altitude_mm, hauteur_sous_plafond_mm, etat, ordre)
    values (v_new, v_etage.releve_id, v_etage.batiment_id, left(coalesce(v_nom, v_etage.nom || ' (copie)'), 120),
            case when v_etage.categorie_niveau = 'etage' and v_etage.niveau is not null
                 then least(200, (select max(niveau) from public.tools_releves_etages where batiment_id = v_etage.batiment_id and deleted_at is null) + 1)
                 else v_etage.niveau end,
            v_etage.categorie_niveau, null, v_etage.hauteur_sous_plafond_mm, v_etage.etat,
            (select coalesce(max(ordre), -1) + 1 from public.tools_releves_etages where batiment_id = v_etage.batiment_id and deleted_at is null));
    v_map := '{}'::jsonb;
    for r_zone in select * from public.tools_releves_zones where etage_id = p_id and deleted_at is null loop
      v_zone := gen_random_uuid(); v_map := v_map || jsonb_build_object(r_zone.id::text, v_zone);
      insert into public.tools_releves_zones (id, releve_id, etage_id, nom, type, ordre) values (v_zone, r_zone.releve_id, v_new, r_zone.nom, r_zone.type, r_zone.ordre);
    end loop;
    insert into public.tools_releves_pieces (releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
    select p.releve_id, v_new, (v_map ->> p.zone_id::text)::uuid, p.nom, p.usage, p.hauteur_sous_plafond_mm, p.ordre
    from public.tools_releves_pieces p where p.etage_id = p_id and p.deleted_at is null;
  elsif p_entite = 'piece' then
    select * into v_piece from public.tools_releves_pieces where id = p_id and deleted_at is null;
    if v_piece.id is null then raise exception 'Pièce introuvable' using errcode = 'P0002'; end if;
    v_releve := v_piece.releve_id; v_entreprise := v_piece.entreprise_id;
    insert into public.tools_releves_pieces (id, releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
    values (v_new, v_piece.releve_id, v_piece.etage_id,
            (select z.id from public.tools_releves_zones z where z.id = v_piece.zone_id and z.deleted_at is null),
            left(coalesce(v_nom, v_piece.nom || ' (copie)'), 120), v_piece.usage, v_piece.hauteur_sous_plafond_mm,
            (select coalesce(max(ordre), -1) + 1 from public.tools_releves_pieces where etage_id = v_piece.etage_id and deleted_at is null));
  else
    raise exception 'Duplication possible pour un bâtiment, un étage ou une pièce' using errcode = '22023';
  end if;
  -- Trace : l'entité créée pointe vers sa source (les créations unitaires sont déjà journalisées).
  perform public.tools_releve_journaliser_duplication(p_entite, v_new, p_id);
  return v_new;
end;
$$;

-- ── 7c. Recherche simple ─────────────────────────────────────────────────────
-- Relevés, chantiers, bâtiments et pièces dont le libellé contient le texte (casse ignorée).
-- Filtres : `actif` (non archivé, non supprimé), `archive`, `recent` (modifié < 30 jours), `tous`.
-- SECURITY INVOKER : un utilisateur ne trouve que ce que la RLS lui laisse voir.
create or replace function public.tools_releve_rechercher(p_entreprise_id uuid, p_texte text default null, p_filtre text default 'actif', p_limite integer default 50)
returns table (type text, id uuid, releve_id uuid, libelle text, contexte text, releve_nom text, releve_statut text, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with params as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_texte, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as motif,
           least(greatest(coalesce(p_limite, 50), 1), 200) as limite
  ),
  releves as (
    select r.* from public.tools_releves r
    where r.entreprise_id = p_entreprise_id and r.deleted_at is null
      and case coalesce(p_filtre, 'actif')
            when 'archive' then r.statut = 'archive'
            when 'recent' then r.updated_at > now() - interval '30 days'
            when 'tous' then true
            else r.statut <> 'archive' end
  ),
  resultats as (
    select 'releve'::text as type, r.id, r.id as releve_id, r.nom as libelle,
           concat_ws(' · ', r.reference, r.chantier_nom, r.chantier_ville, r.client_nom) as contexte, r.nom as releve_nom, r.statut as releve_statut, r.updated_at
    from releves r, params p
    where lower(concat_ws(' ', r.nom, r.reference, r.chantier_nom, r.chantier_ville, r.client_nom)) like p.motif
    union all
    select 'chantier', c.id, r.id, c.nom, concat_ws(' · ', c.reference, c.ville, c.client_nom), r.nom, r.statut, greatest(c.updated_at, r.updated_at)
    from public.tools_releves_chantiers c join releves r on r.id = c.releve_id, params p
    where c.deleted_at is null and btrim(coalesce(p_texte, '')) <> ''
      and lower(concat_ws(' ', c.nom, c.reference, c.ville, c.client_nom, c.adresse)) like p.motif
    union all
    select 'batiment', b.id, r.id, b.nom, r.nom, r.nom, r.statut, greatest(b.updated_at, r.updated_at)
    from public.tools_releves_batiments b join releves r on r.id = b.releve_id, params p
    where b.deleted_at is null and btrim(coalesce(p_texte, '')) <> '' and lower(b.nom) like p.motif
    union all
    select 'piece', pc.id, r.id, pc.nom, concat_ws(' · ', r.nom, e.nom), r.nom, r.statut, greatest(pc.updated_at, r.updated_at)
    from public.tools_releves_pieces pc join releves r on r.id = pc.releve_id
      join public.tools_releves_etages e on e.id = pc.etage_id, params p
    where pc.deleted_at is null and btrim(coalesce(p_texte, '')) <> '' and lower(pc.nom) like p.motif
  )
  select x.type, x.id, x.releve_id, x.libelle, x.contexte, x.releve_nom, x.releve_statut, x.updated_at
  from resultats x
  order by x.updated_at desc, x.type, x.libelle
  limit (select limite from params);
$$;

-- ── Droits ──────────────────────────────────────────────────────────────────
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.tools_releve_reordonner(text,uuid[])',
    'public.tools_releve_dupliquer(text,uuid,text)',
    'public.tools_releve_journaliser_duplication(text,uuid,uuid)',
    'public.tools_releve_rechercher(uuid,text,text,integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
