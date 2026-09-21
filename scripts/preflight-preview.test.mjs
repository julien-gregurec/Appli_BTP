import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PREFLIGHT_PREVIEW_SKIP_MAIN = "1";
const { missingBuckets, EXPECTED_BUCKETS, PREVIEW_TARGETS } = await import("./preflight-preview.mjs");

test("missingBuckets : aucun manquant quand tout est présent", () => {
  assert.deepEqual(missingBuckets(["a", "b"], ["a", "b", "c"]), []);
});

test("missingBuckets : signale exactement ce qui manque, dans l'ordre attendu", () => {
  assert.deepEqual(missingBuckets(["a", "b", "c"], ["b"]), ["a", "c"]);
});

test("missingBuckets : liste vide de présents = tout manque", () => {
  assert.deepEqual(missingBuckets(["a", "b"], []), ["a", "b"]);
});

test("EXPECTED_BUCKETS : pas de doublon, correspond au compte documenté (18)", () => {
  assert.equal(EXPECTED_BUCKETS.length, new Set(EXPECTED_BUCKETS).size);
  assert.equal(EXPECTED_BUCKETS.length, 18);
});

test("PREVIEW_TARGETS : une entrée par unité du manifeste dotée d'un gabarit Preview", () => {
  const apps = PREVIEW_TARGETS.map((t) => t.app).sort();
  assert.deepEqual(apps, [
    "colors", "gestion_pro", "reserves", "studio", "studio_worker", "tools",
  ].sort());
});
