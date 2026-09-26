import { describe, expect, it } from "vitest";
import { formatDegrees, formatMillimetres } from "./format";

describe("format — mise en forme des grandeurs chantier", () => {
  it("millimètres : une décimale, unité explicite", () => {
    expect(formatMillimetres(105)).toBe("105.0 mm");
    expect(formatMillimetres(299.96)).toBe("300.0 mm");
    expect(formatMillimetres(0)).toBe("0.0 mm");
  });

  it("degrés : deux décimales, symbole explicite", () => {
    expect(formatDegrees(72)).toBe("72.00°");
    expect(formatDegrees(360 / 7)).toBe("51.43°");
  });
});
