#!/usr/bin/env python3
"""Génère supabase/tests/gp_residuel_agregats_v1.test.sql (ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1).

Parité stricte, profil par profil, entre chaque fonction SECURITY DEFINER des
migrations 20260930000401-403 et le même calcul fait sous `authenticated` avec
la RLS réelle des tables. Rejouer après toute modification :
    python3 scripts/qualification/gp-residual/generer_pgtap.py
"""
from pathlib import Path

A = "a0000000-0000-0000-0000-000000000001"
B = "b0000000-0000-0000-0000-000000000001"
CLI = "a3000000-0000-0000-0000-000000000001"
CH1 = "a4000000-0000-0000-0000-000000000001"
CH2 = "a4000000-0000-0000-0000-000000000002"
ST = "a9900000-0000-0000-0000-000000000001"
VEH = "a9910000-0000-0000-0000-000000000001"
OUT = "a9920000-0000-0000-0000-000000000001"
PER = "a9930000-0000-0000-0000-000000000001"
PROFILS = [
    ("admin A", "10000000-0000-0000-0000-000000000001"),
    ("ouvrier A", "10000000-0000-0000-0000-000000000002"),
    ("chef d'équipe A", "10000000-0000-0000-0000-000000000003"),
    ("conducteur A", "10000000-0000-0000-0000-000000000004"),
    ("comptable A", "10000000-0000-0000-0000-000000000005"),
    ("dirigeant A", "10000000-0000-0000-0000-000000000006"),
]
VALIDEES = "('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')"
ACTIFS = "('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')"

FONCTIONS = [
    ("gp_depenses_synthese", "uuid, uuid, uuid, uuid"),
    ("gp_client_synthese", "uuid, uuid"),
    ("gp_client_chantiers_page", "uuid, uuid, integer, timestamp with time zone, uuid"),
    ("gp_sous_traitant_missions_synthese", "uuid, uuid"),
    ("gp_chantier_documents_page", "uuid, uuid, integer, timestamp with time zone, uuid"),
    ("chantier_synthese_chiffree", "uuid, uuid, boolean, boolean, integer"),
    ("gp_doe_contenu", "uuid, uuid"),
    ("paie_periode_synthese", "uuid, uuid, text, text, uuid"),
    ("notes_frais_synthese_employes", "uuid, text, text, uuid, uuid"),
    ("notes_frais_page", "uuid, text, text, uuid, uuid, integer, date, uuid"),
    ("gp_crm_synthese", "uuid"),
    ("gp_dashboard_chantiers", "uuid, date, integer"),
    ("gp_alertes_stock", "uuid, integer"),
    ("paie_periode_dossiers_page", "uuid, uuid, text, text, uuid, integer, integer"),
    ("paie_export_contenu", "uuid, uuid, boolean"),
    ("paie_anomalies_page", "uuid, uuid, uuid, integer"),
    ("gp_parc_synthese", "uuid, date"),
    ("gp_effectif_actif", "uuid"),
    ("gp_alertes_parc", "uuid, date, integer, integer"),
    ("gp_options_chantiers", "uuid, text[], uuid, text"),
    ("gp_options_employes", "uuid, boolean"),
    ("gp_options_clients", "uuid, text, text, text"),
    ("plateforme_postes_tarifs_entreprise", "uuid"),
    ("plateforme_applications_compteurs", ""),
]

def q(s):
    return "$$" + s + "$$"

tests = []
def t(sql):
    tests.append(sql)

def comme(uid):
    t(f"select set_config('request.jwt.claims', '{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}', true) is not null as profil;")

# 1. Surface : existence, anon refusé, authenticated autorisé, SECURITY DEFINER + search_path.
for nom, args in FONCTIONS:
    sig = f"public.{nom}({args})"
    t(f"select ok(to_regprocedure('{sig}') is not null, '{nom} existe');")
    t(f"select is(has_function_privilege('anon', '{sig}', 'execute'), false, '{nom} : anon n''a pas EXECUTE');")
    t(f"select is(has_function_privilege('authenticated', '{sig}', 'execute'), true, '{nom} : authenticated a EXECUTE');")
    t(f"select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('{sig}')), '{nom} : SECURITY DEFINER, search_path figé');")

t("select is((select count(*)::int from public.factures where client_id = '%s' and numero like 'PGTAP-F-%%'), 1462, 'jeu : 1 462 factures pour le client (> 1 000)');" % CLI)

t("set local role authenticated;")
for libelle, uid in PROFILS:
    comme(uid)
    L = libelle.replace("'", "''")
    # Dépenses par axe.
    for axe, col, val in (("sous-traitant", "fournisseur_id", ST), ("véhicule", "vehicule_id", VEH), ("outil", "outil_id", OUT)):
        param = {"fournisseur_id": "p_fournisseur_id", "vehicule_id": "p_vehicule_id", "outil_id": "p_outil_id"}[col]
        t(f"""select is(public.gp_depenses_synthese('{A}', {param} => '{val}'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = '{A}' and {col} = '{val}'),
  'parité RLS dépenses {axe} : {L}');""")
    # Client.
    t(f"""select is(public.gp_client_synthese('{A}', '{CLI}'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = '{A}' and client_id = '{CLI}'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = '{A}' and client_id = '{CLI}')),
  'parité RLS fiche client : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('{A}', '{CLI}', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = '{A}' and client_id = '{CLI}' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : {L}');""")
    t(f"""select is(public.gp_sous_traitant_missions_synthese('{A}', '{ST}'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = '{A}' and fournisseur_id = '{ST}'),
  'parité RLS missions sous-traitant : {L}');""")
    for ch, nomch in ((CH1, "chantier assigné"), (CH2, "chantier non assigné")):
        t(f"""select is((public.gp_chantier_documents_page('{A}', '{ch}', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = '{A}' and chantier_id = '{ch}'),
  'parité RLS nombre de documents ({nomch}) : {L}');""")
        t(f"""select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('{A}', '{ch}', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = '{A}' and chantier_id = '{ch}' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents ({nomch}) : {L}');""")
    t(f"""select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('{A}', '{CH1}') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'n', (select count(*) from public.notes_frais where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in {VALIDEES}), 0) from public.notes_frais where entreprise_id = '{A}' and chantier_id = '{CH1}'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in {VALIDEES} and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = '{A}' and chantier_id = '{CH1}'))),
  'parité RLS synthèse fiche chantier : {L}');""")
    # DOE : chantier visible → contenu = RLS ; sinon refus.
    t(f"""select case when public.peut_consulter_chantier('{A}', '{CH1}') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('{A}', '{CH1}') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = '{A}' and chantier_id = '{CH1}'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = '{A}' and chantier_id = '{CH1}' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = '{A}' and article_id in (select article_id from public.mouvements_stock where entreprise_id = '{A}' and chantier_id = '{CH1}' and type = 'sortie'))),
     'parité RLS contenu DOE : {L}')
  else throws_ok($$select public.gp_doe_contenu('{A}', '{CH1}')$$, '42501', null, 'DOE refusé hors chantier visible : {L}') end;""")
    t(f"""select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('{A}', '{PER}') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = '{A}' and d.periode_id = '{PER}'),
  'parité RLS indicateurs de paie : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('{A}', '{PER}', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = '{A}' and d.periode_id = '{PER}'),
  'parité RLS page de dossiers de paie : {L}');""")
    t(f"""select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('{A}', '{PER}') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = '{A}' and periode_id = '{PER}'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = '{A}' and periode_id = '{PER}'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('{A}', '{PER}', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = '{PER}' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : {L}');""")
    t(f"""select is((public.paie_periode_synthese('{A}', '{PER}')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = '{PER}' and corrigee_at is null),
  'parité RLS anomalies de paie : {L}');""")
    t(f"""select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('{A}')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = '{A}' group by employe_id) g),
  'parité RLS notes de frais par salarié : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('{A}', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = '{A}' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : {L}');""")
    t(f"""select is(public.gp_crm_synthese('{A}'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = '{A}' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = '{A}' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : {L}');""")
    t(f"""select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('{A}', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = '{A}' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = '{A}' and statut in {ACTIFS}),
    'r', (select count(*) from public.chantiers where entreprise_id = '{A}' and statut in {ACTIFS} and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : {L}');""")
    t(f"""select is((public.gp_alertes_stock('{A}')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = '{A}' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('{A}')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = '{A}' and statut not in ('archive','annule')),
  'parité RLS options chantiers : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('{A}')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = '{A}' and statut = 'actif'),
  'parité RLS options salariés : {L}');""")
    t(f"""select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('{A}')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = '{A}'),
  'parité RLS options clients : {L}');""")
    t(f"""select is(public.gp_parc_synthese('{A}', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = '{A}'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = '{A}')),
  'parité RLS compteurs du parc : {L}');""")
    t(f"""select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('{A}', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = '{A}' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = '{A}' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : {L}');""")
    t(f"""select is(public.gp_effectif_actif('{A}'), (select count(*) from public.employes where entreprise_id = '{A}' and statut = 'actif'), 'parité RLS effectif actif : {L}');""")
    # Tenant B : refus pour un profil de A.
    t(f"select throws_ok($$select public.gp_client_synthese('{B}', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : {L}');")
    t(f"select throws_ok($$select public.plateforme_postes_tarifs_entreprise('{A}')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : {L}');")
    t(f"select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : {L}');")

# Paramètres et membres d'autres tenants.
comme("20000000-0000-0000-0000-000000000001")
for nom, appel in (("dépenses", f"public.gp_depenses_synthese('{A}', p_vehicule_id => '{VEH}')"), ("documents", f"public.gp_chantier_documents_page('{A}', '{CH1}')"),
                   ("paie", f"public.paie_periode_synthese('{A}', '{PER}')"), ("notes", f"public.notes_frais_synthese_employes('{A}')"),
                   ("DOE", f"public.gp_doe_contenu('{A}', '{CH1}')"), ("chantiers client", f"public.gp_client_chantiers_page('{A}', '{CLI}')"),
                   ("tableau de bord", f"public.gp_dashboard_chantiers('{A}', current_date)"), ("stock", f"public.gp_alertes_stock('{A}')"),
                   ("CRM", f"public.gp_crm_synthese('{A}')"), ("synthèse chantier", f"public.chantier_synthese_chiffree('{A}', '{CH1}')"),
                   ("missions", f"public.gp_sous_traitant_missions_synthese('{A}', '{ST}')"),
                   ("options chantiers", f"public.gp_options_chantiers('{A}')"), ("options salariés", f"public.gp_options_employes('{A}')"),
                   ("options clients", f"public.gp_options_clients('{A}')")):
    t(f"select throws_ok($${'select ' + appel}$$, '42501', null, 'admin B refusé sur A ({nom})');")
comme("10000000-0000-0000-0000-000000000001")
t(f"select throws_ok($$select public.gp_depenses_synthese('{A}')$$, '22023', null, 'dépenses : au moins un axe exigé');")
t(f"select throws_ok($$select public.gp_client_synthese('{A}', null)$$, '22023', null, 'client : identifiant exigé');")
t("select set_config('request.jwt.claims', '', true) is not null as anonyme;")
t(f"select throws_ok($$select public.gp_client_synthese('{A}', '{CLI}')$$, '42501', null, 'sans identité : refus');")

# Plateforme.
comme("30000000-0000-0000-0000-000000000001")
t(f"""select results_eq($$select poste_id, nom, nb_comptes_facturables from public.plateforme_postes_tarifs_entreprise('{A}') order by nom, poste_id$$,
  $$select poste_id, nom, nb_comptes_facturables from public.plateforme_postes_tarifs() where entreprise_id = '{A}' order by nom, poste_id$$,
  'plateforme : tarifs par poste du tenant = ancienne RPC filtrée');""")
t(f"select is((select count(*)::int from public.plateforme_postes_tarifs_entreprise('{A}') where entreprise_id <> '{A}'), 0, 'plateforme : aucun poste d''un autre tenant');")
t("""select is(public.plateforme_applications_compteurs(),
  (select coalesce(jsonb_object_agg(a.code, jsonb_build_object(
     'entreprises', (select count(*) from public.acces_applications_entreprises x where x.application_code = a.code and x.autorise and (x.valide_du is null or x.valide_du <= now()) and (x.valide_jusqu_au is null or x.valide_jusqu_au > now())),
     'utilisateurs', (select count(*) from public.habilitations_applications_utilisateurs h where h.application_code = a.code and h.autorise and (h.valide_du is null or h.valide_du <= now()) and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())))), '{}'::jsonb)
   from public.applications_elsatia a),
  'plateforme : compteurs d''applications = lecture RLS de l''administrateur');""")

ENTETE = f"""-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — parité RLS des agrégats résiduels
-- (migrations 20260930000401, 20260930000402, 20260930000403).
--
-- FICHIER GÉNÉRÉ par scripts/qualification/gp-residual/generer_pgtap.py.
--
-- Chaque fonction SECURITY DEFINER doit renvoyer EXACTEMENT ce que la RLS des
-- tables donne au même utilisateur (même calcul sous `authenticated`), pour les
-- six profils du tenant A (admin, ouvrier, chef d'équipe, conducteur,
-- comptable, dirigeant) ; refus pour le tenant B, sans identité, et sur les
-- RPC plateforme pour un membre de tenant ; anon sans EXECUTE. Jeu : 1 462
-- lignes par chemin (> max_rows = 1 000), audiences de documents mêlées (tous_affectes, encadrement, gestionnaires).
begin;
create extension if not exists pgtap with schema extensions;
select plan({sum(1 for x in tests if x.startswith('select') and not x.startswith('select set_config') and ' as profil' not in x and ' as anonyme' not in x)});

\\ir fixtures/isolation_multitenant.inc

set session_replication_role = replica;
-- Tiers, véhicule, outil, période de paie du tenant A.
insert into public.fournisseurs (id, entreprise_id, reference, nom, type_tiers) values ('{ST}', '{A}', 'PGTAP-ST', 'Sous-traitant PGTAP', 'sous_traitant');
insert into public.vehicules (id, entreprise_id, immatriculation, marque, modele, type, statut) values ('{VEH}', '{A}', 'PG-TAP-01', 'Renault', 'Master', 'utilitaire', 'actif');
insert into public.outils (id, entreprise_id, reference, designation, categorie, statut, etat) values ('{OUT}', '{A}', 'PGTAP-OUT', 'Perforateur', 'electroportatif', 'disponible', 'bon');
insert into public.periodes_paie (id, entreprise_id, mois, date_debut, date_fin, statut, cree_par) values ('{PER}', '{A}', '2026-03-01', '2026-03-01', '2026-03-31', 'saisie_en_cours', '10000000-0000-0000-0000-000000000001');
-- 1 462 factures et devis du client, 1 462 factures fournisseurs par axe, 1 462 missions.
insert into public.factures (entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, montant_ht, montant_tva, montant_ttc, montant_paye, created_at)
select '{A}', 'PGTAP-F-' || g, '{CLI}', case when g % 2 = 0 then '{CH1}'::uuid end, 'simple',
       case when g % 33 = 0 then 'annulee' when g % 4 = 0 then 'payee' when g % 4 = 1 then 'payee_partiel' else 'envoyee' end,
       date '2025-01-01' + g % 400, round(10 + (g * 37) % 997 * 1.07, 2), 0, round(10 + (g * 37) % 997 * 1.07, 2),
       case when g % 4 = 0 then round(10 + (g * 37) % 997 * 1.07, 2) when g % 4 = 1 then round((10 + (g * 37) % 997 * 1.07) / 3, 2) else 0 end,
       timestamptz '2025-01-01' + g * interval '1 minute'
from generate_series(1, 1462) g;
insert into public.devis (entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc)
select '{A}', 'PGTAP-D-' || g, '{CLI}', 'envoye', 10, 2, 12 from generate_series(1, 1462) g;
insert into public.chantiers (entreprise_id, client_id, nom, statut, date_fin_prevue, created_at)
select '{A}', '{CLI}', 'PGTAP chantier ' || g, (array['en_cours','accepte','termine','archive','en_pause'])[1 + g % 5], date '2026-01-01' + g % 600, timestamptz '2024-01-01' + g * interval '1 minute'
from generate_series(1, 300) g;
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, vehicule_id, outil_id, numero_piece, categorie, date_piece, statut, montant_ht, taux_tva, montant_tva, montant_regle)
select '{A}', '{ST}', case a.n when 1 then '{CH1}'::uuid end, case a.n when 2 then '{VEH}'::uuid end, case a.n when 3 then '{OUT}'::uuid end,
       'PGTAP-' || a.n || '-' || g, 'autre', date '2025-01-01' + g % 400,
       case when g % 29 = 0 then 'annulee' when g % 3 = 0 then 'payee' else 'a_payer' end,
       round(5.13 + (g * 53) % 1999, 2), 20, round((5.13 + (g * 53) % 1999) * 0.2, 2), case when g % 3 = 0 then round((5.13 + (g * 53) % 1999) * 1.2, 2) else 0 end
from generate_series(1, 1462) g cross join (values (1), (2), (3)) a(n);
insert into public.sous_traitants_chantiers (entreprise_id, fournisseur_id, chantier_id, mission, montant_previsionnel_ht, statut)
select '{A}', '{ST}', case when g % 2 = 0 then '{CH1}'::uuid else '{CH2}'::uuid end, 'Mission ' || g, round(0.37 + (g * 31) % 700, 2),
       (array['prevue','en_cours','terminee','annulee'])[1 + g % 4]
from generate_series(1, 1462) g;
-- 1 462 documents par chantier, audiences mêlées (dont NULL).
insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience, created_at)
select '{A}', c.id, 'Doc ' || g, (array['photo_pendant','plan','autre'])[1 + g % 3], 'pgtap/' || c.n || '/' || g || '.jpg', 'image/jpeg', 100,
       (array['tous_affectes','encadrement','gestionnaires'])[1 + g % 3], timestamptz '2025-01-01' + g * interval '1 minute'
from generate_series(1, 1462) g cross join (values ('{CH1}'::uuid, 1), ('{CH2}'::uuid, 2)) c(id, n);
-- Notes de frais : 1 462 sur le chantier 1, quatre salariés, statuts variés, créées par l'ouvrier pour moitié.
insert into public.notes_frais (entreprise_id, employe_id, reference, date_frais, montant_ttc, statut, chantier_id, cree_par_utilisateur_id)
select '{A}', ('a2000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid, 'PGTAP-NF-' || g, date '2025-01-01' + g % 400, round(4.99 + (g * 17) % 300, 2),
       (array['brouillon','soumis','en_verification','correction_demandee','valide','refuse','exporte_comptabilite','verrouille'])[1 + g % 8],
       '{CH1}', case when g % 2 = 0 then '10000000-0000-0000-0000-000000000002'::uuid else '10000000-0000-0000-0000-000000000001'::uuid end
from generate_series(1, 1462) g;
-- Paie : un dossier par salarié, une anomalie par dossier.
insert into public.dossiers_paie_salaries (entreprise_id, periode_id, employe_id, total_paniers, total_trajets, total_transports, total_grands_deplacements, total_primes, total_acomptes, total_notes_frais)
select '{A}', '{PER}', e.id, 10.5, 3.25, 7.1, 31.3, 50.05 * row_number() over (order by e.id), 100, 12.34
from public.employes e where e.entreprise_id = '{A}';
insert into public.anomalies_paie (entreprise_id, periode_id, dossier_id, niveau, code, description)
select '{A}', '{PER}', d.id, 'attention', 'PGTAP', 'Contrôle' from public.dossiers_paie_salaries d where d.periode_id = '{PER}';
insert into public.pieces_jointes_paie (entreprise_id, employe_id, dossier_id, type_document, nom_original, storage_path, mime_type, taille_octets, importe_par)
select '{A}', d.employe_id, d.id, 'justificatif', 'p' || k || '.pdf', 'pgtap/paie/' || d.id || '/' || k || '.pdf', 'application/pdf', 100, '10000000-0000-0000-0000-000000000001'
from public.dossiers_paie_salaries d cross join generate_series(1, 3) k where d.periode_id = '{PER}';
-- CRM, stock et DOE.
insert into public.appels_contacts (entreprise_id, client_id, type, sens, objet, a_rappeler_at, termine)
select '{A}', '{CLI}', 'appel', 'sortant', 'Appel ' || g, case when g % 3 = 0 then now() end, g % 6 = 0 from generate_series(1, 1462) g;
insert into public.articles_stock (id, entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, actif)
select ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, '{A}', 'PGTAP-ART-' || g, 'Article ' || g, 'u', case when g % 7 = 0 then 1 else 50 end, 5, true
from generate_series(1, 1462) g;
insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, date)
select '{A}', ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, '{CH1}', 'sortie', 1, current_date from generate_series(1, 1462) g;
insert into public.fiches_techniques_articles (entreprise_id, article_id, titre, type_document, storage_path, nom_original, mime_type, taille_octets, origine)
select '{A}', ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, 'Fiche ' || g, 'fiche_technique', 'pgtap/fiches/' || g || '.pdf', 'f.pdf', 'application/pdf', 100, 'import_manuel'
from generate_series(1, 1462) g where g % 2 = 0;
reset session_replication_role;

"""

contenu = ENTETE + "\n".join(tests) + "\n\nselect * from finish();\nrollback;\n"
Path(__file__).resolve().parents[3].joinpath("supabase/tests/gp_residuel_agregats_v1.test.sql").write_text(contenu)
print("ok", contenu.count("\n"))
