-- Diagnostic temporaire (a supprimer juste apres usage) : debug de
-- notifier_pointages_manquants_et_a_valider, la partie "pointage manquant" ne
-- s'est pas declenchee pour un cas qui semblait pourtant qualifier.
create or replace function public.debug_pointage_manquant(p_date date default current_date - 1)
returns table(
  employe_id uuid, utilisateur_id uuid, entreprise_id uuid,
  e_statut text, ue_statut text, ue_pointage_actif boolean,
  dow text, heure_attendue numeric,
  a_pointage boolean, a_conge_approuve boolean, a_notif_deja boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_hier date := p_date; v_dow text := extract(isodow from v_hier)::text;
begin
  return query
  select e.id, e.utilisateur_id, e.entreprise_id, e.statut, ue.statut, ue.pointage_personnel_actif,
    v_dow, coalesce((ent.horaires_journaliers->>v_dow)::numeric,0),
    exists(select 1 from public.pointages p where p.employe_id=e.id and p.entreprise_id=e.entreprise_id and p.date=v_hier),
    exists(select 1 from public.demandes_conges dc where dc.employe_id=e.id and dc.entreprise_id=e.entreprise_id and dc.statut='approuvee' and v_hier between dc.date_debut and dc.date_fin),
    exists(select 1 from public.notifications_utilisateurs n where n.utilisateur_id=e.utilisateur_id and n.type='pointage_manquant' and n.created_at::date=current_date)
  from public.employes e
  join public.entreprises ent on ent.id=e.entreprise_id
  join public.utilisateurs_entreprises ue on ue.utilisateur_id=e.utilisateur_id and ue.entreprise_id=e.entreprise_id
  where e.id = 'e0086c07-2b1d-4bf7-ae3c-aec968d7b63e';
end;$$;
revoke all on function public.debug_pointage_manquant(date) from public,anon,authenticated;
grant execute on function public.debug_pointage_manquant(date) to service_role;
