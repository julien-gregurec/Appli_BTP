import { describe, expect, it } from "vitest";

import { facade, maisonComplexe, toitureSimple } from "../fixtures";
import { validateMeasurement, validateMediaAsset, validateReconstructionJob } from "./entities";

function cheminsEnErreur(resultat: ReturnType<typeof validateMediaAsset>): readonly string[] {
  return resultat.ok ? [] : resultat.issues.map((anomalie) => anomalie.path);
}

describe("validation des médias", () => {
  it("accepte les médias des trois jeux d'essai", () => {
    for (const fixture of [toitureSimple, maisonComplexe, facade]) {
      for (const media of fixture.media) {
        expect(validateMediaAsset(media).ok).toBe(true);
      }
    }
  });

  it("refuse un chemin de stockage qui ne commence pas par l'entreprise", () => {
    const media = {
      ...toitureSimple.media[0],
      storage_ref: { bucket: "drone-medias", path: "public/photo.jpg" },
    };
    expect(cheminsEnErreur(validateMediaAsset(media))).toContain("$.storage_ref.path");
  });

  it("impose la source dégradée pour une frame extraite d'une vidéo (§77)", () => {
    const media = { ...facade.media[0], degraded_source: false };
    expect(cheminsEnErreur(validateMediaAsset(media))).toContain("$.degraded_source");
  });

  it("refuse une empreinte qui n'est pas un SHA-256", () => {
    const media = { ...toitureSimple.media[0], sha256: "abc" };
    expect(cheminsEnErreur(validateMediaAsset(media))).toContain("$.sha256");
  });

  it("accumule les anomalies au lieu de s'arrêter à la première", () => {
    const resultat = validateMediaAsset({ id: "pas-un-uuid", size_bytes: -1 });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.length).toBeGreaterThan(3);
  });

  it("refuse une entrée qui n'est pas un objet", () => {
    expect(validateMediaAsset(null).ok).toBe(false);
    expect(validateMediaAsset([]).ok).toBe(false);
  });
});

describe("validation des mesures", () => {
  it("accepte les mesures des jeux d'essai", () => {
    for (const fixture of [toitureSimple, maisonComplexe, facade]) {
      for (const mesure of fixture.measurements) {
        expect(validateMeasurement(mesure).ok).toBe(true);
      }
    }
  });

  it("refuse une unité incompatible avec la grandeur", () => {
    const mesure = { ...toitureSimple.measurements[0], unit: "m" };
    const resultat = validateMeasurement(mesure);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((a) => a.path)).toContain("$.unit");
  });

  it("refuse une demi-incertitude (§25)", () => {
    const mesure = {
      ...toitureSimple.measurements[0],
      quality: { ...toitureSimple.measurements[0].quality, uncertainty_value: 0.03 },
    };
    const resultat = validateMeasurement(mesure);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.issues.map((a) => a.path)).toContain("$.quality.uncertainty_value");
    }
  });

  it("exige la présence explicite de la version de reconstruction", () => {
    const sansVersion: Record<string, unknown> = { ...toitureSimple.measurements[0] };
    delete sansVersion.reconstruction_version;
    const resultat = validateMeasurement(sansVersion);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.issues.map((a) => a.path)).toContain("$.reconstruction_version");
    }
  });
});

describe("validation des travaux de reconstruction", () => {
  it("accepte les travaux des jeux d'essai", () => {
    for (const fixture of [toitureSimple, maisonComplexe, facade]) {
      expect(validateReconstructionJob(fixture.job).ok).toBe(true);
    }
  });

  it("refuse un jeu d'entrée vide ou dupliqué", () => {
    const vide = validateReconstructionJob({ ...toitureSimple.job, input_set: [] });
    expect(vide.ok).toBe(false);

    const media = toitureSimple.job.input_set[0];
    const doublon = validateReconstructionJob({
      ...toitureSimple.job,
      input_set: [media, media],
    });
    expect(doublon.ok).toBe(false);
    if (!doublon.ok) expect(doublon.issues.map((a) => a.path)).toContain("$.input_set");
  });

  it("signale un travail qui aurait dû partir en dead-letter (§94)", () => {
    const resultat = validateReconstructionJob({
      ...toitureSimple.job,
      attempts: 4,
      max_attempts: 3,
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.issues.map((a) => a.path)).toContain("$.attempts");
  });
});
