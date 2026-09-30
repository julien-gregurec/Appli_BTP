import { describe, expect, it } from "vitest";
import {
  fixedFromInteger, formatLineaire, formatLongueur, formatSurface, formatVolume, parseLineaireMl, parseLongueur, parsePourcent, parseSurfaceM2, parseVolumeM3,
  roundDecimal, toExchange, toExchangeText,
} from "./units";

describe("Lot 8 — unités exactes", () => {
  it("arrondi décimal comme PostgreSQL (moitié loin de zéro), sans erreur de flottant", () => {
    expect(roundDecimal(1.005, 2)).toBe(1.01);
    expect(roundDecimal(2.5)).toBe(3);
    expect(roundDecimal(-2.5)).toBe(-3);
    expect(roundDecimal(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundDecimal(12345.65, 1)).toBe(12345.7);
  });

  it("conversions d'affichage par arithmétique entière", () => {
    expect(fixedFromInteger(10_645_000, 1_000_000, 2)).toBe("10.65");
    expect(fixedFromInteger(10_644_999, 1_000_000, 2)).toBe("10.64");
    expect(formatSurface(10_640_000)).toBe("10,64 m²");
    expect(formatSurface(1_234_567_890_000)).toBe("1 234 567,89 m²");
    expect(formatVolume(26_600_000_000)).toBe("26,60 m³");
    expect(formatLineaire(12_300)).toBe("12,30 ml");
    expect(formatLongueur(4205, "m")).toBe("4,21 m");
    expect(formatLongueur(4205, "cm")).toBe("420,5 cm");
    expect(formatLongueur(4205.4, "mm")).toBe("4 205 mm");
    expect(formatSurface(null)).toBe("—");
    // 0,1 + 0,2 m² affichés 0,30 m² (et non 0,30000000000000004).
    expect(formatSurface(100_000 + 200_000)).toBe("0,30 m²");
  });

  it("unités d'échange (GP, CSV) : 3 décimales exactes", () => {
    expect(toExchange(10_640_000, "surface")).toBe(10.64);
    expect(toExchange(12_300, "longueur")).toBe(12.3);
    expect(toExchange(26_600_000_000, "volume")).toBe(26.6);
    expect(toExchange(1_000_500, "surface")).toBe(1.001);
    expect(toExchangeText(1_234_567, "surface", 2)).toBe("1,23");
    expect(toExchangeText(null, "surface")).toBe("");
  });

  it("saisie : mm, cm, m, m², m³, ml, % → valeurs internes", () => {
    expect(parseLongueur("4,205", "m")).toEqual({ ok: true, value: 4205 });
    expect(parseLongueur("420,5", "cm")).toEqual({ ok: true, value: 4205 });
    expect(parseLongueur("4205", "mm")).toEqual({ ok: true, value: 4205 });
    expect(parseLongueur("", "m")).toEqual({ ok: true, value: null });
    expect(parseLongueur("abc", "m").ok).toBe(false);
    expect(parseLongueur("0", "m").ok).toBe(false);
    expect(parseSurfaceM2("10,5")).toEqual({ ok: true, value: 10_500_000 });
    expect(parseVolumeM3("26,6")).toEqual({ ok: true, value: 26_600_000_000 });
    expect(parseLineaireMl("12,30")).toEqual({ ok: true, value: 12_300 });
    expect(parsePourcent("12,5")).toEqual({ ok: true, value: 12.5 });
    expect(parsePourcent("101").ok).toBe(false);
    expect(parsePourcent("1,234").ok).toBe(false);
  });
});
