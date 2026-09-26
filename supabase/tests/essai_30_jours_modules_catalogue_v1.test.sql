-- ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1
-- Essai = 30 jours calendaires, accès borné aux modules catalogue "actif"
-- pendant l'essai, blocage propre sans suppression de données à expiration.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Fixture chargée : A et B naissent avec abonnement_statut = 'essai' (défaut
-- table) et abonnement_essai_fin ~30 jours dans le futur (trigger d'insertion),
-- sans offre choisie (abonnement_offre IS NULL) — état représentatif de tout
-- nouveau client avant souscription.
select is(
  (select abonnement_statut from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'essai', 'A : statut essai par défaut à la création (aucune offre choisie)'
);
select ok(
  (select abonnement_offre from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001') is null,
  'A : aucune offre choisie par défaut'
);
select ok(
  (select abonnement_essai_fin from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001') > current_date,
  'A : essai_fin dans le futur (trigger initialiser_essai_entreprise)'
);

-- ── A. essai actif sans offre → modules catalogue "actif" accessibles ───────
-- Un par module explicitement attendu par la décision produit.
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_chantiers']),
  'A1. essai actif : chantier (acces_chantiers) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_pointage']),
  'A2. essai actif : pointage (acces_pointage) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['saisir_ses_notes_frais']),
  'A3. essai actif : notes_frais (saisir_ses_notes_frais) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_flotte']),
  'A4. essai actif : vehicules (acces_flotte) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_outillage']),
  'A5. essai actif : materiel (acces_outillage) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_stock']),
  'A6. essai actif : stock (acces_stock) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_rentabilite']),
  'A7. essai actif : rentabilite_avancee (acces_rentabilite) accessible');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_ia']),
  'A8. essai actif : ia (acces_ia) accessible');

-- ── B. essai actif sans offre → modules "bientôt disponible" refusés ───────
-- `connect` est le seul module bientot du catalogue à porter déjà de vraies
-- permissions ; les autres (planning_avance, scan_ocr...) n'en couvrent
-- encore aucune, donc aucune URL réelle ne dépend d'elles aujourd'hui.
select is(
  (select statut_catalogue from public.modules_gestion_pro where code = 'connect'),
  'bientot', 'connect : statut catalogue = bientot (contrôle de cohérence du test)'
);
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_connecteurs']),
  'B1. essai actif : connect (bientot) refusé malgré l''essai');
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['gerer_connecteurs']),
  'B2. essai actif : gerer_connecteurs (bientot) refusé malgré l''essai');

-- ── C. essai actif sans offre → modules internes/non vendables refusés ─────
select is(
  (select count(*) from public.modules_gestion_pro
   where code in ('stockage_supplementaire','sauvegarde_renforcee') and statut_catalogue = 'actif'),
  0::bigint, 'C1. stockage_supplementaire (interne) et sauvegarde_renforcee (non_vendable) ne sont jamais "actif"'
);
-- Preuve directe de la borne SQL (statut_catalogue = 'actif' strictement) via
-- une ligne de catalogue jetable, isolée dans cette transaction (rollback en
-- fin de fichier) : un module "interne" avec permission réelle ne doit jamais
-- s'ouvrir pendant l'essai, même si la permission existe.
insert into public.modules_gestion_pro(code, nom, statut_catalogue, permissions_couvertes)
values ('test_interne_essai_v1', 'Test interne (jetable)', 'interne', array['test_permission_interne_v1']);
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['test_permission_interne_v1']),
  'C2. module catalogue "interne" avec permission réelle : jamais ouvert pendant l''essai');
insert into public.modules_gestion_pro(code, nom, statut_catalogue, permissions_couvertes)
values ('test_non_vendable_essai_v1', 'Test non vendable (jetable)', 'non_vendable', array['test_permission_non_vendable_v1']);
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['test_permission_non_vendable_v1']),
  'C3. module catalogue "non_vendable" avec permission réelle : jamais ouvert pendant l''essai');

-- ── I. aucune suppression de données ─────────────────────────────────────
select is(
  (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  4::bigint, 'I1. fiches employés de A présentes avant expiration de l''essai'
);

-- ── E. essai expiré sans offre → accès métier refusé ─────────────────────
update public.entreprises
set abonnement_essai_debut = current_date - 40, abonnement_essai_fin = current_date - 10
where id = 'a0000000-0000-0000-0000-000000000001';
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_stock']),
  'E1. essai expiré sans offre : stock (actif) refusé sans entitlement');
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_chantiers']),
  'E2. essai expiré sans offre : chantier refusé sans entitlement');

-- I (suite) : les données restent intactes après expiration, seul l'accès change.
select is(
  (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  4::bigint, 'I2. fiches employés de A toujours présentes après expiration de l''essai (aucune suppression)'
);

-- ── D. essai expiré + module acheté séparément → accès rouvert par l'achat ─
insert into public.modules_entreprises(entreprise_id, module_code, actif, origine, source)
values ('a0000000-0000-0000-0000-000000000001','stock',true,'achat','stripe');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_stock']),
  'D1. essai expiré : stock réaccessible via un entitlement acheté (indépendant de l''essai)');
select ok(not public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_chantiers']),
  'D2. essai expiré : chantier (non acheté séparément) reste refusé — l''achat n''élargit que le module acquis');

-- Repli défensif (abonnement_essai_fin historiquement absente, comme sur
-- d'anciennes lignes Production antérieures au trigger initialiser_essai_entreprise) :
-- non reproductible ici par un simple UPDATE, la contrainte
-- entreprises_essai_dates_coherentes interdisant désormais toute écriture avec
-- essai_fin NULL (elle protège tout nouveau client, exactement l'objectif visé).
-- Le repli `coalesce(abonnement_essai_fin, abonnement_essai_debut + 30)` dans
-- acces_module_pour_permission reste vérifié par lecture directe de sa
-- définition (migration 20260905000265) : il ne peut jamais mener à un essai
-- illimité, seulement à un bornage identique à 30 jours depuis le début.
select ok(
  pg_get_functiondef('public.acces_module_pour_permission(uuid,text[])'::regprocedure)
    like '%coalesce(%e.abonnement_essai_debut, e.created_at::date) + 30%',
  'repli. la définition SQL borne toujours l''essai à 30 jours même si essai_fin est absente'
);

-- ── G. statut réellement actif (offre active) → la branche essai ne s'applique
--       plus (le plan est alors seul juge, via permissionIncluseDansOffre côté
--       application) ; ce module RPC ne doit jamais accorder par essai un
--       statut qui n'est plus 'essai'.
update public.entreprises
set abonnement_statut = 'actif', abonnement_offre = 'business',
    abonnement_essai_debut = current_date - 40, abonnement_essai_fin = current_date - 10
where id = 'b0000000-0000-0000-0000-000000000001';
select ok(not public.acces_module_pour_permission('b0000000-0000-0000-0000-000000000001', array['acces_connecteurs']),
  'G1. statut actif (hors essai) : la branche essai ne joue plus, aucun octroi indu sur un module bientot'
);

-- ── J. multi-tenant : l'expiration/achat de A n'affecte jamais B ─────────
update public.entreprises
set abonnement_statut = 'essai', abonnement_offre = null,
    abonnement_essai_debut = current_date, abonnement_essai_fin = current_date + 30
where id = 'b0000000-0000-0000-0000-000000000001';
select ok(public.acces_module_pour_permission('b0000000-0000-0000-0000-000000000001', array['acces_stock']),
  'J1. B (essai actif propre, indépendant de A) : stock accessible'
);
select ok(not public.acces_module_pour_permission('b0000000-0000-0000-0000-000000000001', array['test_permission_interne_v1']),
  'J2. B : le module de test "interne" injecté pour A ne s''ouvre pas non plus pour B (catalogue global, jamais par tenant)'
);

-- ── K. capacité personnes (R1/R2) non régressée par l'état d'essai ────────
select is(
  public.capacite_personnes_base('a0000000-0000-0000-0000-000000000001'), 3,
  'K1. capacité base de A inchangée par l''expiration de l''essai (toujours dérivée du plan/repli, jamais de l''essai)'
);
select is(
  public.capacite_personnes_totale('a0000000-0000-0000-0000-000000000001'), 3,
  'K2. capacité totale de A inchangée'
);

select * from finish();
rollback;
