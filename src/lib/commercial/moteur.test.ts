import { describe, expect, it } from "vitest";
import {
  BLOC_STOCKAGE,
  MODULES_COMMERCIAUX,
  MULTIPLICATEURS_ANNUELS,
  OFFRES_TARIFAIRES,
  TYPES_COMPTE,
  moduleCommercialParCle,
  offreTarifaireParCle,
  prixModuleCentimes,
  prixPersonneSupplementaireCentimes,
} from "@/lib/commercial/catalogue";
import { MODULES_GESTION_PRO_CODES } from "@/lib/modules-gestion-pro-codes";
import { calculerAbonnement, calculerDepuisLignes, construireLignes, etatModulesPour, projeterEcheances } from "@/lib/commercial/moteur";
import { comparerForfaits, economieAnnuelle, recommanderForfait } from "@/lib/commercial/recommandation";
import { resoudreEtatRemise, dateRetourTarifNormal, detecterConflits, validerRemise } from "@/lib/commercial/remises";
import type { ConfigurationAbonnement, LigneAbonnement, Remise } from "@/lib/commercial/types";

const MINI: ConfigurationAbonnement = { forfait: "mini", periodicite: "mensuel", personnesActives: 3 };

function remise(partial: Partial<Remise> & Pick<Remise, "id" | "type" | "valeur" | "duree">): Remise {
  return {
    perimetre: { cible: "abonnement" },
    etat: "active",
    motif: "Geste commercial de lancement",
    ...partial,
  } as Remise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue : source unique, cohérence avec la grille publique
// ─────────────────────────────────────────────────────────────────────────────

describe("catalogue commercial", () => {
  it("ne redéfinit aucun prix de forfait : la grille publique reste canonique", () => {
    expect(OFFRES_TARIFAIRES.find((o) => o.cle === "mini")?.prixMensuelCentimes).toBe(7_900);
    expect(OFFRES_TARIFAIRES.find((o) => o.cle === "pro")?.prixMensuelCentimes).toBe(24_900);
    expect(OFFRES_TARIFAIRES.find((o) => o.cle === "business")?.prixMensuelCentimes).toBe(44_900);
    expect(OFFRES_TARIFAIRES.find((o) => o.cle === "entreprise")?.prixMensuelCentimes).toBe(59_900);
  });

  it("respecte la règle annuelle canonique : annuel = 10 × mensuel", () => {
    for (const cle of ["mini", "pro", "business", "entreprise"] as const) {
      const offre = offreTarifaireParCle(cle);
      expect(offre.prixAnnuelCentimes).toBe(offre.prixMensuelCentimes * MULTIPLICATEURS_ANNUELS.forfait.valeur);
    }
  });

  it("couvre exactement une fois chaque code technique du catalogue R3", () => {
    const couverts = MODULES_COMMERCIAUX.flatMap((definition) => definition.codesTechniques);
    expect([...couverts].sort()).toEqual([...MODULES_GESTION_PRO_CODES].sort());
    expect(new Set(couverts).size).toBe(couverts.length);
  });

  it("n'affiche jamais de prix à la carte pour un module non actif au catalogue", () => {
    for (const definition of MODULES_COMMERCIAUX) {
      if (definition.statutCatalogue !== "actif") expect(definition.vendableALaCarte).toBe(false);
    }
  });

  it("porte les prix par type de compte à l'identique des options existantes", () => {
    const attendu = { terrain: 500, chef_equipe: 900, administratif: 1_500, expert_comptable: 0 };
    for (const type of TYPES_COMPTE) expect(type.prixMensuelCentimes).toBe(attendu[type.cle]);
  });

  it("marque comme divergent le modèle par type de compte, non facturé aujourd'hui", () => {
    expect(TYPES_COMPTE.find((t) => t.cle === "terrain")?.statutPrix).toBe("divergent");
    expect(prixPersonneSupplementaireCentimes("mini")).toBe(1_500);
    expect(prixPersonneSupplementaireCentimes("pro")).toBe(1_200);
    expect(prixPersonneSupplementaireCentimes("business")).toBe(900);
    expect(prixPersonneSupplementaireCentimes("entreprise")).toBe(900);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comptes, salariés, capacité
// ─────────────────────────────────────────────────────────────────────────────

describe("comptes et salariés", () => {
  it("Mini avec trois comptes coûte le tarif public, sans supplément", () => {
    const calcul = calculerAbonnement(MINI);
    expect(calcul.sousTotalHtCentimes).toBe(7_900);
    expect(calcul.totalHtCentimes).toBe(7_900);
    expect(calcul.lignes).toHaveLength(1);
  });

  it("Mini avec cinq salariés mais seulement trois comptes ne facture rien de plus", () => {
    // Cinq fiches employés, trois comptes applicatifs ouverts : la capacité
    // facturée compte les PERSONNES ACTIVES, pas les fiches.
    const calcul = calculerAbonnement({ ...MINI, personnesActives: 3 });
    expect(calcul.totalHtCentimes).toBe(7_900);
  });

  it("Mini avec cinq comptes ajoute deux personnes supplémentaires", () => {
    const calcul = calculerAbonnement({ ...MINI, personnesActives: 5 });
    expect(calcul.totalHtCentimes).toBe(7_900 + 2 * 1_500);
    const ligne = calcul.lignes.find((l) => l.famille === "comptes");
    expect(ligne?.quantite).toBe(2);
    expect(ligne?.prixUnitaireMensuelCentimes).toBe(1_500);
  });

  it("n'oblige jamais à passer sur Pro à cause du nombre de personnes", () => {
    const cinqPersonnes = calculerAbonnement({ ...MINI, personnesActives: 5 });
    const pro = calculerAbonnement({ forfait: "pro", periodicite: "mensuel", personnesActives: 5 });
    expect(cinqPersonnes.totalHtCentimes).toBe(10_900);
    expect(cinqPersonnes.totalHtCentimes).toBeLessThan(pro.totalHtCentimes);
  });

  it("sait aussi calculer le modèle par type de compte, en le signalant comme divergent", () => {
    const calcul = calculerAbonnement({
      ...MINI,
      modeleComptes: "par_type_de_compte",
      comptesSupplementaires: { terrain: 2, chef_equipe: 1, expert_comptable: 1 },
    });
    expect(calcul.totalHtCentimes).toBe(7_900 + 2 * 500 + 900);
    expect(calcul.avertissements.join(" ")).toContain("divergent");
  });

  it("ne facture jamais l'accès expert-comptable", () => {
    const type = TYPES_COMPTE.find((t) => t.cle === "expert_comptable");
    expect(type?.prixMensuelCentimes).toBe(0);
    expect(type?.compteDansCapacite).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modules, stockage, IA
// ─────────────────────────────────────────────────────────────────────────────

describe("modules et options", () => {
  it("ajoute puis retire un module sans effet de bord", () => {
    const avec = calculerAbonnement({ ...MINI, modules: ["stock"] });
    const sans = calculerAbonnement({ ...MINI, modules: [] });
    expect(avec.totalHtCentimes).toBe(7_900 + 2_900);
    expect(sans.totalHtCentimes).toBe(7_900);
  });

  it("ne facture pas un module déjà inclus dans le forfait", () => {
    const calcul = calculerAbonnement({ forfait: "business", periodicite: "mensuel", personnesActives: 30, modules: ["stock"] });
    expect(calcul.totalHtCentimes).toBe(44_900);
    expect(prixModuleCentimes("stock", "business")).toBe(0);
  });

  it("refuse un module indisponible à ce niveau et le signale", () => {
    const calcul = calculerAbonnement({ ...MINI, modules: ["rentabilite_avancee"] });
    expect(calcul.totalHtCentimes).toBe(7_900);
    expect(calcul.avertissements.join(" ")).toContain("Rentabilité avancée");
  });

  it("ne vend jamais un module au statut « bientôt »", () => {
    const calcul = calculerAbonnement({ ...MINI, modules: ["safety"] });
    expect(calcul.totalHtCentimes).toBe(7_900);
    expect(moduleCommercialParCle("safety")?.vendableALaCarte).toBe(false);
  });

  it("expose l'état de chaque module : inclus, option, disponible, indisponible", () => {
    const etats = etatModulesPour({ ...MINI, modules: ["stock"] });
    const parCle = Object.fromEntries(etats.map((e) => [e.cle, e.etat]));
    expect(parCle.chantier).toBe("inclus");
    expect(parCle.stock).toBe("option");
    expect(parCle.pointage).toBe("disponible");
    expect(parCle.rentabilite_avancee).toBe("indisponible");
  });

  it("facture l'IA seulement si une option est choisie", () => {
    expect(calculerAbonnement({ ...MINI, optionIA: "aucune" }).totalHtCentimes).toBe(7_900);
    expect(calculerAbonnement({ ...MINI, optionIA: "intensive" }).totalHtCentimes).toBe(7_900 + 7_900);
    expect(calculerAbonnement({ ...MINI, optionIA: "credits" }).totalHtCentimes).toBe(7_900 + 2_900);
  });

  it("facture le stockage par blocs", () => {
    const calcul = calculerAbonnement({ ...MINI, blocsStockage: 2 });
    expect(calcul.totalHtCentimes).toBe(7_900 + 2 * BLOC_STOCKAGE.prixMensuelCentimes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Périodicité
// ─────────────────────────────────────────────────────────────────────────────

describe("mensuel et annuel", () => {
  it("applique la règle « deux mois offerts » au forfait", () => {
    const annuel = calculerAbonnement({ ...MINI, periodicite: "annuel" });
    expect(annuel.totalHtCentimes).toBe(79_000);
    expect(annuel.equivalentMensuelHtCentimes).toBe(Math.round(79_000 / 12));
  });

  it("chiffre l'économie de l'annuel par rapport à douze mensualités", () => {
    const economie = economieAnnuelle(MINI);
    expect(economie.mensuelSurDouzeMoisCentimes).toBe(94_800);
    expect(economie.annuelCentimes).toBe(79_000);
    expect(economie.economieCentimes).toBe(15_800);
  });

  it("documente le multiplicateur divergent des lignes optionnelles", () => {
    // État actuel du dépôt : options ×12 alors que le forfait est ×10.
    const annuel = calculerAbonnement({ ...MINI, periodicite: "annuel", personnesActives: 5 });
    expect(annuel.totalHtCentimes).toBe(79_000 + 2 * 1_500 * 12);
    expect(MULTIPLICATEURS_ANNUELS.comptes.statut).toBe("divergent");
    expect(MULTIPLICATEURS_ANNUELS.comptes.recommande).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TVA, arrondis, montant plancher
// ─────────────────────────────────────────────────────────────────────────────

describe("HT, TVA, TTC et arrondis", () => {
  it("calcule la TVA au taux normal", () => {
    const calcul = calculerAbonnement(MINI);
    expect(calcul.tauxTvaPourcent).toBe(20);
    expect(calcul.tvaCentimes).toBe(1_580);
    expect(calcul.totalTtcCentimes).toBe(9_480);
  });

  it("accepte un taux nul (autoliquidation)", () => {
    const calcul = calculerAbonnement({ ...MINI, tauxTvaPourcent: 0 });
    expect(calcul.tvaCentimes).toBe(0);
    expect(calcul.totalTtcCentimes).toBe(calcul.totalHtCentimes);
  });

  it("arrondit un pourcentage au centime, au demi-supérieur", () => {
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [remise({ id: "r1", type: "pourcentage", valeur: 12.5, duree: { mode: "permanente", debut: "2026-01-01" } })],
    });
    // 7 900 × 12,5 % = 987,5 → 988
    expect(calcul.totalRemisesCentimes).toBe(988);
    expect(calcul.totalHtCentimes).toBe(6_912);
  });

  it("répartit une remise globale au prorata, à la somme exacte", () => {
    const configuration: ConfigurationAbonnement = { ...MINI, personnesActives: 5, modules: ["stock"] };
    const calcul = calculerAbonnement(configuration, {
      date: "2026-10-01",
      remises: [remise({ id: "r1", type: "pourcentage", valeur: 33, duree: { mode: "permanente", debut: "2026-01-01" } })],
    });
    expect(calcul.sousTotalHtCentimes).toBe(13_800);
    expect(calcul.totalRemisesCentimes).toBe(Math.round((13_800 * 33) / 100));
    expect(calcul.totalHtCentimes).toBe(13_800 - calcul.totalRemisesCentimes);
  });

  it("ne produit jamais un prix négatif", () => {
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [remise({ id: "r1", type: "montant", valeur: 100_000, duree: { mode: "permanente", debut: "2026-01-01" } })],
    });
    expect(calcul.totalHtCentimes).toBe(0);
    expect(calcul.tvaCentimes).toBe(0);
    expect(calcul.totalTtcCentimes).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'exemple obligatoire du lot : Mini 79 € − 50 %
// ─────────────────────────────────────────────────────────────────────────────

describe("exemple canonique : Mini à 79 € avec 50 % de remise", () => {
  const cinquantePourcent = (duree: Remise["duree"]) =>
    remise({ id: "r-50", type: "pourcentage", valeur: 50, perimetre: { cible: "abonnement" }, duree });

  it("donne 39,50 € HT/mois", () => {
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [cinquantePourcent({ mode: "permanente", debut: "2026-10-01" })],
    });
    expect(calcul.sousTotalHtCentimes).toBe(7_900);
    expect(calcul.totalHtCentimes).toBe(3_950);
    expect(calcul.avantages[0].explication).toContain("50 %");
  });

  it("pendant deux échéances puis retour automatique au tarif normal", () => {
    const r = cinquantePourcent({ mode: "nb_echeances", debut: "2026-10-01", nombre: 2 });
    const echeances = projeterEcheances(MINI, { debutContrat: "2026-10-01", nombre: 4, remises: [r] });
    expect(echeances.map((e) => e.totalHtCentimes)).toEqual([3_950, 3_950, 7_900, 7_900]);
    expect(echeances[1].derniereEcheanceRemisee).toBe(true);
    expect(dateRetourTarifNormal(r, "mensuel")).toBe("2026-12-01");
  });

  it("pendant trois échéances", () => {
    const r = cinquantePourcent({ mode: "nb_echeances", debut: "2026-10-01", nombre: 3 });
    const echeances = projeterEcheances(MINI, { debutContrat: "2026-10-01", nombre: 4, remises: [r] });
    expect(echeances.map((e) => e.totalHtCentimes)).toEqual([3_950, 3_950, 3_950, 7_900]);
  });

  it("sur une seule échéance", () => {
    const r = cinquantePourcent({ mode: "une_echeance", debut: "2026-10-01" });
    const echeances = projeterEcheances(MINI, { debutContrat: "2026-10-01", nombre: 3, remises: [r] });
    expect(echeances.map((e) => e.totalHtCentimes)).toEqual([3_950, 7_900, 7_900]);
  });

  it("sur des dates personnalisées", () => {
    const r = cinquantePourcent({ mode: "dates", debut: "2026-10-15", fin: "2026-12-31" });
    expect(resoudreEtatRemise(r, "2026-10-01", "mensuel")).toBe("programmee");
    expect(resoudreEtatRemise(r, "2026-10-15", "mensuel")).toBe("active");
    expect(resoudreEtatRemise(r, "2026-12-30", "mensuel")).toBe("active");
    expect(resoudreEtatRemise(r, "2026-12-31", "mensuel")).toBe("expiree");
  });

  it("sans date de fin : permanente et jusqu'à révocation restent deux choix distincts", () => {
    const permanente = cinquantePourcent({ mode: "permanente", debut: "2026-10-01" });
    const jusquARevocation = cinquantePourcent({ mode: "jusqu_a_revocation", debut: "2026-10-01" });
    expect(dateRetourTarifNormal(permanente, "mensuel")).toBeNull();
    expect(dateRetourTarifNormal(jusquARevocation, "mensuel")).toBeNull();
    expect(permanente.duree.mode).not.toBe(jusquARevocation.duree.mode);
    expect(resoudreEtatRemise(permanente, "2030-01-01", "mensuel")).toBe("active");
  });

  it("après révocation, le tarif normal reprend et la remise reste à l'historique", () => {
    const r: Remise = {
      ...cinquantePourcent({ mode: "jusqu_a_revocation", debut: "2026-10-01" }),
      etat: "revoquee",
      revoqueeLe: "2026-11-15",
      revoqueePar: "admin-1",
    };
    const calcul = calculerAbonnement(MINI, { date: "2026-12-01", remises: [r] });
    expect(calcul.totalHtCentimes).toBe(7_900);
    expect(calcul.remisesEcartees[0]).toEqual({ id: "r-50", raison: "état revoquee au 2026-12-01" });
    expect(dateRetourTarifNormal(r, "mensuel")).toBe("2026-11-15");
  });

  it("n'est jamais prolongée silencieusement : l'échéance suivante affiche le montant plein", () => {
    const r = cinquantePourcent({ mode: "nb_echeances", debut: "2026-10-01", nombre: 2 });
    const apres = calculerAbonnement(MINI, { date: "2026-12-01", remises: [r] });
    expect(apres.totalHtCentimes).toBe(7_900);
    expect(apres.avantages).toHaveLength(0);
    expect(apres.remisesEcartees[0].raison).toContain("expiree");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Remise permanente en pourcentage vs prix négocié fixe (§9)
// ─────────────────────────────────────────────────────────────────────────────

describe("remise permanente en pourcentage contre prix négocié fixe", () => {
  // Grille publique actuelle (Mini 79 €) puis grille future hypothétique (89 €).
  const lignes = (mensuel: number): LigneAbonnement[] => [
    {
      cle: "forfait:mini",
      libelle: "Forfait Mini",
      famille: "forfait",
      quantite: 1,
      prixUnitaireMensuelCentimes: mensuel,
      montantPeriodeCentimes: mensuel,
      multiplicateurAnnuel: 10,
      statutPrix: "valide",
    },
  ];

  it("le pourcentage permanent suit le nouveau tarif public", () => {
    const r = remise({
      id: "pct",
      type: "pourcentage",
      valeur: 50,
      perimetre: { cible: "forfait" },
      duree: { mode: "permanente", debut: "2026-01-01" },
    });
    const avant = calculerDepuisLignes(lignes(7_900), MINI, { remises: [r], date: "2026-10-01" });
    const apres = calculerDepuisLignes(lignes(8_900), MINI, { remises: [r], date: "2027-10-01" });
    expect(avant.totalHtCentimes).toBe(3_950);
    expect(apres.totalHtCentimes).toBe(4_450);
  });

  it("le prix négocié fixe ne bouge pas quand le tarif public évolue", () => {
    const r = remise({
      id: "fixe",
      type: "prix_negocie",
      valeur: 3_950,
      perimetre: { cible: "forfait" },
      duree: { mode: "permanente", debut: "2026-01-01" },
    });
    const avant = calculerDepuisLignes(lignes(7_900), MINI, { remises: [r], date: "2026-10-01" });
    const apres = calculerDepuisLignes(lignes(8_900), MINI, { remises: [r], date: "2027-10-01" });
    expect(avant.totalHtCentimes).toBe(3_950);
    expect(apres.totalHtCentimes).toBe(3_950);
  });

  it("un prix négocié supérieur au tarif public n'augmente jamais la facture", () => {
    const r = remise({
      id: "fixe-haut",
      type: "prix_negocie",
      valeur: 12_000,
      perimetre: { cible: "forfait" },
      duree: { mode: "permanente", debut: "2026-01-01" },
    });
    const calcul = calculerDepuisLignes(lignes(7_900), MINI, { remises: [r], date: "2026-10-01" });
    expect(calcul.totalHtCentimes).toBe(7_900);
    expect(calcul.avertissements.join(" ")).toContain("supérieur au tarif public");
  });

  it("les deux types ne se confondent jamais dans le résultat", () => {
    const pourcentage = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [remise({ id: "a", type: "pourcentage", valeur: 50, duree: { mode: "permanente", debut: "2026-01-01" } })],
    });
    const negocie = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [remise({ id: "b", type: "prix_negocie", valeur: 3_950, duree: { mode: "permanente", debut: "2026-01-01" } })],
    });
    expect(pourcentage.avantages[0].type).toBe("pourcentage");
    expect(negocie.avantages[0].type).toBe("prix_negocie");
    expect(pourcentage.totalHtCentimes).toBe(negocie.totalHtCentimes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cumul (§12)
// ─────────────────────────────────────────────────────────────────────────────

describe("cumul des remises", () => {
  const forfait50 = remise({
    id: "forfait-50",
    type: "pourcentage",
    valeur: 50,
    perimetre: { cible: "forfait" },
    duree: { mode: "permanente", debut: "2026-01-01" },
  });
  const global10 = remise({
    id: "global-10",
    type: "pourcentage",
    valeur: 10,
    perimetre: { cible: "abonnement" },
    duree: { mode: "permanente", debut: "2026-01-01" },
  });

  it("refuse par défaut deux remises de périmètres recouvrants", () => {
    const calcul = calculerAbonnement(MINI, { date: "2026-10-01", remises: [forfait50, global10] });
    expect(calcul.conflits[0].raison).toBe("cumul_interdit");
    expect(calcul.remisesAppliquees).toEqual(["forfait-50"]);
    expect(calcul.remisesEcartees.map((r) => r.id)).toContain("global-10");
    expect(calcul.totalHtCentimes).toBe(3_950);
  });

  it("cumule en cascade quand les deux remises l'autorisent, du plus étroit au plus large", () => {
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [{ ...forfait50, cumulAutorise: true }, { ...global10, cumulAutorise: true }],
    });
    expect(calcul.avantages.map((a) => a.remiseId)).toEqual(["forfait-50", "global-10"]);
    expect(calcul.avantages[0].reductionCentimes).toBe(3_950);
    // La remise globale s'applique sur le RESTE (3 950), jamais sur le prix d'origine.
    expect(calcul.avantages[1].baseCentimes).toBe(3_950);
    expect(calcul.avantages[1].reductionCentimes).toBe(395);
    expect(calcul.totalHtCentimes).toBe(3_555);
  });

  it("rend l'ordre de calcul lisible", () => {
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [{ ...global10, cumulAutorise: true }, { ...forfait50, cumulAutorise: true }],
    });
    expect(calcul.avantages.map((a) => a.ordre)).toEqual([1, 2]);
    expect(calcul.avantages.map((a) => a.cible)).toEqual(["forfait", "abonnement"]);
  });

  it("garde un prix négocié exclusif, même si le cumul est coché", () => {
    const negocie = remise({
      id: "negocie",
      type: "prix_negocie",
      valeur: 3_950,
      perimetre: { cible: "forfait" },
      duree: { mode: "permanente", debut: "2026-01-01" },
      cumulAutorise: true,
    });
    const calcul = calculerAbonnement(MINI, {
      date: "2026-10-01",
      remises: [negocie, { ...global10, cumulAutorise: true }],
    });
    expect(calcul.conflits[0].raison).toBe("prix_negocie_exclusif");
    expect(calcul.remisesAppliquees).toEqual(["negocie"]);
    expect(calcul.totalHtCentimes).toBe(3_950);
  });

  it("laisse cohabiter deux remises de périmètres disjoints", () => {
    const surModule = remise({
      id: "module-stock",
      type: "pourcentage",
      valeur: 50,
      perimetre: { cible: "modules", cles: ["stock"] },
      duree: { mode: "permanente", debut: "2026-01-01" },
    });
    const calcul = calculerAbonnement({ ...MINI, modules: ["stock"] }, {
      date: "2026-10-01",
      remises: [forfait50, surModule],
    });
    expect(calcul.conflits).toHaveLength(0);
    expect(calcul.totalHtCentimes).toBe(7_900 - 3_950 + 2_900 - 1_450);
  });

  it("détecte le recouvrement partiel de deux listes de modules", () => {
    const a = remise({ id: "a", type: "pourcentage", valeur: 10, perimetre: { cible: "modules", cles: ["stock", "pointage"] }, duree: { mode: "permanente", debut: "2026-01-01" } });
    const b = remise({ id: "b", type: "pourcentage", valeur: 10, perimetre: { cible: "modules", cles: ["pointage"] }, duree: { mode: "permanente", debut: "2026-01-01" } });
    const c = remise({ id: "c", type: "pourcentage", valeur: 10, perimetre: { cible: "modules", cles: ["materiel_vehicules"] }, duree: { mode: "permanente", debut: "2026-01-01" } });
    expect(detecterConflits([a, b])).toHaveLength(1);
    expect(detecterConflits([a, c])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-rétroactivité
// ─────────────────────────────────────────────────────────────────────────────

describe("non-rétroactivité", () => {
  it("une remise créée aujourd'hui ne change pas une échéance déjà passée", () => {
    const r = remise({
      id: "tardive",
      type: "pourcentage",
      valeur: 50,
      duree: { mode: "permanente", debut: "2026-11-01" },
    });
    const echeances = projeterEcheances(MINI, { debutContrat: "2026-09-01", nombre: 3, remises: [r] });
    expect(echeances.map((e) => e.totalHtCentimes)).toEqual([7_900, 7_900, 3_950]);
  });

  it("un changement de tarif public ne modifie pas un abonnement déjà chiffré", () => {
    const contrat: LigneAbonnement[] = [
      { cle: "forfait:mini", libelle: "Forfait Mini", famille: "forfait", quantite: 1, prixUnitaireMensuelCentimes: 7_900, montantPeriodeCentimes: 7_900, multiplicateurAnnuel: 10, statutPrix: "valide" },
    ];
    const chiffrage = calculerDepuisLignes(contrat, MINI, {});
    expect(chiffrage.totalHtCentimes).toBe(7_900);
    // Le catalogue peut évoluer : le chiffrage déjà émis, lui, reste identique.
    expect(calculerDepuisLignes(contrat, MINI, {}).totalHtCentimes).toBe(7_900);
  });

  it("est déterministe : deux calculs identiques donnent le même résultat", () => {
    const options = {
      date: "2026-10-01",
      remises: [remise({ id: "r", type: "pourcentage", valeur: 37, duree: { mode: "permanente", debut: "2026-01-01" } })],
    };
    const configuration: ConfigurationAbonnement = { ...MINI, personnesActives: 7, modules: ["stock", "pointage"], blocsStockage: 1, optionIA: "credits" };
    expect(calculerAbonnement(configuration, options)).toEqual(calculerAbonnement(configuration, options));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparaison et recommandation
// ─────────────────────────────────────────────────────────────────────────────

describe("comparaison et recommandation", () => {
  it("compare la configuration avec les quatre forfaits standards", () => {
    const comparaisons = comparerForfaits({ ...MINI, personnesActives: 5 });
    expect(comparaisons.map((c) => c.forfait)).toEqual(["mini", "pro", "business", "entreprise"]);
    expect(comparaisons.find((c) => c.actuel)?.totalHtCentimes).toBe(10_900);
    expect(comparaisons.find((c) => c.forfait === "pro")?.totalHtCentimes).toBe(24_900);
  });

  it("ne recommande rien quand la configuration actuelle est déjà la moins chère", () => {
    const recommandation = recommanderForfait({ ...MINI, personnesActives: 5 });
    expect(recommandation.forfait).toBeNull();
    expect(recommandation.forcee).toBe(false);
  });

  it("recommande le forfait supérieur quand il devient moins cher, sans l'imposer", () => {
    const configuration: ConfigurationAbonnement = { ...MINI, personnesActives: 20 };
    const recommandation = recommanderForfait(configuration);
    expect(recommandation.forfait).toBe("pro");
    // Mini 20 personnes : 7 900 + 17 × 1 500 = 33 400 ; Pro : 24 900 + 5 × 1 200 = 30 900.
    expect(recommandation.economieCentimes).toBe(2_500);
    expect(recommandation.forcee).toBe(false);
    expect(recommandation.message).toContain("rien n'est imposé");
    // La configuration n'est pas modifiée par la recommandation.
    expect(configuration.forfait).toBe("mini");
  });

  it("signale un forfait qui ne couvre pas les modules demandés", () => {
    const comparaisons = comparerForfaits({ ...MINI, modules: ["stock"] });
    expect(comparaisons.every((c) => c.couvertureComplete)).toBe(true);
    const avecPremium = comparerForfaits({ forfait: "pro", periodicite: "mensuel", modules: ["rentabilite_avancee"] });
    expect(avecPremium.find((c) => c.forfait === "mini")?.couvertureComplete).toBe(false);
    expect(avecPremium.find((c) => c.forfait === "mini")?.modulesManquants).toEqual(["Rentabilité avancée"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation des durées ambiguës sur l'annuel (§11)
// ─────────────────────────────────────────────────────────────────────────────

describe("abonnement annuel et durées ambiguës", () => {
  const r = remise({ id: "r", type: "pourcentage", valeur: 50, duree: { mode: "nb_echeances", debut: "2026-10-01", nombre: 2 } });

  it("refuse une durée en échéances sur l'annuel sans confirmation explicite", () => {
    const erreurs = validerRemise(r, "annuel");
    expect(erreurs.map((e) => e.champ)).toContain("duree.mode");
  });

  it("l'accepte une fois l'interprétation confirmée : deux échéances = deux ANNÉES", () => {
    expect(validerRemise(r, "annuel", { ambiguiteAnnuelleConfirmee: true })).toHaveLength(0);
    expect(dateRetourTarifNormal(r, "annuel")).toBe("2028-10-01");
    expect(dateRetourTarifNormal(r, "mensuel")).toBe("2026-12-01");
  });

  it("accepte sans confirmation une forme non ambiguë : dates explicites", () => {
    const dates = remise({ id: "d", type: "pourcentage", valeur: 50, duree: { mode: "dates", debut: "2026-10-01", fin: "2026-12-01" } });
    expect(validerRemise(dates, "annuel")).toHaveLength(0);
  });

  it("exprime « deux mois offerts » sur l'annuel comme un montant ou un pourcentage explicite", () => {
    const configuration: ConfigurationAbonnement = { ...MINI, periodicite: "annuel" };
    const deuxMois = remise({
      id: "2mois",
      type: "montant",
      valeur: 2 * 7_900,
      perimetre: { cible: "forfait" },
      duree: { mode: "une_echeance", debut: "2026-10-01" },
    });
    const calcul = calculerAbonnement(configuration, { date: "2026-10-01", remises: [deuxMois] });
    expect(calcul.totalHtCentimes).toBe(79_000 - 15_800);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lignes
// ─────────────────────────────────────────────────────────────────────────────

describe("lignes d'abonnement", () => {
  it("détaille chaque composant de la configuration", () => {
    const { lignes } = construireLignes({
      forfait: "mini",
      periodicite: "mensuel",
      personnesActives: 5,
      modules: ["stock", "pointage"],
      blocsStockage: 1,
      optionIA: "intensive",
    });
    expect(lignes.map((l) => l.famille)).toEqual(["forfait", "comptes", "modules", "modules", "stockage", "ia"]);
    expect(lignes.reduce((somme, l) => somme + l.montantPeriodeCentimes, 0)).toBe(
      7_900 + 2 * 1_500 + 2_900 + 2_500 + 1_900 + 7_900,
    );
  });
});
