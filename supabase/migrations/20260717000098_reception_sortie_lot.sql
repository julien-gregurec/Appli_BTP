-- Réception et sortie de stock par LOT (plusieurs articles scannés à la suite).
--
-- Réception : on scanne les articles reçus, on ajuste les quantités, et on peut
-- rattacher chaque quantité à une ligne de commande fournisseur en cours. Une
-- même série de scans peut couvrir plusieurs commandes. Le statut de chaque
-- commande touchée est recalculé (reçue partiellement / reçue).
--
-- Sortie : on scanne plusieurs articles qui partent, en une fois, vers un
-- chantier.
--
-- Les mouvements passent par public.mouvements_stock : le trigger existant
-- applique la variation de quantité au stock. On ne réécrit donc pas cette
-- logique, on l'alimente.

-- ─────────────────────────────────────────────────────────────
-- Lignes de commande encore ouvertes, pour proposer un rapprochement au scan.
-- ─────────────────────────────────────────────────────────────
create or replace function public.receptions_lignes_ouvertes(p_entreprise_id uuid)
returns table (
  ligne_id uuid, commande_id uuid, commande_numero text, fournisseur_nom text,
  designation text, unite text, quantite numeric, quantite_recue numeric, reste numeric
)
language sql security definer stable set search_path = public as $$
  select l.id, c.id, c.numero, f.nom, l.designation, l.unite,
         l.quantite, coalesce(l.quantite_recue, 0),
         greatest(0, l.quantite - coalesce(l.quantite_recue, 0))
  from public.lignes_commande l
  join public.commandes_fournisseurs c on c.id = l.commande_id
  left join public.fournisseurs f on f.id = c.fournisseur_id
  where l.entreprise_id = p_entreprise_id
    and public.est_membre_actif(p_entreprise_id)
    and c.statut in ('envoyee', 'confirmee', 'recue_partiel')
    and l.quantite > coalesce(l.quantite_recue, 0)
  order by c.date_commande, c.numero, l.ordre;
$$;
revoke all on function public.receptions_lignes_ouvertes(uuid) from public, anon;
grant execute on function public.receptions_lignes_ouvertes(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Recalcule le statut d'une commande d'après les quantités reçues.
-- ─────────────────────────────────────────────────────────────
create or replace function public.recomputer_statut_commande(p_commande_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_total integer; v_soldees integer; v_entamees integer; v_statut text; v_actuel text;
begin
  select statut into v_actuel from public.commandes_fournisseurs where id = p_commande_id;
  if v_actuel is null or v_actuel in ('brouillon', 'annulee') then return v_actuel; end if;

  select count(*), count(*) filter (where coalesce(quantite_recue,0) >= quantite),
         count(*) filter (where coalesce(quantite_recue,0) > 0)
    into v_total, v_soldees, v_entamees
  from public.lignes_commande where commande_id = p_commande_id;

  v_statut := case
    when v_total > 0 and v_soldees = v_total then 'recue'
    when v_entamees > 0 then 'recue_partiel'
    else v_actuel
  end;
  update public.commandes_fournisseurs set statut = v_statut, updated_at = now()
    where id = p_commande_id and statut <> v_statut;
  return v_statut;
end;
$$;
revoke all on function public.recomputer_statut_commande(uuid) from public, anon;

-- ─────────────────────────────────────────────────────────────
-- Réception par lot : entrées de stock + rattachement aux commandes.
--   p_lignes       = [{"article_id": uuid, "quantite": n}, …]
--   p_attributions = [{"ligne_commande_id": uuid, "quantite": n}, …]  (facultatif)
-- ─────────────────────────────────────────────────────────────
create or replace function public.enregistrer_reception_lot(
  p_entreprise_id uuid, p_lignes jsonb, p_attributions jsonb default '[]'::jsonb, p_motif text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ligne jsonb; v_article uuid; v_quantite numeric;
  v_entrees integer := 0; v_commandes uuid[] := '{}'; v_cmd uuid;
  v_statuts jsonb := '[]'::jsonb;
begin
  if not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'effectuer_entree_stock') then
    raise exception 'Accès refusé';
  end if;

  -- 1) Les entrées de stock.
  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_article := (v_ligne->>'article_id')::uuid;
    v_quantite := (v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite <= 0 then continue; end if;
    if not exists (select 1 from public.articles_stock
                   where id = v_article and entreprise_id = p_entreprise_id) then
      raise exception 'Article inconnu dans cette entreprise';
    end if;
    insert into public.mouvements_stock (entreprise_id, article_id, type, quantite, motif)
    values (p_entreprise_id, v_article, 'entree', v_quantite,
            coalesce(nullif(btrim(p_motif), ''), 'Réception au dépôt'));
    v_entrees := v_entrees + 1;
  end loop;

  -- 2) Le rattachement aux lignes de commande (plusieurs commandes possibles).
  for v_ligne in select * from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb)) loop
    v_quantite := (v_ligne->>'quantite')::numeric;
    if v_quantite is null or v_quantite <= 0 then continue; end if;
    update public.lignes_commande l
      set quantite_recue = least(l.quantite, coalesce(l.quantite_recue, 0) + v_quantite)
      where l.id = (v_ligne->>'ligne_commande_id')::uuid
        and l.entreprise_id = p_entreprise_id
      returning l.commande_id into v_cmd;
    if v_cmd is not null and not (v_cmd = any(v_commandes)) then
      v_commandes := array_append(v_commandes, v_cmd);
    end if;
  end loop;

  -- 3) Recalcul du statut de chaque commande touchée.
  foreach v_cmd in array v_commandes loop
    v_statuts := v_statuts || jsonb_build_object('commande_id', v_cmd,
                   'statut', public.recomputer_statut_commande(v_cmd));
  end loop;

  return jsonb_build_object('entrees', v_entrees, 'commandes', v_statuts);
end;
$$;
revoke all on function public.enregistrer_reception_lot(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.enregistrer_reception_lot(uuid, jsonb, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Sortie par lot : plusieurs articles qui partent, vers un chantier.
--   p_lignes = [{"article_id": uuid, "quantite": n}, …]
-- ─────────────────────────────────────────────────────────────
create or replace function public.enregistrer_sortie_lot(
  p_entreprise_id uuid, p_lignes jsonb, p_chantier_id uuid default null, p_motif text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ligne jsonb; v_article uuid; v_quantite numeric; v_sorties integer := 0;
begin
  if not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'effectuer_sortie_stock') then
    raise exception 'Accès refusé';
  end if;
  if p_chantier_id is not null and not exists (
       select 1 from public.chantiers where id = p_chantier_id and entreprise_id = p_entreprise_id) then
    raise exception 'Chantier inconnu dans cette entreprise';
  end if;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_article := (v_ligne->>'article_id')::uuid;
    v_quantite := (v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite <= 0 then continue; end if;
    if not exists (select 1 from public.articles_stock
                   where id = v_article and entreprise_id = p_entreprise_id) then
      raise exception 'Article inconnu dans cette entreprise';
    end if;
    insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, motif)
    values (p_entreprise_id, v_article, p_chantier_id, 'sortie', v_quantite,
            coalesce(nullif(btrim(p_motif), ''), 'Sortie au dépôt'));
    v_sorties := v_sorties + 1;
  end loop;

  return jsonb_build_object('sorties', v_sorties);
end;
$$;
revoke all on function public.enregistrer_sortie_lot(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.enregistrer_sortie_lot(uuid, jsonb, uuid, text) to authenticated;
