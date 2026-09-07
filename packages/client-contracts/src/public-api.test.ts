import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as publicApi from "./index";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

function sourceFiles(): readonly string[] {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
}

/**
 * Retire commentaires et littéraux de chaîne, pour que les analyses lexicales qui suivent ne
 * se déclenchent ni sur de la prose ni sur un message d'erreur.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

describe("hygiène de l'API publique", () => {
  it("n'utilise le type any nulle part dans le paquet", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const code = stripCommentsAndStrings(readFileSync(join(SOURCE_DIR, file), "utf8"));
      code.split("\n").forEach((line, index) => {
        if (/(^|[^A-Za-z0-9_$])any([^A-Za-z0-9_$]|$)/.test(line)) {
          offenders.push(`${file}:${index + 1} → ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("n'importe aucune dépendance applicative", () => {
    // Le paquet doit rester consommable par n'importe quelle application : ni React, ni
    // Supabase, ni Next, ni rien de propre à Gestion Pro.
    const forbidden = ["react", "next", "@supabase", "server-only", "@/", "@elsatia/"];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const code = readFileSync(join(SOURCE_DIR, file), "utf8");
      for (const match of code.matchAll(/from\s+"([^"]+)"/g)) {
        const specifier = match[1] ?? "";
        if (specifier.startsWith(".")) continue;
        if (file === "fixtures.ts" && specifier.startsWith("node:")) continue;
        if (forbidden.some((entry) => specifier.startsWith(entry))) {
          offenders.push(`${file} → ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("n'a aucune dépendance de production déclarée", () => {
    const manifest = JSON.parse(readFileSync(join(SOURCE_DIR, "..", "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("n'expose ni les fixtures de test ni l'accumulateur interne d'anomalies", () => {
    const exported = Object.keys(publicApi);
    expect(exported).not.toContain("IssueCollector");
    expect(exported.filter((name) => name.startsWith("make"))).toEqual([]);
    expect(exported).not.toContain("TENANT_A");
  });

  it("expose les cinq notions du contrat et leurs validateurs", () => {
    for (const name of [
      "validateClientIdentity",
      "validateClientDetails",
      "validateClientAddress",
      "validateClientContact",
      "validateClientReference",
      "validateDocumentRecipientSnapshot",
      "validateClientSearchQuery",
      "validateClientSearchResult",
      "validateClientSyncEnvelope",
      "captureDocumentRecipient",
      "assertClientTenant",
    ]) {
      expect(publicApi).toHaveProperty(name);
    }
  });

  it("annonce sa version de paquet et ses versions de schéma", () => {
    expect(publicApi.CLIENT_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    for (const version of Object.values(publicApi.CLIENT_SCHEMA_VERSIONS)) {
      expect(publicApi.parseSchemaVersion(version)).not.toBeNull();
    }
  });
});
