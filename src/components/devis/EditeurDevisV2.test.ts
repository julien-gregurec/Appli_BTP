import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// L'éditeur est rendu hors de Next : le routeur et les actions serveur sont remplacés par des doublures.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/app/actions/devis-v2", () => ({
  enregistrerDevisV2Action: vi.fn(),
  rechercherArticlesDevisAction: vi.fn(async () => ({ articles: [] })),
  rechercherOuvragesAction: vi.fn(async () => ({ ouvrages: [] })),
  chargerOuvrageAction: vi.fn(async () => ({ error: "non chargé en test" })),
}));

const { EditeurDevisV2 } = await import("@/components/devis/EditeurDevisV2");
const { SelectionArticlesDialog } = await import("@/components/devis/SelectionArticlesDialog");
const { InsertionOuvrageDialog } = await import("@/components/devis/InsertionOuvrageDialog");
const { PrixGlobalDialog } = await import("@/components/devis/PrixGlobalDialog");
const { elementsFictifs } = await import("@/lib/devis/fixtures/document-fictif");

type Props = Parameters<typeof EditeurDevisV2>[0];

const elements = elementsFictifs({ lignesLibres: 2, mode: "eclate" });
const ouvrage = elements.find((e) => e.type === "ouvrage")!;
if (ouvrage.type !== "ouvrage") throw new Error("fixture");

function props(p: Partial<Props> = {}): Props {
  return {
    devisId: null,
    clients: [{ id: "c1", label: "Client Fictif", adresse: "1 rue", codePostal: "00000", ville: "Ville", siret: null }],
    chantiers: [],
    enteteInitiale: {
      client_id: "c1", chantier_id: null, date_emission: "2026-09-11", date_validite: null, conditions: "Conditions fictives",
      notes_client: null, notes_internes: "NOTE-INTERNE-SECRETE", remise_globale: 0, filigrane: null,
    },
    etatInitial: { elements, origines: { l1: { origine: "catalogue", sourceId: "p1", sourceCatalogue: "prestation", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521", prixAchatHt: 12.34 } } },
    emetteur: {
      nom: "Entreprise Fictive", raisonSociale: null, siret: null, adresse: null, codePostal: null, ville: null, logoUrl: null,
      assuranceDecennaleNumero: null, assuranceDecennaleAssureur: null, assuranceRcProNumero: null, tauxPenalitesRetard: null,
      texteEntete: null, textePiedPage: null,
    },
    style: {},
    filigranesEntreprise: { defaut: null, brouillon: { type: "texte", preset: "BROUILLON" } },
    logoDisponible: false,
    droits: { voirCouts: false, gererCouts: false, modifierPrix: true, modifierUnite: true },
    seuilTauxMarquePct: null,
    nomProduit: "ELSATIA",
    ...p,
  };
}

describe("éditeur visuel v2 — rendu", () => {
  it("rend la saisie ET l'aperçu réel du document, filigrane brouillon compris", () => {
    const html = renderToStaticMarkup(createElement(EditeurDevisV2, props()));
    expect(html).toContain('aria-label="Aperçu du document"');
    expect(html).toContain('class="doc-a4 doc-a4--apercu"');
    expect(html).toContain(">BROUILLON</span>");
    expect(html).toContain("Client Fictif");
    expect(html).toContain("Plancher chauffant");
    expect(html).toContain("Ajouter des articles");
  });
  it("n'affiche aucun prix d'achat ni marge sans voir_couts_devis", () => {
    const html = renderToStaticMarkup(createElement(EditeurDevisV2, props()));
    expect(html).not.toMatch(/achat 12,34|Coût |marge /);
  });
  it("affiche coût et marge avec voir_couts_devis, jamais dans l'aperçu du document", () => {
    const html = renderToStaticMarkup(createElement(EditeurDevisV2, props({ droits: { voirCouts: true, gererCouts: true, modifierPrix: true, modifierUnite: true } })));
    expect(html).toMatch(/Coût /);
    const apercu = html.slice(html.indexOf('class="doc-a4 doc-a4--apercu"'));
    expect(apercu).not.toMatch(/achat|Coût|marge|NOTE-INTERNE-SECRETE/);
  });
  it("affiche les deux références figées d'une ligne issue du catalogue", () => {
    const html = renderToStaticMarkup(createElement(EditeurDevisV2, props()));
    expect(html).toContain("BA13-200");
    expect(html).toContain("PLACO-4521");
  });
});

describe("boîtes de dialogue — rendu", () => {
  it("sélection d'articles : recherche au clavier, liste multisélection, cibles tactiles", () => {
    const html = renderToStaticMarkup(createElement(SelectionArticlesDialog, {
      etat: { elements: [], origines: {} }, genererCle: () => "k", peutModifierPrix: true, peutModifierUnite: true, peutVoirCouts: false,
      onFermer: () => undefined, onApplique: () => undefined,
    }));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toMatch(/min-h-11/);
  });
  it("insertion d'ouvrage : composants modifiables, colonne achat seulement avec le droit", () => {
    const base = { genererCle: () => "k", peutModifierPrix: true, seuilTauxMarquePct: null, onFermer: () => undefined, onValider: () => undefined };
    const sans = renderToStaticMarkup(createElement(InsertionOuvrageDialog, { ...base, instanceInitiale: ouvrage.instance, peutVoirCouts: false }));
    expect(sans).toContain("Isolant à plots (fictif)");
    expect(sans).not.toContain(">Achat<");
    const avec = renderToStaticMarkup(createElement(InsertionOuvrageDialog, { ...base, instanceInitiale: ouvrage.instance, peutVoirCouts: true }));
    expect(avec).toContain(">Achat<");
  });
  it("prix global : trois stratégies explicites et aucun coût sans droit", () => {
    const html = renderToStaticMarkup(createElement(PrixGlobalDialog, {
      instance: ouvrage.instance, peutVoirCouts: false, seuilTauxMarquePct: null, onFermer: () => undefined, onValider: () => undefined,
    }));
    expect(html).toContain("ligne d’ajustement");
    expect(html).toContain("Répartir proportionnellement");
    expect(html).toContain("remise");
    expect(html).not.toContain("Coût d’achat");
  });
});
