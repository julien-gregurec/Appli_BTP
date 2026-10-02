-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — fiche chantier : listes
-- chiffrées lues en entier.
--
-- Constat (docs/qualification/witnesses/finance-aggregates-v1/13-*) : la fiche
-- chantier lisait factures, affectations, pointages, factures fournisseurs et
-- notes de frais du chantier (tout l'historique) en une requête PostgREST
-- chacune, plafonnée à 1 000 lignes sans erreur ; facturé, encaissé, heures
-- prévues / réalisées, dépenses et notes de frais validées étaient faux
-- au-delà. Une lecture paginée côté Next est exacte mais coûte la policy RLS
-- de chaque ligne (108 s pour un chantier de 10 000 lignes par liste).
--
-- Correctif : une RPC jsonb (non soumise à `max_rows`), mêmes colonnes, mêmes
-- ordres. Sécurité — SECURITY DEFINER, `search_path` figé, policies de chaque
-- table reproduites à l'identique, évaluées une fois par entreprise, salarié ou
-- note plutôt que par ligne :
--   factures              → a_permission(e, 'acces_factures')
--   affectations          → est_membre_actif(e) ∧ peut_consulter_affectation_employe(e, employe)
--   pointages             → est_membre_actif(e) ∧ peut_consulter_pointage_employe(e, employe)
--   depenses_fournisseurs → a_permission(e, 'acces_achats')   (fournisseurs : idem)
--   notes_frais           → l'une des trois policies SELECT :
--       peut_consulter_note_frais(id), c.-à-d. est_membre_actif(e) ∧ (est_employe_du_compte(e, employe)
--         ∨ a_permission(e, verifier | gerer | comptabiliser_notes_frais | administrer_archivage_notes_frais)) ;
--       a_permission(e, 'preparer_virements') ∧ statut ∈ {valide, validee, exporte_comptabilite} ;
--       est_membre_actif(e) ∧ a_permission(e, 'saisir_ses_notes_frais') ∧ cree_par_utilisateur_id = auth.uid()
--         ∧ est_employe_du_compte(e, employe)
--   employes (nom joint)  → est_membre_actif(e)
-- Les booléens `p_*` ne servent qu'à ne pas lire une liste que la page
-- n'affichera pas (mêmes gardes qu'avant côté page) ; ils n'élargissent rien.

create or replace function public.chantier_donnees_chiffrees(
  p_entreprise_id uuid, p_chantier_id uuid,
  p_heures boolean default true, p_achats boolean default true, p_notes boolean default true
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_membre boolean := public.est_membre_actif(p_entreprise_id);
  v_factures jsonb := '[]'::jsonb;
  v_affectations jsonb := '[]'::jsonb;
  v_pointages jsonb := '[]'::jsonb;
  v_depenses jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_emp_affectation uuid[];
  v_emp_pointage uuid[];
  v_emp_compte uuid[];
  v_nf_gestion boolean;
  v_nf_virements boolean;
  v_nf_saisie boolean;
begin
  if not v_membre then
    return jsonb_build_object('factures', v_factures, 'affectations', v_affectations, 'pointages', v_pointages,
                              'factures_fournisseurs', v_depenses, 'notes_frais', v_notes);
  end if;

  select coalesce(array_agg(e.id) filter (where public.peut_consulter_affectation_employe(p_entreprise_id, e.id)), '{}'),
         coalesce(array_agg(e.id) filter (where public.peut_consulter_pointage_employe(p_entreprise_id, e.id)), '{}'),
         coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)), '{}')
    into v_emp_affectation, v_emp_pointage, v_emp_compte
  from public.employes e
  where e.entreprise_id = p_entreprise_id;

  if public.a_permission(p_entreprise_id, 'acces_factures') then
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'statut', f.statut, 'montant_ttc', f.montant_ttc, 'montant_paye', f.montant_paye)
             order by f.created_at desc, f.id), '[]'::jsonb)
      into v_factures
    from public.factures f
    where f.entreprise_id = p_entreprise_id and f.chantier_id = p_chantier_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'heures', a.heures) order by a.id), '[]'::jsonb)
    into v_affectations
  from public.affectations a
  where a.entreprise_id = p_entreprise_id and a.chantier_id = p_chantier_id and a.employe_id = any(v_emp_affectation);

  if p_heures then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'date', p.date, 'heures_normales', p.heures_normales, 'heures_supplementaires', p.heures_supplementaires,
             'tache', p.tache, 'verification_statut', p.verification_statut,
             'employe', case when em.id is not null then jsonb_build_object('prenom', em.prenom, 'nom', em.nom) end
           ) order by p.date desc, p.id), '[]'::jsonb)
      into v_pointages
    from public.pointages p
    left join public.employes em on em.id = p.employe_id and em.entreprise_id = p.entreprise_id
    where p.entreprise_id = p_entreprise_id and p.chantier_id = p_chantier_id and p.employe_id = any(v_emp_pointage);
  end if;

  if p_achats and public.a_permission(p_entreprise_id, 'acces_achats') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'numero_piece', d.numero_piece, 'categorie', d.categorie, 'date_piece', d.date_piece, 'statut', d.statut,
             'montant_ttc', d.montant_ttc, 'montant_regle', d.montant_regle, 'justificatif_storage_path', d.justificatif_storage_path,
             'fournisseur', case when fo.id is not null then jsonb_build_object('nom', fo.nom) end
           ) order by d.date_piece desc, d.id), '[]'::jsonb)
      into v_depenses
    from public.depenses_fournisseurs d
    left join public.fournisseurs fo on fo.id = d.fournisseur_id and fo.entreprise_id = d.entreprise_id
    where d.entreprise_id = p_entreprise_id and d.chantier_id = p_chantier_id;
  end if;

  if p_notes then
    v_nf_gestion := public.a_permission(p_entreprise_id, 'verifier_notes_frais')
                 or public.a_permission(p_entreprise_id, 'gerer_notes_frais')
                 or public.a_permission(p_entreprise_id, 'comptabiliser_notes_frais')
                 or public.a_permission(p_entreprise_id, 'administrer_archivage_notes_frais');
    v_nf_virements := public.a_permission(p_entreprise_id, 'preparer_virements');
    v_nf_saisie := public.a_permission(p_entreprise_id, 'saisir_ses_notes_frais');
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id, 'reference', n.reference, 'date_frais', n.date_frais, 'fournisseur', n.fournisseur, 'categorie', n.categorie,
             'statut', n.statut, 'montant_ttc', n.montant_ttc,
             'employe', case when em.id is not null then jsonb_build_object('prenom', em.prenom, 'nom', em.nom) end
           ) order by n.date_frais desc, n.id), '[]'::jsonb)
      into v_notes
    from public.notes_frais n
    left join public.employes em on em.id = n.employe_id and em.entreprise_id = n.entreprise_id
    where n.entreprise_id = p_entreprise_id and n.chantier_id = p_chantier_id
      and (
        v_nf_gestion or n.employe_id = any(v_emp_compte)
        or (v_nf_virements and n.statut in ('valide', 'validee', 'exporte_comptabilite'))
        or (v_nf_saisie and n.cree_par_utilisateur_id = auth.uid() and n.employe_id = any(v_emp_compte))
      );
  end if;

  return jsonb_build_object('factures', v_factures, 'affectations', v_affectations, 'pointages', v_pointages,
                            'factures_fournisseurs', v_depenses, 'notes_frais', v_notes);
end;
$$;

revoke all on function public.chantier_donnees_chiffrees(uuid, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.chantier_donnees_chiffrees(uuid, uuid, boolean, boolean, boolean) to authenticated;
