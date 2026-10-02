import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// PostgREST exécute une fonction STABLE/IMMUTABLE dans une transaction en lecture seule :
// une écriture y échoue (« cannot execute UPDATE in a read-only transaction », 25006).
// Régression constatée sur l'annuaire /plateforme de la Preview hébergée (migration 20261002000813).

const RACINE = join(__dirname, "..", "..");
const DOSSIER_MIGRATIONS = join(RACINE, "supabase", "migrations");

type Definition = { fichier: string; volatilite: "stable" | "immutable" | "volatile"; corps: string };

/** Dernière définition de chaque fonction, dans l'ordre d'application du train. */
function dernieresDefinitions(): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  for (const fichier of readdirSync(DOSSIER_MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(DOSSIER_MIGRATIONS, fichier), "utf8");
    const motif = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\bas\s+(\$[a-z_]*\$)([\s\S]*?)\3/gi;
    for (const m of sql.matchAll(motif)) {
      const entete = m[2].toLowerCase();
      const volatilite = /\bimmutable\b/.test(entete) ? "immutable" : /\bstable\b/.test(entete) ? "stable" : "volatile";
      definitions.set(m[1].toLowerCase(), { fichier, volatilite, corps: m[4].replace(/--[^\n]*/g, "").toLowerCase() });
    }
  }
  return definitions;
}

const ECRITURE = /(^|[^a-z_])(update\s+[a-z_."]+\s+set|insert\s+into|delete\s+from|truncate\s|nextval\s*\(|refresh\s+materialized)/;

describe("annuaire plateforme : lecture pure (régression 25006 sur la Preview)", () => {
  const definitions = dernieresDefinitions();

  it("plateforme_annuaire_entreprises reste STABLE et n'appelle plus appliquer_suspensions_impayes()", () => {
    const annuaire = definitions.get("plateforme_annuaire_entreprises");
    expect(annuaire?.fichier).toBe("20261002000813_plateforme_annuaire_lecture_pure.sql");
    expect(annuaire?.volatilite).toBe("stable");
    expect(annuaire?.corps).not.toContain("appliquer_suspensions_impayes");
    expect(annuaire?.corps).not.toMatch(ECRITURE);
  });

  it("l'annuaire affiche le statut effectif, avec le prédicat exact de la suspension", () => {
    const annuaire = definitions.get("plateforme_annuaire_entreprises")?.corps ?? "";
    expect(annuaire).toContain("as abonnement_statut_effectif");
    expect(annuaire).toMatch(/e\.suspension_prevue_at\s*<=\s*v_maintenant/);
    expect(annuaire).toMatch(/not in \('suspendu', 'annule'\)/);
    expect(annuaire).toContain("'abonnement_statut', p.abonnement_statut_effectif");
    const suspensions = definitions.get("appliquer_suspensions_impayes")?.corps ?? "";
    expect(suspensions).toMatch(/suspension_prevue_at\s*<=\s*now\(\)/);
    expect(suspensions).toMatch(/not in \('suspendu', 'annule'\)/);
  });

  it("aucune fonction STABLE/IMMUTABLE du train n'écrit ni n'appelle l'écriture des suspensions", () => {
    const fautives = [...definitions.entries()]
      .filter(([, d]) => d.volatilite !== "volatile")
      .filter(([, d]) => ECRITURE.test(d.corps) || d.corps.includes("appliquer_suspensions_impayes"))
      .map(([nom, d]) => `${nom} (${d.fichier})`);
    expect(fautives).toEqual([]);
  });

  it("la matérialisation reste au cron, chemin d'écriture explicite par la clé de service", () => {
    const cron = readFileSync(join(RACINE, "src", "app", "api", "cron", "abonnements", "route.ts"), "utf8");
    expect(cron).toContain('admin.rpc("appliquer_suspensions_impayes")');
    expect(definitions.get("appliquer_suspensions_impayes")?.volatilite).toBe("volatile");
  });
});
