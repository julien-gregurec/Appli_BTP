-- Diagnostic temporaire (a supprimer juste apres usage) : verifier que la requete
-- de correspondance email/entreprise de plateforme_verifier_et_journaliser_reinitialisation
-- resout bien un utilisateur reel, sans passer par le garde-fou est_plateforme_admin.
create or replace function public.debug_verifier_lookup_reinit(p_entreprise_id uuid, p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select u.id
  from auth.users au
  join public.utilisateurs u on u.id = au.id
  join public.utilisateurs_entreprises ue on ue.utilisateur_id = u.id and ue.entreprise_id = p_entreprise_id
  where lower(au.email) = lower(btrim(p_email));
$$;
revoke all on function public.debug_verifier_lookup_reinit(uuid,text) from public,anon,authenticated;
grant execute on function public.debug_verifier_lookup_reinit(uuid,text) to service_role;

create or replace function public.debug_email_utilisateur(p_utilisateur_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select email from auth.users where id = p_utilisateur_id;
$$;
revoke all on function public.debug_email_utilisateur(uuid) from public,anon,authenticated;
grant execute on function public.debug_email_utilisateur(uuid) to service_role;
