-- La borne dépôt reste connectée avec un compte partagé, mais chaque mouvement
-- exige le numéro d'inscription et le mot de passe stock définis par le salarié.

-- Les anciens PIN créés par un administrateur ne sont pas conservés : chaque
-- salarié repart d'un secret qu'il est seul à choisir depuis son compte.
update public.employes
set code_stock_hash = null,
    code_stock_active = false,
    code_stock_modifie_at = now()
where code_stock_hash is not null or code_stock_active;

create or replace function public.definir_mot_de_passe_stock_personnel(
  p_entreprise_id uuid,
  p_mot_de_passe text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_employe_id uuid;
begin
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Accès refusé';
  end if;
  if length(coalesce(p_mot_de_passe, '')) < 8 or length(p_mot_de_passe) > 72 then
    raise exception 'Le mot de passe stock doit contenir entre 8 et 72 caractères';
  end if;
  if p_mot_de_passe !~ '[[:alpha:]]' or p_mot_de_passe !~ '[[:digit:]]' then
    raise exception 'Le mot de passe stock doit contenir au moins une lettre et un chiffre';
  end if;

  select id into v_employe_id
  from public.employes
  where entreprise_id = p_entreprise_id
    and utilisateur_id = auth.uid()
    and statut not in ('sorti', 'suspendu')
  limit 1;

  if v_employe_id is null then
    raise exception 'Aucune fiche employé active n''est liée à ce compte';
  end if;

  update public.employes
  set code_stock_hash = crypt(p_mot_de_passe, gen_salt('bf', 11)),
      code_stock_active = true,
      code_stock_modifie_at = now(),
      updated_at = now()
  where id = v_employe_id;
end;
$$;

create or replace function public.reinitialiser_mot_de_passe_stock_employe(
  p_entreprise_id uuid,
  p_employe_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    public.a_permission(p_entreprise_id, 'gerer_employes')
    or public.a_permission(p_entreprise_id, 'gerer_stock')
  ) then
    raise exception 'Accès refusé';
  end if;

  update public.employes
  set code_stock_hash = null,
      code_stock_active = false,
      code_stock_modifie_at = now(),
      updated_at = now()
  where id = p_employe_id and entreprise_id = p_entreprise_id;

  if not found then raise exception 'Employé introuvable'; end if;
end;
$$;

create or replace function public.enregistrer_mouvement_stock_borne_v2(
  p_entreprise_id uuid,
  p_numero_employe text,
  p_mot_de_passe text,
  p_code_article text,
  p_type text,
  p_quantite numeric,
  p_chantier_id uuid default null,
  p_code_chantier text default null,
  p_teinte_id uuid default null,
  p_motif text default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_employe public.employes;
  v_article public.articles_stock;
  v_chantier uuid := p_chantier_id;
  v_id uuid;
  v_echecs integer;
begin
  if v_uid is null
    or not public.est_membre_actif(p_entreprise_id)
    or not public.a_permission(p_entreprise_id, 'utiliser_borne_stock') then
    raise exception 'Accès refusé';
  end if;
  if p_type not in ('entree', 'sortie') or p_quantite is null or p_quantite <= 0 then
    raise exception 'Mouvement invalide';
  end if;

  select count(*) into v_echecs
  from public.tentatives_borne_stock
  where entreprise_id = p_entreprise_id
    and utilisateur_id = v_uid
    and not reussie
    and created_at > now() - interval '10 minutes';
  if v_echecs >= 8 then
    raise exception 'Trop de tentatives. Réessayez dans quelques minutes.';
  end if;

  select * into v_employe
  from public.employes
  where entreprise_id = p_entreprise_id
    and upper(numero_inscription) = upper(btrim(coalesce(p_numero_employe, '')))
    and code_stock_active
    and code_stock_hash is not null
    and crypt(coalesce(p_mot_de_passe, ''), code_stock_hash) = code_stock_hash
    and statut not in ('sorti', 'suspendu')
  limit 1;

  if v_employe.id is null then
    insert into public.tentatives_borne_stock(entreprise_id, utilisateur_id, reussie, motif)
    values(p_entreprise_id, v_uid, false, 'identifiants_personnels_invalides');
    raise exception 'Numéro employé ou mot de passe incorrect';
  end if;

  select a.* into v_article
  from public.articles_stock a
  left join public.codes_identification c
    on c.entreprise_id = a.entreprise_id
   and c.type_ressource = 'article'
   and c.ressource_id = a.id
   and c.actif
  where a.entreprise_id = p_entreprise_id
    and a.actif
    and (
      upper(a.reference) = upper(btrim(p_code_article))
      or upper(coalesce(a.code_barres, '')) = upper(btrim(p_code_article))
      or upper(c.code) = upper(btrim(p_code_article))
    )
  limit 1;
  if v_article.id is null then raise exception 'Article inconnu ou inactif'; end if;

  if nullif(btrim(coalesce(p_code_chantier, '')), '') is not null then
    select ressource_id into v_chantier
    from public.codes_identification
    where entreprise_id = p_entreprise_id
      and type_ressource = 'chantier'
      and actif
      and upper(code) = upper(btrim(p_code_chantier));
  end if;
  if p_type = 'sortie' and v_chantier is null then
    raise exception 'Le chantier est obligatoire pour une sortie';
  end if;
  if v_chantier is not null and not exists (
    select 1 from public.chantiers where id = v_chantier and entreprise_id = p_entreprise_id
  ) then
    raise exception 'Chantier invalide';
  end if;

  insert into public.mouvements_stock(
    entreprise_id, article_id, chantier_id, teinte_id, type, quantite, date,
    motif, employe_id, cree_par_utilisateur_id, saisi_via_borne, code_scan_utilise
  ) values (
    p_entreprise_id, v_article.id, v_chantier, p_teinte_id, p_type, p_quantite,
    current_date, nullif(btrim(p_motif), ''), v_employe.id, v_uid, true,
    upper(btrim(p_code_article))
  ) returning id into v_id;

  insert into public.tentatives_borne_stock(entreprise_id, utilisateur_id, reussie, motif)
  values(p_entreprise_id, v_uid, true, 'mouvement_stock');
  return v_id;
end;
$$;

-- L'ancien parcours, où l'administrateur créait un simple code PIN, est fermé.
revoke all on function public.definir_code_stock_employe(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.enregistrer_mouvement_stock_borne(uuid, text, text, text, numeric, uuid, text, uuid, text)
  from public, anon, authenticated;

revoke all on function public.definir_mot_de_passe_stock_personnel(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reinitialiser_mot_de_passe_stock_employe(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.enregistrer_mouvement_stock_borne_v2(uuid, text, text, text, text, numeric, uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.definir_mot_de_passe_stock_personnel(uuid, text) to authenticated;
grant execute on function public.reinitialiser_mot_de_passe_stock_employe(uuid, uuid) to authenticated;
grant execute on function public.enregistrer_mouvement_stock_borne_v2(uuid, text, text, text, text, numeric, uuid, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
