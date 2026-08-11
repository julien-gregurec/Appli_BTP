import { afterEach, describe, expect, it, vi } from "vitest";
import { brevoEstConfigure, envoyerEmailBrevo } from "./brevo";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("brevoEstConfigure", () => {
  it("est faux si BREVO_API_KEY est absente", () => {
    expect(brevoEstConfigure({ NODE_ENV: "test", EMAIL_FROM_ADDRESS: "no-reply@elsatia.fr" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("est faux si EMAIL_FROM_ADDRESS est absente", () => {
    expect(brevoEstConfigure({ NODE_ENV: "test", BREVO_API_KEY: "test-key" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("est vrai si les deux variables sont présentes", () => {
    expect(brevoEstConfigure({ NODE_ENV: "test", BREVO_API_KEY: "test-key", EMAIL_FROM_ADDRESS: "no-reply@elsatia.fr" } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe("envoyerEmailBrevo", () => {
  it("échoue explicitement si Brevo n'est pas configuré", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "");
    await expect(envoyerEmailBrevo({ to: "client@example.invalid", sujet: "Test", texte: "Bonjour" })).rejects.toThrow(
      "Envoi email indisponible : Brevo n'est pas configuré",
    );
  });

  it("appelle l'API Brevo avec le bon corps et les bons en-têtes", async () => {
    vi.stubEnv("BREVO_API_KEY", "clé-test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@elsatia.fr");
    vi.stubEnv("EMAIL_FROM_NAME", "ELSATIA");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: "msg-123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const resultat = await envoyerEmailBrevo({ to: "client@example.invalid", toName: "Client Test", sujet: "Rappel", texte: "Bonjour" });

    expect(resultat).toEqual({ messageId: "msg-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "clé-test" }),
      }),
    );
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps).toMatchObject({
      sender: { name: "ELSATIA", email: "no-reply@elsatia.fr" },
      to: [{ email: "client@example.invalid", name: "Client Test" }],
      subject: "Rappel",
      textContent: "Bonjour",
    });
  });

  it("lève une erreur générique sans exposer le corps de la réponse Brevo en cas d'échec", async () => {
    vi.stubEnv("BREVO_API_KEY", "clé-test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@elsatia.fr");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "détail sensible" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(envoyerEmailBrevo({ to: "client@example.invalid", sujet: "Rappel", texte: "Bonjour" })).rejects.toThrow(
      "Envoi email impossible (Brevo a répondu 401)",
    );
  });
});
