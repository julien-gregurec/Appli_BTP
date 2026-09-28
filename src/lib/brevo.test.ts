import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // Ces cas décrivent le transport de PRODUCTION : hors Production, la garde des
  // destinataires s'applique d'abord (voir le bloc suivant).
  beforeEach(() => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
  });

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

  it("inclut htmlContent et attachment quand ils sont fournis", async () => {
    vi.stubEnv("BREVO_API_KEY", "clé-test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@elsatia.fr");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: "msg-456" }) });
    vi.stubGlobal("fetch", fetchMock);

    await envoyerEmailBrevo({
      to: "client@example.invalid",
      sujet: "Devis DEV-2026-0001",
      texte: "Bonjour",
      html: "<p>Bonjour</p>",
      piecesJointes: [{ nom: "devis-DEV-2026-0001.pdf", contenuBase64: "JVBERi0=" }],
    });

    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps.htmlContent).toBe("<p>Bonjour</p>");
    expect(corps.attachment).toEqual([{ name: "devis-DEV-2026-0001.pdf", content: "JVBERi0=" }]);
  });

  it("omet htmlContent et attachment quand ils ne sont pas fournis", async () => {
    vi.stubEnv("BREVO_API_KEY", "clé-test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@elsatia.fr");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: "msg-789" }) });
    vi.stubGlobal("fetch", fetchMock);

    await envoyerEmailBrevo({ to: "client@example.invalid", sujet: "Rappel", texte: "Bonjour" });

    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps.htmlContent).toBeUndefined();
    expect(corps.attachment).toBeUndefined();
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

describe("envoyerEmailBrevo hors Production", () => {
  beforeEach(() => {
    vi.stubEnv("BREVO_API_KEY", "clé-test");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "no-reply@elsatia.fr");
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "preview");
  });

  it("bloque un destinataire hors liste AVANT tout appel réseau", async () => {
    vi.stubEnv("EMAIL_PREVIEW_ALLOWLIST", "qa@elsatia.fr");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(envoyerEmailBrevo({ to: "vrai.client@example.com", sujet: "Facture", texte: "Bonjour" })).rejects.toThrow(
      "Envoi e-mail bloqué hors Production",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bloque tout le monde quand la liste est absente", async () => {
    vi.stubEnv("EMAIL_PREVIEW_ALLOWLIST", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(envoyerEmailBrevo({ to: "qa@elsatia.fr", sujet: "T", texte: "B" })).rejects.toThrow("bloqué");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sert un destinataire autorisé, avec objet préfixé et bannière", async () => {
    vi.stubEnv("EMAIL_PREVIEW_ALLOWLIST", "@elsatia.fr");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: "m" }) });
    vi.stubGlobal("fetch", fetchMock);
    await envoyerEmailBrevo({ to: "qa@elsatia.fr", sujet: "Facture F-1", texte: "Bonjour", html: "<html><body><p>x</p></body></html>" });
    const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corps.subject).toBe("[PREVIEW] Facture F-1");
    expect(corps.textContent).toContain("PREVIEW — e-mail émis depuis un environnement de test");
    expect(corps.htmlContent).toContain("data-elsatia-environnement");
  });

  it("une Preview Vercel qui hérite de ELSATIA_APPLICATION_ENV=production reste une Preview", async () => {
    vi.stubEnv("ELSATIA_APPLICATION_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_PREVIEW_ALLOWLIST", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(envoyerEmailBrevo({ to: "client@example.com", sujet: "T", texte: "B" })).rejects.toThrow("bloqué");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
