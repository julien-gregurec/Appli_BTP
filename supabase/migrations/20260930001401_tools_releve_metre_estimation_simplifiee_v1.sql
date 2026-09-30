-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 10 — ESTIMATION SIMPLIFIÉE V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT10_ESTIMATION_SIMPLIFIEE_V1.md
--
-- Posée APRÈS le Lot 9 (20260929001301). Plage 14xx réservée au Lot 10.
--
-- Règle produit : TOOLS = estimation simplifiée (HT, estimative) ; GESTION PRO = chiffrage complet, prix de
-- vente, marge, remise, TVA, devis. Aucun numéro de devis, aucune facture, aucune commande, aucune signature,
-- aucun workflow accepté / refusé n'existe dans Tools.
--
-- Strictement ADDITIF (aucune ligne existante invalidée ni réécrite ; aucune garde affaiblie) :
--   1. Le quantitatif du Lot 9 reste SANS PRIX (contrat d'ouvrage, bibliothèque et contrat GP 1.0.0 inchangés) :
--      l'estimation est une COUCHE SÉPARÉE, portée par ses propres tables.
--   2. PRIX ESTIMATIF d'un ouvrage de plan (`tools_releves_estimation_prix`) : composantes structurées
--      MATÉRIAU / MAIN D'ŒUVRE (heures par unité × taux horaire) / FORFAIT / AUTRE, coefficient simple. Facultatif :
--      un ouvrage sans prix reste exploitable en quantitatif.
--   3. PRIX FACULTATIF de la bibliothèque (`tools_releves_bibliotheque_prix`), repris à la création d'un ouvrage
--      depuis la bibliothèque, ou appliqué par code.
--   4. MOTEUR d'estimation DÉTERMINISTE (`tools_releve_estimation_evaluer`, fonction pure) : quantité RETENUE du
--      quantitatif (pertes et arrondis du Lot 9 déjà appliqués : la perte n'est JAMAIS réappliquée) × prix,
--      arithmétique entière, arrondi « moitié loin de zéro » au centime par composante. Miroir TypeScript :
--      packages/releve-domain/src/estimation.ts (parité sur jeu déterministe).
--   5. CORRECTIONS MANUELLES (`tools_releves_estimation_ajustements`) : montant automatique (calculé par le
--      serveur), montant retenu, raison obligatoire, auteur, date, retrait tracé, journal.
--   6. GEL : l'estimation est figée avec le plan (`tools_releves_plans.estimation`). Plan dérivé : prix copiés
--      (recalcul indépendant sur ses propres quantités), corrections NON copiées.
--
-- RLS : nouvelles tables en lecture seule pour `authenticated`, écriture par RPC seulement.
-- RGPD : `entreprise_id` présent → export et purge génériques.

-- ── 1. Contrat d'un prix estimatif (miroir `prixAnomalie`, messages identiques) ─
create or replace function public.tools_releve_prix_anomalie(p jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare v_c jsonb; v_t text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'invalide'; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k <> all (array['composantes','coefficient','commentaire'])) then return 'cle'; end if;
  if coalesce(jsonb_typeof(p->'composantes'), '') <> 'array' or jsonb_array_length(p->'composantes') not between 1 and 12 then return 'composantes'; end if;
  for v_c in select value from jsonb_array_elements(p->'composantes') loop
    if jsonb_typeof(v_c) <> 'object' then return 'composantes'; end if;
    v_t := v_c->>'type';
    if coalesce(v_t, '') not in ('materiau','main_d_oeuvre','forfait','autre') then return 'type'; end if;
    if exists (select 1 from jsonb_object_keys(v_c) k where k <> all (case v_t
         when 'main_d_oeuvre' then array['type','libelle','heuresParUnite','tauxHoraire']
         when 'forfait' then array['type','libelle','montant']
         else array['type','libelle','prixUnitaire'] end)) then
      return 'cle';
    end if;
    if v_c ? 'libelle' and v_c->'libelle' <> 'null'::jsonb
       and (jsonb_typeof(v_c->'libelle') <> 'string' or char_length(v_c->>'libelle') > 120) then return 'libelle'; end if;
    if v_t = 'main_d_oeuvre' then
      if not public.tools_releve_qt_decimal_valide(v_c->'heuresParUnite', 4, 0, 10000) then return 'heures'; end if;
      if not public.tools_releve_qt_decimal_valide(v_c->'tauxHoraire', 2, 0, 10000) then return 'taux'; end if;
    elsif v_t = 'forfait' then
      if not public.tools_releve_qt_decimal_valide(v_c->'montant', 2, 0, 100000000) then return 'forfait'; end if;
    elsif not public.tools_releve_qt_decimal_valide(v_c->'prixUnitaire', 4, 0, 1000000) then
      return 'prix_unitaire';
    end if;
  end loop;
  if p ? 'coefficient' and p->'coefficient' <> 'null'::jsonb
     and not public.tools_releve_qt_decimal_valide(p->'coefficient', 4, 0.01, 10) then return 'coefficient'; end if;
  if p ? 'commentaire' and p->'commentaire' <> 'null'::jsonb
     and (jsonb_typeof(p->'commentaire') <> 'string' or char_length(p->>'commentaire') > 500) then return 'commentaire'; end if;
  return null;
end;
$$;

create or replace function public.tools_releve_prix_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'invalide' then 'Prix estimatif invalide.'
    when 'cle' then 'Donnée inconnue : l''estimation Tools est simplifiée et HT (prix de vente, marge, remise, TVA et devis relèvent de Gestion Pro).'
    when 'composantes' then 'Prix : 1 à 12 composantes (matériau, main d''œuvre, forfait, autre).'
    when 'type' then 'Type de prix inconnu (matériau, main d''œuvre, forfait, autre).'
    when 'libelle' then 'Libellé de composante : 120 caractères au plus.'
    when 'heures' then 'Heures par unité : entre 0 et 10 000, quatre décimales au plus.'
    when 'taux' then 'Taux horaire : entre 0 et 10 000 € HT, deux décimales au plus.'
    when 'forfait' then 'Forfait : entre 0 et 100 000 000 € HT, deux décimales au plus.'
    when 'prix_unitaire' then 'Prix unitaire : entre 0 et 1 000 000 € HT, quatre décimales au plus.'
    when 'coefficient' then 'Coefficient : entre 0,01 et 10, quatre décimales au plus.'
    when 'commentaire' then 'Commentaire : 500 caractères au plus.'
    else 'Prix estimatif invalide.' end;
$$;

create or replace function public.tools_releve_estimation_anomalie_message(p_code text, p_detail text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'prix_invalide' then public.tools_releve_prix_message(p_detail)
    when 'prix_absent' then 'Sans prix : l''ouvrage reste exploitable en quantitatif, il n''entre pas dans le total estimé.'
    when 'quantite_non_calculable' then 'Quantité non calculable : le coût de cette ligne ne peut pas être estimé.'
    when 'estimation_obsolete' then 'Estimation obsolète : le montant automatique a changé depuis la correction, montant retenu à revoir.'
    when 'ajustement_orphelin' then 'Correction sans ligne correspondante (ouvrage, pièce ou prix disparu).'
    else 'Anomalie d''estimation.' end;
$$;

-- ── 2. Moteur d'estimation (fonction pure) ────────────────────────────────────
-- Entrée : { ouvrages [{id, etatTravaux, …}], lignes (quantitatif du Lot 9 : ouvrageId, pieceId, etatProjet, unite,
-- quantiteRetenue), prix [{ouvrageId, donnees}], ajustements [{id, ouvrageId, pieceId, etatProjet, nature,
-- valeurCalculee, valeurRetenue, raison, auteurId, date}] }.
-- Échelles entières : quantité 1e-3, prix unitaire 1e-4 €, heures / unité 1e-4 h, taux 1e-2 €/h, forfait 1e-2 €,
-- coefficient 1e-4. Chaque composante est arrondie au centime (moitié loin de zéro) sur chaque ligne ; le montant
-- d'une ligne est la somme de ses composantes ; les sous-totaux sont des sommes de lignes (aucun écart d'arrondi).
-- La quantité utilisée est la quantité RETENUE du quantitatif, pertes et arrondis du Lot 9 compris : aucune perte
-- n'est réappliquée. Une ligne « forfait » par ouvrage porte ses composantes forfaitaires (état de travaux de
-- l'ouvrage, sans pièce).
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
           coalesce(a.value->>'nature', 'quantite') as nature
    from jsonb_array_elements(coalesce(p_entree->'ajustements', '[]'::jsonb)) a),
  lf as (
    select lm.*, aj.a,
      (aj.a->>'valeurCalculee')::numeric is distinct from lm.mc * 0.01 as aj_perime,
      case when aj.a is not null then round((aj.a->>'valeurRetenue')::numeric * 100) else lm.mc end as mr,
      row_number() over (order by lm.idx, lm.nat, lm.lo) as rn
    from lm left join aj on aj.ouvrage_id = lm.ouvrage_id and aj.piece_id is not distinct from lm.piece_id and aj.etat = lm.etat and aj.nature = lm.nature),
  anom as (
    select ouv.idx, f.ouvrage_id, null::text as piece_id, null::text as etat, null::text as nature, 'prix_invalide'::text as code, f.code as detail, 'erreur'::text as gravite
    from px_first f join ouv on ouv.id = f.ouvrage_id where f.code is not null
    union all
    select ouv.idx, ouv.id, null, null, null, 'prix_absent', 'sans_prix', 'info'
    from ouv where not exists (select 1 from px_first f where f.ouvrage_id = ouv.id)
    union all
    select idx, ouvrage_id, piece_id, etat, nature, 'quantite_non_calculable', 'quantite', 'avertissement' from lf where prix_defini and mc is null
    union all
    select idx, ouvrage_id, piece_id, etat, nature, 'estimation_obsolete', 'ajustement_perime', 'avertissement' from lf where a is not null and aj_perime
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
          'valeurRetenue', lf.a->'valeurRetenue', 'raison', lf.a->'raison', 'auteurId', lf.a->'auteurId', 'date', lf.a->'date', 'perime', lf.aj_perime) end,
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

-- ── 3. Prix estimatifs des ouvrages d'un plan ─────────────────────────────────
create table public.tools_releves_estimation_prix (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  plan_id uuid not null,
  ouvrage_id uuid not null unique references public.tools_releves_ouvrages(id) on delete cascade,
  donnees jsonb not null check (pg_column_size(donnees) <= 8000 and public.tools_releve_prix_anomalie(donnees) is null),
  -- `saisie` (utilisateur), `bibliotheque` (repris de la bibliothèque), `copie` (plan dérivé).
  origine text not null default 'saisie' check (origine in ('saisie','bibliotheque','copie')),
  bibliotheque_id uuid references public.tools_releves_ouvrages_bibliotheque(id) on delete set null,
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
create index tools_releves_estimation_prix_plan_idx on public.tools_releves_estimation_prix (plan_id) where deleted_at is null;
create index tools_releves_estimation_prix_releve_idx on public.tools_releves_estimation_prix (releve_id);

create trigger tools_releves_estimation_prix_avant_ecriture before insert or update on public.tools_releves_estimation_prix
  for each row execute function public.tools_releve_enfant_avant_ecriture();

-- Plan figé ou supprimé : aucun prix créé, modifié ni retiré (l'estimation est figée). Le prix appartient à un
-- ouvrage du même plan et n'en change jamais.
create or replace function public.tools_releve_estimation_prix_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tools_releves_plans p where p.id = new.plan_id and (p.fige_le is not null or p.deleted_at is not null)) then
    raise exception 'Plan figé : son estimation est figée' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.plan_id <> old.plan_id or new.ouvrage_id <> old.ouvrage_id) then
    raise exception 'Un prix ne change pas d''ouvrage' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tools_releves_ouvrages o where o.id = new.ouvrage_id and o.plan_id = new.plan_id) then
    raise exception 'Ouvrage étranger au plan' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tools_releves_estimation_prix_garde before insert or update on public.tools_releves_estimation_prix
  for each row execute function public.tools_releve_estimation_prix_garde();

alter table public.tools_releves_estimation_prix enable row level security;
create policy tools_releves_estimation_prix_select on public.tools_releves_estimation_prix
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_estimation_prix from public, anon, authenticated;
grant select on public.tools_releves_estimation_prix to authenticated;
grant select, insert, update, delete on public.tools_releves_estimation_prix to service_role;

-- ── 4. Prix facultatif de la bibliothèque (par entreprise) ────────────────────
create table public.tools_releves_bibliotheque_prix (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  bibliotheque_id uuid not null unique references public.tools_releves_ouvrages_bibliotheque(id) on delete cascade,
  donnees jsonb not null check (pg_column_size(donnees) <= 8000 and public.tools_releve_prix_anomalie(donnees) is null),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  updated_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.utilisateurs(id) on delete set null
);
create index tools_releves_bibliotheque_prix_entreprise_idx on public.tools_releves_bibliotheque_prix (entreprise_id) where deleted_at is null;
create trigger tools_releves_bibliotheque_prix_avant_ecriture before insert or update on public.tools_releves_bibliotheque_prix
  for each row execute function public.tools_releve_bibliotheque_avant_ecriture();

create or replace function public.tools_releve_bibliotheque_prix_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.tools_releves_ouvrages_bibliotheque b where b.id = new.bibliotheque_id and b.entreprise_id = new.entreprise_id) then
    raise exception 'Ouvrage de bibliothèque introuvable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.bibliotheque_id <> old.bibliotheque_id then
    raise exception 'Un prix ne change pas d''ouvrage' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tools_releves_bibliotheque_prix_garde before insert or update on public.tools_releves_bibliotheque_prix
  for each row execute function public.tools_releve_bibliotheque_prix_garde();

alter table public.tools_releves_bibliotheque_prix enable row level security;
create policy tools_releves_bibliotheque_prix_select on public.tools_releves_bibliotheque_prix
  for select to authenticated using (public.tools_releve_action_autorisee(entreprise_id, 'view'));
revoke all on public.tools_releves_bibliotheque_prix from public, anon, authenticated;
grant select on public.tools_releves_bibliotheque_prix to authenticated;
grant select, insert, update, delete on public.tools_releves_bibliotheque_prix to service_role;

-- ── 5. Corrections manuelles de montant (montant retenu ≠ montant automatique) ─
create table public.tools_releves_estimation_ajustements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  plan_id uuid not null,
  ouvrage_id uuid not null references public.tools_releves_ouvrages(id) on delete cascade,
  piece_id uuid,
  etat_projet text not null check (etat_projet in ('existant','a_deposer','nouveau','deplace')),
  nature text not null default 'quantite' check (nature in ('quantite','forfait')),
  valeur_calculee numeric,
  valeur_retenue numeric not null check (valeur_retenue >= 0 and valeur_retenue <= 1e10 and valeur_retenue = round(valeur_retenue, 2)),
  raison text not null check (char_length(btrim(raison)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  retire_le timestamptz,
  retire_par uuid references public.utilisateurs(id) on delete set null,
  raison_retrait text check (raison_retrait is null or char_length(raison_retrait) <= 500),
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (plan_id, releve_id) references public.tools_releves_plans(id, releve_id) on delete cascade
);
create index tools_releves_estimation_ajustements_plan_idx on public.tools_releves_estimation_ajustements (plan_id);
create index tools_releves_estimation_ajustements_releve_idx on public.tools_releves_estimation_ajustements (releve_id);
create index tools_releves_estimation_ajustements_ouvrage_idx on public.tools_releves_estimation_ajustements (ouvrage_id);
create unique index tools_releves_estimation_ajustements_actif_unique on public.tools_releves_estimation_ajustements
  (ouvrage_id, coalesce(piece_id, '00000000-0000-0000-0000-000000000000'::uuid), etat_projet, nature) where retire_le is null;

create or replace function public.tools_releve_estimation_ajustement_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tools_releves_plans p where p.id = new.plan_id and (p.fige_le is not null or p.deleted_at is not null)) then
    raise exception 'Plan figé : son estimation est figée' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.retire_le is not null
       or (to_jsonb(new) - array['retire_le','retire_par','raison_retrait']) <> (to_jsonb(old) - array['retire_le','retire_par','raison_retrait']) then
      raise exception 'Correction immuable : retirez-la et saisissez-en une nouvelle' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tools_releves_estimation_ajustements_garde before insert or update on public.tools_releves_estimation_ajustements
  for each row execute function public.tools_releve_estimation_ajustement_garde();

alter table public.tools_releves_estimation_ajustements enable row level security;
create policy tools_releves_estimation_ajustements_select on public.tools_releves_estimation_ajustements
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_estimation_ajustements from public, anon, authenticated;
grant select on public.tools_releves_estimation_ajustements to authenticated;
grant select, insert, update, delete on public.tools_releves_estimation_ajustements to service_role;

-- Estimation figée avec le plan (posée UNE fois par le gel ; immuable ensuite : garde du Lot 5).
alter table public.tools_releves_plans
  add column estimation jsonb check (estimation is null or (jsonb_typeof(estimation) = 'object' and pg_column_size(estimation) <= 16777216));

-- ── 6. Reprise automatique des prix : plan dérivé (copie) et bibliothèque ─────
-- Un ouvrage créé comme copie (plan dérivé) reprend le prix de son ouvrage d'origine ; un ouvrage créé depuis la
-- bibliothèque reprend le prix de l'entrée (s'il existe). Copie : l'ouvrage évolue ensuite indépendamment.
create or replace function public.tools_releve_ouvrage_reprendre_prix()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.origine_ouvrage_id is not null then
    insert into public.tools_releves_estimation_prix (releve_id, plan_id, ouvrage_id, donnees, origine, bibliotheque_id)
    select new.releve_id, new.plan_id, new.id, p.donnees, 'copie', p.bibliotheque_id
    from public.tools_releves_estimation_prix p where p.ouvrage_id = new.origine_ouvrage_id and p.deleted_at is null;
  elsif new.bibliotheque_id is not null then
    insert into public.tools_releves_estimation_prix (releve_id, plan_id, ouvrage_id, donnees, origine, bibliotheque_id)
    select new.releve_id, new.plan_id, new.id, bp.donnees, 'bibliotheque', bp.bibliotheque_id
    from public.tools_releves_bibliotheque_prix bp where bp.bibliotheque_id = new.bibliotheque_id and bp.deleted_at is null;
  end if;
  return null;
end;
$$;
create trigger tools_releves_ouvrages_reprendre_prix after insert on public.tools_releves_ouvrages
  for each row execute function public.tools_releve_ouvrage_reprendre_prix();

-- Ouvrage supprimé : ses corrections de montant actives sont retirées (tracées), jamais effacées.
create or replace function public.tools_releve_ouvrage_retirer_corrections()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tools_releves_estimation_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Ouvrage supprimé'
  where ouvrage_id = new.id and retire_le is null;
  return null;
end;
$$;
create trigger tools_releves_ouvrages_retirer_corrections after update of deleted_at on public.tools_releves_ouvrages
  for each row when (new.deleted_at is not null and old.deleted_at is null)
  execute function public.tools_releve_ouvrage_retirer_corrections();

-- ── 7. Entrée du moteur, calcul, lecture ──────────────────────────────────────
create or replace function public.tools_releve_estimation_prix_json(p_plan_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ouvrageId', p.ouvrage_id, 'donnees', p.donnees, 'origine', p.origine,
      'bibliothequeId', p.bibliotheque_id, 'revision', p.revision, 'updatedAt', p.updated_at, 'updatedBy', p.updated_by) order by o.ordre, o.id), '[]'::jsonb)
  from public.tools_releves_estimation_prix p join public.tools_releves_ouvrages o on o.id = p.ouvrage_id and o.deleted_at is null
  where p.plan_id = p_plan_id and p.deleted_at is null;
$$;

-- Calcul interne (non exposé) sur un quantitatif donné (figé ou calculé) : prix et corrections actifs du plan.
create or replace function public.tools_releve_plan_estimation_calcul(p_plan_id uuid, p_quantitatif jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_prix jsonb;
begin
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null then return null; end if;
  v_prix := public.tools_releve_estimation_prix_json(p_plan_id);
  return jsonb_build_object('version', 1, 'planId', v_plan.id, 'etageId', v_plan.etage_id, 'etat', v_plan.etat_documente, 'numero', v_plan.numero,
      'base', 'HT', 'devise', 'EUR', 'prix', v_prix)
    || public.tools_releve_estimation_evaluer(jsonb_build_object(
      'ouvrages', coalesce(p_quantitatif->'ouvrages', '[]'::jsonb),
      'lignes', coalesce(p_quantitatif->'lignes', '[]'::jsonb),
      'prix', v_prix,
      'ajustements', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id, 'etatProjet', a.etat_projet,
          'nature', a.nature, 'valeurCalculee', a.valeur_calculee, 'valeurRetenue', a.valeur_retenue, 'raison', a.raison, 'auteurId', a.created_by,
          'date', a.created_at) order by a.id)
        from public.tools_releves_estimation_ajustements a join public.tools_releves_ouvrages o on o.id = a.ouvrage_id and o.deleted_at is null
        where a.plan_id = p_plan_id and a.retire_le is null), '[]'::jsonb)));
end;
$$;

-- Estimation d'un plan déjà autorisé : figée (gel), sinon calculée sur le quantitatif fourni.
create or replace function public.tools_releve_plan_estimation_lire(v_plan public.tools_releves_plans, p_quantitatif jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if v_plan.fige_le is not null and v_plan.estimation is not null then
    return v_plan.estimation || jsonb_build_object('fige', true, 'source', 'gel', 'figeLe', v_plan.fige_le);
  end if;
  return public.tools_releve_plan_estimation_calcul(v_plan.id, p_quantitatif)
    || jsonb_build_object('fige', v_plan.fige_le is not null,
                          'source', case when v_plan.fige_le is not null then 'recalcul_plan_fige_avant_lot10' else 'calcul' end,
                          'figeLe', v_plan.fige_le);
end;
$$;

-- Lecture d'un plan : quantitatif (Lot 9, contrôle d'accès compris) + estimation.
create or replace function public.tools_releve_plan_estimation(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_q jsonb;
begin
  v_q := public.tools_releve_plan_quantitatif(p_plan_id);
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  return jsonb_build_object('quantitatif', v_q, 'estimation', public.tools_releve_plan_estimation_lire(v_plan, v_q)
    || jsonb_build_object('revision', v_plan.revision));
end;
$$;

-- Synthèse d'un relevé : pour chaque étage actif, le plan le plus récent de l'état demandé, son quantitatif et son estimation.
create or replace function public.tools_releve_estimation_synthese(p_releve_id uuid, p_etat text default 'existant')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb[] := '{}'; r record; v_q jsonb; v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('existant','projete','as_built') then raise exception 'État de synthèse inconnu : %', p_etat using errcode = '22023'; end if;
  for r in
    select distinct on (e.id) e.id as etage_id, p.id as plan_id
    from public.tools_releves_etages e
    join public.tools_releves_plans p on p.etage_id = e.id and p.deleted_at is null
      and (case p_etat when 'existant' then p.etat_documente in ('initial','corrige') else p.etat_documente = p_etat end)
    where e.releve_id = p_releve_id and e.deleted_at is null
    order by e.id, p.numero desc
  loop
    select * into v_plan from public.tools_releves_plans p where p.id = r.plan_id;
    v_q := case when v_plan.fige_le is not null and v_plan.quantitatif is not null then v_plan.quantitatif || jsonb_build_object('fige', true, 'source', 'gel')
                else public.tools_releve_plan_quantitatif_calcul(v_plan.id) || jsonb_build_object('fige', v_plan.fige_le is not null,
                  'source', case when v_plan.fige_le is not null then 'recalcul_plan_fige_avant_lot9' else 'calcul' end) end;
    v_out := array_append(v_out, jsonb_build_object('etageId', r.etage_id, 'planId', v_plan.id, 'numero', v_plan.numero, 'etat', v_plan.etat_documente,
      'figeLe', v_plan.fige_le, 'libelle', v_plan.libelle, 'quantitatif', v_q, 'estimation', public.tools_releve_plan_estimation_lire(v_plan, v_q)));
  end loop;
  return to_jsonb(v_out);
end;
$$;

-- Plans d'un étage (préparation multi-scénario : comparer solution A / solution B = deux plans du même étage).
create or replace function public.tools_releve_estimation_plans(p_etage_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_releve uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select e.releve_id into v_releve from public.tools_releves_etages e where e.id = p_etage_id;
  if v_releve is null or not public.tools_releve_peut(v_releve, 'view') then raise exception 'Étage introuvable ou non accessible' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('planId', p.id, 'numero', p.numero, 'etat', p.etat_documente, 'libelle', p.libelle,
      'figeLe', p.fige_le, 'planBaseId', p.plan_base_id) order by p.numero)
    from public.tools_releves_plans p where p.etage_id = p_etage_id and p.deleted_at is null), '[]'::jsonb);
end;
$$;

-- ── 8. Écritures : prix (RPC, contrôle explicite, journal avant / après) ───────
create or replace function public.tools_releve_estimation_prix_ecrire(v_plan public.tools_releves_plans, p_ouvrage_id uuid, p_donnees jsonb,
  p_origine text, p_bibliotheque_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_avant public.tools_releves_estimation_prix;
begin
  v_code := public.tools_releve_prix_anomalie(p_donnees);
  if v_code is not null then raise exception '%', public.tools_releve_prix_message(v_code) using errcode = '22023', detail = v_code; end if;
  if not exists (select 1 from public.tools_releves_ouvrages o where o.id = p_ouvrage_id and o.plan_id = v_plan.id and o.deleted_at is null) then
    raise exception 'Ouvrage introuvable sur ce plan' using errcode = '42501';
  end if;
  select * into v_avant from public.tools_releves_estimation_prix p where p.ouvrage_id = p_ouvrage_id;
  if v_avant.id is null then
    insert into public.tools_releves_estimation_prix (releve_id, plan_id, ouvrage_id, donnees, origine, bibliotheque_id)
    values (v_plan.releve_id, v_plan.id, p_ouvrage_id, p_donnees, p_origine, p_bibliotheque_id);
  else
    update public.tools_releves_estimation_prix set donnees = p_donnees, origine = p_origine, bibliotheque_id = p_bibliotheque_id, deleted_at = null
    where id = v_avant.id;
  end if;
  return case when v_avant.id is null or v_avant.deleted_at is not null then null else v_avant.donnees end;
end;
$$;

create or replace function public.tools_releve_estimation_prix_enregistrer(p_plan_id uuid, p_ouvrage_id uuid, p_donnees jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_avant jsonb;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  v_avant := public.tools_releve_estimation_prix_ecrire(v_plan, p_ouvrage_id, p_donnees, 'saisie', null);
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, case when v_avant is null then 'creation' else 'modification' end,
          array['estimation'], auth.uid(), jsonb_build_object('ouvrage_id', p_ouvrage_id, 'avant', v_avant, 'apres', p_donnees));
  return (select jsonb_build_object('ouvrageId', p.ouvrage_id, 'donnees', p.donnees, 'origine', p.origine, 'revision', p.revision)
          from public.tools_releves_estimation_prix p where p.ouvrage_id = p_ouvrage_id);
end;
$$;

-- Import en lot (plusieurs ouvrages, une transaction, au plus 2 000 prix).
create or replace function public.tools_releve_estimation_prix_importer(p_plan_id uuid, p_prix jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_p jsonb; v_n int := 0;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  if jsonb_typeof(p_prix) is distinct from 'array' or jsonb_array_length(p_prix) not between 1 and 2000 then
    raise exception 'Import : 1 à 2 000 prix' using errcode = '22023';
  end if;
  for v_p in select value from jsonb_array_elements(p_prix) loop
    if coalesce(v_p->>'ouvrageId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Identifiant d''ouvrage obligatoire' using errcode = '22023';
    end if;
    perform public.tools_releve_estimation_prix_ecrire(v_plan, (v_p->>'ouvrageId')::uuid, v_p->'donnees', 'saisie', null);
    v_n := v_n + 1;
  end loop;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', array['estimation'], auth.uid(), jsonb_build_object('import', v_n));
  return v_n;
end;
$$;

create or replace function public.tools_releve_estimation_prix_supprimer(p_plan_id uuid, p_ouvrage_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_avant jsonb;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  update public.tools_releves_estimation_prix set deleted_at = now() where ouvrage_id = p_ouvrage_id and plan_id = p_plan_id and deleted_at is null
  returning donnees into v_avant;
  if v_avant is null then raise exception 'Prix introuvable sur ce plan' using errcode = '42501'; end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'suppression', array['estimation'], auth.uid(),
          jsonb_build_object('ouvrage_id', p_ouvrage_id, 'avant', v_avant));
end;
$$;

-- Prix de la bibliothèque appliqués aux ouvrages du plan : lien de bibliothèque d'abord, sinon code identique.
-- Par défaut seuls les ouvrages SANS prix sont complétés ; `p_remplacer` remplace aussi les prix existants.
create or replace function public.tools_releve_estimation_appliquer_bibliotheque(p_plan_id uuid, p_remplacer boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; r record; v_n int := 0;
begin
  v_plan := public.tools_releve_plan_modifiable(p_plan_id);
  for r in
    select o.id as ouvrage_id, bp.donnees, bp.bibliotheque_id
    from public.tools_releves_ouvrages o
    cross join lateral (
      select bp.donnees, bp.bibliotheque_id from public.tools_releves_bibliotheque_prix bp
      join public.tools_releves_ouvrages_bibliotheque b on b.id = bp.bibliotheque_id and b.deleted_at is null
      where bp.deleted_at is null and bp.entreprise_id = v_plan.entreprise_id
        and (b.id = o.bibliotheque_id or (o.donnees->>'code' is not null and b.donnees->>'code' = o.donnees->>'code'))
      order by (b.id = o.bibliotheque_id) desc, b.id limit 1) bp
    where o.plan_id = p_plan_id and o.deleted_at is null
      and (p_remplacer or not exists (select 1 from public.tools_releves_estimation_prix p where p.ouvrage_id = o.id and p.deleted_at is null))
    order by o.ordre, o.id
  loop
    perform public.tools_releve_estimation_prix_ecrire(v_plan, r.ouvrage_id, r.donnees, 'bibliotheque', r.bibliotheque_id);
    v_n := v_n + 1;
  end loop;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', array['estimation'], auth.uid(),
          jsonb_build_object('bibliotheque', v_n, 'remplacer', p_remplacer));
  return v_n;
end;
$$;

-- ── 9. Corrections de montant : saisie et retrait (RPC) ───────────────────────
create or replace function public.tools_releve_estimation_ajuster(
  p_plan_id uuid, p_ouvrage_id uuid, p_piece_id uuid, p_etat text, p_nature text, p_valeur_retenue numeric, p_raison text
)
returns public.tools_releves_estimation_ajustements
language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_e jsonb; v_ligne jsonb; v_row public.tools_releves_estimation_ajustements;
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
  -- Montant automatique : TOUJOURS celui du serveur au moment de la correction (jamais celui du client).
  v_e := public.tools_releve_plan_estimation_calcul(p_plan_id, public.tools_releve_plan_quantitatif_calcul(p_plan_id));
  select value into v_ligne from jsonb_array_elements(v_e->'lignes')
  where value->>'ouvrageId' = p_ouvrage_id::text and (value->>'pieceId') is not distinct from p_piece_id::text
    and value->>'etatProjet' = p_etat and value->>'nature' = p_nature;
  if v_ligne is null then raise exception 'Ligne d''estimation absente du plan' using errcode = '42501'; end if;
  update public.tools_releves_estimation_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Remplacée par une nouvelle correction'
  where ouvrage_id = p_ouvrage_id and retire_le is null and piece_id is not distinct from p_piece_id and etat_projet = p_etat and nature = p_nature;
  insert into public.tools_releves_estimation_ajustements (entreprise_id, releve_id, plan_id, ouvrage_id, piece_id, etat_projet, nature,
    valeur_calculee, valeur_retenue, raison, created_by)
  values (v_plan.entreprise_id, v_plan.releve_id, p_plan_id, p_ouvrage_id, p_piece_id, p_etat, p_nature,
    (v_ligne->>'montantCalcule')::numeric, p_valeur_retenue, btrim(p_raison), auth.uid())
  returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'ajustement', array['estimation'], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'ouvrage_id', p_ouvrage_id, 'piece_id', p_piece_id, 'etat_projet', p_etat, 'nature', p_nature,
                             'valeur_calculee', v_row.valeur_calculee, 'valeur_retenue', p_valeur_retenue));
  return v_row;
end;
$$;

create or replace function public.tools_releve_estimation_ajustement_retirer(p_id uuid, p_raison text default null)
returns public.tools_releves_estimation_ajustements
language plpgsql security definer set search_path = public as $$
declare v_row public.tools_releves_estimation_ajustements;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_row from public.tools_releves_estimation_ajustements a where a.id = p_id for update;
  if v_row.id is null or not public.tools_releve_peut(v_row.releve_id, 'edit') then
    raise exception 'Correction introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_row.retire_le is not null then raise exception 'Correction déjà retirée' using errcode = '22023'; end if;
  update public.tools_releves_estimation_ajustements set retire_le = now(), retire_par = auth.uid(),
    raison_retrait = coalesce(nullif(btrim(p_raison), ''), 'Retour au montant automatique')
  where id = p_id returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_row.entreprise_id, v_row.releve_id, 'plan', v_row.plan_id, 'ajustement', array['estimation'], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'retrait', true));
  return v_row;
end;
$$;

-- Journal des corrections d'un plan (actives et retirées) : audit complet.
create or replace function public.tools_releve_estimation_corrections(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'view') then raise exception 'Plan introuvable ou non accessible' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ouvrageId', a.ouvrage_id, 'pieceId', a.piece_id, 'etatProjet', a.etat_projet,
      'nature', a.nature, 'valeurCalculee', a.valeur_calculee, 'valeurRetenue', a.valeur_retenue, 'raison', a.raison, 'auteurId', a.created_by,
      'date', a.created_at, 'retireLe', a.retire_le, 'retirePar', a.retire_par, 'raisonRetrait', a.raison_retrait) order by a.created_at, a.id)
    from public.tools_releves_estimation_ajustements a where a.plan_id = p_plan_id), '[]'::jsonb);
end;
$$;

-- ── 10. Bibliothèque : prix facultatif (lecture, écriture, retrait) ──────────
create or replace function public.tools_releve_bibliotheque_prix(p_releve_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  return coalesce((select jsonb_agg(jsonb_build_object('bibliothequeId', bp.bibliotheque_id, 'donnees', bp.donnees, 'revision', bp.revision,
      'updatedAt', bp.updated_at, 'updatedBy', bp.updated_by) order by bp.bibliotheque_id)
    from public.tools_releves_bibliotheque_prix bp join public.tools_releves_ouvrages_bibliotheque b on b.id = bp.bibliotheque_id and b.deleted_at is null
    where bp.entreprise_id = v_entreprise and bp.deleted_at is null), '[]'::jsonb);
end;
$$;

create or replace function public.tools_releve_bibliotheque_prix_enregistrer(p_releve_id uuid, p_bibliotheque_id uuid, p_donnees jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_code text; v_existant public.tools_releves_bibliotheque_prix;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null or not public.tools_releve_peut(p_releve_id, 'edit') or not public.tools_releve_action_autorisee(v_entreprise, 'edit') then
    raise exception 'Bibliothèque non modifiable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tools_releves_ouvrages_bibliotheque b where b.id = p_bibliotheque_id and b.entreprise_id = v_entreprise and b.deleted_at is null) then
    raise exception 'Ouvrage de bibliothèque introuvable' using errcode = '42501';
  end if;
  v_code := public.tools_releve_prix_anomalie(p_donnees);
  if v_code is not null then raise exception '%', public.tools_releve_prix_message(v_code) using errcode = '22023', detail = v_code; end if;
  select * into v_existant from public.tools_releves_bibliotheque_prix bp where bp.bibliotheque_id = p_bibliotheque_id;
  if v_existant.id is null then
    insert into public.tools_releves_bibliotheque_prix (entreprise_id, bibliotheque_id, donnees) values (v_entreprise, p_bibliotheque_id, p_donnees);
  else
    update public.tools_releves_bibliotheque_prix set donnees = p_donnees, deleted_at = null where id = v_existant.id;
  end if;
  return (select jsonb_build_object('bibliothequeId', bp.bibliotheque_id, 'donnees', bp.donnees, 'revision', bp.revision)
          from public.tools_releves_bibliotheque_prix bp where bp.bibliotheque_id = p_bibliotheque_id);
end;
$$;

create or replace function public.tools_releve_bibliotheque_prix_supprimer(p_releve_id uuid, p_bibliotheque_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select r.entreprise_id into v_entreprise from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null or not public.tools_releve_peut(p_releve_id, 'edit') or not public.tools_releve_action_autorisee(v_entreprise, 'edit') then
    raise exception 'Bibliothèque non modifiable' using errcode = '42501';
  end if;
  update public.tools_releves_bibliotheque_prix set deleted_at = now()
  where bibliotheque_id = p_bibliotheque_id and entreprise_id = v_entreprise and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Prix de bibliothèque introuvable' using errcode = '42501'; end if;
end;
$$;

-- ── 11. Gel : Lot 9 + estimation figée ────────────────────────────────────────
create or replace function public.tools_releve_plan_figer(p_plan_id uuid, p_revision bigint, p_libelle text default null)
returns public.tools_releves_plans
language plpgsql security definer set search_path = public, extensions as $$
declare v_plan public.tools_releves_plans; v_version public.tools_releves_versions; v_creer boolean; v_metre jsonb; v_quantitatif jsonb;
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
  v_quantitatif := public.tools_releve_plan_quantitatif_calcul(p_plan_id, v_metre) || jsonb_build_object('calculeLe', now());
  update public.tools_releves_plans set
    fige_le = now(), fige_par = auth.uid(),
    empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(p_plan_id)::text, 'UTF8'), 'sha256'), 'hex'),
    -- Lot 8 : métré figé (hauteurs, ajustements et réglages du moment compris).
    metre = v_metre,
    -- Lot 9 : quantitatif figé (ouvrages, règles et ajustements du moment, sur le métré figé).
    quantitatif = v_quantitatif,
    -- Lot 10 : estimation figée (prix et corrections du moment, sur le quantitatif figé).
    estimation = public.tools_releve_plan_estimation_calcul(p_plan_id, v_quantitatif) || jsonb_build_object('calculeLe', now()),
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

-- ── 12. Droits ────────────────────────────────────────────────────────────────
revoke all on function public.tools_releve_prix_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_prix_message(text) from public, anon;
revoke all on function public.tools_releve_estimation_anomalie_message(text, text) from public, anon;
revoke all on function public.tools_releve_estimation_evaluer(jsonb) from public, anon;
grant execute on function public.tools_releve_prix_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_prix_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_estimation_anomalie_message(text, text) to authenticated, service_role;
-- Moteur pur (aucune lecture de table) : exposé pour la parité et l'aperçu.
grant execute on function public.tools_releve_estimation_evaluer(jsonb) to authenticated, service_role;

revoke all on function public.tools_releve_estimation_prix_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_bibliotheque_prix_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_estimation_ajustement_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_ouvrage_reprendre_prix() from public, anon, authenticated;
revoke all on function public.tools_releve_ouvrage_retirer_corrections() from public, anon, authenticated;
revoke all on function public.tools_releve_estimation_prix_json(uuid) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_estimation_calcul(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_estimation_lire(public.tools_releves_plans, jsonb) from public, anon, authenticated;
revoke all on function public.tools_releve_estimation_prix_ecrire(public.tools_releves_plans, uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.tools_releve_estimation_prix_json(uuid) to service_role;
grant execute on function public.tools_releve_plan_estimation_calcul(uuid, jsonb) to service_role;

revoke all on function public.tools_releve_plan_estimation(uuid) from public, anon;
revoke all on function public.tools_releve_estimation_synthese(uuid, text) from public, anon;
revoke all on function public.tools_releve_estimation_plans(uuid) from public, anon;
revoke all on function public.tools_releve_estimation_prix_enregistrer(uuid, uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_estimation_prix_importer(uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_estimation_prix_supprimer(uuid, uuid) from public, anon;
revoke all on function public.tools_releve_estimation_appliquer_bibliotheque(uuid, boolean) from public, anon;
revoke all on function public.tools_releve_estimation_ajuster(uuid, uuid, uuid, text, text, numeric, text) from public, anon;
revoke all on function public.tools_releve_estimation_ajustement_retirer(uuid, text) from public, anon;
revoke all on function public.tools_releve_estimation_corrections(uuid) from public, anon;
revoke all on function public.tools_releve_bibliotheque_prix(uuid) from public, anon;
revoke all on function public.tools_releve_bibliotheque_prix_enregistrer(uuid, uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_bibliotheque_prix_supprimer(uuid, uuid) from public, anon;
grant execute on function public.tools_releve_plan_estimation(uuid) to authenticated;
grant execute on function public.tools_releve_estimation_synthese(uuid, text) to authenticated;
grant execute on function public.tools_releve_estimation_plans(uuid) to authenticated;
grant execute on function public.tools_releve_estimation_prix_enregistrer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_estimation_prix_importer(uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_estimation_prix_supprimer(uuid, uuid) to authenticated;
grant execute on function public.tools_releve_estimation_appliquer_bibliotheque(uuid, boolean) to authenticated;
grant execute on function public.tools_releve_estimation_ajuster(uuid, uuid, uuid, text, text, numeric, text) to authenticated;
grant execute on function public.tools_releve_estimation_ajustement_retirer(uuid, text) to authenticated;
grant execute on function public.tools_releve_estimation_corrections(uuid) to authenticated;
grant execute on function public.tools_releve_bibliotheque_prix(uuid) to authenticated;
grant execute on function public.tools_releve_bibliotheque_prix_enregistrer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_bibliotheque_prix_supprimer(uuid, uuid) to authenticated;

revoke all on function public.tools_releve_plan_figer(uuid, bigint, text) from public, anon;
grant execute on function public.tools_releve_plan_figer(uuid, bigint, text) to authenticated;
