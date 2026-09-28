import { describe, expect, it } from "vitest";
import { lireDemandeBascule, lireDemandeStatut, messageRefusConsole } from "./console";

const form = (valeurs: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valeurs)) f.set(k, v);
  return f;
};
const BASE = { portee: "reserves", controle: "app_coupee", actif: "true", motif: "INC-42 fuite suspectée" };

describe("lireDemandeBascule", () => {
  it("accepte une demande complète", () => {
    expect(lireDemandeBascule(form({ ...BASE, incident_ref: "INC-42", expire_minutes: "30" }))).toEqual({
      ok: true,
      demande: { portee: "reserves", controle: "app_coupee", actif: true, motif: "INC-42 fuite suspectée", incidentRef: "INC-42", expireDansMinutes: 30 },
    });
  });
  it.each([
    [{ portee: "tout" }, "Portée inconnue"],
    [{ controle: "drop_database" }, "Contrôle inconnu"],
    [{ actif: "peut-être" }, "Action inconnue"],
    [{ motif: "court" }, "Motif obligatoire"],
    [{ expire_minutes: "0" }, "Expiration"],
    [{ expire_minutes: "99999" }, "Expiration"],
    [{ controle: "reconciliation_stripe_requise" }, "verrou global"],
  ])("refuse %j", (surcharge, attendu) => {
    const r = lireDemandeBascule(form({ ...BASE, ...surcharge }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain(attendu);
  });
});

describe("lireDemandeStatut", () => {
  it("valide service, statut et motif", () => {
    expect(lireDemandeStatut(form({ service: "db", statut: "DEGRADED", message_public: "", motif: "latence Supabase" }))).toMatchObject({
      ok: true, service: "db", statut: "DEGRADED", message: null,
    });
    expect(lireDemandeStatut(form({ service: "db", statut: "KO", motif: "latence Supabase" })).ok).toBe(false);
    expect(lireDemandeStatut(form({ service: "mainframe", statut: "OUTAGE", motif: "latence Supabase" })).ok).toBe(false);
    expect(lireDemandeStatut(form({ service: "db", statut: "OUTAGE", message_public: "x".repeat(281), motif: "latence Supabase" })).ok).toBe(false);
  });
});

describe("messageRefusConsole", () => {
  it("explique le verrou de réconciliation Stripe", () => {
    expect(messageRefusConsole({ code: "42501", hint: "ELSATIA_RECONCILIATION_STRIPE_REQUISE" })).toContain("réconciliation Stripe");
  });
  it("explique le refus RBAC sans exposer le texte SQL", () => {
    const m = messageRefusConsole({ code: "42501", message: "Action réservée aux rôles total (votre rôle : support)" });
    expect(m).toContain("total");
    expect(m).not.toContain("votre rôle");
    expect(messageRefusConsole({ message: "Authentification forte AAL2 requise" })).toContain("AAL2");
  });
});
