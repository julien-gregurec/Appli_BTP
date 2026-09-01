import { describe, expect, it } from "vitest";
import {
  OFFRES,
  prixAbonnementMensuel,
  recommanderOffre,
  REDUCTION_ANNUELLE,
  actionsLigneAdminPlateforme,
  emailAdminCourantNormalise,
  type LigneAdminPlateforme,
} from "@/lib/plateforme";

const mini = OFFRES[0];
const pro = OFFRES[1];

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(mini.base);
    expect(prixAbonnementMensuel(3).total).toBe(mini.base);
  });

  it("facture chaque compte au-delà des comptes inclus", () => {
    expect(prixAbonnementMensuel(4)).toMatchObject({
      total: mini.base + mini.parCompteSup,
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel(16, pro).total).toBe(pro.base + pro.parCompteSup);
  });

  it("ajoute le dépassement d'appareils", () => {
    expect(prixAbonnementMensuel(3, mini, 28).total).toBe(mini.base + 28);
  });

  it("utilise le prix annuel propre à l'offre", () => {
    const p = prixAbonnementMensuel(3, mini);
    expect(REDUCTION_ANNUELLE).toBe(0);
    expect(p.mensuelSiAnnuel).toBe(mini.prixAnnuelCentimes / 100 / 12);
    expect(p.totalAnnuel).toBe(mini.prixAnnuelCentimes / 100);
  });
});

describe("recommanderOffre", () => {
  it("recommande le palier le plus élevé exigé par les besoins", () => {
    expect(recommanderOffre(["devis_factures"], 1).offre.cle).toBe("mini");
    expect(recommanderOffre(["planning"], 4).offre.cle).toBe("pro");
    expect(recommanderOffre(["stock"], 20).offre.cle).toBe("business");
    expect(recommanderOffre(["portail_client"], 20).offre.cle).toBe("entreprise");
  });
});

describe("emailAdminCourantNormalise", () => {
  it("normalise (trim + minuscules) ou renvoie null", () => {
    expect(emailAdminCourantNormalise("  Julien@Elsatia.FR ")).toBe("julien@elsatia.fr");
    expect(emailAdminCourantNormalise("")).toBeNull();
    expect(emailAdminCourantNormalise("   ")).toBeNull();
    expect(emailAdminCourantNormalise(null)).toBeNull();
    expect(emailAdminCourantNormalise(undefined)).toBeNull();
  });
});

describe("actionsLigneAdminPlateforme", () => {
  const ligne = (o: Partial<LigneAdminPlateforme>): LigneAdminPlateforme => ({
    email: "membre@elsatia.fr",
    actif: true,
    statut_identite: "active",
    ...o,
  });

  it("compte courant actif : aucun formulaire de retrait, mention « Votre compte »", () => {
    const a = actionsLigneAdminPlateforme(ligne({ email: "julien@elsatia.fr" }), "julien@elsatia.fr");
    expect(a.estUtilisateurCourant).toBe(true);
    expect(a.peutAfficherRetrait).toBe(false);
    expect(a.estRevoque).toBe(false);
  });

  it("reconnaît le compte courant malgré la casse et les espaces de l'email", () => {
    const a = actionsLigneAdminPlateforme(
      ligne({ email: "  Julien@Elsatia.FR " }),
      emailAdminCourantNormalise("JULIEN@elsatia.fr"),
    );
    expect(a.estUtilisateurCourant).toBe(true);
    expect(a.peutAfficherRetrait).toBe(false);
  });

  it("compte révoqué (statut_identite) : aucun formulaire de retrait, mention « Déjà révoqué »", () => {
    const a = actionsLigneAdminPlateforme(ligne({ actif: false, statut_identite: "revoquee" }), "julien@elsatia.fr");
    expect(a.estRevoque).toBe(true);
    expect(a.peutAfficherRetrait).toBe(false);
  });

  it("compte révoqué même si c'est aussi le compte courant : pas de retrait", () => {
    const a = actionsLigneAdminPlateforme(
      ligne({ email: "julien@elsatia.fr", actif: false, statut_identite: "revoquee" }),
      "julien@elsatia.fr",
    );
    expect(a.peutAfficherRetrait).toBe(false);
  });

  it("autre administrateur actif : formulaire de retrait présent", () => {
    const a = actionsLigneAdminPlateforme(ligne({ email: "autre@elsatia.fr" }), "julien@elsatia.fr");
    expect(a.estUtilisateurCourant).toBe(false);
    expect(a.estRevoque).toBe(false);
    expect(a.peutAfficherRetrait).toBe(true);
  });

  it("identité en attente (rattachée / en_attente) : le retrait reste possible (annulation d'un ajout)", () => {
    for (const s of ["rattachee_non_confirmee", "en_attente"]) {
      const a = actionsLigneAdminPlateforme(ligne({ email: "attente@elsatia.fr", actif: false, statut_identite: s }), "julien@elsatia.fr");
      expect(a.estRevoque).toBe(false);
      expect(a.peutAfficherRetrait).toBe(true);
    }
  });

  it("repli : liste sans statut_identite, actif=false => considéré révoqué", () => {
    const a = actionsLigneAdminPlateforme(ligne({ actif: false, statut_identite: null }), "julien@elsatia.fr");
    expect(a.estRevoque).toBe(true);
    expect(a.peutAfficherRetrait).toBe(false);
  });

  it("données incohérentes (actif null, statut null) : mode sûr, aucune action de retrait", () => {
    const a = actionsLigneAdminPlateforme(ligne({ actif: null, statut_identite: null }), "julien@elsatia.fr");
    expect(a.peutAfficherRetrait).toBe(false);
    expect(a.estRevoque).toBe(false);
    expect(a.estUtilisateurCourant).toBe(false);
  });

  it("email courant null + autre admin actif : retrait impossible, libellé « Action indisponible »", () => {
    const a = actionsLigneAdminPlateforme(ligne({ email: "autre@elsatia.fr" }), null);
    expect(a.peutAfficherRetrait).toBe(false);
    expect(a.retraitIndisponible).toBe(true);
    expect(a.estUtilisateurCourant).toBe(false);
  });

  it("email courant vide ou espaces (après normalisation) : aucune action de retrait", () => {
    for (const brut of ["", "   ", "\t"]) {
      const a = actionsLigneAdminPlateforme(ligne({ email: "autre@elsatia.fr" }), emailAdminCourantNormalise(brut));
      expect(a.peutAfficherRetrait).toBe(false);
      expect(a.retraitIndisponible).toBe(true);
    }
  });

  it("email courant valide + autre admin actif : retrait autorisé dans l'interface", () => {
    const a = actionsLigneAdminPlateforme(ligne({ email: "autre@elsatia.fr" }), emailAdminCourantNormalise("julien@elsatia.fr"));
    expect(a.peutAfficherRetrait).toBe(true);
    expect(a.retraitIndisponible).toBe(false);
  });

  it("identité courante inconnue : aucune ligne ne peut afficher de formulaire de retrait", () => {
    const lignes: Partial<LigneAdminPlateforme>[] = [
      { email: "actif@elsatia.fr", actif: true, statut_identite: "active" },
      { email: "julien@elsatia.fr", actif: true, statut_identite: "active" },
      { email: "revoque@elsatia.fr", actif: false, statut_identite: "revoquee" },
      { email: "attente@elsatia.fr", actif: false, statut_identite: "en_attente" },
      { email: "incoherent@elsatia.fr", actif: null, statut_identite: null },
    ];
    for (const l of lignes) {
      expect(actionsLigneAdminPlateforme(ligne(l), null).peutAfficherRetrait).toBe(false);
    }
  });

  it("email de ligne vide : jamais reconnu comme compte courant", () => {
    const a = actionsLigneAdminPlateforme(ligne({ email: "" }), null);
    expect(a.estUtilisateurCourant).toBe(false);
    expect(a.peutAfficherRetrait).toBe(false);
  });
});
