import { describe, it, expect } from "vitest";
import {
  validateProject,
  projectTypes,
  aspectRatios,
  canEditProject,
  canManageProject,
  chronologicalIds,
  moveMedia,
  durationLabel,
} from "@elsatia/studio-domain";
const input = {
  name: "Voyage",
  project_type: "travel",
  description: "",
  location_label: "Croatie",
  started_at: "2026-07-01",
  ended_at: "2026-07-15",
  target_aspect_ratio: "9:16",
  target_duration_seconds: 90,
  status: "draft",
  metadata_json: {},
};
describe("Projet : contrat client et serveur", () => {
  for (const type of Object.keys(projectTypes))
    it(`crée ${type} sans entreprise`, () =>
      expect(
        validateProject({ ...input, project_type: type }).project_type,
      ).toBe(type));
  for (const ratio of Object.keys(aspectRatios))
    it(`format ${ratio}`, () =>
      expect(
        validateProject({ ...input, target_aspect_ratio: ratio })
          .target_aspect_ratio,
      ).toBe(ratio));
  for (const value of [null, 1, 15, 30, 60, 90, 120, 600])
    it(`durée ${value}`, () =>
      expect(
        validateProject({ ...input, target_duration_seconds: value })
          .target_duration_seconds,
      ).toBe(value));
  for (const patch of [
    { name: "" },
    { name: " " },
    { name: "x".repeat(101) },
    { project_type: "btp_required" },
    { target_aspect_ratio: "4:3" },
    { target_duration_seconds: 0 },
    { target_duration_seconds: 601 },
    { target_duration_seconds: 2.5 },
    { target_duration_seconds: NaN },
    { started_at: "2026-02-30" },
    { ended_at: "2025-01-01" },
    { status: "rendering" },
    { metadata_json: { company: "obligatoire" } },
    { metadata_json: [] },
    { description: "x".repeat(2001) },
  ])
    it(`refuse ${JSON.stringify(patch)}`, () =>
      expect(() => validateProject({ ...input, ...patch })).toThrow());
  it("champs chantier libres et bornés, sans FK", () =>
    expect(
      validateProject({
        ...input,
        project_type: "construction",
        metadata_json: {
          client: "Particulier",
          company: "Indépendant",
          services: "Peinture",
        },
      }).metadata_json.client,
    ).toBe("Particulier"));
  it("update normalise le nom et conserve les paramètres", () =>
    expect(
      validateProject({ ...input, name: "  Croatie  ", description: "Séjour" }),
    ).toMatchObject({
      name: "Croatie",
      target_duration_seconds: 90,
      description: "Séjour",
    }));
  it("automatique explicite", () =>
    expect(durationLabel(null)).toBe("Automatique"));
});
describe("Permissions projet", () => {
  for (const role of ["owner", "admin", "editor", "viewer"]) {
    it(`${role} édition active`, () =>
      expect(canEditProject(role, "draft")).toBe(role !== "viewer"));
    it(`${role} archive lecture seule`, () =>
      expect(canEditProject(role, "archived")).toBe(false));
    it(`${role} suppression/archive/restauration`, () =>
      expect(canManageProject(role)).toBe(["owner", "admin"].includes(role)));
  }
});
describe("Ordre préférentiel", () => {
  const items = [
    { id: "a", captured_at: null, created_at: "2026-07-01", sort_order: 0 },
    {
      id: "b",
      captured_at: "2026-06-01",
      created_at: "2026-08-01",
      sort_order: 1,
    },
    { id: "c", captured_at: null, created_at: "2026-07-01", sort_order: 2 },
  ];
  it("date capturée sinon import, égalités stables", () =>
    expect(chronologicalIds(items)).toEqual(["b", "a", "c"]));
  it("ne mute pas les données sources", () => {
    chronologicalIds(items);
    expect(items.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("déplacement bas et haut sans perte", () => {
    expect(moveMedia(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveMedia(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
  it("référence inconnue refusée", () =>
    expect(() => moveMedia(["a"], "x", "a")).toThrow());
});
