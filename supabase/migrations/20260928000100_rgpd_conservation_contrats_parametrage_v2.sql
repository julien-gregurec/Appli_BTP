-- RGPD × contrats acceptés — paramétrage de la conservation (V2).
-- Rapport : docs/qualification/ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2.md
-- Décision attendue : docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md
-- Mécanisme : 20260926000502 (instantanés, verrous), 20260926000504 (politique C retenue,
-- durée non validée, fail-closed), 20260926000506 (purge d'une table, version courante).
--
-- Cette migration NE CHOISIT AUCUNE durée, AUCUN point de départ, AUCUN sort des photos.
-- Elle rend ces trois paramètres configurables par UNE instruction, sans autre migration
-- métier, et garde la purge fermée tant qu'ils ne sont pas tous validés.
--
--   R1  Paramètres de `platform.purge_politique_contrats` :
--         duree_conservation     (existant) intervalle > 0, sans composante horaire ni négative ;
--         regles_depart          (nouveau)  point(s) de départ, parmi une liste fermée de règles
--                                           techniquement calculables (R3) ; plusieurs règles =
--                                           la date la plus TARDIVE ;
--         regle_depart_repli     (nouveau)  règle utilisée si la date n'est pas déterminable ;
--                                           NULL = refus (fail-closed) ;
--         inclure_photos         (existant) + choix_photos_explicite (nouveau) : le choix sur les
--                                           photos doit avoir été EXPRIMÉ, le défaut `false`
--                                           ne vaut pas décision.
--       Journal en ajout seul étendu aux nouveaux paramètres.
--   R2  État effectif : `conserver_contrat_minimise` (actif) seulement si durée, point de départ
--       et choix des photos sont tous renseignés. Sinon `duree_requise` (durée absente, état
--       livré) ou `parametres_requis` (durée présente, autre paramètre absent). Les deux
--       refusent, avant toute écriture, avec une cause nommée et la liste des paramètres
--       manquants dans l'audit.
--   R3  Point de départ calculé par règle, figé dans l'instantané (date + règle(s) appliquée(s)),
--       jamais recalculé ensuite. Dates civiles en Europe/Paris, quel que soit le fuseau de la
--       session. Date indéterminable sans repli → refus DECISION_REQUIRED:RGPD-DEPART-
--       CONSERVATION-INDETERMINE (fail-closed).
--   R4  Échéance : dernier jour conservé = départ + durée (jour civil, inclus) ; suppression
--       possible à partir du lendemain 00:00 Europe/Paris (`conserver_jusqu_au`). Convention
--       technique conservatrice (jamais plus tôt), documentée dans le rapport.
--   R5  Instantanés figés dès la PREMIÈRE étape de la purge quand la politique est active (et
--       plus seulement à la première table porteuse de contrat) : les données qui servent au
--       point de départ (fin de chantier, réception Réserves…) n'ont pas encore été supprimées.
--   R6  Immutabilité renforcée : UPDATE et TRUNCATE refusés (inchangé) ; DELETE seulement
--       (a) après `conserver_jusqu_au`, (b) dans la transaction de `purger_contrats_conserves_echus`
--       (autorisation liée au txid et à la ligne), (c) si l'échéance recalculée avec les
--       paramètres COURANTS est aussi atteinte (un allongement ultérieur protège les instantanés
--       déjà figés ; un raccourcissement n'avance jamais une suppression), (d) politique active.
--   R7  `purger_contrats_conserves_echus` : refus nommé tant que la politique n'est pas active ;
--       verrou consultatif (une seule exécution à la fois) ; ordre déterministe ; tout ou rien
--       (une erreur annule le lot entier) ; audit détaillé par instantané ; rejouable.
--   R8  Lecture seule pour l'exploitation : `rapport_echeances_contrats_conserves` (service_role)
--       et `platform.simuler_conservation_contrat` (propriétaire seulement) qui calcule départ
--       et échéance d'un contrat pour des paramètres candidats SANS rien activer.
--
-- Activation, le jour où la décision est prise (une instruction, dans une migration d'une ligne
-- qui cite la décision ; jamais dans ce fichier) :
--   select platform.definir_politique_purge_contrats(
--     'conserver_contrat_minimise', '<référence de la décision>',
--     interval '<A. durée>', <C. photos : true|false>, array['<B. règle>'], <B. repli ou null>);
--
-- L'ancien appel à 4 arguments (504) reste accepté mais n'active RIEN : sans point de départ
-- ni choix explicite des photos, l'état reste non actif (fail-closed).

-- ═══════════════════════════════════════════════════════════════════════
-- R1. Paramètres
-- ═══════════════════════════════════════════════════════════════════════
-- Règles de départ techniquement calculables (liste FERMÉE ; ajouter une règle = une migration).
create or replace function platform.regles_depart_conservation_contrat()
returns text[] language sql immutable as $$
  select array['date_contrat', 'acceptation', 'fin_chantier', 'reception_travaux',
               'derniere_facture', 'dernier_paiement', 'demande_suppression']
$$;
revoke all on function platform.regles_depart_conservation_contrat() from public, anon, authenticated, service_role;

create or replace function platform._regles_depart_valides(p_regles text[])
returns boolean language sql immutable as $$
  select p_regles is null or (
    cardinality(p_regles) >= 1
    and array_position(p_regles, null) is null
    and p_regles <@ platform.regles_depart_conservation_contrat()
    and cardinality(p_regles) = (select count(distinct r) from unnest(p_regles) r))
$$;
revoke all on function platform._regles_depart_valides(text[]) from public, anon, authenticated, service_role;

-- Durée : strictement positive, aucune composante négative, aucune composante horaire
-- (l'échéance est un jour civil).
create or replace function platform._duree_conservation_valide(p_duree interval)
returns boolean language sql immutable as $$
  select p_duree is null or (
    p_duree > interval '0'
    and extract(year from p_duree) >= 0 and extract(month from p_duree) >= 0 and extract(day from p_duree) >= 0
    and date_trunc('day', p_duree) = p_duree)
$$;
revoke all on function platform._duree_conservation_valide(interval) from public, anon, authenticated, service_role;

alter table platform.purge_politique_contrats
  add column if not exists regles_depart text[],
  add column if not exists regle_depart_repli text,
  add column if not exists choix_photos_explicite boolean not null default false;

alter table platform.purge_politique_contrats drop constraint if exists purge_politique_contrats_duree_valide;
alter table platform.purge_politique_contrats
  add constraint purge_politique_contrats_duree_valide check (platform._duree_conservation_valide(duree_conservation));
alter table platform.purge_politique_contrats drop constraint if exists purge_politique_contrats_regles_depart_valides;
alter table platform.purge_politique_contrats
  add constraint purge_politique_contrats_regles_depart_valides check (
    platform._regles_depart_valides(regles_depart)
    and (regle_depart_repli is null or regle_depart_repli = any(platform.regles_depart_conservation_contrat())));
-- Hors conservation (non décidée, preuve minimale) : aucun paramètre de conservation.
alter table platform.purge_politique_contrats drop constraint if exists purge_politique_contrats_parametres_hors_c;
alter table platform.purge_politique_contrats
  add constraint purge_politique_contrats_parametres_hors_c check (
    politique = 'conserver_contrat_minimise'
    or (regles_depart is null and regle_depart_repli is null and not choix_photos_explicite));

comment on column platform.purge_politique_contrats.regles_depart is
  'Point(s) de départ de la conservation des instantanés C (liste fermée : '
  'platform.regles_depart_conservation_contrat()). Plusieurs règles = la date la plus tardive. '
  'NULL = non validé : politique non active (fail-closed, DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT).';
comment on column platform.purge_politique_contrats.regle_depart_repli is
  'Règle utilisée quand la date des regles_depart n''est pas déterminable pour un contrat. '
  'NULL = refus (DECISION_REQUIRED:RGPD-DEPART-CONSERVATION-INDETERMINE).';
comment on column platform.purge_politique_contrats.choix_photos_explicite is
  'Vrai seulement si inclure_photos a été fixé explicitement par la décision. Faux = choix des '
  'photos non exprimé : politique non active (le défaut false ne vaut pas décision).';

alter table platform.purge_politique_contrats_journal
  add column if not exists regles_depart text[],
  add column if not exists regle_depart_repli text,
  add column if not exists choix_photos_explicite boolean;

create or replace function platform.journaliser_politique_contrats()
returns trigger language plpgsql security definer set search_path = platform as $$
begin
  if tg_table_name = 'purge_politique_contrats_journal' then
    raise exception 'Le journal des politiques de purge des contrats est en ajout seul';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'La politique de purge des contrats ne se supprime pas (revenir à non_decidee)';
  end if;
  insert into platform.purge_politique_contrats_journal
    (politique, decision_ref, duree_conservation, inclure_photos, definie_le, definie_par,
     regles_depart, regle_depart_repli, choix_photos_explicite)
  values (new.politique, new.decision_ref, new.duree_conservation, new.inclure_photos, new.definie_le, new.definie_par,
          new.regles_depart, new.regle_depart_repli, new.choix_photos_explicite);
  return new;
end; $$;
revoke all on function platform.journaliser_politique_contrats() from public, anon, authenticated, service_role;

-- Seul point d'entrée (inchangé : aucun GRANT, propriétaire de la base seulement). Nouvelle
-- signature ; l'appel à 4 arguments de 504 reste valide mais ne renseigne ni point de départ ni
-- choix explicite des photos, donc n'active rien.
drop function if exists platform.definir_politique_purge_contrats(text, text, interval, boolean);
create or replace function platform.definir_politique_purge_contrats(
  p_politique text, p_decision_ref text, p_duree interval default null, p_inclure_photos boolean default null,
  p_regles_depart text[] default null, p_regle_depart_repli text default null)
returns void language plpgsql security invoker set search_path = platform as $$
begin
  if exists (select 1 from platform.purge_autorisations_facture) then
    raise exception 'Une purge est en cours : politique des contrats non modifiable maintenant';
  end if;
  if exists (select 1 from platform.purge_autorisations_echeance) then
    raise exception 'Une suppression d''instantanés échus est en cours : politique des contrats non modifiable maintenant';
  end if;
  update platform.purge_politique_contrats
     set politique = p_politique,
         decision_ref = nullif(btrim(p_decision_ref), ''),
         duree_conservation = p_duree,
         inclure_photos = coalesce(p_inclure_photos, false),
         choix_photos_explicite = (p_inclure_photos is not null and p_politique = 'conserver_contrat_minimise'),
         regles_depart = p_regles_depart,
         regle_depart_repli = p_regle_depart_repli,
         definie_le = now(),
         definie_par = current_user
   where singleton;
end; $$;
revoke all on function platform.definir_politique_purge_contrats(text, text, interval, boolean, text[], text)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R2. État effectif et paramètres manquants
-- ═══════════════════════════════════════════════════════════════════════
create or replace function platform.parametres_conservation_manquants()
returns text[]
language sql stable security definer set search_path = platform as $$
  select coalesce((
    select array_remove(array[
             case when p.duree_conservation is null or not platform._duree_conservation_valide(p.duree_conservation)
                    or p.duree_conservation <= interval '0' then 'duree' end,
             case when p.regles_depart is null then 'point_depart' end,
             case when not p.choix_photos_explicite then 'pieces_photos' end], null)
      from platform.purge_politique_contrats p
     where p.singleton and p.politique = 'conserver_contrat_minimise'), '{}'::text[])
$$;
revoke all on function platform.parametres_conservation_manquants() from public, anon, authenticated, service_role;

create or replace function platform.etat_politique_contrats()
returns text
language sql stable security definer set search_path = platform as $$
  select coalesce((
    select case
             when p.politique = 'supprimer_apres_preuve' then 'supprimer_apres_preuve'
             when p.politique = 'conserver_contrat_minimise'
                  and cardinality(platform.parametres_conservation_manquants()) = 0
               then 'conserver_contrat_minimise'
             when p.politique = 'conserver_contrat_minimise' and 'duree' = any(platform.parametres_conservation_manquants())
               then 'duree_requise'
             when p.politique = 'conserver_contrat_minimise' then 'parametres_requis'
             else 'non_decidee'
           end
      from platform.purge_politique_contrats p where p.singleton), 'non_decidee')
$$;
revoke all on function platform.etat_politique_contrats() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R3. Point de départ
-- ═══════════════════════════════════════════════════════════════════════
-- Date civile (Europe/Paris) d'une règle pour un contrat ; NULL = indéterminable.
-- Aucune règle ne lit l'horloge : le résultat ne dépend que des données, donc un rejeu après
-- restauration donne la même date.
create or replace function public._date_regle_depart_contrat(p_type text, p_id uuid, p_regle text)
returns date
language plpgsql stable security definer set search_path = public as $$
declare
  v_devis uuid;          -- devis porteur (devis lui-même, ou devis d'origine de l'avenant)
  v_entreprise uuid;
  v_chantiers uuid[];
  v_date date;
begin
  if p_type = 'devis' then
    select d.id, d.entreprise_id into v_devis, v_entreprise from public.devis d where d.id = p_id;
  elsif p_type = 'avenant' then
    select a.devis_origine_id, a.entreprise_id into v_devis, v_entreprise from public.avenants a where a.id = p_id;
  else
    raise exception 'Type de contrat inconnu : %', p_type;
  end if;
  if v_entreprise is null then
    return null;
  end if;

  if p_regle = 'date_contrat' then
    -- Comportement V1 : émission du devis ; acceptation de l'avenant (à défaut, sa création).
    if p_type = 'devis' then
      select d.date_emission into v_date from public.devis d where d.id = p_id;
    else
      select coalesce((a.date_acceptation at time zone 'Europe/Paris')::date, a.date_creation)
        into v_date from public.avenants a where a.id = p_id;
    end if;
    return v_date;

  elsif p_regle = 'acceptation' then
    -- Avenant : date enregistrée par le verrou. Devis : aucune colonne ; seule trace, l'entrée
    -- `devis_accepte` du journal d'activité (RETAIN), écrite par l'application (best effort).
    if p_type = 'avenant' then
      select (a.date_acceptation at time zone 'Europe/Paris')::date into v_date from public.avenants a where a.id = p_id;
    else
      select (min(j.created_at) at time zone 'Europe/Paris')::date into v_date
        from public.journal_activite j
       where j.entreprise_id = v_entreprise and j.ressource = 'devis' and j.ressource_id = p_id
         and j.action = 'devis_accepte';
    end if;
    return v_date;

  elsif p_regle = 'demande_suppression' then
    select (e.suppression_demandee_at at time zone 'Europe/Paris')::date into v_date
      from public.entreprises e where e.id = v_entreprise;
    return v_date;
  end if;

  -- Règles qui dépendent du chantier : chantier(s) rattaché(s) au contrat.
  select coalesce(array_agg(distinct c.id), '{}') into v_chantiers
    from public.chantiers c
   where c.entreprise_id = v_entreprise
     and (c.devis_source_id = v_devis
          or c.id = (select d.chantier_id from public.devis d where d.id = v_devis)
          or (p_type = 'avenant' and c.id = (select a.chantier_id from public.avenants a where a.id = p_id)));

  if p_regle = 'fin_chantier' then
    -- Tous les chantiers rattachés doivent avoir une fin réelle ; sinon indéterminable.
    if cardinality(v_chantiers) = 0
       or exists (select 1 from public.chantiers c where c.id = any(v_chantiers) and c.date_fin_reelle is null) then
      return null;
    end if;
    select max(c.date_fin_reelle) into v_date from public.chantiers c where c.id = any(v_chantiers);
    return v_date;

  elsif p_regle = 'reception_travaux' then
    -- Réception saisie dans Réserves (reserves_chantiers.date_reception) pour CHAQUE chantier
    -- rattaché ; Gestion Pro seul ne suit pas la réception.
    if cardinality(v_chantiers) = 0
       or exists (select 1 from unnest(v_chantiers) ch(id)
                   where not exists (select 1 from public.reserves_chantiers r
                                      where r.chantier_gp_id = ch.id and r.date_reception is not null)) then
      return null;
    end if;
    select max(r.date_reception) into v_date
      from public.reserves_chantiers r where r.chantier_gp_id = any(v_chantiers) and r.date_reception is not null;
    return v_date;

  elsif p_regle = 'derniere_facture' then
    -- Dernière facture émise (hors brouillon ; acomptes, situations, finales et avoirs compris)
    -- rattachée au devis porteur. Les factures sont conservées (RETAIN).
    select max(f.date_emission) into v_date
      from public.factures f
     where f.entreprise_id = v_entreprise and f.devis_origine_id = v_devis
       and f.statut <> 'brouillon' and f.date_emission is not null;
    return v_date;

  elsif p_regle = 'dernier_paiement' then
    select max(pa.date) into v_date
      from public.paiements pa join public.factures f on f.id = pa.facture_id
     where f.entreprise_id = v_entreprise and f.devis_origine_id = v_devis and f.statut <> 'brouillon';
    return v_date;
  end if;

  raise exception 'Règle de départ inconnue : %', p_regle;
end; $$;
revoke all on function public._date_regle_depart_contrat(text, uuid, text) from public, anon, authenticated, service_role;

-- Départ d'un contrat pour des règles données : la plus tardive des règles, sinon le repli,
-- sinon NULL (indéterminable).
create or replace function public._depart_conservation_contrat(
  p_type text, p_id uuid, p_regles text[], p_repli text,
  out date_depart date, out regles_appliquees text[], out dates_regles jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_regle text;
  v_date date;
  v_manque boolean := false;
begin
  dates_regles := '{}'::jsonb;
  if p_regles is null or cardinality(p_regles) = 0 then
    return;
  end if;
  foreach v_regle in array p_regles loop
    v_date := public._date_regle_depart_contrat(p_type, p_id, v_regle);
    dates_regles := dates_regles || jsonb_build_object(v_regle, v_date);
    if v_date is null then
      v_manque := true;
    elsif date_depart is null or v_date > date_depart then
      date_depart := v_date;
    end if;
  end loop;
  if not v_manque then
    regles_appliquees := p_regles;
    return;
  end if;
  date_depart := null;
  if p_repli is not null then
    v_date := public._date_regle_depart_contrat(p_type, p_id, p_repli);
    dates_regles := dates_regles || jsonb_build_object('repli:' || p_repli, v_date);
    if v_date is not null then
      date_depart := v_date;
      regles_appliquees := array['repli:' || p_repli];
    end if;
  end if;
end; $$;
revoke all on function public._depart_conservation_contrat(text, uuid, text[], text) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R4. Échéance (convention technique, fuseau Europe/Paris)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function platform.dernier_jour_conservation_contrat(p_depart date, p_duree interval)
returns date language sql immutable as $$
  select (p_depart + p_duree)::date
$$;
-- Premier instant où la suppression est permise : lendemain du dernier jour conservé, 00:00
-- Europe/Paris (immuable : ne dépend pas du fuseau de la session).
create or replace function platform.echeance_conservation_contrat(p_depart date, p_duree interval)
returns timestamptz language sql immutable as $$
  select ((p_depart + p_duree)::date + 1)::timestamp at time zone 'Europe/Paris'
$$;
revoke all on function platform.dernier_jour_conservation_contrat(date, interval) from public, anon, authenticated;
revoke all on function platform.echeance_conservation_contrat(date, interval) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Instantanés : paramètres figés
-- ═══════════════════════════════════════════════════════════════════════
alter table platform.contrats_acceptes_purges
  add column if not exists date_depart_conservation date,
  add column if not exists regles_depart_appliquees text[],
  add column if not exists duree_conservation interval,
  add column if not exists dernier_jour_conserve date,
  add column if not exists inclure_photos boolean;

-- Un instantané C porte ses paramètres, et son échéance en découle exactement. NOT VALID :
-- aucune ligne C ne peut exister avant cette migration hors d'une base de test (politique
-- jamais active), et une base qui en porterait ne doit pas voir sa montée de version échouer.
alter table platform.contrats_acceptes_purges drop constraint if exists contrats_acceptes_purges_parametres_v2;
alter table platform.contrats_acceptes_purges
  add constraint contrats_acceptes_purges_parametres_v2 check (
    niveau <> 'contrat_minimise' or (
      date_depart_conservation is not null and regles_depart_appliquees is not null
      and duree_conservation is not null and inclure_photos is not null
      and dernier_jour_conserve = platform.dernier_jour_conservation_contrat(date_depart_conservation, duree_conservation)
      and conserver_jusqu_au = platform.echeance_conservation_contrat(date_depart_conservation, duree_conservation)))
  not valid;

-- ═══════════════════════════════════════════════════════════════════════
-- R3/R5. Préservation : point de départ par règle, figé
-- ═══════════════════════════════════════════════════════════════════════
-- Corps de 20260926000504 ; seuls changent le calcul du départ, l'échéance et les colonnes figées.
create or replace function public._preserver_contrats_acceptes(p_entreprise_id uuid, p_run_id uuid)
returns integer
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_pol platform.purge_politique_contrats;
  v_etat text;
  v_niveau text;
  v_c record;
  v_doc jsonb;
  v_contenu jsonb;
  v_empreinte text;
  v_dep record;
  v_n integer := 0;
  v_empreintes jsonb := '[]'::jsonb;
begin
  select * into v_pol from platform.purge_politique_contrats where singleton;
  if v_pol.politique is null or v_pol.politique = 'non_decidee' then
    raise exception 'DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — politique de purge des contrats acceptés non décidée';
  end if;
  v_etat := platform.etat_politique_contrats();
  -- Fail-closed : jamais d'instantané C sans paramètres validés.
  if v_etat = 'duree_requise' then
    raise exception 'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — politique conserver_contrat_minimise retenue, durée de conservation non validée';
  end if;
  if v_etat = 'parametres_requis' then
    raise exception 'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT — politique conserver_contrat_minimise retenue, paramètres non validés : %',
      array_to_string(platform.parametres_conservation_manquants(), ', ');
  end if;
  v_niveau := case v_pol.politique when 'supprimer_apres_preuve' then 'preuve_minimale' else 'contrat_minimise' end;

  for v_c in
    select 'devis'::text as type_contrat, d.id, d.numero as reference
      from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte'
    union all
    select 'avenant', a.id,
           coalesce((select d.numero from public.devis d where d.id = a.devis_origine_id), '?') || ' / avenant ' || a.ordre
      from public.avenants a where a.entreprise_id = p_entreprise_id and a.statut = 'accepte'
    order by 1, 2
  loop
    v_doc := public._document_contrat_accepte(v_c.type_contrat, v_c.id);
    v_empreinte := public._empreinte_jsonb(v_doc);
    if exists (select 1 from platform.contrats_acceptes_purges c
                where c.type_contrat = v_c.type_contrat and c.source_id = v_c.id and c.empreinte_document = v_empreinte) then
      continue;
    end if;
    v_contenu := public._contrat_minimise(v_c.type_contrat, v_doc, v_niveau, v_pol.inclure_photos);
    if v_niveau = 'contrat_minimise' then
      -- Point de départ selon la décision, jamais la date de la purge (rejeu identique).
      select * into v_dep from public._depart_conservation_contrat(v_c.type_contrat, v_c.id, v_pol.regles_depart, v_pol.regle_depart_repli);
      if v_dep.date_depart is null then
        raise exception 'DECISION_REQUIRED:RGPD-DEPART-CONSERVATION-INDETERMINE — % % : point de départ indéterminable (règles %, repli %, dates %)',
          v_c.type_contrat, v_c.reference, array_to_string(v_pol.regles_depart, '+'), coalesce(v_pol.regle_depart_repli, 'aucun'),
          v_dep.dates_regles::text;
      end if;
      insert into platform.contrats_acceptes_purges
        (entreprise_id, run_id, type_contrat, source_id, reference, politique, decision_ref, niveau,
         contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au,
         date_depart_conservation, regles_depart_appliquees, duree_conservation, dernier_jour_conserve, inclure_photos)
      values
        (p_entreprise_id, p_run_id, v_c.type_contrat, v_c.id, v_c.reference, v_pol.politique, v_pol.decision_ref, v_niveau,
         v_contenu, v_empreinte, public._empreinte_jsonb(v_contenu),
         platform.echeance_conservation_contrat(v_dep.date_depart, v_pol.duree_conservation),
         v_dep.date_depart, v_dep.regles_appliquees, v_pol.duree_conservation,
         platform.dernier_jour_conservation_contrat(v_dep.date_depart, v_pol.duree_conservation), v_pol.inclure_photos);
    else
      insert into platform.contrats_acceptes_purges
        (entreprise_id, run_id, type_contrat, source_id, reference, politique, decision_ref, niveau,
         contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au)
      values
        (p_entreprise_id, p_run_id, v_c.type_contrat, v_c.id, v_c.reference, v_pol.politique, v_pol.decision_ref, v_niveau,
         v_contenu, v_empreinte, public._empreinte_jsonb(v_contenu), null);
    end if;
    v_n := v_n + 1;
    v_empreintes := v_empreintes || jsonb_build_object('type', v_c.type_contrat, 'id', v_c.id, 'empreinte_document', v_empreinte);
  end loop;

  if v_n > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'preuve_contrats_acceptes', 'devis+avenants', v_pol.politique, v_n, true, null,
      jsonb_build_object('decision_ref', v_pol.decision_ref, 'niveau', v_niveau, 'contrats', v_empreintes)
      || case when v_niveau = 'contrat_minimise' then jsonb_build_object(
           'duree_conservation', v_pol.duree_conservation, 'regles_depart', v_pol.regles_depart,
           'regle_depart_repli', v_pol.regle_depart_repli, 'inclure_photos', v_pol.inclure_photos) else '{}'::jsonb end);
  end if;
  return v_n;
end; $$;
revoke all on function public._preserver_contrats_acceptes(uuid, uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R2/R5. Purge d'une table
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000506 hors des blocs marqués « V2 ».
create or replace function public.purger_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_supprimees integer, erreur text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prevue timestamptz;
  v_existe boolean;
  v_nb integer;
  v_avant record;
  v_apres record;
  v_detail jsonb;
  v_contrats integer := 0;
  v_politique text;
  v_commandes integer := 0;
  v_fournisseurs_avant record;
  v_fournisseurs_apres record;
  v_manquants text[];
  v_gel_anticipe boolean := false;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    ok := false; lignes_supprimees := null;
    erreur := 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  if p_table = any(public.tables_conservees_purge()) or p_table = any(public.tables_anonymisees_purge()) then
    ok := false; lignes_supprimees := null;
    erreur := format('Table %s conservee ou anonymisee (pas DELETE) : purge refusee', p_table);
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'entreprise_id'
  ) into v_existe;
  if not v_existe then
    ok := false; lignes_supprimees := null;
    erreur := format('Table %s inconnue ou sans colonne entreprise_id : purge refusee', p_table);
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  -- Contrats acceptés (P1) : sans décision, refus explicite AVANT toute écriture.
  if p_table = any(public._tables_contrats_acceptes()) then
    v_contrats := public._nb_contrats_acceptes(p_entreprise_id);
    if v_contrats > 0 then
      v_politique := platform.etat_politique_contrats();
      if v_politique not in ('supprimer_apres_preuve', 'conserver_contrat_minimise') then
        ok := false; lignes_supprimees := null;
        -- V2 : paramètres manquants nommés dans le refus et dans l'audit.
        v_manquants := platform.parametres_conservation_manquants();
        if v_politique = 'duree_requise' then
          erreur := format('DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique conserver_contrat_minimise retenue mais durée de conservation non validée '
                           '(paramètres manquants : %s), table %s non purgée',
                           v_contrats, array_to_string(v_manquants, ', '), p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-DUREE-CONSERVATION-CONTRAT', 'politique', 'conserver_contrat_minimise',
                               'contrats_acceptes', v_contrats, 'parametres_manquants', to_jsonb(v_manquants)));
        elsif v_politique = 'parametres_requis' then
          erreur := format('DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique conserver_contrat_minimise retenue, paramètres non validés (%s), table %s non purgée',
                           v_contrats, array_to_string(v_manquants, ', '), p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-PARAMETRES-CONSERVATION-CONTRAT', 'politique', 'conserver_contrat_minimise',
                               'contrats_acceptes', v_contrats, 'parametres_manquants', to_jsonb(v_manquants)));
        else
          erreur := format('DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique de purge des contrats non décidée, table %s non purgée', v_contrats, p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-PURGE-VS-CONTRAT-ACCEPTE', 'contrats_acceptes', v_contrats));
        end if;
        return next; return;
      end if;
    end if;
  elsif platform.etat_politique_contrats() = 'conserver_contrat_minimise'
        and public._nb_contrats_acceptes(p_entreprise_id) > 0
        and not exists (select 1 from platform.purge_audit a
                         where a.run_id = p_run_id and a.entreprise_id = p_entreprise_id
                           and a.etape = 'preuve_contrats_acceptes' and not a.ok) then
    -- V2 (R5) : politique C active → instantanés figés dès la première étape, avant que les
    -- données du point de départ (fin de chantier, réception…) ne soient supprimées.
    v_gel_anticipe := true;
  end if;

  -- PO-4 : commandes fournisseurs engagées sur les tables qui les portent.
  if p_table = any(public._tables_commandes_engagees()) then
    v_commandes := public._nb_commandes_engagees(p_entreprise_id);
  end if;

  -- V2 (R5) : gel anticipé, hors du bloc de l'étape. Un échec (point de départ indéterminable)
  -- est audité et n'empêche pas la purge de cette table sans contrat ; les tables porteuses
  -- refuseront ensuite, avec la même cause.
  if v_gel_anticipe then
    begin
      perform public._preserver_contrats_acceptes(p_entreprise_id, p_run_id);
    exception when others then
      perform platform.consigner(p_entreprise_id, p_run_id, 'preuve_contrats_acceptes', 'devis+avenants', 'contrat_minimise',
        null, false, sqlerrm, jsonb_build_object('sqlstate', sqlstate, 'etape_declenchante', p_table));
    end;
  end if;

  begin
    -- R1 : autorisation liée à cette transaction, à cette entreprise, à cette table.
    -- Effacée plus bas ; en cas d'erreur, l'annulation du bloc l'efface aussi.
    insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
    values (txid_current(), p_entreprise_id, p_table, p_run_id)
    on conflict (txid, entreprise_id, table_purgee) do nothing;

    -- R3 : empreinte du contenu comptable avant l'étape.
    select * into v_avant from public.empreinte_comptable_factures_entreprise(p_entreprise_id);
    -- PO-4 : idem pour les factures fournisseurs conservées et leurs règlements.
    select * into v_fournisseurs_avant from public.empreinte_comptable_fournisseurs_entreprise(p_entreprise_id);

    -- P2/P3 : preuve de chaque contrat accepté figée avant la première écriture.
    if v_contrats > 0 then
      perform public._preserver_contrats_acceptes(p_entreprise_id, p_run_id);
    end if;
    -- PO-2 : instantané de chaque commande engagée figé avant la première écriture.
    if v_commandes > 0 then
      perform public._preserver_commandes_fournisseurs(p_entreprise_id, p_run_id);
    end if;

    perform public._snapshot_avant_purge(p_entreprise_id, p_table, p_run_id);
    if v_contrats > 0 and p_table in ('lignes_devis', 'pieces_jointes_devis') then
      -- Les lignes et pièces d'un devis accepté partent AVEC lui (cascade de l'étape
      -- `devis`, sous le contrôle de son verrou) : jamais avant, pour que le contrat ne
      -- soit à aucun moment amputé en base (recalcul de montants, photos).
      execute format(
        'delete from public.%I x where x.entreprise_id = $1 '
        'and not exists (select 1 from public.devis d where d.id = x.devis_id and d.statut = ''accepte'')', p_table)
        using p_entreprise_id;
    elsif p_table = 'lignes_commande' then
      -- PO-4 (D1) : seules les lignes des brouillons partent ici. Les lignes d'une commande
      -- envoyée, confirmée, reçue ou annulée partent AVEC elle (cascade de l'étape
      -- `commandes_fournisseurs`, sous CM-06), jamais avant.
      delete from public.lignes_commande x
       where x.entreprise_id = p_entreprise_id
         and exists (select 1 from public.commandes_fournisseurs c where c.id = x.commande_id and c.statut = 'brouillon');
    else
      execute format('delete from public.%I where entreprise_id = $1', p_table) using p_entreprise_id;
    end if;
    get diagnostics v_nb = row_count;

    delete from platform.purge_autorisations_facture
     where txid = txid_current() and entreprise_id = p_entreprise_id and table_purgee = p_table;

    select * into v_apres from public.empreinte_comptable_factures_entreprise(p_entreprise_id);
    if v_apres.empreinte is distinct from v_avant.empreinte or v_apres.nb_factures <> v_avant.nb_factures then
      raise exception 'Garde-fou comptable : la purge de % modifierait le contenu d''une facture conservée (empreinte % -> %)',
        p_table, v_avant.empreinte, v_apres.empreinte;
    end if;
    select * into v_fournisseurs_apres from public.empreinte_comptable_fournisseurs_entreprise(p_entreprise_id);
    if v_fournisseurs_apres.empreinte is distinct from v_fournisseurs_avant.empreinte
       or v_fournisseurs_apres.nb_depenses <> v_fournisseurs_avant.nb_depenses then
      raise exception 'Garde-fou comptable fournisseurs : la purge de % modifierait une facture fournisseur conservée ou ses règlements (empreinte % -> %)',
        p_table, v_fournisseurs_avant.empreinte, v_fournisseurs_apres.empreinte;
    end if;
    v_detail := jsonb_build_object(
      'controle_factures', 'empreinte_inchangee',
      'nb_factures', v_apres.nb_factures,
      'empreinte_factures', v_apres.empreinte,
      'controle_factures_fournisseurs', 'empreinte_inchangee',
      'nb_factures_fournisseurs', v_fournisseurs_apres.nb_depenses,
      'empreinte_factures_fournisseurs', v_fournisseurs_apres.empreinte);
    if v_contrats > 0 then
      v_detail := v_detail || jsonb_build_object('politique_contrats', v_politique, 'contrats_acceptes_avant', v_contrats);
    end if;
    if v_commandes > 0 then
      v_detail := v_detail || jsonb_build_object('commandes_engagees_avant', v_commandes,
        'instantanes_commandes', (select count(*) from platform.commandes_fournisseurs_purgees p where p.entreprise_id = p_entreprise_id));
    end if;

    ok := true; lignes_supprimees := v_nb; erreur := null;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', v_nb, true, null, v_detail);
  exception when others then
    ok := false; lignes_supprimees := null; erreur := sqlerrm;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, sqlerrm,
      jsonb_build_object('sqlstate', sqlstate));
  end;
  return next;
end; $$;
revoke all on function public.purger_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.purger_table_entreprise(uuid, text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R6. Immutabilité pendant la conservation
-- ═══════════════════════════════════════════════════════════════════════
-- Autorisation de suppression d'UN instantané, liée à la transaction ; déposée uniquement par
-- purger_contrats_conserves_echus, retirée avant de rendre la main.
create table if not exists platform.purge_autorisations_echeance (
  txid bigint not null,
  contrat_purge_id uuid not null,
  primary key (txid, contrat_purge_id)
);
alter table platform.purge_autorisations_echeance enable row level security;
revoke all on table platform.purge_autorisations_echeance from public, anon, authenticated, service_role;

-- Échu à l'instant donné ? Échéance figée atteinte ET échéance recalculée avec la durée
-- COURANTE atteinte ET politique active. Toute donnée manquante = non échu (fail-closed).
create or replace function platform.contrat_conserve_echu(p_c platform.contrats_acceptes_purges, p_instant timestamptz)
returns boolean language sql stable security definer set search_path = platform as $$
  select coalesce(
    p_c.niveau = 'contrat_minimise'
    and p_c.conserver_jusqu_au is not null and p_c.conserver_jusqu_au <= p_instant
    and p_c.date_depart_conservation is not null
    and platform.etat_politique_contrats() = 'conserver_contrat_minimise'
    and platform.echeance_conservation_contrat(
          p_c.date_depart_conservation,
          (select p.duree_conservation from platform.purge_politique_contrats p where p.singleton)) <= p_instant,
    false)
$$;
revoke all on function platform.contrat_conserve_echu(platform.contrats_acceptes_purges, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function platform.contrats_acceptes_purges_immuables()
returns trigger language plpgsql set search_path = platform as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les preuves de contrats purgés ne peuvent pas être vidées (TRUNCATE refusé)';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Une preuve de contrat purgé est immuable';
  end if;
  if old.conserver_jusqu_au is null or old.conserver_jusqu_au > now() then
    raise exception 'Une preuve de contrat purgé ne peut être supprimée qu''après son échéance de conservation';
  end if;
  -- V2 : suppression contrôlée uniquement (autorisation de la transaction en cours).
  if not exists (select 1 from platform.purge_autorisations_echeance a
                  where a.txid = txid_current() and a.contrat_purge_id = old.id) then
    raise exception 'Une preuve de contrat purgé ne se supprime que par purger_contrats_conserves_echus';
  end if;
  if not platform.contrat_conserve_echu(old, now()) then
    raise exception 'Instantané non échu selon les paramètres de conservation courants (ou paramètres non validés) : suppression refusée';
  end if;
  return old;
end; $$;
revoke all on function platform.contrats_acceptes_purges_immuables() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R7. Suppression contrôlée des instantanés échus
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.purger_contrats_conserves_echus(p_limite integer default 500)
returns table(entreprise_id uuid, type_contrat text, source_id uuid, chemins_storage text[])
language plpgsql security definer set search_path = public as $$
declare
  v_etat text := platform.etat_politique_contrats();
  v_pol platform.purge_politique_contrats;
  v_c platform.contrats_acceptes_purges;
begin
  -- Fail-closed : sans paramètres validés, aucune suppression, quelle que soit l'échéance figée.
  -- (`supprimer_apres_preuve` : aucune preuve n'a d'échéance, rien n'est jamais éligible.)
  if v_etat not in ('conserver_contrat_minimise', 'supprimer_apres_preuve') then
    raise exception 'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT — suppression des instantanés échus refusée : politique non active (état %, paramètres manquants : %)',
      v_etat, coalesce(nullif(array_to_string(platform.parametres_conservation_manquants(), ', '), ''), 'aucun');
  end if;
  select * into v_pol from platform.purge_politique_contrats where singleton;
  -- Une seule exécution à la fois (deux lots concurrents ne se chevauchent jamais).
  perform pg_advisory_xact_lock(hashtext('elsatia.rgpd.purger_contrats_conserves_echus'));

  for v_c in
    select c.* from platform.contrats_acceptes_purges c
     where c.niveau = 'contrat_minimise' and c.conserver_jusqu_au <= now()
       and platform.contrat_conserve_echu(c, now())
     order by c.conserver_jusqu_au, c.id
     limit greatest(coalesce(p_limite, 500), 0)
     for update
  loop
    insert into platform.purge_autorisations_echeance (txid, contrat_purge_id) values (txid_current(), v_c.id);
    delete from platform.contrats_acceptes_purges c where c.id = v_c.id;
    delete from platform.purge_autorisations_echeance a where a.txid = txid_current() and a.contrat_purge_id = v_c.id;

    entreprise_id := v_c.entreprise_id; type_contrat := v_c.type_contrat; source_id := v_c.source_id;
    select coalesce(array_agg(ph ->> 'storage_path' order by ph ->> 'storage_path'), '{}') into chemins_storage
      from jsonb_array_elements(coalesce(v_c.contenu -> 'photos', '[]'::jsonb)) ph
     where ph ->> 'storage_path' is not null;
    perform platform.consigner(v_c.entreprise_id, coalesce(v_c.run_id, gen_random_uuid()), 'echeance_contrat_conserve',
      v_c.type_contrat, 'contrat_minimise', 1, true, null,
      jsonb_build_object(
        'source_id', v_c.source_id, 'reference', v_c.reference, 'decision_ref_instantane', v_c.decision_ref,
        'empreinte_document', v_c.empreinte_document, 'empreinte_contenu', v_c.empreinte_contenu,
        'date_depart_conservation', v_c.date_depart_conservation, 'regles_depart_appliquees', v_c.regles_depart_appliquees,
        'duree_conservation_figee', v_c.duree_conservation, 'dernier_jour_conserve', v_c.dernier_jour_conserve,
        'conserver_jusqu_au', v_c.conserver_jusqu_au,
        'decision_ref_courante', v_pol.decision_ref, 'duree_conservation_courante', v_pol.duree_conservation,
        'chemins_storage', to_jsonb(chemins_storage)));
    return next;
  end loop;
end; $$;
revoke all on function public.purger_contrats_conserves_echus(integer) from public, anon, authenticated;
grant execute on function public.purger_contrats_conserves_echus(integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R8. Lecture seule : échéances, simulation, rapport
-- ═══════════════════════════════════════════════════════════════════════
-- Échéances des instantanés à un instant donné (défaut : maintenant). Aucune écriture ; ne
-- révèle aucun contenu (métadonnées de conservation seulement).
create or replace function public.rapport_echeances_contrats_conserves(p_instant timestamptz default now())
returns table(id uuid, entreprise_id uuid, type_contrat text, source_id uuid,
              date_depart_conservation date, regles_depart_appliquees text[], duree_conservation interval,
              dernier_jour_conserve date, conserver_jusqu_au timestamptz, echeance_parametres_courants timestamptz,
              echu boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.entreprise_id, c.type_contrat, c.source_id,
         c.date_depart_conservation, c.regles_depart_appliquees, c.duree_conservation,
         c.dernier_jour_conserve, c.conserver_jusqu_au,
         platform.echeance_conservation_contrat(c.date_depart_conservation,
           (select p.duree_conservation from platform.purge_politique_contrats p where p.singleton)),
         platform.contrat_conserve_echu(c, p_instant)
    from platform.contrats_acceptes_purges c
   where c.niveau = 'contrat_minimise'
   order by c.conserver_jusqu_au, c.id
$$;
revoke all on function public.rapport_echeances_contrats_conserves(timestamptz) from public, anon, authenticated;
grant execute on function public.rapport_echeances_contrats_conserves(timestamptz) to service_role;

-- Simulation pour des paramètres CANDIDATS, sans rien activer ni écrire (propriétaire seulement).
create or replace function platform.simuler_conservation_contrat(
  p_type text, p_id uuid, p_duree interval, p_regles_depart text[], p_regle_depart_repli text default null)
returns table(date_depart date, regles_appliquees text[], dates_regles jsonb, dernier_jour_conserve date, suppression_possible_a_partir_de timestamptz)
language plpgsql stable security definer set search_path = platform as $$
declare
  v_dep record;
begin
  if p_duree is null or not platform._duree_conservation_valide(p_duree) then
    raise exception 'Durée invalide : %', p_duree using errcode = '22023';
  end if;
  if p_regles_depart is null or not platform._regles_depart_valides(p_regles_depart)
     or (p_regle_depart_repli is not null and not (p_regle_depart_repli = any(platform.regles_depart_conservation_contrat()))) then
    raise exception 'Règle de départ invalide : % / %', p_regles_depart, p_regle_depart_repli using errcode = '22023';
  end if;
  select * into v_dep from public._depart_conservation_contrat(p_type, p_id, p_regles_depart, p_regle_depart_repli);
  date_depart := v_dep.date_depart; regles_appliquees := v_dep.regles_appliquees; dates_regles := v_dep.dates_regles;
  dernier_jour_conserve := platform.dernier_jour_conservation_contrat(v_dep.date_depart, p_duree);
  suppression_possible_a_partir_de := platform.echeance_conservation_contrat(v_dep.date_depart, p_duree);
  return next;
end; $$;
revoke all on function platform.simuler_conservation_contrat(text, uuid, interval, text[], text)
  from public, anon, authenticated, service_role;

-- Rapport par entreprise : paramètres et état effectif (504 + V2).
drop function if exists public.rapport_contrats_acceptes_purge(uuid);
create function public.rapport_contrats_acceptes_purge(p_entreprise_id uuid)
returns table(politique text, decision_ref text, devis_acceptes integer, avenants_acceptes integer, preuves integer,
              etat text, duree_conservation interval, regles_depart text[], regle_depart_repli text,
              inclure_photos boolean, choix_photos_explicite boolean, parametres_manquants text[])
language sql stable security definer set search_path = public as $$
  select p.politique, p.decision_ref,
         (select count(*) from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte')::integer,
         (select count(*) from public.avenants a where a.entreprise_id = p_entreprise_id and a.statut = 'accepte')::integer,
         (select count(*) from platform.contrats_acceptes_purges c where c.entreprise_id = p_entreprise_id)::integer,
         platform.etat_politique_contrats(),
         p.duree_conservation, p.regles_depart, p.regle_depart_repli, p.inclure_photos, p.choix_photos_explicite,
         platform.parametres_conservation_manquants()
    from platform.purge_politique_contrats p where p.singleton
$$;
revoke all on function public.rapport_contrats_acceptes_purge(uuid) from public, anon, authenticated;
grant execute on function public.rapport_contrats_acceptes_purge(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Aucune activation : la politique reste celle de 504 (C retenue, aucun paramètre validé).
-- ═══════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from platform.purge_politique_contrats
              where singleton and politique = 'conserver_contrat_minimise'
                and duree_conservation is null and regles_depart is null and not choix_photos_explicite) then
    raise notice 'RGPD contrats : politique conserver_contrat_minimise retenue, paramètres non validés (%). Purge des contrats fermée.',
      array_to_string(platform.parametres_conservation_manquants(), ', ');
  end if;
end $$;

notify pgrst, 'reload schema';
