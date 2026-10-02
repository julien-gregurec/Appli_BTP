import { describe, expect, it } from "vitest";
import { ColonnesCsv, celluleCsv } from "./csv";

describe("CSV d'export", () => {
  it("échappe séparateur, guillemets et retours ; objets en JSON", () => {
    expect(celluleCsv('a;b"c\nd')).toBe('"a;b""c\nd"');
    expect(celluleCsv({ x: 1 })).toBe('"{""x"":1}"');
    expect(celluleCsv(null)).toBe("");
  });
  it("neutralise l'injection de formules", () => {
    for (const v of ["=1+1", "+33", "-2", "@SUM(A1)", "\tx"]) expect(celluleCsv(v).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(celluleCsv("normal")).toBe("normal");
  });
  it("en-tête avec BOM UTF-8, colonnes stables", () => {
    const c = new ColonnesCsv({ id: 1, nom: "é" });
    expect(c.entete()).toBe("﻿id;nom\r\n");
    expect(c.ligne({ nom: "x", id: 2 })).toBe("2;x\r\n");
  });
});
