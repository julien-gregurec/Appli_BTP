-- CORRECTIF CRITIQUE — le patron d'une nouvelle entreprise était enfermé en mode dépôt.
--
-- `creer_entreprise_bootstrap` accordait `autorise = true` à TOUS les droits du catalogue
-- pour le poste Admin/Gérant. La migration 76 a ensuite introduit `mode_compte_depot`,
-- un droit d'usage réservé au poste partagé « Compte dépôt » : il verrouille l'interface
-- sur Stock/Borne/Dépôt et redirige toute la navigation vers la borne.
-- Conséquence : chaque entreprise créée depuis l'inscription voyait son dirigeant
-- privé de tous ses modules. Ce droit ne doit jamais être distribué automatiquement.

-- 1) Le bootstrap n'accorde plus `mode_compte_depot`.
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

  -- Admin/Gérant reçoit tous les droits, sauf les modes d'usage réservés
  -- à un poste dédié (`mode_compte_depot` verrouille l'interface sur la borne).
  insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
  select v_entreprise_id, v_poste_id, cle, cle <> 'mode_compte_depot'
  from public.permissions_disponibles;

  update public.utilisateurs
  set entreprise_active_id = v_entreprise_id
  where id = v_uid;

  return v_entreprise_id;
end;
$$;

revoke all on function public.creer_entreprise_bootstrap(text, text, text, text, text) from public;
grant execute on function public.creer_entreprise_bootstrap(text, text, text, text, text) to authenticated;

-- 2) Réparation : aucun poste autre que « Compte dépôt » ne conserve ce mode.
update public.permissions_poste pp
set autorise = false
where pp.cle_permission = 'mode_compte_depot'
  and pp.autorise
  and exists (
    select 1 from public.postes p
    where p.id = pp.poste_id and lower(p.nom) <> 'compte dépôt'
  );
