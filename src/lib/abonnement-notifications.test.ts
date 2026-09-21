import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  brevoEstConfigure: vi.fn(() => true),
  envoyerEmailBrevo: vi.fn(async (params: { to: string; sujet: string; texte: string; html?: string; replyTo?: string | null }) => ({ messageId: `msg_${params.to}` as string | null })),
}));
vi.mock("@/lib/brevo", () => deps);

const { notifierPaiementAbonnementEchoue } = await import("./abonnement-notifications");

const BASE = { destinataire: "gerant@exemple.test", entrepriseNom: "SARL Test", montantTtc: 99, devise: "eur" };

describe("notifierPaiementAbonnementEchoue", () => {
  beforeEach(() => {
    deps.brevoEstConfigure.mockReturnValue(true);
    deps.envoyerEmailBrevo.mockResolvedValue({ messageId: "msg_1" });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("envoie l'email au destinataire de facturation Stripe", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "support@elsatia.fr");
    await expect(notifierPaiementAbonnementEchoue(BASE)).resolves.toEqual({ envoye: true });
    expect(deps.envoyerEmailBrevo).toHaveBeenCalledTimes(1);
    const [envoi] = deps.envoyerEmailBrevo.mock.calls[0];
    expect(envoi.to).toBe("gerant@exemple.test");
    expect(envoi.replyTo).toBe("support@elsatia.fr");
    expect(envoi.texte).toContain("SARL Test");
  });

  it("ne tente rien sans destinataire", async () => {
    await expect(notifierPaiementAbonnementEchoue({ ...BASE, destinataire: "  " })).resolves.toEqual({ envoye: false, motif: "destinataire_absent" });
    expect(deps.envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("ne tente rien si Brevo n'est pas configuré", async () => {
    deps.brevoEstConfigure.mockReturnValue(false);
    await expect(notifierPaiementAbonnementEchoue(BASE)).resolves.toEqual({ envoye: false, motif: "brevo_non_configure" });
    expect(deps.envoyerEmailBrevo).not.toHaveBeenCalled();
  });

  it("avale une panne d'envoi sans jamais lever ni journaliser l'adresse", async () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.envoyerEmailBrevo.mockRejectedValue(new Error("Brevo a répondu 500"));
    await expect(notifierPaiementAbonnementEchoue(BASE)).resolves.toEqual({ envoye: false, motif: "envoi_impossible" });
    expect(JSON.stringify(journal.mock.calls)).not.toContain("gerant@exemple.test");
    journal.mockRestore();
  });
});
