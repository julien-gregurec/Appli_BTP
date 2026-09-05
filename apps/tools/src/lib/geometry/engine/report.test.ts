import { describe, expect, it } from "vitest";
import { buildReportPointsTable } from "./report";

describe("table de report chantier", () => {
  it("calcule distance et angle depuis l'origine pour des points repérés", () => {
    const rows = buildReportPointsTable({ A: { x: 100, y: 0 }, B: { x: 0, y: 100 }, O: { x: 0, y: 0 } }, { x: 0, y: 0 });
    const a = rows.find((r) => r.id === "A")!;
    const b = rows.find((r) => r.id === "B")!;
    expect(a.distanceFromOrigin).toBe(100);
    expect(a.angleFromOriginDegrees).toBeCloseTo(0, 8);
    expect(b.distanceFromOrigin).toBe(100);
    expect(b.angleFromOriginDegrees).toBeCloseTo(90, 8);
  });
});
