import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Rendu hors du routeur Next et sans serveur : la navigation et les Server Actions sont neutralisées.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/app/actions/devis-v2", () => ({
  publierOuvrageAction: vi.fn(async () => ({ id: "x" })),
  changerStatutOuvrageAction: vi.fn(async () => ({ ok: true })),
}));

import { OuvrageEditeur, type OuvrageEditeurProps } from "@/components/ouvrages/OuvrageEditeur";
import { plancherChauffantFictif, PLANCHER_CHAUFFANT_FICTIF } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

const rendre = (p: Partial<OuvrageEditeurProps> = {}) =>
  renderToStaticMarkup(createElement(OuvrageEditeur, {
    ouvrageId: PLANCHER_CHAUFFANT_FICTIF.ouvrageId,
    versionInitiale: plancherChauffantFictif(),
    peutGerer: true,
    peutVoirCouts: true,
    peutGererCouts: true,
    ...p,
  }));

/** Prix d'achat du jeu fictif, tels qu'ils seraient posés dans un champ ou affichés. */
const valeursAchat = (html: string) =>
  ["0.85", "0.03", "0.9", "180", "110"].filter((x) => html.includes(`value="${x}"`));

describe("OuvrageEditeur — rendu du PC-001 fictif", () => {
  it("se rend sans erreur et montre chaque désignation de composant", () => {
    const html = rendre();
    for (const c of PLANCHER_CHAUFFANT_FICTIF.composants) expect(html, c.designation).toContain(c.designation);
    expect(html).toContain("Publier la version 2");
    expect(html).toContain("Une version publiée ne se modifie plus. Les devis existants gardent la version qu’ils ont reçue.");
    expect(html).toContain("Archiver");
    expect(html).toContain("Simulation");
  });

  it("avec le droit de voir les coûts : prix d'achat et marge présents (contrôle du test suivant)", () => {
    const html = rendre();
    expect(html).toContain("Prix d’achat HT");
    expect(html).toContain("Taux de marque");
    expect(valeursAchat(html).length).toBeGreaterThan(0);
  });

  it("sans voir_couts_devis : aucun champ ni aucune valeur de prix d'achat, aucune marge", () => {
    // Même si l'appelant transmettait par erreur une version avec coûts.
    const html = rendre({ peutVoirCouts: false, peutGererCouts: false });
    expect(html).not.toContain("Prix d’achat");
    expect(html).not.toContain("Coût d’achat");
    expect(html).not.toContain("Marge HT");
    expect(html).not.toContain("Taux de marque");
    expect(html).not.toContain("Coût d’achat incomplet");
    expect(valeursAchat(html)).toEqual([]);
  });

  it("voir sans gérer : le prix d'achat est en lecture seule", () => {
    const html = rendre({ peutGererCouts: false });
    expect(html).toMatch(/Prix d’achat HT<\/span><input[^>]*readonly=""/i);
    expect(html).toContain("Lecture seule.");
  });

  it("sans gerer_ouvrages : lecture seule, aucun bouton de publication ni de structure", () => {
    const html = rendre({ peutGerer: false });
    expect(html).toContain("Lecture seule");
    expect(html).toContain('<fieldset disabled=""');
    expect(html).not.toContain("Publier la version");
    expect(html).not.toContain("Ajouter le composant");
    expect(html).not.toContain("Archiver");
    expect(html).not.toContain(">Retirer<");
  });

  it("un ouvrage archivé propose de le réactiver", () => {
    const html = rendre({ versionInitiale: { ...plancherChauffantFictif(), statut: "archive" } });
    expect(html).toContain("Réactiver");
    expect(html).not.toContain(">Archiver<");
  });

  it("nouvel ouvrage : version 1, erreurs de publication affichées", () => {
    const html = rendre({ ouvrageId: null, versionInitiale: null });
    expect(html).toContain("Publier la version 1");
    expect(html).toContain("À corriger avant de publier");
    expect(html).toContain("L’ouvrage doit porter un nom.");
    expect(html).not.toContain(">Archiver<");
  });
});
