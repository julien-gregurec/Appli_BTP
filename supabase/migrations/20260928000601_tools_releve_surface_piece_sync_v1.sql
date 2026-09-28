-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — SURFACE DE LA PIÈCE SYNCHRONISÉE DEPUIS LE PLAN (V1)
-- Train canonique V6 (décision produit : docs/qualification/ELSATIA_CANONICAL_TRAIN_V6_CONVERGENCE_V1.md §6).
--
-- Posée après le Lot 6 (20260928000401) et le paramétrage RGPD (20260928000501).
--
-- Règles :
--   S1  Aucune écriture client : la garde Lot 3 (`tools_releve_structure_garde`) est redéfinie À
--       L'IDENTIQUE, sauf une exception étroite — une autorisation déposée pour (transaction courante,
--       pièce) dans `platform.tools_releve_surface_autorisations`, table sans aucun droit pour
--       anon / authenticated / service_role, alimentée uniquement par la fonction de synchronisation
--       (SECURITY DEFINER, non exécutable par l'application) qui la retire avant de rendre la main.
--       Même avec l'autorisation, seules `surface_calculee_mm2` et `calcule_le` changent ; le volume
--       reste réservé. Sans autorisation : comportement Lot 3 inchangé.
--   S2  Source : le plan de RÉFÉRENCE mesuré de l'étage de la pièce = le plus récent (numéro) non
--       supprimé dont l'état n'est pas `projete` (un plan projeté décrit des travaux à venir, pas
--       l'existant — DECISION_REQUIRED:V6-SURFACE-PLAN-PROJETE, choix conservateur), figé ou non.
--       Surface recalculée ici depuis les points du contour (formule du lacet,
--       `tools_releve_plan_surface`), jamais lue du client.
--   S3  Serveur uniquement : déclenchée APRÈS l'écriture des contours ou de la suppression /
--       restauration d'un plan (création dérivée, `tools_releve_plan_enregistrer`, cascade d'étage).
--   S4  Absence de source = AUCUNE écriture : pas de plan de référence, pas de contour pour la pièce
--       dans ce plan, surface nulle, pièce ou relevé supprimé → la valeur existante est conservée
--       (aucun effacement sans règle explicite).
--   S5  Aucune version figée touchée : seule la ligne vivante de la pièce change ; plans figés,
--       éléments et instantanés de version (`tools_releves_versions`) ne sont jamais écrits.
--   S6  Audit : journal du relevé (entité `piece`, action `modification`, champs
--       surface_calculee_mm2 / calcule_le, détails : plan source, numéro, révision, surfaces avant /
--       après en mm²) en plus de la ligne du journal générique.
--   S7  Aucune reprise de données à l'upgrade : les pièces existantes reçoivent leur surface au
--       prochain enregistrement de contours (DECISION_REQUIRED:V6-SURFACE-BACKFILL).

-- ── 1. Autorisation liée à la transaction ────────────────────────────────────
create table if not exists platform.tools_releve_surface_autorisations (
  txid bigint not null,
  piece_id uuid not null,
  primary key (txid, piece_id)
);
alter table platform.tools_releve_surface_autorisations enable row level security;
revoke all on table platform.tools_releve_surface_autorisations from public, anon, authenticated, service_role;

-- ── 2. Garde Lot 3 : identique, plus l'exception S1 ─────────────────────────
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
    elsif exists (select 1 from platform.tools_releve_surface_autorisations a
                  where a.txid = txid_current() and a.piece_id = (v_old->>'id')::uuid) then
      -- V6 : synchronisation serveur de la surface (tools_releve_pieces_surface_synchroniser, seule à
      -- déposer cette autorisation, dans sa transaction) : surface et horodatage de calcul seulement ;
      -- le volume reste réservé.
      new := jsonb_populate_record(new, jsonb_build_object('volume_calcule_mm3', v_old->'volume_calcule_mm3'));
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

-- ── 3. Synchronisation ───────────────────────────────────────────────────────
-- Recalcule la surface des pièces données (toutes sur `p_etage_id`) depuis le plan de référence
-- mesuré de l'étage. Renvoie le nombre de pièces écrites.
create or replace function public.tools_releve_pieces_surface_synchroniser(p_etage_id uuid, p_pieces uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_plan public.tools_releves_plans; v_piece public.tools_releves_pieces; v_contour jsonb;
  v_surface numeric; v_n integer := 0;
begin
  if p_etage_id is null or coalesce(cardinality(p_pieces), 0) = 0 then return 0; end if;
  select * into v_plan from public.tools_releves_plans p
  where p.etage_id = p_etage_id and p.deleted_at is null and p.etat_documente <> 'projete'
  order by p.numero desc limit 1;
  if v_plan.id is null then return 0; end if;                                   -- S4
  for v_piece in select p.* from public.tools_releves_pieces p
                 where p.id = any(p_pieces) and p.etage_id = p_etage_id and p.deleted_at is null
                   and exists (select 1 from public.tools_releves r where r.id = p.releve_id and r.deleted_at is null)
                 order by p.id for update of p loop
    select c.value into v_contour from jsonb_array_elements(coalesce(v_plan.contours, '[]'::jsonb)) c
    where c.value->>'pieceId' = v_piece.id::text limit 1;
    if v_contour is null then continue; end if;                                 -- S4
    v_surface := round(public.tools_releve_plan_surface(v_contour->'points'), 1);
    if v_surface is null or v_surface <= 0 then continue; end if;               -- S4
    if v_surface is not distinct from v_piece.surface_calculee_mm2 then continue; end if;
    insert into platform.tools_releve_surface_autorisations (txid, piece_id) values (txid_current(), v_piece.id)
    on conflict do nothing;
    update public.tools_releves_pieces set surface_calculee_mm2 = v_surface, calcule_le = now() where id = v_piece.id;
    delete from platform.tools_releve_surface_autorisations a where a.txid = txid_current() and a.piece_id = v_piece.id;
    insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
    values (v_piece.entreprise_id, v_piece.releve_id, 'piece', v_piece.id, 'modification',
            array['calcule_le','surface_calculee_mm2'], auth.uid(),
            jsonb_build_object('source', 'plan', 'plan_id', v_plan.id, 'plan_numero', v_plan.numero,
                               'plan_revision', v_plan.revision, 'plan_fige', v_plan.fige_le is not null,
                               'avant_mm2', v_piece.surface_calculee_mm2, 'apres_mm2', v_surface));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Déclencheur : contours écrits, plan créé, supprimé ou restauré → pièces de l'étage citées dans un
-- contour d'un plan actif de l'étage ou dans l'ancien contour du plan modifié.
create or replace function public.tools_releve_plan_surface_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pieces uuid[];
begin
  if tg_op = 'UPDATE' and new.contours is not distinct from old.contours
     and new.deleted_at is not distinct from old.deleted_at then
    return null;
  end if;
  select coalesce(array_agg(distinct x.piece_id), '{}'::uuid[]) into v_pieces from (
    select (c.value->>'pieceId')::uuid as piece_id
    from public.tools_releves_plans p, jsonb_array_elements(coalesce(p.contours, '[]'::jsonb)) c
    where p.etage_id = new.etage_id and p.deleted_at is null
    union
    select (c.value->>'pieceId')::uuid
    from jsonb_array_elements(case when tg_op = 'UPDATE' then coalesce(old.contours, '[]'::jsonb) else '[]'::jsonb end) c
  ) x;
  perform public.tools_releve_pieces_surface_synchroniser(new.etage_id, v_pieces);
  return null;
end;
$$;

drop trigger if exists tools_releves_plans_surface_sync on public.tools_releves_plans;
create trigger tools_releves_plans_surface_sync after insert or update of contours, deleted_at on public.tools_releves_plans
  for each row execute function public.tools_releve_plan_surface_sync();

-- ── 4. Droits : rien d'exécutable par l'application ─────────────────────────
revoke all on function public.tools_releve_pieces_surface_synchroniser(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.tools_releve_plan_surface_sync() from public, anon, authenticated, service_role;
