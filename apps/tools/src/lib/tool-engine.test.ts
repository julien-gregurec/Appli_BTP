import { describe, expect, it } from "vitest";
import { freeTools } from "./catalog";
import { executeTool, toolDefaults, toolFields } from "./tool-engine";

describe("intégrité du moteur piloté par le catalogue", () => {
  it("fournit champs et valeurs initiales à chaque outil actif", () => {
    for (const tool of freeTools) {
      expect(toolFields[tool.id]!.length).toBeGreaterThan(0);
      for (const field of toolFields[tool.id]!) expect(toolDefaults[tool.id]![field.key]).toBeDefined();
    }
  });

  it("exécute tous les exemples du catalogue sans NaN ni Infinity", () => {
    for (const tool of freeTools) {
      const execution = executeTool(tool.id, toolDefaults[tool.id]!);
      expect(execution.results.length).toBeGreaterThan(0);
      expect(execution.results.some((line) => line.primary)).toBe(true);
      expect(JSON.stringify(execution)).not.toMatch(/NaN|Infinity/);
      expect(execution.note.length).toBeGreaterThan(20);
    }
  });

  it("produit des instructions chantier uniquement lorsque le catalogue les annonce", () => {
    for (const tool of freeTools) {
      const execution = executeTool(tool.id, toolDefaults[tool.id]!);
      if (tool.hasSiteMode) expect(execution.instructions.steps.length).toBeGreaterThan(0);
    }
  });
});
