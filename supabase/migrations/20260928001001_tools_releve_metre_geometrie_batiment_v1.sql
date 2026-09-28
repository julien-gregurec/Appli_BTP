-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 6 — OUVERTURES, JONCTIONS & GÉOMÉTRIE BÂTIMENT V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT6_GEOMETRIE_BATIMENT_V1.md
--
-- Posée APRÈS le Lot 5 (20260927000901). Plage 10xx réservée au Lot 6.
--
-- Strictement ADDITIF (aucune table, aucune colonne, aucune ligne existante modifiée ; aucune garde
-- affaiblie) :
--   1. Attributs de menuiserie FACULTATIFS dans `donnees` d'une ouverture de plan : `vantaux` (1, 2),
--      `poussee` (poussant, tirant), `modele` (battant, oscillo_battant, coulissant, galandage, fixe).
--      Absents des ouvertures antérieures : rien n'est réécrit. Le contrôle générique des éléments
--      (`tools_releve_element_donnees_valides`, Lot 2 → 4) n'est PAS modifié.
--   2. Validation serveur des ouvertures dans `tools_releve_plan_enregistrer` (redéfinie à l'identique +
--      contrôles, même signature, mêmes droits) : largeur nulle, hauteur / allège incohérentes (allège +
--      hauteur > hauteur du mur), menuiserie inconnue, et sur chaque mur TOUCHÉ par le lot : ouverture
--      hors du mur (mur raccourci), plus large que le mur, chevauchement. Refus = SQLSTATE 22023, rien
--      n'est écrit (lot atomique), `detail` = code d'anomalie (miroir `OpeningIssueCode` du domaine).
--   3. La « jonction » (ouverture engagée dans un raccord de murs L / T / X) dépend de la géométrie
--      raccordée à l'épaisseur réelle : elle est calculée et bloquée par le client (moteur Engine B de
--      Tools, `thick-strips`), pas par le serveur (voir le rapport, §8).
--   4. Lecture de la géométrie d'un plan par RPC `tools_releve_plan_elements` (SECURITY DEFINER, droit
--      `view` contrôlé UNE fois, même prédicat que la policy SELECT des éléments) : la policy RLS
--      évalue `tools_releve_peut` ligne par ligne (≈ 4 ms / ligne mesurés : 3,3 s pour 800 murs et
--      ouvertures) ; la RPC renvoie les mêmes lignes en quelques millisecondes. La lecture directe
--      sous RLS reste possible et inchangée.
--
-- RLS, droits et isolation des tenants : inchangés (les RPC gardent leur contrôle explicite
-- `tools_releve_peut(…, 'edit')`, la table des plans reste en lecture seule pour `authenticated`).

-- ── 1. Anomalie d'une ouverture (miroir de `validatePlanOuverture`) ───────────
-- Renvoie NULL si l'ouverture est valide, sinon un code : largeur_nulle, hauteur_incoherente,
-- plus_large_que_mur, invalide. `p_longueur` : longueur de l'axe du mur hôte ; `p_hauteur_mur` :
-- sa hauteur (NULL = inconnue, pas de contrôle de hauteur).
create or replace function public.tools_releve_plan_ouverture_anomalie(p_donnees jsonb, p_longueur numeric, p_hauteur_mur numeric)
returns text language plpgsql immutable set search_path = public as $$
declare v_largeur numeric; v_hauteur numeric; v_allege numeric;
begin
  if jsonb_typeof(p_donnees) <> 'object' or jsonb_typeof(p_donnees->'largeurMm') <> 'number'
     or jsonb_typeof(p_donnees->'hauteurMm') <> 'number' then
    return 'invalide';
  end if;
  v_largeur := (p_donnees->>'largeurMm')::numeric;
  v_hauteur := (p_donnees->>'hauteurMm')::numeric;
  if v_largeur <= 0 then return 'largeur_nulle'; end if;
  if v_hauteur <= 0 or v_hauteur > 20000 then return 'hauteur_incoherente'; end if;
  if jsonb_typeof(p_donnees->'allegeMm') = 'number' then
    v_allege := (p_donnees->>'allegeMm')::numeric;
    if v_allege < 0 then return 'hauteur_incoherente'; end if;
  elsif p_donnees ? 'allegeMm' and jsonb_typeof(p_donnees->'allegeMm') <> 'null' then
    return 'invalide';
  end if;
  if p_longueur is not null and v_largeur > p_longueur + 1 then return 'plus_large_que_mur'; end if;
  if p_hauteur_mur is not null and coalesce(v_allege, 0) + v_hauteur > p_hauteur_mur + 1 then return 'hauteur_incoherente'; end if;
  if p_donnees ? 'sens' and coalesce(p_donnees->>'sens', '') not in ('gauche','droite','coulissant','aucun') then return 'invalide'; end if;
  if p_donnees ? 'vantaux' and (jsonb_typeof(p_donnees->'vantaux') <> 'number' or (p_donnees->>'vantaux') not in ('1','2')) then return 'invalide'; end if;
  if p_donnees ? 'poussee' and coalesce(p_donnees->>'poussee', '') not in ('poussant','tirant') then return 'invalide'; end if;
  if p_donnees ? 'modele' and coalesce(p_donnees->>'modele', '') not in ('battant','oscillo_battant','coulissant','galandage','fixe') then return 'invalide'; end if;
  return null;
end;
$$;

-- Messages (identiques à `OPENING_ISSUE_MESSAGES` du domaine).
create or replace function public.tools_releve_plan_ouverture_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'hors_mur' then 'L''ouverture sort de son mur.'
    when 'plus_large_que_mur' then 'L''ouverture est plus large que son mur.'
    when 'chevauchement' then 'Deux ouvertures se chevauchent sur ce mur.'
    when 'jonction' then 'L''ouverture tombe sur une jonction de murs.'
    when 'largeur_nulle' then 'Largeur nulle : une ouverture a une largeur positive.'
    when 'hauteur_incoherente' then 'Hauteur incohérente : allège + hauteur dépassent la hauteur du mur.'
    else 'Ouverture invalide.' end;
$$;

-- ── 2. Cohérence des ouvertures ACTIVES des murs touchés ──────────────────────
-- Renvoie NULL, ou « code:id » de la première anomalie : hors_mur / plus_large_que_mur (ouverture
-- qui ne tient plus dans son mur), hauteur_incoherente, chevauchement (tolérance d'arrondi 1 mm).
create or replace function public.tools_releve_plan_murs_anomalie(p_plan_id uuid, p_murs uuid[])
returns text language sql stable security definer set search_path = public as $$
  with murs as (
    select m.id,
           sqrt(((m.donnees->'b'->>'x')::numeric - (m.donnees->'a'->>'x')::numeric) ^ 2
              + ((m.donnees->'b'->>'y')::numeric - (m.donnees->'a'->>'y')::numeric) ^ 2) as longueur,
           case when jsonb_typeof(m.donnees->'hauteurMm') = 'number' then (m.donnees->>'hauteurMm')::numeric end as hauteur
    from public.tools_releves_elements m
    where m.plan_id = p_plan_id and m.type = 'mur' and m.deleted_at is null and m.id = any(coalesce(p_murs, '{}'))
  ), ouv as (
    select o.id, o.parent_element_id as mur_id, (o.donnees->>'decalageMm')::numeric as debut,
           (o.donnees->>'decalageMm')::numeric + (o.donnees->>'largeurMm')::numeric as fin,
           (o.donnees->>'largeurMm')::numeric as largeur, o.donnees
    from public.tools_releves_elements o join murs on murs.id = o.parent_element_id
    where o.plan_id = p_plan_id and o.type = 'ouverture' and o.deleted_at is null
  ), anomalies as (
    select 1 as rang, case when ouv.largeur > murs.longueur + 1 then 'plus_large_que_mur' else 'hors_mur' end || ':' || ouv.id::text as code
    from ouv join murs on murs.id = ouv.mur_id
    where ouv.debut < 0 or ouv.fin > murs.longueur + 1
    union all
    select 2, 'hauteur_incoherente:' || ouv.id::text
    from ouv join murs on murs.id = ouv.mur_id
    where murs.hauteur is not null
      and coalesce(case when jsonb_typeof(ouv.donnees->'allegeMm') = 'number' then (ouv.donnees->>'allegeMm')::numeric end, 0)
          + (ouv.donnees->>'hauteurMm')::numeric > murs.hauteur + 1
    union all
    select 3, 'chevauchement:' || b.id::text
    from ouv a join ouv b on a.mur_id = b.mur_id and a.id < b.id
    where a.debut < b.fin - 1 and b.debut < a.fin - 1
  )
  select code from anomalies order by rang, code limit 1;
$$;

-- ── 3. Enregistrement par lot : Lot 5 + contrôles des ouvertures ──────────────
-- Corps identique à 20260927000901 (§7), avec : validation de chaque ouverture envoyée
-- (`tools_releve_plan_ouverture_anomalie`) et, après écriture, cohérence des ouvertures actives des
-- murs touchés (`tools_releve_plan_murs_anomalie`). Toute anomalie annule le lot entier (22023).
create or replace function public.tools_releve_plan_enregistrer(p_plan_id uuid, p_revision bigint, p_modifications jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan public.tools_releves_plans; v_mods jsonb := coalesce(p_modifications, '{}'::jsonb);
  v_item jsonb; v_id uuid; v_piece uuid; v_existant public.tools_releves_elements; v_mur public.tools_releves_elements;
  v_longueur numeric; v_murs integer := 0; v_ouvertures integer := 0; v_supprimes integer := 0;
  v_contours jsonb; v_champs text[] := '{}'; v_n integer;
  -- Lot 6
  v_code text; v_murs_touches uuid[] := '{}';
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
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été écrasé' using errcode = 'PT409', detail = v_plan.revision::text;
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
    v_murs_touches := v_murs_touches || v_id;
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
    -- Lot 6 : largeur, hauteur, allège, menuiserie ; allège + hauteur ≤ hauteur du mur hôte.
    v_code := public.tools_releve_plan_ouverture_anomalie(v_item->'donnees', v_longueur,
      case when jsonb_typeof(v_mur.donnees->'hauteurMm') = 'number' then (v_mur.donnees->>'hauteurMm')::numeric end);
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_ouverture_message(v_code) using errcode = '22023', detail = v_code || ':' || v_id::text;
    end if;
    v_murs_touches := v_murs_touches || v_mur.id;
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

  -- Lot 6 : sur chaque mur touché par le lot (mur modifié, hôte d'une ouverture envoyée), les
  -- ouvertures ACTIVES tiennent dans le mur, ne se chevauchent pas et restent sous sa hauteur —
  -- y compris celles qui ne sont pas dans le lot (mur raccourci ou abaissé sans elles).
  v_code := public.tools_releve_plan_murs_anomalie(v_plan.id, v_murs_touches);
  if v_code is not null then
    raise exception '%', public.tools_releve_plan_ouverture_message(split_part(v_code, ':', 1)) using errcode = '22023', detail = v_code;
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

-- ── 4. Lecture de la géométrie d'un plan (performance, même périmètre que la RLS) ─
create or replace function public.tools_releve_plan_elements(p_plan_id uuid)
returns table (id uuid, type text, piece_id uuid, parent_element_id uuid, donnees jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_releve uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select p.releve_id into v_releve from public.tools_releves_plans p where p.id = p_plan_id;
  -- Même décision que la policy `tools_releves_elements_select` : tools_releve_peut(releve_id, 'view').
  if v_releve is null or not public.tools_releve_peut(v_releve, 'view') then
    raise exception 'Plan introuvable ou non accessible' using errcode = '42501';
  end if;
  return query
    select x.id, x.type, x.piece_id, x.parent_element_id, x.donnees
    from public.tools_releves_elements x
    where x.plan_id = p_plan_id and x.releve_id = v_releve and x.deleted_at is null
    order by x.id;
end;
$$;
revoke all on function public.tools_releve_plan_elements(uuid) from public, anon;
grant execute on function public.tools_releve_plan_elements(uuid) to authenticated;

revoke all on function public.tools_releve_plan_ouverture_anomalie(jsonb, numeric, numeric) from public, anon;
revoke all on function public.tools_releve_plan_ouverture_message(text) from public, anon;
revoke all on function public.tools_releve_plan_murs_anomalie(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.tools_releve_plan_ouverture_anomalie(jsonb, numeric, numeric) to authenticated, service_role;
grant execute on function public.tools_releve_plan_ouverture_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_plan_murs_anomalie(uuid, uuid[]) to service_role;
-- Mêmes droits qu'au Lot 5 (create or replace les conserve ; réaffirmés pour la lisibilité).
revoke all on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) from public, anon;
grant execute on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
