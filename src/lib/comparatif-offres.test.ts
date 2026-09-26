import { describe, expect, it } from "vitest";
import { calculerGainsOffreSuivante, calculerReductionRemise, CATEGORIES_COMPARATIF, etatLigneComparatif, type LigneComparatif } from "./comparatif-offres";

function ligne(cle: string): LigneComparatif {
  for (const categorie of CATEGORIES_COMPARATIF) {
    const trouvee = categorie.lignes.find((l) => l.cle === cle);
    if (trouvee) return trouvee;
  }
  throw new Error(`Ligne comparatif introuvable : ${cle}`);
}

describe("comparatif des offres — mapping tarification ↔ features", () => {
  it("marque BETA même quand la permission est incluse dans l'offre (facturation avancée, SOCLE dès Mini)", () => {
    expect(etatLigneComparatif(ligne("facturation_avancee"), "mini")).toBe("beta");
    expect(etatLigneComparatif(ligne("facturation_avancee"), "entreprise")).toBe("beta");
  });

  it("marque 'non_inclus' pour un module BETA quand la permission elle-même n'est pas incluse", () => {
    expect(etatLigneComparatif(ligne("crm"), "mini")).toBe("non_inclus");
  });

  it("marque BETA pour un module BETA quand la permission est incluse (CRM à partir de Pro)", () => {
    expect(etatLigneComparatif(ligne("crm"), "pro")).toBe("beta");
  });

  it("marque 'desactive' pour un module DISABLED, quelle que soit l'offre (paiements bancaires, appels d'offres)", () => {
    expect(etatLigneComparatif(ligne("paiements_bancaires"), "entreprise")).toBe("desactive");
    expect(etatLigneComparatif(ligne("appels_offres"), "entreprise")).toBe("desactive");
    expect(etatLigneComparatif(ligne("paiements_bancaires"), "mini")).toBe("desactive");
  });

  it("marque 'inclus' pour un module CORE dont la permission est incluse (clients, toutes offres)", () => {
    for (const offre of ["mini", "pro", "business", "entreprise", "sur_mesure"] as const) {
      expect(etatLigneComparatif(ligne("clients"), offre)).toBe("inclus");
    }
  });

  it("marque 'non_inclus' pour un module CORE dont la permission manque à ce palier (stock, absent avant Business)", () => {
    expect(etatLigneComparatif(ligne("stock"), "mini")).toBe("non_inclus");
    expect(etatLigneComparatif(ligne("stock"), "pro")).toBe("non_inclus");
    expect(etatLigneComparatif(ligne("stock"), "business")).toBe("inclus");
    expect(etatLigneComparatif(ligne("stock"), "entreprise")).toBe("inclus");
  });

  it("reflète la palier Mini corrigé (COMPTES-SUPPLEMENTAIRES-V1C) : gestion des employés incluse dès Mini", () => {
    expect(etatLigneComparatif(ligne("employes"), "mini")).toBe("inclus");
    expect(etatLigneComparatif(ligne("pointage"), "mini")).toBe("non_inclus");
  });

  it("marque 'inclus' pour l'administration (toujours autorisée, cf. permissionIncluseDansOffre)", () => {
    expect(etatLigneComparatif(ligne("administration"), "mini")).toBe("inclus");
  });

  it("marque 'desactive' pour les connecteurs (DISABLED) même si la permission n'apparaît qu'en Entreprise", () => {
    expect(etatLigneComparatif(ligne("connecteurs"), "mini")).toBe("desactive");
    expect(etatLigneComparatif(ligne("connecteurs"), "entreprise")).toBe("desactive");
  });

  it("calcule les gains réels Mini → Pro (nouveaux modules stables uniquement)", () => {
    const gains = calculerGainsOffreSuivante("mini", "pro");
    expect(gains).toContain("Pointage des heures");
    expect(gains).toContain("Demandes de congés");
    // acces_employes est deja inclus en Mini (COMPTES-SUPPLEMENTAIRES-V1C) : pas un gain Pro.
    expect(gains).not.toContain("Gestion des employés");
    // CRM est BETA à partir de Pro : affiché comme gain, mais marqué explicitement.
    expect(gains).toContain("CRM (BETA)");
  });

  it("ne présente jamais un module DISABLED comme un gain (Business → Entreprise : connecteurs restent indisponibles)", () => {
    const gains = calculerGainsOffreSuivante("business", "entreprise");
    expect(gains.some((g) => g.startsWith("Connecteurs"))).toBe(false);
  });

  it("ne répète pas un gain déjà acquis au palier précédent (Business → Entreprise n'inclut plus le stock, déjà gagné en Business)", () => {
    const gains = calculerGainsOffreSuivante("business", "entreprise");
    expect(gains).not.toContain("Gestion du stock");
  });

  it("calcule une reduction pourcentage sur le sous-total (10% de 109€ = 10,90€, cf. test réel REMISES-CLIENTS-V1)", () => {
    expect(calculerReductionRemise({ type: "pourcentage", valeur: 10, sousTotal: 109 })).toBeCloseTo(10.9, 5);
  });

  it("calcule une reduction montant fixe telle quelle", () => {
    expect(calculerReductionRemise({ type: "montant", valeur: 27.3, sousTotal: 273 })).toBe(27.3);
  });

  it("renvoie 0 sans remise active", () => {
    expect(calculerReductionRemise({ type: null, valeur: null, sousTotal: 249 })).toBe(0);
    expect(calculerReductionRemise({ type: "montant", valeur: 0, sousTotal: 249 })).toBe(0);
  });

  it("ne renvoie jamais une reduction superieure au sous-total (le total ne peut jamais devenir negatif)", () => {
    expect(calculerReductionRemise({ type: "montant", valeur: 500, sousTotal: 79 })).toBe(79);
  });

  it("n'invente aucune ligne pour des capacités non séparément permissionnées (alertes, documents, comptes-rendus)", () => {
    const toutesLesCles = CATEGORIES_COMPARATIF.flatMap((c) => c.lignes.map((l) => l.cle));
    expect(toutesLesCles).not.toContain("alertes");
    expect(toutesLesCles).not.toContain("delegation_alertes");
    expect(toutesLesCles).not.toContain("documents_chantier");
    expect(toutesLesCles).not.toContain("comptes_rendus");
    expect(toutesLesCles).not.toContain("grands_deplacements");
  });
});
