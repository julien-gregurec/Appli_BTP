-- Performance : pagination et filtrage côté base pour la liste des clients.
-- Même défaut, même correctif que /devis, /factures et /chantiers.
-- RLS de clients = a_permission(entreprise_id,'acces_clients'), vérifié à l'identique.

create or replace function public.clients_liste_paginee(
  p_entreprise_id uuid,
  p_recherche text default '',
  p_type text default '',
  p_statut text default '',
  p_page integer default 1,
  p_taille integer default 25
)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_recherche text := nullif(btrim(p_recherche), '');
  v_type text := nullif(btrim(p_type), '');
  v_statut text := nullif(btrim(p_statut), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 200);
  v_offset integer := (v_page - 1) * v_taille;
  v_total integer;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_clients') then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sub.id, 'reference_interne', sub.reference_interne, 'type', sub.type,
           'nom', sub.nom, 'prenom', sub.prenom, 'societe', sub.societe,
           'ville', sub.ville, 'statut', sub.statut
         ) order by sub.created_at desc), '[]'::jsonb),
         coalesce(max(sub.total_count), 0)
    into v_lignes, v_total
  from (
    select c.id, c.reference_interne, c.type, c.nom, c.prenom, c.societe, c.ville, c.statut, c.created_at,
           count(*) over () as total_count
    from public.clients c
    where c.entreprise_id = p_entreprise_id
      and (v_type is null or c.type = v_type)
      and (v_statut is null or c.statut = v_statut)
      and (
        v_recherche is null
        or c.reference_interne ilike '%' || v_recherche || '%'
        or c.nom ilike '%' || v_recherche || '%'
        or c.prenom ilike '%' || v_recherche || '%'
        or c.societe ilike '%' || v_recherche || '%'
        or c.ville ilike '%' || v_recherche || '%'
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

revoke all on function public.clients_liste_paginee(uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.clients_liste_paginee(uuid, text, text, text, integer, integer) to authenticated;

create index if not exists clients_entreprise_created_idx on public.clients(entreprise_id, created_at desc);

notify pgrst, 'reload schema';
