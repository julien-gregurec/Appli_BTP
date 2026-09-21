#!/usr/bin/env node
// ============================================================================
// Audit : quels contrats relèvent encore de la génération « par forfait » ?
// ----------------------------------------------------------------------------
// ELSATIA-TARIFICATION-DECISIONS-COMMERCIALES-V1 retire la grille 15/12/9/9 €
// pour les nouveaux contrats. Avant de la considérer comme morte, il faut
// savoir si elle porte des contrats vivants — et ce script produit la requête
// qui le dit. Elle est STRICTEMENT en lecture : aucun `update`, aucun `insert`.
//
//   node scripts/audit-comptes-supplementaires-historiques.mjs          # affiche la requête
//   node scripts/audit-comptes-supplementaires-historiques.mjs --dsn …  # l'exécute
//
// CE QUE L'AUDIT STATIQUE A DÉJÀ ÉTABLI, et qu'aucune requête ne dira :
//
//  1. le seul chemin de facturation par compte réellement câblé est le
//     mécanisme « capacité personne active » (ELSATIA-CAPACITY-STRIPE-R2). Il
//     est PAR FORFAIT — donc de la génération précédente — et il ne stocke
//     qu'une quantité (`entreprises.capacite_personnes_supplementaire`) ;
//  2. il n'existe AUCUNE colonne qui fige le prix unitaire souscrit au niveau
//     du contrat. Le prix est relu dans le code à chaque affichage. Tant que
//     c'est le cas, modifier une valeur de la génération précédente repricerait
//     les contrats existants — d'où le test qui fige ces montants ;
//  3. `options_abonnement_entreprises` (qui, elle, porte bien un
//     `prix_unitaire_contractuel_ht`) n'est écrite par aucun code applicatif :
//     aucun contrat n'y a de compte supplémentaire par rôle aujourd'hui.
//
// Conclusion opérationnelle : figer le prix unitaire par contrat demande une
// migration. Elle est hors périmètre de cette correction, et c'est le
// prérequis à toute évolution ultérieure de la grille historique.
// ============================================================================

import { argv, env, exit } from "node:process";

const REQUETE = `
-- Lecture seule. Contrats susceptibles de relever de la génération
-- « comptes supplémentaires par forfait » (15/12/9/9 €).
select
  e.id                                   as entreprise_id,
  e.abonnement_offre                     as offre,
  e.abonnement_periodicite               as periodicite,
  e.capacite_personnes_supplementaire    as comptes_supplementaires,
  e.abonnement_version_tarif             as version_tarif,
  e.abonnement_prix_contractuel_ht       as prix_forfait_contractuel_ht,
  a.statut                               as statut_abonnement,
  a.prix_contractuel_ht                  as prix_abonnement_contractuel_ht
from public.entreprises e
left join public.abonnements_entreprises a on a.entreprise_id = e.id
where coalesce(e.capacite_personnes_supplementaire, 0) > 0
order by e.capacite_personnes_supplementaire desc;

-- Comptes supplémentaires PAR RÔLE déjà contractualisés (génération courante).
-- Chacun porte son prix unitaire figé : il ne bouge jamais.
select
  o.entreprise_id,
  c.code                              as role,
  o.quantite,
  o.prix_unitaire_contractuel_ht      as prix_unitaire_fige_ht,
  o.active,
  o.debut_at
from public.options_abonnement_entreprises o
join public.catalogue_options_abonnement c on c.id = o.option_id
where c.code like 'compte_%' or c.code = 'expert_comptable'
order by o.entreprise_id, c.code;

-- Contrôle de volumétrie : y a-t-il seulement des contrats ?
select
  (select count(*) from public.abonnements_entreprises)                                as abonnements,
  (select count(*) from public.entreprises
     where coalesce(capacite_personnes_supplementaire, 0) > 0)                         as avec_comptes_supplementaires,
  (select count(*) from public.options_abonnement_entreprises)                         as options_contractualisees;
`.trim();

const index = argv.indexOf("--dsn");
const dsn = index !== -1 ? argv[index + 1] : env.ELSATIA_AUDIT_DSN;

if (!dsn) {
  console.log(REQUETE);
  console.log(
    "\n· Requête affichée, non exécutée. Pour l'exécuter contre une base :\n" +
      "    node scripts/audit-comptes-supplementaires-historiques.mjs --dsn postgres://…\n" +
      "  Utilisez un rôle en LECTURE SEULE. Ce script n'écrit jamais.",
  );
  exit(0);
}

if (/\b(insert|update|delete|drop|alter|truncate)\b/i.test(REQUETE)) {
  console.error("✗ La requête d'audit contient une écriture : exécution refusée.");
  exit(1);
}

const { default: postgres } = await import("postgres").catch(() => ({ default: null }));
if (!postgres) {
  console.error(
    "✗ Le client `postgres` n'est pas installé dans ce dépôt.\n" +
      "  Exécutez la requête ci-dessus dans votre client SQL habituel, en lecture seule.",
  );
  exit(1);
}

const sql = postgres(dsn, { max: 1, prepare: false });
try {
  for (const bloc of REQUETE.split(";\n\n")) {
    if (!bloc.trim()) continue;
    console.log(JSON.stringify(await sql.unsafe(bloc), null, 2));
  }
} finally {
  await sql.end();
}
