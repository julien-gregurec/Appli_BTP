-- Bootstrap d'entreprise en une seule opération atomique et SECURITY DEFINER.
-- Motivation : la création d'entreprise enchaîne 5 écritures (entreprise, poste, membre,
-- permissions, entreprise active) qui, en RLS stricte, se heurtent à un problème d'amorçage
-- (l'utilisateur n'est pas encore membre au moment où il doit relire l'entreprise créée).
-- Regrouper le tout dans une fonction SECURITY DEFINER rend l'opération atomique et contourne
-- proprement la RLS le temps du bootstrap, sans ouvrir de policy trop permissive.

-- S'assurer que la table de référence des droits est lisible par les utilisateurs connectés
-- (au cas où "Run and enable RLS" aurait activé la RLS sans policy sur cette table de référence).
alter table public.permissions_disponibles enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permissions_disponibles'
      and policyname = 'lecture des droits par les connectés'
  ) then
    create policy "lecture des droits par les connectés" on public.permissions_disponibles
      for select to authenticated using (true);
  end if;
end $$;

create or replace function public.creer_entreprise_bootstrap(
  p_nom text,
  p_siret text default null,
  p_adresse text default null,
  p_code_postal text default null,
  p_ville text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entreprise_id uuid;
  v_poste_id uuid;
begin
  if v_uid is null then
    raise exception 'Aucun utilisateur authentifié';
  end if;

  insert into public.entreprises (nom, siret, adresse, code_postal, ville)
  values (p_nom, nullif(p_siret, ''), nullif(p_adresse, ''), nullif(p_code_postal, ''), nullif(p_ville, ''))
  returning id into v_entreprise_id;

  insert into public.postes (entreprise_id, nom)
  values (v_entreprise_id, 'Admin/Gérant')
  returning id into v_poste_id;

  insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
  values (v_uid, v_entreprise_id, v_poste_id, 'actif');

  -- Admin/Gérant reçoit tous les droits existants activés.
  insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
  select v_entreprise_id, v_poste_id, cle, true
  from public.permissions_disponibles;

  update public.utilisateurs
  set entreprise_active_id = v_entreprise_id
  where id = v_uid;

  return v_entreprise_id;
end;
$$;

revoke all on function public.creer_entreprise_bootstrap(text, text, text, text, text) from public;
grant execute on function public.creer_entreprise_bootstrap(text, text, text, text, text) to authenticated;
