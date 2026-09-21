import { describe, expect, it } from "vitest";

import { validateClientCreateInput, validateClientDetails } from "./client";
import {
  CLIENT_CATEGORIES,
  computeClientDisplayName,
  deriveClientKind,
  validateClientIdentity,
} from "./identity";
import {
  CLIENT_A,
  TENANT_A,
  VALID_SIREN,
  VALID_SIRET,
  makeDetails,
  makeIdentity,
  makeLegalIdentity,
  makeMinimalIndividual,
} from "./fixtures";

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("catégorie et nature dérivée", () => {
  it("ne classe en particulier que la catégorie particulier", () => {
    expect(deriveClientKind("particulier")).toBe("individual");
    for (const category of CLIENT_CATEGORIES.filter((entry) => entry !== "particulier")) {
      expect(deriveClientKind(category)).toBe("company");
    }
  });

  it("refuse un kind incohérent avec la catégorie", () => {
    const identity = { ...makeIdentity({ category: "professionnel" }), kind: "individual" as const };
    expect(codes(validateClientIdentity(identity))).toContain("kind:invariant_violated");
  });
});

describe("nom d'affichage", () => {
  it("fait primer l'état civil pour un particulier, même si une société traîne", () => {
    // Défaut relevé par l'audit sur `nomClient` : la société l'emportait quelle que soit
    // la catégorie, si bien qu'un particulier s'affichait en professionnel.
    expect(
      computeClientDisplayName({
        category: "particulier",
        legalName: "SOCIETE SAISIE PAR ERREUR",
        tradeName: null,
        firstName: "Jean",
        lastName: "Dupont",
        reference: "CLI-0001",
      }),
    ).toBe("Jean Dupont");
  });

  it("fait primer la raison sociale pour un professionnel", () => {
    expect(
      computeClientDisplayName({
        category: "professionnel",
        legalName: "MENUISERIE MULLER",
        tradeName: "Muller Agencement",
        firstName: "Claire",
        lastName: "Muller",
        reference: "CLI-0042",
      }),
    ).toBe("MENUISERIE MULLER");
  });

  it("se replie sur la référence quand aucun nom n'est saisi", () => {
    expect(
      computeClientDisplayName({
        category: "professionnel",
        legalName: null,
        tradeName: null,
        firstName: null,
        lastName: null,
        reference: "CLI-0099",
      }),
    ).toBe("CLI-0099");
  });

  it("refuse un displayName qui ne serait pas la valeur dérivée", () => {
    const identity = { ...makeIdentity(), displayName: "Nom bricolé à la main" };
    expect(codes(validateClientIdentity(identity))).toContain("displayName:invariant_violated");
  });
});

describe("particulier", () => {
  it("accepte un particulier minimal, sans adresse ni contact", () => {
    const result = validateClientDetails(makeMinimalIndividual());
    expect(result.ok).toBe(true);
  });

  it("refuse une identité légale sur un particulier", () => {
    const identity = makeIdentity({ category: "particulier", firstName: "Jean", lastName: "Dupont", legalName: null });
    const withLegal = { ...identity, legal: makeLegalIdentity() };
    expect(codes(validateClientIdentity(withLegal))).toContain("legal:invariant_violated");
  });
});

describe("professionnel", () => {
  it("accepte une fiche complète", () => {
    expect(validateClientDetails(makeDetails()).ok).toBe(true);
  });

  it("refuse un SIRET dont le SIREN ne correspond pas au SIREN déclaré", () => {
    const identity = makeIdentity({
      legal: makeLegalIdentity({ siren: "552100554", siret: VALID_SIRET, vatNumber: "FR96552100554" }),
    });
    expect(codes(validateClientIdentity(identity))).toContain("legal.siret:invariant_violated");
  });

  it("refuse un SIRET de clé fausse", () => {
    const identity = makeIdentity({ legal: makeLegalIdentity({ siret: "73282932000008" }) });
    expect(codes(validateClientIdentity(identity))).toContain("legal.siret:invalid_checksum");
  });

  it("refuse un code APE mal formé", () => {
    const identity = makeIdentity({ legal: makeLegalIdentity({ activityCode: "43321" }) });
    expect(codes(validateClientIdentity(identity))).toContain("legal.activityCode:invalid_format");
  });

  it("accepte le code APE écrit avec un point", () => {
    const identity = makeIdentity({ legal: makeLegalIdentity({ activityCode: "43.32A" }) });
    expect(validateClientIdentity(identity).ok).toBe(true);
  });
});

describe("données invalides", () => {
  it("collecte plusieurs anomalies au lieu de s'arrêter à la première", () => {
    const identity = {
      ...makeIdentity(),
      id: "pas-un-uuid",
      email: "pas-un-email",
      status: "inconnu",
      legal: makeLegalIdentity({ siren: "123456789" }),
    };
    const issues = codes(validateClientIdentity(identity));
    expect(issues).toContain("id:invalid_format");
    expect(issues).toContain("email:invalid_format");
    expect(issues).toContain("status:invalid_enum");
    expect(issues).toContain("legal.siren:invalid_checksum");
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it("refuse un objet qui n'est pas un objet", () => {
    expect(validateClientIdentity("MENUISERIE MULLER").ok).toBe(false);
    expect(validateClientIdentity(null).ok).toBe(false);
    expect(validateClientIdentity([]).ok).toBe(false);
  });
});

describe("charge utile de création", () => {
  it("accepte un particulier réduit à un nom", () => {
    const result = validateClientCreateInput({
      tenantId: TENANT_A,
      category: "particulier",
      lastName: "Dupont",
    });
    expect(result.ok).toBe(true);
  });

  it("refuse une création sans le moindre élément d'identité", () => {
    const result = validateClientCreateInput({ tenantId: TENANT_A, category: "professionnel" });
    expect(result.ok).toBe(false);
  });

  it("refuse une création sans locataire", () => {
    const result = validateClientCreateInput({ category: "professionnel", legalName: "ACME" });
    expect(codes(result)).toContain("tenantId:required");
  });

  it("refuse une identité légale sur une création de particulier", () => {
    const result = validateClientCreateInput({
      tenantId: TENANT_A,
      category: "particulier",
      lastName: "Dupont",
      legal: { siren: VALID_SIREN },
    });
    expect(codes(result)).toContain("legal:invariant_violated");
  });
});

describe("client identifié", () => {
  it("expose bien le client attendu dans le jeu d'essai", () => {
    expect(makeIdentity().id).toBe(CLIENT_A);
    expect(makeIdentity().tenantId).toBe(TENANT_A);
  });
});
