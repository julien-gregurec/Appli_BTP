import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { checkMigrationTargets } from "./verify-migration-targets.mjs";

const REPO = resolve(import.meta.dirname, "..");

// Copie minimale du dépôt (migrations + config des deux projets) pour muter sans risque.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "migration-targets-"));
  cpSync(join(REPO, "supabase/migrations"), join(dir, "supabase/migrations"), { recursive: true });
  cpSync(join(REPO, "supabase/config.toml"), join(dir, "supabase/config.toml"));
  cpSync(join(REPO, "apps/studio/supabase"), join(dir, "apps/studio/supabase"), { recursive: true });
  return dir;
}
const codes = (dir) => checkMigrationTargets(dir).errors.map((e) => e.slice(0, 2));

test("dépôt réel : cibles conformes", () => {
  assert.deepEqual(checkMigrationTargets(REPO).errors, []);
});

test("T4 : une migration dédiée Studio copiée dans le train partagé est refusée", () => {
  const dir = fixture();
  try {
    cpSync(
      join(dir, "apps/studio/supabase/migrations/20260926120000_studio_identity_foundation.sql"),
      join(dir, "supabase/migrations/20260926120000_studio_identity_foundation.sql"),
    );
    const found = codes(dir);
    assert.ok(found.includes("T4"));
    assert.ok(found.includes("T3"));
    assert.ok(found.includes("T5"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T3 : nouvelle migration Studio à la racine refusée", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "supabase/migrations/20261001000000_studio_brand_kit.sql"), "select 1;\n");
    assert.deepEqual(codes(dir), ["T3"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T2 : modification d'une migration Studio gelée à la racine refusée", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "supabase/migrations/20260912230000_studio_timeline.sql"), "-- modifiée\n", { flag: "a" });
    assert.deepEqual(codes(dir), ["T2"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T1 : migration Studio non classée, ou classée mais absente", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "apps/studio/supabase/migrations/20261001000000_studio_x.sql"), "select 1;\n");
    unlinkSync(join(dir, "apps/studio/supabase/migrations/20260927110000_studio_dedicated_admission.sql"));
    const errors = checkMigrationTargets(dir).errors;
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.startsWith("T1")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T6 : objet du projet partagé dans une migration Studio refusé", () => {
  const dir = fixture();
  try {
    writeFileSync(
      join(dir, "apps/studio/supabase/migrations/20260927110000_studio_dedicated_admission.sql"),
      "select public.elsatia_identity_prepare_handoff(null, 'studio', null);\n",
      { flag: "a" },
    );
    assert.deepEqual(codes(dir), ["T6"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T7 : même project_id pour les deux projets refusé", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "apps/studio/supabase/config.toml"), 'project_id = "btp-platform"\n');
    assert.deepEqual(codes(dir), ["T7"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
