import { describe, expect, it } from "vitest";
import { politiquesRateLimitPour } from "./rate-limit";

describe("politiques de rate limiting", () => {
  it("protège fortement les actions publiques d'authentification", () => {
    expect(politiquesRateLimitPour("/login", "POST", false)).toMatchObject([
      { cle: "auth:login", maximum: 10, fenetreSecondes: 600, portee: "ip" },
    ]);
    expect(politiquesRateLimitPour("/signup", "POST", false)[0]?.maximum).toBe(5);
    expect(politiquesRateLimitPour("/mot-de-passe-oublie", "POST", false)[0]?.maximum).toBe(5);
  });

  it("limite le référentiel véhicule, l'assistant et les exports", () => {
    expect(politiquesRateLimitPour("/api/referentiels/vehicules", "GET", true)[0]?.maximum).toBe(10);
    expect(politiquesRateLimitPour("/api/assistant/chat", "POST", true)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ portee: "utilisateur", maximum: 20 }),
        expect.objectContaining({ portee: "entreprise", maximum: 100 }),
      ]),
    );
    expect(politiquesRateLimitPour("/api/exports/comptabilite", "GET", true)[0]).toMatchObject({
      portee: "utilisateur",
      maximum: 10,
    });
  });

  it("applique un plafond par défaut à toute API authentifiée", () => {
    expect(politiquesRateLimitPour("/api/identification/123/qr", "GET", true)[0]).toMatchObject({
      cle: "api:authenticated",
      maximum: 120,
      portee: "utilisateur",
    });
  });

  it("protège les intégrations publiques et téléchargements signés", () => {
    expect(politiquesRateLimitPour("/api/paie/import", "POST", false)[0]).toMatchObject({
      cle: "api:payroll-import",
      portee: "ip",
    });
    expect(politiquesRateLimitPour("/api/cron/notifications-push", "POST", false)[0]?.maximum).toBe(60);
    expect(politiquesRateLimitPour("/api/documents/123", "GET", true)[0]).toMatchObject({
      cle: "api:signed-downloads",
      maximum: 60,
    });
  });
});
