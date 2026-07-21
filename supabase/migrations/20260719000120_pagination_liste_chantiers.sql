-- Performance : pagination et filtrage côté base pour la liste des chantiers.
--
-- ⚠️ Table sensible : la RLS de chantiers n'est PAS un simple a_permission(...)
-- mais peut_consulter_chantier(entreprise_id, id) — un poste en
-- 'voir_chantiers_assignes' (sans 'acces_chantiers') ne voit que les
-- chantiers où son équipe est active aujourd'hui. Cette fonction étant
-- SECURITY DEFINER (donc hors RLS), le filtre est réappliqué explicitement
-- ligne par ligne pour ne jamais montrer plus que l'original.

create or replace function public.chantiers_liste_paginee(
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
  v_lignes jsonb;
begin
  if not (
    public.a_permission(p_entreprise_id, 'acces_chantiers')
    or public.a_permission(p_entreprise_id, 'gerer_chantiers')
    or public.a_permission(p_entreprise_id, 'voir_chantiers_assignes')
  ) then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sub.id, 'reference_interne', sub.reference_interne, 'nom', sub.nom,
           'ville', sub.ville, 'statut', sub.statut,
           'client_nom', sub.client_nom, 'client_prenom', sub.client_prenom, 'client_societe', sub.client_societe
         ) order by sub.created_at desc), '[]'::jsonb),
         coalesce(max(sub.total_count), 0)
    into v_lignes, v_total
  from (
    select c.id, c.reference_interne, c.nom, c.ville, c.statut, c.created_at,
           cl.nom as client_nom, cl.prenom as client_prenom, cl.societe as client_societe,
           count(*) over () as total_count
    from public.chantiers c
    left join public.clients cl on cl.id = c.client_id
    where c.entreprise_id = p_entreprise_id
      and public.peut_consulter_chantier(p_entreprise_id, c.id)
      and (v_statut is null or c.statut = v_statut)
      and (
        v_recherche is null
        or c.reference_interne ilike '%' || v_recherche || '%'
        or c.nom ilike '%' || v_recherche || '%'
        or c.ville ilike '%' || v_recherche || '%'
        or cl.nom ilike '%' || v_recherche || '%'
        or cl.prenom ilike '%' || v_recherche || '%'
        or cl.societe ilike '%' || v_recherche || '%'
      )
    order by c.created_at desc
    limit v_taille offset v_offset
  ) sub;

  return jsonb_build_object(
    'lignes', v_lignes, 'total', v_total,
    'page', v_page, 'taille', v_taille, 'pages', greatest(1, ceil(v_total::numeric / v_taille))
  );
end;
$$;

revoke all on function public.chantiers_liste_paginee(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.chantiers_liste_paginee(uuid, text, text, integer, integer) to authenticated;

create index if not exists chantiers_entreprise_created_idx on public.chantiers(entreprise_id, created_at desc);

notify pgrst, 'reload schema';
