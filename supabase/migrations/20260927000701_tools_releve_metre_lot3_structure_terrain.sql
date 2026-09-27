-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 3 — STRUCTURE TERRAIN & RELEVÉ MÉTIER V1
--
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT3_STRUCTURE_TERRAIN_V1.md
-- Miroir TypeScript : packages/releve-domain/src/{model,validation,hierarchy,terrain}.ts
-- (parité des énumérations : sql-parity.test.ts).
--
-- Migration STRICTEMENT ADDITIVE sur 20260927000601…604 (aucune migration appliquée n'est
-- modifiée ; toute ligne valide avant l'est encore après) :
--
--   1. Chantier : client, référence, description, date, statut ; lien client Gestion Pro
--      (même entreprise, permission `acces_clients`) ;
--   2. Étage : `type_niveau` (sous-sol, RDC, étage, entresol, mezzanine, combles, toiture…)
--      à côté du `niveau` numérique, qui reste la clé de tri ; `altitude_mm` existait déjà ;
--   3. Zone : types `aile`, `secteur`, `appartement`, `plateau` ajoutés (zone facultative) ;
--   4. Pièce : fiche complète — types `circulation`, `local_technique`, `stockage` ajoutés,
--      `commentaire`, `statut`, surface / volume calculés (colonnes serveur, futures) ;
--   5. Garde de structure : parents physiques immuables (étage → bâtiment, zone → étage,
--      pièce → étage), déplacements maîtrisés (bâtiment entre chantiers du relevé, pièce entre
--      zones du même étage), jamais vers un parent supprimé, restauration sous parent actif ;
--   6. Journal : actions `renommage`, `deplacement`, `reordonnancement`, `duplication` et
--      `details` (identifiants uniquement, jamais de contenu : RGPD) ;
--   7. RPC terrain : duplication de structure (bâtiment, étage, zone, pièce — sans éléments ni
--      médias : aucune photo ni mesure dupliquée), réordonnancement atomique d'une fratrie,
--      recherche simple (relevé, chantier, bâtiment, étage, zone, pièce) sous RLS.
--
-- Aucune facturation, aucun SKU, aucune écriture Gestion Pro.

-- ── 1. Chantier ──────────────────────────────────────────────────────────────
alter table public.tools_releves_chantiers
  add column client_nom text check (client_nom is null or (btrim(client_nom) <> '' and char_length(client_nom) <= 180)),
  add column client_gp_id uuid references public.clients(id) on delete set null,
  add column reference text check (reference is null or (btrim(reference) <> '' and char_length(reference) <= 80)),
  add column description text check (description is null or char_length(description) <= 4000),
  add column date_releve date,
  add column statut text not null default 'en_cours' check (statut in ('a_relever','en_cours','termine','archive'));

-- Liens Gestion Pro d'un chantier : même entreprise toujours ; permission GP pour qui pose un
-- NOUVEAU lien, sauf s'il recopie le lien déjà validé sur le projet.
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
-- `niveau` (entier) reste la clé de tri et d'unicité métier ; `type_niveau` dit ce qu'est le
-- niveau sans l'imposer numériquement (des combles au niveau 3, un entresol au niveau 1…).
-- NULL pour les lignes antérieures : le domaine le déduit du niveau.
alter table public.tools_releves_etages
  add column type_niveau text check (type_niveau is null or type_niveau in
    ('sous_sol','rdc','etage','entresol','mezzanine','combles','toiture','autre'));

-- ── 3. Zone ──────────────────────────────────────────────────────────────────
alter table public.tools_releves_zones drop constraint tools_releves_zones_type_check;
alter table public.tools_releves_zones add constraint tools_releves_zones_type_check
  check (type in ('logement','lot','parties_communes','local_technique','exterieur','autre',
                  'aile','secteur','appartement','plateau'));

-- ── 4. Pièce ─────────────────────────────────────────────────────────────────
alter table public.tools_releves_pieces drop constraint tools_releves_pieces_usage_check;
alter table public.tools_releves_pieces add constraint tools_releves_pieces_usage_check
  check (usage in (
    'sejour','chambre','cuisine','salle_de_bain','salle_d_eau','wc','entree','degagement',
    'bureau','cellier','buanderie','garage','cave','combles','escalier','exterieur','autre',
    'circulation','local_technique','stockage'
  ));
alter table public.tools_releves_pieces
  add column commentaire text check (commentaire is null or char_length(commentaire) <= 4000),
  add column statut text not null default 'a_relever' check (statut in ('a_relever','en_cours','releve','a_verifier')),
  -- Calculées par le serveur à partir des murs relevés (lots 5+) ; jamais saisies.
  add column surface_calculee_mm2 numeric(18,1) check (surface_calculee_mm2 is null or surface_calculee_mm2 >= 0),
  add column volume_calcule_mm3 numeric(22,1) check (volume_calcule_mm3 is null or volume_calcule_mm3 >= 0),
  add column calcule_le timestamptz;

-- ── 5. Garde de structure ────────────────────────────────────────────────────
-- S'exécute après `<table>_avant_ecriture` (ordre alphabétique des déclencheurs BEFORE).
-- Les éléments métier portent `etage_id` : déplacer un étage, une zone ou une pièce vers un
-- autre étage casserait silencieusement leur rattachement. Seuls deux déplacements sont
-- ouverts : un bâtiment vers un autre chantier du relevé, une pièce vers une autre zone du
-- même étage (ou hors zone) — les clés étrangères composites garantissent déjà le relevé.
create or replace function public.tools_releve_structure_garde()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Accès par jsonb : PL/pgSQL ne résout `new.<colonne>` que pour la table qui la possède.
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_parent_supprime boolean;
begin
  if tg_table_name = 'tools_releves_pieces' and auth.uid() is not null then
    -- Colonnes calculées : réservées au serveur.
    if tg_op = 'INSERT' then
      new := jsonb_populate_record(new, jsonb_build_object('surface_calculee_mm2', null, 'volume_calcule_mm3', null, 'calcule_le', null));
    else
      new := jsonb_populate_record(new, jsonb_build_object('surface_calculee_mm2', v_old->'surface_calculee_mm2',
        'volume_calcule_mm3', v_old->'volume_calcule_mm3', 'calcule_le', v_old->'calcule_le'));
    end if;
  end if;
  if tg_op = 'INSERT' then return new; end if;

  if tg_table_name = 'tools_releves_etages' and v_new->'batiment_id' is distinct from v_old->'batiment_id' then
    raise exception 'Un étage ne change pas de bâtiment : dupliquez-le' using errcode = '42501';
  elsif tg_table_name = 'tools_releves_zones' and v_new->'etage_id' is distinct from v_old->'etage_id' then
    raise exception 'Une zone ne change pas d''étage' using errcode = '42501';
  elsif tg_table_name = 'tools_releves_pieces' and v_new->'etage_id' is distinct from v_old->'etage_id' then
    raise exception 'Une pièce ne change pas d''étage : dupliquez-la' using errcode = '42501';
  end if;

  -- Déplacement vers un parent supprimé : refusé.
  if tg_table_name = 'tools_releves_batiments' and v_new->'chantier_id' is distinct from v_old->'chantier_id'
     and exists (select 1 from public.tools_releves_chantiers c where c.id = (v_new->>'chantier_id')::uuid and c.deleted_at is not null) then
    raise exception 'Chantier de destination supprimé' using errcode = '42501';
  end if;
  if tg_table_name = 'tools_releves_pieces' and v_new->>'zone_id' is not null and v_new->'zone_id' is distinct from v_old->'zone_id'
     and exists (select 1 from public.tools_releves_zones z where z.id = (v_new->>'zone_id')::uuid and z.deleted_at is not null) then
    raise exception 'Zone de destination supprimée' using errcode = '42501';
  end if;

  -- Restauration : le parent doit être actif (la cascade restaure le parent d'abord).
  if v_old->>'deleted_at' is not null and v_new->>'deleted_at' is null then
    v_parent_supprime := case tg_table_name
      when 'tools_releves_chantiers' then (select r.deleted_at is not null from public.tools_releves r where r.id = (v_new->>'releve_id')::uuid)
      when 'tools_releves_batiments' then (select c.deleted_at is not null from public.tools_releves_chantiers c where c.id = (v_new->>'chantier_id')::uuid)
      when 'tools_releves_etages' then (select b.deleted_at is not null from public.tools_releves_batiments b where b.id = (v_new->>'batiment_id')::uuid)
      when 'tools_releves_zones' then (select e.deleted_at is not null from public.tools_releves_etages e where e.id = (v_new->>'etage_id')::uuid)
      when 'tools_releves_pieces' then (select e.deleted_at is not null from public.tools_releves_etages e where e.id = (v_new->>'etage_id')::uuid)
      else false end;
    if coalesce(v_parent_supprime, false) then
      raise exception 'Restaurez d''abord l''élément parent' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['tools_releves_chantiers','tools_releves_batiments','tools_releves_etages',
                                 'tools_releves_zones','tools_releves_pieces'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.tools_releve_structure_garde()',
                   v_table || '_garde_structure', v_table);
  end loop;
end $$;

-- ── 6. Journal ───────────────────────────────────────────────────────────────
alter table public.tools_releves_journal drop constraint tools_releves_journal_action_check;
alter table public.tools_releves_journal add constraint tools_releves_journal_action_check
  check (action in ('creation','modification','suppression','restauration','partage','transfert','version',
                    'renommage','deplacement','reordonnancement','duplication'));
-- Détails structurés : identifiants et ordres seulement (jamais noms, adresses ni notes).
alter table public.tools_releves_journal
  add column details jsonb check (details is null or (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000));

create or replace function public.tools_releve_journaliser()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_action text; v_champs text[]; v_details jsonb; v_parent text;
begin
  if tg_op = 'INSERT' then
    v_action := 'creation'; v_champs := '{}'::text[];
  else
    select coalesce(array_agg(n.key order by n.key), '{}'::text[]) into v_champs
    from jsonb_each(v_new) n
    where n.key not in ('revision','updated_at','updated_by','deleted_by') and n.value is distinct from v_old -> n.key;
    -- Colonne de rattachement déplaçable (bâtiment → chantier, pièce → zone).
    v_parent := case tg_table_name when 'tools_releves_batiments' then 'chantier_id' when 'tools_releves_pieces' then 'zone_id' end;
    v_action := case
      when v_new->'deleted_at' is distinct from v_old->'deleted_at' then
        case when v_new->>'deleted_at' is null then 'restauration' else 'suppression' end
      when v_new->'visibilite' is distinct from v_old->'visibilite' then 'partage'
      when v_new->'proprietaire_id' is distinct from v_old->'proprietaire_id' then 'transfert'
      when v_parent is not null and v_parent = any(v_champs) then 'deplacement'
      when v_champs = array['nom'] then 'renommage'
      when v_champs = array['ordre'] then 'reordonnancement'
      else 'modification' end;
    if v_action = 'deplacement' then
      v_details := jsonb_build_object('champ', v_parent, 'de', v_old->v_parent, 'vers', v_new->v_parent);
    elsif v_action = 'reordonnancement' then
      v_details := jsonb_build_object('de', v_old->'ordre', 'vers', v_new->'ordre');
    end if;
  end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (
    (v_new->>'entreprise_id')::uuid,
    coalesce(v_new->>'releve_id', v_new->>'id')::uuid,
    case tg_table_name
      when 'tools_releves' then 'releve' when 'tools_releves_chantiers' then 'chantier'
      when 'tools_releves_batiments' then 'batiment'
      when 'tools_releves_etages' then 'etage' when 'tools_releves_zones' then 'zone'
      when 'tools_releves_pieces' then 'piece' when 'tools_releves_elements' then 'element'
      when 'tools_releves_medias' then 'media' end,
    (v_new->>'id')::uuid, v_action, v_champs, auth.uid(), v_details
  );
  return null;
end;
$$;

-- ── 7. RPC terrain ───────────────────────────────────────────────────────────

-- 7.1 Duplication de structure. Copie le nœud et sa SOUS-STRUCTURE (bâtiment → étages →
-- zones → pièces ; étage → zones → pièces ; zone → pièces ; pièce seule), jamais les
-- éléments métier ni les médias : aucune photo, mesure, annotation ou quantité n'est
-- dupliquée. Le commentaire, le statut et les calculs d'une pièce ne sont pas recopiés (ce
-- sont des constats de terrain). La copie est placée en fin de fratrie. `p_nouvel_id`
-- permet un identifiant généré côté client (hors ligne, idempotence de rejeu).
create or replace function public.tools_releve_dupliquer_noeud(
  p_type text, p_id uuid, p_nouvel_id uuid default null, p_nom text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_releve uuid; v_nouvel uuid := coalesce(p_nouvel_id, gen_random_uuid()); v_nom text;
  v_nombre integer := 1; v_niveau integer; v_etage record; v_zone record; v_piece record;
  v_etage_map jsonb := '{}'::jsonb; v_zone_map jsonb := '{}'::jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_type not in ('batiment','etage','zone','piece') then
    raise exception 'Type de nœud non duplicable : %', p_type using errcode = '22023';
  end if;
  v_nom := nullif(btrim(p_nom), '');
  if v_nom is not null and char_length(v_nom) > 120 then raise exception 'Nom trop long' using errcode = '22023'; end if;

  execute format('select releve_id from public.%I where id = $1 and deleted_at is null',
                 'tools_releves_' || case p_type when 'batiment' then 'batiments' when 'etage' then 'etages' when 'zone' then 'zones' else 'pieces' end)
    into v_releve using p_id;
  -- Même message pour « inexistant » et « interdit » : pas d'oracle d'existence inter-tenant.
  if v_releve is null or not public.tools_releve_peut(v_releve, 'edit') then
    raise exception 'Élément introuvable ou non modifiable' using errcode = '42501';
  end if;

  if p_type = 'batiment' then
    insert into public.tools_releves_batiments (id, releve_id, chantier_id, nom, ordre, notes)
    select v_nouvel, b.releve_id, b.chantier_id, coalesce(v_nom, left(b.nom, 111) || ' (copie)'),
           (select coalesce(max(x.ordre) + 1, 0) from public.tools_releves_batiments x where x.chantier_id = b.chantier_id and x.deleted_at is null),
           b.notes
    from public.tools_releves_batiments b where b.id = p_id;
    for v_etage in select * from public.tools_releves_etages e where e.batiment_id = p_id and e.deleted_at is null order by e.niveau, e.ordre loop
      v_id := gen_random_uuid();
      insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, altitude_mm, hauteur_sous_plafond_mm, etat, ordre, type_niveau)
      values (v_id, v_etage.releve_id, v_nouvel, v_etage.nom, v_etage.niveau, v_etage.altitude_mm, v_etage.hauteur_sous_plafond_mm, v_etage.etat, v_etage.ordre, v_etage.type_niveau);
      v_etage_map := v_etage_map || jsonb_build_object(v_etage.id::text, v_id);
      v_nombre := v_nombre + 1;
    end loop;
  elsif p_type = 'etage' then
    select * into v_etage from public.tools_releves_etages where id = p_id;
    -- La copie devient le niveau suivant du bâtiment (usage terrain : R+1 → R+2).
    select coalesce(max(e.niveau), v_etage.niveau) + 1 into v_niveau
    from public.tools_releves_etages e where e.batiment_id = v_etage.batiment_id and e.deleted_at is null;
    if v_niveau > 200 then raise exception 'Niveau maximal atteint' using errcode = '22023'; end if;
    insert into public.tools_releves_etages (id, releve_id, batiment_id, nom, niveau, altitude_mm, hauteur_sous_plafond_mm, etat, ordre, type_niveau)
    values (v_nouvel, v_etage.releve_id, v_etage.batiment_id,
            coalesce(v_nom, case when v_niveau > 0 then 'R+' || v_niveau else left(v_etage.nom, 111) || ' (copie)' end),
            v_niveau, null, v_etage.hauteur_sous_plafond_mm, v_etage.etat,
            (select coalesce(max(x.ordre) + 1, 0) from public.tools_releves_etages x where x.batiment_id = v_etage.batiment_id and x.deleted_at is null),
            case when v_niveau > 0 and coalesce(v_etage.type_niveau, 'etage') in ('rdc','sous_sol') then 'etage' else v_etage.type_niveau end);
    v_etage_map := jsonb_build_object(p_id::text, v_nouvel);
  end if;

  -- Zones puis pièces des étages copiés (bâtiment, étage).
  if p_type in ('batiment','etage') then
    for v_zone in select z.* from public.tools_releves_zones z
                  where z.etage_id::text in (select jsonb_object_keys(v_etage_map)) and z.deleted_at is null loop
      v_id := gen_random_uuid();
      insert into public.tools_releves_zones (id, releve_id, etage_id, nom, type, ordre)
      values (v_id, v_zone.releve_id, (v_etage_map ->> v_zone.etage_id::text)::uuid, v_zone.nom, v_zone.type, v_zone.ordre);
      v_zone_map := v_zone_map || jsonb_build_object(v_zone.id::text, v_id);
      v_nombre := v_nombre + 1;
    end loop;
    for v_piece in select p.* from public.tools_releves_pieces p
                   where p.etage_id::text in (select jsonb_object_keys(v_etage_map)) and p.deleted_at is null loop
      insert into public.tools_releves_pieces (id, releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
      values (gen_random_uuid(), v_piece.releve_id, (v_etage_map ->> v_piece.etage_id::text)::uuid,
              (v_zone_map ->> v_piece.zone_id::text)::uuid, v_piece.nom, v_piece.usage, v_piece.hauteur_sous_plafond_mm, v_piece.ordre);
      v_nombre := v_nombre + 1;
    end loop;
  elsif p_type = 'zone' then
    select * into v_zone from public.tools_releves_zones where id = p_id;
    insert into public.tools_releves_zones (id, releve_id, etage_id, nom, type, ordre)
    values (v_nouvel, v_zone.releve_id, v_zone.etage_id, coalesce(v_nom, left(v_zone.nom, 111) || ' (copie)'), v_zone.type,
            (select coalesce(max(x.ordre) + 1, 0) from public.tools_releves_zones x where x.etage_id = v_zone.etage_id and x.deleted_at is null));
    for v_piece in select p.* from public.tools_releves_pieces p where p.zone_id = p_id and p.deleted_at is null order by p.ordre loop
      insert into public.tools_releves_pieces (id, releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
      values (gen_random_uuid(), v_piece.releve_id, v_piece.etage_id, v_nouvel, v_piece.nom, v_piece.usage, v_piece.hauteur_sous_plafond_mm,
              (select coalesce(max(x.ordre) + 1, 0) from public.tools_releves_pieces x where x.etage_id = v_piece.etage_id and x.deleted_at is null));
      v_nombre := v_nombre + 1;
    end loop;
  else
    select * into v_piece from public.tools_releves_pieces where id = p_id;
    insert into public.tools_releves_pieces (id, releve_id, etage_id, zone_id, nom, usage, hauteur_sous_plafond_mm, ordre)
    values (v_nouvel, v_piece.releve_id, v_piece.etage_id,
            case when exists (select 1 from public.tools_releves_zones z where z.id = v_piece.zone_id and z.deleted_at is null) then v_piece.zone_id end,
            coalesce(v_nom, left(v_piece.nom, 111) || ' (copie)'), v_piece.usage, v_piece.hauteur_sous_plafond_mm,
            (select coalesce(max(x.ordre) + 1, 0) from public.tools_releves_pieces x where x.etage_id = v_piece.etage_id and x.deleted_at is null));
  end if;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  select r.entreprise_id, r.id, p_type, v_nouvel, 'duplication', '{}'::text[], auth.uid(),
         jsonb_build_object('source_id', p_id, 'noeuds', v_nombre, 'elements_copies', 0, 'medias_copies', 0)
  from public.tools_releves r where r.id = v_releve;
  return v_nouvel;
end;
$$;

-- 7.2 Réordonnancement atomique d'une fratrie. `p_ids` doit être EXACTEMENT l'ensemble des
-- frères actifs (même parent) dans le nouvel ordre : une liste incomplète — un frère ajouté
-- dans un autre onglet entre-temps — est refusée plutôt que de produire des ordres ambigus.
-- SECURITY INVOKER : lectures et écritures passent par la RLS de l'appelant.
create or replace function public.tools_releve_reordonner(p_type text, p_ids uuid[])
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_table text; v_parent_col text; v_parents integer; v_releves integer; v_trouves integer; v_attendus integer;
  v_parent uuid; v_releve uuid; v_modifies integer := 0; v_i integer;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  v_table := case p_type when 'chantier' then 'tools_releves_chantiers' when 'batiment' then 'tools_releves_batiments'
    when 'etage' then 'tools_releves_etages' when 'zone' then 'tools_releves_zones' when 'piece' then 'tools_releves_pieces' end;
  v_parent_col := case p_type when 'chantier' then 'releve_id' when 'batiment' then 'chantier_id'
    when 'etage' then 'batiment_id' else 'etage_id' end;
  if v_table is null then raise exception 'Type de nœud inconnu : %', p_type using errcode = '22023'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Liste d''ordre invalide' using errcode = '22023';
  end if;

  execute format('select count(*)::int, count(distinct %1$I)::int, count(distinct releve_id)::int, min(%1$I::text)::uuid,
                  min(releve_id::text)::uuid
                  from public.%2$I where id = any($1) and deleted_at is null', v_parent_col, v_table)
    into v_trouves, v_parents, v_releves, v_parent, v_releve using p_ids;
  if v_trouves <> cardinality(p_ids) or v_parents <> 1 or v_releves <> 1
     or not public.tools_releve_peut(v_releve, 'edit') then
    raise exception 'Éléments introuvables ou de parents différents' using errcode = '42501';
  end if;
  execute format('select count(*)::int from public.%I where %I = $1 and deleted_at is null', v_table, v_parent_col)
    into v_attendus using v_parent;
  if v_attendus <> cardinality(p_ids) then
    raise exception 'La liste a changé entre-temps : rechargez avant de réordonner' using errcode = '40001';
  end if;

  for v_i in 1 .. cardinality(p_ids) loop
    execute format('update public.%I set ordre = $1 where id = $2 and ordre <> $1', v_table) using v_i - 1, p_ids[v_i];
    get diagnostics v_trouves = row_count;
    v_modifies := v_modifies + v_trouves;
  end loop;
  return v_modifies;
end;
$$;

-- 7.3 Recherche simple, insensible à la casse et aux accents usuels du français.
create or replace function public.tools_releve_normaliser(p_texte text)
returns text language sql immutable parallel safe set search_path = public as $$
  select translate(lower(coalesce(p_texte, '')),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa');
$$;

-- SECURITY INVOKER : chaque ligne renvoyée est filtrée par la RLS de l'appelant (aucune
-- ligne d'un autre tenant, d'un relevé privé d'autrui ou supprimé).
create or replace function public.tools_releve_rechercher(p_entreprise_id uuid, p_texte text, p_limite integer default 30)
returns table (
  releve_id uuid, releve_nom text, entite text, entite_id uuid, libelle text,
  chantier_id uuid, batiment_id uuid, etage_id uuid, zone_id uuid, piece_id uuid, updated_at timestamptz
) language plpgsql stable security invoker set search_path = public as $$
declare v_motif text; v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 100);
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_texte is null or char_length(btrim(p_texte)) < 2 or char_length(p_texte) > 80 then return; end if;
  v_motif := '%' || replace(replace(replace(public.tools_releve_normaliser(btrim(p_texte)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  with actifs as (
    select r.* from public.tools_releves r where r.entreprise_id = p_entreprise_id and r.deleted_at is null
  ), resultats as (
    select r.id, r.nom, 'releve'::text as entite, r.id as eid, r.nom as lib,
           null::uuid as c, null::uuid as b, null::uuid as e, null::uuid as z, null::uuid as p, r.updated_at as maj
    from actifs r
    where public.tools_releve_normaliser(concat_ws(' ', r.nom, r.reference, r.chantier_nom, r.chantier_ville, r.client_nom)) like v_motif
    union all
    select r.id, r.nom, 'chantier', c.id, c.nom, c.id, null, null, null, null, c.updated_at
    from public.tools_releves_chantiers c join actifs r on r.id = c.releve_id
    where c.deleted_at is null
      and public.tools_releve_normaliser(concat_ws(' ', c.nom, c.reference, c.ville, c.client_nom)) like v_motif
    union all
    select r.id, r.nom, 'batiment', b.id, b.nom, b.chantier_id, b.id, null, null, null, b.updated_at
    from public.tools_releves_batiments b join actifs r on r.id = b.releve_id
    where b.deleted_at is null and public.tools_releve_normaliser(b.nom) like v_motif
    union all
    select r.id, r.nom, 'etage', e.id, e.nom, b.chantier_id, b.id, e.id, null, null, e.updated_at
    from public.tools_releves_etages e join public.tools_releves_batiments b on b.id = e.batiment_id join actifs r on r.id = e.releve_id
    where e.deleted_at is null and public.tools_releve_normaliser(e.nom) like v_motif
    union all
    select r.id, r.nom, 'zone', z.id, z.nom, b.chantier_id, b.id, e.id, z.id, null, z.updated_at
    from public.tools_releves_zones z join public.tools_releves_etages e on e.id = z.etage_id
      join public.tools_releves_batiments b on b.id = e.batiment_id join actifs r on r.id = z.releve_id
    where z.deleted_at is null and public.tools_releve_normaliser(z.nom) like v_motif
    union all
    select r.id, r.nom, 'piece', p.id, p.nom, b.chantier_id, b.id, e.id, p.zone_id, p.id, p.updated_at
    from public.tools_releves_pieces p join public.tools_releves_etages e on e.id = p.etage_id
      join public.tools_releves_batiments b on b.id = e.batiment_id join actifs r on r.id = p.releve_id
    where p.deleted_at is null and public.tools_releve_normaliser(p.nom) like v_motif
  )
  select x.id, x.nom, x.entite, x.eid, x.lib, x.c, x.b, x.e, x.z, x.p, x.maj
  from resultats x
  order by case x.entite when 'releve' then 0 when 'chantier' then 1 when 'batiment' then 2 when 'etage' then 3 when 'zone' then 4 else 5 end,
           x.maj desc
  limit v_limite;
end;
$$;

-- ── 8. Droits ────────────────────────────────────────────────────────────────
revoke all on function public.tools_releve_structure_garde() from public, anon, authenticated;
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.tools_releve_dupliquer_noeud(text,uuid,uuid,text)',
    'public.tools_releve_reordonner(text,uuid[])',
    'public.tools_releve_normaliser(text)',
    'public.tools_releve_rechercher(uuid,text,integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
