import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentLegal } from "./DocumentLegal";

// Pages réellement servies par le composant (cf. src/app/*/page.tsx).
const PAGES_SERVIES = [
  "mentions-legales.md",
  "cgv.md",
  "cgu.md",
  "politique-confidentialite.md",
  "politique-cookies.md",
];

// Le composant renvoie <main><article><Markdown>{contenu}</Markdown></article>…</main> :
// on récupère la seule feuille de type chaîne, sans DOM ni rendu react-markdown.
function contenuSubstitue(fichier: string): string {
  const trouver = (noeud: unknown): string | null => {
    if (typeof noeud === "string") return noeud;
    if (Array.isArray(noeud)) {
      for (const enfant of noeud) {
        const trouve = trouver(enfant);
        if (trouve !== null) return trouve;
      }
      return null;
    }
    if (noeud && typeof noeud === "object" && "props" in noeud) {
      return trouver((noeud as { props?: { children?: unknown } }).props?.children);
    }
    return null;
  };

  const contenu = trouver(DocumentLegal({ fichier }));
  if (contenu === null) throw new Error(`Aucun contenu markdown trouvé pour ${fichier}`);
  return contenu;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DocumentLegal — substitution des jetons éditeur (ELSATIA-LEGAL-CONTENT-V1)", () => {
  it("sans variables d'environnement, le repli reste neutre (n'affirme ni numéro ni régime)", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_SIRET", "");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_TVA", "");

    const mentions = contenuSubstitue("mentions-legales.md");

    expect(mentions).toContain("SIRET : **en cours de finalisation**");
    expect(mentions).toContain("Mention de TVA : **à confirmer**");
    // Un repli ne doit jamais inventer un numéro ni un régime fiscal.
    expect(mentions).not.toMatch(/\d{9}|\d{3} \d{3} \d{3}/);
    expect(mentions).not.toMatch(/non assujetti|TVA non applicable/i);
  });

  it("avec NEXT_PUBLIC_LEGAL_SIRET renseignée, le SIRET réel est substitué", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_SIRET", "850 559 873 00011");

    expect(contenuSubstitue("mentions-legales.md")).toContain("SIRET : **850 559 873 00011**");
  });

  it("avec NEXT_PUBLIC_LEGAL_TVA renseignée, la mention est substituée dans les mentions légales ET les CGV", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_TVA", "TVA intracommunautaire FR00000000000");

    expect(contenuSubstitue("mentions-legales.md")).toContain(
      "Mention de TVA : **TVA intracommunautaire FR00000000000**",
    );
    expect(contenuSubstitue("cgv.md")).toContain(
      "Régime de TVA : **TVA intracommunautaire FR00000000000**",
    );
  });

  it("une valeur d'environnement vide ou blanche retombe sur le repli neutre", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_SIRET", "   ");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_TVA", "   ");

    const mentions = contenuSubstitue("mentions-legales.md");

    expect(mentions).toContain("SIRET : **en cours de finalisation**");
    expect(mentions).toContain("Mention de TVA : **à confirmer**");
  });

  it("aucun jeton brut ne fuit sur une page juridique publique, quelle que soit la page", () => {
    for (const fichier of PAGES_SERVIES) {
      const contenu = contenuSubstitue(fichier);
      // Garde-fou : un nouveau jeton ajouté au markdown sans substitution
      // correspondante s'afficherait littéralement au public.
      expect(contenu, fichier).not.toMatch(/\[[A-Z_]+\]/);
    }
  });
});
