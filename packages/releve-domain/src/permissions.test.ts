import { describe, expect, it } from "vitest";
import { actor, releveFixture, TENANT_B, USER_ADMIN, USER_OTHER } from "./fixtures";
import { allowedActions, canPerform, RELEVE_ACTIONS, RELEVE_ROLES, tenantDecision, type ReleveRole } from "./permissions";

const own = releveFixture();
const othersPrivate = releveFixture({ proprietaireId: USER_OTHER });
const othersShared = releveFixture({ proprietaireId: USER_OTHER, visibilite: "entreprise" });

/**
 * Table de parité avec `tools_releve_peut()` (SQL) — mêmes cas que la suite pgTAP
 * `elsatia_tools_releve_metre_foundation_v1.test.sql` §D.
 */
const MATRIX: Array<[ReleveRole, "own" | "othersPrivate" | "othersShared", string[]]> = [
  ["tools_releve_admin", "own", ["view", "edit", "delete", "share", "export", "sync-gp"]],
  ["tools_releve_admin", "othersPrivate", ["view", "edit", "delete", "share", "export", "sync-gp"]],
  ["tools_releve_admin", "othersShared", ["view", "edit", "delete", "share", "export", "sync-gp"]],
  ["tools_releve_metreur", "own", ["view", "edit", "delete", "share", "export", "sync-gp"]],
  ["tools_releve_metreur", "othersPrivate", []],
  ["tools_releve_metreur", "othersShared", ["view", "edit", "export", "sync-gp"]],
  ["tools_pro", "own", ["view", "edit", "delete", "share", "export", "sync-gp"]],
  ["tools_pro", "othersPrivate", []],
  ["tools_pro", "othersShared", ["view", "edit", "export", "sync-gp"]],
  ["tools_releve_consultation", "othersPrivate", []],
  ["tools_releve_consultation", "othersShared", ["view", "export"]],
];

describe("matrice de permissions Relevé & Métré", () => {
  it.each(MATRIX)("%s sur relevé %s", (role, subjectKey, expected) => {
    const subject = { own, othersPrivate, othersShared }[subjectKey];
    const ctx = actor({ role, gpGererOuvrages: true });
    expect(allowedActions(ctx, subject)).toEqual(expected.filter((action) => action !== "create"));
  });

  it("couvre les sept actions et les quatre rôles du contrat", () => {
    expect(RELEVE_ACTIONS).toEqual(["view", "create", "edit", "delete", "share", "export", "sync-gp"]);
    expect(RELEVE_ROLES).toHaveLength(4);
  });

  it("create est une décision d'organisation, refusée à la consultation", () => {
    expect(canPerform(actor(), "create").allowed).toBe(true);
    expect(canPerform(actor({ role: "tools_releve_consultation" }), "create")).toEqual({ allowed: false, reason: "role" });
  });

  it("exige les trois dimensions : organisation, entitlement personnel, rôle", () => {
    expect(tenantDecision(actor({ tenantHasTools: false }), "view")).toEqual({ allowed: false, reason: "tenant_access" });
    expect(tenantDecision(actor({ hasReleveCapability: false }), "view")).toEqual({ allowed: false, reason: "entitlement" });
    expect(tenantDecision(actor({ role: null }), "view")).toEqual({ allowed: false, reason: "role" });
  });

  it("sync-gp exige en plus la permission Gestion Pro gerer_ouvrages", () => {
    expect(canPerform(actor({ gpGererOuvrages: false }), "sync-gp", own)).toEqual({ allowed: false, reason: "gp_permission" });
    expect(canPerform(actor({ gpGererOuvrages: true }), "sync-gp", own).allowed).toBe(true);
  });

  it("refuse tout relevé d'un autre tenant, même à un administrateur", () => {
    const foreign = releveFixture({ entrepriseId: TENANT_B });
    for (const action of RELEVE_ACTIONS) {
      if (action === "create") continue;
      expect(canPerform(actor({ role: "tools_releve_admin", gpGererOuvrages: true }), action, foreign)).toEqual({ allowed: false, reason: "cross_tenant" });
    }
  });

  it("un relevé supprimé n'ouvre que la corbeille à son propriétaire et à l'administrateur", () => {
    const deleted = releveFixture({ deletedAt: "2026-09-26T11:00:00.000Z" });
    expect(allowedActions(actor(), deleted)).toEqual(["view", "delete"]);
    expect(allowedActions(actor({ userId: USER_OTHER }), { ...deleted, visibilite: "entreprise" })).toEqual([]);
    expect(allowedActions(actor({ userId: USER_ADMIN, role: "tools_releve_admin" }), deleted)).toEqual(["view", "delete"]);
  });
});
