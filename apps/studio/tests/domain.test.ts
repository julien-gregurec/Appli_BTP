import { describe, expect, it } from "vitest";
import {
  canManageMember,
  isStudioId,
  selectWorkspace,
  safeStudioDestination,
  workspaceName,
  type StudioWorkspace,
} from "@elsatia/studio-domain";
const a: StudioWorkspace = {
  id: "51000000-0000-0000-0000-000000000001",
  name: "A",
  owner_user_id: "u",
  workspace_type: "personal",
  created_at: "",
  updated_at: "",
  deleted_at: null,
};
describe("scope Studio", () => {
  it("refuse un workspace explicite inconnu, sans fallback", () => {
    expect(selectWorkspace([a], "foreign")).toBeNull();
  });
  it("sélectionne le workspace demandé ou le premier autorisé", () => {
    const b = { ...a, id: "51000000-0000-0000-0000-000000000002" };
    expect(selectWorkspace([a, b], b.id)).toEqual(b);
    expect(selectWorkspace([a])).toEqual(a);
    expect(selectWorkspace([])).toBeNull();
  });
  it("valide les IDs et les noms", () => {
    expect(isStudioId(a.id)).toBe(true);
    expect(isStudioId("../foreign")).toBe(false);
    expect(() => workspaceName(" ")).toThrow();
    expect(() => workspaceName("x".repeat(101))).toThrow();
    expect(workspaceName(" Studio ")).toBe("Studio");
  });
  it.each([
    "//evil.test",
    "https://evil.test",
    "/\\evil",
    "/settings\n",
    "/settings/../evil",
    "/dashboard-evil",
  ])("refuse la redirection %s", (value) => {
    expect(safeStudioDestination(value)).toBe("/dashboard");
  });
  it("préserve seulement une destination Studio", () => {
    expect(safeStudioDestination(`/settings?workspace=${a.id}`)).toBe(
      `/settings?workspace=${a.id}`,
    );
  });
});
describe("permissions UI alignées sur RPC", () => {
  it("protège chaque owner", () => {
    for (const actor of ["owner", "admin", "editor", "viewer"] as const)
      expect(canManageMember(actor, "owner", null)).toBe(false);
  });
  it("empêche toute promotion owner", () => {
    expect(canManageMember("owner", "editor", "owner")).toBe(false);
    expect(canManageMember("admin", "admin", "owner")).toBe(false);
  });
  it("bloque les rôles non gestionnaires", () => {
    expect(canManageMember("editor", "editor", "admin")).toBe(false);
    expect(canManageMember("viewer", "viewer", "admin")).toBe(false);
  });
  it("borne admin et permet owner", () => {
    expect(canManageMember("admin", "editor", "admin")).toBe(false);
    expect(canManageMember("admin", "admin", null)).toBe(false);
    expect(canManageMember("admin", "editor", "viewer")).toBe(true);
    expect(canManageMember("owner", "editor", "admin")).toBe(true);
  });
});
