-- Diagnostic temporaire (a supprimer juste apres usage) : verifier le calcul jour-par-jour
-- introduit dans 20260724000166 (jours ouvres + heures reelles au lieu de jours calendaires
-- x 7h forfaitaire), sur une plage synthetique couvrant un week-end.
create or replace function public.debug_absence_jours_ouvres(p_entreprise_id uuid, p_date_debut date, p_date_fin date)
returns table(nb_jours integer, total_heures numeric)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where h.heures>0)::integer, coalesce(sum(h.heures),0)
  from generate_series(p_date_debut::timestamp, p_date_fin::timestamp, interval '1 day') as gs(jour)
  cross join lateral (
    select coalesce((ent.horaires_journaliers->>extract(isodow from gs.jour)::integer::text)::numeric,0) as heures
    from public.entreprises ent where ent.id=p_entreprise_id
  ) h;
$$;
revoke all on function public.debug_absence_jours_ouvres(uuid,date,date) from public,anon,authenticated;
grant execute on function public.debug_absence_jours_ouvres(uuid,date,date) to service_role;
