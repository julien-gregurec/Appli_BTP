-- Correctif self-service : aucune trace de qui a accepté quelle version des
-- CGU/CGV, ni quand, n'existait avant cette migration (audit commercialisation
-- self-service V2, §7). Le formulaire /signup ne proposait ni case à cocher
-- ni lien vers ces documents. On ajoute une capture minimale mais suffisante
-- (version + horodatage serveur) sur public.utilisateurs, alimentée par le
-- trigger existant handle_new_user à partir des métadonnées passées par
-- signupAction (src/app/actions/auth.ts) — même mécanisme déjà utilisé pour
-- nom/prenom, donc pas de nouveau chemin d'écriture à sécuriser.
-- L'horodatage est fixé côté serveur (now()), jamais transmis par le client,
-- pour ne pas pouvoir être falsifié.

alter table public.utilisateurs
  add column if not exists cgu_version_acceptee text,
  add column if not exists cgv_version_acceptee text,
  add column if not exists conditions_acceptees_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.utilisateurs (
    id, nom, prenom, cgu_version_acceptee, cgv_version_acceptee, conditions_acceptees_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    new.raw_user_meta_data ->> 'cgu_version_acceptee',
    new.raw_user_meta_data ->> 'cgv_version_acceptee',
    case
      when new.raw_user_meta_data ->> 'cgu_version_acceptee' is not null
        or new.raw_user_meta_data ->> 'cgv_version_acceptee' is not null
      then now()
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
