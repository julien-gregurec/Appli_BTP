import { describe, expect, it } from "vitest";

import { toClientSummary } from "./client";
import {
  CLIENT_SEARCH_MAX_LIMIT,
  buildClientSearchPlan,
  escapeLikePattern,
  validateClientSearchQuery,
  validateClientSearchResult,
} from "./search";
import { CLIENT_SCHEMA_VERSIONS } from "./version";
import { TENANT_A, TENANT_B, makeDetails, makeIdentity } from "./fixtures";

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("plan de recherche", () => {
  it("produit des motifs LIKE conjonctifs", () => {
    const plan = buildClientSearchPlan({ tenantId: TENANT_A, term: "MARTIN Strasbourg" });
    expect(plan.tokens).toEqual(["martin", "strasbourg"]);
    expect(plan.patterns).toEqual(["%martin%", "%strasbourg%"]);
    expect(plan.isListing).toBe(false);
  });

  it("bascule en mode liste quand le terme est vide", () => {
    const plan = buildClientSearchPlan({ tenantId: TENANT_A, term: "  " });
    expect(plan.isListing).toBe(true);
    expect(plan.patterns).toEqual([]);
  });

  it("borne la limite et refuse un offset négatif", () => {
    expect(buildClientSearchPlan({ tenantId: TENANT_A, term: "martin", limit: 5000 }).limit).toBe(CLIENT_SEARCH_MAX_LIMIT);
    expect(buildClientSearchPlan({ tenantId: TENANT_A, term: "martin", limit: 0 }).limit).toBe(1);
    expect(buildClientSearchPlan({ tenantId: TENANT_A, term: "martin", offset: -3 }).offset).toBe(0);
  });

  it("échappe les métacaractères LIKE", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(buildClientSearchPlan({ tenantId: TENANT_A, term: "100%" }).patterns).toEqual(["%100\\%%"]);
  });

  it("porte toujours le locataire dans le plan", () => {
    expect(buildClientSearchPlan({ tenantId: TENANT_A, term: "martin" }).tenantId).toBe(TENANT_A);
  });
});

describe("requête", () => {
  it("refuse une requête sans locataire", () => {
    expect(codes(validateClientSearchQuery({ term: "martin" }))).toContain("tenantId:required");
  });

  it("accepte un terme vide", () => {
    expect(validateClientSearchQuery({ tenantId: TENANT_A, term: "" }).ok).toBe(true);
  });

  it("refuse un champ de recherche inconnu", () => {
    const result = validateClientSearchQuery({ tenantId: TENANT_A, term: "martin", fields: ["siteAddress"] });
    expect(codes(result)).toContain("fields[0]:invalid_enum");
  });

  it("refuse un filtre de catégorie inconnu", () => {
    const result = validateClientSearchQuery({
      tenantId: TENANT_A,
      term: "martin",
      filters: { categories: ["association"] },
    });
    expect(codes(result)).toContain("filters.categories[0]:invalid_enum");
  });
});

describe("résultat — confinement de locataire", () => {
  function makeResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schemaVersion: CLIENT_SCHEMA_VERSIONS.searchResult,
      tenantId: TENANT_A,
      normalizedTerm: "muller",
      hits: [{ client: toClientSummary(makeDetails()), matchedFields: ["legalName"], score: null }],
      limit: 25,
      offset: 0,
      hasMore: false,
      ...overrides,
    };
  }

  it("accepte un résultat homogène", () => {
    expect(validateClientSearchResult(makeResult()).ok).toBe(true);
  });

  it("refuse un résultat contenant une ligne d'un autre locataire", () => {
    const foreign = toClientSummary(makeDetails({ identity: makeIdentity({ tenantId: TENANT_B }) }));
    const result = validateClientSearchResult(
      makeResult({
        hits: [
          { client: toClientSummary(makeDetails()), matchedFields: ["legalName"], score: null },
          { client: foreign, matchedFields: ["legalName"], score: null },
        ],
      }),
    );
    expect(codes(result)).toContain("hits[1].client.tenantId:tenant_mismatch");
  });

  it("refuse un moteur qui dépasse sa propre limite", () => {
    const hit = { client: toClientSummary(makeDetails()), matchedFields: ["legalName"], score: null };
    expect(codes(validateClientSearchResult(makeResult({ limit: 1, hits: [hit, hit] })))).toContain("hits:out_of_range");
  });

  it("refuse un champ de correspondance inconnu", () => {
    const result = validateClientSearchResult(
      makeResult({ hits: [{ client: toClientSummary(makeDetails()), matchedFields: ["adresseChantier"], score: null }] }),
    );
    expect(codes(result)).toContain("hits[0].matchedFields[0]:invalid_enum");
  });

  it("refuse une version de schéma inconnue", () => {
    const result = validateClientSearchResult(makeResult({ schemaVersion: "elsatia.client.search-result/9" }));
    expect(codes(result)).toContain("schemaVersion:unsupported_schema_version");
  });
});

describe("résumé", () => {
  it("reprend l'adresse de facturation dans le résumé", () => {
    const summary = toClientSummary(makeDetails());
    expect(summary.city).toBe("Strasbourg");
    expect(summary.postalCode).toBe("67000");
    expect(summary.siret).toBe("73282932000009");
    expect(summary.tenantId).toBe(TENANT_A);
  });
});
