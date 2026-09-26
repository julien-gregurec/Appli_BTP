import { describe, expect, it } from "vitest";
import {
  construireEntreeJournal,
  estRemiseImportante,
  estRemiseSansFin,
  evaluerRemise,
  masquerIdentifiantStripe,
  type ContexteAutorisationRemise,
} from "@/lib/commercial/autorisations";
import type { Remise } from "@/lib/commercial/types";

const REMISE_LEGERE: Remise = {
  id: "r1",
  type: "pourcentage",
  valeur: 10,
  perimetre: { cible: "abonnement" },
  duree: { mode: "nb_echeances", debut: "2026-10-01", nombre: 2 },
  etat: "active",
  motif: "Geste de bienvenue négocié au téléphone",
};

const REMISE_LOURDE: Remise = {
  ...REMISE_LEGERE,
  id: "r2",
  valeur: 50,
  duree: { mode: "permanente", debut: "2026-10-01" },
};

const CONTEXTE: ContexteAutorisationRemise = {
  estPlateformeAdmin: true,
  aal: "aal2",
  nombreAdminsPlateforme: 1,
  periodicite: "mensuel",
};

describe("autorisations de remise", () => {
  it("exige toujours rôle plateforme, MFA, motif, aperçu et journalisation", () => {
    const verdict = evaluerRemise(REMISE_LEGERE, CONTEXTE);
    expect(verdict.exigences.motifObligatoire).toBe(true);
    expect(verdict.exigences.mfaRequis).toBe(true);
    expect(verdict.exigences.apercuAvantApres).toBe(true);
    expect(verdict.exigences.journalisationImmuable).toBe(true);
    expect(verdict.autorise).toBe(true);
  });

  it("refuse sans rôle plateforme", () => {
    const verdict = evaluerRemise(REMISE_LEGERE, { ...CONTEXTE, estPlateformeAdmin: false });
    expect(verdict.autorise).toBe(false);
    expect(verdict.blocages).toContain("Rôle plateforme requis.");
  });

  it("refuse sans AAL2", () => {
    const verdict = evaluerRemise(REMISE_LEGERE, { ...CONTEXTE, aal: "aal1" });
    expect(verdict.autorise).toBe(false);
    expect(verdict.blocages.join(" ")).toContain("AAL2");
  });

  it("refuse un motif absent ou trop court", () => {
    const verdict = evaluerRemise({ ...REMISE_LEGERE, motif: "ok" }, CONTEXTE);
    expect(verdict.autorise).toBe(false);
    expect(verdict.erreurs.map((e) => e.champ)).toContain("motif");
  });

  it("exige une seconde confirmation pour une remise importante ou permanente", () => {
    const sans = evaluerRemise(REMISE_LOURDE, CONTEXTE);
    expect(sans.exigences.secondeConfirmationRequise).toBe(true);
    expect(sans.exigences.avertissementRenforce).toBe(true);
    expect(sans.autorise).toBe(false);

    const avec = evaluerRemise(REMISE_LOURDE, { ...CONTEXTE, secondeConfirmation: true });
    expect(avec.autorise).toBe(true);
  });

  it("ne bloque pas une exploitation solo : aucun second administrateur exigé", () => {
    const solo = evaluerRemise(REMISE_LOURDE, { ...CONTEXTE, nombreAdminsPlateforme: 1, secondeConfirmation: true });
    expect(solo.exigences.validationSecondAdministrateurRequise).toBe(false);
    expect(solo.autorise).toBe(true);
  });

  it("exige un second administrateur dès qu'il en existe un, pour une remise sans fin", () => {
    const duo = evaluerRemise(REMISE_LOURDE, { ...CONTEXTE, nombreAdminsPlateforme: 2, secondeConfirmation: true });
    expect(duo.exigences.validationSecondAdministrateurRequise).toBe(true);
    expect(duo.autorise).toBe(false);
    const valide = evaluerRemise(REMISE_LOURDE, {
      ...CONTEXTE,
      nombreAdminsPlateforme: 2,
      secondeConfirmation: true,
      validationSecondAdministrateur: true,
    });
    expect(valide.autorise).toBe(true);
  });

  it("traite le prix négocié comme un engagement à confirmer", () => {
    const negocie: Remise = { ...REMISE_LEGERE, type: "prix_negocie", valeur: 3_950 };
    const verdict = evaluerRemise(negocie, CONTEXTE);
    expect(verdict.exigences.secondeConfirmationRequise).toBe(true);
    expect(verdict.exigences.raisons.join(" ")).toContain("figé");
  });

  it("classe correctement l'ampleur d'une remise", () => {
    expect(estRemiseImportante(REMISE_LEGERE)).toBe(false);
    expect(estRemiseImportante(REMISE_LOURDE)).toBe(true);
    expect(estRemiseImportante({ ...REMISE_LEGERE, type: "montant", valeur: 3_000 }, 7_900)).toBe(true);
    expect(estRemiseImportante({ ...REMISE_LEGERE, type: "montant", valeur: 1_000 }, 7_900)).toBe(false);
    expect(estRemiseSansFin(REMISE_LOURDE)).toBe(true);
    expect(estRemiseSansFin(REMISE_LEGERE)).toBe(false);
  });

  it("propage l'ambiguïté annuelle jusqu'au verdict", () => {
    const annuel = evaluerRemise(REMISE_LEGERE, { ...CONTEXTE, periodicite: "annuel" });
    expect(annuel.autorise).toBe(false);
    expect(annuel.erreurs.map((e) => e.champ)).toContain("duree.mode");
    const confirme = evaluerRemise(REMISE_LEGERE, {
      ...CONTEXTE,
      periodicite: "annuel",
      ambiguiteAnnuelleConfirmee: true,
    });
    expect(confirme.autorise).toBe(true);
  });
});

describe("journalisation", () => {
  it("masque toujours l'identifiant Stripe", () => {
    expect(masquerIdentifiantStripe("sub_1A2B3C4D5E")).toBe("sub_…4D5E");
    expect(masquerIdentifiantStripe(null)).toBeNull();
    expect(masquerIdentifiantStripe("sub_1A2B3C4D5E")).not.toContain("1A2B3C");
  });

  it("conserve tout ce qu'exige le §14", () => {
    const entree = construireEntreeJournal({
      action: "creation",
      entrepriseId: "ent-1",
      abonnementId: "ab-1",
      forfait: "mini",
      modules: ["stock"],
      tarifPublicCentimes: 7_900,
      ancienPrixCentimes: 7_900,
      nouveauPrixCentimes: 3_950,
      remise: REMISE_LOURDE,
      dateFin: null,
      auteurId: "admin-1",
      identifiantStripe: "sub_1A2B3C4D5E",
      facturesConcernees: ["in_123"],
      creeLe: "2026-10-01T09:00:00.000Z",
    });
    expect(entree.impactEstimeCentimes).toBe(3_950);
    expect(entree.referenceStripeMasquee).toBe("sub_…4D5E");
    expect(entree.dateFin).toBeNull();
    expect(entree.motif).toBe(REMISE_LOURDE.motif);
    expect(entree.perimetre).toBe("abonnement");
  });

  it("conserve le détail du périmètre quand il vise des modules précis", () => {
    const entree = construireEntreeJournal({
      action: "creation",
      entrepriseId: "ent-1",
      forfait: "mini",
      tarifPublicCentimes: 2_900,
      ancienPrixCentimes: 2_900,
      nouveauPrixCentimes: 1_450,
      remise: { ...REMISE_LEGERE, perimetre: { cible: "modules", cles: ["stock", "pointage"] } },
      dateFin: "2026-12-01",
      creeLe: "2026-10-01T09:00:00.000Z",
    });
    expect(entree.perimetre).toBe("modules:stock,pointage");
  });
});
