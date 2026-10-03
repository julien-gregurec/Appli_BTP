-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-B : famine des relances automatiques.
--
-- Constat (docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md § G, reproduit sur V9.1) :
-- relances_auto_candidats_service prenait LIMIT 200 documents ouverts SANS ordre ni
-- filtre d'éligibilité ; l'éligibilité (nombre max, délais…) n'était évaluée qu'ensuite,
-- en TypeScript. 200 documents définitivement inéligibles (relances max atteintes, client
-- sans e-mail…) évinçaient durablement toute facture saine : elle n'était jamais relancée.
--
-- Correctif : le LIMIT porte désormais sur le bon ensemble.
--   * pré-filtre SQL de tout ce que le moteur (src/lib/relances-moteur.ts) rejetterait
--     de façon certaine aujourd'hui : statut, exclusions document et client, e-mail
--     client absent, échéance non dépassée, facture soldée, nombre maximum de relances
--     atteint, délai avant relance non écoulé (marge d'une heure : le pré-filtre ne doit
--     JAMAIS écarter un document que le moteur jugerait éligible) ;
--   * ordre explicite : la relance la plus « due » d'abord, une tentative récente
--     (échec fournisseur, ignorée) repoussant le document derrière ceux jamais tentés —
--     un lot de 200 documents en échec répété ne bloque donc pas les suivants ;
--   * le moteur TypeScript reste l'autorité : il réévalue chaque candidat (pause,
--     week-end, revalidation avant envoi, verrou relance_reclamer).
-- Pause et week-end ne sont pas pré-filtrés : ils valent pour toute l'entreprise.
--
-- Une seule sélection pour le cron (chemin de service) et la simulation (session,
-- RLS) : relances_auto_candidats_selection est SECURITY INVOKER, appelée telle quelle
-- par la simulation (lectures soumises à la RLS de l'appelant) et enveloppée par
-- relances_auto_candidats_service (SECURITY DEFINER, service_role seul, signature
-- et droits inchangés).
--
-- Retour arrière : docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md § P1-B
-- ROLLBACK (corps historique de relances_auto_candidats_service rétabli, drop de
-- relances_auto_candidats_selection et de l'index).

begin;

-- Historique d'envoi par document : comptage et dernière date sans relire la table.
create index if not exists relances_documents_document_statut_idx
  on public.relances_documents (type_document, document_id, statut, date_envoi);

create or replace function public.relances_auto_candidats_selection(
  p_entreprise_id uuid,
  p_type_document text,
  p_limite integer default 200
)
returns table(id uuid)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_limite integer := greatest(0, least(coalesce(p_limite, 200), 200));
  v_aujourdhui date := (now() at time zone 'utc')::date;
  -- Marge en faveur de l'éligibilité : le moteur compare à son propre « maintenant ».
  v_horizon timestamptz := now() + interval '1 hour';
begin
  if p_type_document = 'devis' then
    return query
      select d.id
      from public.devis d
      join public.parametres_relances p on p.entreprise_id = d.entreprise_id
      join public.clients c on c.id = d.client_id and c.entreprise_id = d.entreprise_id
      cross join lateral (
        select count(*) filter (where r.statut = 'envoyee') as envoyees,
               max(r.date_envoi) filter (where r.statut = 'envoyee') as derniere_envoyee,
               max(r.created_at) as derniere_tentative
        from public.relances_documents r
        where r.type_document = 'devis' and r.document_id = d.id
      ) h
      cross join lateral (
        select coalesce(h.derniere_envoyee, d.date_emission::timestamp at time zone 'utc')
               + make_interval(days => case when h.derniere_envoyee is null
                                            then p.devis_delai_premiere_relance_jours
                                            else p.devis_delai_entre_relances_jours end) as due_le
      ) e
      where d.entreprise_id = p_entreprise_id
        and d.statut = 'envoye'
        and d.relance_auto_exclue = false
        and c.relance_auto_exclue is not true
        and nullif(btrim(c.email), '') is not null
        and h.envoyees < p.devis_nombre_max_relances
        and e.due_le <= v_horizon
      order by greatest(e.due_le, coalesce(h.derniere_tentative, '-infinity'::timestamptz)), d.id
      limit v_limite;
  elsif p_type_document = 'facture' then
    return query
      select f.id
      from public.factures f
      join public.parametres_relances p on p.entreprise_id = f.entreprise_id
      join public.clients c on c.id = f.client_id and c.entreprise_id = f.entreprise_id
      cross join lateral (
        select count(*) filter (where r.statut = 'envoyee') as envoyees,
               max(r.date_envoi) filter (where r.statut = 'envoyee') as derniere_envoyee,
               max(r.created_at) as derniere_tentative
        from public.relances_documents r
        where r.type_document = 'facture' and r.document_id = f.id
      ) h
      cross join lateral (
        select coalesce(h.derniere_envoyee, f.date_echeance::timestamp at time zone 'utc')
               + make_interval(days => case when h.derniere_envoyee is null
                                            then p.factures_delai_premiere_relance_jours
                                            else p.factures_delai_entre_relances_jours end) as due_le
      ) e
      where f.entreprise_id = p_entreprise_id
        and f.statut in ('envoyee', 'en_retard', 'payee_partiel')
        and f.relance_auto_exclue = false
        and f.date_echeance is not null
        and f.date_echeance < v_aujourdhui
        and coalesce(f.montant_ttc, 0) - coalesce(f.montant_paye, 0) > 0
        and c.relance_auto_exclue is not true
        and nullif(btrim(c.email), '') is not null
        and h.envoyees < p.factures_nombre_max_relances
        and e.due_le <= v_horizon
      order by greatest(e.due_le, coalesce(h.derniere_tentative, '-infinity'::timestamptz)), f.id
      limit v_limite;
  else
    raise exception 'Type de document de relance invalide' using errcode = '22023';
  end if;
end;
$$;

comment on function public.relances_auto_candidats_selection(uuid, text, integer) is
  'Relances automatiques : documents potentiellement éligibles (pré-filtre du moteur), les plus dus d''abord, plafond 200. SECURITY INVOKER (RLS de l''appelant).';

revoke all on function public.relances_auto_candidats_selection(uuid, text, integer) from public, anon;
grant execute on function public.relances_auto_candidats_selection(uuid, text, integer) to authenticated, service_role;

create or replace function public.relances_auto_candidats_service(
  p_entreprise_id uuid,
  p_type_document text,
  p_limite integer default 200
)
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id from public.relances_auto_candidats_selection(p_entreprise_id, p_type_document, p_limite) s;
$$;

comment on function public.relances_auto_candidats_service(uuid, text, integer) is
  'Relances automatiques : identifiants des devis/factures potentiellement éligibles d''une entreprise, les plus dus d''abord (plafond 200). Chemin de service.';

revoke all on function public.relances_auto_candidats_service(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.relances_auto_candidats_service(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
