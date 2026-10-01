-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — fiches client, sous-traitant,
-- véhicule, outil et chantier : totaux calculés en base, listes bornées.
--
-- Constat (docs/qualification/ELSATIA_GP_RESIDUAL_DATA_CORRECTNESS_V1.md §2) :
-- ces fiches lisaient TOUT l'historique par PostgREST, sans pagination, puis
-- additionnaient côté Next. PostgREST plafonne chaque réponse à `max_rows`
-- (1 000, supabase/config.toml et projet hébergé) sans erreur : au-delà, les
-- totaux (facturé, encaissé, prévisionnel, réglé, coût véhicule / outil) étaient
-- faux sans avertissement. Un simple `count` ou `sum` sous RLS n'est pas une
-- réponse : les policies `a_permission(...)` coûtent ~1,2 ms par ligne
-- (mesuré : 37 s pour les 20 000 factures d'un client, 51 s pour compter
-- 20 000 photos d'un chantier).
--
-- Correctif : fonctions SECURITY DEFINER, `search_path` figé, qui reproduisent
-- À L'IDENTIQUE la visibilité RLS de chaque table en évaluant les prédicats une
-- fois par entreprise (ou par chantier) au lieu d'une fois par ligne. Elles
-- renvoient du jsonb (scalaire : jamais plafonné par `max_rows`). La parité
-- avec la lecture RLS réelle (même agrégat en SECURITY INVOKER, sous
-- `authenticated`) est vérifiée profil par profil par
-- supabase/tests/gp_residuel_agregats_v1.test.sql : si une policy change, le
-- test échoue.
--
-- Visibilité reproduite :
--   depenses_fournisseurs     → est_membre_actif(e) ∧ a_permission(e, 'acces_achats')
--   factures                  → est_membre_actif(e) ∧ a_permission(e, 'acces_factures')
--   devis                     → est_membre_actif(e) ∧ a_permission(e, 'acces_devis')
--   sous_traitants_chantiers  → est_membre_actif(e) ∧ a_permission(e, 'acces_sous_traitants')
--   chantiers                 → peut_consulter_chantier(e, id)
--   documents_chantier        → peut_voir_document_chantier(id)
--   notes_frais               → les trois policies SELECT (cf. 20260928000815)
-- Un appelant hors de l'entreprise reçoit une erreur 42501 ; un membre sans le
-- droit voit des totaux nuls, exactement comme la RLS lui montrait 0 ligne.

-- Index des listes bornées (pagination par curseur : coût par page constant,
-- quelle que soit sa profondeur). Ordre `desc` natif (NULL en tête), celui des
-- parcours arrière d'index et de src/lib/fiches-agregats.ts (lirePageCurseur).
create index if not exists chantiers_client_created_idx on public.chantiers (client_id, created_at desc, id desc);
create index if not exists factures_client_created_idx on public.factures (client_id, created_at desc, id desc);
create index if not exists devis_client_created_idx on public.devis (client_id, created_at desc, id desc);
create index if not exists depenses_fournisseurs_fournisseur_date_idx on public.depenses_fournisseurs (fournisseur_id, date_piece desc, id desc);
create index if not exists depenses_fournisseurs_vehicule_date_idx on public.depenses_fournisseurs (vehicule_id, date_piece desc, id desc) where vehicule_id is not null;
create index if not exists depenses_fournisseurs_outil_date_idx on public.depenses_fournisseurs (outil_id, date_piece desc, id desc) where outil_id is not null;
create index if not exists depenses_fournisseurs_chantier_date_idx on public.depenses_fournisseurs (chantier_id, date_piece desc, id desc) where chantier_id is not null;
create index if not exists sous_traitants_chantiers_fournisseur_created_idx on public.sous_traitants_chantiers (fournisseur_id, created_at desc, id desc);
create index if not exists releves_kilometrage_vehicule_curseur_idx on public.releves_kilometrage (vehicule_id, date_releve desc, id desc);
create index if not exists mouvements_outillage_outil_curseur_idx on public.mouvements_outillage (outil_id, created_at desc, id desc);
create index if not exists documents_chantier_chantier_curseur_idx on public.documents_chantier (chantier_id, created_at desc, id desc);

-- Garde commune : appelant authentifié et membre actif de l'entreprise.
create or replace function public.gp_exiger_membre(p_entreprise_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_entreprise_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'GP_AGREGAT_REFUSE' using errcode = '42501';
  end if;
end;
$$;

-- 1. Factures fournisseurs d'un tiers, d'un véhicule ou d'un outil.
--    Mêmes formules que les fiches : HT / TTC hors pièces annulées, réglé sur
--    toutes les pièces.
create or replace function public.gp_depenses_synthese(
  p_entreprise_id uuid,
  p_fournisseur_id uuid default null,
  p_vehicule_id uuid default null,
  p_outil_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_fournisseur_id is null and p_vehicule_id is null and p_outil_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  if not public.a_permission(p_entreprise_id, 'acces_achats') then
    return jsonb_build_object('nb', 0, 'nb_actives', 0, 'total_ht', 0, 'total_ttc', 0, 'total_regle', 0);
  end if;
  select jsonb_build_object(
           'nb', count(*),
           'nb_actives', count(*) filter (where d.statut is distinct from 'annulee'),
           'total_ht', coalesce(sum(d.montant_ht) filter (where d.statut is distinct from 'annulee'), 0),
           'total_ttc', coalesce(sum(d.montant_ttc) filter (where d.statut is distinct from 'annulee'), 0),
           'total_regle', coalesce(sum(d.montant_regle), 0))
    into v
  from public.depenses_fournisseurs d
  where d.entreprise_id = p_entreprise_id
    and (p_fournisseur_id is null or d.fournisseur_id = p_fournisseur_id)
    and (p_vehicule_id is null or d.vehicule_id = p_vehicule_id)
    and (p_outil_id is null or d.outil_id = p_outil_id);
  return v;
end;
$$;

-- 2. Fiche client : factures (facturé hors annulées, encaissé) et devis.
create or replace function public.gp_client_synthese(p_entreprise_id uuid, p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_factures jsonb := jsonb_build_object('nb', 0, 'total_facture', 0, 'total_paye', 0);
  v_devis jsonb := jsonb_build_object('nb', 0);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_client_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select jsonb_build_object(
             'nb', count(*),
             'total_facture', coalesce(sum(f.montant_ttc) filter (where f.statut is distinct from 'annulee'), 0),
             'total_paye', coalesce(sum(f.montant_paye), 0))
      into v_factures
    from public.factures f
    where f.entreprise_id = p_entreprise_id and f.client_id = p_client_id;
  end if;
  if public.a_permission(p_entreprise_id, 'acces_devis') then
    select jsonb_build_object('nb', count(*)) into v_devis
    from public.devis d
    where d.entreprise_id = p_entreprise_id and d.client_id = p_client_id;
  end if;
  return jsonb_build_object('factures', v_factures, 'devis', v_devis);
end;
$$;

-- 3. Fiche client : chantiers du client, page par curseur (created_at, id).
--    Visibilité de `chantiers` = peut_consulter_chantier(e, id) : pour un
--    profil « chantiers assignés », l'ensemble des chantiers assignés est
--    calculé une fois (mêmes conditions que la fonction), pas ligne à ligne.
create or replace function public.gp_client_chantiers_page(
  p_entreprise_id uuid,
  p_client_id uuid,
  p_limite integer default 50,
  p_avant_created_at timestamptz default null,
  p_avant_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_assignes boolean;
  v_ids uuid[] := '{}';
  v_lignes jsonb;
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_client_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_tous := public.a_permission(p_entreprise_id, 'acces_chantiers') or public.a_permission(p_entreprise_id, 'gerer_chantiers');
  v_assignes := not v_tous and public.a_permission(p_entreprise_id, 'voir_chantiers_assignes');
  if v_assignes then
    select coalesce(array_agg(distinct x.chantier_id), '{}') into v_ids
    from (
      select ec.chantier_id
      from public.employes e
      join public.equipes_chantiers ec on ec.entreprise_id = p_entreprise_id and ec.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and ec.date_debut <= current_date and (ec.date_fin is null or ec.date_fin >= current_date)
      union all
      select a.chantier_id
      from public.employes e
      join public.affectations a on a.entreprise_id = p_entreprise_id and a.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and a.date = current_date
    ) x;
  end if;
  if not v_tous and not v_assignes then
    return jsonb_build_object('lignes', '[]'::jsonb, 'suite', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'reference_interne', c.reference_interne, 'nom', c.nom,
                                                'statut', c.statut, 'ville', c.ville, 'created_at', c.created_at)
                            order by c.created_at desc, c.id desc), '[]'::jsonb)
    into v_lignes
  from (
    select c.*
    from public.chantiers c
    where c.entreprise_id = p_entreprise_id and c.client_id = p_client_id
      and (v_tous or c.id = any(v_ids))
      and (p_avant_id is null
           or (p_avant_created_at is not null and (c.created_at < p_avant_created_at or (c.created_at = p_avant_created_at and c.id < p_avant_id)))
           or (p_avant_created_at is null and ((c.created_at is null and c.id < p_avant_id) or c.created_at is not null)))
    order by c.created_at desc, c.id desc
    limit v_limite + 1
  ) c;

  return jsonb_build_object(
    'lignes', coalesce((select jsonb_agg(t.x order by t.n) from jsonb_array_elements(v_lignes) with ordinality t(x, n) where t.n <= v_limite), '[]'::jsonb),
    'suite', jsonb_array_length(v_lignes) > v_limite);
end;
$$;

-- 4. Fiche sous-traitant : missions (prévisionnel hors annulées, actives).
create or replace function public.gp_sous_traitant_missions_synthese(p_entreprise_id uuid, p_fournisseur_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_fournisseur_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  if not public.a_permission(p_entreprise_id, 'acces_sous_traitants') then
    return jsonb_build_object('nb', 0, 'nb_actives', 0, 'previsionnel_ht', 0);
  end if;
  select jsonb_build_object(
           'nb', count(*),
           'nb_actives', count(*) filter (where s.statut in ('prevue', 'en_cours')),
           'previsionnel_ht', coalesce(sum(s.montant_previsionnel_ht) filter (where s.statut is distinct from 'annulee'), 0))
    into v
  from public.sous_traitants_chantiers s
  where s.entreprise_id = p_entreprise_id and s.fournisseur_id = p_fournisseur_id;
  return v;
end;
$$;

-- 5. Documents d'un chantier : nombre visible et page par curseur.
--    peut_voir_document_chantier(id) ne dépend que de (entreprise, chantier,
--    audience) pour un utilisateur donné : évalué une fois par audience.
create or replace function public.gp_chantier_documents_audiences(p_entreprise_id uuid, p_chantier_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.est_membre_actif(p_entreprise_id) then '{}'::text[]
    when public.a_permission(p_entreprise_id, 'gerer_chantiers') then array['tous_affectes', 'encadrement', 'gestionnaires', '__null__']
    else coalesce((
      select array_agg(distinct a.audience)
      from public.employes e
      join public.equipes_chantiers ec on ec.employe_id = e.id and ec.entreprise_id = e.entreprise_id
      cross join lateral (values ('tous_affectes'), ('encadrement')) a(audience)
      where e.utilisateur_id = auth.uid() and ec.chantier_id = p_chantier_id
        and (ec.date_fin is null or ec.date_fin >= current_date)
        and (a.audience = 'tous_affectes' or ec.role_chantier in ('chef_equipe', 'chef_chantier', 'conducteur_travaux'))
    ), '{}'::text[])
  end;
$$;

create or replace function public.gp_chantier_documents_page(
  p_entreprise_id uuid,
  p_chantier_id uuid,
  p_limite integer default 60,
  p_avant_created_at timestamptz default null,
  p_avant_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audiences text[];
  v_total bigint;
  v_lignes jsonb;
  v_limite integer := least(greatest(coalesce(p_limite, 60), 0), 200);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_chantier_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_audiences := public.gp_chantier_documents_audiences(p_entreprise_id, p_chantier_id);

  select count(*) into v_total
  from public.documents_chantier d
  where d.entreprise_id = p_entreprise_id and d.chantier_id = p_chantier_id
    and coalesce(d.audience, '__null__') = any(v_audiences);

  if v_limite = 0 then
    return jsonb_build_object('total', v_total, 'lignes', '[]'::jsonb, 'suite', v_total > 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nom', d.nom, 'categorie', d.categorie, 'storage_path', d.storage_path,
                                                'mime_type', d.mime_type, 'taille_octets', d.taille_octets, 'note', d.note,
                                                'audience', d.audience, 'created_at', d.created_at)
                            order by d.created_at desc, d.id desc), '[]'::jsonb)
    into v_lignes
  from (
    select d.*
    from public.documents_chantier d
    where d.entreprise_id = p_entreprise_id and d.chantier_id = p_chantier_id
      and coalesce(d.audience, '__null__') = any(v_audiences)
      and (p_avant_id is null
           or (p_avant_created_at is not null and (d.created_at < p_avant_created_at or (d.created_at = p_avant_created_at and d.id < p_avant_id)))
           or (p_avant_created_at is null and ((d.created_at is null and d.id < p_avant_id) or d.created_at is not null)))
    order by d.created_at desc, d.id desc
    limit v_limite + 1
  ) d;

  return jsonb_build_object(
    'total', v_total,
    'lignes', coalesce((select jsonb_agg(t.x order by t.n) from jsonb_array_elements(v_lignes) with ordinality t(x, n) where t.n <= v_limite), '[]'::jsonb),
    'suite', jsonb_array_length(v_lignes) > v_limite);
end;
$$;

-- 6. Fiche chantier : totaux chiffrés et listes récentes bornées.
--    Remplace, pour la page, chantier_donnees_chiffrees (20260928000815) qui
--    renvoyait des listes complètes : exacte, mais 5,7 Mo de jsonb et autant de
--    lignes rendues pour un chantier de 20 000 pièces. Mêmes contrôles d'accès,
--    recopiés de cette fonction ; v1 est conservée (compatibilité, tests).
create or replace function public.chantier_synthese_chiffree(
  p_entreprise_id uuid, p_chantier_id uuid,
  p_achats boolean default true, p_notes boolean default true, p_limite integer default 50
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 0), 200);
  v_factures jsonb := jsonb_build_object('nb', 0, 'total_facture', 0, 'total_paye', 0, 'liste', '[]'::jsonb);
  v_depenses jsonb := jsonb_build_object('nb', 0, 'total_ttc', 0, 'total_regle', 0, 'liste', '[]'::jsonb);
  v_notes jsonb := jsonb_build_object('nb', 0, 'total_validees', 0, 'total_en_cours', 0, 'liste', '[]'::jsonb);
  v_emp_compte uuid[];
  v_nf_gestion boolean;
  v_nf_virements boolean;
  v_nf_saisie boolean;
  v_validees text[] := array['valide', 'exporte_comptabilite', 'verrouille', 'archive', 'validee', 'remboursee'];
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_chantier_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;

  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select jsonb_build_object(
             'nb', count(*),
             'total_facture', coalesce(sum(f.montant_ttc) filter (where f.statut is distinct from 'annulee'), 0),
             'total_paye', coalesce(sum(f.montant_paye), 0),
             'liste', coalesce((select jsonb_agg(x order by x.created_at desc, x.id desc) from (
                 select f2.id, f2.numero, f2.statut, f2.montant_ttc, f2.montant_paye, f2.created_at
                 from public.factures f2 where f2.entreprise_id = p_entreprise_id and f2.chantier_id = p_chantier_id
                 order by f2.created_at desc, f2.id desc limit least(v_limite, 5)) x), '[]'::jsonb))
      into v_factures
    from public.factures f
    where f.entreprise_id = p_entreprise_id and f.chantier_id = p_chantier_id;
  end if;

  if p_achats and public.a_permission(p_entreprise_id, 'acces_achats') then
    select jsonb_build_object(
             'nb', count(*),
             'total_ttc', coalesce(sum(d.montant_ttc) filter (where d.statut is distinct from 'annulee'), 0),
             'total_regle', coalesce(sum(d.montant_regle), 0),
             'liste', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', x.id, 'numero_piece', x.numero_piece, 'categorie', x.categorie, 'date_piece', x.date_piece, 'statut', x.statut,
                   'montant_ttc', x.montant_ttc, 'montant_regle', x.montant_regle, 'justificatif_storage_path', x.justificatif_storage_path,
                   'fournisseur', case when fo.id is not null then jsonb_build_object('nom', fo.nom) end)
                 order by x.date_piece desc, x.id desc) from (
                 select d2.* from public.depenses_fournisseurs d2
                 where d2.entreprise_id = p_entreprise_id and d2.chantier_id = p_chantier_id
                 order by d2.date_piece desc, d2.id desc limit v_limite) x
                 left join public.fournisseurs fo on fo.id = x.fournisseur_id and fo.entreprise_id = x.entreprise_id), '[]'::jsonb))
      into v_depenses
    from public.depenses_fournisseurs d
    where d.entreprise_id = p_entreprise_id and d.chantier_id = p_chantier_id;
  end if;

  if p_notes then
    -- est_employe_du_compte exige utilisateur_id = auth.uid() : pré-filtre exact.
    select coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)), '{}')
      into v_emp_compte
    from public.employes e
    where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();
    v_nf_gestion := public.a_permission(p_entreprise_id, 'verifier_notes_frais')
                 or public.a_permission(p_entreprise_id, 'gerer_notes_frais')
                 or public.a_permission(p_entreprise_id, 'comptabiliser_notes_frais')
                 or public.a_permission(p_entreprise_id, 'administrer_archivage_notes_frais');
    v_nf_virements := public.a_permission(p_entreprise_id, 'preparer_virements');
    v_nf_saisie := public.a_permission(p_entreprise_id, 'saisir_ses_notes_frais');
    with visibles as materialized (
      select n.*
      from public.notes_frais n
      where n.entreprise_id = p_entreprise_id and n.chantier_id = p_chantier_id
        and (
          v_nf_gestion or n.employe_id = any(v_emp_compte)
          or (v_nf_virements and n.statut in ('valide', 'validee', 'exporte_comptabilite'))
          or (v_nf_saisie and n.cree_par_utilisateur_id = auth.uid() and n.employe_id = any(v_emp_compte))
        )
    )
    select jsonb_build_object(
             'nb', (select count(*) from visibles),
             'total_validees', coalesce((select sum(montant_ttc) from visibles where statut = any(v_validees)), 0),
             'total_en_cours', coalesce((select sum(montant_ttc) from visibles where not (statut = any(v_validees)) and statut not in ('refuse', 'refusee')), 0),
             'liste', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', x.id, 'reference', x.reference, 'date_frais', x.date_frais, 'fournisseur', x.fournisseur, 'categorie', x.categorie,
                   'statut', x.statut, 'montant_ttc', x.montant_ttc,
                   'employe', case when em.id is not null then jsonb_build_object('prenom', em.prenom, 'nom', em.nom) end)
                 order by x.date_frais desc, x.id desc) from (
                 select * from visibles order by date_frais desc, id desc limit v_limite) x
                 left join public.employes em on em.id = x.employe_id and em.entreprise_id = x.entreprise_id), '[]'::jsonb))
      into v_notes;
  end if;

  return jsonb_build_object('factures', v_factures, 'factures_fournisseurs', v_depenses, 'notes_frais', v_notes);
end;
$$;

revoke all on function public.gp_exiger_membre(uuid) from public, anon;
revoke all on function public.gp_depenses_synthese(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.gp_client_synthese(uuid, uuid) from public, anon;
revoke all on function public.gp_client_chantiers_page(uuid, uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.gp_sous_traitant_missions_synthese(uuid, uuid) from public, anon;
revoke all on function public.gp_chantier_documents_audiences(uuid, uuid) from public, anon;
revoke all on function public.gp_chantier_documents_page(uuid, uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer) from public, anon;
grant execute on function public.gp_exiger_membre(uuid) to authenticated;
grant execute on function public.gp_depenses_synthese(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.gp_client_synthese(uuid, uuid) to authenticated;
grant execute on function public.gp_client_chantiers_page(uuid, uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.gp_sous_traitant_missions_synthese(uuid, uuid) to authenticated;
grant execute on function public.gp_chantier_documents_audiences(uuid, uuid) to authenticated;
grant execute on function public.gp_chantier_documents_page(uuid, uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer) to authenticated;

-- 7. DOE d'un chantier : contenu COMPLET (tous les documents visibles, tous les
--    articles sortis du stock vers le chantier, leurs fiches techniques).
--    Avant : trois lectures PostgREST plafonnées à 1 000 lignes ; le manifeste
--    figé (doe_generations) et l'écran omettaient sans erreur documents et
--    articles au-delà. Visibilité :
--      chantier                    → peut_consulter_chantier (sinon 42501)
--      documents_chantier          → peut_voir_document_chantier (audiences)
--      mouvements / articles_stock → est_membre_actif
--      fiches_techniques_articles  → a_permission(acces_stock | acces_chantiers
--                                    | voir_devis_chantier_sans_prix | gerer_stock)
create or replace function public.gp_doe_contenu(p_entreprise_id uuid, p_chantier_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audiences text[];
  v_documents jsonb;
  v_articles jsonb;
  v_fiches jsonb := '[]'::jsonb;
  v_ids uuid[];
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_chantier_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  if not public.peut_consulter_chantier(p_entreprise_id, p_chantier_id) then
    raise exception 'GP_AGREGAT_REFUSE' using errcode = '42501';
  end if;
  v_audiences := public.gp_chantier_documents_audiences(p_entreprise_id, p_chantier_id);

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nom', d.nom, 'categorie', d.categorie, 'note', d.note, 'created_at', d.created_at)
                            order by d.categorie, d.created_at, d.id), '[]'::jsonb)
    into v_documents
  from public.documents_chantier d
  where d.entreprise_id = p_entreprise_id and d.chantier_id = p_chantier_id
    and coalesce(d.audience, '__null__') = any(v_audiences);

  select coalesce(array_agg(x.article_id order by x.article_id), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'reference', a.reference, 'designation', a.designation, 'marque', a.marque, 'quantite', x.quantite)
                            order by a.designation, a.id) filter (where a.id is not null), '[]'::jsonb)
    into v_ids, v_articles
  from (
    select m.article_id, sum(m.quantite) as quantite
    from public.mouvements_stock m
    where m.entreprise_id = p_entreprise_id and m.chantier_id = p_chantier_id and m.type = 'sortie' and m.article_id is not null
    group by m.article_id
  ) x
  left join public.articles_stock a on a.id = x.article_id and a.entreprise_id = p_entreprise_id;

  if public.a_permission(p_entreprise_id, 'acces_stock') or public.a_permission(p_entreprise_id, 'acces_chantiers')
     or public.a_permission(p_entreprise_id, 'voir_devis_chantier_sans_prix') or public.a_permission(p_entreprise_id, 'gerer_stock') then
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'article_id', f.article_id, 'titre', f.titre, 'type_document', f.type_document,
                                                  'fabricant', f.fabricant, 'version', f.version) order by f.titre, f.id), '[]'::jsonb)
      into v_fiches
    from public.fiches_techniques_articles f
    where f.entreprise_id = p_entreprise_id and f.article_id = any(v_ids);
  end if;

  return jsonb_build_object('documents', v_documents, 'articles', v_articles, 'article_ids', to_jsonb(v_ids), 'fiches_techniques', v_fiches);
end;
$$;

revoke all on function public.gp_doe_contenu(uuid, uuid) from public, anon;
grant execute on function public.gp_doe_contenu(uuid, uuid) to authenticated;

-- 8. Index manquants des autres listes paginées ou bornées : sans eux, le tri
--    se faisait sur toutes les lignes, RLS évaluée sur chacune (mesuré à 20 000
--    lignes : notes de frais 70 s, messages 53 s, commandes 35 s, interventions
--    17 s avant la première page).
create index if not exists notes_frais_entreprise_date_curseur_idx on public.notes_frais (entreprise_id, date_frais desc, id desc);
create index if not exists messages_internes_conversation_curseur_idx on public.messages_internes (conversation_id, created_at desc, id desc);
create index if not exists interventions_entreprise_date_curseur_idx on public.interventions (entreprise_id, date_prevue desc, id desc);
create index if not exists commandes_fournisseurs_entreprise_date_curseur_idx on public.commandes_fournisseurs (entreprise_id, date_commande desc, id desc);
create index if not exists appels_offres_entreprise_date_curseur_idx on public.appels_offres (entreprise_id, date_limite desc, id desc);
create index if not exists situations_travaux_entreprise_curseur_idx on public.situations_travaux (entreprise_id, created_at desc, id desc);
create index if not exists contrats_entretien_entreprise_created_idx on public.contrats_entretien (entreprise_id, created_at desc, id);
create index if not exists bons_livraison_entreprise_date_idx on public.bons_livraison (entreprise_id, date_livraison desc, id);
create index if not exists pieces_jointes_messages_chantier_curseur_idx on public.pieces_jointes_messages (chantier_id, created_at desc, id desc) where chantier_id is not null;
