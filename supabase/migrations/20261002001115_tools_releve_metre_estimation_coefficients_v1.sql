-- Train canonique V9 : numéro d'origine 20260930001402 (Relevé & Métré Lot 10 (claude/fervent-bell-1tbhc5)), renuméroté 20261002001115
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 10 (complément) — COEFFICIENTS, HYPOTHÈSES, OBSOLESCENCE SUR QUANTITÉ
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT10_ESTIMATION_SIMPLIFIEE_V1.md
--
-- Posée APRÈS 20260930001401 (estimation simplifiée). Plage 14xx réservée au Lot 10.
--
-- Règle produit inchangée : TOOLS = relevé + plan + métrés + quantitatifs + estimation simplifiée (HT, estimative) ;
-- GESTION PRO = chiffrage complet, devis, marges, commandes, commercial. Aucun moteur de marge ni de devis ici.
--
-- Strictement ADDITIF (aucune ligne existante invalidée ni réécrite ; aucune garde affaiblie) :
--   1. COEFFICIENTS facultatifs au niveau du RELEVÉ (`tools_releves_estimation_parametres`) : coefficient GÉNÉRAL et
--      coefficients PAR LOT, plus un texte d'HYPOTHÈSES. PRIORITÉ (le plus précis l'emporte, AUCUN CUMUL) :
--        coefficient saisi sur le prix de l'ouvrage  >  coefficient du lot de l'ouvrage  >  coefficient général  >  1.
--      Résolution PURE (`tools_releve_estimation_prix_effectifs`), miroir TypeScript `prixEffectifs`. Le moteur
--      d'estimation reçoit des prix « effectifs » : son arithmétique est inchangée.
--   2. TRAÇABILITÉ d'une correction : VALEUR SOURCE figée au moment de la correction (`valeur_source` : quantité,
--      unité, PU, coefficient appliqué et sa provenance). La correction devient OBSOLÈTE (« stale ») si la QUANTITÉ
--      change, même quand le montant automatique ne change pas (ouvrage sans prix, quantité nulle…).
--   3. Le moteur `tools_releve_estimation_evaluer` est REDÉFINI de façon rétro-compatible : sans `quantiteSource`
--      dans une correction, sa sortie est IDENTIQUE octet pour octet (jeu de parité P1 inchangé).
--   4. GEL : l'estimation figée embarque les paramètres utilisés (`parametres`) ; changer ensuite les coefficients du
--      relevé ne modifie jamais un plan figé.
--   5. MODE SÛR (train V8) : `incident_installer_gardes()` est rappelée, ce qui pose la garde d'écriture sur les
--      tables du Lot 10 (prix, prix de bibliothèque, corrections) ET sur la nouvelle table — la migration 1401 ne
--      l'appelait pas (pgTAP incident_safe_mode_v1 n° 23 et v8_convergence n° 1 : have 3, want 0).
--
-- RLS : nouvelle table en lecture seule pour `authenticated`, écriture par RPC seulement. RGPD : `entreprise_id`.

-- ── 1. Lot d'un ouvrage (miroir exact de `ouvrageLot`, domaine Lot 9) ─────────
-- Lot saisi (blancs de début et de fin retirés, mêmes blancs que String.prototype.trim), sinon lot par catégorie.
create or replace function public.tools_releve_trim_js(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(p, '^[\u0009-\u000d    -     　﻿]+|[\u0009-\u000d    -     　﻿]+$', '', 'g');
$$;

create or replace function public.tools_releve_ouvrage_lot(p jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    nullif(case when jsonb_typeof(p->'lot') = 'string' then public.tools_releve_trim_js(p->>'lot') end, ''),
    case p->>'categorie'
      when 'cloisons' then 'Plâtrerie – cloisons' when 'doublages' then 'Plâtrerie – cloisons' when 'plafonds' then 'Plafonds'
      when 'sols' then 'Revêtements de sols' when 'peinture' then 'Peinture' when 'faience' then 'Carrelage – faïence'
      when 'carrelage' then 'Carrelage – faïence' when 'plinthes' then 'Revêtements de sols' when 'profiles' then 'Menuiseries intérieures'
      when 'portes' then 'Menuiseries intérieures' when 'fenetres' then 'Menuiseries extérieures' when 'sanitaires' then 'Plomberie – sanitaires'
      when 'mobilier' then 'Agencement – mobilier' when 'electricite' then 'Électricité' when 'cvc' then 'CVC'
      when 'plomberie' then 'Plomberie – sanitaires' when 'demolition' then 'Démolition – dépose' when 'depose' then 'Démolition – dépose'
      when 'autre' then 'Divers' end);
$$;

-- ── 2. Contrat des paramètres d'estimation (miroir `parametresAnomalie`) ──────
-- { coefficientGeneral?, coefficientsLots? { "<lot>": coefficient }, hypotheses? } — toute autre clé est refusée
-- (marge, remise, TVA, acompte, conditions commerciales… relèvent de Gestion Pro).
create or replace function public.tools_releve_estimation_parametres_anomalie(p jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare v_lots jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'invalide'; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k <> all (array['coefficientGeneral','coefficientsLots','hypotheses'])) then return 'cle'; end if;
  if p ? 'coefficientGeneral' and p->'coefficientGeneral' <> 'null'::jsonb
     and not public.tools_releve_qt_decimal_valide(p->'coefficientGeneral', 4, 0.01, 10) then return 'coefficient_general'; end if;
  if p ? 'coefficientsLots' and p->'coefficientsLots' <> 'null'::jsonb then
    v_lots := p->'coefficientsLots';
    if jsonb_typeof(v_lots) <> 'object' or (select count(*) from jsonb_object_keys(v_lots)) > 50 then return 'coefficients_lots'; end if;
    if exists (select 1 from jsonb_object_keys(v_lots) k
               where char_length(k) not between 1 and 80 or public.tools_releve_trim_js(k) <> k) then return 'lot'; end if;
    if exists (select 1 from jsonb_each(v_lots) e where not public.tools_releve_qt_decimal_valide(e.value, 4, 0.01, 10)) then return 'coefficient_lot'; end if;
  end if;
  if p ? 'hypotheses' and p->'hypotheses' <> 'null'::jsonb
     and (jsonb_typeof(p->'hypotheses') <> 'string' or char_length(p->>'hypotheses') > 2000) then return 'hypotheses'; end if;
  return null;
end;
$$;

create or replace function public.tools_releve_estimation_parametres_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'invalide' then 'Paramètres d''estimation invalides.'
    when 'cle' then 'Donnée inconnue : l''estimation Tools n''a qu''un coefficient général, des coefficients par lot et des hypothèses (marge, remise, TVA, acompte et conditions commerciales relèvent de Gestion Pro).'
    when 'coefficient_general' then 'Coefficient général : entre 0,01 et 10, quatre décimales au plus.'
    when 'coefficients_lots' then 'Coefficients par lot : 50 lots au plus.'
    when 'lot' then 'Lot : 1 à 80 caractères, sans espace au début ni à la fin.'
    when 'coefficient_lot' then 'Coefficient de lot : entre 0,01 et 10, quatre décimales au plus.'
    when 'hypotheses' then 'Hypothèses : 2 000 caractères au plus.'
    else 'Paramètres d''estimation invalides.' end;
$$;

-- ── 3. Paramètres d'estimation d'un relevé ────────────────────────────────────
create table public.tools_releves_estimation_parametres (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null unique,
  donnees jsonb not null default '{}'::jsonb
    check (pg_column_size(donnees) <= 16000 and public.tools_releve_estimation_parametres_anomalie(donnees) is null),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null,
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade
);
create trigger tools_releves_estimation_parametres_avant_ecriture before insert or update on public.tools_releves_estimation_parametres
  for each row execute function public.tools_releve_enfant_avant_ecriture();

alter table public.tools_releves_estimation_parametres enable row level security;
create policy tools_releves_estimation_parametres_select on public.tools_releves_estimation_parametres
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_estimation_parametres from public, anon, authenticated;
grant select on public.tools_releves_estimation_parametres to authenticated;
grant select, insert, update, delete on public.tools_releves_estimation_parametres to service_role;

-- ── 4. Valeur source d'une correction (figée au moment de la correction) ──────
alter table public.tools_releves_estimation_ajustements
  add column valeur_source jsonb check (valeur_source is null or (jsonb_typeof(valeur_source) = 'object' and pg_column_size(valeur_source) <= 2000));

-- ── 5. Résolution des coefficients (fonction pure) ────────────────────────────
-- Entrée : ouvrages du quantitatif (donnees + id), prix [{ouvrageId, donnees, …}], paramètres du relevé.
-- Sortie : même ordre que `p_prix`, [{ouvrageId, donnees (effectives), coefficientApplique, coefficientSource}].
-- Un prix invalide est transmis tel quel (le moteur le signale) : coefficientApplique / coefficientSource = null.
create or replace function public.tools_releve_estimation_prix_effectifs(p_ouvrages jsonb, p_prix jsonb, p_parametres jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with
  par as (
    select case when public.tools_releve_estimation_parametres_anomalie(coalesce(p_parametres, '{}'::jsonb)) is null
                then coalesce(p_parametres, '{}'::jsonb) else '{}'::jsonb end as d),
  ouv as (
    select distinct on (o.value->>'id') o.value->>'id' as id, public.tools_releve_ouvrage_lot(o.value) as lot
    from jsonb_array_elements(coalesce(p_ouvrages, '[]'::jsonb)) with ordinality o order by o.value->>'id', o.ordinality),
  px as (
    select p.ordinality as o, p.value->>'ouvrageId' as ouvrage_id, p.value->'donnees' as d,
           public.tools_releve_prix_anomalie(p.value->'donnees') is null as valide,
           (p.value->'donnees' ? 'coefficient' and p.value->'donnees'->'coefficient' <> 'null'::jsonb) as explicite
    from jsonb_array_elements(coalesce(p_prix, '[]'::jsonb)) with ordinality p),
  res as (
    select px.o, px.ouvrage_id, px.d, px.valide,
      case when not px.valide then null
           when px.explicite then 'ouvrage'
           when ouv.id is not null and nullif(par.d->'coefficientsLots'->ouv.lot, 'null'::jsonb) is not null then 'lot'
           when nullif(par.d->'coefficientGeneral', 'null'::jsonb) is not null then 'general'
           else 'aucun' end as source,
      ouv.lot, par.d as pd
    from px cross join par left join ouv on ouv.id = px.ouvrage_id)
  select coalesce(jsonb_agg(jsonb_build_object(
      'ouvrageId', res.ouvrage_id,
      'donnees', case res.source
                   when 'lot' then res.d || jsonb_build_object('coefficient', res.pd->'coefficientsLots'->res.lot)
                   when 'general' then res.d || jsonb_build_object('coefficient', res.pd->'coefficientGeneral')
                   else res.d end,
      'coefficientApplique', case res.source
                   when 'ouvrage' then res.d->'coefficient'
                   when 'lot' then res.pd->'coefficientsLots'->res.lot
                   when 'general' then res.pd->'coefficientGeneral'
                   when 'aucun' then to_jsonb(1) end,
      'coefficientSource', res.source) order by res.o), '[]'::jsonb)
  from res;
$$;

-- ── 6. Moteur d'estimation : obsolescence sur QUANTITÉ (rétro-compatible) ─────
-- Identique à 20260930001401, plus : une correction qui porte `quantiteSource` devient obsolète si la quantité de sa
-- ligne a changé (motif « quantite »), ou si son montant automatique a changé (motif « montant »). Sans
-- `quantiteSource`, la sortie est inchangée (aucune clé ajoutée).
create or replace function public.tools_releve_estimation_anomalie_message(p_code text, p_detail text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'prix_invalide' then public.tools_releve_prix_message(p_detail)
    when 'prix_absent' then 'Sans prix : l''ouvrage reste exploitable en quantitatif, il n''entre pas dans le total estimé.'
    when 'quantite_non_calculable' then 'Quantité non calculable : le coût de cette ligne ne peut pas être estimé.'
    when 'estimation_obsolete' then case when p_detail = 'quantite_modifiee'
      then 'Estimation obsolète : la quantité a changé depuis la correction, montant retenu à revoir.'
      else 'Estimation obsolète : le montant automatique a changé depuis la correction, montant retenu à revoir.' end
    when 'ajustement_orphelin' then 'Correction sans ligne correspondante (ouvrage, pièce ou prix disparu).'
    else 'Anomalie d''estimation.' end;
$$;

create or replace function public.tools_releve_estimation_evaluer(p_entree jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with
  ouv as (
    select o.value->>'id' as id, (o.ordinality - 1)::int as idx, o.value->>'etatTravaux' as etat_travaux
    from jsonb_array_elements(coalesce(p_entree->'ouvrages', '[]'::jsonb)) with ordinality o),
  px_first as (
    select distinct on (p.value->>'ouvrageId') p.value->>'ouvrageId' as ouvrage_id, p.value->'donnees' as d,
           public.tools_releve_prix_anomalie(p.value->'donnees') as code
    from jsonb_array_elements(coalesce(p_entree->'prix', '[]'::jsonb)) with ordinality p
    order by p.value->>'ouvrageId', p.ordinality),
  px as (
    select f.ouvrage_id, f.d, round(coalesce((nullif(f.d->'coefficient', 'null'::jsonb) #>> '{}')::numeric, 1) * 10000) as coef
    from px_first f join ouv on ouv.id = f.ouvrage_id where f.code is null),
  comp as (
    select px.ouvrage_id, c.value->>'type' as t,
      case when c.value->>'type' = 'main_d_oeuvre' then round((c.value->>'heuresParUnite')::numeric * 10000) end as h,
      case when c.value->>'type' = 'main_d_oeuvre' then round((c.value->>'tauxHoraire')::numeric * 100) end as tx,
      case when c.value->>'type' in ('materiau','autre') then round((c.value->>'prixUnitaire')::numeric * 10000) end as pu,
      case when c.value->>'type' = 'forfait' then round((c.value->>'montant')::numeric * 100) end as m
    from px, jsonb_array_elements(px.d->'composantes') c),
  pxu as (
    select px.ouvrage_id, px.coef,
      count(comp.t) filter (where comp.t <> 'forfait') as n_unit,
      count(comp.t) filter (where comp.t = 'main_d_oeuvre') as n_mo,
      count(comp.t) filter (where comp.t = 'forfait') as n_forfait,
      coalesce(sum(case when comp.t = 'main_d_oeuvre' then comp.h * comp.tx when comp.t <> 'forfait' then comp.pu * 100 end), 0) as s,
      coalesce(sum(public.tools_releve_qt_rdiv(comp.m * px.coef, 10000)) filter (where comp.t = 'forfait'), 0) as forfait_cents
    from px left join comp on comp.ouvrage_id = px.ouvrage_id group by px.ouvrage_id, px.coef),
  ql as (
    select ouv.idx, l.ordinality as lo, l.value->>'ouvrageId' as ouvrage_id, l.value->>'pieceId' as piece_id, l.value->>'etatProjet' as etat,
           l.value->>'unite' as unite,
           case when jsonb_typeof(l.value->'quantiteRetenue') = 'number' then round((l.value->>'quantiteRetenue')::numeric * 1000) end as q
    from jsonb_array_elements(coalesce(p_entree->'lignes', '[]'::jsonb)) with ordinality l join ouv on ouv.id = l.value->>'ouvrageId'),
  lcomp as (
    select ql.lo, comp.t,
      case when comp.t = 'main_d_oeuvre' then public.tools_releve_qt_rdiv(ql.q * comp.h * comp.tx * pxu.coef, 100000000000)
           else public.tools_releve_qt_rdiv(ql.q * comp.pu * pxu.coef, 1000000000) end as cents,
      case when comp.t = 'main_d_oeuvre' then public.tools_releve_qt_rdiv(ql.q * comp.h * pxu.coef, 100000000) end as mh
    from ql join pxu on pxu.ouvrage_id = ql.ouvrage_id join comp on comp.ouvrage_id = ql.ouvrage_id and comp.t <> 'forfait'
    where ql.q is not null),
  lagg as (
    select lo, sum(cents) filter (where t = 'materiau') as mat, sum(cents) filter (where t = 'main_d_oeuvre') as mo,
           sum(cents) filter (where t = 'autre') as autre, sum(mh) as mh
    from lcomp group by lo),
  lignes as (
    select ql.idx, 0 as nat, ql.lo, ql.ouvrage_id, ql.piece_id, ql.etat, 'quantite'::text as nature, ql.unite, ql.q,
      pxu.ouvrage_id is not null as prix_defini,
      case when pxu.n_unit > 0 then public.tools_releve_qt_rdiv(pxu.s * pxu.coef, 1000000) end as pu4,
      (pxu.ouvrage_id is null or (ql.q is null and pxu.n_unit > 0)) as sans_montant,
      coalesce(lagg.mat, 0) as mat, coalesce(lagg.mo, 0) as mo, 0::numeric as forf, coalesce(lagg.autre, 0) as autre,
      case when pxu.n_mo > 0 and ql.q is not null then coalesce(lagg.mh, 0) end as mh
    from ql left join pxu on pxu.ouvrage_id = ql.ouvrage_id left join lagg on lagg.lo = ql.lo
    union all
    select ouv.idx, 1, 0, ouv.id, null, ouv.etat_travaux, 'forfait', 'forfait', 1000::numeric, true, pxu.forfait_cents * 100, false,
      0, 0, pxu.forfait_cents, 0, null
    from ouv join pxu on pxu.ouvrage_id = ouv.id where pxu.n_forfait > 0),
  lm as (
    select lignes.*, case when sans_montant then null else mat + mo + forf + autre end as mc from lignes),
  aj as (
    select a.value as a, a.value->>'ouvrageId' as ouvrage_id, a.value->>'pieceId' as piece_id, a.value->>'etatProjet' as etat,
           coalesce(a.value->>'nature', 'quantite') as nature,
           a.value ? 'quantiteSource' as suivi_qte,
           case when jsonb_typeof(a.value->'quantiteSource') = 'number' then round((a.value->>'quantiteSource')::numeric * 1000) end as qs
    from jsonb_array_elements(coalesce(p_entree->'ajustements', '[]'::jsonb)) a),
  lf0 as (
    select lm.*, aj.a, aj.suivi_qte,
      (aj.a->>'valeurCalculee')::numeric is distinct from lm.mc * 0.01 as aj_perime_montant,
      coalesce(aj.suivi_qte and aj.qs is distinct from lm.q, false) as aj_perime_qte,
      case when aj.a is not null then round((aj.a->>'valeurRetenue')::numeric * 100) else lm.mc end as mr,
      row_number() over (order by lm.idx, lm.nat, lm.lo) as rn
    from lm left join aj on aj.ouvrage_id = lm.ouvrage_id and aj.piece_id is not distinct from lm.piece_id and aj.etat = lm.etat and aj.nature = lm.nature),
  lf as (
    select lf0.*, (lf0.aj_perime_montant or lf0.aj_perime_qte) as aj_perime from lf0),
  anom as (
    select ouv.idx, f.ouvrage_id, null::text as piece_id, null::text as etat, null::text as nature, 'prix_invalide'::text as code, f.code as detail, 'erreur'::text as gravite
    from px_first f join ouv on ouv.id = f.ouvrage_id where f.code is not null
    union all
    select ouv.idx, ouv.id, null, null, null, 'prix_absent', 'sans_prix', 'info'
    from ouv where not exists (select 1 from px_first f where f.ouvrage_id = ouv.id)
    union all
    select idx, ouvrage_id, piece_id, etat, nature, 'quantite_non_calculable', 'quantite', 'avertissement' from lf where prix_defini and mc is null
    union all
    select idx, ouvrage_id, piece_id, etat, nature, 'estimation_obsolete',
      case when aj_perime_qte then 'quantite_modifiee' else 'ajustement_perime' end, 'avertissement' from lf where a is not null and aj_perime
    union all
    select coalesce(ouv.idx, 2147483647), aj.ouvrage_id, aj.piece_id, aj.etat, aj.nature, 'ajustement_orphelin', 'orphelin', 'erreur'
    from aj left join ouv on ouv.id = aj.ouvrage_id
    where not exists (select 1 from lm where lm.ouvrage_id = aj.ouvrage_id and lm.piece_id is not distinct from aj.piece_id
                      and lm.etat = aj.etat and lm.nature = aj.nature)
  )
  select jsonb_build_object(
    'moteur', 'estimation-v1',
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'ouvrageId', lf.ouvrage_id, 'pieceId', lf.piece_id, 'etatProjet', lf.etat, 'nature', lf.nature, 'unite', lf.unite,
        'quantite', lf.q * 0.001, 'prixDefini', lf.prix_defini, 'prixUnitaire', lf.pu4 * 0.0001,
        'materiau', case when lf.sans_montant then null else lf.mat * 0.01 end,
        'mainOeuvre', case when lf.sans_montant then null else lf.mo * 0.01 end,
        'forfait', case when lf.sans_montant then null else lf.forf * 0.01 end,
        'autre', case when lf.sans_montant then null else lf.autre * 0.01 end,
        'heures', lf.mh * 0.001,
        'montantCalcule', lf.mc * 0.01,
        'ajustement', case when lf.a is not null then jsonb_build_object('id', lf.a->'id', 'valeurCalculee', lf.a->'valeurCalculee',
          'valeurRetenue', lf.a->'valeurRetenue', 'raison', lf.a->'raison', 'auteurId', lf.a->'auteurId', 'date', lf.a->'date', 'perime', lf.aj_perime)
          || case when lf.suivi_qte then jsonb_build_object('quantiteSource', lf.a->'quantiteSource',
               'motifPerime', case when lf.aj_perime_qte then 'quantite' when lf.aj_perime_montant then 'montant' end) else '{}'::jsonb end end,
        'montantRetenu', lf.mr * 0.01
      ) order by lf.rn) from lf), '[]'::jsonb),
    'anomalies', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'gravite', a.gravite, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id,
        'etatProjet', a.etat, 'nature', a.nature, 'detail', a.detail, 'message', public.tools_releve_estimation_anomalie_message(a.code, a.detail))
      order by a.idx, a.piece_id collate "C" nulls last, array_position(array['existant','a_deposer','nouveau','deplace'], a.etat) nulls first,
        array_position(array['quantite','forfait'], a.nature) nulls first,
        array_position(array['prix_invalide','ajustement_orphelin','quantite_non_calculable','estimation_obsolete','prix_absent'], a.code),
        a.detail collate "C") from anom a), '[]'::jsonb),
    'totaux', (select jsonb_build_object(
        'montant', coalesce(sum(lf.mr), 0) * 0.01,
        'parEtat', jsonb_build_object(
          'existant', coalesce(sum(lf.mr) filter (where lf.etat = 'existant'), 0) * 0.01,
          'a_deposer', coalesce(sum(lf.mr) filter (where lf.etat = 'a_deposer'), 0) * 0.01,
          'nouveau', coalesce(sum(lf.mr) filter (where lf.etat = 'nouveau'), 0) * 0.01,
          'deplace', coalesce(sum(lf.mr) filter (where lf.etat = 'deplace'), 0) * 0.01),
        'parType', jsonb_build_object(
          'materiau', coalesce(sum(lf.mat) filter (where not lf.sans_montant), 0) * 0.01,
          'main_d_oeuvre', coalesce(sum(lf.mo) filter (where not lf.sans_montant), 0) * 0.01,
          'forfait', coalesce(sum(lf.forf) filter (where not lf.sans_montant), 0) * 0.01,
          'autre', coalesce(sum(lf.autre) filter (where not lf.sans_montant), 0) * 0.01),
        'ecartAjustements', coalesce(sum(lf.mr - coalesce(lf.mc, 0)) filter (where lf.a is not null), 0) * 0.01,
        'heures', coalesce(sum(lf.mh), 0) * 0.001,
        'lignes', count(*),
        'lignesChiffrees', count(*) filter (where lf.mr is not null),
        'lignesSansPrix', count(*) filter (where not lf.prix_defini and lf.a is null),
        'lignesAjustees', count(*) filter (where lf.a is not null)) from lf));
$$;

-- ── 7. Calcul d'un plan : paramètres du relevé, prix effectifs, valeur source ─
create or replace function public.tools_releve_estimation_parametres_json(p_releve_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('donnees', p.donnees, 'revision', p.revision, 'updatedAt', p.updated_at, 'updatedBy', p.updated_by)
                   from public.tools_releves_estimation_parametres p where p.releve_id = p_releve_id and p.deleted_at is null),
                  jsonb_build_object('donnees', '{}'::jsonb, 'revision', 0, 'updatedAt', null, 'updatedBy', null))
         || jsonb_build_object('priorite', jsonb_build_array('ouvrage', 'lot', 'general'));
$$;

create or replace function public.tools_releve_plan_estimation_calcul(p_plan_id uuid, p_quantitatif jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_prix jsonb; v_param jsonb; v_eff jsonb;
begin
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null then return null; end if;
  v_prix := public.tools_releve_estimation_prix_json(p_plan_id);
  v_param := public.tools_releve_estimation_parametres_json(v_plan.releve_id);
  v_eff := public.tools_releve_estimation_prix_effectifs(coalesce(p_quantitatif->'ouvrages', '[]'::jsonb), v_prix, v_param->'donnees');
  return jsonb_build_object('version', 1, 'planId', v_plan.id, 'etageId', v_plan.etage_id, 'etat', v_plan.etat_documente, 'numero', v_plan.numero,
      'base', 'HT', 'devise', 'EUR', 'parametres', v_param,
      'prix', coalesce((select jsonb_agg(p.value || jsonb_build_object('coefficientApplique', e.value->'coefficientApplique',
                          'coefficientSource', e.value->'coefficientSource') order by p.o)
                        from jsonb_array_elements(v_prix) with ordinality p(value, o)
                        join jsonb_array_elements(v_eff) with ordinality e(value, o) on e.o = p.o), '[]'::jsonb))
    || public.tools_releve_estimation_evaluer(jsonb_build_object(
      'ouvrages', coalesce(p_quantitatif->'ouvrages', '[]'::jsonb),
      'lignes', coalesce(p_quantitatif->'lignes', '[]'::jsonb),
      'prix', v_eff,
      'ajustements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id, 'etatProjet', a.etat_projet,
          'nature', a.nature, 'valeurCalculee', a.valeur_calculee, 'valeurRetenue', a.valeur_retenue, 'raison', a.raison, 'auteurId', a.created_by,
          'date', a.created_at)
          || case when a.valeur_source is not null then jsonb_build_object('quantiteSource', a.valeur_source->'quantite') else '{}'::jsonb end
          order by a.id)
        from public.tools_releves_estimation_ajustements a join public.tools_releves_ouvrages o on o.id = a.ouvrage_id and o.deleted_at is null
        where a.plan_id = p_plan_id and a.retire_le is null), '[]'::jsonb)));
end;
$$;

-- ── 8. Correction : la valeur source est figée (quantité, PU, coefficient) ────
create or replace function public.tools_releve_estimation_ajuster(
  p_plan_id uuid, p_ouvrage_id uuid, p_piece_id uuid, p_etat text, p_nature text, p_valeur_retenue numeric, p_raison text
)
returns public.tools_releves_estimation_ajustements
language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_e jsonb; v_ligne jsonb; v_prix jsonb; v_row public.tools_releves_estimation_ajustements;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then raise exception 'Plan figé : son estimation est figée' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('existant','a_deposer','nouveau','deplace') then raise exception 'État projeté inconnu : %', p_etat using errcode = '22023'; end if;
  if coalesce(p_nature, '') not in ('quantite','forfait') then raise exception 'Nature de ligne inconnue : %', p_nature using errcode = '22023'; end if;
  if p_valeur_retenue is null or p_valeur_retenue < 0 or p_valeur_retenue > 1e10 or p_valeur_retenue <> round(p_valeur_retenue, 2) then
    raise exception 'Montant retenu positif attendu (deux décimales au plus).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_raison, ''))) < 3 then raise exception 'La raison de la correction est obligatoire.' using errcode = '22023'; end if;
  -- Montant automatique et valeur source : TOUJOURS ceux du serveur au moment de la correction (jamais ceux du client).
  v_e := public.tools_releve_plan_estimation_calcul(p_plan_id, public.tools_releve_plan_quantitatif_calcul(p_plan_id));
  select value into v_ligne from jsonb_array_elements(v_e->'lignes')
  where value->>'ouvrageId' = p_ouvrage_id::text and (value->>'pieceId') is not distinct from p_piece_id::text
    and value->>'etatProjet' = p_etat and value->>'nature' = p_nature;
  if v_ligne is null then raise exception 'Ligne d''estimation absente du plan' using errcode = '42501'; end if;
  select value into v_prix from jsonb_array_elements(v_e->'prix') where value->>'ouvrageId' = p_ouvrage_id::text limit 1;
  update public.tools_releves_estimation_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Remplacée par une nouvelle correction'
  where ouvrage_id = p_ouvrage_id and retire_le is null and piece_id is not distinct from p_piece_id and etat_projet = p_etat and nature = p_nature;
  insert into public.tools_releves_estimation_ajustements (entreprise_id, releve_id, plan_id, ouvrage_id, piece_id, etat_projet, nature,
    valeur_calculee, valeur_retenue, raison, created_by, valeur_source)
  values (v_plan.entreprise_id, v_plan.releve_id, p_plan_id, p_ouvrage_id, p_piece_id, p_etat, p_nature,
    (v_ligne->>'montantCalcule')::numeric, p_valeur_retenue, btrim(p_raison), auth.uid(),
    jsonb_build_object('quantite', v_ligne->'quantite', 'unite', v_ligne->'unite', 'prixUnitaire', v_ligne->'prixUnitaire',
      'montantCalcule', v_ligne->'montantCalcule', 'coefficient', v_prix->'coefficientApplique', 'coefficientSource', v_prix->'coefficientSource'))
  returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'ajustement', array['estimation'], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'ouvrage_id', p_ouvrage_id, 'piece_id', p_piece_id, 'etat_projet', p_etat, 'nature', p_nature,
                             'valeur_calculee', v_row.valeur_calculee, 'valeur_retenue', p_valeur_retenue, 'valeur_source', v_row.valeur_source));
  return v_row;
end;
$$;

-- Journal des corrections d'un plan (actives et retirées) : audit complet, valeur source comprise.
create or replace function public.tools_releve_estimation_corrections(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'view') then raise exception 'Plan introuvable ou non accessible' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id, 'etatProjet', a.etat_projet,
      'nature', a.nature, 'valeurCalculee', a.valeur_calculee, 'valeurRetenue', a.valeur_retenue, 'raison', a.raison, 'auteurId', a.created_by,
      'date', a.created_at, 'retireLe', a.retire_le, 'retirePar', a.retire_par, 'raisonRetrait', a.raison_retrait, 'valeurSource', a.valeur_source)
      order by a.created_at, a.id)
    from public.tools_releves_estimation_ajustements a where a.plan_id = p_plan_id), '[]'::jsonb);
end;
$$;

-- ── 9. Paramètres : lecture et écriture (RPC, contrôle explicite, journal) ────
create or replace function public.tools_releve_estimation_parametres(p_releve_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  return public.tools_releve_estimation_parametres_json(p_releve_id);
end;
$$;

-- `p_revision` : révision lue (0 si aucun paramètre) ; une écriture concurrente est refusée (PT409), rien n'est écrasé.
create or replace function public.tools_releve_estimation_parametres_enregistrer(p_releve_id uuid, p_donnees jsonb, p_revision bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_code text; v_existant public.tools_releves_estimation_parametres; v_donnees jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null or not public.tools_releve_peut(p_releve_id, 'edit') then
    raise exception 'Relevé introuvable ou non modifiable' using errcode = '42501';
  end if;
  v_code := public.tools_releve_estimation_parametres_anomalie(p_donnees);
  if v_code is not null then raise exception '%', public.tools_releve_estimation_parametres_message(v_code) using errcode = '22023', detail = v_code; end if;
  -- Clés à `null` retirées : « non renseigné » s'écrit par l'absence.
  v_donnees := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p_donnees) e where e.value <> 'null'::jsonb);
  select * into v_existant from public.tools_releves_estimation_parametres p where p.releve_id = p_releve_id for update;
  if p_revision is not null and p_revision <> coalesce(case when v_existant.deleted_at is null then v_existant.revision end, 0) then
    raise exception 'Paramètres modifiés ailleurs entre-temps : rien n''a été enregistré' using errcode = 'PT409',
      detail = coalesce(case when v_existant.deleted_at is null then v_existant.revision end, 0)::text;
  end if;
  if v_existant.id is null then
    insert into public.tools_releves_estimation_parametres (releve_id, donnees) values (p_releve_id, v_donnees);
  else
    update public.tools_releves_estimation_parametres set donnees = v_donnees, deleted_at = null where id = v_existant.id;
  end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_entreprise, p_releve_id, 'releve', p_releve_id, case when v_existant.id is null then 'creation' else 'modification' end,
          array['estimation_parametres'], auth.uid(),
          jsonb_build_object('avant', case when v_existant.deleted_at is null then v_existant.donnees end, 'apres', v_donnees));
  return public.tools_releve_estimation_parametres_json(p_releve_id);
end;
$$;

-- ── 10. Droits ────────────────────────────────────────────────────────────────
revoke all on function public.tools_releve_trim_js(text) from public, anon;
revoke all on function public.tools_releve_ouvrage_lot(jsonb) from public, anon;
revoke all on function public.tools_releve_estimation_parametres_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_estimation_parametres_message(text) from public, anon;
revoke all on function public.tools_releve_estimation_prix_effectifs(jsonb, jsonb, jsonb) from public, anon;
-- Fonctions pures (aucune lecture de table) : exposées pour la parité et l'aperçu, comme le moteur.
grant execute on function public.tools_releve_trim_js(text) to authenticated, service_role;
grant execute on function public.tools_releve_ouvrage_lot(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_estimation_parametres_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_estimation_parametres_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_estimation_prix_effectifs(jsonb, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.tools_releve_estimation_parametres_json(uuid) from public, anon, authenticated;
grant execute on function public.tools_releve_estimation_parametres_json(uuid) to service_role;

revoke all on function public.tools_releve_estimation_parametres(uuid) from public, anon;
revoke all on function public.tools_releve_estimation_parametres_enregistrer(uuid, jsonb, bigint) from public, anon;
grant execute on function public.tools_releve_estimation_parametres(uuid) to authenticated;
grant execute on function public.tools_releve_estimation_parametres_enregistrer(uuid, jsonb, bigint) to authenticated;

-- Fonctions redéfinies : droits réaffirmés à l'identique de 20260930001401.
revoke all on function public.tools_releve_estimation_evaluer(jsonb) from public, anon;
grant execute on function public.tools_releve_estimation_evaluer(jsonb) to authenticated, service_role;
revoke all on function public.tools_releve_estimation_anomalie_message(text, text) from public, anon;
grant execute on function public.tools_releve_estimation_anomalie_message(text, text) to authenticated, service_role;
revoke all on function public.tools_releve_plan_estimation_calcul(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.tools_releve_plan_estimation_calcul(uuid, jsonb) to service_role;
revoke all on function public.tools_releve_estimation_ajuster(uuid, uuid, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.tools_releve_estimation_ajuster(uuid, uuid, uuid, text, text, numeric, text) to authenticated;
revoke all on function public.tools_releve_estimation_corrections(uuid) from public, anon;
grant execute on function public.tools_releve_estimation_corrections(uuid) to authenticated;

-- ── 11. Mode sûr (train V8) : garde d'écriture sur toutes les tables, Lot 10 compris ─
select public.incident_installer_gardes();
