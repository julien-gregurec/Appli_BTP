// CHAÎNE DÉDIÉE — la base servie à l'application est bien le projet Studio dédié : toutes les
// migrations apps/studio/supabase/migrations, dans l'ordre, aucune migration ni table GP, toute RPC
// exposée classée. Même contrôle que stack.sh (verify-dedicated-chain.mjs), rejoué dans la suite.
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { env, studioSql } from "./harness";

test("migrations : nombre, ordre, aucune GP ; tables : Studio seules ; RPC : toutes classées", () => {
  const out = execFileSync(process.execPath, [join(import.meta.dirname, "../verify-dedicated-chain.mjs"), "--db", env("STUDIO_DB_URL"), "--json"], {
    encoding: "utf8",
  });
  const report = JSON.parse(out) as { ok: boolean; errors: string[]; facts: Record<string, number> };
  expect(report.errors).toEqual([]);
  const files = readdirSync(join(import.meta.dirname, "../../supabase/migrations")).filter((n) => n.endsWith(".sql"));
  expect(report.facts.migrations_applied).toBe(files.length);
  expect(files.length).toBe(21);
  expect(report.facts.anon_executable).toBe(0);
  // Aucune trace du train partagé : ni table GP, ni identité centrale, ni registre du train partagé.
  expect(studioSql("select count(*) from pg_tables where tablename in ('entreprises','utilisateurs_entreprises','chantiers','elsatia_identity_outbox')")).toBe("0");
  expect(studioSql("select count(*) from supabase_migrations.schema_migrations where name not like 'studio\\_%'")).toBe("0");
  // Storage réel (supabase/storage) : ses propres migrations, puis la garde Studio posée dessus.
  expect(Number(studioSql("select count(*) from storage.migrations"))).toBeGreaterThan(10);
  expect(studioSql("select string_agg(id, ',' order by id) from storage.buckets")).toBe("studio-originals,studio-renders");
});
