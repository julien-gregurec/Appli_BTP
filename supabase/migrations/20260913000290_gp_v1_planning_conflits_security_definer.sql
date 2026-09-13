-- ELSATIA GP V1 — planning v2 : détection des conflits en SECURITY DEFINER.
--
-- Constat (recette preview, 40 salariés / 400 évènements sur la semaine) : `conflits_planning` s'exécutait
-- sous les droits de l'appelant, donc sous les politiques RLS de `planning_evenements`,
-- `planning_affectations` et `equipes_membres` évaluées ligne à ligne, y compris à l'intérieur de
-- `salaries_evenement()` appelée pour chaque évènement : 3 980 ms mesurés, contre 45 ms sans RLS.
-- La fonction devient SECURITY DEFINER avec la garde canonique `est_membre_actif(p_entreprise_id)`
-- évaluée une fois ; aucune donnée d'une autre entreprise n'est atteignable, le corps filtre déjà sur
-- `p_entreprise_id`. Signature, colonnes et résultats inchangés ; `anon` et `service_role` restent révoqués.

create or replace function public.conflits_planning(p_entreprise_id uuid, p_debut timestamptz, p_fin timestamptz, p_plafond_heures numeric default 10)
returns table (evenement_id uuid, type_conflit text, sujet_id uuid, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_membre_actif(p_entreprise_id) then
    return;
  end if;
  return query
  with ev as (
    select e.* from public.planning_evenements e
    where e.entreprise_id = p_entreprise_id and e.statut <> 'annule' and e.debut < p_fin and e.fin > p_debut
  ),
  sal as (select ev.id as evenement_id, s as employe_id, ev.titre, ev.type, ev.debut, ev.fin from ev, lateral public.salaries_evenement(ev.id) s)
  select a.evenement_id, case when a.type = 'conge' or b.type = 'conge' then 'conge' else 'salarie_double' end, a.employe_id,
         'Déjà affecté à « ' || b.titre || ' »'
  from sal a join sal b on b.employe_id = a.employe_id and b.evenement_id <> a.evenement_id and a.debut < b.fin and b.debut < a.fin
  union
  select a.evenement_id, 'ressource_double', a.ressource_id, 'Ressource déjà utilisée par « ' || eb.titre || ' »'
  from public.planning_affectations a join ev ea on ea.id = a.evenement_id
  join public.planning_affectations b on b.ressource_id = a.ressource_id and b.evenement_id <> a.evenement_id
  join public.planning_evenements eb on eb.id = b.evenement_id and eb.statut <> 'annule' and ea.debut < eb.fin and eb.debut < ea.fin
  where a.ressource_id is not null
  union
  select s.evenement_id, 'conge', s.employe_id, 'En congé ce jour-là (' || to_char(af.date, 'DD/MM') || ')'
  from sal s join public.affectations af on af.employe_id = s.employe_id and af.type_activite = 'conge'
       and (af.notes is null or af.notes not like 'PLN:%')
       and af.date between (s.debut at time zone 'Europe/Paris')::date and ((s.fin - interval '1 second') at time zone 'Europe/Paris')::date
  union
  select s.evenement_id, 'hors_disponibilite', s.employe_id, 'Horaire hors des disponibilités déclarées'
  from sal s
  where exists (select 1 from public.planning_disponibilites d where d.employe_id = s.employe_id
                  and d.jour_semaine = ((extract(isodow from (s.debut at time zone 'Europe/Paris')))::int - 1))
    and not exists (select 1 from public.planning_disponibilites d where d.employe_id = s.employe_id
                  and d.jour_semaine = ((extract(isodow from (s.debut at time zone 'Europe/Paris')))::int - 1)
                  and (s.debut at time zone 'Europe/Paris')::time >= d.debut and (s.fin at time zone 'Europe/Paris')::time <= d.fin)
  union
  select s.evenement_id, 'surcharge', s.employe_id, 'Plus de ' || p_plafond_heures || ' h le ' || to_char(af.date, 'DD/MM')
  from sal s join public.affectations af on af.employe_id = s.employe_id and af.notes = 'PLN:' || s.evenement_id::text
  where af.type_activite <> 'conge'
    and (select sum(x.heures) from public.affectations x where x.employe_id = s.employe_id and x.date = af.date and x.type_activite <> 'conge') > p_plafond_heures;
end $$;

revoke all on function public.conflits_planning(uuid, timestamptz, timestamptz, numeric) from public, anon, service_role;
grant execute on function public.conflits_planning(uuid, timestamptz, timestamptz, numeric) to authenticated;
