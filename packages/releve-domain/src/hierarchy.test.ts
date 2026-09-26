import { describe, expect, it } from "vitest";
import { releveFixture, TENANT_A, TENANT_B, USER_OWNER } from "./fixtures";
import { checkStructureIntegrity, descendantsOf, nextOrdre, niveauLabel } from "./hierarchy";
import type { Batiment, Etage, Piece, ReleveStructure, Zone } from "./model";

const meta = { entrepriseId: TENANT_A, createdAt: "2026-09-26T10:00:00Z", updatedAt: "2026-09-26T10:00:00Z", createdBy: USER_OWNER, updatedBy: USER_OWNER, revision: 1, deletedAt: null };
const releve = releveFixture();
const batiment = { ...meta, id: "b1", releveId: releve.id, nom: "A", ordre: 0, notes: null } as unknown as Batiment;
const rdc = { ...meta, id: "e0", releveId: releve.id, batimentId: "b1", nom: "RDC", niveau: 0, altitudeMm: null, hauteurSousPlafondMm: null, etat: "existant", ordre: 0 } as unknown as Etage;
const r1 = { ...rdc, id: "e1", nom: "R+1", niveau: 1 } as unknown as Etage;
const zone = { ...meta, id: "z0", releveId: releve.id, etageId: "e0", nom: "Logement", type: "logement", ordre: 0 } as unknown as Zone;
const piece = { ...meta, id: "p0", releveId: releve.id, etageId: "e0", zoneId: "z0", nom: "Séjour", usage: "sejour", hauteurSousPlafondMm: null, ordre: 0 } as unknown as Piece;

function structure(overrides: Partial<ReleveStructure> = {}): ReleveStructure {
  return { releve, batiments: [batiment], etages: [rdc, r1], zones: [zone], pieces: [piece], ...overrides };
}

describe("intégrité de la hiérarchie (miroir des clés composites SQL)", () => {
  it("une structure saine ne remonte aucune anomalie", () => {
    expect(checkStructureIntegrity(structure())).toEqual([]);
  });

  it("détecte tenant, relevé, orphelin, zone d'un autre étage, doublons", () => {
    const issues = checkStructureIntegrity(structure({
      etages: [rdc, r1, { ...r1, id: "e2", batimentId: "absent" } as Etage, { ...r1, id: "e3", niveau: 0 } as Etage],
      zones: [zone, { ...zone, id: "z1", entrepriseId: TENANT_B } as Zone],
      pieces: [piece, { ...piece, id: "p1", etageId: "e1" } as Piece, { ...piece, id: "p2", releveId: "autre" } as unknown as Piece, piece],
    }));
    expect(issues.map((issue) => `${issue.code}:${issue.id}`).sort()).toEqual([
      "cross_etage:p1", "duplicate_id:p0", "duplicate_niveau:e3", "orphan:e2", "releve_mismatch:p2", "tenant_mismatch:z1",
    ]);
  });

  it("un étage « projet » au même niveau n'est pas un doublon (plan rénové)", () => {
    expect(checkStructureIntegrity(structure({ etages: [rdc, r1, { ...rdc, id: "e9", etat: "projet" } as Etage] }))).toEqual([]);
  });
});

describe("descendants et ordre", () => {
  it("bâtiment → étages, zones, pièces ; zone et pièce → rien", () => {
    expect(descendantsOf(structure(), { kind: "batiment", id: "b1" })).toEqual({ etages: ["e0", "e1"], zones: ["z0"], pieces: ["p0"] });
    expect(descendantsOf(structure(), { kind: "etage", id: "e0" })).toEqual({ etages: [], zones: ["z0"], pieces: ["p0"] });
    expect(descendantsOf(structure(), { kind: "zone", id: "z0" })).toEqual({ etages: [], zones: [], pieces: [] });
  });

  it("nextOrdre ignore les éléments supprimés", () => {
    expect(nextOrdre([])).toBe(0);
    expect(nextOrdre([{ ordre: 0, deletedAt: null }, { ordre: 7, deletedAt: "2026-09-26T10:00:00Z" }])).toBe(1);
  });

  it("libellés de niveau", () => {
    expect([niveauLabel(-2), niveauLabel(0), niveauLabel(3)]).toEqual(["R-2", "RDC", "R+3"]);
  });
});
