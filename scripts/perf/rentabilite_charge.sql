-- ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — jeu de charge « rentabilité ».
--
-- Sur une base portant la fixture supabase/tests/fixtures/isolation_multitenant.inc
-- (entreprises A et B), insère pour l'entreprise :'entreprise' :
--   * 12 chantiers dédiés (« Charge rentabilité V1 - NN »), le n° 01 portant
--     la moitié des pointages (fiche chantier > 1 000 pointages dès N = 2 000) ;
--   * max(20, N/100) salariés, coût horaire non rond (1 salarié sur 7 sans coût,
--     pour exercer l'alerte « coût horaire manquant ») ;
--   * N pointages sur 12 mois (75 % « valide », le reste a_verifier/rejete/sans_preuve) ;
--   * N/5 factures (dont annulées, avoirs), N/10 devis acceptés, N/5 dépenses
--     fournisseurs (dont sous-traitance, annulées), N/10 sorties de stock,
--     N/10 notes de frais (statuts validés et non validés), N affectations.
-- Montants et heures déterministes et non ronds : une ligne perdue se voit.
--
-- Non idempotent : à lancer une fois par base (créer la base depuis un modèle).
-- À lancer en superutilisateur (fixture, pas de RLS).
--
--   psql -d <db> -v entreprise=a0000000-0000-0000-0000-000000000001 -v n=1462 \
--        -f scripts/perf/rentabilite_charge.sql
\set ON_ERROR_STOP on

set elsatia.capacite_personnes_bypass = 'on';

create temp table _rc_param as
select :'entreprise'::uuid as entreprise_id,
       (:n)::int as n,
       greatest(20, ceil((:n)::numeric / 100))::int as k,
       12 as nb_chantiers,
       (current_date - 364) as debut;

insert into public.clients (entreprise_id, nom)
select entreprise_id, 'Client charge rentabilité V1' from _rc_param;

insert into public.fournisseurs (entreprise_id, reference, nom)
select entreprise_id, 'CHR-FOU-01', 'Fournisseur charge rentabilité V1' from _rc_param;

insert into public.chantiers (entreprise_id, client_id, nom, statut)
select p.entreprise_id, c.id, 'Charge rentabilité V1 - ' || lpad(g::text, 2, '0'), 'en_cours'
from _rc_param p
join public.clients c on c.entreprise_id = p.entreprise_id and c.nom = 'Client charge rentabilité V1'
cross join generate_series(1, 12) g;

create temp table _rc_ch as
select row_number() over (order by c.nom) - 1 as rang, c.id, c.client_id
from public.chantiers c join _rc_param p on c.entreprise_id = p.entreprise_id
where c.nom like 'Charge rentabilité V1 - %';

insert into public.employes (entreprise_id, prenom, nom, numero_inscription, identifiant_interne)
select p.entreprise_id, 'Salarié', 'Rentabilité ' || lpad(g::text, 4, '0'),
       'CHARGE-RENT-V1-' || lpad(g::text, 5, '0'), 'CRV' || lpad(g::text, 5, '0')
from _rc_param p, generate_series(1, p.k) g;

create temp table _rc_emp as
select row_number() over (order by e.numero_inscription) - 1 as rang, e.id
from public.employes e join _rc_param p on e.entreprise_id = p.entreprise_id
where e.numero_inscription like 'CHARGE-RENT-V1-%';

-- Coût horaire non rond ; 1 salarié sur 7 sans coût renseigné.
insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire)
select e.id, p.entreprise_id, round(24 + ((e.rang * 7919) % 2300) / 100.0 + 0.13, 2)
from _rc_emp e cross join _rc_param p
where e.rang % 7 <> 3;

-- Pointages : chantier 01 = 1 pointage sur 2, les 11 autres se partagent le reste.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, tache, verification_statut, origine_pointage)
select p.entreprise_id,
       (select id from _rc_emp where rang = g % p.k),
       (select id from _rc_ch where rang = case when g % 2 = 0 then 0 else 1 + (g / 2) % 11 end),
       p.debut + (g % 365),
       round(1 + ((g * 37) % 587) / 100.0 + 0.07, 2),
       case when g % 3 = 0 then round(((g * 13) % 190) / 100.0 + 0.01, 2) else 0 end,
       'CHARGE-RENT-V1',
       case when g % 8 = 1 then 'a_verifier' when g % 8 = 5 then 'rejete' else case when g % 16 = 3 then 'sans_preuve' else 'valide' end end,
       'gps_complet'
from _rc_param p, generate_series(0, p.n - 1) g;

-- Affectations (heures planifiées), même répartition.
insert into public.affectations (entreprise_id, employe_id, chantier_id, date, heures, tache, type_activite)
select p.entreprise_id,
       (select id from _rc_emp where rang = g % p.k),
       (select id from _rc_ch where rang = case when g % 2 = 0 then 0 else 1 + (g / 2) % 11 end),
       p.debut + (g % 365),
       round(4 + ((g * 29) % 400) / 100.0 + 0.03, 2),
       'CHARGE-RENT-V1 #' || g, 'chantier'
from _rc_param p, generate_series(0, p.n - 1) g;

-- Devis acceptés (budget), N/10.
insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc)
select p.entreprise_id, 'CHR-DEV-' || lpad(g::text, 6, '0'), c.client_id, c.id, 'accepte',
       round(900 + ((g * 7717) % 90000) / 100.0 + 0.37, 2), 0, round(900 + ((g * 7717) % 90000) / 100.0 + 0.37, 2)
from _rc_param p cross join generate_series(0, greatest(1, p.n / 10) - 1) g
join _rc_ch c on c.rang = g % 12;

-- Factures, N/5 : 1 sur 9 annulée, 1 sur 13 avoir.
insert into public.factures (entreprise_id, numero, client_id, chantier_id, statut, type, montant_ht, montant_tva, montant_ttc, montant_paye)
select p.entreprise_id, 'CHR-FAC-' || lpad(g::text, 6, '0'), c.client_id, c.id,
       case when g % 9 = 4 then 'annulee' when g % 4 = 0 then 'payee' else 'envoyee' end,
       case when g % 13 = 6 then 'avoir' else 'simple' end,
       round(400 + ((g * 6007) % 250000) / 100.0 + 0.41, 2), 0, round(400 + ((g * 6007) % 250000) / 100.0 + 0.41, 2),
       case when g % 9 <> 4 and g % 4 = 0 then round(400 + ((g * 6007) % 250000) / 100.0 + 0.41, 2) else 0 end
from _rc_param p cross join generate_series(0, greatest(1, p.n / 5) - 1) g
join _rc_ch c on c.rang = (g * 5) % 12;

-- Dépenses fournisseurs, N/5 : 1 sur 4 sous-traitance, 1 sur 11 annulée.
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, numero_piece, categorie, statut, montant_ht, montant_tva)
select p.entreprise_id, f.id, c.id, 'CHR-DEP-' || lpad(g::text, 6, '0'),
       case when g % 4 = 0 then 'sous_traitance' when g % 4 = 1 then 'materiaux' when g % 4 = 2 then 'location' else 'carburant' end,
       case when g % 11 = 7 then 'annulee' else 'a_payer' end,
       round(50 + ((g * 3571) % 60000) / 100.0 + 0.19, 2), 0
from _rc_param p cross join generate_series(0, greatest(1, p.n / 5) - 1) g
join _rc_ch c on c.rang = (g * 7) % 12
join public.fournisseurs f on f.entreprise_id = p.entreprise_id and f.reference = 'CHR-FOU-01';

-- Sorties de stock, N/10, sur un article dédié au prix non rond.
insert into public.articles_stock (entreprise_id, reference, designation, quantite_stock, prix_achat_ht, prix_vente_ht)
select entreprise_id, 'CHR-STK-01', 'Article charge rentabilité V1', 100000000, 13.37, 20 from _rc_param;
insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, motif)
select p.entreprise_id, a.id, c.id, 'sortie', 1 + (g % 9), 'CHARGE-RENT-V1'
from _rc_param p cross join generate_series(0, greatest(1, p.n / 10) - 1) g
join _rc_ch c on c.rang = (g * 11) % 12
join public.articles_stock a on a.entreprise_id = p.entreprise_id and a.reference = 'CHR-STK-01';

-- Notes de frais rattachées, N/10 : validées (valide/validee/remboursee) et non validées (soumis/refuse).
insert into public.notes_frais (entreprise_id, employe_id, chantier_id, reference, montant_ttc, statut)
select p.entreprise_id, (select id from _rc_emp where rang = g % p.k), c.id, 'CHR-NDF-' || lpad(g::text, 6, '0'),
       round(8 + ((g * 1231) % 12000) / 100.0 + 0.23, 2),
       (array['valide', 'validee', 'remboursee', 'soumis', 'refuse'])[1 + g % 5]
from _rc_param p cross join generate_series(0, greatest(1, p.n / 10) - 1) g
join _rc_ch c on c.rang = (g * 3) % 12;

select (select count(*) from public.pointages where tache = 'CHARGE-RENT-V1') as pointages,
       (select count(*) from public.affectations where tache like 'CHARGE-RENT-V1 #%') as affectations,
       (select count(*) from public.factures where numero like 'CHR-FAC-%') as factures,
       (select count(*) from public.depenses_fournisseurs where numero_piece like 'CHR-DEP-%') as depenses,
       (select count(*) from public.notes_frais where reference like 'CHR-NDF-%') as notes_frais;
