-- Le pointage n'est plus un droit obligatoire. L'administrateur choisit les
-- postes qui accèdent au module et sépare saisie personnelle, lecture d'équipe,
-- gestion et validation.

update public.modeles_roles_predefinis
set permissions = array(
  select permission
  from unnest(permissions) as permission
  where permission not in (
    'acces_pointage',
    'saisir_son_pointage',
    'voir_pointages_equipe',
    'gerer_pointage',
    'valider_pointages'
  )
), updated_at = now()
where cle in ('administration', 'conducteur_travaux');

-- Met à niveau les rôles standards déjà installés. Un administrateur peut
-- réactiver ensuite tout ou partie de ces cinq droits depuis la matrice d'accès.
update public.permissions_poste pp
set autorise = false
from public.postes p
where p.id = pp.poste_id
  and p.entreprise_id = pp.entreprise_id
  and pp.cle_permission in (
    'acces_pointage',
    'saisir_son_pointage',
    'voir_pointages_equipe',
    'gerer_pointage',
    'valider_pointages'
  )
  and lower(btrim(p.nom)) in ('administration', 'conducteur de travaux');

-- Le socle commun reste utile pour le planning, les demandes personnelles et
-- la messagerie, mais n'impose plus le pointage à chaque compte.
create or replace function public.appliquer_modele_role_predefini_interne(
  p_entreprise_id uuid,p_modele_cle text,p_reinitialiser boolean default false
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_modele public.modeles_roles_predefinis%rowtype;
  v_poste_id uuid;
  v_nouveau boolean:=false;
  v_socle text[]:=array['acces_planning','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','acces_messagerie'];
begin
  select * into v_modele from public.modeles_roles_predefinis where cle=p_modele_cle;
  if not found then raise exception 'Modèle de rôle inconnu';end if;
  select id into v_poste_id from public.postes
    where entreprise_id=p_entreprise_id and lower(btrim(nom))=lower(v_modele.nom) limit 1;
  if v_poste_id is null then
    insert into public.postes(entreprise_id,nom) values(p_entreprise_id,v_modele.nom) returning id into v_poste_id;
    v_nouveau:=true;
  end if;
  if v_nouveau or p_reinitialiser then
    insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
    select p_entreprise_id,v_poste_id,d.cle,
      d.cle<>'mode_compte_depot' and (v_modele.tous_les_droits or d.cle=any(v_modele.permissions) or d.cle=any(v_socle))
    from public.permissions_disponibles d
    on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
  end if;
  return v_poste_id;
end;$$;
revoke all on function public.appliquer_modele_role_predefini_interne(uuid,text,boolean) from public,anon,authenticated;

create or replace function public.reinitialiser_role_predefini(
  p_entreprise_id uuid,p_poste_id uuid,p_modele_cle text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_modele public.modeles_roles_predefinis%rowtype;
  v_socle text[]:=array['acces_planning','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','acces_messagerie'];
begin
  if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
  if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
  select * into v_modele from public.modeles_roles_predefinis where cle=p_modele_cle;
  if not found then raise exception 'Modèle de rôle inconnu';end if;
  insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
  select p_entreprise_id,p_poste_id,d.cle,
    d.cle<>'mode_compte_depot' and (v_modele.tous_les_droits or d.cle=any(v_modele.permissions) or d.cle=any(v_socle))
  from public.permissions_disponibles d
  on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
end;$$;

revoke all on function public.reinitialiser_role_predefini(uuid,uuid,text) from public,anon;
grant execute on function public.reinitialiser_role_predefini(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
