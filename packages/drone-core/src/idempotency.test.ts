import { describe, expect, it } from "vitest";

import { asDroneProjectId, asMediaAssetId } from "./ids";
import {
  buildIdempotencyPayload,
  canonicalInputSet,
  computeIdempotencyKey,
  JeuMediasVideError,
} from "./idempotency";
import type { IdempotencyInput } from "./idempotency";

const PROJET = asDroneProjectId("40000010-0000-4000-8000-000000000001");
const MEDIA_A = asMediaAssetId("40000011-0000-4000-8000-000000000001");
const MEDIA_B = asMediaAssetId("40000011-0000-4000-8000-000000000002");

const BASE: IdempotencyInput = {
  project_id: PROJET,
  input_set: [MEDIA_A, MEDIA_B],
  engine: "odm",
  engine_version: "3.5.6",
  parameters: { quality: "high", mesh_octree_depth: 11 },
};

describe("clé d'idempotence", () => {
  it("dédoublonne et trie le jeu de médias", () => {
    expect(canonicalInputSet([MEDIA_B, MEDIA_A, MEDIA_B])).toEqual([MEDIA_A, MEDIA_B]);
  });

  it("ignore l'ordre de soumission des médias", async () => {
    const directe = await computeIdempotencyKey(BASE);
    const inversee = await computeIdempotencyKey({ ...BASE, input_set: [MEDIA_B, MEDIA_A] });
    expect(inversee).toBe(directe);
  });

  it("ignore l'ordre des clés de paramètres", async () => {
    const autreOrdre = await computeIdempotencyKey({
      ...BASE,
      parameters: { mesh_octree_depth: 11, quality: "high" },
    });
    await expect(computeIdempotencyKey(BASE)).resolves.toBe(autreOrdre);
  });

  it("change dès qu'un seul paramètre change", async () => {
    const reference = await computeIdempotencyKey(BASE);
    await expect(
      computeIdempotencyKey({ ...BASE, parameters: { ...BASE.parameters, quality: "medium" } }),
    ).resolves.not.toBe(reference);
    await expect(computeIdempotencyKey({ ...BASE, engine_version: "3.5.7" })).resolves.not.toBe(
      reference,
    );
    await expect(computeIdempotencyKey({ ...BASE, input_set: [MEDIA_A] })).resolves.not.toBe(
      reference,
    );
  });

  it("refuse une reconstruction sans média d'entrée", () => {
    expect(() => buildIdempotencyPayload({ ...BASE, input_set: [] })).toThrow(JeuMediasVideError);
  });

  it("expose une charge utile lisible et versionnée", () => {
    const payload = buildIdempotencyPayload(BASE);
    expect(JSON.parse(payload)).toMatchObject({
      schema_version: 1,
      engine: "odm",
      engine_version: "3.5.6",
      project_id: PROJET,
    });
  });

  it("produit une empreinte hexadécimale de 64 caractères", async () => {
    await expect(computeIdempotencyKey(BASE)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
