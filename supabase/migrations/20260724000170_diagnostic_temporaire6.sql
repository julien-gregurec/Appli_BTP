-- Diagnostic temporaire (a supprimer juste apres usage) : verifier isolement le calcul
-- de v_attendu introduit dans 20260724000169 (priorite a affectations.heures sur
-- l'horaire generique), sans passer par le garde-fou d'authentification de
-- cloturer_session_pointage (peut_pointer_pour_employe echoue sans session utilisateur
-- reelle, meme avec la cle service).
create or replace function public.debug_v_attendu(p_session_id uuid)
returns table(v_affectation uuid, v_heures_affectation numeric, v_attendu_generique numeric, v_attendu_final numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_session public.sessions_pointage; v_aff uuid; v_ha numeric; v_gen numeric;
begin
  select * into v_session from public.sessions_pointage where id=p_session_id;
  select a.id,a.heures into v_aff,v_ha from public.affectations a where a.entreprise_id=v_session.entreprise_id and a.employe_id=v_session.employe_id and a.chantier_id=v_session.chantier_id and a.date=(v_session.arrivee_at at time zone 'Europe/Paris')::date and a.type_activite='chantier' order by a.created_at limit 1;
  select coalesce((e.horaires_journaliers->>extract(isodow from (v_session.arrivee_at at time zone 'Europe/Paris'))::integer::text)::numeric,0) into v_gen from public.entreprises e where e.id=v_session.entreprise_id;
  return query select v_aff, v_ha, v_gen, coalesce(v_ha, v_gen, 0);
end;$$;
revoke all on function public.debug_v_attendu(uuid) from public,anon,authenticated;
grant execute on function public.debug_v_attendu(uuid) to service_role;
