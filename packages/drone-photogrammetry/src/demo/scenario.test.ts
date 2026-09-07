import { describe, expect, it } from "vitest";

import { ENTREPRISE_DEMO, executerScenarioDemo, PROJET_DEMO } from "./scenario";

describe("démonstration sans GPU (§23)", () => {
  it("déroule ingestion, contrôle qualité, file et artefacts référencés", async () => {
    const rapport = await executerScenarioDemo();

    expect(rapport.medias).toHaveLength(12);
    // Toutes les références sont générées par ELSATIA, aucune ne porte un nom client.
    expect(
      rapport.medias.every(
        (media) =>
          media.ref.bucket === "drone-medias" &&
          media.ref.path.startsWith(`${ENTREPRISE_DEMO}/${PROJET_DEMO}/`),
      ),
    ).toBe(true);
    expect(rapport.medias.every((media) => /^[0-9a-f]{64}$/.test(media.sha256))).toBe(true);

    expect(rapport.qualite.resume.total).toBe(12);
    expect(rapport.qualite.resume.rejetes).toBe(1); // le doublon injecté
    expect(rapport.qualite.medias.some((media) => media.anomalies.includes("exif_absent"))).toBe(
      true,
    );

    expect(rapport.travail.statut).toBe("completed");
    expect(rapport.travail.inputSet).toHaveLength(11);
    expect(rapport.manquesArtefacts).toEqual([]);
    expect(rapport.artefacts?.orthophoto).not.toBeNull();
    expect(rapport.artefacts?.point_cloud).not.toBeNull();
  });

  it("ne chiffre aucun coût tant qu'aucun tarif n'est relevé", async () => {
    const rapport = await executerScenarioDemo();

    expect(rapport.cout).toBeNull();
    expect(rapport.avertissements.join(" ")).toContain("aucun tarif relevé");
    expect(rapport.avertissements.join(" ")).toContain("benchmarks non exécutés");
  });

  it("chiffre le coût si — et seulement si — l'appelant fournit des tarifs", async () => {
    const rapport = await executerScenarioDemo({
      tarifs: {
        fournisseur: "fournisseur-test",
        region: "UE",
        releveLe: "2026-09-07",
        source: "valeurs de test",
        gpuCentimesParHeure: 120,
        stockageCentimesParGoMois: 2,
        egressCentimesParGo: 1,
      },
    });

    expect(rapport.cout?.totalCentimes).toBeGreaterThan(0);
    expect(rapport.cout?.detail.join(" ")).toContain("2026-09-07");
  });

  it("propage un échec moteur jusqu'au travail, avec son contexte", async () => {
    const rapport = await executerScenarioDemo({
      moteur: { echouerAEtape: 2, messageEchec: "Dense matching failed" },
    });

    expect(rapport.travail.statut).toBe("failed");
    expect(rapport.travail.echec?.engineMessage).toBe("Dense matching failed");
    expect(rapport.travail.echec?.partialArtifacts.point_cloud).not.toBeNull();
    // Trois tentatives consommées, puis lettre morte : la boucle ne tourne pas sans fin.
    expect(rapport.travail.attempts).toBe(3);
    expect(rapport.cout).toBeNull();
  });

  it("est déterministe : deux exécutions donnent la même clé d'idempotence", async () => {
    const premier = await executerScenarioDemo();
    const second = await executerScenarioDemo();

    expect(second.travail.idempotencyKey).toBe(premier.travail.idempotencyKey);
    expect(premier.travail.idempotencyKey).toHaveLength(64);
  });
});
