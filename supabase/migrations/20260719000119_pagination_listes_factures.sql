-- Performance : pagination et filtrage côté base pour la liste des factures
-- (clients et fournisseurs), même défaut et même correctif que pour /devis.

-- ─────────────────────────────────────────────────────────────
-- Factures clients
-- ─────────────────────────────────────────────────────────────
create or replace function public.factures_liste_paginee(
  p_entreprise_id uuid,
  p_recherche text default '',
  p_statut text default '',
  p_page integer default 1,
  p_taille integer default 25
)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_recherche text := nullif(btrim(p_recherche), '');
  v_statut text := nullif(btrim(p_statut), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 200);
  v_offset integer := (v_page - 1) * v_taille;
  v_total integer;
  v_montant_ttc numeric;
  v_montant_paye numeric;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_factures') then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sub.id, 'numero', sub.numero, 'statut', sub.statut,
           'date_emission', sub.date_emission, 'date_echeance', sub.date_echeance,
           'montant_ttc', sub.montant_ttc, 'montant_paye', sub.montant_paye,
           'client_nom', sub.client_nom, 'client_prenom', sub.client_prenom, 'client_societe', sub.client_societe
         ) order by sub.created_at desc), '[]'::jsonb),
         coalesce(max(sub.total_count), 0),
         coalesce(max(sub.montant_ttc_total), 0),
         coalesce(max(sub.montant_paye_total), 0)
    into v_lignes, v_total, v_montant_ttc, v_montant_paye
  from (
    select f.id, f.numero, f.statut, f.date_emission, f.date_echeance, f.montant_ttc, f.montant_paye, f.created_at,
           c.nom as client_nom, c.prenom as client_prenom, c.societe as client_societe,
           count(*) over () as total_count,
           sum(f.montant_ttc) over () as montant_ttc_total,
           sum(f.montant_paye) over () as montant_paye_total
    from public.factures f
    left join public.clients c on c.id = f.client_id
    where f.entreprise_id = p_entreprise_id
      and (v_statut is null or f.statut = v_statut)
      and (
        v_recherche is null
        or f.numero ilike '%' || v_recherche || '%'
        or c.nom ilike '%' || v_recherche || '%'
        or c.prenom ilike '%' || v_recherche || '%'
        or c.societe ilike '%' || v_recherche || '%'
      )
    order by f.created_at desc
    limit v_taille offset v_offset
  ) sub;

  return jsonb_build_object(
    'lignes', v_lignes, 'total', v_total,
    'montant_ttc', v_montant_ttc, 'montant_paye', v_montant_paye,
    'page', v_page, 'taille', v_taille, 'pages', greatest(1, ceil(v_total::numeric / v_taille))
  );
end;
$$;

revoke all on function public.factures_liste_paginee(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.factures_liste_paginee(uuid, text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Factures fournisseurs (dépenses)
-- ─────────────────────────────────────────────────────────────
create or replace function public.depenses_fournisseurs_liste_paginee(
  p_entreprise_id uuid,
  p_recherche text default '',
  p_statut text default '',
  p_page integer default 1,
  p_taille integer default 25
)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_recherche text := nullif(btrim(p_recherche), '');
  v_statut text := nullif(btrim(p_statut), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 200);
  v_offset integer := (v_page - 1) * v_taille;
  v_total integer;
  v_montant_ttc numeric;
  v_montant_regle numeric;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_achats') then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sub.id, 'numero_piece', sub.numero_piece, 'categorie', sub.categorie,
           'date_piece', sub.date_piece, 'date_echeance', sub.date_echeance, 'statut', sub.statut,
           'montant_ttc', sub.montant_ttc, 'montant_regle', sub.montant_regle,
           'fournisseur_nom', sub.fournisseur_nom, 'chantier_id', sub.chantier_id, 'chantier_nom', sub.chantier_nom
         ) order by sub.date_piece desc), '[]'::jsonb),
         coalesce(max(sub.total_count), 0),
         -- Montant total hors pièces annulées, réglé sur l'ensemble filtré : reproduit exactement
         -- la logique précédente (liste.filter(statut≠annulee) pour le total, liste complète pour le réglé).
         coalesce(max(sub.montant_ttc_total), 0),
         coalesce(max(sub.montant_regle_total), 0)
    into v_lignes, v_total, v_montant_ttc, v_montant_regle
  from (
    select d.id, d.numero_piece, d.categorie, d.date_piece, d.date_echeance, d.statut,
           d.montant_ttc, d.montant_regle, d.chantier_id,
           f.nom as fournisseur_nom, ch.nom as chantier_nom,
           count(*) over () as total_count,
           sum(case when d.statut <> 'annulee' then d.montant_ttc else 0 end) over () as montant_ttc_total,
           sum(d.montant_regle) over () as montant_regle_total
    from public.depenses_fournisseurs d
    left join public.fournisseurs f on f.id = d.fournisseur_id
    left join public.chantiers ch on ch.id = d.chantier_id
    where d.entreprise_id = p_entreprise_id
      and (v_statut is null or d.statut = v_statut)
      and (
        v_recherche is null
        or d.numero_piece ilike '%' || v_recherche || '%'
        or f.nom ilike '%' || v_recherche || '%'
        or ch.nom ilike '%' || v_recherche || '%'
      )
    order by d.date_piece desc
    limit v_taille offset v_offset
  ) sub;

  return jsonb_build_object(
    'lignes', v_lignes, 'total', v_total,
    'montant_ttc', v_montant_ttc, 'montant_regle', v_montant_regle,
    'page', v_page, 'taille', v_taille, 'pages', greatest(1, ceil(v_total::numeric / v_taille))
  );
end;
$$;

revoke all on function public.depenses_fournisseurs_liste_paginee(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.depenses_fournisseurs_liste_paginee(uuid, text, text, integer, integer) to authenticated;

create index if not exists factures_entreprise_created_idx on public.factures(entreprise_id, created_at desc);
create index if not exists depenses_fournisseurs_entreprise_date_idx on public.depenses_fournisseurs(entreprise_id, date_piece desc);

notify pgrst, 'reload schema';
