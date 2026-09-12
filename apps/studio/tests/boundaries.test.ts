import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(resolve(path, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [resolve(path, entry.name)]
        : [],
  );
}
it("garde domaine et services indépendants de Gestion Pro", () => {
  const files = [
    ...sources(resolve("src")),
    ...sources(resolve("../../packages/studio-domain/src")),
  ];
  for (const file of files) {
    const code = readFileSync(file, "utf8");
    expect(code, file).not.toMatch(
      /from\s+["'][^"']*(?:lib\/entreprise|apps\/colors|apps\/tools|src\/lib\/supabase)/,
    );
    expect(code, file).not.toMatch(
      /SUPABASE_SERVICE_ROLE|service_role_key|\.from\(["'](?:entreprises|chantiers|employes|utilisateurs_entreprises)["']/,
    );
  }
});
it("ne crée aucune FK métier BTP", () => {
  const sql = readFileSync(
    resolve(
      "../../supabase/migrations/20260912120000_studio_workspace_foundation.sql",
    ),
    "utf8",
  );
  expect(sql).not.toMatch(
    /references\s+public\.(?:entreprises|chantiers|employes|utilisateurs)/i,
  );
  expect(sql).toContain("deferrable initially deferred");
});
