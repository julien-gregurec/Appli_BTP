import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function lire(chemin: string) {
  return readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
}

describe("R7.5 — frontière d’écriture support", () => {
  it("route les deux actions entreprise vers la RPC canonique", () => {
    for (const chemin of ["app/actions/support.ts", "app/actions/assistant.ts"]) {
      const source = lire(chemin);
      expect(source).toContain('rpc("support_envoyer_message_entreprise"');
      expect(source).not.toMatch(/\.from\(["']support_messages["']\)\.insert/);
    }
  });

  it("ne transmet à PostgreSQL que l’entreprise et le contenu", () => {
    const source = lire("app/actions/support.ts");
    const appel = source.slice(
      source.indexOf('rpc("support_envoyer_message_entreprise"'),
      source.indexOf('rpc("support_envoyer_message_entreprise"') + 240,
    );
    expect(appel).toContain("p_entreprise_id");
    expect(appel).toContain("p_contenu");
    expect(appel).not.toMatch(/auteur|created_at|cote|lu_par_/);
  });

  it("révoque l’INSERT et dérive les champs serveur dans la migration append-only", () => {
    const migration = lire("../supabase/migrations/20260901000253_support_message_author_guard_r75.sql");
    expect(migration).toContain("revoke insert on table public.support_messages");
    expect(migration).toContain("v_uid uuid := auth.uid()");
    expect(migration).toContain("'entreprise'");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toMatch(/false,\s*false,\s*clock_timestamp\(\)/);
  });

  it("désactive explicitement les écritures admin du mode démonstration", () => {
    const plateforme = lire("app/actions/plateforme.ts");
    expect(plateforme).toContain("La gestion des administrateurs plateforme est désactivée en mode démonstration");
    expect(plateforme).not.toMatch(/\.from\(["']plateforme_admins["']\)\.(?:upsert|delete)/);
  });
});
