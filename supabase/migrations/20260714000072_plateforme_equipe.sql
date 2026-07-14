-- Équipe plateforme : plusieurs comptes du personnel LIRIA pouvant assister toutes les entreprises.
-- Pour l'instant : accès total (chaque membre de plateforme_admins voit tout l'espace plateforme).
-- Les niveaux d'accès différenciés seront ajoutés plus tard (colonne role prévue ci-dessous).

-- Rôle du membre plateforme (préparation des niveaux d'accès futurs ; 'total' = tout pour l'instant).
alter table public.plateforme_admins
  add column if not exists role text not null default 'total'
    check (role in ('total', 'support', 'facturation', 'lecture')),
  add column if not exists nom text,
  add column if not exists ajoute_par text;

-- Liste des membres de l'équipe plateforme (réservé à l'équipe plateforme).
create or replace function public.plateforme_lister_admins()
returns table (email text, role text, nom text, ajoute_par text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select email, role, nom, ajoute_par, created_at
  from public.plateforme_admins
  where public.est_plateforme_admin()
  order by created_at;
$$;

-- Ajoute un membre à l'équipe plateforme. Le compte de connexion (auth) est créé séparément
-- (Supabase Auth) ; ici on autorise l'email à accéder à l'espace plateforme.
create or replace function public.plateforme_ajouter_admin(
  p_email text, p_nom text default null, p_role text default 'total'
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Email invalide'; end if;
  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;
  insert into public.plateforme_admins (email, role, nom, ajoute_par)
  values (v_email, p_role, nullif(trim(coalesce(p_nom,'')),''), auth.email())
  on conflict (email) do update
    set role = excluded.role,
        nom = coalesce(excluded.nom, public.plateforme_admins.nom);
end;
$$;

-- Retire un membre de l'équipe plateforme. Interdit de se retirer soi-même ou le dernier membre.
create or replace function public.plateforme_retirer_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  if v_email = lower(coalesce(auth.email(),'')) then raise exception 'Vous ne pouvez pas retirer votre propre compte'; end if;
  if (select count(*) from public.plateforme_admins) <= 1 then raise exception 'Impossible de retirer le dernier membre de la plateforme'; end if;
  delete from public.plateforme_admins where email = v_email;
end;
$$;

revoke all on function public.plateforme_lister_admins() from public, anon;
revoke all on function public.plateforme_ajouter_admin(text, text, text) from public, anon;
revoke all on function public.plateforme_retirer_admin(text) from public, anon;
grant execute on function public.plateforme_lister_admins() to authenticated;
grant execute on function public.plateforme_ajouter_admin(text, text, text) to authenticated;
grant execute on function public.plateforme_retirer_admin(text) to authenticated;
