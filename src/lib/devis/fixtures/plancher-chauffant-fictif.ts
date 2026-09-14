/**
 * FIXTURE FICTIVE — « PC-001 — Plancher chauffant ».
 *
 * Exemple de recette exigé par le lot. TOUTES les valeurs ci-dessous — coefficients, pertes,
 * conditionnements, seuils, prix d'achat et de vente — sont INVENTÉES. Elles n'ont aucune
 * valeur technique ni commerciale et ne doivent jamais servir à chiffrer un chantier réel.
 * Aucune règle de l'art n'est encodée ici : le module d'ouvrages applique des mécanismes
 * génériques aux valeurs que l'entreprise saisit elle-même.
 */
import type { ComposantOuvrage, VersionOuvrage } from "@/lib/devis/ouvrages";

const base = {
  source: null,
  referenceInterne: null,
  referenceFabricant: null,
  fabricant: null,
  fournisseur: null,
  descriptionClient: null,
  coefficient: null,
  base: { type: "principale" },
  quantiteFixe: null,
  saisieRequise: false,
  pertePct: 0,
  arrondi: { mode: "aucun" },
  quantiteMin: null,
  condition: { type: "toujours" },
  tauxTva: 20,
  visibleClient: true,
} satisfies Partial<ComposantOuvrage>;

export const PLANCHER_CHAUFFANT_FICTIF: VersionOuvrage = {
  ouvrageId: "ouv-fictif-pc-001",
  entrepriseId: "ent-fictive-a",
  version: 1,
  referenceInterne: "PC-001",
  nom: "Plancher chauffant",
  descriptionInterne: "DONNÉES FICTIVES DE RECETTE — coefficients et prix sans aucune valeur technique.",
  descriptionClient: "Fourniture et pose d’un plancher chauffant (exemple fictif).",
  categorie: "Chauffage",
  unitePrincipale: "m²",
  quantitePrincipale: 100,
  statut: "actif",
  auteur: "recette",
  creeLe: "2026-09-11T00:00:00.000Z",
  modifieLe: "2026-09-11T00:00:00.000Z",
  composants: [
    {
      ...base, cle: "bande", ordre: 1, nature: "article", designation: "Bande périphérique PDM (fictif)",
      referenceInterne: "PDM-BP", referenceFabricant: "FAB-BP-150", fabricant: "Fabricant fictif", unite: "ml",
      saisieRequise: true, pertePct: 5, arrondi: { mode: "superieur", pas: 25 },
      prixAchatHt: 0.9, prixVenteHt: 1.8,
    },
    {
      ...base, cle: "isolant", ordre: 2, nature: "article", designation: "Isolant à plots (fictif)",
      referenceInterne: "PC-ISO", referenceFabricant: "FAB-ISO-30", unite: "m²",
      coefficient: 1, pertePct: 5, arrondi: { mode: "superieur", pas: 10 },
      prixAchatHt: 12, prixVenteHt: 21,
    },
    {
      ...base, cle: "agrafes", ordre: 4, nature: "article", designation: "Agrafes de fixation (fictif)",
      referenceInterne: "PC-AGR", unite: "u",
      coefficient: 2, base: { type: "composant", cle: "tuyau" }, arrondi: { mode: "superieur", pas: 250 },
      prixAchatHt: 0.03, prixVenteHt: 0.06,
    },
    {
      ...base, cle: "tuyau", ordre: 3, nature: "article", designation: "Tube PER 16 (fictif)",
      referenceInterne: "PC-TUB", referenceFabricant: "FAB-PER-16", unite: "ml",
      coefficient: 6.5, pertePct: 3, arrondi: { mode: "superieur", pas: 100 },
      prixAchatHt: 0.85, prixVenteHt: 1.6,
    },
    {
      ...base, cle: "collecteur", ordre: 5, nature: "article", designation: "Collecteur (fictif)",
      referenceInterne: "PC-COL", unite: "u", quantiteFixe: 1,
      condition: { type: "option", cle: "collecteur", libelle: "Collecteur fourni", parDefaut: true },
      prixAchatHt: 180, prixVenteHt: 320,
    },
    {
      ...base, cle: "chape", ordre: 6, nature: "sous_traitance", designation: "Chape fluide (fictif)",
      unite: "m³", coefficient: 0.05, pertePct: 8, arrondi: { mode: "proche", pas: 0.5 },
      prixAchatHt: 110, prixVenteHt: 190,
    },
    {
      ...base, cle: "main_oeuvre", ordre: 7, nature: "main_oeuvre", designation: "Main-d’œuvre de pose (fictif)",
      unite: "h", coefficient: 0.35, arrondi: { mode: "superieur", pas: 0.5 },
      prixAchatHt: 32, prixVenteHt: 55,
    },
    {
      ...base, cle: "consommables", ordre: 8, nature: "libre", designation: "Consommables (fictif)",
      unite: "forfait", quantiteFixe: 1, visibleClient: false,
      prixAchatHt: 25, prixVenteHt: 45,
    },
    {
      ...base, cle: "melangeur", ordre: 9, nature: "location", designation: "Location mélangeur (fictif)",
      unite: "j", quantiteFixe: 1, condition: { type: "quantite_min", seuil: 80 },
      prixAchatHt: 40, prixVenteHt: 70,
    },
    {
      ...base, cle: "mise_en_chauffe", ordre: 10, nature: "prestation", designation: "Mise en chauffe (fictif)",
      unite: "forfait", quantiteFixe: 1,
      condition: { type: "option", cle: "mise_en_chauffe", libelle: "Mise en chauffe", parDefaut: false },
      prixAchatHt: 60, prixVenteHt: 120,
    },
  ],
};

/** Copie profonde, pour les tests qui modifient le modèle. */
export const plancherChauffantFictif = (): VersionOuvrage => structuredClone(PLANCHER_CHAUFFANT_FICTIF);
