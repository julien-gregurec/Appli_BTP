-- Étend la sortie multi-articles aux trois destinations métier déjà prises en
-- charge par le scanner individuel : chantier, véhicule ou outillage.
create or replace function public.enregistrer_sortie_lot_v2(
  p_entreprise_id uuid,
  p_lignes jsonb,
  p_type_destination text default null,
  p_destination_id uuid default null,
  p_motif text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ligne jsonb;
  v_article uuid;
  v_quantite numeric;
  v_sorties integer := 0;
  v_chantier uuid;
  v_vehicule uuid;
  v_outil uuid;
begin
  if not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'effectuer_sortie_stock') then
    raise exception 'Accès refusé';
  end if;

  if p_type_destination is null and p_destination_id is not null then
    raise exception 'Indiquez le type de destination';
  end if;
  if p_type_destination is not null and p_destination_id is null then
    raise exception 'Choisissez la destination de la sortie';
  end if;
  if p_type_destination is not null
     and p_type_destination not in ('chantier','vehicule','outil') then
    raise exception 'Type de destination invalide';
  end if;

  if p_type_destination = 'chantier' then
    select id into v_chantier from public.chantiers
      where id = p_destination_id and entreprise_id = p_entreprise_id
        and statut not in ('archive','annule');
    if v_chantier is null then raise exception 'Chantier indisponible'; end if;
  elsif p_type_destination = 'vehicule' then
    select id into v_vehicule from public.vehicules
      where id = p_destination_id and entreprise_id = p_entreprise_id
        and statut <> 'vendu';
    if v_vehicule is null then raise exception 'Véhicule indisponible'; end if;
  elsif p_type_destination = 'outil' then
    select id into v_outil from public.outils
      where id = p_destination_id and entreprise_id = p_entreprise_id
        and statut not in ('hors_service','perdu','rebut');
    if v_outil is null then raise exception 'Outil indisponible'; end if;
  end if;

  for v_ligne in
    select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    v_article := (v_ligne->>'article_id')::uuid;
    v_quantite := (v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite <= 0 then continue; end if;
    if not exists (
      select 1 from public.articles_stock
      where id = v_article and entreprise_id = p_entreprise_id and actif
    ) then
      raise exception 'Article inconnu ou inactif dans cette entreprise';
    end if;

    insert into public.mouvements_stock (
      entreprise_id, article_id, chantier_id, vehicule_id, outil_id,
      type, quantite, motif
    ) values (
      p_entreprise_id, v_article, v_chantier, v_vehicule, v_outil,
      'sortie', v_quantite,
      coalesce(nullif(btrim(p_motif), ''), 'Sortie groupée au dépôt')
    );
    v_sorties := v_sorties + 1;
  end loop;

  return jsonb_build_object(
    'sorties', v_sorties,
    'type_destination', p_type_destination,
    'destination_id', p_destination_id
  );
end;
$$;

revoke all on function public.enregistrer_sortie_lot_v2(uuid,jsonb,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.enregistrer_sortie_lot_v2(uuid,jsonb,text,uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
