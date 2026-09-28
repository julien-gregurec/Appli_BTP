import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENTS_LEGAUX_PUBLICS, preparerDocumentLegal } from "./documents-legaux";
import { commercialisationOuverte, DEBUT_COMMERCIALISATION, DOMAINES_ELSATIA, EMAIL_CONTACT, IDENTITE_LEGALE, PRODUIT_GESTION_PRO } from "./identite-legale";
import { creerSessionAbonnementStripe } from "./stripe-abonnement";
import { creerSessionCheckoutBoutique } from "./stripe-boutique";

// Contrôle de cohérence de l'identité légale ELSATIA.
// Périmètre : code, pages publiques et pack juridique du dépôt uniquement.
// Les migrations, scripts SQL de production et données saisies par les clients
// (USER_CONTENT / LEGACY_HISTORY) ne sont volontairement pas analysés.

const RACINE = process.cwd();
const DOSSIER_JURIDIQUE = path.join(RACINE, "docs/juridique");

function lire(relatif: string) {
  return fs.readFileSync(path.join(RACINE, relatif), "utf8");
}

function fichiersSource(dossier: string): string[] {
  return fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true }).flatMap((entree) => {
    const relatif = path.join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersSource(relatif);
    if (!/\.(ts|tsx|css|js|mjs)$/.test(entree.name) || /\.test\.ts$/.test(entree.name)) return [];
    return [relatif];
  });
}

const DOCUMENTS_JURIDIQUES = fs.readdirSync(DOSSIER_JURIDIQUE).filter((nom) => nom.endsWith(".md"));
const SURFACES = [
  ...fichiersSource("src"),
  "public/sw.js",
  ".env.local.example",
  ...DOCUMENTS_JURIDIQUES.map((nom) => `docs/juridique/${nom}`),
];

// Identifiants techniques conservés volontairement (DO_NOT_TOUCH) : classes CSS,
// clés de stockage local, variables d'environnement, chemins d'assets, schéma d'export.
const ANCIENNE_MARQUE = /\bLiria\b(?!_)|\bLIRIA\b(?!_)|Liria Concept|Liria Gestion Pro/;
const ANCIENS_DOMAINES = /liria-gestion-pro\.fr|liria-concept-gestion-btp\.vercel\.app|@liria\b|\bliria\.fr\b|contact@liria/;
const PLACEHOLDERS = /\[À COMPLÉTER|À COMPLÉTER\]|\[JJ\/MM\/AAAA\]|\[Julien GREGUREC\]|\[contact@|_\[lien DPA\]_|\[Resend|\[Twilio|\[Google|votre-domaine\.fr/;

describe("identité légale ELSATIA", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("référence l'identité officielle d'exploitation", () => {
    expect(IDENTITE_LEGALE).toMatchObject({
      exploitant: "Julien GREGUREC",
      rcs: "850 559 873 R.C.S. Strasbourg",
      siren: "850 559 873",
      dateImmatriculation: "2026-09-28",
      dateDebutActivite: "2026-10-01",
      site: "elsatia.fr",
    });
    expect(IDENTITE_LEGALE.rcs.startsWith(IDENTITE_LEGALE.siren)).toBe(true);
    expect(Object.values(DOMAINES_ELSATIA).every((domaine) => domaine === "elsatia.fr" || domaine.endsWith(".elsatia.fr"))).toBe(true);
    expect(EMAIL_CONTACT.endsWith("@elsatia.fr")).toBe(true);
  });

  it("n'expose plus l'ancienne marque ni les anciens domaines", () => {
    const fautifs = SURFACES.flatMap((fichier) =>
      lire(fichier).split("\n").flatMap((ligne, index) =>
        ANCIENNE_MARQUE.test(ligne) || ANCIENS_DOMAINES.test(ligne) ? [`${fichier}:${index + 1}`] : []));
    expect(fautifs).toEqual([]);
  });

  it("ne laisse aucun placeholder légal hors marqueur LEGAL_REVIEW_REQUIRED", () => {
    const fautifs = [...DOCUMENTS_JURIDIQUES.map((nom) => `docs/juridique/${nom}`), ".env.local.example"].flatMap((fichier) =>
      lire(fichier).split("\n").flatMap((ligne, index) => PLACEHOLDERS.test(ligne) ? [`${fichier}:${index + 1}`] : []));
    expect(fautifs).toEqual([]);
  });

  it("n'utilise que le RCS officiel et aucun SIRET fictif", () => {
    for (const fichier of SURFACES) {
      const contenu = lire(fichier);
      for (const mention of contenu.match(/[\d ]{9,}\s*R\.?\s?C\.?\s?S\.?[^\n]{0,20}/g) ?? []) {
        expect(mention.trim(), fichier).toContain(IDENTITE_LEGALE.rcs);
      }
      expect(contenu, fichier).not.toMatch(/12345678900012|99999999999999/);
    }
  });

  it("contient les mentions critiques dans les documents publiés", () => {
    const mentions = lire("docs/juridique/mentions-legales.md");
    for (const attendu of [PRODUIT_GESTION_PRO, IDENTITE_LEGALE.exploitant, "entrepreneur individuel (EI)", IDENTITE_LEGALE.rcs, "https://elsatia.fr", "Directeur de la publication", "Hébergement", "contact@elsatia.fr"]) {
      expect(mentions).toContain(attendu);
    }
    const cgv = lire("docs/juridique/cgv.md");
    for (const attendu of [PRODUIT_GESTION_PRO, IDENTITE_LEGALE.exploitant, IDENTITE_LEGALE.rcs, "1er octobre 2026"]) expect(cgv).toContain(attendu);
    for (const fichier of ["cgu.md", "politique-confidentialite.md", "dpa-entreprises-clientes.md", "rgpd-registre-des-traitements.md"]) {
      const contenu = lire(`docs/juridique/${fichier}`);
      expect(contenu, fichier).toContain(IDENTITE_LEGALE.exploitant);
      expect(contenu, fichier).toContain(IDENTITE_LEGALE.rcs);
    }
    expect(lire("src/components/PiedLegal.tsx")).toContain("IDENTITE_LEGALE.rcs");
  });

  it("publie les documents sans note interne ni placeholder brut", () => {
    for (const nom of DOCUMENTS_LEGAUX_PUBLICS) {
      const publie = preparerDocumentLegal(lire(`docs/juridique/${nom}`));
      expect(publie, nom).not.toMatch(/LEGAL_REVIEW_REQUIRED|<!--|\[À COMPLÉTER/);
    }
    expect(preparerDocumentLegal("Adresse : [LEGAL_REVIEW_REQUIRED: x] <!-- LEGAL_REVIEW_REQUIRED: y -->")).toBe("Adresse : _en cours de mise à jour_ ");
  });

  it("n'imprime jamais le logo du logiciel sur les documents des entreprises clientes", () => {
    expect(lire("src/components/DocumentImprimable.tsx")).not.toMatch(/logo_url \|\| "\//);
    expect(lire("src/app/imprimer/doe/[id]/page.tsx")).not.toMatch(/logo_url \|\| "\//);
  });

  it("n'ouvre la commercialisation qu'au 1er octobre 2026 (heure de Paris)", () => {
    expect(DEBUT_COMMERCIALISATION.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(commercialisationOuverte(new Date("2026-09-30T21:59:59Z"))).toBe(false);
    expect(commercialisationOuverte(new Date("2026-09-30T22:00:00Z"))).toBe(true);
  });

  it("refuse toute session Stripe payante avant le commencement d'activité", async () => {
    const appelStripe = vi.fn();
    vi.stubGlobal("fetch", appelStripe);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    await expect(creerSessionAbonnementStripe({ entrepriseId: "e1", customerId: "cus_test", offre: "pro", periodicite: "mensuel" })).rejects.toThrow("1er octobre 2026");
    await expect(creerSessionCheckoutBoutique({ commandeId: "c1", entrepriseId: "e1", lignes: [{ nom: "Étiquettes", quantite: 1, prixUnitaireCentimes: 100 }] })).rejects.toThrow("1er octobre 2026");
    expect(appelStripe).not.toHaveBeenCalled();
  });
});
