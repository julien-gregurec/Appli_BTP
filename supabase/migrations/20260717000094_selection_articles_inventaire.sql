-- Permet de créer un inventaire sur une sélection explicite d'articles du dépôt.
create or replace function public.creer_inventaire_stock_selection(
  p_entreprise_id uuid,
  p_article_ids uuid[],
  p_zone_id uuid default null,
  p_commentaire text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Réutilise le contrôle de zone et la permission gerer_stock existants.
  v_id := public.creer_inventaire_stock(p_entreprise_id, p_zone_id, p_commentaire);

  delete from public.lignes_inventaire
  where inventaire_id = v_id
    and not (article_id = any(coalesce(p_article_ids, '{}'::uuid[])));

  if not exists (select 1 from public.lignes_inventaire where inventaire_id = v_id) then
    raise exception 'Selectionnez au moins un article valide dans la zone choisie';
  end if;
  return v_id;
end;
$$;

revoke all on function public.creer_inventaire_stock_selection(uuid, uuid[], uuid, text) from public;
grant execute on function public.creer_inventaire_stock_selection(uuid, uuid[], uuid, text) to anon, authenticated;
notify pgrst, 'reload schema';
