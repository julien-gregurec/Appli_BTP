-- ELSATIA SOAK V1 — générateur de tenant volumétrique (base jetable uniquement).
-- Crée UN tenant k (1..99) avec N devis, N factures, N notifications, N documents,
-- N tâches, max(10,N/10) chantiers, effectif E, et (option) J jours de pointages.
-- Données 100 % synthétiques (@soak.invalid). Exécuté en superuser (comme la fixture).
--
-- Usage :
--   psql -d soak -v k=11 -v n=1000 -v e=20 -v jours=0 -f volume_tenant.sql
-- UUID déterministes : entreprise e0000000-0000-4000-e000-0000000000KK,
-- utilisateur admin    facc0000-0000-4000-e000-0000000000KK.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
select setseed(0.1 * :k / 100.0);
\set ent '\'e0000000-0000-4000-e000-0000000000' :k '\''
\set adm '\'facc0000-0000-4000-e000-0000000000' :k '\''

begin;
drop schema if exists sg cascade;
create schema sg;
create table sg.p as select :ent::uuid ent, :adm::uuid adm, :n::int n, :e::int e, :jours::int jours, :k::int k;

insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville,
  couleur_accent, gabarit_pdf, assurance_decennale_numero, assurance_rc_pro_numero,
  taux_penalites_retard, abonnement_statut, created_at, capacite_personnes_supplementaire)
select ent, 'Soak T' || k || ' (N=' || n || ')', 'SOAK T' || k || ' SAS', lpad((84300000000000 + k*1000 + 7)::text, 14, '0'),
  '1 rue du Soak', '67000', 'Strasbourg', '#0d1b2a', 'classique', 'DEC-SOAK', 'RCP-SOAK', 1.5, 'actif',
  now() - interval '5 years', 100000
from sg.p;
-- Commit immédiat : la création d'entreprise prend le compteur GLOBAL
-- next_reference(null,'entreprise') ; le garder pendant toute la génération
-- bloquerait toute autre création d'entreprise (constat SOAK V1, § E/P2).
commit;
begin;

-- Utilisateurs : 1 admin (fixe) + 4 autres.
create table sg.users as
select case when g = 1 then p.adm else gen_random_uuid() end id, g
from sg.p, generate_series(1, 5) g;
insert into auth.users (id, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, aud, role)
select u.id, 'soak.t' || p.k || '.u' || u.g || '@soak.invalid', 'x', '{}', '{}', 'authenticated', 'authenticated' from sg.users u, sg.p p;
update public.utilisateurs pu set nom = 'Soak' || u.g, prenom = 'U' || u.g, entreprise_active_id = p.ent
from sg.users u, sg.p p where pu.id = u.id;

create table sg.postes as select gen_random_uuid() id, nom from (values ('Dirigeant'),('Chef d''équipe'),('Ouvrier')) v(nom);
insert into public.postes (id, entreprise_id, nom) select id, p.ent, nom from sg.postes, sg.p p;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.ent, po.id, pd.cle, true from sg.postes po, sg.p p, public.permissions_disponibles pd;

-- Salariés : E (les 5 premiers liés aux comptes).
create table sg.emp as
select gen_random_uuid() id, g, (current_date - ((365*5*random())::int))::date entree from sg.p p, generate_series(1, p.e) g;
insert into public.employes (id, entreprise_id, prenom, nom, email, poste, type_contrat, date_entree, statut,
  numero_inscription, identifiant_interne, poste_id, utilisateur_id)
select em.id, p.ent, 'P' || em.g, 'Soak' || p.k || '_' || em.g, 's' || em.g || '.t' || p.k || '@soak.invalid',
  case when em.g = 1 then 'Dirigeant' else 'Ouvrier' end, 'cdi', em.entree, 'actif',
  'MAT-S' || p.k || '-' || lpad(em.g::text, 6, '0'), 'SAL-S' || p.k || '-' || lpad(em.g::text, 6, '0'),
  (select id from sg.postes where nom = case when em.g = 1 then 'Dirigeant' else 'Ouvrier' end),
  (select u.id from sg.users u where u.g = em.g)
from sg.emp em, sg.p p;
insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire)
select em.id, p.ent, 22 from sg.emp em, sg.p p;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select u.id, p.ent, (select id from sg.postes where nom = 'Dirigeant'), 'actif' from sg.users u, sg.p p;

-- Clients et chantiers.
create table sg.cli as select gen_random_uuid() id, g from sg.p p, generate_series(1, greatest(20, least(5000, p.n / 20))) g;
insert into public.clients (id, entreprise_id, type, nom, societe, adresse_facturation, code_postal, ville, email, statut)
select c.id, p.ent, 'professionnel', 'Client' || c.g, 'Societe Soak ' || p.k || '-' || c.g, c.g || ' rue Client', '67000', 'Strasbourg',
  'c' || c.g || '.t' || p.k || '@soak.invalid', 'actif' from sg.cli c, sg.p p;
alter table sg.cli add primary key (g);
create table sg.ch as select gen_random_uuid() id, g, (select count(*) from sg.cli) nc from sg.p p, generate_series(1, greatest(10, p.n / 10)) g;
alter table sg.ch add primary key (g);
alter table sg.p add column nb_cli int, add column nb_ch int;
update sg.p set nb_cli = (select count(*) from sg.cli), nb_ch = (select count(*) from sg.ch);
insert into public.chantiers (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut,
  date_debut_prevue, date_fin_prevue, date_debut_reelle, budget_previsionnel)
select ch.id, p.ent, (select c.id from sg.cli c where c.g = 1 + (ch.g % ch.nc)), 'Chantier S' || p.k || '-' || ch.g,
  ch.g || ' av. Soak', '67000', 'Strasbourg',
  (array['en_cours','en_cours','termine','en_pause','prospect'])[1 + ch.g % 5],
  current_date - (ch.g % 1500), current_date - (ch.g % 1500) + 120,
  case when ch.g % 5 <> 4 then current_date - (ch.g % 1500) end, 50000
from sg.ch ch, sg.p p;

-- Devis : N, 2 lignes chacun.
create table sg.dv as
select gen_random_uuid() id, g,
  (array['brouillon','envoye','envoye','accepte','accepte','accepte','refuse','expire'])[1 + floor(random()*8)] st,
  (current_date - ((365*5)*random())::int)::date de
from sg.p p, generate_series(1, p.n) g;
insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission, date_validite, created_at)
select d.id, p.ent, (select c.id from sg.cli c where c.g = 1 + (d.g % (select nb_cli from sg.p))),
  case when d.g % 3 = 0 then (select ch.id from sg.ch ch where ch.g = 1 + (d.g % (select nb_ch from sg.p))) end,
  'brouillon', d.de, d.de + 60, d.de::timestamptz
from sg.dv d, sg.p p;
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select d.id, 'Poste ' || d.g || '.' || ln, 'fourniture', 1 + (d.g % 7), 'u', 100 + (d.g % 400), 0,
  (array[20,10,5.5])[1 + (d.g + ln) % 3], ln
from sg.dv d cross join generate_series(1, 2) ln;
update public.devis dv set statut = d.st from sg.dv d where dv.id = d.id and d.st <> 'brouillon';

-- Factures : N, 2 lignes ; envoyées / payées / partielles / annulées.
create table sg.fa as
select gen_random_uuid() id, g,
  (array['brouillon','envoyee','envoyee','payee','payee','payee','envoyee','annulee'])[1 + floor(random()*8)] st,
  (current_date - ((365*5)*random())::int)::date de
from sg.p p, generate_series(1, p.n) g;
insert into public.factures (id, entreprise_id, client_id, type, statut, date_emission, date_echeance, created_at)
select f.id, p.ent, (select c.id from sg.cli c where c.g = 1 + (f.g % (select nb_cli from sg.p))), 'simple', 'brouillon',
  f.de, f.de + 30, f.de::timestamptz
from sg.fa f, sg.p p;
insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select f.id, 'Facturé ' || f.g || '.' || ln, 'fourniture', 1 + (f.g % 5), 'u', 50 + (f.g % 300), 0, (array[20,10,5.5])[1 + (f.g + ln) % 3], ln
from sg.fa f cross join generate_series(1, 2) ln;
update public.factures fa set statut = 'envoyee' from sg.fa f where fa.id = f.id and f.st in ('envoyee','payee');
update public.factures fa set statut = 'annulee' from sg.fa f where fa.id = f.id and f.st = 'annulee';
insert into public.paiements (facture_id, montant, date, mode, reference)
select fa.id, round(fa.montant_ttc * case when f.st = 'payee' then 1.0 else 0.5 end, 2), fa.date_emission + 10, 'virement', 'SOAK-' || fa.numero
from sg.fa f join public.factures fa on fa.id = f.id
where fa.montant_ttc > 0 and (f.st = 'payee' or (f.st = 'envoyee' and f.g % 4 = 0));

-- Notifications (N), documents (N), tâches (N).
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, niveau, lue_at, push_envoyee_at, created_at)
select p.ent, (select u.id from sg.users u where u.g = 1 + (gs.i % 5)), 'soak_volume', 'Notif ' || gs.i,
  (array['information','attention','critique'])[1 + gs.i % 3],
  case when gs.i % 5 < 3 then now() end, now(), now() - ((gs.i % 400) || ' days')::interval
from sg.p p, generate_series(1, p.n) gs(i);
insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets)
select p.ent, ch.id, 'Doc ' || gs.i || '.pdf', 'autre', p.ent || '/' || ch.id || '/d' || gs.i || '.pdf', 'application/pdf', 100000
from sg.p p cross join generate_series(1, p.n) gs(i) join sg.ch ch on ch.g = 1 + (gs.i % (select nb_ch from sg.p));
insert into public.taches (chantier_id, libelle, statut, echeance, priorite)
select ch.id, 'Tâche ' || gs.i, case when gs.i % 3 = 0 then 'fait' else 'a_faire' end, current_date - 30 + (gs.i % 90),
  (array['basse','normale','haute','urgente'])[1 + gs.i % 4]
from sg.p p cross join generate_series(1, p.n) gs(i) join sg.ch ch on ch.g = 1 + (gs.i % (select nb_ch from sg.p));

-- Pointages (option) : J derniers jours ouvrés, 1 à 2 par salarié et par jour.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires,
  pause_minutes, tache, verification_statut, created_at)
select p.ent, em.id, (select ch.id from sg.ch ch where ch.g = 1 + ((em.g + d::date - date '2020-01-01') % (select nb_ch from sg.p))),
  d::date, case when rep = 1 then 7 else 1 end, 0, 45, 'Soak', 'valide', d::timestamptz
from sg.p p cross join sg.emp em
cross join lateral generate_series(current_date - p.jours, current_date - 1, interval '1 day') d
cross join lateral generate_series(1, case when (em.g + extract(doy from d)::int) % 3 = 0 then 2 else 1 end) rep
where p.jours > 0 and extract(isodow from d) < 6 and d::date >= em.entree;

analyze public.devis; analyze public.factures; analyze public.lignes_devis; analyze public.lignes_factures;
analyze public.pointages; analyze public.notifications_utilisateurs; analyze public.taches; analyze public.documents_chantier;
analyze public.chantiers; analyze public.paiements;
drop schema sg cascade;
commit;
select 'tenant' t, :k k, :n n,
  (select count(*) from public.devis where entreprise_id = :ent) devis,
  (select count(*) from public.factures where entreprise_id = :ent) factures,
  (select count(*) from public.pointages where entreprise_id = :ent) pointages;
