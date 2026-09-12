import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanneauActions } from "./PanneauActions";
import { actionsDevis } from "@/lib/actions-contextuelles/registre";

// Rendu serveur du panneau : une action indisponible reste visible, grisée, avec son motif ; une action
// disponible est un lien ou un formulaire ; les actions serveur non fournies par la page sont inertes.
const devis = { id: "d1", statut: "envoye", chantierId: null, clientId: "c1", moteurV2: true, aDesLignes: true };

describe("PanneauActions", () => {
  const html = renderToStaticMarkup(createElement(PanneauActions, { titre: "Devis", actions: actionsDevis(devis, null), formActions: { dupliquer: async () => {} } }));

  it("montre les actions indisponibles grisées avec le motif en infobulle et au lecteur d'écran", () => {
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Disponible uniquement lorsque le devis est accepté."');
    expect(html).toContain("— Disponible uniquement lorsque le devis est accepté.");
    expect(html).not.toContain("disabled=\"\"");
  });
  it("rend un lien pour une action disponible et un formulaire pour une action serveur fournie", () => {
    expect(html).toContain('href="/imprimer/devis/d1"');
    expect(html).toContain("<form");
    expect(html).toContain("Dupliquer");
  });
  it("garde toutes les actions du registre, groupées, sur ordinateur et sur téléphone", () => {
    for (const a of actionsDevis(devis, null)) expect(html).toContain(a.libelle);
    expect(html).toContain("data-panneau-actions-mobile");
    expect(html).toContain("Transformer");
  });
});
