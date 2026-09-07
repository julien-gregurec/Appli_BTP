import { describe, expect, it, vi } from "vitest";

import {
  asDroneProjectId,
  asEntrepriseId,
  asMediaAssetId,
  asReconstructionJobId,
  type EngineDescriptor,
  type ReconstructionEngineAdapter,
} from "@elsatia/drone-core";

import { ecrireParametres, ErreurMoteur, PARAMETRES_PROTOTYPE_DEFAUT } from "../moteur/base";
import { creerMoteurDemo } from "../moteur/demo";
import { creerFileReconstruction, estEnLettreMorte, type DemandeTravail } from "./file-locale";

const ENTREPRISE = asEntrepriseId("11111111-1111-4111-8111-111111111111");
const PROJET = asDroneProjectId("22222222-2222-4222-8222-222222222222");
const JOB = asReconstructionJobId("33333333-3333-4333-8333-333333333333");
const AUTRE_JOB = asReconstructionJobId("55555555-5555-4555-8555-555555555555");
const MEDIAS = [1, 2, 3, 4].map((index) =>
  asMediaAssetId(`44444444-4444-4444-8444-${index.toString().padStart(12, "0")}`),
);

function demande(jobId = JOB, medias = MEDIAS): DemandeTravail {
  return {
    jobId,
    entrepriseId: ENTREPRISE,
    projetId: PROJET,
    inputSet: medias,
    inputUrls: medias.map((media) => `https://stockage.test/${media}.jpg?sig=x`),
    parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
  };
}

/** Moteur qui échoue toujours, avec un caractère réessayable paramétrable. */
function moteurEnPanne(retryable: boolean): ReconstructionEngineAdapter {
  return {
    describe(): EngineDescriptor {
      return {
        engine: "odm",
        version: "0",
        supports_gpu: false,
        supported_parameters: [],
      };
    },
    async submit() {
      throw new ErreurMoteur("engine_failure", "instance injoignable", {
        retryable,
        engineMessage: "connect ECONNREFUSED",
      });
    },
    async poll() {
      throw new Error("jamais appelé");
    },
    async cancel() {},
    async fetchOutcome() {
      throw new Error("jamais appelé");
    },
  };
}

async function menerAuBout(moteur: ReturnType<typeof creerMoteurDemo>, jobId: string) {
  const file = creerFileReconstruction({ moteur });
  await file.soumettre(demande(asReconstructionJobId(jobId)));
  const travail = await file.demarrerProchain();
  moteur.deroulerJusquAuBout(travail?.handle?.engine_job_id ?? "");
  return { file, travail: await file.rafraichir(jobId) };
}

describe("file de reconstruction — idempotence", () => {
  it("retourne le travail existant pour une clé déjà connue", async () => {
    const moteur = creerMoteurDemo();
    const submit = vi.spyOn(moteur, "submit");
    const file = creerFileReconstruction({ moteur });

    const premier = await file.soumettre(demande());
    // Même projet, mêmes médias dans un autre ordre, mêmes paramètres : même travail.
    const second = await file.soumettre(demande(AUTRE_JOB, [...MEDIAS].reverse()));

    expect(second.jobId).toBe(premier.jobId);
    expect(file.lister()).toHaveLength(1);

    await file.demarrerProchain();
    await file.demarrerProchain();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("crée un travail distinct dès qu'un paramètre change la clé", async () => {
    const file = creerFileReconstruction({ moteur: creerMoteurDemo() });
    await file.soumettre(demande());
    await file.soumettre({
      ...demande(AUTRE_JOB),
      parameters: ecrireParametres({ ...PARAMETRES_PROTOTYPE_DEFAUT, mesh_quality: "high" }),
    });

    expect(file.lister()).toHaveLength(2);
    expect(new Set(file.lister().map((travail) => travail.idempotencyKey)).size).toBe(2);
  });
});

describe("file de reconstruction — cycle nominal", () => {
  it("conduit un travail de queued à completed avec son résultat", async () => {
    const moteur = creerMoteurDemo();
    const file = creerFileReconstruction({ moteur });

    await file.soumettre(demande());
    const demarre = await file.demarrerProchain();
    expect(demarre?.statut).toBe("processing");
    expect(demarre?.attempts).toBe(1);

    let travail = file.lire(JOB);
    for (let index = 0; index < 10 && travail.statut === "processing"; index += 1) {
      moteur.avancer(travail.handle?.engine_job_id ?? "");
      travail = await file.rafraichir(JOB);
    }

    expect(travail.statut).toBe("completed");
    expect(travail.percent).toBe(100);
    expect(travail.outcome?.artifacts.orthophoto).not.toBeNull();
    expect(travail.dureeS).toBe(600);
    expect(travail.termineLe).not.toBeNull();
  });

  it("ne fait rien de plus une fois le travail terminé", async () => {
    const moteur = creerMoteurDemo();
    const { file } = await menerAuBout(moteur, JOB);

    const apres = await file.rafraichir(JOB);
    expect(apres.statut).toBe("completed");
    expect(await file.demarrerProchain()).toBeNull();
  });
});

describe("file de reconstruction — échecs et reprises", () => {
  it("replace en file un échec réessayable, puis met en lettre morte", async () => {
    const file = creerFileReconstruction({ moteur: moteurEnPanne(true), maxAttempts: 3 });
    await file.soumettre(demande());

    await file.demarrerProchain();
    expect(file.lire(JOB).statut).toBe("queued");
    expect(file.lire(JOB).attempts).toBe(1);

    await file.demarrerProchain();
    await file.demarrerProchain();

    const travail = file.lire(JOB);
    expect(travail.attempts).toBe(3);
    expect(travail.statut).toBe("failed");
    expect(estEnLettreMorte(travail)).toBe(true);
    expect(travail.echec?.engineMessage).toBe("connect ECONNREFUSED");
    expect(travail.echec?.category).toBe("engine_failure");
    await expect(file.reessayer(JOB)).rejects.toMatchObject({ code: "transition_invalide" });
  });

  it("ne réessaie jamais un échec non réessayable", async () => {
    const file = creerFileReconstruction({ moteur: moteurEnPanne(false), maxAttempts: 3 });
    await file.soumettre(demande());
    await file.demarrerProchain();

    const travail = file.lire(JOB);
    expect(travail.statut).toBe("failed");
    expect(travail.attempts).toBe(1);
    expect(await file.demarrerProchain()).toBeNull();
  });

  it("conserve le contexte d'échec remonté par le moteur", async () => {
    const moteur = creerMoteurDemo({ echouerAEtape: 1, messageEchec: "GPU out of memory" });
    const file = creerFileReconstruction({ moteur, maxAttempts: 1 });
    await file.soumettre(demande());
    const travail = await file.demarrerProchain();
    moteur.deroulerJusquAuBout(travail?.handle?.engine_job_id ?? "");

    const apres = await file.rafraichir(JOB);
    expect(apres.statut).toBe("failed");
    expect(apres.echec?.category).toBe("engine_failure");
    expect(apres.echec?.engineMessage).toBe("GPU out of memory");
    expect(apres.echec?.partialArtifacts.point_cloud).not.toBeNull();
    expect(apres.logs.some((ligne) => ligne.niveau === "erreur")).toBe(true);
  });

  it("relance manuellement un travail encore dans son quota", async () => {
    const file = creerFileReconstruction({ moteur: moteurEnPanne(false), maxAttempts: 3 });
    await file.soumettre(demande());
    await file.demarrerProchain();

    const relance = await file.reessayer(JOB);
    expect(relance.statut).toBe("queued");
    expect(relance.handle).toBeNull();
  });
});

describe("file de reconstruction — annulation", () => {
  it("annule côté moteur puis côté ELSATIA", async () => {
    const moteur = creerMoteurDemo();
    const cancel = vi.spyOn(moteur, "cancel");
    const file = creerFileReconstruction({ moteur });
    await file.soumettre(demande());
    await file.demarrerProchain();

    const annule = await file.annuler(JOB);
    expect(annule.statut).toBe("cancelled");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("annule quand même si le moteur refuse, et le trace", async () => {
    const moteur = creerMoteurDemo();
    vi.spyOn(moteur, "cancel").mockRejectedValue(new Error("tâche déjà purgée"));
    const file = creerFileReconstruction({ moteur });
    await file.soumettre(demande());
    await file.demarrerProchain();

    const annule = await file.annuler(JOB);
    expect(annule.statut).toBe("cancelled");
    expect(annule.logs.some((ligne) => ligne.message.includes("déjà purgée"))).toBe(true);
  });

  it("refuse d'annuler un travail terminé et de lire un travail inconnu", async () => {
    const moteur = creerMoteurDemo();
    const { file } = await menerAuBout(moteur, JOB);

    await expect(file.annuler(JOB)).rejects.toMatchObject({ code: "transition_invalide" });
    expect(() => file.lire("inconnu")).toThrowError(/Travail inconnu/);
  });
});
