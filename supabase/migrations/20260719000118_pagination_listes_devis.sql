-- Performance : pagination et filtrage côté base pour la liste des devis.
--
-- La page chargeait TOUS les devis de l'entreprise (avec leurs jointures
-- client et chantier), puis filtrait et calculait les totaux en JavaScript.
-- Mesuré en production : 7,7 s sur une entreprise de 18 mois d'historique
-- (216 devis acceptés). Le défaut s'aggrave avec le volume — un client à
-- plusieurs années d'ancienneté aurait rendu la page inutilisable.
--
-- La fonction filtre, trie et pagine dans une seule requête : les fonctions
-- fenêtrées (count/sum) calculent le total et le montant filtré sur
-- l'ensemble des lignes correspondantes AVANT que LIMIT/OFFSET ne réduise
-- le résultat à la page demandée — comportement standard de PostgreSQL.
--
-- ⚠️ SECURITY DEFINER contourne RLS. Le droit d'accès aux devis eux-mêmes
-- (lecture_devis_selon_permission) est un simple a_permission(...), vérifié
-- ci-dessous à l'identique. Mais le nom du chantier joint pour affichage
-- provient d'une table dont la RLS est plus fine (peut_consulter_chantier :
-- équipe active du jour, pas une permission globale) — on ne l'expose donc
-- que lorsque ce contrôle est satisfait, pour ne jamais montrer plus que ce
-- que l'utilisateur pourrait voir via la page Chantiers elle-même.

create or replace function public.devis_liste_paginee(
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
  v_montant_filtre numeric;
  v_montant_accepte numeric;
  v_lignes jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'acces_devis') then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sub.id, 'numero', sub.numero, 'statut', sub.statut,
           'date_emission', sub.date_emission, 'montant_ttc', sub.montant_ttc,
           'client_nom', sub.client_nom, 'client_prenom', sub.client_prenom,
           'client_societe', sub.client_societe,
           'chantier_nom', case when public.peut_consulter_chantier(p_entreprise_id, sub.chantier_id) then sub.chantier_nom else null end
         ) order by sub.created_at desc), '[]'::jsonb),
         coalesce(max(sub.total_count), 0),
         coalesce(max(sub.montant_filtre_total), 0)
    into v_lignes, v_total, v_montant_filtre
  from (
    select d.id, d.numero, d.statut, d.date_emission, d.montant_ttc, d.created_at, d.chantier_id,
           c.nom as client_nom, c.prenom as client_prenom, c.societe as client_societe,
           ch.nom as chantier_nom,
           count(*) over () as total_count,
           sum(d.montant_ttc) over () as montant_filtre_total
    from public.devis d
    left join public.clients c on c.id = d.client_id
    left join public.chantiers ch on ch.id = d.chantier_id
    where d.entreprise_id = p_entreprise_id
      and (v_statut is null or d.statut = v_statut)
      and (
        v_recherche is null
        or d.numero ilike '%' || v_recherche || '%'
        or c.nom ilike '%' || v_recherche || '%'
        or c.prenom ilike '%' || v_recherche || '%'
        or c.societe ilike '%' || v_recherche || '%'
        or ch.nom ilike '%' || v_recherche || '%'
      )
    order by d.created_at desc
    limit v_taille offset v_offset
  ) sub;

  -- Indicateur global (tous les devis acceptés), indépendant des filtres :
  -- c'est le comportement affiché par la page avant cette migration.
  select coalesce(sum(montant_ttc), 0) into v_montant_accepte
    from public.devis where entreprise_id = p_entreprise_id and statut = 'accepte';

  return jsonb_build_object(
    'lignes', v_lignes,
    'total', v_total,
    'montant_filtre', v_montant_filtre,
    'montant_accepte', v_montant_accepte,
    'page', v_page,
    'taille', v_taille,
    'pages', greatest(1, ceil(v_total::numeric / v_taille))
  );
end;
$$;

revoke all on function public.devis_liste_paginee(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.devis_liste_paginee(uuid, text, text, integer, integer) to authenticated;

-- Le tri par défaut porte sur created_at : un index composite accélère
-- le classement une fois le filtre entreprise_id appliqué.
create index if not exists devis_entreprise_created_idx on public.devis(entreprise_id, created_at desc);

notify pgrst, 'reload schema';
