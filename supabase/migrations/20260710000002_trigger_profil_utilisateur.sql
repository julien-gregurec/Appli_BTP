-- Création automatique du profil utilisateur à l'inscription.
-- Pattern standard Supabase : un trigger SECURITY DEFINER sur auth.users insère la ligne
-- dans public.utilisateurs, en contournant la RLS. Nécessaire car au moment du signUp
-- (surtout si la confirmation d'email est active) il n'y a pas encore de session, donc
-- auth.uid() est null et une insertion applicative échouerait la policy "id = auth.uid()".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.utilisateurs (id, nom, prenom)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'prenom', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
