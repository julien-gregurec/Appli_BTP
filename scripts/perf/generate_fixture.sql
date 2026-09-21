-- ============================================================================
-- ELSATIA Gestion Pro — fixture synthétique de qualification de capacité
-- (mission perf/gp-capacity-readiness-v1, docs/qualification/ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md)
--
-- Génère deux entreprises (tenants) synthétiques, aucune donnée personnelle
-- réelle, pour mesurer les performances à une échelle "PME BTP active" :
--   - Tenant A (principal)  : ~40 salariés, 200 clients, 150 chantiers,
--     ~5000 devis, ~3000 factures, ~100k+ pointages, 3-5 ans d'historique.
--   - Tenant B (secondaire) : échelle réduite, sert uniquement à vérifier
--     que les optimisations ne cassent jamais le cloisonnement tenant.
--
-- Usage : psql -d <db_jetable> -f generate_fixture.sql
-- Destiné à une base Postgres jetable (jamais Production / Preview en écriture).
-- Exécuté en tant que rôle superuser/postgres : contourne volontairement la
-- RLS (comme le ferait un job de seed côté plateforme), pour aller vite.
--
-- Mise à jour (mission ELSATIA_GP_DASHBOARD_SEARCH_PERFORMANCE_V1) : ce
-- script datait de perf/gp-capacity-readiness-v1 (release/gp-v1-rc) ; le
-- schéma a divergé depuis (dénormalisation entreprise_id sur lignes_devis/
-- lignes_factures déjà appliquée, colonnes employes/devis/factures/
-- planning_evenements renommées ou supprimées, plafond de personnes
-- actives ajouté). Remis en état de marche contre le schéma courant sans
-- changer les volumétries ni la logique de génération.
-- ============================================================================

set client_min_messages = warning;
select setseed(0.42);

-- --------------------------------------------------------------------------
-- 0. Schéma de travail (staging), supprimé en fin de script.
-- --------------------------------------------------------------------------
drop schema if exists fx cascade;
create schema fx;

create table fx.entreprises (seq int primary key, id uuid not null, taille text not null);

create table fx.auth_users (seq int primary key, id uuid not null, entreprise_seq int not null, email text not null);

create table fx.postes (seq int primary key, id uuid not null, entreprise_seq int not null, nom text not null);

create table fx.employes (seq int primary key, id uuid not null, entreprise_seq int not null,
  poste_seq int not null, utilisateur_seq int, date_entree date not null, date_sortie date);

create table fx.clients (seq int primary key, id uuid not null, entreprise_seq int not null);

create table fx.chantiers (seq int primary key, id uuid not null, entreprise_seq int not null,
  client_seq int not null, statut text not null, date_debut date not null);

create table fx.devis (seq int primary key, id uuid not null, entreprise_seq int not null,
  client_seq int not null, chantier_seq int, nb_lignes int not null, statut_final text not null,
  date_emission date not null, tag text);

create table fx.factures (seq int primary key, id uuid not null, entreprise_seq int not null,
  client_seq int not null, chantier_seq int, nb_lignes int not null, statut_final text not null,
  date_emission date not null, montant_ttc_cible numeric not null);

-- --------------------------------------------------------------------------
-- 1. Entreprises (tenants)
-- --------------------------------------------------------------------------
insert into fx.entreprises (seq, id, taille) values
  (1, 'a0000000-0000-4000-a000-000000000001', 'principale'),
  (2, 'b0000000-0000-4000-b000-000000000001', 'secondaire');

insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville,
  couleur_accent, gabarit_pdf, assurance_decennale_numero, assurance_rc_pro_numero,
  taux_penalites_retard, abonnement_statut, created_at)
select
  e.id,
  case e.taille when 'principale' then 'BTP Fixture Principale' else 'BTP Fixture Secondaire' end,
  case e.taille when 'principale' then 'BTP FIXTURE PRINCIPALE SARL' else 'BTP FIXTURE SECONDAIRE SARL' end,
  case e.taille when 'principale' then '84212345600019' else '84298765400012' end,
  '12 rue des Artisans', '69001', 'Lyon',
  '#0d1b2a', 'classique', 'DEC-FIXTURE-001', 'RCP-FIXTURE-001',
  1.5, 'actif',
  now() - interval '5 years'
from fx.entreprises e;

-- ACTIVE-PERSON-CAPACITY-R1-V1 (migration postérieure à l'écriture initiale de
-- cette fixture) : plafond dur de personnes actives par forfait. La fixture
-- vise 40/5 salariés — largement au-delà du forfait par défaut ('mini') —
-- on achète donc explicitement de la capacité supplémentaire pour ne pas
-- être bloqué par ce garde-fou, sans quoi le trigger de capacité rejetterait
-- l'insertion des salariés au-delà de la limite du forfait.
update public.entreprises set capacite_personnes_supplementaire = 1000;

-- --------------------------------------------------------------------------
-- 2. Utilisateurs (comptes de connexion) — auth.users + public.utilisateurs
--    Tenant A : 20 comptes (sur 40 salariés). Tenant B : 4 comptes (sur 5).
-- --------------------------------------------------------------------------
insert into fx.auth_users (seq, id, entreprise_seq, email)
select
  row_number() over (order by ent.seq, g),
  gen_random_uuid(),
  ent.seq,
  'fixture.' || ent.taille || '.' || g || '@perf.invalid'
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 20 else 4 end) g;

-- Utilisateurs de banc de mesure, UUID fixes (reproductibles d'un reset à
-- l'autre) : un par tenant, rattaché au premier utilisateur généré.
update fx.auth_users set id = 'facc0000-0000-4000-a000-000000000001'
where seq = (select min(seq) from fx.auth_users where entreprise_seq = 1);
update fx.auth_users set id = 'facc0000-0000-4000-b000-000000000001'
where seq = (select min(seq) from fx.auth_users where entreprise_seq = 2);

insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, aud, role)
select id, email, 'x', '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
from fx.auth_users;

-- Le trigger on_auth_user_created (handle_new_user) a déjà créé la ligne
-- public.utilisateurs lors de l'insert ci-dessus (pattern standard Supabase) ;
-- on complète juste le profil.
update public.utilisateurs pu
set nom = 'Nom' || u.seq, prenom = 'Prenom' || u.seq, entreprise_active_id = e.id
from fx.auth_users u
join fx.entreprises e on e.seq = u.entreprise_seq
where pu.id = u.id;

-- --------------------------------------------------------------------------
-- 3. Postes
-- --------------------------------------------------------------------------
insert into fx.postes (seq, id, entreprise_seq, nom)
select
  row_number() over (order by ent.seq, p.nom),
  gen_random_uuid(),
  ent.seq,
  p.nom
from fx.entreprises ent
cross join (values ('Dirigeant'), ('Conducteur de travaux'), ('Chef d''équipe'),
                    ('Ouvrier qualifié'), ('Ouvrier'), ('Secrétariat / Compta')) as p(nom);

insert into public.postes (id, entreprise_id, nom)
select p.id, e.id, p.nom
from fx.postes p join fx.entreprises e on e.seq = p.entreprise_seq;

-- Octroie toutes les permissions à tous les postes (hypothèse simplificatrice
-- de la fixture : on qualifie la volumétrie/perf, pas la matrice de droits —
-- cf. RUNBOOK, permissions déjà couvertes par les audits RLS existants).
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select e.id, p.id, pd.cle, true
from fx.postes p
join fx.entreprises e on e.seq = p.entreprise_seq
cross join public.permissions_disponibles pd;

-- --------------------------------------------------------------------------
-- 4. Salariés (employes) — 40 pour le tenant principal, 5 pour le secondaire.
--    Ancienneté étalée sur 3 à 5 ans ; ~50% ont un compte applicatif.
-- --------------------------------------------------------------------------
insert into fx.employes (seq, id, entreprise_seq, poste_seq, utilisateur_seq, date_entree, date_sortie)
select
  row_number() over (order by ent.seq, g),
  gen_random_uuid(),
  ent.seq,
  (select p.seq from fx.postes p where p.entreprise_seq = ent.seq
     order by case when g <= 1 then 1 -- 1er salarié = Dirigeant
                    when g <= 5 then 2 -- conducteurs de travaux
                    when g <= 10 then 3 -- chefs d'équipe
                    when g % 2 = 0 then 4 else 5 end, p.nom limit 1),
  null,
  (current_date - ((365 * 5 * random())::int || ' days')::interval)::date,
  case when random() < 0.06 then (current_date - (random()*400)::int) else null end
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 40 else 5 end) g;

-- Un salarié sur deux (au plus, dans la limite des comptes dispo) est lié à un utilisateur_id.
update fx.employes emp
set utilisateur_seq = sub.utilisateur_seq
from (
  select emp2.seq as employe_seq, au.seq as utilisateur_seq
  from (
    select seq, entreprise_seq, row_number() over (partition by entreprise_seq order by seq) rn
    from fx.employes
  ) emp2
  join (
    select seq, entreprise_seq, row_number() over (partition by entreprise_seq order by seq) rn
    from fx.auth_users
  ) au on au.entreprise_seq = emp2.entreprise_seq and au.rn = emp2.rn
) sub
where emp.seq = sub.employe_seq;

insert into public.employes (id, entreprise_id, prenom, nom, email, telephone, poste, type_contrat,
  date_entree, date_sortie, taux_horaire, statut, numero_inscription, identifiant_interne, poste_id, utilisateur_id)
select
  emp.id, ent.id,
  'Prenom' || emp.seq, 'NomSalarie' || emp.seq,
  'salarie' || emp.seq || '.' || ent.taille || '@perf.invalid',
  '06' || lpad((10000000 + emp.seq)::text, 8, '0'),
  p.nom, case when random() < 0.85 then 'cdi' else 'cdd' end,
  emp.date_entree, emp.date_sortie,
  round((14 + random()*12)::numeric, 2),
  case when emp.date_sortie is not null then 'sorti' else 'actif' end,
  'MAT-' || ent.taille || '-' || lpad(emp.seq::text, 5, '0'),
  'SAL-' || ent.taille || '-' || lpad(emp.seq::text, 5, '0'),
  p.id,
  au.id
from fx.employes emp
join fx.entreprises ent on ent.seq = emp.entreprise_seq
join fx.postes p on p.seq = emp.poste_seq
left join fx.auth_users au on au.seq = emp.utilisateur_seq;

-- utilisateurs_entreprises : rattache chaque compte de connexion à son entreprise (actif),
-- condition nécessaire à est_membre_actif() / RLS.
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select au.id, ent.id,
  (select emp.poste_id from public.employes emp where emp.utilisateur_id = au.id limit 1),
  'actif'
from fx.auth_users au
join fx.entreprises ent on ent.seq = au.entreprise_seq;

-- --------------------------------------------------------------------------
-- 5. Clients + contacts (200 / 20)
-- --------------------------------------------------------------------------
insert into fx.clients (seq, id, entreprise_seq)
select row_number() over (order by ent.seq, g), gen_random_uuid(), ent.seq
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 200 else 20 end) g;

insert into public.clients (id, entreprise_id, type, nom, prenom, societe, raison_sociale, siret,
  adresse_facturation, code_postal, ville, telephone, email, statut, created_at)
select
  c.id, ent.id,
  case when random() < 0.55 then 'professionnel' else 'particulier' end,
  case when random() < 0.55 then null else 'Client' || c.seq end,
  case when random() < 0.55 then null else 'Prenom' || c.seq end,
  case when random() < 0.55 then 'Societe Fixture ' || c.seq else null end,
  case when random() < 0.55 then 'SOCIETE FIXTURE ' || c.seq || ' SARL' else null end,
  case when random() < 0.55 then lpad((800000000 + c.seq)::text, 14, '0') else null end,
  (c.seq % 900 + 1) || ' rue de la Fixture',
  lpad((69000 + (c.seq % 90))::text, 5, '0'), 'Lyon',
  '04' || lpad((70000000 + c.seq)::text, 8, '0'),
  'client' || c.seq || '.' || ent.taille || '@perf.invalid',
  (array['prospect','actif','actif','actif','inactif'])[1 + floor(random()*5)],
  now() - ((random()*1800)::int || ' days')::interval
from fx.clients c
join fx.entreprises ent on ent.seq = c.entreprise_seq;

insert into public.contacts_clients (client_id, nom, fonction, telephone, email, principal, created_at)
select cl.id, 'Contact ' || cl.seq || '.' || k,
  (array['Achats','Direction','Travaux','Compta'])[1 + floor(random()*4)],
  '06' || lpad((20000000 + cl.seq*10 + k)::text, 8, '0'),
  'contact' || cl.seq || '.' || k || '@perf.invalid',
  k = 1,
  now() - ((random()*1700)::int || ' days')::interval
from fx.clients cl
cross join generate_series(1, 2) k;

-- --------------------------------------------------------------------------
-- 6. Chantiers (150 / 15), rattachés à des clients au hasard, historique 3-5 ans.
-- --------------------------------------------------------------------------
insert into fx.chantiers (seq, id, entreprise_seq, client_seq, statut, date_debut)
select
  row_number() over (order by ent.seq, g),
  gen_random_uuid(),
  ent.seq,
  (select cl.seq from fx.clients cl where cl.entreprise_seq = ent.seq
     order by random() limit 1),
  (array['prospect','en_cours','en_cours','termine','termine','termine','en_pause'])[1 + floor(random()*7)],
  (current_date - ((365*5)*random())::int)
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 150 else 15 end) g;

insert into public.chantiers (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut,
  date_debut_prevue, date_fin_prevue, date_debut_reelle, budget_previsionnel, created_at)
select
  ch.id, ent.id, cl.id,
  'Chantier ' || ch.seq || ' — ' || (array['Rénovation','Extension','Neuf','Toiture','Façade','Aménagement'])[1+floor(random()*6)],
  (ch.seq % 500 + 1) || ' avenue du Chantier', lpad((69000 + (ch.seq % 90))::text, 5, '0'), 'Lyon',
  ch.statut, ch.date_debut, ch.date_debut + (30 + random()*300)::int,
  case when ch.statut in ('en_cours','termine','en_pause') then ch.date_debut else null end,
  round((5000 + random()*180000)::numeric, 2),
  ch.date_debut::timestamptz
from fx.chantiers ch
join fx.entreprises ent on ent.seq = ch.entreprise_seq
join fx.clients cl on cl.seq = ch.client_seq;

-- --------------------------------------------------------------------------
-- 7. Devis (5000 + 12 "lourds" pour le tenant principal ; 300 pour le secondaire)
--    + lignes_devis. Respecte le verrou "lignes modifiables seulement en
--    brouillon" : on insère les lignes AVANT de faire passer le devis à son
--    statut final (brouillon -> le statut réel met à jour le numéro via trigger).
-- --------------------------------------------------------------------------
insert into fx.devis (seq, id, entreprise_seq, client_seq, chantier_seq, nb_lignes, statut_final, date_emission, tag)
select
  row_number() over (order by ent.seq, g),
  gen_random_uuid(),
  ent.seq,
  cl.seq,
  case when random() < 0.4 then ch.seq else null end,
  -- distribution réaliste : surtout de petits devis, quelques gros.
  case
    when random() < 0.55 then 2 + floor(random()*8)::int      -- 2-9 lignes
    when random() < 0.85 then 10 + floor(random()*20)::int    -- 10-29 lignes
    when random() < 0.97 then 30 + floor(random()*40)::int    -- 30-69 lignes
    else 70 + floor(random()*80)::int                          -- 70-149 lignes
  end,
  (array['brouillon','envoye','envoye','accepte','accepte','accepte','refuse','expire'])[1+floor(random()*8)],
  (current_date - ((365*5)*random())::int),
  null
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 5000 else 300 end) g
join lateral (select seq from fx.clients cl where cl.entreprise_seq = ent.seq order by random() limit 1) cl on true
left join lateral (select seq from fx.chantiers ch where ch.entreprise_seq = ent.seq order by random() limit 1) ch on true;

-- Devis "lourds" dédiés au scénario § 11 (20 / 100 / 500 / 1000 lignes), tenant principal.
insert into fx.devis (seq, id, entreprise_seq, client_seq, chantier_seq, nb_lignes, statut_final, date_emission, tag)
select
  (select max(seq) from fx.devis) + row_number() over (order by t.nb),
  gen_random_uuid(), 1,
  (select seq from fx.clients where entreprise_seq = 1 order by random() limit 1),
  null,
  t.nb, 'accepte', current_date - (random()*90)::int,
  'PERF-' || t.nb || 'L'
from (values (20),(20),(20),(100),(100),(100),(500),(500),(500),(1000),(1000),(1000)) as t(nb);

insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission, date_validite,
  remise_globale, created_at)
select d.id, ent.id, cl.id, ch.id, 'brouillon', d.date_emission, d.date_emission + 60,
  case when random() < 0.15 then round((random()*5)::numeric, 2) else 0 end,
  d.date_emission::timestamptz
from fx.devis d
join fx.entreprises ent on ent.seq = d.entreprise_seq
join fx.clients cl on cl.seq = d.client_seq
left join fx.chantiers ch on ch.seq = d.chantier_seq;

insert into public.lignes_devis (devis_id, designation, description, type, quantite, unite,
  prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select
  d.id,
  'Prestation ' || d.seq || '.' || ln,
  'Poste de travaux généré pour la qualification de capacité (fixture).',
  (array['fourniture','main_oeuvre','fourniture','sous_traitance'])[1+floor(random()*4)],
  round((1 + random()*40)::numeric, 2),
  (array['u','m2','ml','h','forfait'])[1+floor(random()*5)],
  round((10 + random()*450)::numeric, 2),
  case when random() < 0.1 then round((random()*10)::numeric, 2) else 0 end,
  (array[20,10,5.5])[1+floor(random()*3)],
  ln
from fx.devis d
cross join lateral generate_series(1, d.nb_lignes) ln;

-- Passage au statut final : déclenche la numérotation (trigger set_devis_numero).
update public.devis dv
set statut = d.statut_final
from fx.devis d
where dv.id = d.id and d.statut_final <> 'brouillon';

-- --------------------------------------------------------------------------
-- 8. Factures (3000 / 200) + lignes_factures + paiements.
--    Même contrainte : lignes insérées en brouillon puis statut mis à jour.
-- --------------------------------------------------------------------------
insert into fx.factures (seq, id, entreprise_seq, client_seq, chantier_seq, nb_lignes, statut_final, date_emission, montant_ttc_cible)
select
  row_number() over (order by ent.seq, g),
  gen_random_uuid(), ent.seq, cl.seq,
  case when random() < 0.5 then ch.seq else null end,
  case
    when random() < 0.6 then 1 + floor(random()*6)::int
    when random() < 0.9 then 7 + floor(random()*15)::int
    else 22 + floor(random()*30)::int
  end,
  (array['brouillon','envoyee','envoyee','payee','payee','payee','envoyee','annulee'])[1+floor(random()*8)],
  (current_date - ((365*5)*random())::int),
  0
from fx.entreprises ent
cross join lateral generate_series(1, case ent.taille when 'principale' then 3000 else 200 end) g
join lateral (select seq from fx.clients cl where cl.entreprise_seq = ent.seq order by random() limit 1) cl on true
left join lateral (select seq from fx.chantiers ch where ch.entreprise_seq = ent.seq order by random() limit 1) ch on true;

insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, date_emission,
  date_echeance, created_at)
select f.id, ent.id, cl.id, ch.id, 'simple', 'brouillon', f.date_emission, f.date_emission + 30,
  f.date_emission::timestamptz
from fx.factures f
join fx.entreprises ent on ent.seq = f.entreprise_seq
join fx.clients cl on cl.seq = f.client_seq
left join fx.chantiers ch on ch.seq = f.chantier_seq;

insert into public.lignes_factures (facture_id, designation, description, type, quantite, unite,
  prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select
  f.id,
  'Prestation facturée ' || f.seq || '.' || ln,
  'Ligne générée pour la qualification de capacité (fixture).',
  (array['fourniture','main_oeuvre','fourniture','sous_traitance'])[1+floor(random()*4)],
  round((1 + random()*30)::numeric, 2),
  (array['u','m2','ml','h','forfait'])[1+floor(random()*5)],
  round((10 + random()*450)::numeric, 2),
  0,
  (array[20,10,5.5])[1+floor(random()*3)],
  ln
from fx.factures f
cross join lateral generate_series(1, f.nb_lignes) ln;

-- Passage à "envoyee" d'abord (statut intermédiaire obligatoire : le trigger
-- trg_facture_statut_paiement_coherent interdit de poser "payee" directement
-- sans montant_paye = montant_ttc). "annulee" ne passe pas par les paiements.
update public.factures fa
set statut = 'envoyee'
from fx.factures f
where fa.id = f.id and f.statut_final in ('envoyee', 'payee');

update public.factures fa
set statut = 'annulee'
from fx.factures f
where fa.id = f.id and f.statut_final = 'annulee';

-- Paiements : complets sur les factures ciblées "payee" (le trigger
-- recalc_paiements_apres_paiement fait alors passer automatiquement le
-- statut à "payee"), partiels sur ~30% des "envoyee" restantes ("payee_partiel").
insert into public.paiements (facture_id, montant, date, mode, reference)
select fa.id,
  round((fa.montant_ttc * (case when f.statut_final = 'payee' then 1.0 else 0.3 + random()*0.4 end))::numeric, 2),
  fa.date_emission + (random()*25)::int,
  (array['virement','cheque','virement','cb'])[1+floor(random()*4)],
  'REF-' || fa.numero
from fx.factures f
join public.factures fa on fa.id = f.id
where fa.montant_ttc > 0
  and (f.statut_final = 'payee' or (f.statut_final = 'envoyee' and random() < 0.3));

-- --------------------------------------------------------------------------
-- 9. Situations de travaux (facturation à l'avancement) — sous-ensemble de
--    chantiers "en_cours"/"termine" du tenant principal.
-- --------------------------------------------------------------------------
with chantiers_situation as (
  select ch.seq, ch.id, ch.entreprise_seq,
    (select d.id from fx.devis d where d.chantier_seq = ch.seq and d.entreprise_seq = ch.entreprise_seq limit 1) as devis_id
  from fx.chantiers ch
  where ch.entreprise_seq = 1 and ch.statut in ('en_cours','termine')
  order by random() limit 25
),
avec_devis as (
  select cs.*, coalesce(devis_id, (select d.id from fx.devis d where d.entreprise_seq = cs.entreprise_seq order by random() limit 1)) as devis_final
  from chantiers_situation cs
)
insert into public.situations_travaux (entreprise_id, devis_id, chantier_id, numero, date_situation,
  statut, montant_marche_ht, montant_cumule_ht, montant_periode_ht)
select ent.id, ad.devis_final, ad.id, n,
  current_date - ((5-n) * 30),
  case when n < 4 then 'facturee' else 'validee' end,
  50000, n * 10000, 10000
from avec_devis ad
join fx.entreprises ent on ent.seq = ad.entreprise_seq
cross join generate_series(1, 4) n;

-- --------------------------------------------------------------------------
-- 10. Pointages — le scénario le plus volumineux (40 salariés x ~230 j/an x
--     jusqu'à 5 ans, avec 1 à 3 pointages/jour pour simuler des journées sur
--     plusieurs chantiers). Cible : 100 000+ lignes.
-- --------------------------------------------------------------------------
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales,
  heures_supplementaires, pause_minutes, tache, verification_statut, created_at)
select
  ent.id, emp.id, ch.id,
  d::date,
  case when random() < 0.85 then 7 else 3.5 end,
  case when random() < 0.15 then round((random()*3)::numeric, 2) else 0 end,
  (array[30,45,60])[1+floor(random()*3)],
  (array['Maçonnerie','Second oeuvre','Finitions','Pose','Préparation','Nettoyage chantier'])[1+floor(random()*6)],
  (array['sans_preuve','a_verifier','valide','valide'])[1+floor(random()*4)],
  d::timestamptz
from fx.employes emp
join fx.entreprises ent on ent.seq = emp.entreprise_seq
cross join lateral generate_series(
  greatest(emp.date_entree, current_date - interval '5 years'),
  least(coalesce(emp.date_sortie, current_date), current_date),
  interval '1 day'
) d
join lateral (
  select seq from fx.chantiers c2 where c2.entreprise_seq = emp.entreprise_seq order by random() limit 1
) csel on true
join fx.chantiers ch on ch.seq = csel.seq
cross join lateral generate_series(1,
  case when extract(isodow from d) = 7 then 0  -- jamais le dimanche
       when extract(isodow from d) = 6 then (case when random() < 0.25 then 1 else 0 end) -- samedi occasionnel
       when random() < 0.35 then 1
       when random() < 0.70 then 2
       else 3 end
) rep
where extract(isodow from d) <> 7;

-- --------------------------------------------------------------------------
-- 11. Notes de frais — ~1.5/mois/salarié sur 4 ans.
-- --------------------------------------------------------------------------
insert into public.notes_frais (entreprise_id, employe_id, date_frais, montant_ttc, categorie,
  description, statut, reference, date_import)
select
  ent.id, emp.id,
  (current_date - (random()*1460)::int),
  round((8 + random()*180)::numeric, 2),
  (array['carburant','repas','peage','materiel','hebergement'])[1+floor(random()*5)],
  'Frais généré pour la qualification de capacité (fixture).',
  (array['soumise','validee','validee','remboursee','refusee'])[1+floor(random()*5)],
  'NF-FX-' || emp.seq || '-' || n,
  now()
from fx.employes emp
join fx.entreprises ent on ent.seq = emp.entreprise_seq
cross join generate_series(1, case ent.taille when 'principale' then 70 else 20 end) n;

-- --------------------------------------------------------------------------
-- 12. Planning — ~5000 évènements historiques (3 ans) pour le tenant
--     principal, dont une fenêtre récente dense (~450 évènements sur les
--     8 dernières semaines, pour le scénario "vue mensuelle 40 salariés").
-- --------------------------------------------------------------------------
insert into public.planning_evenements (entreprise_id, chantier_id, titre, type, statut,
  debut, fin)
select
  ent.id, ch.id,
  'Intervention ' || ch.seq || '.' || g,
  (array['intervention','rdv_client','livraison','controle'])[1+floor(random()*4)],
  (array['planifie','confirme','termine','termine','termine'])[1+floor(random()*5)],
  ts, ts + (interval '2 hour' + (round((random()*6)::numeric, 4) || ' hours')::interval)
from fx.chantiers ch
join fx.entreprises ent on ent.seq = ch.entreprise_seq
join fx.clients cl on cl.seq = ch.client_seq
cross join lateral generate_series(1, case ent.taille when 'principale' then 30 else 5 end) g
cross join lateral (
  select (now() - (round((random()*1095)::numeric, 4) || ' days')::interval)
    + ((8 + floor(random()*9))||' hours')::interval as ts
) t;

-- Fenêtre récente dense (dernières 8 semaines), tenant principal uniquement.
insert into public.planning_evenements (entreprise_id, chantier_id, titre, type, statut, debut, fin)
select
  ent.id, ch.id,
  'Intervention récente ' || g,
  (array['intervention','rdv_client','controle'])[1+floor(random()*3)],
  (array['planifie','confirme'])[1+floor(random()*2)],
  ts, ts + interval '4 hour'
from fx.entreprises ent
cross join generate_series(1, 450) g
join lateral (select seq from fx.chantiers c2 where c2.entreprise_seq = ent.seq order by random() limit 1) csel on true
join fx.chantiers ch on ch.seq = csel.seq
join fx.clients cl on cl.seq = ch.client_seq
cross join lateral (
  select (now() - (round((random()*56)::numeric, 4) || ' days')::interval) + ((8+floor(random()*9))||' hours')::interval as ts
) t
where ent.taille = 'principale';

-- --------------------------------------------------------------------------
-- 13. Documents de chantier (métadonnées seules ; pas de vrais blobs).
-- --------------------------------------------------------------------------
insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path,
  mime_type, taille_octets, created_at)
select
  ent.id, ch.id,
  'Document ' || ch.seq || '.' || g || '.pdf',
  (array['photo_avant','photo_pendant','photo_apres','plan','bon_livraison','autre'])[1+floor(random()*6)],
  ent.id || '/' || ch.id || '/doc-' || g || '.pdf',
  'application/pdf',
  (50000 + random()*4000000)::bigint,
  now() - (round((random()*900)::numeric, 4) || ' days')::interval
from fx.chantiers ch
join fx.entreprises ent on ent.seq = ch.entreprise_seq
cross join lateral generate_series(1, 2 + floor(random()*5)::int) g;

-- --------------------------------------------------------------------------
-- 14. Notifications utilisateurs (~8000).
-- --------------------------------------------------------------------------
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message,
  niveau, lue_at, created_at)
select
  ent.id, au.id,
  (array['devis_accepte','facture_payee','pointage_anomalie','chantier_alerte'])[1+floor(random()*4)],
  'Notification fixture ' || n,
  'Notification générée pour la qualification de capacité.',
  (array['information','information','attention','critique'])[1+floor(random()*4)],
  case when random() < 0.6 then now() - (round((random()*400)::numeric, 4) || ' days')::interval else null end,
  now() - (round((random()*400)::numeric, 4) || ' days')::interval
from fx.auth_users au
join fx.entreprises ent on ent.seq = au.entreprise_seq
cross join generate_series(1, case ent.taille when 'principale' then 60 else 15 end) n;

-- --------------------------------------------------------------------------
-- 15. Journal d'activité (audit) — ~30 000 lignes, tenant principal.
-- --------------------------------------------------------------------------
insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description, created_at)
select
  ent.id, au.id,
  (array['creation','modification','suppression','validation'])[1+floor(random()*4)],
  (array['devis','facture','client','chantier','pointage'])[1+floor(random()*5)],
  gen_random_uuid(),
  'Action générée pour la qualification de capacité (fixture).',
  now() - (round((random()*1800)::numeric, 4) || ' days')::interval
from fx.auth_users au
join fx.entreprises ent on ent.seq = au.entreprise_seq
cross join generate_series(1, case ent.taille when 'principale' then 1400 else 100 end) n;

-- --------------------------------------------------------------------------
-- 16. Recalcul des agrégats + nettoyage du schéma de staging.
-- --------------------------------------------------------------------------
analyze;

drop schema fx cascade;

-- Résumé de contrôle (affiché en sortie de script).
select 'entreprises' t, count(*) from public.entreprises
union all select 'employes', count(*) from public.employes
union all select 'clients', count(*) from public.clients
union all select 'contacts_clients', count(*) from public.contacts_clients
union all select 'chantiers', count(*) from public.chantiers
union all select 'devis', count(*) from public.devis
union all select 'lignes_devis', count(*) from public.lignes_devis
union all select 'factures', count(*) from public.factures
union all select 'lignes_factures', count(*) from public.lignes_factures
union all select 'paiements', count(*) from public.paiements
union all select 'situations_travaux', count(*) from public.situations_travaux
union all select 'lignes_situations', count(*) from public.lignes_situations
union all select 'pointages', count(*) from public.pointages
union all select 'notes_frais', count(*) from public.notes_frais
union all select 'planning_evenements', count(*) from public.planning_evenements
union all select 'documents_chantier', count(*) from public.documents_chantier
union all select 'notifications_utilisateurs', count(*) from public.notifications_utilisateurs
union all select 'journal_activite', count(*) from public.journal_activite
order by 1;
