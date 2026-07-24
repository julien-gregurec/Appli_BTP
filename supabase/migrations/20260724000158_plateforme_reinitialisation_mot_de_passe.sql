-- Permet à l'admin plateforme (Liria) uniquement — pas au gérant d'une entreprise
-- cliente — de déclencher un e-mail de réinitialisation de mot de passe pour un
-- salarié qui n'a plus accès à sa boîte mail ou a perdu son mot de passe.
-- Réutilise le meme flux que l'auto-service (auth.resetPasswordForEmail cote
-- TypeScript) : cette fonction se contente de verifier que l'appelant est bien
-- admin plateforme et que l'e-mail correspond a un compte membre de l'entreprise
-- concernee, puis journalise la demande avant que l'action serveur envoie le lien.

create table public.plateforme_reinitialisations_mot_de_passe(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  email text not null,
  motif text not null,
  demande_par text not null,
  created_at timestamptz not null default now()
);
create index plateforme_reinit_mdp_entreprise_idx on public.plateforme_reinitialisations_mot_de_passe(entreprise_id, created_at desc);
alter table public.plateforme_reinitialisations_mot_de_passe enable row level security;
create policy plateforme_reinit_mdp_lecture on public.plateforme_reinitialisations_mot_de_passe for select to authenticated using(public.est_plateforme_admin());
grant select on public.plateforme_reinitialisations_mot_de_passe to authenticated;

create or replace function public.plateforme_verifier_et_journaliser_reinitialisation(
  p_entreprise_id uuid, p_email text, p_motif text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_utilisateur_id uuid; v_id uuid;
begin
  if not public.est_plateforme_admin() then raise exception 'Accès plateforme requis'; end if;
  if length(btrim(coalesce(p_motif,''))) < 5 then raise exception 'Indiquez un motif d''au moins 5 caractères'; end if;
  select u.id into v_utilisateur_id
  from auth.users au
  join public.utilisateurs u on u.id = au.id
  join public.utilisateurs_entreprises ue on ue.utilisateur_id = u.id and ue.entreprise_id = p_entreprise_id
  where lower(au.email) = lower(btrim(p_email));
  if v_utilisateur_id is null then raise exception 'Aucun compte avec cette adresse dans cette entreprise'; end if;
  insert into public.plateforme_reinitialisations_mot_de_passe(entreprise_id,utilisateur_id,email,motif,demande_par)
  values(p_entreprise_id, v_utilisateur_id, lower(btrim(p_email)), btrim(p_motif), coalesce(auth.email(),'inconnu'))
  returning id into v_id;
  return v_id;
end;$$;
revoke all on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) from public,anon;
grant execute on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
