-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 8 — DIMENSIONS, SURFACES, VOLUMES & REVÊTEMENTS V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT8_DIMENSIONS_SURFACES_REVETEMENTS_V1.md
--
-- Posée APRÈS le Lot 7 (20260928001101). Plage 12xx réservée au Lot 8.
--
-- Strictement ADDITIF (aucune ligne existante invalidée ni réécrite ; aucune garde affaiblie) :
--   1. Contrat générique des éléments redéfini À L'IDENTIQUE de 1101, seule la liste des revêtements
--      s'allonge (résine, dalle, BA13, acoustique, panneau ; linéaires : plinthe, corniche, profilé,
--      barrière, bande périphérique).
--   2. Deux nouveaux types d'élément de plan (`plan_id`) : `mesure` (COTES manuelles et hauteurs
--      ponctuelles) et `materiau` (REVÊTEMENTS de sol, murs, plafond, linéaires d'une pièce). Toutes les
--      gardes de plan des Lots 5 → 7 s'appliquent (même étage, plan figé immuable…).
--   3. Contrôles serveur (miroir du domaine, messages identiques) : `tools_releve_plan_cote_anomalie`,
--      `tools_releve_plan_revetement_anomalie`, état projeté des murs / ouvertures (EXISTING / TO_REMOVE /
--      NEW / MOVED). Garde de ligne `tools_releve_element_lot8_garde` : aussi pour l'écriture directe.
--   4. MÉTRÉ calculé par le SERVEUR (`tools_releve_plan_metre_calcul`) à partir de la géométrie du plan —
--      jamais d'une surface envoyée par le client : surface brute / nette, périmètre brut / utile, faces de
--      murs (arête du contour ↔ mur retrouvée géométriquement), surfaces murales brutes, déductions des
--      ouvertures (option « petites ouvertures » : seuil choisi par l'utilisateur, aucun seuil par défaut),
--      plafond, volume (seulement si la hauteur est connue : pièce, sinon étage — jamais inventée),
--      ouvertures (largeur, hauteur, surface), revêtements (quantité, perte), travaux du projeté.
--   5. AJUSTEMENTS (`tools_releves_metre_ajustements`) : valeur calculée (par le serveur), valeur retenue,
--      raison, auteur, date — une valeur calculée n'est jamais écrasée ; retrait tracé ; journal.
--   6. GEL : le métré est figé avec le plan (`tools_releves_plans.metre`, posé par `tools_releve_plan_figer`
--      et immuable ensuite par la garde du Lot 5). Plan dérivé : cotes et revêtements copiés (lignée), les
--      ajustements NE le sont PAS (recalcul indépendant).
--   7. Lecture : `tools_releve_plan_metre` (un plan) et `tools_releve_metre_synthese` (un relevé, par état).
--
-- RLS : nouvelle table en lecture seule pour `authenticated` (policy `view`), écriture par RPC seulement.
-- RGPD : `entreprise_id` présent → export et purge génériques.
-- Miroir TypeScript : packages/releve-domain/src/metre.ts (parité testée).

-- ── 1. Contrat générique des éléments (1101 + revêtements Lot 8) ──────────────
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
    when 'equipement' then p_donnees->>'categorie' in ('mobilier','electricite','plomberie','cvc','eclairage','autre','sanitaire','cuisine','securite','rangement','technique')
      and jsonb_typeof(p_donnees->'position') = 'object' and coalesce(btrim(p_donnees->>'libelle'), '') <> ''
    when 'mesure' then jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'typeMesure' in ('longueur','largeur','hauteur','diagonale','distance','angle','surface','volume')
      and p_donnees->>'unite' in ('mm','rad','mm2','mm3')
      and p_donnees->>'source' in ('manuel','calcule','laser','photo','ar','lidar')
      and jsonb_typeof(p_donnees->'cible') = 'object'
    when 'photo_anchor' then coalesce(p_donnees->>'mediaId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_donnees->'ancre') = 'object'
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_entier_facultatif_valide(p_donnees->'ordre', 0, 10000)
      and public.tools_releve_reperes_valides(p_donnees->'reperes')
    when 'annotation' then jsonb_typeof(p_donnees->'ancre') = 'object'
      and (p_donnees->'forme' is null or jsonb_typeof(p_donnees->'forme') = 'null'
           or p_donnees->>'forme' in ('texte','fleche','cercle','zone','cote','symbole','commentaire'))
      and jsonb_typeof(p_donnees->'texte') = 'string' and char_length(p_donnees->>'texte') <= 2000
      and (coalesce(p_donnees->>'forme', 'texte') not in ('texte','commentaire') or btrim(p_donnees->>'texte') <> '')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'geometrie')
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_geometrie_photo_valide(p_donnees->>'forme', p_donnees->'geometrie')
    when 'materiau' then coalesce(btrim(p_donnees->>'libelle'), '') <> ''
      and p_donnees->>'categorie' in ('sol','mur','plafond','plinthe','menuiserie','autre')
      and p_donnees->>'unite' in ('m2','ml','m3','u')
      -- Lot 8 : familles de revêtement étendues (sur-ensemble ordonné de la Recovery V2).
      and (p_donnees->'revetement' is null or jsonb_typeof(p_donnees->'revetement') = 'null'
           or p_donnees->>'revetement' in ('peinture','carrelage','faience','parquet','stratifie','moquette','pvc','panneau_decoratif','papier_peint','enduit','beton','autre',
                                           'resine','dalle','ba13','acoustique','panneau','plinthe','corniche','profile','barriere','bande_peripherique'))
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

-- ── 2. Cotes et revêtements rattachés à un plan ───────────────────────────────
alter table public.tools_releves_elements drop constraint tools_releves_elements_plan_type;
alter table public.tools_releves_elements
  add constraint tools_releves_elements_plan_type check (plan_id is null or type in ('mur','ouverture','equipement','mesure','materiau'));

-- Journal : action « ajustement » (valeur retenue d'un métré), sur-ensemble de la liste existante.
alter table public.tools_releves_journal drop constraint if exists tools_releves_journal_action_check;
alter table public.tools_releves_journal add constraint tools_releves_journal_action_check
  check (action in ('creation','modification','suppression','restauration','partage','transfert','version','renommage','deplacement','reordonnancement','duplication','ajustement'));

-- Métré figé avec le plan (posé UNE fois par le gel ; immuable ensuite : garde du Lot 5).
alter table public.tools_releves_plans
  add column metre jsonb check (metre is null or (jsonb_typeof(metre) = 'object' and fige_le is not null));

-- ── 3. Contrôles (miroir du domaine, messages identiques) ─────────────────────
create or replace function public.tools_releve_etat_projet_valide(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p is null or jsonb_typeof(p) = 'null' or coalesce(p #>> '{}', '') in ('existant','a_deposer','nouveau','deplace');
$$;

-- Cote de plan (élément `mesure`). NULL si valide, sinon : type_cote, points, valeur, decalage, libelle,
-- etat_projet, invalide. Cote « calculée » : la valeur doit être la longueur a → b (±1 mm).
create or replace function public.tools_releve_plan_cote_anomalie(p_donnees jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare v_type text; v_long numeric;
begin
  if jsonb_typeof(p_donnees) <> 'object' then return 'invalide'; end if;
  v_type := coalesce(p_donnees->>'typeCote', '');
  if v_type not in ('libre','interieure','exterieure','cumulee','partielle','ouverture','implantation','hauteur') then return 'type_cote'; end if;
  if not public.tools_releve_plan_point_valide(p_donnees->'a') then return 'points'; end if;
  if v_type = 'hauteur' then
    if coalesce(p_donnees->>'typeMesure', '') <> 'hauteur' then return 'invalide'; end if;
    if jsonb_typeof(p_donnees->'valeur') <> 'number' or (p_donnees->>'valeur')::numeric <= 0 or (p_donnees->>'valeur')::numeric > 20000 then return 'valeur'; end if;
    if coalesce(p_donnees->>'source', '') = 'calcule' then return 'valeur'; end if;
  else
    if not public.tools_releve_plan_point_valide(p_donnees->'b') then return 'points'; end if;
    v_long := sqrt(((p_donnees->'b'->>'x')::numeric - (p_donnees->'a'->>'x')::numeric) ^ 2 + ((p_donnees->'b'->>'y')::numeric - (p_donnees->'a'->>'y')::numeric) ^ 2);
    if v_long < 1 then return 'points'; end if;
    if coalesce(p_donnees->>'typeMesure', '') not in ('longueur','largeur','diagonale','distance') then return 'invalide'; end if;
    if jsonb_typeof(p_donnees->'valeur') <> 'number' or (p_donnees->>'valeur')::numeric <= 0 or (p_donnees->>'valeur')::numeric > 1000000 then return 'valeur'; end if;
    if coalesce(p_donnees->>'source', '') = 'calcule' and abs((p_donnees->>'valeur')::numeric - v_long) > 1 then return 'valeur'; end if;
    if jsonb_typeof(p_donnees->'decalageMm') <> 'number' or abs((p_donnees->>'decalageMm')::numeric) > 100000 then return 'decalage'; end if;
  end if;
  if coalesce(p_donnees->>'unite', '') <> 'mm' or coalesce(p_donnees->>'source', '') not in ('manuel','calcule','laser') then return 'invalide'; end if;
  if p_donnees ? 'libelle' and jsonb_typeof(p_donnees->'libelle') <> 'null'
     and (jsonb_typeof(p_donnees->'libelle') <> 'string' or char_length(p_donnees->>'libelle') > 200) then return 'libelle'; end if;
  if not public.tools_releve_etat_projet_valide(p_donnees->'etatProjet') then return 'etat_projet'; end if;
  return null;
end;
$$;

create or replace function public.tools_releve_plan_cote_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'type_cote' then 'Type de cote inconnu.'
    when 'points' then 'Cote invalide : deux points distincts du repère sont attendus.'
    when 'valeur' then 'Valeur de cote invalide.'
    when 'decalage' then 'Décalage de la ligne de cote invalide.'
    when 'libelle' then 'Libellé de cote trop long (200 caractères au plus).'
    when 'etat_projet' then 'État projeté inconnu.'
    when 'piece' then 'Pièce absente de l''étage du plan.'
    else 'Cote invalide.' end;
$$;

-- Revêtement d'une pièce (élément `materiau`). NULL si valide, sinon : categorie, famille, unite, perte,
-- application, texte, etat_projet, invalide.
create or replace function public.tools_releve_plan_revetement_anomalie(p_donnees jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare v_cat text; v_fam text; v_app jsonb; v_mode text;
begin
  if jsonb_typeof(p_donnees) <> 'object' then return 'invalide'; end if;
  v_cat := coalesce(p_donnees->>'categorie', '');
  if v_cat not in ('sol','mur','plafond','plinthe') then return 'categorie'; end if;
  v_fam := coalesce(p_donnees->>'revetement', '');
  if not (case v_cat
      when 'sol' then v_fam in ('carrelage','parquet','stratifie','pvc','moquette','resine','beton','autre')
      when 'mur' then v_fam in ('peinture','papier_peint','faience','carrelage','panneau_decoratif','enduit','autre')
      when 'plafond' then v_fam in ('peinture','dalle','ba13','acoustique','panneau','autre')
      else v_fam in ('plinthe','corniche','profile','barriere','bande_peripherique','autre') end) then
    return 'famille';
  end if;
  if coalesce(p_donnees->>'unite', '') <> (case when v_cat = 'plinthe' then 'ml' else 'm2' end) then return 'unite'; end if;
  if jsonb_typeof(p_donnees->'pertePourcent') <> 'number' or (p_donnees->>'pertePourcent')::numeric < 0
     or (p_donnees->>'pertePourcent')::numeric > 100 or round((p_donnees->>'pertePourcent')::numeric, 2) <> (p_donnees->>'pertePourcent')::numeric then
    return 'perte';
  end if;
  v_app := coalesce(p_donnees->'application', '{"mode":"tous"}'::jsonb);
  v_mode := coalesce(v_app->>'mode', '');
  if jsonb_typeof(v_app) <> 'object' or v_mode not in ('tous','murs','zone') or (v_cat <> 'mur' and v_mode <> 'tous') then return 'application'; end if;
  if v_mode = 'murs' and (jsonb_typeof(v_app->'murIds') <> 'array' or jsonb_array_length(v_app->'murIds') not between 1 and 200
       or not public.tools_releve_liste_uuid_valide(v_app->'murIds', 200)) then return 'application'; end if;
  if v_mode = 'zone' and (coalesce(v_app->>'murId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_app->'debutMm') <> 'number' or jsonb_typeof(v_app->'finMm') <> 'number'
       or jsonb_typeof(v_app->'basMm') <> 'number' or jsonb_typeof(v_app->'hautMm') <> 'number'
       or (v_app->>'debutMm')::numeric < 0 or (v_app->>'finMm')::numeric <= (v_app->>'debutMm')::numeric or (v_app->>'finMm')::numeric > 1000000
       or (v_app->>'basMm')::numeric < 0 or (v_app->>'hautMm')::numeric <= (v_app->>'basMm')::numeric or (v_app->>'hautMm')::numeric > 20000) then
    return 'application';
  end if;
  if jsonb_typeof(p_donnees->'libelle') <> 'string' or btrim(p_donnees->>'libelle') = '' or char_length(p_donnees->>'libelle') > 200
     or (p_donnees ? 'sensPose' and jsonb_typeof(p_donnees->'sensPose') <> 'null' and (jsonb_typeof(p_donnees->'sensPose') <> 'string' or char_length(p_donnees->>'sensPose') > 100))
     or (p_donnees ? 'format' and jsonb_typeof(p_donnees->'format') <> 'null' and (jsonb_typeof(p_donnees->'format') <> 'string' or char_length(p_donnees->>'format') > 100))
     or (p_donnees ? 'commentaire' and jsonb_typeof(p_donnees->'commentaire') <> 'null' and (jsonb_typeof(p_donnees->'commentaire') <> 'string' or char_length(p_donnees->>'commentaire') > 2000)) then
    return 'texte';
  end if;
  if not public.tools_releve_etat_projet_valide(p_donnees->'etatProjet') then return 'etat_projet'; end if;
  return null;
end;
$$;

create or replace function public.tools_releve_plan_revetement_message(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'categorie' then 'Support de revêtement inconnu (sol, murs, plafond, linéaire).'
    when 'famille' then 'Famille de revêtement inconnue pour ce support.'
    when 'unite' then 'Unité incohérente : m² pour une surface, ml pour un linéaire.'
    when 'perte' then 'Perte entre 0 et 100 % (deux décimales au plus).'
    when 'application' then 'Application invalide : tous les murs, des murs choisis ou une zone de mur.'
    when 'texte' then 'Libellé obligatoire ; libellé, sens de pose, format ou commentaire trop long.'
    when 'etat_projet' then 'État projeté inconnu.'
    when 'mur_absent' then 'Le revêtement vise un mur absent du plan.'
    when 'piece' then 'Un revêtement appartient à une pièce de l''étage du plan.'
    else 'Revêtement invalide.' end;
$$;

-- Garde de ligne (RPC ET écriture directe) : cotes, revêtements et état projeté des murs / ouvertures.
create or replace function public.tools_releve_element_lot8_garde()
returns trigger language plpgsql set search_path = public as $$
declare v_code text;
begin
  if new.plan_id is null or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.donnees is not distinct from old.donnees and new.piece_id is not distinct from old.piece_id then return new; end if;
  if new.type in ('mur','ouverture') then
    if not public.tools_releve_etat_projet_valide(new.donnees->'etatProjet') then
      raise exception 'État projeté inconnu.' using errcode = '22023', detail = 'etat_projet:' || new.id::text;
    end if;
  elsif new.type = 'mesure' then
    v_code := public.tools_releve_plan_cote_anomalie(new.donnees);
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_cote_message(v_code) using errcode = '22023', detail = v_code || ':' || new.id::text;
    end if;
  elsif new.type = 'materiau' then
    v_code := public.tools_releve_plan_revetement_anomalie(new.donnees);
    if v_code is null and new.piece_id is null then v_code := 'piece'; end if;
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_revetement_message(v_code) using errcode = '22023', detail = v_code || ':' || new.id::text;
    end if;
  end if;
  return new;
end;
$$;
create trigger tools_releves_elements_lot8_garde before insert or update on public.tools_releves_elements
  for each row execute function public.tools_releve_element_lot8_garde();

-- ── 4. Ajustements (valeur retenue ≠ valeur calculée, auditée) ────────────────
create table public.tools_releves_metre_ajustements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  releve_id uuid not null,
  plan_id uuid not null,
  piece_id uuid,
  revetement_id uuid,
  grandeur text not null check (grandeur in ('surface_sol','surface_plafond','perimetre_brut','perimetre_utile','surface_murs','volume','quantite')),
  unite text not null check (unite in ('mm','mm2','mm3')),
  valeur_calculee numeric,
  valeur_retenue numeric not null check (valeur_retenue >= 0 and valeur_retenue <= 1e18),
  raison text not null check (char_length(btrim(raison)) between 3 and 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  retire_le timestamptz,
  retire_par uuid references public.utilisateurs(id) on delete set null,
  raison_retrait text check (raison_retrait is null or char_length(raison_retrait) <= 500),
  foreign key (releve_id, entreprise_id) references public.tools_releves(id, entreprise_id) on delete cascade,
  foreign key (plan_id, releve_id) references public.tools_releves_plans(id, releve_id) on delete cascade,
  check ((grandeur = 'quantite') = (revetement_id is not null)),
  check (grandeur = 'quantite' or piece_id is not null)
);
create index tools_releves_metre_ajustements_plan_idx on public.tools_releves_metre_ajustements (plan_id);
create index tools_releves_metre_ajustements_releve_idx on public.tools_releves_metre_ajustements (releve_id);
create unique index tools_releves_metre_ajustements_actif_unique on public.tools_releves_metre_ajustements
  (plan_id, coalesce(piece_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(revetement_id, '00000000-0000-0000-0000-000000000000'::uuid), grandeur)
  where retire_le is null;

-- Plan figé : aucun ajustement créé ni retiré ; une ligne ne change que par son retrait.
create or replace function public.tools_releve_metre_ajustement_garde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tools_releves_plans p where p.id = new.plan_id and (p.fige_le is not null or p.deleted_at is not null)) then
    raise exception 'Plan figé : son métré est figé' using errcode = '42501';
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
create trigger tools_releves_metre_ajustements_garde before insert or update on public.tools_releves_metre_ajustements
  for each row execute function public.tools_releve_metre_ajustement_garde();

alter table public.tools_releves_metre_ajustements enable row level security;
create policy tools_releves_metre_ajustements_select on public.tools_releves_metre_ajustements
  for select to authenticated using (public.tools_releve_peut(releve_id, 'view'));
revoke all on public.tools_releves_metre_ajustements from public, anon, authenticated;
grant select on public.tools_releves_metre_ajustements to authenticated;
grant select, insert, update, delete on public.tools_releves_metre_ajustements to service_role;

-- ── 5. Métré calculé par le serveur ───────────────────────────────────────────
-- Conventions : mm, mm², mm³ ; longueurs arrondies au dixième de mm, surfaces et volumes au mm² / mm³ entier
-- (numeric : aucune erreur de flottant). Voir le rapport §5–§13 pour chaque règle.
create or replace function public.tools_releve_plan_metre_calcul(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan public.tools_releves_plans; v_etage_h numeric; v_seuil numeric;
  v_murs jsonb; v_ouv jsonb; v_ouv_list jsonb; v_pieces jsonb; v_hp_map jsonb; v_aj_map jsonb; v_aj_rev jsonb;
  -- Tableaux PL/pgSQL (ajout en temps amorti constant) : jamais de concaténation jsonb dans une boucle.
  v_rooms_arr jsonb[] := '{}'; v_rev_arr jsonb[] := '{}';
  r record; v_c jsonb; v_pts jsonb; v_n int; i int; v_p jsonb; v_q jsonb;
  v_px numeric; v_py numeric; v_qx numeric; v_qy numeric; v_dx numeric; v_dy numeric; v_l numeric;
  v_m text; v_w jsonb; v_wl numeric; v_ux numeric; v_uy numeric; v_d numeric; v_t0 numeric; v_t1 numeric; v_ta numeric; v_tb numeric;
  v_best text; v_best_score numeric; v_best_t0 numeric; v_best_t1 numeric; v_score numeric; v_e numeric;
  v_o jsonb; v_ol numeric; v_heff numeric; v_allege numeric; v_osurf numeric; v_deduite boolean; v_franchi boolean;
  v_h numeric; v_hsrc text; v_surface numeric; v_perim numeric; v_perim_ded numeric;
  v_brute numeric; v_ded numeric; v_face_ded numeric; v_faces jsonb[]; v_room_ouv jsonb; v_rooms jsonb; v_room_map jsonb;
  v_room jsonb; v_aj jsonb; v_aj_list jsonb; v_ret jsonb; v_hp jsonb;
  v_rev jsonb; v_app jsonb; v_q_base numeric; v_calculable boolean; v_raison text; v_face jsonb;
  v_zd numeric; v_zf numeric; v_zb numeric; v_zh numeric; v_ox numeric; v_oy numeric; v_perte numeric; v_ids jsonb;
  v_travaux jsonb;
begin
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null then return null; end if;
  select e.hauteur_sous_plafond_mm into v_etage_h from public.tools_releves_etages e where e.id = v_plan.etage_id;
  v_seuil := case when jsonb_typeof(v_plan.reglages->'metre'->'seuilDeductionMm2') = 'number'
                  then (v_plan.reglages->'metre'->>'seuilDeductionMm2')::numeric end;

  -- Murs, ouvertures, pièces, hauteurs ponctuelles, ajustements : une lecture agrégée chacun (O(n)).
  select coalesce(jsonb_object_agg(x.id::text, jsonb_build_object(
      'ax', (x.donnees->'a'->>'x')::numeric, 'ay', (x.donnees->'a'->>'y')::numeric,
      'bx', (x.donnees->'b'->>'x')::numeric, 'by', (x.donnees->'b'->>'y')::numeric, 'e', (x.donnees->>'epaisseurMm')::numeric)), '{}'::jsonb)
    into v_murs from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'mur' and x.deleted_at is null;
  select coalesce(jsonb_object_agg(t.mur_id, t.liste), '{}'::jsonb) into v_ouv from (
    select x.parent_element_id::text as mur_id, jsonb_agg(jsonb_build_object('id', x.id, 'murId', x.parent_element_id, 'type', x.donnees->>'typeOuverture',
      'd', (x.donnees->>'decalageMm')::numeric, 'l', (x.donnees->>'largeurMm')::numeric, 'h', (x.donnees->>'hauteurMm')::numeric,
      'allege', case when jsonb_typeof(x.donnees->'allegeMm') = 'number' then (x.donnees->>'allegeMm')::numeric end,
      'etat', coalesce(x.donnees->>'etatProjet', 'existant')) order by x.id) as liste
    from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'ouverture' and x.deleted_at is null group by x.parent_element_id) t;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'murId', x.parent_element_id, 'typeOuverture', x.donnees->>'typeOuverture',
      'largeurMm', (x.donnees->>'largeurMm')::numeric, 'hauteurMm', (x.donnees->>'hauteurMm')::numeric,
      'allegeMm', case when jsonb_typeof(x.donnees->'allegeMm') = 'number' then (x.donnees->>'allegeMm')::numeric end,
      'surfaceMm2', round((x.donnees->>'largeurMm')::numeric * (x.donnees->>'hauteurMm')::numeric),
      'etatProjet', coalesce(x.donnees->>'etatProjet', 'existant')) order by x.id), '[]'::jsonb)
    into v_ouv_list from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'ouverture' and x.deleted_at is null;
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object('h', p.hauteur_sous_plafond_mm, 'supprime', p.deleted_at is not null)), '{}'::jsonb)
    into v_pieces from public.tools_releves_pieces p where p.etage_id = v_plan.etage_id;
  select coalesce(jsonb_object_agg(t.pid, t.liste), '{}'::jsonb) into v_hp_map from (
    select x.piece_id::text as pid, jsonb_agg(jsonb_build_object('id', x.id, 'valeurMm', (x.donnees->>'valeur')::numeric, 'point', x.donnees->'a') order by x.id) as liste
    from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'mesure' and x.deleted_at is null
      and x.piece_id is not null and x.donnees->>'typeCote' = 'hauteur' group by x.piece_id) t;
  select coalesce(jsonb_object_agg(t.pid, t.liste), '{}'::jsonb) into v_aj_map from (
    select a.piece_id::text as pid, jsonb_agg(to_jsonb(a) order by a.grandeur) as liste from public.tools_releves_metre_ajustements a
    where a.plan_id = p_plan_id and a.revetement_id is null and a.retire_le is null group by a.piece_id) t;
  select coalesce(jsonb_object_agg(a.revetement_id::text, to_jsonb(a)), '{}'::jsonb) into v_aj_rev from public.tools_releves_metre_ajustements a
    where a.plan_id = p_plan_id and a.revetement_id is not null and a.retire_le is null;

  -- Pièces (contours du plan).
  for v_c in select value from jsonb_array_elements(v_plan.contours) loop
    v_room := v_pieces->(v_c->>'pieceId');
    if v_room is null or (v_room->>'supprime')::boolean then continue; end if;
    v_h := coalesce((v_room->>'h')::numeric, v_etage_h);
    v_hsrc := case when v_room->'h' <> 'null'::jsonb then 'piece' when v_etage_h is not null then 'etage' end;
    v_pts := v_c->'points'; v_n := jsonb_array_length(v_pts);
    v_surface := round(public.tools_releve_plan_surface(v_pts));
    v_perim := 0; v_perim_ded := 0; v_ded := 0; v_faces := '{}'; v_room_ouv := '{}'::jsonb;
    for i in 0 .. v_n - 1 loop
      v_p := v_pts->i; v_q := v_pts->((i + 1) % v_n);
      v_px := (v_p->>'x')::numeric; v_py := (v_p->>'y')::numeric; v_qx := (v_q->>'x')::numeric; v_qy := (v_q->>'y')::numeric;
      v_dx := v_qx - v_px; v_dy := v_qy - v_py; v_l := sqrt(v_dx * v_dx + v_dy * v_dy);
      if v_l < 0.5 then continue; end if;
      v_perim := v_perim + v_l;
      -- Mur de l'arête : parallèle, à une demi-épaisseur (±2 mm) de l'axe au plus, en regard.
      v_best := null; v_best_score := null;
      for v_m in select m #>> '{}' from jsonb_array_elements(coalesce(v_c->'murIds', '[]'::jsonb)) m loop
        v_w := v_murs->v_m;
        if v_w is null then continue; end if;
        v_wl := sqrt(((v_w->>'bx')::numeric - (v_w->>'ax')::numeric) ^ 2 + ((v_w->>'by')::numeric - (v_w->>'ay')::numeric) ^ 2);
        if v_wl = 0 then continue; end if;
        v_ux := ((v_w->>'bx')::numeric - (v_w->>'ax')::numeric) / v_wl; v_uy := ((v_w->>'by')::numeric - (v_w->>'ay')::numeric) / v_wl;
        if abs(v_ux * v_dy / v_l - v_uy * v_dx / v_l) > 0.01 then continue; end if;
        v_e := (v_w->>'e')::numeric;
        v_d := abs(v_ux * ((v_py + v_qy) / 2 - (v_w->>'ay')::numeric) - v_uy * ((v_px + v_qx) / 2 - (v_w->>'ax')::numeric));
        if v_d > v_e / 2 + 2 then continue; end if;
        v_ta := v_ux * (v_px - (v_w->>'ax')::numeric) + v_uy * (v_py - (v_w->>'ay')::numeric);
        v_tb := v_ux * (v_qx - (v_w->>'ax')::numeric) + v_uy * (v_qy - (v_w->>'ay')::numeric);
        v_t0 := least(v_ta, v_tb); v_t1 := greatest(v_ta, v_tb);
        if v_t1 < -v_e or v_t0 > v_wl + v_e then continue; end if;
        v_score := abs(v_d - v_e / 2);
        if v_best_score is null or v_score < v_best_score then v_best := v_m; v_best_score := v_score; v_best_t0 := v_t0; v_best_t1 := v_t1; end if;
      end loop;
      v_face_ded := 0;
      if v_best is not null then
        for v_o in select value from jsonb_array_elements(coalesce(v_ouv->v_best, '[]'::jsonb)) loop
          v_ol := least((v_o->>'d')::numeric + (v_o->>'l')::numeric, v_best_t1) - greatest((v_o->>'d')::numeric, v_best_t0);
          if v_ol <= 1 then continue; end if;
          v_allege := coalesce((v_o->>'allege')::numeric, 0);
          v_heff := case when v_h is null then (v_o->>'h')::numeric else greatest(0, least(v_allege + (v_o->>'h')::numeric, v_h) - v_allege) end;
          v_osurf := (v_o->>'l')::numeric * (v_o->>'h')::numeric;
          v_deduite := v_seuil is null or v_osurf >= v_seuil;
          v_franchi := (v_o->>'type') in ('porte','porte_fenetre','passage')
                       or ((v_o->>'type') in ('baie','tremie') and jsonb_typeof(v_o->'allege') = 'number' and (v_o->>'allege')::numeric = 0);
          if v_deduite then v_face_ded := v_face_ded + v_ol * v_heff; end if;
          if v_franchi then v_perim_ded := v_perim_ded + v_ol; end if;
          v_room_ouv := jsonb_set(v_room_ouv, array[v_o->>'id'], jsonb_build_object(
            'id', v_o->'id', 'murId', v_o->'murId', 'typeOuverture', v_o->'type', 'largeurMm', v_o->'l', 'hauteurMm', v_o->'h', 'allegeMm', v_o->'allege',
            'surfaceMm2', round(v_osurf), 'deduite', v_deduite, 'franchissable', v_franchi, 'etatProjet', v_o->'etat',
            'longueurDansPieceMm', round(coalesce((v_room_ouv->(v_o->>'id')->>'longueurDansPieceMm')::numeric, 0) + v_ol, 1),
            'deductionMm2', round(coalesce((v_room_ouv->(v_o->>'id')->>'deductionMm2')::numeric, 0) + case when v_deduite then v_ol * v_heff else 0 end)));
        end loop;
      end if;
      v_ded := v_ded + v_face_ded;
      v_faces := array_append(v_faces, jsonb_build_object('index', i, 'murId', v_best, 'longueurMm', round(v_l, 1),
        'debutMm', case when v_best is not null then round(v_best_t0, 1) end, 'finMm', case when v_best is not null then round(v_best_t1, 1) end,
        'surfaceBruteMm2', case when v_h is not null then round(v_l * v_h) end, 'deductionsMm2', round(v_face_ded),
        'surfaceNetteMm2', case when v_h is not null then round(v_l * v_h) - round(v_face_ded) end));
    end loop;
    v_brute := case when v_h is not null then round(v_perim * v_h) end;
    v_hp := coalesce(v_hp_map->(v_c->>'pieceId'), '[]'::jsonb);
    v_room := jsonb_build_object(
      'pieceId', (v_c->>'pieceId')::uuid, 'hauteurMm', v_h, 'hauteurSource', v_hsrc,
      'surfaceSolBruteMm2', v_surface, 'surfaceSolNetteMm2', v_surface, 'surfacePlafondMm2', v_surface,
      'perimetreBrutMm', round(v_perim, 1), 'perimetreUtileMm', round(greatest(0, v_perim - v_perim_ded), 1),
      'surfaceMursBruteMm2', v_brute, 'deductionsMm2', round(v_ded),
      'surfaceMursNetteMm2', case when v_brute is not null then v_brute - round(v_ded) end,
      'volumeMm3', case when v_h is not null then round(v_surface * v_h) end,
      'faces', to_jsonb(v_faces),
      'ouvertures', coalesce((select jsonb_agg(value order by value->>'id') from jsonb_each(v_room_ouv)), '[]'::jsonb),
      'hauteursPonctuelles', v_hp);
    -- Ajustements actifs de la pièce : valeur retenue, calculée à la saisie, périmée si le calcul a changé.
    v_aj_list := '[]'::jsonb; v_ret := jsonb_build_object(
      'surface_sol', v_room->'surfaceSolNetteMm2', 'surface_plafond', v_room->'surfacePlafondMm2', 'perimetre_brut', v_room->'perimetreBrutMm',
      'perimetre_utile', v_room->'perimetreUtileMm', 'surface_murs', v_room->'surfaceMursNetteMm2', 'volume', v_room->'volumeMm3');
    for v_aj in select value from jsonb_array_elements(coalesce(v_aj_map->(v_c->>'pieceId'), '[]'::jsonb)) loop
      v_aj_list := v_aj_list || jsonb_build_array(jsonb_build_object('id', v_aj->'id', 'grandeur', v_aj->'grandeur', 'unite', v_aj->'unite',
        'valeurCalculee', v_aj->'valeur_calculee', 'valeurRetenue', v_aj->'valeur_retenue', 'raison', v_aj->'raison', 'auteurId', v_aj->'created_by', 'date', v_aj->'created_at',
        'perime', (v_aj->>'valeur_calculee')::numeric is distinct from (case when jsonb_typeof(v_ret->(v_aj->>'grandeur')) = 'number' then (v_ret->>(v_aj->>'grandeur'))::numeric end)));
      v_ret := v_ret || jsonb_build_object(v_aj->>'grandeur', v_aj->'valeur_retenue');
    end loop;
    v_aj := null;
    v_rooms_arr := array_append(v_rooms_arr, v_room || jsonb_build_object('ajustements', v_aj_list, 'retenu', v_ret));
  end loop;
  v_rooms := to_jsonb(v_rooms_arr);
  select coalesce(jsonb_object_agg(value->>'pieceId', value), '{}'::jsonb) into v_room_map from jsonb_array_elements(v_rooms);

  -- Revêtements.
  for r in select x.id, x.piece_id, x.donnees from public.tools_releves_elements x
           where x.plan_id = p_plan_id and x.type = 'materiau' and x.deleted_at is null order by x.id loop
    v_room := v_room_map->(r.piece_id::text);
    v_app := coalesce(r.donnees->'application', '{"mode":"tous"}'::jsonb);
    v_q_base := null; v_calculable := true; v_raison := null;
    if v_room is null then
      v_calculable := false; v_raison := 'piece_sans_contour';
    elsif r.donnees->>'categorie' = 'sol' then v_q_base := (v_room->'retenu'->>'surface_sol')::numeric;
    elsif r.donnees->>'categorie' = 'plafond' then v_q_base := (v_room->'retenu'->>'surface_plafond')::numeric;
    elsif r.donnees->>'categorie' = 'plinthe' then
      v_q_base := case when r.donnees->>'revetement' = 'corniche' then (v_room->'retenu'->>'perimetre_brut')::numeric else (v_room->'retenu'->>'perimetre_utile')::numeric end;
    elsif v_app->>'mode' = 'tous' then
      v_q_base := (v_room->'retenu'->>'surface_murs')::numeric;
      if v_q_base is null then v_calculable := false; v_raison := 'hauteur_inconnue'; end if;
    elsif v_app->>'mode' = 'murs' then
      if v_room->'hauteurMm' = 'null'::jsonb then v_calculable := false; v_raison := 'hauteur_inconnue';
      else
        select coalesce(sum((f->>'surfaceNetteMm2')::numeric), 0) into v_q_base from jsonb_array_elements(v_room->'faces') f
        where f->>'murId' in (select m #>> '{}' from jsonb_array_elements(v_app->'murIds') m);
      end if;
    else
      -- Zone de mur : bande [bas, haut] × tronçon [début, fin] (le long de l'axe, depuis A), ouvertures déduites.
      v_zd := (v_app->>'debutMm')::numeric; v_zf := (v_app->>'finMm')::numeric; v_zb := (v_app->>'basMm')::numeric;
      v_zh := case when v_room->'hauteurMm' <> 'null'::jsonb then least((v_app->>'hautMm')::numeric, (v_room->>'hauteurMm')::numeric) else (v_app->>'hautMm')::numeric end;
      v_q_base := 0;
      for v_face in select value from jsonb_array_elements(v_room->'faces') where value->>'murId' = v_app->>'murId' loop
        v_ox := least(v_zf, (v_face->>'finMm')::numeric) - greatest(v_zd, (v_face->>'debutMm')::numeric);
        if v_ox <= 0 or v_zh <= v_zb then continue; end if;
        v_q_base := v_q_base + v_ox * (v_zh - v_zb);
        for v_o in select value from jsonb_array_elements(coalesce(v_ouv->(v_app->>'murId'), '[]'::jsonb)) loop
          if not (v_seuil is null or (v_o->>'l')::numeric * (v_o->>'h')::numeric >= v_seuil) then continue; end if;
          v_ox := least((v_o->>'d')::numeric + (v_o->>'l')::numeric, (v_face->>'finMm')::numeric, v_zf) - greatest((v_o->>'d')::numeric, (v_face->>'debutMm')::numeric, v_zd);
          v_allege := coalesce((v_o->>'allege')::numeric, 0);
          v_oy := least(v_allege + (v_o->>'h')::numeric, v_zh) - greatest(v_allege, v_zb);
          if v_ox > 0 and v_oy > 0 then v_q_base := v_q_base - v_ox * v_oy; end if;
        end loop;
      end loop;
      v_q_base := round(greatest(0, v_q_base));
    end if;
    -- Ajustement de la quantité du revêtement.
    v_aj := v_aj_rev->(r.id::text);
    v_perte := (r.donnees->>'pertePourcent')::numeric;
    v_rev_arr := array_append(v_rev_arr, jsonb_build_object(
      'id', r.id, 'pieceId', r.piece_id, 'categorie', r.donnees->>'categorie', 'revetement', r.donnees->>'revetement', 'libelle', r.donnees->>'libelle',
      'unite', r.donnees->>'unite', 'application', v_app, 'pertePourcent', v_perte, 'etatProjet', coalesce(r.donnees->>'etatProjet', 'existant'),
      'calculable', v_calculable or v_aj is not null, 'raison', case when v_aj is null then v_raison end,
      'quantiteCalculee', v_q_base,
      'ajustement', case when v_aj is not null then jsonb_build_object('id', v_aj->'id', 'valeurCalculee', v_aj->'valeur_calculee', 'valeurRetenue', v_aj->'valeur_retenue',
        'raison', v_aj->'raison', 'auteurId', v_aj->'created_by', 'date', v_aj->'created_at',
        'perime', (v_aj->>'valeur_calculee')::numeric is distinct from v_q_base) end,
      'quantite', coalesce((v_aj->>'valeur_retenue')::numeric, v_q_base),
      'quantiteAvecPerte', case when coalesce((v_aj->>'valeur_retenue')::numeric, v_q_base) is not null
        then round(coalesce((v_aj->>'valeur_retenue')::numeric, v_q_base) * (100 + v_perte) / 100) end));
    v_aj := null;
  end loop;
  v_rev := to_jsonb(v_rev_arr);

  -- Travaux (plan projeté) : existant / à déposer / nouveau / déplacé.
  select jsonb_build_object(
    'murs', coalesce((select jsonb_object_agg(etat, jsonb_build_object('nombre', n, 'longueurMm', round(l, 1), 'surfaceMm2', round(s), 'sansHauteur', sh))
      from (select coalesce(x.donnees->>'etatProjet', 'existant') as etat, count(*) as n,
                   sum(sqrt(((x.donnees->'b'->>'x')::numeric - (x.donnees->'a'->>'x')::numeric) ^ 2 + ((x.donnees->'b'->>'y')::numeric - (x.donnees->'a'->>'y')::numeric) ^ 2)) as l,
                   sum(case when jsonb_typeof(x.donnees->'hauteurMm') = 'number' then (x.donnees->>'hauteurMm')::numeric
                     * sqrt(((x.donnees->'b'->>'x')::numeric - (x.donnees->'a'->>'x')::numeric) ^ 2 + ((x.donnees->'b'->>'y')::numeric - (x.donnees->'a'->>'y')::numeric) ^ 2) else 0 end) as s,
                   count(*) filter (where jsonb_typeof(x.donnees->'hauteurMm') <> 'number') as sh
            from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'mur' and x.deleted_at is null group by 1) t), '{}'::jsonb),
    'ouvertures', coalesce((select jsonb_object_agg(etat, jsonb_build_object('nombre', n, 'surfaceMm2', s))
      from (select o->>'etatProjet' as etat, count(*) as n, sum((o->>'surfaceMm2')::numeric) as s from jsonb_array_elements(v_ouv_list) o group by 1) t), '{}'::jsonb),
    'equipements', coalesce((select jsonb_object_agg(etat, jsonb_build_object('nombre', n))
      from (select coalesce(x.donnees->>'etatProjet', 'existant') as etat, count(*) as n
            from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'equipement' and x.deleted_at is null group by 1) t), '{}'::jsonb)
  ) into v_travaux;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'objet', x.donnees->>'objet', 'categorie', x.donnees->>'categorie', 'libelle', x.donnees->>'libelle',
    'pieceId', x.piece_id, 'etatProjet', coalesce(x.donnees->>'etatProjet', 'existant')) order by x.id), '[]'::jsonb) into v_ids
  from public.tools_releves_elements x where x.plan_id = p_plan_id and x.type = 'equipement' and x.deleted_at is null;

  return jsonb_build_object(
    'version', 1, 'planId', v_plan.id, 'etageId', v_plan.etage_id, 'etat', v_plan.etat_documente, 'numero', v_plan.numero,
    'seuilDeductionMm2', v_seuil, 'hauteurEtageMm', v_etage_h,
    'pieces', v_rooms, 'revetements', v_rev, 'ouvertures', v_ouv_list, 'equipements', v_ids, 'travaux', v_travaux);
end;
$$;

-- Lecture d'un plan : métré figé (gel), sinon recalculé.
create or replace function public.tools_releve_plan_metre(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'view') then
    raise exception 'Plan introuvable ou non accessible' using errcode = '42501';
  end if;
  if v_plan.fige_le is not null and v_plan.metre is not null then
    return v_plan.metre || jsonb_build_object('fige', true, 'source', 'gel', 'figeLe', v_plan.fige_le);
  end if;
  return public.tools_releve_plan_metre_calcul(p_plan_id)
    || jsonb_build_object('fige', v_plan.fige_le is not null, 'source', case when v_plan.fige_le is not null then 'recalcul_plan_fige_avant_lot8' else 'calcul' end,
                          'figeLe', v_plan.fige_le, 'revision', v_plan.revision);
end;
$$;

-- Synthèse d'un relevé : pour chaque étage actif, le plan le plus récent de l'état demandé
-- (existant = initial ou corrigé ; projete ; as_built) et son métré.
create or replace function public.tools_releve_metre_synthese(p_releve_id uuid, p_etat text default 'existant')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.tools_releve_peut(p_releve_id, 'view') then raise exception 'Relevé introuvable ou non accessible' using errcode = '42501'; end if;
  if coalesce(p_etat, '') not in ('existant','projete','as_built') then raise exception 'État de synthèse inconnu : %', p_etat using errcode = '22023'; end if;
  for r in
    select distinct on (e.id) e.id as etage_id, p.id as plan_id, p.numero, p.etat_documente, p.fige_le, p.metre
    from public.tools_releves_etages e
    join public.tools_releves_plans p on p.etage_id = e.id and p.deleted_at is null
      and (case p_etat when 'existant' then p.etat_documente in ('initial','corrige') else p.etat_documente = p_etat end)
    where e.releve_id = p_releve_id and e.deleted_at is null
    order by e.id, p.numero desc
  loop
    v_out := v_out || jsonb_build_array(jsonb_build_object('etageId', r.etage_id, 'planId', r.plan_id, 'numero', r.numero, 'etat', r.etat_documente, 'figeLe', r.fige_le,
      'metre', case when r.fige_le is not null and r.metre is not null then r.metre || jsonb_build_object('fige', true, 'source', 'gel')
                    else public.tools_releve_plan_metre_calcul(r.plan_id) || jsonb_build_object('fige', r.fige_le is not null,
                      'source', case when r.fige_le is not null then 'recalcul_plan_fige_avant_lot8' else 'calcul' end) end));
  end loop;
  return v_out;
end;
$$;

-- ── 6. Ajustements : saisie et retrait (RPC, contrôle explicite) ──────────────
create or replace function public.tools_releve_metre_ajuster(
  p_plan_id uuid, p_piece_id uuid, p_revetement_id uuid, p_grandeur text, p_valeur_retenue numeric, p_raison text
)
returns public.tools_releves_metre_ajustements
language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_metre jsonb; v_calc numeric; v_room jsonb; v_rev jsonb; v_unite text;
        v_row public.tools_releves_metre_ajustements;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then raise exception 'Plan figé : son métré est figé' using errcode = '42501'; end if;
  if coalesce(p_grandeur, '') not in ('surface_sol','surface_plafond','perimetre_brut','perimetre_utile','surface_murs','volume','quantite') then
    raise exception 'Grandeur inconnue : %', p_grandeur using errcode = '22023';
  end if;
  if p_valeur_retenue is null or p_valeur_retenue < 0 then raise exception 'Valeur retenue positive attendue.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_raison, ''))) < 3 then raise exception 'La raison de l''ajustement est obligatoire.' using errcode = '22023'; end if;
  -- Valeur calculée : TOUJOURS celle du serveur au moment de l'ajustement (jamais celle du client).
  v_metre := public.tools_releve_plan_metre_calcul(p_plan_id);
  if p_grandeur = 'quantite' then
    select value into v_rev from jsonb_array_elements(v_metre->'revetements') where value->>'id' = p_revetement_id::text;
    if v_rev is null then raise exception 'Revêtement absent du plan' using errcode = '42501'; end if;
    v_calc := (v_rev->>'quantiteCalculee')::numeric;
    v_unite := case when v_rev->>'unite' = 'ml' then 'mm' else 'mm2' end;
    p_piece_id := (v_rev->>'pieceId')::uuid;
  else
    if p_revetement_id is not null then raise exception 'Un ajustement de pièce ne vise pas de revêtement' using errcode = '22023'; end if;
    select value into v_room from jsonb_array_elements(v_metre->'pieces') where value->>'pieceId' = p_piece_id::text;
    if v_room is null then raise exception 'Pièce sans contour sur ce plan' using errcode = '42501'; end if;
    v_calc := case p_grandeur
      when 'surface_sol' then (v_room->>'surfaceSolNetteMm2')::numeric when 'surface_plafond' then (v_room->>'surfacePlafondMm2')::numeric
      when 'perimetre_brut' then (v_room->>'perimetreBrutMm')::numeric when 'perimetre_utile' then (v_room->>'perimetreUtileMm')::numeric
      when 'surface_murs' then (v_room->>'surfaceMursNetteMm2')::numeric else (v_room->>'volumeMm3')::numeric end;
    v_unite := case when p_grandeur in ('perimetre_brut','perimetre_utile') then 'mm' when p_grandeur = 'volume' then 'mm3' else 'mm2' end;
  end if;
  -- Un seul ajustement actif par grandeur : le précédent est retiré (tracé), jamais écrasé.
  update public.tools_releves_metre_ajustements set retire_le = now(), retire_par = auth.uid(), raison_retrait = 'Remplacé par un nouvel ajustement'
  where plan_id = p_plan_id and retire_le is null and grandeur = p_grandeur
    and piece_id is not distinct from p_piece_id and revetement_id is not distinct from p_revetement_id;
  insert into public.tools_releves_metre_ajustements (entreprise_id, releve_id, plan_id, piece_id, revetement_id, grandeur, unite, valeur_calculee, valeur_retenue, raison, created_by)
  values (v_plan.entreprise_id, v_plan.releve_id, p_plan_id, p_piece_id, p_revetement_id, p_grandeur, v_unite, v_calc, p_valeur_retenue, btrim(p_raison), auth.uid())
  returning * into v_row;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'ajustement', array[p_grandeur], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'piece_id', p_piece_id, 'revetement_id', p_revetement_id, 'grandeur', p_grandeur,
                             'valeur_calculee', v_calc, 'valeur_retenue', p_valeur_retenue));
  return v_row;
end;
$$;

create or replace function public.tools_releve_metre_ajustement_retirer(p_id uuid, p_raison text default null)
returns public.tools_releves_metre_ajustements
language plpgsql security definer set search_path = public as $$
declare v_row public.tools_releves_metre_ajustements; v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_row from public.tools_releves_metre_ajustements a where a.id = p_id for update;
  if v_row.id is null or not public.tools_releve_peut(v_row.releve_id, 'edit') then
    raise exception 'Ajustement introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_row.retire_le is not null then raise exception 'Ajustement déjà retiré' using errcode = '22023'; end if;
  update public.tools_releves_metre_ajustements set retire_le = now(), retire_par = auth.uid(),
    raison_retrait = coalesce(nullif(btrim(p_raison), ''), 'Retour à la valeur calculée')
  where id = p_id returning * into v_row;
  select * into v_plan from public.tools_releves_plans where id = v_row.plan_id;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'ajustement', array[v_row.grandeur], auth.uid(),
          jsonb_build_object('ajustement_id', v_row.id, 'retrait', true));
  return v_row;
end;
$$;

-- Option métier « petites ouvertures » : seuil (mm²) sous lequel une ouverture n'est PAS déduite. NULL = tout
-- déduire. Aucun seuil par défaut : c'est l'utilisateur qui le fixe, plan par plan.
create or replace function public.tools_releve_plan_metre_regler(p_plan_id uuid, p_revision bigint, p_seuil_mm2 numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id for update;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then raise exception 'Plan figé : son métré est figé' using errcode = '42501'; end if;
  if v_plan.revision <> p_revision then
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été écrasé' using errcode = 'PT409', detail = v_plan.revision::text;
  end if;
  if p_seuil_mm2 is not null and (p_seuil_mm2 < 0 or p_seuil_mm2 > 100000000) then
    raise exception 'Seuil entre 0 et 100 m².' using errcode = '22023';
  end if;
  update public.tools_releves_plans set reglages = reglages || jsonb_build_object('metre', jsonb_build_object('seuilDeductionMm2', p_seuil_mm2))
  where id = p_plan_id returning * into v_plan;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', array['reglages'], auth.uid(), jsonb_build_object('seuil_deduction_mm2', p_seuil_mm2));
  return jsonb_build_object('revision', v_plan.revision, 'reglages', v_plan.reglages);
end;
$$;

-- ── 7. Revêtements : enregistrement et suppression (RPC) ──────────────────────
create or replace function public.tools_releve_plan_revetement_enregistrer(p_plan_id uuid, p_id uuid, p_piece_id uuid, p_donnees jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_code text; v_existant public.tools_releves_elements; v_app jsonb; v_mur text;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  v_code := public.tools_releve_plan_revetement_anomalie(p_donnees);
  if v_code is not null then raise exception '%', public.tools_releve_plan_revetement_message(v_code) using errcode = '22023', detail = v_code; end if;
  if p_piece_id is null or not exists (select 1 from public.tools_releves_pieces p where p.id = p_piece_id and p.etage_id = v_plan.etage_id and p.deleted_at is null) then
    raise exception '%', public.tools_releve_plan_revetement_message('piece') using errcode = '42501', detail = 'piece';
  end if;
  v_app := coalesce(p_donnees->'application', '{"mode":"tous"}'::jsonb);
  for v_mur in select m #>> '{}' from jsonb_array_elements(case v_app->>'mode' when 'murs' then v_app->'murIds'
                                                               when 'zone' then jsonb_build_array(v_app->'murId') else '[]'::jsonb end) m loop
    if not exists (select 1 from public.tools_releves_elements m where m.id::text = v_mur and m.plan_id = p_plan_id and m.type = 'mur' and m.deleted_at is null) then
      raise exception '%', public.tools_releve_plan_revetement_message('mur_absent') using errcode = '22023', detail = 'mur_absent';
    end if;
  end loop;
  select * into v_existant from public.tools_releves_elements x where x.id = p_id;
  if v_existant.id is null then
    insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, plan_id, donnees)
    values (p_id, v_plan.releve_id, 'materiau', v_plan.etage_id, p_piece_id, v_plan.id, p_donnees);
  else
    if v_existant.plan_id is distinct from v_plan.id or v_existant.type <> 'materiau' then
      raise exception 'Élément étranger au plan : %', p_id using errcode = '42501';
    end if;
    update public.tools_releves_elements set donnees = p_donnees, piece_id = p_piece_id, deleted_at = null where id = p_id;
  end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, case when v_existant.id is null then 'creation' else 'modification' end,
          array['revetements'], auth.uid(), jsonb_build_object('revetement_id', p_id, 'piece_id', p_piece_id));
  return (select jsonb_build_object('id', x.id, 'pieceId', x.piece_id, 'donnees', x.donnees, 'revision', x.revision) from public.tools_releves_elements x where x.id = p_id);
end;
$$;

create or replace function public.tools_releve_plan_revetement_supprimer(p_plan_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan public.tools_releves_plans; v_n int;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_plan from public.tools_releves_plans p where p.id = p_plan_id;
  if v_plan.id is null or not public.tools_releve_peut(v_plan.releve_id, 'edit') then
    raise exception 'Plan introuvable ou non modifiable' using errcode = '42501';
  end if;
  if v_plan.deleted_at is not null or v_plan.fige_le is not null then
    raise exception 'Plan figé : créez un plan corrigé, projeté ou tel que construit' using errcode = '42501';
  end if;
  update public.tools_releves_elements set deleted_at = now()
  where id = p_id and plan_id = p_plan_id and type = 'materiau' and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Revêtement introuvable sur ce plan' using errcode = '42501'; end if;
  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'suppression', array['revetements'], auth.uid(), jsonb_build_object('revetement_id', p_id));
end;
$$;

-- ── 8. Contenu canonique (empreinte du gel) : + cotes et revêtements ─────────
-- Clés ajoutées SEULEMENT si le plan en porte : les empreintes antérieures restent recalculables.
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
    || coalesce((select jsonb_build_object('equipements', jsonb_agg(jsonb_build_object('id', x.id, 'piece_id', x.piece_id, 'donnees', x.donnees) order by x.id))
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'equipement' and x.deleted_at is null having count(*) > 0), '{}'::jsonb)
    -- Lot 8
    || coalesce((select jsonb_build_object('cotes', jsonb_agg(jsonb_build_object('id', x.id, 'piece_id', x.piece_id, 'donnees', x.donnees) order by x.id))
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'mesure' and x.deleted_at is null having count(*) > 0), '{}'::jsonb)
    || coalesce((select jsonb_build_object('revetements', jsonb_agg(jsonb_build_object('id', x.id, 'piece_id', x.piece_id, 'donnees', x.donnees) order by x.id))
      from public.tools_releves_elements x where x.plan_id = p.id and x.type = 'materiau' and x.deleted_at is null having count(*) > 0), '{}'::jsonb)
  from public.tools_releves_plans p where p.id = p_plan_id;
$$;

-- ── 9. Gel : Lot 5 + métré figé ───────────────────────────────────────────────
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
    raise exception 'Plan modifié ailleurs entre-temps : rien n''a été figé' using errcode = 'PT409', detail = v_plan.revision::text;
  end if;

  update public.tools_releves_plans set
    fige_le = now(), fige_par = auth.uid(),
    empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(p_plan_id)::text, 'UTF8'), 'sha256'), 'hex'),
    -- Lot 8 : métré figé (hauteurs, ajustements et réglages du moment compris).
    metre = public.tools_releve_plan_metre_calcul(p_plan_id) || jsonb_build_object('calculeLe', now()),
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

-- ── 10. Création : Lot 7 + copie des cotes et revêtements ─────────────────────
create or replace function public.tools_releve_plan_creer(
  p_etage_id uuid, p_etat text default 'initial', p_plan_base_id uuid default null, p_libelle text default null
)
returns public.tools_releves_plans
language plpgsql security definer set search_path = public as $$
declare
  v_etage public.tools_releves_etages; v_base public.tools_releves_plans; v_plan public.tools_releves_plans;
  v_numero integer; v_map jsonb := '{}'::jsonb; v_id uuid; r record; v_adoptes integer := 0; v_app jsonb;
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
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'equipement' and x.deleted_at is null order by x.id loop
      insert into public.tools_releves_elements (releve_id, type, etage_id, piece_id, plan_id, schema_version, donnees)
      values (r.releve_id, 'equipement', r.etage_id, r.piece_id, v_plan.id, r.schema_version,
              r.donnees || jsonb_build_object('origineId', r.id::text)
              || case when jsonb_typeof(r.donnees->'murId') = 'string'
                      then jsonb_build_object('murId', v_map->(r.donnees->>'murId'))
                      else '{}'::jsonb end);
    end loop;
    -- Lot 8 : cotes copiées (lignée) ; revêtements copiés, murs visés reportés sur leurs copies.
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'mesure' and x.deleted_at is null order by x.id loop
      insert into public.tools_releves_elements (releve_id, type, etage_id, piece_id, plan_id, schema_version, donnees)
      values (r.releve_id, 'mesure', r.etage_id, r.piece_id, v_plan.id, r.schema_version, r.donnees || jsonb_build_object('origineId', r.id::text));
    end loop;
    for r in select * from public.tools_releves_elements x where x.plan_id = v_base.id and x.type = 'materiau' and x.deleted_at is null order by x.id loop
      v_app := r.donnees->'application';
      if v_app->>'mode' = 'murs' then
        v_app := v_app || jsonb_build_object('murIds', coalesce((select jsonb_agg(coalesce(v_map->(m #>> '{}'), m)) from jsonb_array_elements(v_app->'murIds') m), '[]'::jsonb));
      elsif v_app->>'mode' = 'zone' and v_map ? (v_app->>'murId') then
        v_app := v_app || jsonb_build_object('murId', v_map->(v_app->>'murId'));
      end if;
      insert into public.tools_releves_elements (releve_id, type, etage_id, piece_id, plan_id, schema_version, donnees)
      values (r.releve_id, 'materiau', r.etage_id, r.piece_id, v_plan.id, r.schema_version,
              r.donnees || jsonb_build_object('origineId', r.id::text) || case when v_app is not null then jsonb_build_object('application', v_app) else '{}'::jsonb end);
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

-- ── 11. Enregistrement par lot : Lot 7 à l'identique + cotes ──────────────────
-- p_modifications.cotes = [{ id, pieceId?, donnees: { cible, typeMesure, valeur, unite:'mm', source, precisionMm, priseLe,
--   typeCote, a, b?, decalageMm?, libelle?, etatProjet?, origineId? } }]   (création, mise à jour ou restauration)
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
  -- Lot 8
  v_cotes integer := 0;
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
     or jsonb_array_length(coalesce(v_mods->'cotes', '[]'::jsonb)) > 5000
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

  -- Lot 8 : cotes manuelles et hauteurs ponctuelles (éléments `mesure` du plan).
  for v_item in select value from jsonb_array_elements(coalesce(v_mods->'cotes', '[]'::jsonb)) loop
    v_id := (v_item->>'id')::uuid;
    v_piece := nullif(v_item->>'pieceId', '')::uuid;
    v_code := public.tools_releve_plan_cote_anomalie(v_item->'donnees');
    if v_code is not null then
      raise exception '%', public.tools_releve_plan_cote_message(v_code) using errcode = '22023', detail = v_code || ':' || v_id::text;
    end if;
    if v_piece is not null and not exists (select 1 from public.tools_releves_pieces p
                                           where p.id = v_piece and p.etage_id = v_plan.etage_id and p.deleted_at is null) then
      raise exception '%', public.tools_releve_plan_cote_message('piece') using errcode = '42501', detail = 'piece:' || v_id::text;
    end if;
    select * into v_existant from public.tools_releves_elements x where x.id = v_id;
    if v_existant.id is null then
      insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, plan_id, donnees)
      values (v_id, v_plan.releve_id, 'mesure', v_plan.etage_id, v_piece, v_plan.id, v_item->'donnees');
      v_cotes := v_cotes + 1;
    else
      if v_existant.plan_id is distinct from v_plan.id or v_existant.type <> 'mesure' then
        raise exception 'Élément étranger au plan : %', v_id using errcode = '42501';
      end if;
      if v_existant.donnees is distinct from v_item->'donnees' or v_existant.piece_id is distinct from v_piece or v_existant.deleted_at is not null then
        update public.tools_releves_elements set donnees = v_item->'donnees', piece_id = v_piece, deleted_at = null where id = v_id;
        v_cotes := v_cotes + 1;
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
  if v_cotes > 0 then v_champs := v_champs || 'cotes'::text; end if;
  if v_supprimes > 0 then v_champs := v_champs || 'supprimes'::text; end if;

  update public.tools_releves_plans set
    contours = v_contours,
    cadre = case when v_mods ? 'cadre' then v_mods->'cadre' else cadre end,
    reglages = case when v_mods ? 'reglages' then v_mods->'reglages' else reglages end
  where id = v_plan.id
  returning * into v_plan;

  insert into public.tools_releves_journal (entreprise_id, releve_id, entite, entite_id, action, champs, auteur_id, details)
  values (v_plan.entreprise_id, v_plan.releve_id, 'plan', v_plan.id, 'modification', v_champs, auth.uid(),
          jsonb_build_object('murs', v_murs, 'ouvertures', v_ouvertures, 'equipements', v_equipements, 'cotes', v_cotes, 'supprimes', v_supprimes));

  return jsonb_build_object('revision', v_plan.revision, 'murs', v_murs, 'ouvertures', v_ouvertures, 'equipements', v_equipements, 'cotes', v_cotes,
                            'supprimes', v_supprimes, 'contours', v_plan.contours);
end;
$$;

-- ── 12. Droits ───────────────────────────────────────────────────────────────
revoke all on function public.tools_releve_etat_projet_valide(jsonb) from public, anon;
revoke all on function public.tools_releve_plan_cote_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_plan_cote_message(text) from public, anon;
revoke all on function public.tools_releve_plan_revetement_anomalie(jsonb) from public, anon;
revoke all on function public.tools_releve_plan_revetement_message(text) from public, anon;
grant execute on function public.tools_releve_etat_projet_valide(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_plan_cote_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_plan_cote_message(text) to authenticated, service_role;
grant execute on function public.tools_releve_plan_revetement_anomalie(jsonb) to authenticated, service_role;
grant execute on function public.tools_releve_plan_revetement_message(text) to authenticated, service_role;
revoke all on function public.tools_releve_element_lot8_garde() from public, anon, authenticated;
revoke all on function public.tools_releve_metre_ajustement_garde() from public, anon, authenticated;
-- Calcul brut : interne (aucun contrôle de droit) — lecture par les RPC ci-dessous seulement.
revoke all on function public.tools_releve_plan_metre_calcul(uuid) from public, anon, authenticated;
grant execute on function public.tools_releve_plan_metre_calcul(uuid) to service_role;
revoke all on function public.tools_releve_plan_metre(uuid) from public, anon;
revoke all on function public.tools_releve_metre_synthese(uuid, text) from public, anon;
revoke all on function public.tools_releve_metre_ajuster(uuid, uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.tools_releve_metre_ajustement_retirer(uuid, text) from public, anon;
revoke all on function public.tools_releve_plan_metre_regler(uuid, bigint, numeric) from public, anon;
revoke all on function public.tools_releve_plan_revetement_enregistrer(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.tools_releve_plan_revetement_supprimer(uuid, uuid) from public, anon;
grant execute on function public.tools_releve_plan_metre(uuid) to authenticated;
grant execute on function public.tools_releve_metre_synthese(uuid, text) to authenticated;
grant execute on function public.tools_releve_metre_ajuster(uuid, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.tools_releve_metre_ajustement_retirer(uuid, text) to authenticated;
grant execute on function public.tools_releve_plan_metre_regler(uuid, bigint, numeric) to authenticated;
grant execute on function public.tools_releve_plan_revetement_enregistrer(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.tools_releve_plan_revetement_supprimer(uuid, uuid) to authenticated;
-- Mêmes droits qu'aux Lots 5 → 7 (create or replace les conserve ; réaffirmés pour la lisibilité).
revoke all on function public.tools_releve_plan_contenu(uuid) from public, anon, authenticated;
revoke all on function public.tools_releve_plan_creer(uuid, text, uuid, text) from public, anon;
revoke all on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) from public, anon;
revoke all on function public.tools_releve_plan_figer(uuid, bigint, text) from public, anon;
grant execute on function public.tools_releve_plan_creer(uuid, text, uuid, text) to authenticated;
grant execute on function public.tools_releve_plan_enregistrer(uuid, bigint, jsonb) to authenticated;
grant execute on function public.tools_releve_plan_figer(uuid, bigint, text) to authenticated;

notify pgrst, 'reload schema';
