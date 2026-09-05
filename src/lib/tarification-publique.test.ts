import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DUREE_ESSAI_JOURS } from "./plateforme";
import { OFFRES_TARIFAIRES, offreTarifaireParCle } from "./tarification";
import canonique from "./tarification.canonical.json";

/**
 * ELSATIA-GP-PUBLIC-PRICING-CANONICAL-ALIGNMENT-V1
 *
 * Non-régression des surfaces publiques Gestion Pro. L'audit
 * ELSATIA-ECOSYSTEM-WEB-RELEASE-READINESS-AUDIT-V1 a constaté un écart entre la grille
 * publiée sur elsatia.fr (79 / 249 / 449 / 599) et une grille antérieure (69 / 199 / 399)
 * encore diffusée côté application. Ces tests figent la grille officielle et interdisent
 * le retour des anciennes valeurs sur une offre publique.
 *
 * Ils ne couvrent PAS le catalogue Stripe ni la table `plans_abonnement` : ces surfaces sont
 * hors périmètre du lot et versionnées séparément (`historique_tarification`).
 */

const GRILLE_OFFICIELLE = [
  { cle: "mini", nom: "Mini", mensuelEuros: 79, annuelEuros: 790, personnesActives: 3 },
  { cle: "pro", nom: "Pro", mensuelEuros: 249, annuelEuros: 2_490, personnesActives: 15 },
  { cle: "business", nom: "Business", mensuelEuros: 449, annuelEuros: 4_490, personnesActives: 30 },
  { cle: "entreprise", nom: "Entreprise", mensuelEuros: 599, annuelEuros: 5_990, personnesActives: 50 },
] as const;

// Anciennes valeurs commerciales retirées : plus aucune offre publique ne doit les porter.
const MENSUELS_RETIRES_CENTIMES = [6_900, 19_900, 39_900];
const ANNUELS_RETIRES_CENTIMES = [69_000, 199_000, 399_000];

const lire = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");

// Surfaces qui affichent une offre et son prix à un prospect ou à un client.
const SURFACES_PUBLIQUES: readonly (readonly [string, string])[] = [
  ["/tarifs", "../app/tarifs/page.tsx"],
  ["/signup", "../app/signup/page.tsx"],
  ["landing", "../app/page.tsx"],
  ["/onboarding/besoins", "../app/onboarding/besoins/page.tsx"],
  ["/abonnement", "../app/(app)/abonnement/page.tsx"],
];

describe("tarifs publics Gestion Pro", () => {
  it("n'expose aucune offre publique à 69, 199 ou 399 € HT/mois", () => {
    for (const offre of OFFRES_TARIFAIRES) {
      expect(MENSUELS_RETIRES_CENTIMES).not.toContain(offre.prixMensuelCentimes);
      expect(ANNUELS_RETIRES_CENTIMES).not.toContain(offre.prixAnnuelCentimes);
    }
    for (const offre of canonique.offres) {
      expect(MENSUELS_RETIRES_CENTIMES).not.toContain(offre.mensuelCentimes);
      expect(ANNUELS_RETIRES_CENTIMES).not.toContain(offre.annuelCentimes);
    }
  });

  it("applique les tarifs mensuels officiels", () => {
    expect(GRILLE_OFFICIELLE.map(({ cle }) => offreTarifaireParCle(cle).prixMensuelCentimes)).toEqual(
      GRILLE_OFFICIELLE.map(({ mensuelEuros }) => mensuelEuros * 100),
    );
  });

  it("applique les tarifs annuels officiels (10 × mensuel, deux mois offerts)", () => {
    for (const { cle, mensuelEuros, annuelEuros } of GRILLE_OFFICIELLE) {
      const offre = offreTarifaireParCle(cle);
      expect(offre.prixAnnuelCentimes).toBe(annuelEuros * 100);
      expect(offre.prixAnnuelCentimes).toBe(mensuelEuros * 100 * 10);
    }
  });

  it("applique les capacités officielles en personnes actives", () => {
    for (const { cle, personnesActives } of GRILLE_OFFICIELLE) {
      expect(offreTarifaireParCle(cle).comptesInclus).toBe(personnesActives);
    }
  });

  it("n'énonce plus la capacité Entreprise en « 40 salariés + 10 administrateurs »", () => {
    for (const offre of OFFRES_TARIFAIRES) {
      expect(offre.libelleComptesInclus ?? "").not.toMatch(/salari/i);
      expect(offre.resume).not.toMatch(/40 salari/i);
    }
    // Seule l'offre sur devis conserve un libellé de capacité dédié.
    expect(OFFRES_TARIFAIRES.filter((offre) => offre.libelleComptesInclus).map((offre) => offre.cle)).toEqual([
      "sur_mesure",
    ]);
  });

  it("garde le nom public de chaque offre", () => {
    expect(GRILLE_OFFICIELLE.map(({ cle }) => offreTarifaireParCle(cle).nom)).toEqual(
      GRILLE_OFFICIELLE.map(({ nom }) => nom),
    );
  });

  it("annonce un essai de 30 jours", () => {
    expect(DUREE_ESSAI_JOURS).toBe(30);
  });

  it("ne code en dur aucun montant d'abonnement dans les surfaces publiques", () => {
    // Toutes ces pages doivent dériver leurs montants d'OFFRES_TARIFAIRES : un nombre
    // d'euros écrit en dur rouvrirait l'écart constaté par l'audit.
    for (const [surface, chemin] of SURFACES_PUBLIQUES) {
      const source = lire(chemin);
      for (const montant of ["69", "199", "399", "690", "1990", "3990", "79", "249", "449", "599"]) {
        expect(source, `${surface} ne doit pas afficher « ${montant} € » en dur`).not.toMatch(
          new RegExp(`${montant}\\s*(€|&euro;|EUR)`),
        );
      }
    }
  });

  it("énonce la capacité en personnes actives sur les surfaces publiques", () => {
    for (const [surface, chemin] of SURFACES_PUBLIQUES) {
      const source = lire(chemin);
      expect(source, `${surface} ne doit plus parler de « comptes inclus »`).not.toMatch(/comptes? inclus/i);
      expect(source, `${surface} ne doit pas décompter des salariés inclus`).not.toMatch(/40 salari/i);
    }
  });
});
