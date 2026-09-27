import { describe, expect, it } from "vitest";
import { VERSION_TYPE_ALIASES } from "./model";
import { parseVersionType, planVersion } from "./versioning";

const v = (numero: number) => ({ id: `e8000000-0000-0000-0000-00000000000${numero}` as never, numero });

describe("versions typées (miroir de tools_releve_creer_version)", () => {
  it("première version : initiale sans base ; ensuite corrigée sur la dernière", () => {
    expect(planVersion([])).toEqual({ ok: true, plan: { numero: 1, type: "initial", baseId: null } });
    expect(planVersion([v(1), v(2)])).toEqual({ ok: true, plan: { numero: 3, type: "corrige", baseId: v(2).id } });
  });

  it("projetée / as-built sur base explicite", () => {
    expect(planVersion([v(1), v(2)], { type: "projete", baseId: v(1).id })).toMatchObject({ ok: true, plan: { type: "projete", baseId: v(1).id } });
    expect(planVersion([v(1)], { type: "as_built" })).toMatchObject({ ok: true, plan: { type: "as_built", baseId: v(1).id } });
  });

  it("refuse les chaînes incohérentes", () => {
    expect(planVersion([v(1)], { type: "initial" })).toMatchObject({ ok: false, code: "initial_not_first" });
    expect(planVersion([], { type: "initial", baseId: v(1).id })).toMatchObject({ ok: false, code: "initial_with_base" });
    expect(planVersion([], { type: "corrige" })).toMatchObject({ ok: false, code: "initial_missing" });
    expect(planVersion([v(1)], { type: "corrige", baseId: "autre" })).toMatchObject({ ok: false, code: "base_not_found" });
    expect(planVersion([v(1)], { type: "brouillon" as never })).toMatchObject({ ok: false, code: "unknown_type" });
  });

  it("vocabulaire du cahier des charges : initial / corrected / projected / as-built", () => {
    expect(Object.keys(VERSION_TYPE_ALIASES).map(parseVersionType)).toEqual(["initial", "corrige", "projete", "as_built"]);
    expect(parseVersionType("draft")).toBeNull();
  });
});
