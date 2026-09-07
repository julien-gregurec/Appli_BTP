import { describe, expect, it } from "vitest";

import { DRONE_PROJECT_STATUSES, peutTransitionnerProjet } from "./project";
import {
  estStatutTerminal,
  peutTransitionnerReconstruction,
  RECONSTRUCTION_STATUSES,
} from "./reconstruction";

describe("cycle de vie du projet", () => {
  it("autorise l'import direct sans passer par une mission (§61)", () => {
    expect(peutTransitionnerProjet("draft", "media_imported")).toBe(true);
  });

  it("ne saute jamais la validation humaine avant le rapport (§22)", () => {
    expect(peutTransitionnerProjet("reconstruction", "validated")).toBe(false);
    expect(peutTransitionnerProjet("to_validate", "validated")).toBe(true);
    expect(peutTransitionnerProjet("validated", "report_generated")).toBe(true);
  });

  it("permet la reprise après un échec de reconstruction", () => {
    expect(peutTransitionnerProjet("reconstruction", "media_imported")).toBe(true);
  });

  it("fait de l'archive un état terminal", () => {
    for (const statut of DRONE_PROJECT_STATUSES) {
      expect(peutTransitionnerProjet("archived", statut)).toBe(false);
    }
  });
});

describe("cycle de vie d'un travail de reconstruction", () => {
  it("suit le chemin nominal jusqu'au contrôle qualité", () => {
    expect(peutTransitionnerReconstruction("queued", "uploading")).toBe(true);
    expect(peutTransitionnerReconstruction("uploading", "processing")).toBe(true);
    expect(peutTransitionnerReconstruction("processing", "quality_check")).toBe(true);
    expect(peutTransitionnerReconstruction("quality_check", "completed")).toBe(true);
  });

  it("autorise la reprise après échec, et rien d'autre", () => {
    expect(peutTransitionnerReconstruction("failed", "queued")).toBe(true);
    expect(peutTransitionnerReconstruction("failed", "completed")).toBe(false);
  });

  it("n'écrase jamais un résultat acquis", () => {
    expect(estStatutTerminal("completed")).toBe(true);
    expect(estStatutTerminal("cancelled")).toBe(true);
    for (const statut of RECONSTRUCTION_STATUSES) {
      expect(peutTransitionnerReconstruction("completed", statut)).toBe(false);
    }
  });
});
