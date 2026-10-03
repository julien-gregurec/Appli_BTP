-- ELSATIA — harnais d'upgrade Production → V9.x — entreprise VOLUMÉTRIQUE (ère 210).
-- Paramètre psql : -v vol=<N>  (500 | 5000 | 20000 | 100000 ...) = nombre de lignes des tables
-- critiques les plus lourdes (lignes_devis, lignes_factures, pointages, affectations, journal_activite) ;
-- tables parentes à N/10 (devis, factures, clients) ou N/20 (chantiers). 100 % synthétique.
-- Tous les triggers métier restent ACTIFS (numérotation, recalcul, synchronisation) : les devis/factures
-- naissent « brouillon », reçoivent leurs lignes, puis changent de statut — chemin applicatif réel.
-- Fidélité 210 : next_reference() y TRONQUE le numéro au-delà de 999 (lpad, largeur 3 ; corrigé par
-- 20260921000299 pendant l'upgrade) — une entreprise 210 ne peut donc pas porter plus de 999 devis ni
-- 999 factures numérotés. Au-delà de 900 documents, les suivants restent en BROUILLON (non numérotés).
\set ON_ERROR_STOP 1
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
        'gerant@volumetrique.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), now() - interval '6 years', now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values ('a2100000-0000-0000-0000-000000000003', 'Gérant', 'Volumétrique')
on conflict (id) do nothing;
select null from set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select null from set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000003', true);
create temp table v as select public.creer_entreprise_bootstrap('Volumetrique BTP', '00000000000009', '9 rue du Volume', '75001', 'Paris') as ent,
       greatest(:vol, 20)::int as n;
select null from set_config('request.jwt.claims', '', true);
select null from set_config('request.jwt.claim.sub', '', true);

insert into public.abonnements_entreprises (entreprise_id, plan_id, code_offre, version_tarif, periodicite, prix_contractuel_ht, statut,
       stripe_subscription_id, stripe_customer_id)
select v.ent, p.id, 'entreprise', 1, 'annuel', 6468.00, 'actif', 'sub_SYNTH_volume', 'cus_SYNTH_volume'
  from v, public.plans_abonnement p where p.code = 'entreprise' and p.version = 1;
update public.entreprises set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_version_tarif = 1,
       abonnement_prix_contractuel_ht = 6468.00, abonnement_periodicite = 'annuel' where id = (select ent from v);

insert into public.employes (entreprise_id, reference_interne, prenom, nom, type_contrat, date_entree, taux_horaire, cout_horaire, statut)
select v.ent, 'VOL-EMP-' || lpad(g::text, 4, '0'), 'Prénom' || g, 'Volume' || g, 'cdi', current_date - 1000, 16, 30, 'actif'
  from v, generate_series(1, 50) g;
insert into public.clients (entreprise_id, reference_interne, type, nom, prenom, ville, statut)
select v.ent, 'VOL-CLI-' || lpad(g::text, 6, '0'), 'particulier', 'Client' || g, 'Vol', 'Paris', 'actif'
  from v, generate_series(1, greatest(v.n / 10, 2)) g;
insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, statut, budget_previsionnel, date_debut_prevue)
select v.ent, 'VOL-CHA-' || lpad(g::text, 6, '0'),
       (select id from public.clients c where c.entreprise_id = v.ent and c.reference_interne = 'VOL-CLI-' || lpad((1 + (g - 1) % greatest(v.n / 10, 2))::text, 6, '0')),
       'Chantier volumétrique ' || g, 'en_cours', 10000 + g, current_date - 365
  from v, generate_series(1, greatest(v.n / 20, 1)) g;

-- Devis (N/10, brouillon) + lignes (N, 10 par devis) puis acceptation d'un sur deux.
create temp table vd as
with ins as (
  insert into public.devis (entreprise_id, client_id, statut, date_emission, notes_internes)
  select v.ent, c.id, 'brouillon', current_date - (g % 700), 'VOL-DEV-' || g
    from v, generate_series(1, greatest(v.n / 10, 2)) g
    join public.clients c on c.entreprise_id = (select ent from v) and c.reference_interne = 'VOL-CLI-' || lpad(g::text, 6, '0')
  returning id, notes_internes)
select id, substr(notes_internes, 9)::int as g from ins;
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
select vd.id, 'Ouvrage ' || k, (array['main_oeuvre', 'fourniture', 'sous_traitance', 'deplacement', 'forfait'])[1 + k % 5],
       1 + k % 7, 'u', 12.5 * k, 20, k
  from vd, generate_series(1, 10) k;
update public.devis set statut = 'accepte' where id in (select id from vd where g % 2 = 0 and g <= 1800);

-- Factures (N/10) : brouillon → lignes (N) → envoyée / payée ; paiements sur les payées.
create temp table vf as
with ins as (
  insert into public.factures (entreprise_id, client_id, type, statut, date_emission, date_echeance, notes_internes)
  select v.ent, d.client_id, 'simple', 'brouillon', current_date - (vd.g % 700), current_date - (vd.g % 700) + 30, 'VOL-FAC-' || vd.g
    from v, vd join public.devis d on d.id = vd.id
  returning id, notes_internes)
select id, substr(notes_internes, 9)::int as g from ins;
insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
select vf.id, 'Prestation ' || k, 'forfait', 1, 'u', 10 * k + vf.g % 13, 20, k
  from vf, generate_series(1, 10) k;
update public.factures set statut = 'envoyee' where id in (select id from vf where g <= 900);
insert into public.paiements (facture_id, montant, date, mode, reference)
select f.id, f.montant_ttc, f.date_emission + 20, 'virement', 'VOL-PAY-' || vf.g
  from vf join public.factures f on f.id = vf.id where vf.g % 3 = 0 and vf.g <= 900 and f.montant_ttc > 0;

insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description, created_at)
select v.ent, 'a2100000-0000-0000-0000-000000000003', (array['creation', 'modification', 'envoi'])[1 + g % 3], 'devis', null,
       'Événement volumétrique ' || g, now() - make_interval(mins => g)
  from v, generate_series(1, v.n) g;
insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
select v.ent, ch.id, 'photo-' || g || '.jpg', 'photo_pendant', v.ent::text || '/vol/' || g || '.jpg', 'image/jpeg', 1000 + g, 'tous_affectes'
  from v, generate_series(1, greatest(v.n / 10, 1)) g
  join lateral (select id from public.chantiers where entreprise_id = (select ent from v) order by reference_interne limit 1) ch on true;
commit;

-- Planning / pointage (N chacun) : 50 employés × jours, un chantier par jour. Par LOTS de 2 000 lignes, chacun
-- dans sa propre transaction (\gexec, autocommit) : trg_verifier_heures_affectation prend un verrou consultatif
-- PAR LIGNE ; 20 000 lignes dans une seule transaction dépasseraient max_locks_per_transaction (comme en réel,
-- où les affectations naissent une à une).
select format($f$
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, type_activite)
select v.ent, ch.id, em.id, current_date - (g / 50), 7.5, 'chantier'
  from v, generate_series(%1$s, %2$s) g
  join lateral (select id from public.employes where entreprise_id = (select ent from v) and reference_interne = 'VOL-EMP-' || lpad((1 + g %% 50)::text, 4, '0')) em on true
  join lateral (select id from public.chantiers where entreprise_id = (select ent from v) and reference_interne = 'VOL-CHA-' || lpad((1 + (g / 50) %% greatest((select n from v) / 20, 1))::text, 6, '0')) ch on true
 where g < (select n from v)$f$, b, b + 1999)
  from generate_series(0, (select n - 1 from v), 2000) b
\gexec
select format($f$
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, pause_minutes, affectation_id)
select a.entreprise_id, a.employe_id, a.chantier_id, a.date, 7, (a.date - current_date) %% 2 * -0.5, 60, a.id
  from public.affectations a where a.entreprise_id = (select ent from v) and a.date between current_date - %1$s and current_date - %2$s$f$,
  d + 39, d)
  from generate_series(0, (select n / 50 + 1 from v), 40) d
\gexec
