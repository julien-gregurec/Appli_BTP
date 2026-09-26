-- [CONVERGENCE TRAIN] Porte le lot PERFORMANCE qualifie sur la branche source
-- claude/beautiful-franklin-7hwzq0 (SHA 56aa747958a480d484ddf3d71d25e1efc539d99,
-- verdict source : PERFORMANCE QUALIFIED). Numero source de cette migration :
-- 20260922000316 (branche source, ledger divergent). Renumerotee au prochain identifiant
-- reellement disponible du train (ledger canonique claude/compassionate-euler-5j6avr)
-- pour eviter toute collision avec 20260922000317_correctif_troncature_next_reference.sql
-- (NUMBERING FIX INTEGRATED, deja present dans le train, non touche par ce lot).
-- Contenu fonctionnel identique au commit source ; seuls le numero de fichier et
-- les references croisees vers les migrations voisines de ce meme lot ont ete
-- ajustes pour pointer vers leur nouveau numero dans le train.

-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 — Dashboard : remplace les
-- chargements complets et non bornés de `devis`/`factures` (tous statuts,
-- tout historique, jointure client) par une RPC qui retourne directement
-- les agrégats et les listes déjà bornées dont la page a besoin.
--
-- Constat (`src/app/(app)/dashboard/page.tsx`) : à chaque affichage du
-- Dashboard, la page charge TOUS les devis et TOUTES les factures de
-- l'entreprise (avec jointure client), puis calcule en JavaScript :
--   - les totaux (devis acceptés, facturé, encaissé) ;
--   - les 5 devis "à suivre" (brouillon/envoyé) les plus récents ;
--   - les échéances proches (devis à expirer, factures à encaisser) ;
--   - l'historique 6 mois pour le graphique.
-- Mesuré sur un tenant à 5000 devis/3000 factures : ~1,7-1,8 s (devis) et
-- ~1,1 s (factures), dominé par le coût RLS par ligne (`a_permission`/
-- `est_membre_actif`, cf. les migrations 299-303) appliqué à des milliers
-- de lignes jamais affichées.
--
-- Sécurité — même motif que `devis_liste_paginee`/`factures_liste_paginee`
-- (migrations 118-119) : SECURITY DEFINER, vérifie explicitement
-- `a_permission(p_entreprise_id, 'acces_devis'|'acces_factures')` avant de
-- peupler chaque groupe de champs — exactement la même policy RESTRICTIVE
-- que `devis`/`factures` imposaient déjà (`lecture_devis_selon_permission`/
-- `lecture_factures_selon_permission`), reproduite ici à l'identique plutôt
-- que contournée : un appelant sans `acces_devis` reçoit `devis_a_suivre:
-- null` etc., jamais les lignes. Aucune permission élargie, aucune donnée
-- nouvelle exposée par rapport à ce que la page chargeait déjà.
--
-- Les 3 totaux qui doivent par nature agréger la quasi-totalité de
-- l'historique (devis acceptés, facturé, encaissé) sont lus depuis
-- `entreprises_dashboard_cache` (migration suivante, 20260922000319) — un
-- balayage borné par LIMIT reste O(lignes scannées avant la limite), mais
-- un SUM sur "tous les devis acceptés" ne peut pas l'être : matérialiser
-- ce total est le seul moyen de le rendre O(1) (mission §4 : "cache
-- tenant-safe", "materialization légère si justifiée").

create or replace function public.dashboard_indicateurs(p_entreprise_id uuid, p_aujourdhui date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_devis_acceptes_total numeric;
  v_devis_a_suivre jsonb;
  v_devis_alertes jsonb;
  v_devis_mois jsonb;
  v_factures_total numeric;
  v_factures_encaisse_total numeric;
  v_factures_alertes jsonb;
  v_factures_mois jsonb;
begin
  if public.a_permission(p_entreprise_id, 'acces_devis') then
    select c.devis_acceptes_total into v_devis_acceptes_total
    from public.entreprises_dashboard_cache c
    where c.entreprise_id = p_entreprise_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero', d.numero, 'statut', d.statut, 'montant_ttc', d.montant_ttc,
             'client', jsonb_build_object('nom', cl.nom, 'prenom', cl.prenom, 'societe', cl.societe)
           ) order by d.created_at desc), '[]'::jsonb)
      into v_devis_a_suivre
    from (
      select id, numero, statut, montant_ttc, client_id, created_at
      from public.devis
      where entreprise_id = p_entreprise_id
        and statut in ('brouillon', 'envoye')
      order by created_at desc
      limit 5
    ) d
    left join public.clients cl on cl.id = d.client_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero', d.numero, 'montant_ttc', d.montant_ttc, 'date_validite', d.date_validite
           ) order by d.date_validite), '[]'::jsonb)
      into v_devis_alertes
    from public.devis d
    where d.entreprise_id = p_entreprise_id
      and d.statut = 'envoye'
      and d.date_validite is not null
      and d.date_validite <= p_aujourdhui + 7;

    select coalesce(jsonb_agg(jsonb_build_object('cle', m.cle, 'total', m.total) order by m.cle), '[]'::jsonb)
      into v_devis_mois
    from (
      select to_char(date_emission, 'YYYY-MM') as cle, sum(montant_ttc) as total
      from public.devis
      where entreprise_id = p_entreprise_id
        and statut <> 'annule'
        and date_emission >= (date_trunc('month', p_aujourdhui) - interval '5 months')::date
      group by 1
    ) m;
  end if;

  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select c.factures_total, c.factures_encaisse_total
      into v_factures_total, v_factures_encaisse_total
    from public.entreprises_dashboard_cache c
    where c.entreprise_id = p_entreprise_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id, 'numero', f.numero, 'montant_ttc', f.montant_ttc, 'montant_paye', f.montant_paye,
             'date_echeance', f.date_echeance,
             'client', jsonb_build_object('nom', cl.nom, 'prenom', cl.prenom, 'societe', cl.societe)
           ) order by f.date_echeance), '[]'::jsonb)
      into v_factures_alertes
    from public.factures f
    left join public.clients cl on cl.id = f.client_id
    where f.entreprise_id = p_entreprise_id
      and f.date_echeance is not null
      and f.statut not in ('payee', 'annulee', 'avoir_emis')
      and f.date_echeance <= p_aujourdhui + 7;

    select coalesce(jsonb_agg(jsonb_build_object('cle', m.cle, 'total', m.total) order by m.cle), '[]'::jsonb)
      into v_factures_mois
    from (
      select to_char(date_emission, 'YYYY-MM') as cle, sum(montant_ttc) as total
      from public.factures
      where entreprise_id = p_entreprise_id
        and statut <> 'annulee'
        and date_emission >= (date_trunc('month', p_aujourdhui) - interval '5 months')::date
      group by 1
    ) m;
  end if;

  return jsonb_build_object(
    'devis_acceptes_total', v_devis_acceptes_total,
    'devis_a_suivre', v_devis_a_suivre,
    'devis_alertes', v_devis_alertes,
    'devis_mois', v_devis_mois,
    'factures_total', v_factures_total,
    'factures_encaisse_total', v_factures_encaisse_total,
    'factures_alertes', v_factures_alertes,
    'factures_mois', v_factures_mois
  );
end;
$$;

revoke all on function public.dashboard_indicateurs(uuid, date) from public, anon;
grant execute on function public.dashboard_indicateurs(uuid, date) to authenticated;

-- Bornes utilisées par la RPC ci-dessus : le tri par date d'échéance/
-- validité au sein du tenant n'était pas encore indexé (seul
-- `devis_entreprise_created_idx`/l'équivalent factures existaient).
create index if not exists devis_entreprise_validite_idx
  on public.devis(entreprise_id, date_validite)
  where statut = 'envoye';
create index if not exists factures_entreprise_echeance_idx
  on public.factures(entreprise_id, date_echeance)
  where statut not in ('payee', 'annulee', 'avoir_emis');
create index if not exists devis_entreprise_emission_idx
  on public.devis(entreprise_id, date_emission);
create index if not exists factures_entreprise_emission_idx
  on public.factures(entreprise_id, date_emission);

notify pgrst, 'reload schema';
