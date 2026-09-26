import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  journaliserEchecTechnique,
  LONGUEUR_MAXIMALE_MESSAGE,
  MARQUE_OCCULTATION,
  messageJournalisable,
} from "@/lib/journal-securite";

describe("messageJournalisable", () => {
  it("retire le détail Key (…)=(…), qui transporte des valeurs métier", () => {
    const message = 'duplicate key value violates unique constraint "colors_emplacements_entreprise_id_nom_key" '
      + "Key (entreprise_id, nom)=(0f3a1c2e-0000-0000-0000-000000000001, Dépôt Nord) already exists.";
    const journal = messageJournalisable(message);
    expect(journal).not.toContain("Dépôt Nord");
    expect(journal).not.toContain("0f3a1c2e");
    expect(journal).toContain(MARQUE_OCCULTATION);
    // Ce qui sert au diagnostic est conservé.
    expect(journal).toContain("colors_emplacements_entreprise_id_nom_key");
    expect(journal).toContain("duplicate key value");
  });

  it("retire une adresse électronique où qu'elle se trouve", () => {
    const journal = messageJournalisable("User marie.dupont@entreprise-cliente.fr not found");
    expect(journal).not.toContain("marie.dupont");
    expect(journal).not.toContain("entreprise-cliente.fr");
  });

  it("retire les littéraux entre apostrophes mais garde les identifiants entre guillemets", () => {
    const journal = messageJournalisable(`invalid input value for enum etat: 'Peinture Client X' on "colors_seaux"`);
    expect(journal).not.toContain("Peinture Client X");
    expect(journal).toContain('"colors_seaux"');
  });

  it("tronque un message démesuré plutôt que d'inonder le journal", () => {
    const journal = messageJournalisable("x".repeat(LONGUEUR_MAXIMALE_MESSAGE + 200));
    expect(journal.length).toBe(LONGUEUR_MAXIMALE_MESSAGE + 1);
    expect(journal.endsWith("…")).toBe(true);
  });

  it("reste lisible sur un message inconnu — la liste est de formes refusées, pas de messages autorisés", () => {
    expect(messageJournalisable("connexion réseau interrompue")).toBe("connexion réseau interrompue");
  });

  it("supporte l'absence de message", () => {
    expect(messageJournalisable(undefined)).toBe("sans message");
    expect(messageJournalisable("   ")).toBe("sans message");
  });
});

describe("journaliserEchecTechnique", () => {
  it("journalise le code puis le message nettoyé, et rien d'autre", () => {
    const console_ = vi.spyOn(console, "error").mockImplementation(() => undefined);
    journaliserEchecTechnique("colors_seaux.insert", {
      code: "23505",
      message: "Key (nom)=(Chantier Villa Rose) already exists.",
    });
    expect(console_).toHaveBeenCalledTimes(1);
    const trace = console_.mock.calls[0].join(" ");
    expect(trace).toContain("23505");
    expect(trace).toContain("colors_seaux.insert");
    expect(trace).not.toContain("Villa Rose");
    console_.mockRestore();
  });

  it("n'exige ni code ni message", () => {
    const console_ = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => journaliserEchecTechnique("operation", null)).not.toThrow();
    expect(console_.mock.calls[0].join(" ")).toContain("sans code");
    console_.mockRestore();
  });
});
