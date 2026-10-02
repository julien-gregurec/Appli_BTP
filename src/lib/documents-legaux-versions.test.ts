import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAMP_ACCEPTATION,
  CHAMP_ACCEPTATION_VERSIONS,
  CODES_DOCUMENTS_A_ACCEPTER,
  lireAcceptationFormulaire,
  MESSAGE_ACCEPTATION_MANQUANTE,
  MESSAGE_VERSIONS_PERIMEES,
  messageLectureAcceptation,
  VERSIONS_DOCUMENTS_LEGAUX,
  versionsAfficheesSerialisees,
} from "./documents-legaux-versions";

const RACINE = process.cwd();
const MIGRATIONS = path.join(RACINE, "supabase/migrations");

function sha256(fichier: string) {
  return createHash("sha256").update(fs.readFileSync(path.join(RACINE, "docs/juridique", fichier))).digest("hex");
}

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

describe("registre des versions des documents à accepter", () => {
  it.each(CODES_DOCUMENTS_A_ACCEPTER)("%s : l'empreinte enregistrée est celle du fichier publié (toute modification exige une nouvelle version)", (code) => {
    const v = VERSIONS_DOCUMENTS_LEGAUX[code];
    expect(sha256(v.fichier)).toBe(v.empreinteSha256);
  });

  it.each(CODES_DOCUMENTS_A_ACCEPTER)("%s : la même version et la même empreinte sont publiées en base par une migration", (code) => {
    const v = VERSIONS_DOCUMENTS_LEGAUX[code];
    const seed = `('${v.code}', '${v.version}', '${v.empreinteSha256}', '${v.fichier}', '${v.portee}'`;
    const trouve = fs.readdirSync(MIGRATIONS).some((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8").includes(seed));
    expect(trouve).toBe(true);
  });

  it.each(CODES_DOCUMENTS_A_ACCEPTER)("%s : le document est lisible publiquement avant acceptation", (code) => {
    const page = path.join(RACINE, "src/app", VERSIONS_DOCUMENTS_LEGAUX[code].chemin, "page.tsx");
    expect(fs.readFileSync(page, "utf8")).toContain(`fichier="${VERSIONS_DOCUMENTS_LEGAUX[code].fichier}"`);
  });

  it("la politique de confidentialité et les mentions légales ne sont pas « acceptées » (information, pas contrat)", () => {
    expect(CODES_DOCUMENTS_A_ACCEPTER).not.toContain("confidentialite" as never);
    expect(CODES_DOCUMENTS_A_ACCEPTER).not.toContain("mentions-legales" as never);
  });
});

describe("lecture de la case d'acceptation", () => {
  const versions = versionsAfficheesSerialisees();

  it("case absente : refus", () => {
    const r = lireAcceptationFormulaire(formulaire({ [CHAMP_ACCEPTATION_VERSIONS]: versions }));
    expect(r).toEqual({ ok: false, raison: "non_cochee" });
    if (!r.ok) expect(messageLectureAcceptation(r)).toBe(MESSAGE_ACCEPTATION_MANQUANTE);
  });

  it.each(["true", "1", "off", "yes", ""])("valeur %j autre que « on » : refus", (valeur) => {
    expect(lireAcceptationFormulaire(formulaire({ [CHAMP_ACCEPTATION]: valeur, [CHAMP_ACCEPTATION_VERSIONS]: versions })).ok).toBe(false);
  });

  it("versions affichées périmées : refus avec demande de relecture", () => {
    const r = lireAcceptationFormulaire(formulaire({ [CHAMP_ACCEPTATION]: "on", [CHAMP_ACCEPTATION_VERSIONS]: "cgu@0.9,cgv@1.0,dpa@2026-08-24" }));
    expect(r).toEqual({ ok: false, raison: "versions_perimees" });
    if (!r.ok) expect(messageLectureAcceptation(r)).toBe(MESSAGE_VERSIONS_PERIMEES);
  });

  it("case cochée sur les versions en vigueur : charge utile code + version + empreinte pour chaque document", () => {
    const r = lireAcceptationFormulaire(formulaire({ [CHAMP_ACCEPTATION]: "on", [CHAMP_ACCEPTATION_VERSIONS]: versions }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.documents.map((d) => d.code)).toEqual([...CODES_DOCUMENTS_A_ACCEPTER]);
      for (const d of r.documents) expect(d.empreinte).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("formulaires commerciaux", () => {
  const COMPOSANT = fs.readFileSync(path.join(RACINE, "src/components/AcceptationConditions.tsx"), "utf8");

  it("la case n'est jamais pré-cochée", () => {
    expect(COMPOSANT).not.toMatch(/defaultChecked|checked=\{?true|\bchecked\b(?!\s*=\s*\{?false)/);
    expect(COMPOSANT).toMatch(/type="checkbox" required/);
  });

  it.each([
    ["src/app/onboarding/page.tsx", "createEntrepriseAction"],
    ["src/app/onboarding/besoins/page.tsx", "demarrerAbonnementAction"],
    ["src/app/(app)/abonnement/page.tsx", "demarrerAbonnementAction"],
  ])("%s : le formulaire %s porte la case d'acceptation", (fichier, action) => {
    const source = fs.readFileSync(path.join(RACINE, fichier), "utf8");
    const debut = source.indexOf(`action={${action}}`);
    expect(debut).toBeGreaterThan(-1);
    const fin = source.indexOf("</form>", debut);
    expect(source.slice(debut, fin)).toContain("<AcceptationConditions");
  });

  it("les actions serveur exigent l'acceptation avant la base et avant Stripe", () => {
    const entreprise = fs.readFileSync(path.join(RACINE, "src/app/actions/entreprise.ts"), "utf8");
    expect(entreprise).toContain('rpc("creer_entreprise_avec_acceptation"');
    expect(entreprise).not.toContain('rpc("creer_entreprise_bootstrap"');
    const abonnement = fs.readFileSync(path.join(RACINE, "src/app/actions/abonnement.ts"), "utf8");
    const garde = abonnement.indexOf("exigerAcceptationConditions(supabase, formData");
    expect(garde).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(abonnement.indexOf("ouvrirCheckoutAbonnement({"));
  });
});
