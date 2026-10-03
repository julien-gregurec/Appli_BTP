-- ELSATIA — harnais d'upgrade Production → V9.x — PHASE F : anciennes offres et contrats historiques.
-- Exécuté sur la base UPGRADÉE (jeu historique 210 : scripts/upgrade/seed/01_cas_historiques.sql), dans une
-- transaction annulée. Vérifie que l'upgrade :
--   * ne modifie RÉTROACTIVEMENT aucun contrat (prix, version, plan, périodicité, statut, ids Stripe) ;
--   * ne remappe AUCUN contrat historique (59 / 129 / 249 historiques, 69 négocié, 79 / 449 / 6 468 de 2026)
--     vers la grille 79 / 249 / 449 / 599 ni vers les versions transitoires 69 / 199 / 399 de TARIFS-V2 ;
--   * conserve chaque version de plan historique, intacte (prix, id), et n'en supprime aucune ;
--   * n'attache aucun contrat à une version de plan créée par l'upgrade ;
--   * aligne seulement le catalogue ACTIF (nouveaux contrats) sur la grille canonique.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

create temp table c as select a.*, e.nom from public.abonnements_entreprises a join public.entreprises e on e.id = a.entreprise_id;

-- Contrats historiques : valeurs exactes de l'ère 210 (aucun effet rétroactif).
select is((select prix_contractuel_ht from c where nom = 'Entreprise Test'), 1238.40, 'pro v1 historique annuel : 1 238,40 conservé');
select is((select periodicite from c where nom = 'Entreprise Test'), 'annuel', 'pro v1 historique : périodicité annuelle conservée');
select is((select version_tarif from c where nom = 'Entreprise Test'), 1, 'pro v1 historique : version 1 conservée');
select is((select prix_contractuel_ht from c where nom = 'Petite SARL Histo'), 59.00, 'essentiel v0 : 59 € conservé');
select is((select code_offre || ' v' || version_tarif from c where nom = 'Petite SARL Histo'), 'essentiel v0', 'essentiel v0 : offre retirée du catalogue, contrat intact');
select is((select prix_contractuel_ht from c where nom = 'Ancienne Remise SAS'), 69.00, 'contrat négocié à 69 € : jamais remappé vers 79');
select is((select periodicite from c where nom = 'Ancienne Remise SAS'), 'annuel', 'contrat négocié : périodicité conservée');
select is((select prix_contractuel_ht from c where nom = 'Entreprise Isolation B'), 449.00, 'business v1 suspendu : 449 € conservé');
select is((select statut from c where nom = 'Entreprise Isolation B'), 'suspendu', 'contrat suspendu : statut conservé (pas de réactivation implicite)');
select is((select statut from c where nom = 'Entreprise Isolation A'), 'essai', 'essai expiré : statut contractuel inchangé par l''upgrade');
select is((select statut || '|' || prix_contractuel_ht from c where nom = 'Annulée SARL'), 'annule|249.00', 'premium v0 annulé : intact');
select is((select stripe_subscription_id from c where nom = 'Entreprise Test'), 'sub_SYNTH_moyenne', 'identifiant d''abonnement Stripe synthétique conservé');

-- Chaque contrat pointe toujours la version de plan de l'ère 210, jamais une version créée par l'upgrade.
select is((select count(*) from c join public.plans_abonnement p on p.id = c.plan_id
            where p.code = c.code_offre and p.version = c.version_tarif), (select count(*) from c),
          'chaque contrat référence la version de plan de son code/version contractuels');
select is((select count(*) from c join public.plans_abonnement p on p.id = c.plan_id
            where (p.code, p.prix_mensuel_ht) in (('mini', 69), ('pro', 199), ('business', 399))), 0::bigint,
          'aucun contrat attaché aux versions transitoires 69 / 199 / 399 (TARIFS-V2)');
select is((select count(*) from c where plan_suivant_id is not null or changement_prevu_at is not null), 0::bigint,
          'aucun changement d''offre programmé par l''upgrade');

-- Versions historiques du catalogue : toutes conservées, prix intacts.
select is((select prix_mensuel_ht from public.plans_abonnement where code = 'essentiel' and version = 0), 59.00, 'plan essentiel v0 : 59 € conservé');
select is((select prix_mensuel_ht from public.plans_abonnement where code = 'pro' and version = 1), 129.00, 'plan pro v1 historique : 129 € conservé');
select is((select prix_mensuel_ht from public.plans_abonnement where code = 'premium' and version = 0), 249.00, 'plan premium v0 : 249 € conservé');
select is((select prix_annuel_ht from public.plans_abonnement where code = 'mini' and version = 1), 948.00, 'plan mini v1 (ère 210) : annuel 948 (12 ×) conservé');
select ok(not exists (select 1 from public.plans_abonnement where code in ('essentiel', 'premium') and actif), 'offres historiques retirées : toujours inactives');

-- Catalogue ACTIF (nouveaux contrats uniquement) = grille canonique 79 / 249 / 449 / 599, annuel = 10 × mensuel.
select is((select string_agg(code || '=' || prix_mensuel_ht || '/' || prix_annuel_ht, ' ' order by prix_mensuel_ht)
             from public.plans_abonnement where actif and not devis_obligatoire),
          'mini=79.00/790.00 pro=249.00/2490.00 business=449.00/4490.00 entreprise=599.00/5990.00',
          'catalogue actif = grille canonique 79 / 249 / 449 / 599');
select is((select count(*) from public.plans_abonnement where actif group by code having count(*) > 1 limit 1), null,
          'une seule version active par code');

-- Miroir entreprises.* (lu par l'application) : inchangé.
select is((select abonnement_prix_contractuel_ht from public.entreprises where nom = 'Ancienne Remise SAS'), 69.00,
          'entreprises.abonnement_prix_contractuel_ht : 69 € conservé');
select is((select abonnement_periodicite || '|' || abonnement_version_tarif from public.entreprises where nom = 'Entreprise Test'), 'annuel|1',
          'entreprises : périodicité et version contractuelles conservées');

select * from finish();
rollback;
