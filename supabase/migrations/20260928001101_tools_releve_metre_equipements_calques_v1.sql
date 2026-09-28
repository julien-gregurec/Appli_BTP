-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 7 — MOBILIER, ÉQUIPEMENTS & CALQUES V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT7_EQUIPEMENTS_CALQUES_V1.md
--
-- Posée APRÈS le Lot 6 (20260928001001). Plage 11xx réservée au Lot 7.
--
-- Strictement ADDITIF (aucune table, aucune colonne ; aucune ligne existante invalidée ni réécrite ;
-- aucune garde affaiblie) :
--   1. Les ÉQUIPEMENTS (type d'élément `equipement`, existant depuis le Lot 2) peuvent appartenir à un
--      plan (`plan_id`) : la contrainte `tools_releves_elements_plan_type` admet désormais
--      ('mur','ouverture','equipement'). Toutes les gardes de plan du Lot 5 s'appliquent sans changement
--      (même étage que le plan, plan figé immuable, suppression douce seulement en cascade).
--   2. Catégories d'équipement : sur-ensemble de 604 / 801 (mobilier, electricite, plomberie, cvc,
--      eclairage, autre) + sanitaire, cuisine, securite, rangement, technique. Le contrôle générique des
--      éléments (`tools_releve_element_donnees_valides`) est redéfini À L'IDENTIQUE de 801, seule la
--      liste des catégories s'allonge : toute charge valide avant l'est encore.
--   3. Attributs d'objet de plan (clés de `donnees`, contrôlées par `tools_releve_plan_equipement_anomalie`
--      à l'enregistrement du plan) : objet (catalogue), libelle, position, rotationRad, largeurMm,
--      profondeurMm, hauteurMm, niveauMm (cote de pose au-dessus du sol fini), commentaire, visible,
--      verrouille, pieceAuto, murId / face / decalageMm (liaison au mur), etatProjet (existant,
--      a_deposer, nouveau, deplace), origineId (lignée).
--   4. `tools_releve_plan_enregistrer` redéfinie (même signature, mêmes droits) : Lot 6 à l'identique +
--      `equipements` (création, mise à jour, restauration d'un objet supprimé), objets verrouillés non
--      modifiables ni supprimables tant qu'ils le restent, liaison au mur contrôlée (mur actif du plan).
--   5. `tools_releve_plan_creer` redéfinie : un plan dérivé copie aussi les équipements (lignée
--      `origineId`, liaison au mur reportée sur la copie du mur).
--   6. `tools_releve_plan_contenu` redéfinie : les équipements entrent dans l'empreinte du gel. La clé
--      n'est ajoutée QUE si le plan en porte : l'empreinte des plans figés avant le Lot 7 reste
--      recalculable à l'identique.
--   7. Corbeille : `tools_releve_plan_equipements_supprimes` (SECURITY DEFINER, droit `view` contrôlé une
--      fois, même prédicat que la policy SELECT des éléments) liste les objets supprimés d'un plan pour
--      les restaurer.
--
-- RLS, droits des tables et isolation des tenants : inchangés.

-- ── 1. Contrat générique des éléments (801 + catégories Lot 7) ────────────────
create or replace function public.tools_releve_element_donnees_valides(p_type text, p_donnees jsonb)
returns boolean language sql immutable set search_path = public as $$
  -- `coalesce(…, false)` : une clé absente rend l'expression NULL, qu'un CHECK accepterait.
  select coalesce(jsonb_typeof(p_donnees) = 'object' and case p_type
    when 'mur' then jsonb_typeof(p_donnees->'a') = 'object' and jsonb_typeof(p_donnees->'b') = 'object'
      and jsonb_typeof(p_donnees->'a'->'x') = 'number' and jsonb_typeof(p_donnees->'a'->'y') = 'number'
      and jsonb_typeof(p_donnees->'b'->'x') = 'number' and jsonb_typeof(p_donnees->'b'->'y') = 'number'
      and jsonb_typeof(p_donnees->'epaisseurMm') = 'number' and (p_donnees->>'epaisseurMm')::numeric > 0
      and p_donnees->>'typeMur' in ('exterieur','porteur','cloison','doublage')
      and public.tools_releve_liste_uuid_valide(p_donnees->'piecesAdjacentesIds', 50)
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'materiauId')
    when 'ouverture' then jsonb_typeof(p_donnees->'decalageMm') = 'number' and (p_donnees->>'decalageMm')::numeric >= 0
      and jsonb_typeof(p_donnees->'largeurMm') = 'number' and (p_donnees->>'largeurMm')::numeric > 0
      and jsonb_typeof(p_donnees->'hauteurMm') = 'number' and (p_donnees->>'hauteurMm')::numeric > 0
      and p_donnees->>'typeOuverture' in ('porte','fenetre','porte_fenetre','baie','tremie','passage')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'metadata')
    -- Lot 7 : catégories étendues (sur-ensemble ordonné de 604 / 801).
    when 'equipement' then p_donnees->>'categorie' in ('mobilier','electricite','plomberie','cvc','eclairage','autre','sanitaire','cuisine','securite','rangement','technique')
      and jsonb_typeof(p_donnees->'position') = 'object' and coalesce(btrim(p_donnees->>'libelle'), '') <> ''
    when 'mesure' then jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'typeMesure' in ('longueur','largeur','hauteur','diagonale','distance','angle','surface','volume')
      and p_donnees->>'unite' in ('mm','rad','mm2','mm3')
      and p_donnees->>'source' in ('manuel','calcule','laser','photo','ar','lidar')
      and jsonb_typeof(p_donnees->'cible') = 'object'
    when 'photo_anchor' then coalesce(p_donnees->>'mediaId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_donnees->'ancre') = 'object'
      -- Lot 4
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_entier_facultatif_valide(p_donnees->'ordre', 0, 10000)
      and public.tools_releve_reperes_valides(p_donnees->'reperes')
    when 'annotation' then jsonb_typeof(p_donnees->'ancre') = 'object'
      and (p_donnees->'forme' is null or jsonb_typeof(p_donnees->'forme') = 'null'
           or p_donnees->>'forme' in ('texte','fleche','cercle','zone','cote','symbole','commentaire'))
      and jsonb_typeof(p_donnees->'texte') = 'string' and char_length(p_donnees->>'texte') <= 2000
      and (coalesce(p_donnees->>'forme', 'texte') not in ('texte','commentaire') or btrim(p_donnees->>'texte') <> '')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'geometrie')
      -- Lot 4
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_geometrie_photo_valide(p_donnees->>'forme', p_donnees->'geometrie')
    when 'materiau' then coalesce(btrim(p_donnees->>'libelle'), '') <> ''
      and p_donnees->>'categorie' in ('sol','mur','plafond','plinthe','menuiserie','autre')
      and p_donnees->>'unite' in ('m2','ml','m3','u')
      and (p_donnees->'revetement' is null or jsonb_typeof(p_donnees->'revetement') = 'null'
           or p_donnees->>'revetement' in ('peinture','carrelage','faience','parquet','stratifie','moquette','pvc','panneau_decoratif','papier_peint','enduit','beton','autre'))
    when 'quantite' then coalesce(btrim(p_donnees->>'cle'), '') <> '' and coalesce(btrim(p_donnees->>'formule'), '') <> ''
      and jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'unite' in ('m2','ml','m3','u') and p_donnees->>'qualite' in ('exacte','estimee')
      and (p_donnees->'sources' is null or (jsonb_typeof(p_donnees->'sources') = 'array'
           and jsonb_array_length(p_donnees->'sources') <= 50
           and not exists (select 1 from jsonb_array_elements(p_donnees->'sources') s where jsonb_typeof(s) <> 'object')))
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'gpOuvrageRef')
    else false
  end, false);
$$;

-- ── 2. Équipements rattachés à un plan ─────────────────────────────────────────
alter table public.tools_releves_elements drop constraint tools_releves_elements_plan_type;
alter table public.tools_releves_elements
  add constraint tools_releves_elements_plan_type check (plan_id is null or type in ('mur','ouverture','equipement'));

-- ── 3. Contrôle d'un objet de plan (miroir de `validatePlanEquipement`) ─────────
-- NULL si valide, sinon un code : categorie, objet, libelle, position, dimensions, rotation, niveau,
-- commentaire, etat_projet, invalide.
create or replace function public.tools_releve_plan_equipement_anomalie(p_donnees jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare v_num numeric;
begin
  if jsonb_typeof(p_donnees) <> 'object' then return 'invalide'; end if;
  if coalesce(p_donnees->>'categorie', '') not in ('mobilier','electricite','plomberie','cvc','eclairage','autre','sanitaire','cuisine','securite','rangement','technique') then
    return 'categorie';
  end if;
  if coalesce(p_donnees->>'objet', '') not in (
    'bureau','chaise','table','armoire','etagere','lit','canape','meuble',
    'placard','dressing',
    'wc','lavabo','douche','baignoire','urinoir','lave_mains',
    'evier','meuble_bas','meuble_haut','plan_travail','refrigerateur','four','plaque',
    'tableau_electrique','prise','interrupteur',
    'radiateur','climatiseur','vmc',
    'chauffe_eau','vanne',
    'extincteur','detecteur_fumee','baes',
    'chaudiere','compteur',
    'luminaire',
    'objet') then
    return 'objet';
  end if;
  if jsonb_typeof(p_donnees->'libelle') <> 'string' or btrim(p_donnees->>'libelle') = '' or char_length(p_donnees->>'libelle') > 200 then
    return 'libelle';
  end if;
  if not public.tools_releve_plan_point_valide(p_donnees->'position') then return 'position'; end if;
  if jsonb_typeof(p_donnees->'largeurMm') <> 'number' or jsonb_typeof(p_donnees->'profondeurMm') <> 'number'
     or (p_donnees->>'largeurMm')::numeric <= 0 or (p_donnees->>'largeurMm')::numeric > 50000
     or (p_donnees->>'profondeurMm')::numeric <= 0 or (p_donnees->>'profondeurMm')::numeric > 50000 then
    return 'dimensions';
  end if;
  if p_donnees ? 'hauteurMm' and jsonb_typeof(p_donnees->'hauteurMm') <> 'null' then
    if jsonb_typeof(p_donnees->'hauteurMm') <> 'number' then return 'dimensions'; end if;
    v_num := (p_donnees->>'hauteurMm')::numeric;
    if v_num <= 0 or v_num > 20000 then return 'dimensions'; end if;
  end if;
  if jsonb_typeof(p_donnees->'rotationRad') <> 'number' or abs((p_donnees->>'rotationRad')::numeric) > 6.2832 then return 'rotation'; end if;
  if p_donnees ? 'niveauMm' and jsonb_typeof(p_donnees->'niveauMm') <> 'null' then
    if jsonb_typeof(p_donnees->'niveauMm') <> 'number' then return 'niveau'; end if;
    v_num := (p_donnees->>'niveauMm')::numeric;
    if v_num < 0 or v_num > 20000 then return 'niveau'; end if;
  end if;
  if p_donnees ? 'commentaire' and jsonb_typeof(p_donnees->'commentaire') <> 'null'
     and (jsonb_typeof(p_donnees->'commentaire') <> 'string' or char_length(p_donnees->>'commentaire') > 2000) then
    return 'commentaire';
  end if;
  if p_donnees ? 'etatProjet' and coalesce(p_donnees->>'etatProjet', '') not in ('existant','a_deposer','nouveau','deplace') then
    return 'etat_projet';
  end if;
  if (p_donnees ? 'visible' and jsonb_typeof(p_donnees->'visible') <> 'boolean')
     or (p_donnees ? 'verrouille' and jsonb_typeof(p_donnees->'verrouille') <> 'boolean')
     or (p_donnees ? 'pieceAuto' and jsonb_typeof(p_donnees->'pieceAuto') <> 'boolean')
     or (p_donnees ? 'murId' and jsonb_typeof(p_donnees->'murId') <> 'null'
         and coalesce(p_donnees->>'murId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (p_donnees ? 'face' and jsonb_typeof(p_donnees->'face') <> 'null' and coalesce(p_donnees->>'face', '') not in ('gauche','droite'))
     or (p_donnees ? 'decalageMm' and jsonb_typeof(p_donnees->'decalageMm') <> 'null'
         and (jsonb_typeof(p_donnees->'decalageMm') <> 'number' or (p_donnees->>'decalageMm')::numeric < 0)) then
    return 'invalide';
  end if;
  return null;
end;
$$;

-- Messages (identiques à `EQUIPMENT_ISSUE_MESSAGES` du domaine).
create or replace function public.tools_releve_plan_equipement_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'categorie' then 'Catégorie d''objet inconnue.'
    when 'objet' then 'Type d''objet inconnu.'
    when 'libelle' then 'Un objet porte un libellé (200 caractères au plus).'
    when 'position' then 'Position de l''objet hors du repère.'
    when 'dimensions' then 'Dimensions de l''objet invalides : largeur et profondeur positives.'
    when 'rotation' then 'Rotation de l''objet invalide.'
    when 'niveau' then 'Niveau de pose invalide (0 à 20 m).'
    when 'commentaire' then 'Commentaire trop long (2 000 caractères au plus).'
    when 'etat_projet' then 'État projeté inconnu.'
    when 'mur_absent' then 'L''objet est lié à un mur absent du plan.'
    when 'verrouille' then 'Objet verrouillé : déverrouillez-le d''abord.'
    when 'piece' then 'Pièce absente de l''étage du plan.'
    else 'Objet invalide.' end;
$$;

-- ── 4. Contenu canonique d'un plan (empreinte du gel) ───────────────────────────
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
    -- Lot 7 : clé présente seulement si le plan porte des équipements (empreintes antérieures inchangées).
    || coalesce((select jsonb_build_object('equipements', jsonb_agg(jsonb_build_object('id', x.id, 'piece_id', x.piece_id, 'donnees', x.donnees) order by x.id))
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'equipement' and x.deleted_at is null having count(*) > 0), '{}'::jsonb)
  from public.tools_releves_plans p where p.id = p_plan_id;
$$;

-- ── 5. Création : Lot 5 + copie des équipements ─────────────────────────────────
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
    update public.tools_releves_elements set plan_id = v_plan.id
    where etage_id = p_etage_id and type = 'mur' and plan_id is null and deleted_at is null;
    get diagnostics v_adoptes = row_count;
    update public.tools_releves_elements o set plan_id = v_plan.id
    where o.etage_id = p_etage_id and o.type = 'ouverture' and o.plan_id is null and o.deleted_at is null
      and exists (select 1 from public.tools_releves_elements m where m.id = o.parent_element_id and m.plan_id = v_plan.id);
  else
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
    -- Lot 7 : équipements copiés (lignée ; liaison au mur reportée sur la copie du mur, retirée sinon).
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'equipement' and x.deleted_at is null order by x.id loop
      insert into public.tools_releves_elements (releve_id, type, etage_id, piece_id, plan_id, schema_version, donnees)
      values (r.releve_id, 'equipement', r.etage_id, r.piece_id, v_plan.id, r.schema_version,
              r.donnees || jsonb_build_object('origineId', r.id::text)
              || case when jsonb_typeof(r.donnees->'murId') = 'string'
                      then jsonb_build_object('murId', v_map->(r.donnees->>'murId'))
                      else '{}'::jsonb end);
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

-- ── 6. Enregistrement par lot : Lot 6 + équipements ─────────────────────────────
-- p_modifications.equipements = [{ id, pieceId?, donnees: { categorie, objet, libelle, position, rotationRad,
--   largeurMm, profondeurMm, hauteurMm?, niveauMm?, commentaire?, visible?, verrouille?, pieceAuto?,
--   murId?, face?, decalageMm?, etatProjet?, origineId? } }]   (création, mise à jour ou restauration)
-- Suppression : `supprimes` (générique). Objet verrouillé (avant ET après) : ni modifié, ni supprimé.
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
  -- Lot 7
  v_equipements integer := 0; v_equip_ids uuid[] := '{}'; v_supprimes_ids uuid[] := '{}';
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
     or jsonb_array_length(coalesce(v_mods->'equipements', '[]'::jsonb)) > 5000
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

  -- Lot 7 : équipements (objets du plan).
  for v_item in select value from jsonb_array_elements(coalesce(v_mods->'equipements', '[]'::jsonb)) loop
    v_id := (v_item->>'id')::uuid;
    v_piece := nullif(v_item->>'pieceId', '')::uuid;
    v_code := public.tools_releve_plan_equipement_anomalie(v_item->'donnees');
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_equipement_message(v_code) using errcode = '22023', detail = v_code || ':' || v_id::text;
    end if;
    if v_piece is not null and not exists (select 1 from public.tools_releves_pieces p
                                           where p.id = v_piece and p.etage_id = v_plan.etage_id and p.deleted_at is null) then
      raise exception '%', public.tools_releve_plan_equipement_message('piece') using errcode = '42501', detail = 'piece:' || v_id::text;
    end if;
    v_equip_ids := v_equip_ids || v_id;
    select * into v_existant from public.tools_releves_elements x where x.id = v_id;
    if v_existant.id is null then
      insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, plan_id, donnees)
      values (v_id, v_plan.releve_id, 'equipement', v_plan.etage_id, v_piece, v_plan.id, v_item->'donnees');
      v_equipements := v_equipements + 1;
    else
      if v_existant.plan_id is distinct from v_plan.id or v_existant.type <> 'equipement' then
        raise exception 'Élément étranger au plan : %', v_id using errcode = '42501';
      end if;
      if v_existant.donnees is distinct from v_item->'donnees' or v_existant.piece_id is distinct from v_piece or v_existant.deleted_at is not null then
        -- Verrou : un objet verrouillé qui le reste ne change pas (seul le déverrouillage passe).
        if v_existant.deleted_at is null and v_existant.donnees->'verrouille' = 'true'::jsonb
           and v_item->'donnees'->'verrouille' = 'true'::jsonb then
          raise exception '%', public.tools_releve_plan_equipement_message('verrouille') using errcode = '22023', detail = 'verrouille:' || v_id::text;
        end if;
        update public.tools_releves_elements set donnees = v_item->'donnees', piece_id = v_piece, deleted_at = null where id = v_id;
        v_equipements := v_equipements + 1;
      end if;
    end if;
  end loop;

  -- Suppressions (douces, restaurables : la cascade Lot 2 emporte les ouvertures d'un mur).
  if jsonb_typeof(v_mods->'supprimes') = 'array' then
    select coalesce(array_agg((s #>> '{}')::uuid), '{}') into v_supprimes_ids from jsonb_array_elements(v_mods->'supprimes') s;
    -- Lot 7 : un objet verrouillé ne se supprime pas.
    select x.id::text into v_code from public.tools_releves_elements x
    where x.plan_id = v_plan.id and x.type = 'equipement' and x.deleted_at is null and x.id = any(v_supprimes_ids)
      and x.donnees->'verrouille' = 'true'::jsonb limit 1;
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_equipement_message('verrouille') using errcode = '22023', detail = 'verrouille:' || v_code;
    end if;
    update public.tools_releves_elements set deleted_at = now()
    where plan_id = v_plan.id and deleted_at is null and id = any(v_supprimes_ids);
    get diagnostics v_supprimes = row_count;
  end if;

  -- Lot 6 : cohérence des ouvertures des murs touchés.
  v_code := public.tools_releve_plan_murs_anomalie(v_plan.id, v_murs_touches);
  if v_code is not null then
    raise exception '%', public.tools_releve_plan_ouverture_message(split_part(v_code, ':', 1)) using errcode = '22023', detail = v_code;
  end if;

  -- Lot 7 : liaison au mur — les objets envoyés, et ceux liés à un mur supprimé dans ce lot, sont liés
  -- à un mur ACTIF du plan (ou à aucun).
  select e.id::text into v_code from public.tools_releves_elements e
  where e.plan_id = v_plan.id and e.type = 'equipement' and e.deleted_at is null
    and jsonb_typeof(e.donnees->'murId') = 'string'
    and (e.id = any(v_equip_ids) or (e.donnees->>'murId') = any(v_supprimes_ids::text[]))
    and not exists (select 1 from public.tools_releves_elements m where m.id::text = e.donnees->>'murId'
                      and m.plan_id = v_plan.id and m.type = 'mur' and m.deleted_at is null)
  limit 1;
  if v_code is not null then
    raise exception '%', public.tools_releve_plan_equipement_message('mur_absent') using errcode = '22023', detail = 'mur_absent:' || v_code;
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
  if v_equipements > 0 then v_champs := v_champs || 'equipements'::text; end if;
  if v_supprimes > 0 then v_champs := v_champs || 'supprimes'::text; end if;

  update public.tools_releves_plans set
    contours = v_contours,
    cadre = case when v_mods ? 'cadre' then v_mods->'cadre' else cadre end,
    reglages = case when v_mods ? 'reglages' then v_mods->'reglages' else reglages end
  where id = v_plan.id
  returning * into v_plan;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', v_champs, auth.uid(),
          jsonb_build_object('murs', v_murs, 'ouvertures', v_ouvertures, 'equipements', v_equipements, 'supprimes', v_supprimes));

  return jsonb_build_object('revision', v_plan.revision, 'murs', v_murs, 'ouvertures', v_ouvertures, 'equipements', v_equipements,
                            'supprimes', v_supprimes, 'contours', v_plan.contours);
end;
$$;

-- ── 7. Corbeille : objets supprimés d'un plan (restauration) ────────────────────
create or replace function public.tools_releve_plan_equipements_supprimes(p_plan_id uuid)
returns table (id uuid, piece_id uuid, donnees jsonb, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_releve uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select p.releve_id into v_releve from public.tools_releves_plans p where p.id = p_plan_id;
  if v_releve is null or not public.tools_releve_peut(v_releve, 'view') then
    raise exception 'Plan introuvable ou non accessible' using errcode = '42501';
  end if;
  return query
    select x.id, x.piece_id, x.donnees, x.deleted_at
    from public.tools_releves_elements x
    where x.plan_id = p_plan_id and x.releve_id = v_releve and x.type = 'equipement' and x.deleted_at is not null
    order by x.deleted_at desc, x.id
    limit 500;
end;
$$;

revoke all on function public.tools_releve_plan_equipement_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_plan_equipement_message(text) from public, anon;
revoke all on function public.tools_releve_plan_equipements_supprimes(uuid) from public, anon;
grant execute on function public.tools_releve_plan_equipement_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_plan_equipement_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_plan_equipements_supprimes(uuid) to authenticated;
-- Mêmes droits qu'aux Lots 5 / 6 (create or replace les conserve ; réaffirmés pour la lisibilité).
revoke all on function public.tools_releve_plan_contenu(uuid) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_creer(uuid, text, uuid, text) from public, anon;
revoke all on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) from public, anon;
grant execute on function public.tools_releve_plan_creer(uuid, text, uuid, text) to authenticated;
grant execute on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
