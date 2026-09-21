import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  brevoEstConfigure: vi.fn(() => true),
  envoyerEmailBrevo: vi.fn(async () => ({ messageId: "msg_1" as string | null })),
}));
vi.mock("@/lib/brevo", () => deps);

const { notifierReponseSupport, lienEspaceSupport } = await import("./support-notifications");

const BASE = {
  destinataire: "demandeur@exemple.test",
  prenom: "Camille",
  nom: "Durand",
  entrepriseId: "a0000000-0000-4000-8000-000000000001",
  entrepriseNom: "SARL Test",
  demande: "Export comptable incomplet",
  reponse: "Bonjour, c'est corrigé depuis ce matin.",
};

describe("lienEspaceSupport", () => {
  it("ne renvoie que l'espace d'aide de l'origine officielle", () => {
    expect(lienEspaceSupport({ NEXT_PUBLIC_APP_URL: "https://app.elsatia.fr/quelconque?x=1" }))
      .toBe("https://app.elsatia.fr/aide");
  });

  it("ne fabrique pas de lien sans origine exploitable", () => {
    for (const valeur of [undefined, "", "javascript:alert(1)", "pas-une-url"]) {
      expect(lienEspaceSupport({ NEXT_PUBLIC_APP_URL: valeur })).toBeNull();
    }
  });
});

describe("notifierReponseSupport", () => {
  beforeEach(() => {
    deps.brevoEstConfigure.mockReturnValue(true);
    deps.envoyerEmailBrevo.mockResolvedValue({ messageId: "msg_1" });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("envoie une notification unique au demandeur", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "support@elsatia.fr");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.elsatia.fr");
    await expect(notifierReponseSupport(BASE)).resolves.toEqual({ envoye: true });
    expect(deps.envoyerEmailBrevo).toHaveBeenCalledTimes(1);
    const [envoi] = deps.envoyerEmailBrevo.mock.calls[0] as unknown as [
      { to: string; toName?: string; sujet: string; texte: string; html?: string; replyTo?: string | null },
    ];
    expect(envoi.to).toBe("demandeur@exemple.test");
    expect(envoi.toName).toBe("Camille Durand");
    expect(envoi.sujet).toBe("Réponse du support ELSATIA");
    expect(envoi.replyTo).toBe("support@elsatia.fr");
    expect(envoi.texte).toContain("SUP-A0000000");
    expect(envoi.texte).toContain("Export comptable incomplet");
    expect(envoi.texte).toContain("c'est corrigé depuis ce matin");
    expect(envoi.html).toContain("https://app.elsatia.fr/aide");
  });

  it("n'invente jamais d'adresse quand le demandeur n'en a pas de fiable", async () => {
    for (const destinataire of [null, undefined, "   ", "pas-une-adresse", "deux adresses@exemple.test"]) {
      await expect(notifierReponseSupport({ ...BASE, destinataire })).resolves.toEqual({
        envoye: false,
        motif: "destinataire_absent",
      });
    }
    expect(deps.envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("ne tente rien si Brevo n'est pas configuré", async () => {
    deps.brevoEstConfigure.mockReturnValue(false);
    await expect(notifierReponseSupport(BASE)).resolves.toEqual({ envoye: false, motif: "brevo_non_configure" });
    expect(deps.envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("avale une panne Brevo sans lever ni journaliser de donnée sensible", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.envoyerEmailBrevo.mockRejectedValue(new Error("Brevo a répondu 500"));
    await expect(notifierReponseSupport(BASE)).resolves.toEqual({ envoye: false, motif: "envoi_impossible" });
    const journalise = JSON.stringify(journal.mock.calls);
    expect(journalise).not.toContain("demandeur@exemple.test");
    expect(journalise).not.toContain("corrigé");
    expect(journalise).not.toContain(BASE.entrepriseId);
    journal.mockRestore();
  });

  it("reste envoyable sans lien applicatif configuré", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    await expect(notifierReponseSupport(BASE)).resolves.toEqual({ envoye: true });
    const [envoi] = deps.envoyerEmailBrevo.mock.calls[0] as unknown as [{ html?: string }];
    expect(envoi.html).not.toContain("<a href");
  });
});
