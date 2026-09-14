import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { instant, type Evenement } from "@/lib/planning/modele";
import type { DonneesPlanningV2 } from "@/lib/planning/serveur";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("@/app/actions/planning-v2", () => ({ enregistrerEvenementAction: vi.fn(), supprimerEvenementAction: vi.fn() }));

const { PlanningV2 } = await import("@/components/planning/PlanningV2");

const ev = (id: string, titre: string, jour: string, h1: number, h2: number, employes: string[], extra: Partial<Evenement> = {}): Evenement => ({
  id, titre, type: "chantier", statut: "planifie", debut: instant(jour, h1 * 60), fin: instant(jour, h2 * 60), journeeEntiere: false, couleur: null,
  chantierId: "ch1", clientId: null, adresse: "12 rue des Lilas", notes: null, affectations: employes.map((e) => ({ employeId: e })), ...extra,
});

function donnees(evenements: Evenement[]): DonneesPlanningV2 {
  return {
    evenements, conflits: [],
    salaries: [{ id: "s1", nom: "Ali Poseur", actif: true }, { id: "s2", nom: "Bea Chef", actif: true }],
    equipes: [{ id: "q1", nom: "Équipe A", couleur: null, membres: ["s1", "s2"] }],
    ressources: [{ id: "r1", type: "nacelle", nom: "Nacelle 12 m", couleur: null, actif: true }],
    chantiers: [{ id: "ch1", nom: "Maison Dupont", clientId: null, adresse: null }], clients: [], disponibilites: [],
    droits: { gerer: true, affecter: true }, permissions: null,
  };
}

describe("PlanningV2 (rendu statique)", () => {
  it("vue semaine : une ligne par salarié, les 7 jours, le bloc sur la bonne ligne, barre d'outils, menu Actions et barre repliable, et 8 vues", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([ev("e1", "Pose cuisine", "2026-09-16", 8, 12, ["s1"])]), jour: "2026-09-14", vue: "semaine" }));
    expect(html).toContain("Ali Poseur");
    expect(html).toContain("Bea Chef");
    expect(html).toContain('data-ligne="s:s1"');
    expect((html.match(/role="columnheader"/g) ?? []).length).toBe(8);
    expect(html).toContain("08:00–12:00 Pose cuisine");
    expect((html.match(/role="tab"/g) ?? []).length).toBe(8);
    expect(html).toContain("Nouvel évènement");
    expect(html).toContain('data-testid="menu-actions-evenement"');
    // Barre d'actions contextuelle repliable (GP V1, 2026-09-14) : additive au menu « Actions ▾ » et au
    // menu contextuel du bloc (même registre `actionsPlanning`) — remplace le panneau permanent retiré
    // le 2026-09-13 (jugé lourd) par une version compacte et repliable, préférence mémorisée.
    expect(html).toContain('data-testid="rail-planning"');
    expect(html).toContain('data-testid="rail-planning-bascule"');
    expect(html).toContain("lg:pr-72");
  });

  it("barre d'actions : rien sélectionné, seul « Nouvel évènement » est disponible, les autres portent leur motif", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([ev("e1", "Pose cuisine", "2026-09-16", 8, 12, ["s1"])]), jour: "2026-09-14", vue: "semaine" }));
    expect(html).toContain('data-testid="rail-planning-action-creer"');
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="rail-planning-action-modifier"/);
    expect(html).toContain("Sélectionnez un évènement du planning.");
    // Gestes de glisser (Déplacer, Changer l'horaire) : pas des actions cliquables, exclus de la barre.
    expect(html).not.toContain('data-testid="rail-planning-action-deplacer"');
    expect(html).not.toContain('data-testid="rail-planning-action-horaire"');
  });

  it("sans droit de gestion : la barre d'actions grise aussi Modifier et Supprimer avec leur motif", () => {
    const d = donnees([ev("e1", "Pose", "2026-09-16", 8, 12, ["s1"])]);
    d.droits = { gerer: false, affecter: false }; d.permissions = ["acces_planning"];
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: d, jour: "2026-09-14", vue: "semaine" }));
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="rail-planning-action-modifier"/);
    expect(html).toMatch(/aria-disabled="true"[^>]*data-testid="rail-planning-action-supprimer"/);
    expect(html).toContain('data-testid="rail-planning-mobile-bouton"');
  });

  it("vue jour : colonnes horaires et bloc positionné selon l'heure", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([ev("e1", "Pose cuisine", "2026-09-16", 8, 12, ["s1"])]), jour: "2026-09-16", vue: "jour" }));
    expect(html).toContain("06:00");
    expect(html).toContain("20:00");
    expect(html).toContain('aria-label="Étirer"');
    expect(html).toContain("Zoom");
  });

  it("conflit calculé en direct : le même salarié sur deux évènements qui se chevauchent", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([ev("e1", "Pose cuisine", "2026-09-16", 8, 12, ["s1"]), ev("e2", "Dépannage", "2026-09-16", 10, 11, ["s1"])]), jour: "2026-09-14", vue: "semaine" }));
    expect(html).toContain("2 conflits");
    expect(html).toContain("Déjà affecté");
  });

  it("vue compacte : liste dense avec salariés via l'équipe", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([ev("e1", "Pose cuisine", "2026-09-16", 8, 12, [], { affectations: [{ equipeId: "q1" }] })]), jour: "2026-09-14", vue: "compacte" }));
    expect(html).toContain("Ali Poseur, Bea Chef");
    expect(html).toContain("Maison Dupont");
  });

  it("vue mois : septembre 2026 = 5 semaines pleines (35 cases), celles hors du mois atténuées", () => {
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: donnees([]), jour: "2026-09-14", vue: "mois" }));
    expect((html.match(/data-ligne="tous"/g) ?? []).length).toBe(35);
    expect(html).toContain("opacity-50");
    expect(html).toContain("septembre 2026");
  });

  it("sans droit de gestion : rien n'est glissable, bouton Nouvel évènement grisé et expliqué, menu d'actions présent", () => {
    const d = donnees([ev("e1", "Pose", "2026-09-16", 8, 12, ["s1"])]);
    d.droits = { gerer: false, affecter: false }; d.permissions = ["acces_planning"];
    const html = renderToStaticMarkup(createElement(PlanningV2, { donnees: d, jour: "2026-09-14", vue: "semaine" }));
    expect(html).toMatch(/aria-disabled="true"[^>]*gerer_planning[^>]*>Nouvel évènement/);
    expect(html).toContain('data-testid="menu-actions-evenement"');
  });
});
