-- RGPD × contrats acceptés — politique retenue par le propriétaire : conserver_contrat_minimise.
-- Train canonique V3. Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md (§4)
-- Mécanisme : 20260926000502 (ex-20260926000402, rapport ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1).
--
-- Décision propriétaire (2026-09-26) : à la purge RGPD d'une entreprise, les devis et avenants
-- acceptés suivent l'option C du rapport — instantané immuable et minimisé, puis suppression
-- des objets actifs. L'option D (supprimer_apres_preuve) n'est pas retenue.
--
-- La DURÉE de conservation n'est PAS juridiquement validée à cette date. Aucune durée n'est
-- inventée ici. Conséquences, en fail-closed :
--   V3-1  La politique enregistrée devient `conserver_contrat_minimise` avec
--         `duree_conservation = NULL`. La contrainte de 502 qui imposait une durée pour C est
--         remplacée : NULL est admis (politique retenue, non active), une durée renseignée doit
--         rester strictement positive.
--   V3-2  `platform.etat_politique_contrats()` donne l'état EFFECTIF : `non_decidee`,
--         `duree_requise` (C sans durée valide), `supprimer_apres_preuve`,
--         `conserver_contrat_minimise` (C active). Seuls les deux derniers autorisent une purge
--         de contrat accepté.
--   V3-3  `purger_table_entreprise` : tant que l'état est `duree_requise`, refus explicite et
--         audité AVANT toute écriture, avec DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT
--         (même comportement sûr que `non_decidee`, cause distincte).
--   V3-4  Défense en profondeur : `_preserver_contrats_acceptes` refuse de figer un instantané
--         C sans durée ; `_purge_contrat_autorisee` (lue par les verrous) exige un état actif.
--   V3-5  `rapport_contrats_acceptes_purge` expose l'état effectif (colonne `etat`).
--
-- Activation, le jour où la durée est validée (une ligne, dans une migration qui cite la
-- validation) :
--   select platform.definir_politique_purge_contrats(
--     'conserver_contrat_minimise', '<référence décision + validation de la durée>',
--     interval '<durée validée>', <photos imprimées : true|false>);
-- `inclure_photos` reste à `false` (défaut de minimisation de 502) jusqu'à cette activation.

-- ═══════════════════════════════════════════════════════════════════════
-- V3-1. Contrainte : C admise sans durée (non active), durée > 0 si renseignée
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare
  v_nom text;
begin
  for v_nom in
    select c.conname from pg_constraint c
     where c.conrelid = 'platform.purge_politique_contrats'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%conserver_contrat_minimise%duree_conservation IS NOT NULL%'
  loop
    execute format('alter table platform.purge_politique_contrats drop constraint %I', v_nom);
  end loop;
end $$;

alter table platform.purge_politique_contrats
  drop constraint if exists purge_politique_contrats_duree_valide;
alter table platform.purge_politique_contrats
  add constraint purge_politique_contrats_duree_valide
  check (duree_conservation is null or duree_conservation > interval '0');

comment on column platform.purge_politique_contrats.duree_conservation is
  'Durée de conservation des instantanés C. NULL = durée non validée juridiquement : la '
  'politique conserver_contrat_minimise est alors retenue mais NON active (fail-closed, '
  'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT).';

-- ═══════════════════════════════════════════════════════════════════════
-- V3-2. État effectif de la politique
-- ═══════════════════════════════════════════════════════════════════════
create or replace function platform.etat_politique_contrats()
returns text
language sql stable security definer set search_path = platform as $$
  select coalesce((
    select case
             when p.politique = 'supprimer_apres_preuve' then 'supprimer_apres_preuve'
             when p.politique = 'conserver_contrat_minimise'
                  and p.duree_conservation is not null and p.duree_conservation > interval '0'
               then 'conserver_contrat_minimise'
             when p.politique = 'conserver_contrat_minimise' then 'duree_requise'
             else 'non_decidee'
           end
      from platform.purge_politique_contrats p where p.singleton), 'non_decidee')
$$;
revoke all on function platform.etat_politique_contrats() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- V3-4. Défense en profondeur : autorisation de purge d'un contrat = état actif
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public._purge_contrat_autorisee(p_entreprise_id uuid, p_table text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from platform.purge_autorisations_facture a
            where a.txid = txid_current() and a.entreprise_id = p_entreprise_id and a.table_purgee = p_table)
     and platform.etat_politique_contrats() in ('supprimer_apres_preuve', 'conserver_contrat_minimise')
$$;
revoke all on function public._purge_contrat_autorisee(uuid, text) from public, anon, authenticated, service_role;

-- Corps identique à 20260926000502 plus le refus « durée requise ».
create or replace function public._preserver_contrats_acceptes(p_entreprise_id uuid, p_run_id uuid)
returns integer
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_pol platform.purge_politique_contrats;
  v_niveau text;
  v_c record;
  v_doc jsonb;
  v_contenu jsonb;
  v_empreinte text;
  v_depart timestamptz;
  v_n integer := 0;
  v_empreintes jsonb := '[]'::jsonb;
begin
  select * into v_pol from platform.purge_politique_contrats where singleton;
  if v_pol.politique is null or v_pol.politique = 'non_decidee' then
    raise exception 'DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — politique de purge des contrats acceptés non décidée';
  end if;
  -- V3 (fail-closed) : jamais d'instantané C sans durée de conservation validée.
  if platform.etat_politique_contrats() = 'duree_requise' then
    raise exception 'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — politique conserver_contrat_minimise retenue, durée de conservation non validée';
  end if;
  v_niveau := case v_pol.politique when 'supprimer_apres_preuve' then 'preuve_minimale' else 'contrat_minimise' end;

  for v_c in
    select 'devis'::text as type_contrat, d.id, d.numero as reference, d.date_emission::timestamptz as depart
      from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte'
    union all
    select 'avenant', a.id,
           coalesce((select d.numero from public.devis d where d.id = a.devis_origine_id), '?') || ' / avenant ' || a.ordre,
           coalesce(date_trunc('day', a.date_acceptation), a.date_creation::timestamptz)
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
    -- Point de départ de la conservation : date du contrat (émission du devis,
    -- acceptation de l'avenant) — paramètre juridique documenté dans le rapport, pas
    -- la date de la purge (le rejeu après restauration reste identique).
    v_depart := v_c.depart;
    insert into platform.contrats_acceptes_purges
      (entreprise_id, run_id, type_contrat, source_id, reference, politique, decision_ref, niveau,
       contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au)
    values
      (p_entreprise_id, p_run_id, v_c.type_contrat, v_c.id, v_c.reference, v_pol.politique, v_pol.decision_ref, v_niveau,
       v_contenu, v_empreinte, public._empreinte_jsonb(v_contenu),
       case when v_niveau = 'contrat_minimise' then coalesce(v_depart, now()) + v_pol.duree_conservation end);
    v_n := v_n + 1;
    v_empreintes := v_empreintes || jsonb_build_object('type', v_c.type_contrat, 'id', v_c.id, 'empreinte_document', v_empreinte);
  end loop;

  if v_n > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'preuve_contrats_acceptes', 'devis+avenants', v_pol.politique, v_n, true, null,
      jsonb_build_object('decision_ref', v_pol.decision_ref, 'niveau', v_niveau, 'contrats', v_empreintes));
  end if;
  return v_n;
end; $$;
revoke all on function public._preserver_contrats_acceptes(uuid, uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- V3-3. Purge d'une table : refus nommé tant que la durée n'est pas validée
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000502 hors du bloc « état effectif de la politique ».
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
      -- V3 : état EFFECTIF de la politique (une politique retenue sans durée valide
      -- n'est pas active : fail-closed, refus nommé avant toute écriture).
      v_politique := platform.etat_politique_contrats();
      if v_politique not in ('supprimer_apres_preuve', 'conserver_contrat_minimise') then
        ok := false; lignes_supprimees := null;
        if v_politique = 'duree_requise' then
          erreur := format('DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique conserver_contrat_minimise retenue mais durée de conservation non validée, table %s non purgée',
                           v_contrats, p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-DUREE-CONSERVATION-CONTRAT', 'politique', 'conserver_contrat_minimise',
                               'contrats_acceptes', v_contrats));
        else
          erreur := format('DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique de purge des contrats non décidée, table %s non purgée', v_contrats, p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-PURGE-VS-CONTRAT-ACCEPTE', 'contrats_acceptes', v_contrats));
        end if;
        return next; return;
      end if;
    end if;
  end if;

  begin
    -- R1 : autorisation liée à cette transaction, à cette entreprise, à cette table.
    -- Effacée plus bas ; en cas d'erreur, l'annulation du bloc l'efface aussi.
    insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
    values (txid_current(), p_entreprise_id, p_table, p_run_id)
    on conflict (txid, entreprise_id, table_purgee) do nothing;

    -- R3 : empreinte du contenu comptable avant l'étape.
    select * into v_avant from public.empreinte_comptable_factures_entreprise(p_entreprise_id);

    -- P2/P3 : preuve de chaque contrat accepté figée avant la première écriture.
    if v_contrats > 0 then
      perform public._preserver_contrats_acceptes(p_entreprise_id, p_run_id);
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
    v_detail := jsonb_build_object(
      'controle_factures', 'empreinte_inchangee',
      'nb_factures', v_apres.nb_factures,
      'empreinte_factures', v_apres.empreinte);
    if v_contrats > 0 then
      v_detail := v_detail || jsonb_build_object('politique_contrats', v_politique, 'contrats_acceptes_avant', v_contrats);
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
-- V3-5. Rapport : état effectif
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.rapport_contrats_acceptes_purge(uuid);
create function public.rapport_contrats_acceptes_purge(p_entreprise_id uuid)
returns table(politique text, decision_ref text, devis_acceptes integer, avenants_acceptes integer, preuves integer,
              etat text, duree_conservation interval)
language sql stable security definer set search_path = public as $$
  select p.politique, p.decision_ref,
         (select count(*) from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte')::integer,
         (select count(*) from public.avenants a where a.entreprise_id = p_entreprise_id and a.statut = 'accepte')::integer,
         (select count(*) from platform.contrats_acceptes_purges c where c.entreprise_id = p_entreprise_id)::integer,
         platform.etat_politique_contrats(),
         p.duree_conservation
    from platform.purge_politique_contrats p where p.singleton
$$;
revoke all on function public.rapport_contrats_acceptes_purge(uuid) from public, anon, authenticated;
grant execute on function public.rapport_contrats_acceptes_purge(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Décision : politique retenue, durée NON renseignée (non active)
-- ═══════════════════════════════════════════════════════════════════════
-- Idempotent : ne réécrit pas une politique déjà rendue active par une migration ultérieure
-- (durée validée) ni un choix différent déjà consigné.
do $$
begin
  if exists (select 1 from platform.purge_politique_contrats where singleton and politique = 'non_decidee') then
    perform platform.definir_politique_purge_contrats(
      'conserver_contrat_minimise',
      'OWNER-DECISION-2026-09-26:RGPD-PURGE-VS-CONTRAT-ACCEPTE=conserver_contrat_minimise (durée : DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT)',
      null, false);
  end if;
end $$;

notify pgrst, 'reload schema';
