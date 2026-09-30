-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 9 — QUANTITATIFS, OUVRAGES & TAKEOFF AUTOMATIQUE V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT9_QUANTITATIFS_OUVRAGES_V1.md
--
-- Posée APRÈS le Lot 8 (20260928001201). Plage 13xx réservée au Lot 9.
--
-- Strictement ADDITIF (aucune ligne existante invalidée ni réécrite ; aucune garde affaiblie) :
--   1. OUVRAGES techniques (`tools_releves_ouvrages`) rattachés à un plan : nom, catégorie, lot, unité, règle
--      de quantité (source + opérations), perte, arrondi, pièces visées, état projeté, commentaire, origine
--      (auto / manuelle, dérivée de la source), audit (auteur, dates, révision, suppression douce).
--   2. BIBLIOTHÈQUE d'ouvrages réutilisables par entreprise (`tools_releves_ouvrages_bibliotheque`) :
--      ouvrage, unité, règle de quantité — JAMAIS de prix (toute clé de prix est refusée).
--   3. MOTEUR de quantités DÉTERMINISTE (`tools_releve_quantitatif_evaluer`, fonction pure) : aucune
--      exécution de code, un langage d'opérations fermé (coefficient, entraxe, longueur / surface unitaire,
--      hauteur, épaisseur, ajout, ratio kg), analyse dimensionnelle (u, ml, m², m³, kg, forfait) : aucune
--      conversion implicite. Arithmétique entière en micro-unités, arrondi « moitié loin de zéro ».
--      Miroir TypeScript : packages/releve-domain/src/quantitatif.ts (parité sur valeurs fixes).
--   4. Sources dérivées du MÉTRÉ du Lot 8 (surfaces, périmètres, volume, faces, ouvertures, objets,
--      revêtements) et des murs du plan : quantités séparées par état projeté (existant / dépose / neuf /
--      déplacé). Le serveur calcule ; aucune quantité envoyée par le client n'est crue.
--   5. AJUSTEMENTS de quantité (`tools_releves_quantitatif_ajustements`) : quantité calculée (par le
--      serveur), quantité retenue, raison obligatoire, auteur, date, retrait tracé, journal. Jamais
--      d'écrasement silencieux.
--   6. ANOMALIES (préparation du futur module Erreurs) : quantité négative, surface impossible, unité
--      incohérente, source absente, formule invalide, objet supprimé, métré obsolète.
--   7. GEL : le quantitatif est figé avec le plan (`tools_releves_plans.quantitatif`, immuable ensuite par
--      la garde du Lot 5). Plan dérivé : ouvrages copiés (lignée), ajustements NON copiés.
--
-- RLS : nouvelles tables en lecture seule pour `authenticated`, écriture par RPC seulement.
-- RGPD : `entreprise_id` présent → export et purge génériques.

-- ── 0. Arithmétique exacte (micro-unités entières) ────────────────────────────
-- Division entière arrondie « moitié loin de zéro » (comme round() de PostgreSQL), exacte : div / mod.
create or replace function public.tools_releve_qt_rdiv(p_n numeric, p_d numeric)
returns numeric language sql immutable set search_path = public as $$
  select case when p_d is null or p_n is null or p_d = 0 then null
    else div(p_n, p_d) + case when abs(mod(p_n, p_d)) * 2 >= abs(p_d) then sign(p_n) * sign(p_d) else 0 end end;
$$;

-- Nombre décimal JSON à au plus `p_decimales` décimales (aucune précision cachée).
create or replace function public.tools_releve_qt_decimal_valide(p jsonb, p_decimales int, p_min numeric, p_max numeric)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p) = 'number'
    and (p #>> '{}')::numeric between p_min and p_max
    and (p #>> '{}')::numeric = round((p #>> '{}')::numeric, p_decimales), false);
$$;

-- ── 1. Contrat d'un ouvrage (miroir `ouvrageAnomalie`, messages identiques) ────
create or replace function public.tools_releve_ouvrage_anomalie(p jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_regle jsonb; v_src text; v_dim text; v_op jsonb; v_v numeric; v_f jsonb; v_k text; v_n int; v_ids jsonb;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_etats constant text[] := array['existant','a_deposer','nouveau','deplace'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'invalide'; end if;
  -- Aucun prix dans Tools : toute clé évoquant un prix est refusée, où qu'elle soit.
  if p::text ~* '"[^"]*(prix|price|tarif|montant|cout|coût)[^"]*"\s*:' then return 'prix'; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in
      ('nom','code','categorie','lot','unite','regle','pertePourcent','arrondi','pieceIds','etatTravaux','etats','commentaire')) then
    return 'invalide';
  end if;
  if coalesce(jsonb_typeof(p->'nom'), '') <> 'string' or char_length(btrim(p->>'nom')) not between 1 and 160 then return 'nom'; end if;
  if p ? 'code' and p->'code' <> 'null'::jsonb
     and (jsonb_typeof(p->'code') <> 'string' or (p->>'code') !~ '^[A-Za-z0-9._-]{1,40}$') then return 'code'; end if;
  if coalesce(p->>'categorie', '') not in ('cloisons','doublages','plafonds','sols','peinture','faience','carrelage','plinthes','profiles',
      'portes','fenetres','sanitaires','mobilier','electricite','cvc','plomberie','demolition','depose','autre') then return 'categorie'; end if;
  if p ? 'lot' and p->'lot' <> 'null'::jsonb and (jsonb_typeof(p->'lot') <> 'string' or char_length(p->>'lot') > 80) then return 'lot'; end if;
  if coalesce(p->>'unite', '') not in ('u','ml','m2','m3','kg','forfait') then return 'unite'; end if;
  if not public.tools_releve_qt_decimal_valide(p->'pertePourcent', 2, 0, 100) then return 'perte'; end if;
  if coalesce(jsonb_typeof(p->'arrondi'), '') <> 'object'
     or exists (select 1 from jsonb_object_keys(p->'arrondi') k where k not in ('mode','pas'))
     or coalesce(p->'arrondi'->>'mode', '') not in ('aucun','superieur','inferieur','proche')
     or (p->'arrondi'->>'mode' <> 'aucun' and not (public.tools_releve_qt_decimal_valide(p->'arrondi'->'pas', 6, 0.000001, 1000000)))
     or (p->'arrondi'->>'mode' = 'aucun' and p->'arrondi' ? 'pas' and p->'arrondi'->'pas' <> 'null'::jsonb
         and not public.tools_releve_qt_decimal_valide(p->'arrondi'->'pas', 6, 0.000001, 1000000)) then
    return 'arrondi';
  end if;
  if coalesce(p->>'etatTravaux', '') <> all (v_etats)
     or coalesce(jsonb_typeof(p->'etats'), '') <> 'array' or jsonb_array_length(p->'etats') not between 1 and 4
     or exists (select 1 from jsonb_array_elements(p->'etats') e where jsonb_typeof(e) <> 'string' or (e #>> '{}') <> all (v_etats))
     or (select count(distinct e #>> '{}') from jsonb_array_elements(p->'etats') e) <> jsonb_array_length(p->'etats') then
    return 'etats';
  end if;
  v_ids := p->'pieceIds';
  if v_ids is not null and v_ids <> 'null'::jsonb and (
       jsonb_typeof(v_ids) <> 'array' or jsonb_array_length(v_ids) not between 1 and 500
       or exists (select 1 from jsonb_array_elements(v_ids) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ v_uuid)
       or (select count(distinct e #>> '{}') from jsonb_array_elements(v_ids) e) <> jsonb_array_length(v_ids)) then
    return 'pieces';
  end if;
  if p ? 'commentaire' and p->'commentaire' <> 'null'::jsonb
     and (jsonb_typeof(p->'commentaire') <> 'string' or char_length(p->>'commentaire') > 1000) then return 'commentaire'; end if;

  -- Règle de quantité.
  v_regle := p->'regle';
  if coalesce(jsonb_typeof(v_regle), '') <> 'object'
     or exists (select 1 from jsonb_object_keys(v_regle) k where k not in ('source','filtre','valeur','operations')) then
    return 'formule_invalide';
  end if;
  v_src := v_regle->>'source';
  if coalesce(v_src, '') not in ('surface_sol','surface_murs','surface_plafond','perimetre_brut','perimetre_utile','longueur_murs',
      'surface_murs_plan','nombre_ouvertures','surface_ouvertures','volume','nombre_equipements','quantite_revetement','forfait','saisie') then
    return 'source';
  end if;
  v_f := case when v_regle->'filtre' is null or v_regle->'filtre' = 'null'::jsonb then '{}'::jsonb else v_regle->'filtre' end;
  if jsonb_typeof(v_f) <> 'object' then return 'filtre'; end if;
  for v_k in select k from jsonb_object_keys(v_f) k loop
    if not ((v_src in ('nombre_ouvertures','surface_ouvertures') and v_k = 'typesOuverture')
            or (v_src = 'nombre_equipements' and v_k in ('categories','objets'))
            or (v_src = 'quantite_revetement' and v_k in ('support','familles'))) then
      return 'filtre';
    end if;
    if v_k = 'support' then
      if coalesce(v_f->>'support', '') not in ('sol','mur','plafond','plinthe') then return 'filtre'; end if;
      continue;
    end if;
    if jsonb_typeof(v_f->v_k) <> 'array' or jsonb_array_length(v_f->v_k) not between 1 and 40
       or (select count(distinct e #>> '{}') from jsonb_array_elements(v_f->v_k) e) <> jsonb_array_length(v_f->v_k)
       or exists (select 1 from jsonb_array_elements(v_f->v_k) e where jsonb_typeof(e) <> 'string' or not (
            case v_k
              when 'typesOuverture' then (e #>> '{}') in ('porte','fenetre','porte_fenetre','baie','tremie','passage')
              when 'categories' then (e #>> '{}') in ('mobilier','sanitaire','cuisine','electricite','cvc','plomberie','securite','rangement','technique','eclairage','autre')
              else (e #>> '{}') ~ '^[a-z][a-z0-9_]{0,39}$' end)) then
      return 'filtre';
    end if;
  end loop;
  if v_src = 'quantite_revetement' and not (v_f ? 'support') then return 'filtre'; end if;
  if v_src = 'saisie' then
    if not public.tools_releve_qt_decimal_valide(v_regle->'valeur', 6, 0, 1000000000) then return 'valeur'; end if;
  elsif v_src = 'forfait' then
    if v_regle ? 'valeur' and v_regle->'valeur' <> 'null'::jsonb
       and not public.tools_releve_qt_decimal_valide(v_regle->'valeur', 6, 0.000001, 1000000) then return 'valeur'; end if;
  elsif v_regle ? 'valeur' and v_regle->'valeur' <> 'null'::jsonb then
    return 'valeur';
  end if;

  -- Analyse dimensionnelle : la source fixe l'unité de départ, chaque opération la transforme
  -- explicitement ; le résultat doit être l'unité déclarée (aucune conversion implicite).
  v_dim := case
    when v_src in ('surface_sol','surface_murs','surface_plafond','surface_murs_plan','surface_ouvertures') then 'm2'
    when v_src in ('perimetre_brut','perimetre_utile','longueur_murs') then 'ml'
    when v_src = 'volume' then 'm3'
    when v_src in ('nombre_ouvertures','nombre_equipements') then 'u'
    when v_src = 'quantite_revetement' then case when v_f->>'support' = 'plinthe' then 'ml' else 'm2' end
    when v_src = 'forfait' then 'forfait'
    else p->>'unite' end;
  if v_regle ? 'operations' and v_regle->'operations' <> 'null'::jsonb then
    if jsonb_typeof(v_regle->'operations') <> 'array' or jsonb_array_length(v_regle->'operations') > 8 then return 'formule_invalide'; end if;
    for v_op in select value from jsonb_array_elements(v_regle->'operations') loop
      if jsonb_typeof(v_op) <> 'object'
         or exists (select 1 from jsonb_object_keys(v_op) k where k not in ('op','valeur'))
         or coalesce(v_op->>'op', '') not in ('coefficient','entraxe','longueur_unitaire','surface_unitaire','hauteur','epaisseur','ajouter','ratio_kg') then
        return 'formule_invalide';
      end if;
      if v_op->>'op' = 'ajouter' then
        if not public.tools_releve_qt_decimal_valide(v_op->'valeur', 6, -1000000, 1000000) or (v_op->>'valeur')::numeric = 0 then return 'formule_invalide'; end if;
      elsif not public.tools_releve_qt_decimal_valide(v_op->'valeur', 6, 0.000001, 1000000) then
        return 'formule_invalide';
      end if;
      v_dim := case v_op->>'op'
        when 'coefficient' then v_dim
        when 'ajouter' then v_dim
        when 'entraxe' then case when v_dim = 'ml' then 'u' end
        when 'longueur_unitaire' then case when v_dim = 'ml' then 'u' end
        when 'surface_unitaire' then case when v_dim = 'm2' then 'u' end
        when 'hauteur' then case when v_dim = 'ml' then 'm2' end
        when 'epaisseur' then case when v_dim = 'm2' then 'm3' end
        when 'ratio_kg' then case when v_dim in ('u','ml','m2','m3') then 'kg' end end;
      if v_dim is null then return 'unite_incoherente'; end if;
    end loop;
  end if;
  if v_dim <> p->>'unite' then return 'unite_incoherente'; end if;
  return null;
end;
$$;

create or replace function public.tools_releve_ouvrage_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'invalide' then 'Ouvrage invalide.'
    when 'prix' then 'Aucun prix dans Tools : un ouvrage décrit la prestation, son unité et sa règle de quantité.'
    when 'nom' then 'Nom de l''ouvrage obligatoire (160 caractères au plus).'
    when 'code' then 'Code d''ouvrage : lettres, chiffres, point, tiret (40 caractères au plus).'
    when 'categorie' then 'Catégorie d''ouvrage inconnue.'
    when 'lot' then 'Lot : 80 caractères au plus.'
    when 'unite' then 'Unité inconnue (u, ml, m², m³, kg, forfait).'
    when 'perte' then 'Perte entre 0 et 100 % (deux décimales au plus).'
    when 'arrondi' then 'Arrondi invalide : mode inconnu ou pas absent, nul ou trop précis.'
    when 'etats' then 'États projetés invalides.'
    when 'pieces' then 'Pièces visées invalides.'
    when 'commentaire' then 'Commentaire : 1 000 caractères au plus.'
    when 'source' then 'Source de quantité inconnue.'
    when 'filtre' then 'Filtre de source invalide.'
    when 'valeur' then 'Valeur saisie invalide (positive, six décimales au plus).'
    when 'formule_invalide' then 'Formule invalide : opération inconnue, valeur nulle, négative ou trop précise, ou plus de 8 opérations.'
    when 'unite_incoherente' then 'Unité incohérente : la formule ne produit pas l''unité déclarée (aucune conversion implicite).'
    when 'piece' then 'Pièce visée absente de l''étage du plan.'
    else 'Ouvrage invalide.' end;
$$;

-- Messages des anomalies de quantitatif (futur module Erreurs ; miroir `QUANTITATIF_ANOMALIE_MESSAGES`).
create or replace function public.tools_releve_quantitatif_anomalie_message(p_code text, p_detail text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'formule_invalide' then public.tools_releve_ouvrage_message(p_detail)
    when 'unite_incoherente' then public.tools_releve_ouvrage_message(p_detail)
    when 'quantite_negative' then 'Quantité négative : vérifiez la formule (ajout négatif ?).'
    when 'surface_impossible' then 'Surface impossible (nulle, négative ou démesurée) : vérifiez le contour, les ouvertures ou la saisie.'
    when 'source_absente' then case p_detail
      when 'aucune_donnee' then 'Source absente : aucune donnée du plan ne correspond à cet ouvrage.'
      when 'piece_sans_contour' then 'Source absente : pièce visée sans contour sur ce plan.'
      else 'Source absente : quantité non calculable pour certains éléments (hauteur inconnue, pièce sans contour…).' end
    when 'objet_supprime' then case p_detail
      when 'piece_supprimee' then 'Objet supprimé : pièce visée supprimée.'
      else 'Objet supprimé : ajustement sans ligne correspondante (élément ou pièce disparu).' end
    when 'metre_obsolete' then case p_detail
      when 'ajustement_perime' then 'Métré obsolète : le calcul a changé depuis l''ajustement, quantité retenue à revoir.'
      else 'Métré obsolète : la valeur source porte un ajustement de métré périmé.' end
    else 'Anomalie de quantitatif.' end;
$$;

-- ── 2. Moteur : application d'une règle à une unité source ────────────────────
-- Entrée et sorties en micro-unités entières (1e-6 de l'unité). Retour : {brute, avec perte, calculée en
-- milli-unités (3 décimales)}. Ordre fixe : opérations → perte → arrondi → 3 décimales.
create or replace function public.tools_releve_qt_appliquer(p_base numeric, p_regle jsonb, p_perte numeric, p_arrondi jsonb)
returns numeric[] language plpgsql immutable set search_path = public as $$
declare v_q numeric := p_base; v_op jsonb; v_k numeric; v_q2 numeric; v_mode text; v_s numeric; v_c numeric;
begin
  if v_q is null then return array[null, null, null]::numeric[]; end if;
  for v_op in select value from jsonb_array_elements(coalesce(nullif(p_regle->'operations', 'null'::jsonb), '[]'::jsonb)) loop
    v_k := round((v_op->>'valeur')::numeric * 1000000);
    if v_op->>'op' in ('coefficient','hauteur','epaisseur','ratio_kg') then v_q := public.tools_releve_qt_rdiv(v_q * v_k, 1000000);
    elsif v_op->>'op' in ('entraxe','longueur_unitaire','surface_unitaire') then v_q := public.tools_releve_qt_rdiv(v_q * 1000000, v_k);
    elsif v_op->>'op' = 'ajouter' then v_q := v_q + v_k;
    end if;
  end loop;
  v_q2 := public.tools_releve_qt_rdiv(v_q * (10000 + round(coalesce(p_perte, 0) * 100)), 10000);
  v_mode := coalesce(p_arrondi->>'mode', 'aucun');
  v_c := v_q2;
  if v_mode <> 'aucun' then
    v_s := round((p_arrondi->>'pas')::numeric * 1000000);
    if v_mode = 'superieur' then v_c := (div(v_q2, v_s) + case when mod(v_q2, v_s) > 0 then 1 else 0 end) * v_s;
    elsif v_mode = 'inferieur' then v_c := (div(v_q2, v_s) - case when mod(v_q2, v_s) < 0 then 1 else 0 end) * v_s;
    else v_c := public.tools_releve_qt_rdiv(v_q2, v_s) * v_s;
    end if;
  end if;
  return array[v_q, v_q2, public.tools_releve_qt_rdiv(v_c, 1000)];
end;
$$;

-- ── 3. Moteur : évaluation pure d'un quantitatif ──────────────────────────────
-- Entrée : { metre (forme `tools_releve_plan_metre_calcul`), ouvrages [{id, …contrat}], ajustements
-- [{id, ouvrageId, pieceId, etatProjet, valeurCalculee, valeurRetenue, raison, auteurId, date}],
-- murs [{id, longueurMm, hauteurMm, etatProjet}], piecesSupprimees [id] }.
-- Sortie : { lignes, anomalies } dans un ordre total (ouvrage, pièce — étage en dernier —, état).
-- Unités d'évaluation : chaque pièce (sources de pièce, forfait / saisie ciblés), chaque mur, ouverture,
-- objet ou revêtement ; lignes = somme par (ouvrage, pièce, état). Un mur / une ouverture partagé(e)
-- par plusieurs pièces est rattaché(e) à l'étage (pièce nulle) et annoté(e), jamais compté deux fois.
create or replace function public.tools_releve_quantitatif_evaluer(p_entree jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with
  metre as (select coalesce(p_entree->'metre', '{}'::jsonb) as m),
  ouv_all as (
    select o.value as o, (o.ordinality - 1)::int as idx, o.value->>'id' as id, o.value->'regle'->>'source' as src,
           coalesce(nullif(o.value->'regle'->'filtre', 'null'::jsonb), '{}'::jsonb) as f,
           nullif(o.value->'pieceIds', 'null'::jsonb) as scope,
           public.tools_releve_ouvrage_anomalie(o.value - 'id') as code
    from jsonb_array_elements(coalesce(p_entree->'ouvrages', '[]'::jsonb)) with ordinality o
  ),
  ouv as (
    select ouv_all.*, o->>'unite' as unite, case
      when src in ('surface_sol','surface_murs','surface_plafond','surface_murs_plan','surface_ouvertures') then 'm2'
      when src in ('perimetre_brut','perimetre_utile','longueur_murs') then 'ml'
      when src = 'volume' then 'm3'
      when src in ('nombre_ouvertures','nombre_equipements') then 'u'
      when src = 'quantite_revetement' then case when f->>'support' = 'plinthe' then 'ml' else 'm2' end
      when src = 'forfait' then 'forfait'
      else o->>'unite' end as unite_source
    from ouv_all where code is null),
  rooms as (select r.value as r, r.value->>'pieceId' as pid from metre, jsonb_array_elements(coalesce(metre.m->'pieces', '[]'::jsonb)) r),
  room_ouv as (select ro.value->>'id' as oid, count(*) as n, min(rooms.pid) as pid
               from rooms, jsonb_array_elements(coalesce(rooms.r->'ouvertures', '[]'::jsonb)) ro group by 1),
  room_mur as (select t.mid, count(*) as n, min(t.pid) as pid from (
                 select distinct f.value->>'murId' as mid, rooms.pid from rooms, jsonb_array_elements(coalesce(rooms.r->'faces', '[]'::jsonb)) f
                 where f.value->>'murId' is not null) t group by 1),
  units as (
    select 'piece'::text as kind, rooms.pid as piece_id, null::text as etat, rooms.r as m, null::text as annot from rooms
    union all
    select 'global', null, null, '{}'::jsonb, null
    union all
    select 'mur', case when c.n = 1 then c.pid end, coalesce(w.value->>'etatProjet', 'existant'), w.value,
           case when c.n is null then 'hors_piece' when c.n > 1 then 'partage' end
    from jsonb_array_elements(coalesce(p_entree->'murs', '[]'::jsonb)) w left join room_mur c on c.mid = w.value->>'id'
    union all
    select 'ouverture', case when c.n = 1 then c.pid end, coalesce(o.value->>'etatProjet', 'existant'), o.value,
           case when c.n is null then 'hors_piece' when c.n > 1 then 'partage' end
    from metre, jsonb_array_elements(coalesce(metre.m->'ouvertures', '[]'::jsonb)) o left join room_ouv c on c.oid = o.value->>'id'
    union all
    select 'equipement', e.value->>'pieceId', coalesce(e.value->>'etatProjet', 'existant'), e.value,
           case when e.value->>'pieceId' is null then 'hors_piece' end
    from metre, jsonb_array_elements(coalesce(metre.m->'equipements', '[]'::jsonb)) e
    union all
    select 'revetement', r.value->>'pieceId', coalesce(r.value->>'etatProjet', 'existant'), r.value, null
    from metre, jsonb_array_elements(coalesce(metre.m->'revetements', '[]'::jsonb)) r
  ),
  cand as (
    select ouv.idx, ouv.id, ouv.o, ouv.src, ouv.unite, ouv.unite_source, u.piece_id, coalesce(u.etat, ouv.o->>'etatTravaux') as etat, u.annot,
      case ouv.src
        when 'surface_sol' then round((u.m->'retenu'->>'surface_sol')::numeric)
        when 'surface_murs' then round((u.m->'retenu'->>'surface_murs')::numeric)
        when 'surface_plafond' then round((u.m->'retenu'->>'surface_plafond')::numeric)
        when 'perimetre_brut' then round((u.m->'retenu'->>'perimetre_brut')::numeric * 1000)
        when 'perimetre_utile' then round((u.m->'retenu'->>'perimetre_utile')::numeric * 1000)
        when 'volume' then public.tools_releve_qt_rdiv(round((u.m->'retenu'->>'volume')::numeric), 1000)
        when 'longueur_murs' then round((u.m->>'longueurMm')::numeric * 1000)
        when 'surface_murs_plan' then case when jsonb_typeof(u.m->'hauteurMm') = 'number'
                                            then round((u.m->>'longueurMm')::numeric * (u.m->>'hauteurMm')::numeric) end
        when 'nombre_ouvertures' then 1000000
        when 'surface_ouvertures' then round((u.m->>'surfaceMm2')::numeric)
        when 'nombre_equipements' then 1000000
        when 'quantite_revetement' then case when u.m->>'unite' = 'ml' then round((u.m->>'quantite')::numeric * 1000)
                                             else round((u.m->>'quantite')::numeric) end
        when 'forfait' then round(coalesce((nullif(ouv.o->'regle'->'valeur', 'null'::jsonb) #>> '{}')::numeric, 1) * 1000000)
        when 'saisie' then round((ouv.o->'regle'->>'valeur')::numeric * 1000000)
      end as base,
      case
        when ouv.src in ('surface_sol','surface_murs','surface_plafond','perimetre_brut','perimetre_utile','volume') then exists (
          select 1 from jsonb_array_elements(coalesce(u.m->'ajustements', '[]'::jsonb)) a
          where a.value->>'grandeur' = ouv.src and (a.value->>'perime')::boolean)
        when ouv.src = 'quantite_revetement' then coalesce((u.m->'ajustement'->>'perime')::boolean, false)
        else false end as perime,
      ouv.src in ('surface_sol','surface_murs','surface_plafond','surface_murs_plan','surface_ouvertures')
        or (ouv.src = 'quantite_revetement' and ouv.f->>'support' <> 'plinthe') as surface
    from ouv join units u on u.kind = case
        when ouv.src in ('surface_sol','surface_murs','surface_plafond','perimetre_brut','perimetre_utile','volume') then 'piece'
        when ouv.src in ('longueur_murs','surface_murs_plan') then 'mur'
        when ouv.src in ('nombre_ouvertures','surface_ouvertures') then 'ouverture'
        when ouv.src = 'nombre_equipements' then 'equipement'
        when ouv.src = 'quantite_revetement' then 'revetement'
        when ouv.scope is null then 'global' else 'piece' end
    where (ouv.scope is null or ouv.scope ? u.piece_id)
      and (u.etat is null or ouv.o->'etats' ? u.etat)
      and (not (ouv.f ? 'typesOuverture') or ouv.f->'typesOuverture' ? (u.m->>'typeOuverture'))
      and (not (ouv.f ? 'categories') or ouv.f->'categories' ? (u.m->>'categorie'))
      and (not (ouv.f ? 'objets') or ouv.f->'objets' ? (u.m->>'objet'))
      and (not (ouv.f ? 'support') or (u.m->>'categorie') = (ouv.f->>'support'))
      and (not (ouv.f ? 'familles') or ouv.f->'familles' ? (u.m->>'revetement'))
  ),
  calc as (
    select c.idx, c.id as ouvrage_id, c.piece_id, c.etat, c.src, c.unite, c.unite_source, c.base, x.r[1] as q1, x.r[2] as q2, x.r[3] as milli, c.perime, c.surface, c.annot
    from cand c, lateral (select public.tools_releve_qt_appliquer(c.base, c.o->'regle', (c.o->>'pertePourcent')::numeric, c.o->'arrondi') as r) x
  ),
  lignes as (
    select idx, ouvrage_id, piece_id, etat, min(src) as src, min(unite) as unite, min(unite_source) as unite_source, count(*) as elements, count(*) filter (where base is null) as nc,
           sum(base) as base, sum(q1) as q1, sum(q2) as q2, sum(milli) as milli, bool_or(perime) as perime,
           count(*) filter (where surface and base is not null and (base <= 0 or base > 1000000000000)) as impossibles,
           bool_or(annot = 'hors_piece') as hors_piece, bool_or(annot = 'partage') as partage
    from calc group by idx, ouvrage_id, piece_id, etat
  ),
  aj as (
    select a.value as a, a.value->>'ouvrageId' as ouvrage_id, nullif(a.value->>'pieceId', '') as piece_id, a.value->>'etatProjet' as etat
    from jsonb_array_elements(coalesce(p_entree->'ajustements', '[]'::jsonb)) a
  ),
  lj as (
    select l.*, aj.a, case when l.nc < l.elements then l.milli * 0.001 end as calculee
    from lignes l left join aj on aj.ouvrage_id = l.ouvrage_id and aj.piece_id is not distinct from l.piece_id and aj.etat = l.etat
  ),
  lf as (
    select lj.*, (lj.a->>'valeurCalculee')::numeric is distinct from lj.calculee as aj_perime,
      row_number() over (order by lj.idx, lj.piece_id collate "C" nulls last, array_position(array['existant','a_deposer','nouveau','deplace'], lj.etat)) as rn
    from lj
  ),
  supprimees as (select s #>> '{}' as pid from jsonb_array_elements(coalesce(p_entree->'piecesSupprimees', '[]'::jsonb)) s),
  anom as (
    -- Règle invalide (formule ou unité) : aucune ligne.
    select o.idx, o.id as ouvrage_id, null::text as piece_id, null::text as etat,
           case when o.code in ('unite_incoherente','unite') then 'unite_incoherente' else 'formule_invalide' end as code,
           o.code as detail, 'erreur' as gravite
    from ouv_all o where o.code is not null
    union all
    -- Pièces visées supprimées (erreur) ou sans contour sur ce plan (avertissement).
    select ouv.idx, ouv.id, p #>> '{}', null,
           case when s.pid is not null then 'objet_supprime' else 'source_absente' end,
           case when s.pid is not null then 'piece_supprimee' else 'piece_sans_contour' end,
           case when s.pid is not null then 'erreur' else 'avertissement' end
    from ouv cross join lateral jsonb_array_elements(coalesce(ouv.scope, '[]'::jsonb)) p
    left join supprimees s on s.pid = p #>> '{}'
    where not exists (select 1 from rooms r where r.pid = p #>> '{}')
    union all
    select ouv.idx, ouv.id, null, null, 'source_absente', 'aucune_donnee', 'avertissement'
    from ouv where ouv.id not in (select l.ouvrage_id from lignes l)
    union all
    select idx, ouvrage_id, piece_id, etat, 'source_absente', 'non_calculable', 'avertissement' from lf where nc > 0
    union all
    select idx, ouvrage_id, piece_id, etat, 'quantite_negative', 'negative', 'erreur' from lf where calculee < 0
    union all
    select idx, ouvrage_id, piece_id, etat, 'surface_impossible', 'surface', 'erreur' from lf where impossibles > 0
    union all
    select idx, ouvrage_id, piece_id, etat, 'metre_obsolete', 'source_perimee', 'avertissement' from lf where perime
    union all
    select idx, ouvrage_id, piece_id, etat, 'metre_obsolete', 'ajustement_perime', 'avertissement' from lf where a is not null and aj_perime
    union all
    -- Ajustement orphelin : aucune ligne (ouvrage, pièce, état) ne lui correspond.
    select coalesce(o.idx, 2147483647), aj.ouvrage_id, aj.piece_id, aj.etat, 'objet_supprime', 'ajustement_orphelin', 'erreur'
    from aj left join ouv_all o on o.id = aj.ouvrage_id
    where (aj.ouvrage_id, coalesce(aj.piece_id, ''), aj.etat) not in (select l.ouvrage_id, coalesce(l.piece_id, ''), l.etat from lignes l)
  )
  select jsonb_build_object(
    'moteur', 'quantitatif-v1',
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'ouvrageId', lf.ouvrage_id, 'pieceId', lf.piece_id, 'etatProjet', lf.etat, 'source', lf.src,
        'uniteSource', lf.unite_source, 'unite', lf.unite, 'elements', lf.elements, 'nonCalculables', lf.nc,
        'base', lf.base * 0.000001, 'quantiteBrute', lf.q1 * 0.000001, 'quantiteAvecPerte', lf.q2 * 0.000001,
        'quantiteCalculee', lf.calculee,
        'ajustement', case when lf.a is not null then jsonb_build_object('id', lf.a->'id', 'valeurCalculee', lf.a->'valeurCalculee',
          'valeurRetenue', lf.a->'valeurRetenue', 'raison', lf.a->'raison', 'auteurId', lf.a->'auteurId', 'date', lf.a->'date', 'perime', lf.aj_perime) end,
        'quantiteRetenue', coalesce((lf.a->>'valeurRetenue')::numeric, lf.calculee),
        'annotations', case when lf.hors_piece and lf.partage then '["hors_piece","partage"]'::jsonb when lf.hors_piece then '["hors_piece"]'::jsonb
                            when lf.partage then '["partage"]'::jsonb else '[]'::jsonb end
      ) order by lf.rn) from lf), '[]'::jsonb),
    'anomalies', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'gravite', a.gravite, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id,
        'etatProjet', a.etat, 'detail', a.detail, 'message', public.tools_releve_quantitatif_anomalie_message(a.code, a.detail))
      order by a.idx, a.piece_id collate "C" nulls last, array_position(array['existant','a_deposer','nouveau','deplace'], a.etat) nulls first,
        array_position(array['formule_invalide','unite_incoherente','objet_supprime','source_absente','surface_impossible','quantite_negative','metre_obsolete'], a.code),
        a.detail collate "C") from anom a), '[]'::jsonb));
$$;

-- ── 4. Bibliothèque d'ouvrages (par entreprise, sans prix) ────────────────────
create table public.tools_releves_ouvrages_bibliotheque (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  donnees jsonb not null check (pg_column_size(donnees) <= 16000 and public.tools_releve_ouvrage_anomalie(donnees) is null
                                and not (donnees ? 'pieceIds')),
  categorie text generated always as (donnees->>'categorie') stored,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null
);
create index tools_releves_ouvrages_bibliotheque_entreprise_idx on public.tools_releves_ouvrages_bibliotheque (entreprise_id) where deleted_at is null;
create unique index tools_releves_ouvrages_bibliotheque_code_unique on public.tools_releves_ouvrages_bibliotheque (entreprise_id, (donnees->>'code'))
  where deleted_at is null and donnees ? 'code' and donnees->'code' <> 'null'::jsonb;

create or replace function public.tools_releve_bibliotheque_avant_ecriture()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1; new.created_at := now(); new.updated_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); new.updated_by := auth.uid(); end if;
    if new.deleted_at is not null then raise exception 'Un ouvrage de bibliothèque ne peut pas être créé supprimé' using errcode = '42501'; end if;
  else
    if new.id <> old.id or new.entreprise_id <> old.entreprise_id or new.created_at <> old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Colonnes immuables' using errcode = '42501';
    end if;
    new.revision := old.revision + 1; new.updated_at := now(); new.updated_by := coalesce(auth.uid(), old.updated_by);
    if new.deleted_at is not null and old.deleted_at is null then new.deleted_at := now(); new.deleted_by := auth.uid(); end if;
  end if;
  return new;
end;
$$;
create trigger tools_releves_ouvrages_bibliotheque_avant_ecriture before insert or update on public.tools_releves_ouvrages_bibliotheque
  for each row execute function public.tools_releve_bibliotheque_avant_ecriture();

alter table public.tools_releves_ouvrages_bibliotheque enable row level security;
create policy tools_releves_ouvrages_bibliotheque_select on public.tools_releves_ouvrages_bibliotheque
  for select to authenticated using (public.tools_releve_action_autorisee(entreprise_id, 'view'));
revoke all on public.tools_releves_ouvrages_bibliotheque from public, anon, authenticated;
grant select on public.tools_releves_ouvrages_bibliotheque to authenticated;
grant select, insert, update, delete on public.tools_releves_ouvrages_bibliotheque to service_role;

-- ── 5. Ouvrages d'un plan ─────────────────────────────────────────────────────
create table public.tools_releves_ouvrages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  plan_id uuid not null,
  bibliotheque_id uuid references public.tools_releves_ouvrages_bibliotheque(id) on delete set null,
  -- Lignée : ouvrage du plan de base dont celui-ci est la copie (plan dérivé).
  origine_ouvrage_id uuid,
  donnees jsonb not null check (pg_column_size(donnees) <= 32000 and public.tools_releve_ouvrage_anomalie(donnees) is null),
  categorie text generated always as (donnees->>'categorie') stored,
  -- Origine de la quantité : `auto` (dérivée du plan) ou `manuelle` (forfait, saisie).
  origine text generated always as (case when donnees->'regle'->>'source' in ('forfait','saisie') then 'manuelle' else 'auto' end) stored,
  ordre integer not null default 0 check (ordre between 0 and 1000000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (plan_id, releve_id) references public.tools_releves_plans(id, releve_id) on delete cascade
);
create index tools_releves_ouvrages_plan_idx on public.tools_releves_ouvrages (plan_id) where deleted_at is null;
create index tools_releves_ouvrages_releve_idx on public.tools_releves_ouvrages (releve_id);

create trigger tools_releves_ouvrages_avant_ecriture before insert or update on public.tools_releves_ouvrages
  for each row execute function public.tools_releve_enfant_avant_ecriture();

-- Plan figé ou supprimé : aucun ouvrage créé, modifié ni supprimé (le quantitatif est figé). Pièces visées :
-- pièces de l'étage du plan (même supprimées ensuite : l'évaluation les signale).
create or replace function public.tools_releve_ouvrage_garde()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  select * into v_plan from public.tools_releves_plans p where p.id = new.plan_id;
  if v_plan.fige_le is not null or v_plan.deleted_at is not null then
    raise exception 'Plan figé : son quantitatif est figé' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.plan_id <> old.plan_id or new.origine_ouvrage_id is distinct from old.origine_ouvrage_id) then
    raise exception 'Un ouvrage ne change pas de plan' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(nullif(new.donnees->'pieceIds', 'null'::jsonb), '[]'::jsonb)) pid
             where not exists (select 1 from public.tools_releves_pieces p where p.id::text = pid and p.etage_id = v_plan.etage_id)) then
    raise exception '%', public.tools_releve_ouvrage_message('piece') using errcode = '22023', detail = 'piece';
  end if;
  return new;
end;
$$;
create trigger tools_releves_ouvrages_garde before insert or update on public.tools_releves_ouvrages
  for each row execute function public.tools_releve_ouvrage_garde();

alter table public.tools_releves_ouvrages enable row level security;
create policy tools_releves_ouvrages_select on public.tools_releves_ouvrages
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_ouvrages from public, anon, authenticated;
grant select on public.tools_releves_ouvrages to authenticated;
grant select, insert, update, delete on public.tools_releves_ouvrages to service_role;

-- ── 6. Ajustements de quantité (quantité retenue ≠ quantité calculée, auditée) ─
create table public.tools_releves_quantitatif_ajustements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  plan_id uuid not null,
  ouvrage_id uuid not null references public.tools_releves_ouvrages(id) on delete cascade,
  piece_id uuid,
  etat_projet text not null check (etat_projet in ('existant','a_deposer','nouveau','deplace')),
  valeur_calculee numeric,
  valeur_retenue numeric not null check (valeur_retenue >= 0 and valeur_retenue <= 1e12 and valeur_retenue = round(valeur_retenue, 3)),
  raison text not null check (char_length(btrim(raison)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  retire_le timestamptz,
  retire_par uuid references public.utilisateurs(id) on delete set null,
  raison_retrait text check (raison_retrait is null or char_length(raison_retrait) <= 500),
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (plan_id, releve_id) references public.tools_releves_plans(id, releve_id) on delete cascade
);
create index tools_releves_quantitatif_ajustements_plan_idx on public.tools_releves_quantitatif_ajustements (plan_id);
create index tools_releves_quantitatif_ajustements_releve_idx on public.tools_releves_quantitatif_ajustements (releve_id);
create index tools_releves_quantitatif_ajustements_ouvrage_idx on public.tools_releves_quantitatif_ajustements (ouvrage_id);
create unique index tools_releves_quantitatif_ajustements_actif_unique on public.tools_releves_quantitatif_ajustements
  (ouvrage_id, coalesce(piece_id, '00000000-0000-0000-0000-000000000000'::uuid), etat_projet) where retire_le is null;

create or replace function public.tools_releve_quantitatif_ajustement_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tools_releves_plans p where p.id = new.plan_id and (p.fige_le is not null or p.deleted_at is not null)) then
    raise exception 'Plan figé : son quantitatif est figé' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.retire_le is not null
       or (to_jsonb(new) - array['retire_le','retire_par','raison_retrait']) <> (to_jsonb(old) - array['retire_le','retire_par','raison_retrait']) then
      raise exception 'Ajustement immuable : retirez-le et saisissez-en un nouveau' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tools_releves_quantitatif_ajustements_garde before insert or update on public.tools_releves_quantitatif_ajustements
  for each row execute function public.tools_releve_quantitatif_ajustement_garde();

alter table public.tools_releves_quantitatif_ajustements enable row level security;
create policy tools_releves_quantitatif_ajustements_select on public.tools_releves_quantitatif_ajustements
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_quantitatif_ajustements from public, anon, authenticated;
grant select on public.tools_releves_quantitatif_ajustements to authenticated;
grant select, insert, update, delete on public.tools_releves_quantitatif_ajustements to service_role;

-- Quantitatif figé avec le plan (posé UNE fois par le gel ; immuable ensuite : garde du Lot 5).
alter table public.tools_releves_plans
  add column quantitatif jsonb check (quantitatif is null or (jsonb_typeof(quantitatif) = 'object' and pg_column_size(quantitatif) <= 16777216));

-- ── 7. Entrée du moteur pour un plan, calcul, lecture ─────────────────────────
create or replace function public.tools_releve_quantitatif_ouvrages_json(p_plan_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(o.donnees || jsonb_build_object('id', o.id) order by o.ordre, o.id), '[]'::jsonb)
  from public.tools_releves_ouvrages o where o.plan_id = p_plan_id and o.deleted_at is null;
$$;

create or replace function public.tools_releve_quantitatif_entree(p_plan_id uuid, p_metre jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'metre', p_metre,
    'ouvrages', public.tools_releve_quantitatif_ouvrages_json(p_plan_id),
    'ajustements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id, 'etatProjet', a.etat_projet,
        'valeurCalculee', a.valeur_calculee, 'valeurRetenue', a.valeur_retenue, 'raison', a.raison, 'auteurId', a.created_by, 'date', a.created_at) order by a.id)
      from public.tools_releves_quantitatif_ajustements a join public.tools_releves_ouvrages o on o.id = a.ouvrage_id and o.deleted_at is null
      where a.plan_id = p_plan_id and a.retire_le is null), '[]'::jsonb),
    'murs', coalesce((select jsonb_agg(jsonb_build_object('id', x.id,
        'longueurMm', round(sqrt(((x.donnees->'b'->>'x')::numeric - (x.donnees->'a'->>'x')::numeric) ^ 2
                                 + ((x.donnees->'b'->>'y')::numeric - (x.donnees->'a'->>'y')::numeric) ^ 2), 1),
        'hauteurMm', case when jsonb_typeof(x.donnees->'hauteurMm') = 'number' then (x.donnees->>'hauteurMm')::numeric end,
        'etatProjet', coalesce(x.donnees->>'etatProjet', 'existant')) order by x.id)
      from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'mur' and x.deleted_at is null), '[]'::jsonb),
    'piecesSupprimees', coalesce((select jsonb_agg(p.id order by p.id) from public.tools_releves_pieces p
      join public.tools_releves_plans pl on pl.id = p_plan_id and pl.etage_id = p.etage_id where p.deleted_at is not null), '[]'::jsonb));
$$;

-- Calcul interne (non exposé) : métré figé si le plan l'est, sinon métré recalculé ; quantitatif figé si présent.
create or replace function public.tools_releve_plan_quantitatif_calcul(p_plan_id uuid, p_metre jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_metre jsonb;
begin
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null then return null; end if;
  v_metre := coalesce(p_metre, case when v_plan.fige_le is not null and v_plan.metre is not null then v_plan.metre end,
                      public.tools_releve_plan_metre_calcul(p_plan_id));
  return jsonb_build_object('version', 1, 'planId', v_plan.id, 'etageId', v_plan.etage_id, 'etat', v_plan.etat_documente, 'numero', v_plan.numero,
      'ouvrages', public.tools_releve_quantitatif_ouvrages_json(p_plan_id))
    || public.tools_releve_quantitatif_evaluer(public.tools_releve_quantitatif_entree(p_plan_id, v_metre));
end;
$$;

-- Lecture d'un plan : quantitatif figé (gel), sinon calculé ; audit des ouvrages.
create or replace function public.tools_releve_plan_quantitatif(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'view') then
    raise exception 'Plan introuvable ou non accessible' using errcode = '42501';
  end if;
  if v_plan.fige_le is not null and v_plan.quantitatif is not null then
    v_out := v_plan.quantitatif || jsonb_build_object('fige', true, 'source', 'gel', 'figeLe', v_plan.fige_le);
  else
    v_out := public.tools_releve_plan_quantitatif_calcul(p_plan_id)
      || jsonb_build_object('fige', v_plan.fige_le is not null,
                            'source', case when v_plan.fige_le is not null then 'recalcul_plan_fige_avant_lot9' else 'calcul' end,
                            'figeLe', v_plan.fige_le);
  end if;
  return v_out || jsonb_build_object('revision', v_plan.revision, 'audit', coalesce((select jsonb_agg(jsonb_build_object('id', o.id,
      'bibliothequeId', o.bibliotheque_id, 'origineOuvrageId', o.origine_ouvrage_id, 'origine', o.origine, 'revision', o.revision,
      'createdAt', o.created_at, 'createdBy', o.created_by, 'updatedAt', o.updated_at, 'updatedBy', o.updated_by) order by o.ordre, o.id)
    from public.tools_releves_ouvrages o where o.plan_id = p_plan_id and o.deleted_at is null), '[]'::jsonb));
end;
$$;

-- Synthèse d'un relevé : pour chaque étage actif, le plan le plus récent de l'état demandé et son quantitatif.
create or replace function public.tools_releve_quantitatif_synthese(p_releve_id uuid, p_etat text default 'existant')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb[] := '{}'; r record;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('existant','projete','as_built') then raise exception 'État de synthèse inconnu : %', p_etat using errcode = '22023'; end if;
  for r in
    select distinct on (e.id) e.id as etage_id, p.id as plan_id, p.numero, p.etat_documente, p.fige_le, p.quantitatif
    from public.tools_releves_etages e
    join public.tools_releves_plans p on p.etage_id = e.id and p.deleted_at is null
      and (case p_etat when 'existant' then p.etat_documente in ('initial','corrige') else p.etat_documente = p_etat end)
    where e.releve_id = p_releve_id and e.deleted_at is null
    order by e.id, p.numero desc
  loop
    v_out := array_append(v_out, jsonb_build_object('etageId', r.etage_id, 'planId', r.plan_id, 'numero', r.numero, 'etat', r.etat_documente, 'figeLe', r.fige_le,
      'quantitatif', case when r.fige_le is not null and r.quantitatif is not null then r.quantitatif || jsonb_build_object('fige', true, 'source', 'gel')
                          else public.tools_releve_plan_quantitatif_calcul(r.plan_id) || jsonb_build_object('fige', r.fige_le is not null,
                            'source', case when r.fige_le is not null then 'recalcul_plan_fige_avant_lot9' else 'calcul' end) end));
  end loop;
  return to_jsonb(v_out);
end;
$$;

-- ── 8. Écritures : ouvrages (RPC, contrôle explicite) ─────────────────────────
create or replace function public.tools_releve_ouvrage_ecrire(v_plan public.tools_releves_plans, p_id uuid, p_donnees jsonb, p_bibliotheque_id uuid, p_ordre int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_code text; v_existant public.tools_releves_ouvrages;
begin
  v_code := public.tools_releve_ouvrage_anomalie(p_donnees);
  if v_code is not null then raise exception '%', public.tools_releve_ouvrage_message(v_code) using errcode = '22023', detail = v_code; end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(nullif(p_donnees->'pieceIds', 'null'::jsonb), '[]'::jsonb)) pid
             where not exists (select 1 from public.tools_releves_pieces p where p.id::text = pid and p.etage_id = v_plan.etage_id and p.deleted_at is null)) then
    raise exception '%', public.tools_releve_ouvrage_message('piece') using errcode = '22023', detail = 'piece';
  end if;
  if p_bibliotheque_id is not null and not exists (select 1 from public.tools_releves_ouvrages_bibliotheque b
      where b.id = p_bibliotheque_id and b.entreprise_id = v_plan.entreprise_id) then
    raise exception 'Ouvrage de bibliothèque introuvable' using errcode = '42501';
  end if;
  select * into v_existant from public.tools_releves_ouvrages o where o.id = p_id;
  if v_existant.id is null then
    insert into public.tools_releves_ouvrages (id, releve_id, plan_id, bibliotheque_id, donnees, ordre)
    values (p_id, v_plan.releve_id, v_plan.id, p_bibliotheque_id, p_donnees,
            coalesce(p_ordre, (select coalesce(max(o.ordre) + 1, 0) from public.tools_releves_ouvrages o where o.plan_id = v_plan.id)));
    return true;
  end if;
  if v_existant.plan_id <> v_plan.id then raise exception 'Ouvrage étranger au plan : %', p_id using errcode = '42501'; end if;
  update public.tools_releves_ouvrages set donnees = p_donnees, deleted_at = null,
    bibliotheque_id = coalesce(p_bibliotheque_id, bibliotheque_id), ordre = coalesce(p_ordre, ordre)
  where id = p_id;
  return false;
end;
$$;

create or replace function public.tools_releve_plan_modifiable(p_plan_id uuid)
returns public.tools_releves_plans language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then
    raise exception 'Plan figé : son quantitatif est figé' using errcode = '42501';
  end if;
  return v_plan;
end;
$$;

create or replace function public.tools_releve_ouvrage_enregistrer(p_plan_id uuid, p_id uuid, p_donnees jsonb, p_bibliotheque_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_cree boolean;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  if p_id is null then raise exception 'Identifiant d''ouvrage obligatoire' using errcode = '22023'; end if;
  v_cree := public.tools_releve_ouvrage_ecrire(v_plan, p_id, p_donnees, p_bibliotheque_id, null);
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, case when v_cree then 'creation' else 'modification' end,
          array['ouvrages'], auth.uid(), jsonb_build_object('ouvrage_id', p_id, 'nom', p_donnees->>'nom'));
  return (select jsonb_build_object('id', o.id, 'donnees', o.donnees, 'revision', o.revision, 'origine', o.origine) from public.tools_releves_ouvrages o where o.id = p_id);
end;
$$;

-- Import en lot (catalogue standard, bibliothèque) : une transaction, au plus 2 000 ouvrages.
create or replace function public.tools_releve_ouvrages_importer(p_plan_id uuid, p_ouvrages jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_o jsonb; v_n int := 0; v_ordre int;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  if jsonb_typeof(p_ouvrages) is distinct from 'array' or jsonb_array_length(p_ouvrages) not between 1 and 2000 then
    raise exception 'Import : 1 à 2 000 ouvrages' using errcode = '22023';
  end if;
  select coalesce(max(o.ordre) + 1, 0) into v_ordre from public.tools_releves_ouvrages o where o.plan_id = p_plan_id;
  for v_o in select value from jsonb_array_elements(p_ouvrages) loop
    if coalesce(v_o->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Identifiant d''ouvrage obligatoire' using errcode = '22023';
    end if;
    perform public.tools_releve_ouvrage_ecrire(v_plan, (v_o->>'id')::uuid, v_o->'donnees', nullif(v_o->>'bibliothequeId', '')::uuid, v_ordre + v_n);
    v_n := v_n + 1;
  end loop;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'creation', array['ouvrages'], auth.uid(), jsonb_build_object('import', v_n));
  return v_n;
end;
$$;

create or replace function public.tools_releve_ouvrage_supprimer(p_plan_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_n int;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  update public.tools_releves_ouvrages set deleted_at = now() where id = p_id and plan_id = p_plan_id and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ouvrage introuvable sur ce plan' using errcode = '42501'; end if;
  -- Ses ajustements actifs sont retirés (tracés), jamais effacés.
  update public.tools_releves_quantitatif_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Ouvrage supprimé'
  where ouvrage_id = p_id and retire_le is null;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'suppression', array['ouvrages'], auth.uid(), jsonb_build_object('ouvrage_id', p_id));
end;
$$;

-- ── 9. Ajustements : saisie et retrait (RPC) ──────────────────────────────────
create or replace function public.tools_releve_quantitatif_ajuster(
  p_plan_id uuid, p_ouvrage_id uuid, p_piece_id uuid, p_etat text, p_valeur_retenue numeric, p_raison text
)
returns public.tools_releves_quantitatif_ajustements
language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_q jsonb; v_ligne jsonb; v_row public.tools_releves_quantitatif_ajustements;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then raise exception 'Plan figé : son quantitatif est figé' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('existant','a_deposer','nouveau','deplace') then raise exception 'État projeté inconnu : %', p_etat using errcode = '22023'; end if;
  if p_valeur_retenue is null or p_valeur_retenue < 0 or p_valeur_retenue > 1e12 or p_valeur_retenue <> round(p_valeur_retenue, 3) then
    raise exception 'Quantité retenue positive attendue (trois décimales au plus).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_raison, ''))) < 3 then raise exception 'La raison de l''ajustement est obligatoire.' using errcode = '22023'; end if;
  -- Quantité calculée : TOUJOURS celle du serveur au moment de l'ajustement (jamais celle du client).
  v_q := public.tools_releve_plan_quantitatif_calcul(p_plan_id);
  select value into v_ligne from jsonb_array_elements(v_q->'lignes')
  where value->>'ouvrageId' = p_ouvrage_id::text and (value->>'pieceId') is not distinct from p_piece_id::text and value->>'etatProjet' = p_etat;
  if v_ligne is null then raise exception 'Ligne de quantitatif absente du plan' using errcode = '42501'; end if;
  update public.tools_releves_quantitatif_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Remplacé par un nouvel ajustement'
  where ouvrage_id = p_ouvrage_id and retire_le is null and piece_id is not distinct from p_piece_id and etat_projet = p_etat;
  insert into public.tools_releves_quantitatif_ajustements (entreprise_id, releve_id, plan_id, ouvrage_id, piece_id, etat_projet, valeur_calculee, valeur_retenue, raison, created_by)
  values (v_plan.entreprise_id, v_plan.releve_id, p_plan_id, p_ouvrage_id, p_piece_id, p_etat, (v_ligne->>'quantiteCalculee')::numeric, p_valeur_retenue, btrim(p_raison), auth.uid())
  returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'ajustement', array['quantitatif'], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'ouvrage_id', p_ouvrage_id, 'piece_id', p_piece_id, 'etat_projet', p_etat,
                             'valeur_calculee', v_row.valeur_calculee, 'valeur_retenue', p_valeur_retenue));
  return v_row;
end;
$$;

create or replace function public.tools_releve_quantitatif_ajustement_retirer(p_id uuid, p_raison text default null)
returns public.tools_releves_quantitatif_ajustements
language plpgsql security definer set search_path = public as $$
declare v_row public.tools_releves_quantitatif_ajustements;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_row from public.tools_releves_quantitatif_ajustements a where a.id = p_id for update;
  if v_row.id is null or not public.tools_releve_peut(v_row.releve_id, 'edit') then
    raise exception 'Ajustement introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_row.retire_le is not null then raise exception 'Ajustement déjà retiré' using errcode = '22023'; end if;
  update public.tools_releves_quantitatif_ajustements set retire_le = now(), retire_par = auth.uid(),
    raison_retrait = coalesce(nullif(btrim(p_raison), ''), 'Retour à la quantité calculée')
  where id = p_id returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_row.entreprise_id, v_row.releve_id, 'plan', v_row.plan_id, 'ajustement', array['quantitatif'], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'retrait', true));
  return v_row;
end;
$$;

-- ── 10. Bibliothèque : lecture et écriture (RPC, entreprise du relevé) ────────
create or replace function public.tools_releve_bibliotheque(p_releve_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'donnees', b.donnees, 'revision', b.revision, 'updatedAt', b.updated_at, 'updatedBy', b.updated_by)
      order by b.categorie, b.donnees->>'nom', b.id)
    from public.tools_releves_ouvrages_bibliotheque b where b.entreprise_id = v_entreprise and b.deleted_at is null), '[]'::jsonb);
end;
$$;

create or replace function public.tools_releve_bibliotheque_enregistrer(p_releve_id uuid, p_id uuid, p_donnees jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_code text; v_existant public.tools_releves_ouvrages_bibliotheque;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null or not public.tools_releve_peut(p_releve_id, 'edit') or not public.tools_releve_action_autorisee(v_entreprise, 'edit') then
    raise exception 'Bibliothèque non modifiable' using errcode = '42501';
  end if;
  if p_id is null then raise exception 'Identifiant d''ouvrage obligatoire' using errcode = '22023'; end if;
  v_code := case when p_donnees ? 'pieceIds' then 'invalide' else public.tools_releve_ouvrage_anomalie(p_donnees) end;
  if v_code is not null then raise exception '%', public.tools_releve_ouvrage_message(v_code) using errcode = '22023', detail = v_code; end if;
  select * into v_existant from public.tools_releves_ouvrages_bibliotheque b where b.id = p_id;
  if v_existant.id is null then
    insert into public.tools_releves_ouvrages_bibliotheque (id, entreprise_id, donnees) values (p_id, v_entreprise, p_donnees);
  elsif v_existant.entreprise_id <> v_entreprise then
    raise exception 'Ouvrage de bibliothèque introuvable' using errcode = '42501';
  else
    update public.tools_releves_ouvrages_bibliotheque set donnees = p_donnees, deleted_at = null where id = p_id;
  end if;
  return (select jsonb_build_object('id', b.id, 'donnees', b.donnees, 'revision', b.revision) from public.tools_releves_ouvrages_bibliotheque b where b.id = p_id);
exception when unique_violation then
  raise exception 'Code d''ouvrage déjà utilisé dans la bibliothèque' using errcode = '23505';
end;
$$;

create or replace function public.tools_releve_bibliotheque_supprimer(p_releve_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null or not public.tools_releve_peut(p_releve_id, 'edit') or not public.tools_releve_action_autorisee(v_entreprise, 'edit') then
    raise exception 'Bibliothèque non modifiable' using errcode = '42501';
  end if;
  update public.tools_releves_ouvrages_bibliotheque set deleted_at = now() where id = p_id and entreprise_id = v_entreprise and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ouvrage de bibliothèque introuvable' using errcode = '42501'; end if;
end;
$$;

-- ── 11. Gel : Lot 8 + quantitatif figé ────────────────────────────────────────
create or replace function public.tools_releve_plan_figer(p_plan_id uuid, p_revision bigint, p_libelle text default null)
returns public.tools_releves_plans
language plpgsql security definer set search_path = public, extensions as $$
declare v_plan public.tools_releves_plans; v_version public.tools_releves_versions; v_creer boolean; v_metre jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null then raise exception 'Plan supprimé' using errcode = '42501'; end if;
  if v_plan.fige_le is not null then raise exception 'Plan déjà figé' using errcode = '42501'; end if;
  if v_plan.revision <> p_revision then
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été figé' using errcode = 'PT409', detail = v_plan.revision::text;
  end if;

  v_metre := public.tools_releve_plan_metre_calcul(p_plan_id) || jsonb_build_object('calculeLe', now());
  update public.tools_releves_plans set
    fige_le = now(), fige_par = auth.uid(),
    empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(p_plan_id)::text, 'UTF8'), 'sha256'), 'hex'),
    -- Lot 8 : métré figé (hauteurs, ajustements et réglages du moment compris).
    metre = v_metre,
    -- Lot 9 : quantitatif figé (ouvrages, règles et ajustements du moment, sur le métré figé).
    quantitatif = public.tools_releve_plan_quantitatif_calcul(p_plan_id, v_metre) || jsonb_build_object('calculeLe', now()),
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

-- ── 12. Plan dérivé : ouvrages copiés (lignée), ajustements NON copiés ────────
create or replace function public.tools_releve_plan_copier_ouvrages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan_base_id is null then return null; end if;
  insert into public.tools_releves_ouvrages (releve_id, plan_id, bibliotheque_id, origine_ouvrage_id, donnees, ordre)
  select o.releve_id, new.id, o.bibliotheque_id, o.id, o.donnees, o.ordre
  from public.tools_releves_ouvrages o where o.plan_id = new.plan_base_id and o.deleted_at is null
  order by o.ordre, o.id;
  return null;
end;
$$;
create trigger tools_releves_plans_copier_ouvrages after insert on public.tools_releves_plans
  for each row execute function public.tools_releve_plan_copier_ouvrages();

-- ── 13. Droits ────────────────────────────────────────────────────────────────
revoke all on function public.tools_releve_qt_rdiv(numeric, numeric) from public, anon;
revoke all on function public.tools_releve_qt_decimal_valide(jsonb, int, numeric, numeric) from public, anon;
revoke all on function public.tools_releve_ouvrage_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_ouvrage_message(text) from public, anon;
revoke all on function public.tools_releve_quantitatif_anomalie_message(text, text) from public, anon;
revoke all on function public.tools_releve_qt_appliquer(numeric, jsonb, numeric, jsonb) from public, anon;
revoke all on function public.tools_releve_quantitatif_evaluer(jsonb) from public, anon;
grant execute on function public.tools_releve_qt_rdiv(numeric, numeric) to authenticated, service_role;
grant execute on function public.tools_releve_qt_decimal_valide(jsonb, int, numeric, numeric) to authenticated, service_role;
grant execute on function public.tools_releve_ouvrage_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_ouvrage_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_quantitatif_anomalie_message(text, text) to authenticated, service_role;
grant execute on function public.tools_releve_qt_appliquer(numeric, jsonb, numeric, jsonb) to authenticated, service_role;
-- Moteur pur (aucune lecture de table) : exposé pour la parité et l'aperçu.
grant execute on function public.tools_releve_quantitatif_evaluer(jsonb) to authenticated, service_role;

revoke all on function public.tools_releve_bibliotheque_avant_ecriture() from public, anon, authenticated;
revoke all on function public.tools_releve_ouvrage_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_quantitatif_ajustement_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_plan_copier_ouvrages() from public, anon, authenticated;
revoke all on function public.tools_releve_quantitatif_ouvrages_json(uuid) from public, anon, authenticated;
revoke all on function public.tools_releve_quantitatif_entree(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_quantitatif_calcul(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tools_releve_ouvrage_ecrire(public.tools_releves_plans, uuid, jsonb, uuid, int) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_modifiable(uuid) from public, anon, authenticated;
grant execute on function public.tools_releve_quantitatif_ouvrages_json(uuid) to service_role;
grant execute on function public.tools_releve_quantitatif_entree(uuid, jsonb) to service_role;
grant execute on function public.tools_releve_plan_quantitatif_calcul(uuid, jsonb) to service_role;

revoke all on function public.tools_releve_plan_quantitatif(uuid) from public, anon;
revoke all on function public.tools_releve_quantitatif_synthese(uuid, text) from public, anon;
revoke all on function public.tools_releve_ouvrage_enregistrer(uuid, uuid, jsonb, uuid) from public, anon;
revoke all on function public.tools_releve_ouvrages_importer(uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_ouvrage_supprimer(uuid, uuid) from public, anon;
revoke all on function public.tools_releve_quantitatif_ajuster(uuid, uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.tools_releve_quantitatif_ajustement_retirer(uuid, text) from public, anon;
revoke all on function public.tools_releve_bibliotheque(uuid) from public, anon;
revoke all on function public.tools_releve_bibliotheque_enregistrer(uuid, uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_bibliotheque_supprimer(uuid, uuid) from public, anon;
grant execute on function public.tools_releve_plan_quantitatif(uuid) to authenticated;
grant execute on function public.tools_releve_quantitatif_synthese(uuid, text) to authenticated;
grant execute on function public.tools_releve_ouvrage_enregistrer(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.tools_releve_ouvrages_importer(uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_ouvrage_supprimer(uuid, uuid) to authenticated;
grant execute on function public.tools_releve_quantitatif_ajuster(uuid, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.tools_releve_quantitatif_ajustement_retirer(uuid, text) to authenticated;
grant execute on function public.tools_releve_bibliotheque(uuid) to authenticated;
grant execute on function public.tools_releve_bibliotheque_enregistrer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_bibliotheque_supprimer(uuid, uuid) to authenticated;

revoke all on function public.tools_releve_plan_figer(uuid, bigint, text) from public, anon;
grant execute on function public.tools_releve_plan_figer(uuid, bigint, text) to authenticated;
