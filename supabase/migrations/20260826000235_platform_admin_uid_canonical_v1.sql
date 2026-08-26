-- Convergence canonique admin plateforme : verse dans le schéma versionné le modèle
-- utilisateur_id + actif déjà présent (hors migration, jamais commité) sur Preview.
-- Décision produit : les droits admin plateforme reposent sur
--   auth.uid() -> plateforme_admins.utilisateur_id -> actif
-- L'email reste une donnée d'identité/audit/bootstrap, plus la racine d'autorisation.
-- Volontairement hors scope de ce lot : la clé primaire (email), role, nom, ajoute_par,
-- created_at ne sont pas retouchés — refonte de clé primaire jugée inutilement risquée
-- avant commercialisation, à reconsidérer plus tard si elle apporte réellement quelque chose.

alter table public.plateforme_admins
  add column if not exists utilisateur_id uuid references auth.users(id) on delete restrict,
  add column if not exists actif boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Rétro-remplissage : correspondance exacte email (insensible à la casse) uniquement.
-- Jamais de création d'utilisateur Auth, jamais de correspondance approximative, jamais
-- d'écrasement d'un utilisateur_id déjà renseigné.
update public.plateforme_admins pa
set utilisateur_id = u.id
from auth.users u
where lower(u.email) = lower(pa.email)
  and pa.utilisateur_id is null;

-- Garde-fou explicite : aucune ligne admin ne doit rester sans utilisateur Auth correspondant
-- avant de verrouiller la colonne. Échec net de la migration plutôt qu'un admin fantôme.
do $$
declare v_manquants text;
begin
  select string_agg(email, ', ') into v_manquants
  from public.plateforme_admins where utilisateur_id is null;
  if v_manquants is not null then
    raise exception 'Convergence admin plateforme impossible : aucun utilisateur Auth trouvé pour %', v_manquants;
  end if;
end $$;

-- Garde-fou explicite : aucun utilisateur_id ne doit être partagé par deux lignes admin
-- avant de poser la contrainte d'unicité.
do $$
declare v_doublons text;
begin
  select string_agg(utilisateur_id::text, ', ') into v_doublons
  from (
    select utilisateur_id from public.plateforme_admins
    group by utilisateur_id having count(*) > 1
  ) d;
  if v_doublons is not null then
    raise exception 'Convergence admin plateforme impossible : utilisateur_id en double : %', v_doublons;
  end if;
end $$;

alter table public.plateforme_admins
  alter column utilisateur_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plateforme_admins_utilisateur_id_key') then
    alter table public.plateforme_admins
      add constraint plateforme_admins_utilisateur_id_key unique (utilisateur_id);
  end if;
end $$;

-- Fonctions canoniques : auth.uid() -> plateforme_admins.utilisateur_id -> actif -> role/bool.
-- Source unique de vérité, aucune fonction concurrente (est_administrateur_plateforme_global()
-- notamment, jamais introduite dans ce repo, ne doit pas le devenir).
create or replace function public.plateforme_role_courant()
returns text
language sql security definer stable set search_path = public as $$
  select role from public.plateforme_admins
  where utilisateur_id = auth.uid() and actif
  limit 1;
$$;

create or replace function public.est_plateforme_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(
    exists(select 1 from public.plateforme_admins where utilisateur_id = auth.uid() and actif),
    false
  );
$$;

revoke all on function public.plateforme_role_courant() from public, anon;
revoke all on function public.est_plateforme_admin() from public, anon;
grant execute on function public.plateforme_role_courant() to authenticated;
grant execute on function public.est_plateforme_admin() to authenticated;

notify pgrst, 'reload schema';
