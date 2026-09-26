import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — garde statique.
// Depuis 20260902000255_acl_reconciliation_v1, le client service_role (createAdminClient) n'a de
// privilège de table que sur une courte liste ; toute autre lecture/écriture directe échoue en 42501
// et supabase-js renvoie data = null, que la plupart des appelants prennent pour « rien trouvé ».
// Cette garde refuse tout `<client admin>.from("<table>")` hors de cette liste : un nouveau besoin
// passe par une RPC `*_service` ou un grant par colonne, prouvés en pgTAP.
const TABLES_OUVERTES_A_SERVICE_ROLE = new Set([
  // Laissées par la 255.
  "entreprises", // SELECT + UPDATE sur colonnes choisies
  "signatures_documents",
  "entitlements_utilisateurs_elsatia",
  "historique_entitlements_elsatia",
  "tools_monetization_customers",
  "tools_monetization_events",
  "tools_monetization_subscriptions",
  // Grants par colonne de ELSATIA-SERVICE-ROLE-FLUX-ACL-V1.
  "stripe_webhook_events", // INSERT (id, event_type, livemode, facture_id)
  "journal_audit_paie", // INSERT seulement
  "journal_activite", // INSERT seulement
  "periodes_paie", // SELECT (id, entreprise_id, statut), UPDATE (date_export, updated_at)
  "lots_virements", // SELECT (id, entreprise_id, provider_payment_id)
]);

const RACINE = join(process.cwd(), "src");

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersSource(chemin);
    return /\.(ts|tsx)$/.test(entree.name) && !/\.test\.(ts|tsx)$/.test(entree.name) ? [chemin] : [];
  });
}

// Pré-filtre par `git grep` (natif, parallèle) : seuls les fichiers qui mentionnent un client admin
// sont relus. Relire tout `src/` dépassait 5 s sous la charge d'une suite complète. Repli sur le
// parcours complet hors dépôt Git ; `--untracked` couvre aussi les fichiers pas encore suivis.
function fichiersCandidats(): string[] {
  try {
    const sortie = execFileSync("git", ["grep", "-l", "-i", "--untracked", "-e", "admin", "--", "src/*.ts", "src/*.tsx"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return sortie.split("\n").filter((f) => f && !/\.test\.(ts|tsx)$/.test(f)).map((f) => join(process.cwd(), f));
  } catch {
    return fichiersSource(RACINE);
  }
}

// `admin.from("x")`, `supabaseAdmin\n  .from("x")`, `deps.admin.from("x")`, `createAdminClient().from("x")`.
const APPEL_ADMIN_FROM = /(?:\b\w*[aA]dmin\b|createAdminClient\(\))\s*\.from\(\s*["'`]([a-z0-9_]+)["'`]/g;

describe("client service_role : aucune table fermée par la 255", () => {
  it("n'appelle .from() que sur les tables où service_role a un privilège", () => {
    const violations: string[] = [];
    for (const fichier of fichiersCandidats()) {
      const source = readFileSync(fichier, "utf8");
      if (!/createAdminClient|admin/i.test(source)) continue;
      for (const [, table] of source.matchAll(APPEL_ADMIN_FROM)) {
        if (!TABLES_OUVERTES_A_SERVICE_ROLE.has(table)) violations.push(`${relative(process.cwd(), fichier)} → ${table}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("détecte bien un appel multiligne sur une table fermée (contrôle de la garde elle-même)", () => {
    const exemple = 'const { data } = await admin\n    .from("employes")\n    .select("id");';
    expect([...exemple.matchAll(APPEL_ADMIN_FROM)].map(([, table]) => table)).toEqual(["employes"]);
  });
});
