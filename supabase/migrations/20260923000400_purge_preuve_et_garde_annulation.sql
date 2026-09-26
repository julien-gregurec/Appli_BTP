-- Cohérence rétention / sauvegardes / purge — V1
-- (voir docs/qualification/ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md).
--
-- Aucune décision juridique n'est prise ici : ni durée de rétention, ni activation d'une
-- purge automatique. Cette migration ferme trois écarts purement techniques entre la
-- purge (migration 20260729000185), l'audit et la restauration de sauvegardes :
--
--  A1  platform.purge_audit est rendue append-only (trigger) : même le propriétaire de
--      la table ou une fonction SECURITY DEFINER ne peut plus modifier ni supprimer une
--      preuve de purge. Seule une restauration de sauvegarde peut la faire « disparaître »
--      — d'où A2.
--  A2  preuve_purge_entreprise() : résumé JSON stable (empreinte SHA-256 de la piste
--      d'audit) destiné à être archivé HORS de la base (le script de purge l'écrit sur
--      disque). C'est la seule preuve qui survit à une restauration d'une sauvegarde
--      antérieure à la purge, et c'est aussi la liste qui permet de rejouer la purge
--      après une telle restauration (sinon les données purgées « ressuscitent »).
--  A3  demander/annuler_suppression_entreprise refusent désormais d'agir sur une
--      entreprise dont la purge a déjà commencé : annuler en cours de purge laissait une
--      entreprise à moitié supprimée, avec suppression_prevue_at remis à NULL, donc
--      impossible à terminer (purger_table_entreprise refuse sans échéance).
--  F9  journal_audit_notes_frais et validations_notes_frais portent un trigger
--      d'immuabilité (trg_refuser_mutation_archive) mais étaient classées DELETE : toute
--      entreprise ayant utilisé l'archivage des notes de frais échouait définitivement à
--      la purge (reproduit : « Cet enregistrement d’archive est immuable »), donc ne
--      pouvait jamais être marquée purgée. Reclassées RETAIN, même règle que F5/F6 de la
--      migration 20260729000185 (le trigger est le signal correct) et cohérent avec
--      notes_frais et son sous-système d'archivage, déjà RETAIN en bloc. Leurs FK ne
--      visent que entreprises, utilisateurs et notes_frais : aucun purge_snapshot requis.
--  A4  restaurer_echeance_depuis_preuve() : après restauration d'une sauvegarde
--      antérieure à la DEMANDE de suppression, ré-applique l'échéance consignée dans la
--      preuve archivée pour que la purge déjà exécutée puisse être rejouée.
--
-- Plus deux fonctions pour le planificateur de purge (désactivé par défaut, voir
-- src/lib/rgpd-purge-planificateur.ts) : lister_purges_echues() et
-- consigner_planificateur_purge().

-- ═══════════════════════════════════════════════════════════════════════
-- A1. Audit append-only
-- ═══════════════════════════════════════════════════════════════════════
create or replace function platform.purge_audit_immuable()
returns trigger
language plpgsql as $$
begin
  raise exception 'platform.purge_audit est append-only : % interdit (preuve de purge RGPD)', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists purge_audit_immuable on platform.purge_audit;
create trigger purge_audit_immuable
  before update or delete on platform.purge_audit
  for each row execute function platform.purge_audit_immuable();

drop trigger if exists purge_audit_immuable_truncate on platform.purge_audit;
create trigger purge_audit_immuable_truncate
  before truncate on platform.purge_audit
  for each statement execute function platform.purge_audit_immuable();

revoke all on function platform.purge_audit_immuable() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- F9. Tables d'archive immuables des notes de frais : RETAIN
-- ═══════════════════════════════════════════════════════════════════════
-- Liste identique à 20260729000185, plus les deux tables F9. Miroir TS :
-- TABLES_CONSERVEES_PURGE (src/lib/rgpd.ts), synchronisation vérifiée par test.
create or replace function public.tables_conservees_purge()
returns text[]
language sql immutable
as $$
  select array[
    'factures', 'lignes_factures', 'paiements', 'remises_banque_paiements',
    'coordonnees_bancaires', 'connexions_bancaires', 'lots_virements', 'ordres_virements',
    'journal_paiements_bancaires',
    'bulletins_paie', 'periodes_paie', 'dossiers_paie_salaries', 'validations_paie',
    'absences_paie', 'indemnites_deplacement_paie', 'pieces_jointes_paie',
    'journal_audit_paie',
    'grands_deplacements',
    'facturation_comptes_mensuelle',
    'notes_frais', 'depenses_fournisseurs', 'categories_notes_frais', 'documents_notes_frais',
    'versions_documents_notes_frais', 'exports_notes_frais', 'elements_export_notes_frais',
    'journal_audit_notes_frais',  -- F9 : trigger journal_audit_immuable
    'validations_notes_frais',    -- F9 : trigger validations_notes_frais_immuables
    'signatures_documents',
    'journal_activite'
  ];
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Purge commencée ? (utilisé par A3 et par le planificateur)
-- ═══════════════════════════════════════════════════════════════════════
-- Une purge est « commencée » dès qu'une étape a réellement modifié des données :
-- suppression ou anonymisation d'au moins une ligne, ou marquage final. Les refus
-- (échéance non atteinte, table inconnue) et les tables déjà vides ne comptent pas.
create or replace function public.purge_entreprise_commencee(p_entreprise_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entreprises e where e.id = p_entreprise_id and e.purgee_at is not null
  ) or exists (
    select 1 from platform.purge_audit a
     where a.entreprise_id = p_entreprise_id
       and a.ok
       and (
         (a.etape in ('purge_table', 'anonymiser_table') and coalesce(a.lignes_affectees, 0) > 0)
         or a.etape = 'marquer_purgee'
       )
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- A2. Preuve de purge exportable
-- ═══════════════════════════════════════════════════════════════════════
-- Lecture seule, déterministe tant qu'aucune entrée d'audit n'est ajoutée : deux appels
-- successifs renvoient la même empreinte. Le champ `genere_at` est volontairement exclu
-- de l'empreinte.
create or replace function public.preuve_purge_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_e record;
  v_audit jsonb;
  v_empreinte text;
  v_statut text;
begin
  select id, purgee_at, suppression_demandee_at, suppression_prevue_at
    into v_e from public.entreprises where id = p_entreprise_id;

  select jsonb_build_object(
           'nb_entrees', count(*),
           'nb_echecs', count(*) filter (where not a.ok),
           'runs', coalesce(jsonb_agg(distinct a.run_id) filter (where a.run_id is not null), '[]'::jsonb),
           'premiere_entree', min(a.created_at),
           'derniere_entree', max(a.created_at)
         ),
         encode(sha256(convert_to(coalesce(string_agg(
           -- format() rend NULL comme chaîne vide sans décaler les champs (concat_ws
           -- les sauterait) : la sérialisation reste positionnelle donc non ambiguë.
           format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', a.id, a.run_id, a.etape, a.table_nom, a.categorie,
                  a.lignes_affectees, a.ok, a.erreur, a.detail::text,
                  to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
           E'\n' order by a.created_at, a.id), ''), 'UTF8')), 'hex')
    into v_audit, v_empreinte
    from platform.purge_audit a
   where a.entreprise_id = p_entreprise_id;

  v_statut := case
    when v_e.id is null then 'ENTREPRISE_INCONNUE'
    when v_e.purgee_at is not null then 'PURGEE'
    when public.purge_entreprise_commencee(p_entreprise_id) then 'PURGE_COMMENCEE'
    when v_e.suppression_prevue_at is not null then 'SUPPRESSION_PROGRAMMEE'
    else 'AUCUNE_SUPPRESSION'
  end;

  return jsonb_build_object(
    'format', 'elsatia.preuve_purge.v1',
    'entreprise_id', p_entreprise_id,
    'statut', v_statut,
    'suppression_demandee_at', v_e.suppression_demandee_at,
    'suppression_prevue_at', v_e.suppression_prevue_at,
    'purgee_at', v_e.purgee_at,
    'audit', v_audit,
    'tables_purgees', coalesce((
      select jsonb_object_agg(t.table_nom, t.lignes) from (
        select a.table_nom, sum(a.lignes_affectees)::bigint as lignes
          from platform.purge_audit a
         where a.entreprise_id = p_entreprise_id and a.ok and a.etape = 'purge_table'
         group by a.table_nom
      ) t), '{}'::jsonb),
    'tables_anonymisees', coalesce((
      select jsonb_object_agg(t.table_nom, t.lignes) from (
        select a.table_nom, sum(a.lignes_affectees)::bigint as lignes
          from platform.purge_audit a
         where a.entreprise_id = p_entreprise_id and a.ok and a.etape = 'anonymiser_table'
         group by a.table_nom
      ) t), '{}'::jsonb),
    'empreinte_audit_sha256', v_empreinte,
    -- Rappel factuel, pas un engagement : la purge ne touche que la base vivante.
    'sauvegardes', 'Toute sauvegarde anterieure a purgee_at contient encore les donnees purgees. '
                || 'Elles ne disparaissent qu''a l''expiration de la retention de cette sauvegarde. '
                || 'Apres toute restauration anterieure a purgee_at, la purge doit etre rejouee.',
    'genere_at', now()
  );
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- A4. Rejeu après restauration d'une sauvegarde antérieure à la DEMANDE
-- ═══════════════════════════════════════════════════════════════════════
-- Si la sauvegarde restaurée précède la demande de suppression, l'entreprise revient
-- sans échéance : purger_table_entreprise la refuse et la purge déjà décidée et
-- exécutée ne peut pas être rejouée. Cette fonction ré-applique l'échéance consignée
-- dans une preuve archivée (statut PURGEE) — elle ne crée aucune décision nouvelle :
-- elle restaure l'état d'une décision déjà exécutée. Jamais d'effet si l'entreprise
-- porte déjà une échéance, a déjà été purgée, ou si la preuve est incohérente.
create or replace function public.restaurer_echeance_depuis_preuve(p_preuve jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_demandee timestamptz;
  v_prevue timestamptz;
  v_e record;
begin
  if p_preuve->>'format' is distinct from 'elsatia.preuve_purge.v1' or p_preuve->>'statut' is distinct from 'PURGEE' then
    raise exception 'Preuve refusee : format elsatia.preuve_purge.v1 et statut PURGEE requis';
  end if;
  begin
    v_id := (p_preuve->>'entreprise_id')::uuid;
    v_demandee := (p_preuve->>'suppression_demandee_at')::timestamptz;
    v_prevue := (p_preuve->>'suppression_prevue_at')::timestamptz;
  exception when others then
    raise exception 'Preuve refusee : identifiant ou dates illisibles';
  end;
  if v_id is null or v_prevue is null or v_prevue > now()
     or (v_demandee is not null and v_prevue < v_demandee) then
    raise exception 'Preuve refusee : echeance absente, future ou anterieure a la demande';
  end if;

  select id, suppression_prevue_at, purgee_at into v_e from public.entreprises where id = v_id;
  if v_e.id is null then
    raise exception 'Preuve refusee : entreprise % absente de la base restauree', v_id;
  end if;
  if v_e.purgee_at is not null then
    raise exception 'Entreprise % deja purgee dans cette base : rien a rejouer', v_id;
  end if;
  if v_e.suppression_prevue_at is not null then
    raise exception 'Entreprise % porte deja une echeance (%) : utiliser la purge normale', v_id, v_e.suppression_prevue_at;
  end if;

  update public.entreprises
     set suppression_demandee_at = v_demandee, suppression_prevue_at = v_prevue, updated_at = now()
   where id = v_id;
  perform platform.consigner(v_id, gen_random_uuid(), 'restauration_echeance', '__entreprise__', null, null, true, null,
    jsonb_build_object('empreinte_preuve', p_preuve->>'empreinte_audit_sha256',
                       'purgee_at_origine', p_preuve->>'purgee_at'));
  return v_prevue;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Audit du planificateur (désactivé par défaut côté application)
-- ═══════════════════════════════════════════════════════════════════════
-- Consigne une décision du planificateur (entreprise sélectionnée, ignorée, résultat)
-- avec son mode et la référence de décision propriétaire qui l'a autorisé. Étape
-- 'planificateur' : jamais comptée comme une purge commencée.
create or replace function public.consigner_planificateur_purge(
  p_entreprise_id uuid, p_run_id uuid, p_ok boolean, p_detail jsonb
) returns void
language sql security definer set search_path = public as $$
  select platform.consigner(p_entreprise_id, p_run_id, 'planificateur', null, null, null,
                            p_ok, case when p_ok then null else p_detail->>'raison' end, p_detail);
$$;

-- Sélection des entreprises dont l'échéance est atteinte, jugée par l'horloge de la
-- base (la même que purger_table_entreprise), jamais par celle de l'application.
create or replace function public.lister_purges_echues(p_limite integer default 10)
returns table(id uuid, suppression_demandee_at timestamptz, suppression_prevue_at timestamptz, purgee_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.suppression_demandee_at, e.suppression_prevue_at, e.purgee_at
    from public.entreprises e
   where e.suppression_prevue_at is not null
     and e.suppression_prevue_at <= now()
     and e.purgee_at is null
   order by e.suppression_prevue_at, e.id
   limit greatest(1, least(coalesce(p_limite, 10), 100));
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- A3. Demande / annulation : refus si la purge a déjà commencé
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à la migration 20260719000114, plus la seule garde A3.
create or replace function public.demander_suppression_entreprise(p_entreprise_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_prevue timestamptz;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  if public.purge_entreprise_commencee(p_entreprise_id) then
    raise exception 'La suppression de cette entreprise est déjà en cours d''exécution.';
  end if;
  v_prevue := now() + interval '30 days';
  update public.entreprises
     set suppression_demandee_at = now(),
         suppression_prevue_at = v_prevue,
         suppression_demandee_par = auth.uid(),
         updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_demandee', 'entreprise',
          'Demande de suppression du compte (purge prévue le ' || to_char(v_prevue, 'DD/MM/YYYY') || ')');
  return v_prevue;
end; $$;

create or replace function public.annuler_suppression_entreprise(p_entreprise_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  if public.purge_entreprise_commencee(p_entreprise_id) then
    raise exception 'La suppression a déjà commencé : elle ne peut plus être annulée.';
  end if;
  update public.entreprises
     set suppression_demandee_at = null, suppression_prevue_at = null,
         suppression_demandee_par = null, updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_annulee', 'entreprise', 'Demande de suppression annulée');
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Droits — service_role uniquement pour les nouvelles fonctions ; les droits de
-- demander/annuler (authenticated) sont conservés par CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════
revoke all on function public.purge_entreprise_commencee(uuid) from public, anon, authenticated;
revoke all on function public.preuve_purge_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.consigner_planificateur_purge(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.lister_purges_echues(integer) from public, anon, authenticated;
revoke all on function public.restaurer_echeance_depuis_preuve(jsonb) from public, anon, authenticated;
grant execute on function public.purge_entreprise_commencee(uuid) to service_role;
grant execute on function public.preuve_purge_entreprise(uuid) to service_role;
grant execute on function public.consigner_planificateur_purge(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.lister_purges_echues(integer) to service_role;
grant execute on function public.restaurer_echeance_depuis_preuve(jsonb) to service_role;
