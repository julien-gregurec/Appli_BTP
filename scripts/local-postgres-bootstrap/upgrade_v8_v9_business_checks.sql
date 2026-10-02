-- Train canonique V9 — contrôles métier après upgrade V8 (+ 813) → V9 (pgTAP, transaction annulée).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

-- Sécurité (1001)
select is((select count(*)::int from pg_policies where schemaname = 'public'
            and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%entreprise_sans_membres%'),
  0, 'S01 aucune policy ne garde la clause entreprise_sans_membres');
create temp table _u as
  select u.id from auth.users u
  where not exists (select 1 from public.utilisateurs_entreprises ue where ue.utilisateur_id = u.id and ue.entreprise_id = 'e9000000-0000-4000-8000-0000000000e9')
  order by u.id limit 1;
grant select on _u to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from _u), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select id::text from _u), true);
set local role authenticated;
select is((select count(*)::int from public.postes where entreprise_id = 'e9000000-0000-4000-8000-0000000000e9'), 0,
  'S02 un utilisateur étranger ne lit plus les postes d''une entreprise sans membre (données de l''ère V8)');
select is((select count(*)::int from public.permissions_poste where entreprise_id = 'e9000000-0000-4000-8000-0000000000e9'), 0,
  'S03 ni sa matrice de permissions');
reset role;
select is((select count(*)::int from public.postes where entreprise_id = 'e9000000-0000-4000-8000-0000000000e9') > 0, true,
  'S04 les postes de l''entreprise vide sont conservés (aucune donnée supprimée)');

-- Billing / Stripe (1002, 1003)
select is((select code_offre || ':' || periodicite || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'a7400000-0000-4000-8000-000000000050'),
  'mini:mensuel:69.00', 'B01 contrat de l''ère V7 au prix 69 € intact (aucun repricing)');
select is((select code_offre || ':' || periodicite || ':' || prix_contractuel_ht from public.abonnements_entreprises where entreprise_id = 'e9000000-0000-4000-8000-0000000000a1'),
  'pro:mensuel:199.00', 'B02 contrat Pro mensuel de l''ère V8 intact');
select ok((select prosrc from pg_proc where oid = 'public.synchroniser_abonnement_stripe_service(uuid,text,text,text,text,text,date,date,timestamptz,timestamptz,timestamptz)'::regprocedure)
  like '%v_contrat_periodicite is not distinct from p_periodicite%', 'B03 P1 en place');
select ok((select prosrc from pg_proc where oid = 'public.appliquer_evenement_facture_abonnement_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text)'::regprocedure)
  like '%facture_essai_sans_montant%', 'B04 P7 en place');

-- Legal Consent (901) : aucune acceptation rétroactive
select is((select count(*)::int from platform.acceptations_documents_legaux), 0, 'L01 aucune acceptation fabriquée par l''upgrade');

-- Plateforme (813 intacte après V9)
select ok((select prosrc from pg_proc where oid = 'public.plateforme_annuaire_entreprises'::regproc) !~ 'perform\s+public\.appliquer_suspensions_impayes'
  and (select provolatile from pg_proc where oid = 'public.plateforme_annuaire_entreprises'::regproc) = 's',
  'P01 annuaire plateforme toujours en lecture pure (813)');

-- RGPD (1201-1203)
select is((select count(*)::int from information_schema.tables t where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
            and not exists (select 1 from platform.rgpd_export_catalogue c where c.table_nom = t.table_name)),
  0, 'R01 catalogue d''export : toute table public classée');
select ok((select prosrc from pg_proc where oid = 'public.exporter_donnees_entreprise(uuid)'::regprocedure) like '%export_rgpd_section_autorisee%'
  and (select prosrc from pg_proc where oid = 'public.exporter_donnees_entreprise(uuid)'::regprocedure) like '%est_acces_support_actif%',
  'R02 export JSON : sections RH retirées (0806) ET refus de la session d''assistance (1201)');

-- Mode sûr
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p') and not public.incident_table_exemptee(c.relname)
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
  0, 'I01 toute table public (dont celles de V9) porte la garde du mode sûr');
select is((select count(*)::int from public.incident_controles where actif), 0, 'I02 aucun contrôle actif après upgrade');

-- Nouveaux lots : tables vides, données existantes intactes
select is((select count(*)::int from public.gp_tools_imports) + (select count(*)::int from public.tools_releves_estimation_prix), 0,
  'N01 Lots 10-11 : tables nouvelles vides après upgrade');
select ok((select count(*) from public.tools_releves_ouvrages) >= 0 and to_regclass('public.tools_releves_estimation_parametres') is not null,
  'N02 Relevé : tables Lot 10 présentes');
select ok(not has_function_privilege('authenticated', 'public.consulter_rate_limit(text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.consulter_rate_limit(text,text,integer,integer)', 'EXECUTE'),
  'N03 rate limit de connexion : consultation service_role seul');
select ok(to_regclass('public.cles_chiffrement_bancaire') is not null
  and (select relrowsecurity from pg_class where oid = 'public.cles_chiffrement_bancaire'::regclass),
  'N04 trousseau bancaire présent, RLS active');

select * from finish();
rollback;
