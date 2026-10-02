import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — B2 : garde statique sur le train de
// migrations. `modifier_facture_brouillon` est SECURITY INVOKER (appelée sous
// `authenticated` par modifierFactureAction) ; `authenticated` n'a plus EXECUTE
// sur recalc_totaux_facture depuis 20260902000255. La dernière définition de
// la RPC ne doit donc jamais l'appeler directement, et aucune migration
// ultérieure ne doit rouvrir ce droit. La preuve d'exécution réelle (RLS,
// facture émise/payée/annulée, autre entreprise) est dans
// supabase/tests/gp_facture_brouillon_modification_v1.test.sql.

const dossier = resolve(process.cwd(), "supabase/migrations");
const migrations = readdirSync(dossier).filter((nom) => nom.endsWith(".sql")).sort()
  .map((nom) => ({ nom, sql: readFileSync(resolve(dossier, nom), "utf8") }));
const sansCommentaires = (sql: string) => sql.replace(/--.*$/gm, "");

function derniereDefinition(fonction: string) {
  const motif = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fonction}\\s*\\(`, "i");
  const derniere = migrations.filter((m) => motif.test(m.sql)).at(-1);
  if (!derniere) throw new Error(`${fonction} introuvable`);
  const code = sansCommentaires(derniere.sql);
  const debut = code.search(motif);
  const corps = code.slice(debut, code.indexOf("$$;", code.indexOf("$$", debut) + 2) + 3);
  return { nom: derniere.nom, corps };
}

describe("modifier_facture_brouillon", () => {
  const { nom, corps } = derniereDefinition("modifier_facture_brouillon");

  it("n'appelle plus recalc_totaux_facture (permission denied sous authenticated)", () => {
    expect(nom >= "20261002001106").toBe(true);
    expect(corps).not.toMatch(/recalc_totaux_facture\s*\(/i);
  });

  it("reste SECURITY INVOKER : la RLS de l'appelant s'applique", () => {
    expect(corps).not.toMatch(/security\s+definer/i);
  });

  it("garde le refus des factures non brouillon", () => {
    expect(corps).toMatch(/statut\s*<>\s*'brouillon'/);
  });
});

describe("recalc_totaux_facture", () => {
  it("n'est jamais ré-accordé à authenticated, anon ou public", () => {
    const octrois = migrations.filter((m) => /grant\s+execute\s+on\s+function\s+public\.recalc_totaux_facture[^;]*to\s+[^;]*(authenticated|anon|public)/i.test(sansCommentaires(m.sql)));
    expect(octrois.map((m) => m.nom)).toEqual([]);
  });

  it("reste retiré à authenticated par la réconciliation ACL", () => {
    const acl = migrations.find((m) => m.nom.startsWith("20260902000255"))!;
    expect(acl.sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.recalc_totaux_facture\(p_facture_id uuid\) FROM authenticated;/);
  });
});
