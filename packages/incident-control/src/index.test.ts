import { describe, expect, it, vi } from "vitest";
import {
  analyserEtatIncident,
  chargeurPostgrest,
  codeHttpSante,
  codeIncidentDepuisErreur,
  controleActif,
  creerGardeProxy,
  creerLecteurEtatIncident,
  decisionIncident,
  evaluerSante,
  REGLES_PAR_APPLICATION,
  reponseIncident,
  type ApplicationIncident,
  type ControleIncident,
  type EtatIncident,
  type PorteeIncident,
} from "./index";

const etat = (...controles: Array<[PorteeIncident, ControleIncident]>): EtatIncident => ({
  generation: 1,
  controles: controles.map(([portee, controle]) => ({ portee, controle })),
  statuts: {},
});

const decide = (app: ApplicationIncident, methode: string, chemin: string, e: EtatIncident | null, estServerAction = false) =>
  decisionIncident({ app, methode, chemin, etat: e, estServerAction });

describe("analyserEtatIncident", () => {
  it("accepte la forme publique et ignore toute valeur inconnue", () => {
    const e = analyserEtatIncident({
      version: 1,
      generation: 42,
      controles: [
        { portee: "global", controle: "lecture_seule" },
        { portee: "planete", controle: "lecture_seule" },
        { portee: "reserves", controle: "effacer_tout" },
        null,
      ],
      statuts: { db: { statut: "DEGRADED", message: "x" }, auth: { statut: "PANIQUE" }, "../x": { statut: "OUTAGE" } },
    });
    expect(e).toEqual({
      generation: 42,
      controles: [{ portee: "global", controle: "lecture_seule" }],
      statuts: { db: { statut: "DEGRADED", message: "x" } },
    });
  });

  it("rend null pour une forme illisible (état inconnu, jamais interprété)", () => {
    expect(analyserEtatIncident(null)).toBeNull();
    expect(analyserEtatIncident("coupe")).toBeNull();
    expect(analyserEtatIncident([])).toBeNull();
    expect(analyserEtatIncident({ controles: "tout" })).toBeNull();
  });

  it("tronque un message public trop long", () => {
    const e = analyserEtatIncident({ controles: [], statuts: { db: { statut: "OUTAGE", message: "a".repeat(1000) } } });
    expect(e?.statuts.db.message).toHaveLength(280);
  });
});

describe("controleActif", () => {
  it("la portée globale s'applique à toutes les applications, une portée d'app à elle seule", () => {
    const e = etat(["global", "exports"], ["reserves", "uploads"]);
    for (const app of ["gestion_pro", "reserves", "tools", "colors", "studio"] as const) {
      expect(controleActif(e, app, "exports")).toBe(true);
      expect(controleActif(e, app, "uploads")).toBe(app === "reserves");
    }
  });
});

describe("decisionIncident — état nominal ou inconnu", () => {
  it("ne bloque rien sans contrôle actif", () => {
    expect(decide("gestion_pro", "POST", "/api/exports/comptabilite", etat())).toEqual({ action: "continuer" });
  });
  it("fail-open sur état inconnu : la base reste l'autorité, le proxy n'ajoute pas de panne", () => {
    expect(decide("gestion_pro", "POST", "/api/notes-frais/upload", null)).toEqual({ action: "continuer" });
  });
});

describe("decisionIncident — coupure d'application (isolation)", () => {
  const coupeReserves = etat(["reserves", "app_coupee"]);

  it("coupe Réserves sans toucher Gestion Pro, Colors ni Studio", () => {
    expect(decide("reserves", "GET", "/dashboard", coupeReserves)).toMatchObject({ action: "bloquer", code: "SAFE_MODE_APP_OFF" });
    expect(decide("gestion_pro", "GET", "/dashboard", coupeReserves)).toEqual({ action: "continuer" });
    expect(decide("colors", "GET", "/inventaire", coupeReserves)).toEqual({ action: "continuer" });
    expect(decide("studio", "GET", "/projects", coupeReserves)).toEqual({ action: "continuer" });
  });

  it("garde la santé, le statut et la connexion ouverts", () => {
    expect(decide("reserves", "GET", "/api/health", coupeReserves)).toEqual({ action: "continuer" });
    expect(decide("reserves", "GET", "/api/status", coupeReserves)).toEqual({ action: "continuer" });
    expect(decide("reserves", "GET", "/login", coupeReserves)).toEqual({ action: "continuer" });
  });

  it("coupure globale : la console plateforme reste accessible pour rouvrir", () => {
    const tout = etat(["global", "app_coupee"]);
    expect(decide("gestion_pro", "GET", "/plateforme/incident", tout)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/plateforme/incident", tout, true)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "GET", "/dashboard", tout)).toMatchObject({ code: "SAFE_MODE_APP_OFF" });
    expect(decide("gestion_pro", "GET", "/plateformex", tout)).toMatchObject({ code: "SAFE_MODE_APP_OFF" });
  });

  it("coupure : les webhooks Stripe restent reçus (réconciliation avant réouverture)", () => {
    const tout = etat(["global", "app_coupee"], ["global", "reconciliation_stripe_requise"]);
    expect(decide("gestion_pro", "POST", "/api/stripe/abonnement/webhook", tout)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/api/tools/monetization/stripe/webhook", tout)).toEqual({ action: "continuer" });
  });
});

describe("decisionIncident — lecture seule", () => {
  const ro = etat(["global", "lecture_seule"]);

  it("les lectures passent, les mutations d'API sont refusées en 503", () => {
    expect(decide("gestion_pro", "GET", "/chantiers", ro)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "GET", "/api/documents/abc", ro)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/api/inventaires/1/cloture", ro)).toMatchObject({ statut: 503, code: "SAFE_MODE_READ_ONLY" });
    expect(decide("reserves", "POST", "/api/offline/mutations", ro)).toMatchObject({ code: "SAFE_MODE_READ_ONLY" });
  });

  it("webhooks refusés en 503 pour que Stripe les REJOUE (aucun traitement à moitié)", () => {
    const d = decide("gestion_pro", "POST", "/api/stripe/webhook", ro);
    expect(d).toMatchObject({ code: "SAFE_MODE_READ_ONLY", statut: 503 });
    expect(d.action === "bloquer" && d.reessayerApres).toBeGreaterThan(0);
  });

  it("les Server Actions passent (déconnexion) : la base refuse leurs écritures", () => {
    expect(decide("gestion_pro", "POST", "/chantiers", ro, true)).toEqual({ action: "continuer" });
  });

  it("connexion et plateforme restent utilisables", () => {
    expect(decide("gestion_pro", "POST", "/login", ro, true)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/api/auth/mfa/unenroll", ro)).toEqual({ action: "continuer" });
  });

  it("lecture seule Gestion Pro n'affecte pas Réserves", () => {
    const roGp = etat(["gestion_pro", "lecture_seule"]);
    expect(decide("reserves", "POST", "/api/offline/mutations", roGp)).toEqual({ action: "continuer" });
  });

  it("implique paiements et uploads suspendus", () => {
    expect(decide("gestion_pro", "GET", "/paiement/abc", ro)).toMatchObject({ code: "SAFE_MODE_PAYMENTS_OFF" });
    expect(decide("colors", "POST", "/api/photos", ro)).toMatchObject({ code: "SAFE_MODE_READ_ONLY" });
  });
});

describe("decisionIncident — fonctions ciblées", () => {
  it("uploads : seules les mutations des routes de dépôt sont refusées", () => {
    const e = etat(["gestion_pro", "uploads"]);
    expect(decide("gestion_pro", "POST", "/api/notes-frais/upload", e)).toMatchObject({ code: "SAFE_MODE_UPLOADS_OFF" });
    expect(decide("gestion_pro", "POST", "/api/devis/123/pieces-jointes/preparer", e)).toMatchObject({ code: "SAFE_MODE_UPLOADS_OFF" });
    expect(decide("gestion_pro", "GET", "/api/devis/pieces-jointes/123", e)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/api/inventaires/1/cloture", e)).toEqual({ action: "continuer" });
  });

  it("exports : toutes méthodes, sans toucher aux liens publics", () => {
    const e = etat(["gestion_pro", "exports"]);
    for (const chemin of [
      "/api/exports/comptabilite",
      "/api/notes-frais/exports/1",
      "/api/paie/periodes/9/export",
      "/api/rgpd/export",
      "/api/documents/factures/1/pdf",
      "/imprimer/devis/1",
      "/plateforme/entreprises/export",
    ]) {
      expect(decide("gestion_pro", "GET", chemin, e), chemin).toMatchObject({ code: "SAFE_MODE_EXPORTS_OFF" });
    }
    expect(decide("gestion_pro", "GET", "/imprimer/partage/tok", e)).toEqual({ action: "continuer" });
    expect(decide("reserves", "GET", "/api/documents/chantier/1/pdf", etat(["reserves", "exports"]))).toMatchObject({ code: "SAFE_MODE_EXPORTS_OFF" });
    expect(decide("colors", "GET", "/api/export/inventaire", etat(["global", "exports"]))).toMatchObject({ code: "SAFE_MODE_EXPORTS_OFF" });
  });

  it("paiements : checkout bloqué, webhooks toujours reçus", () => {
    const e = etat(["global", "paiements"]);
    expect(decide("gestion_pro", "POST", "/api/tools/monetization/checkout", e)).toMatchObject({ code: "SAFE_MODE_PAYMENTS_OFF" });
    expect(decide("gestion_pro", "GET", "/paiement/xyz", e)).toMatchObject({ code: "SAFE_MODE_PAYMENTS_OFF" });
    expect(decide("gestion_pro", "POST", "/api/stripe/abonnement/webhook", e)).toEqual({ action: "continuer" });
  });

  it("liens publics : partage bloqué, application interne intacte", () => {
    const e = etat(["gestion_pro", "liens_publics"]);
    expect(decide("gestion_pro", "GET", "/document/tok", e)).toMatchObject({ code: "SAFE_MODE_PUBLIC_LINKS_OFF" });
    expect(decide("gestion_pro", "GET", "/api/documents/partage/tok/pdf", e)).toMatchObject({ code: "SAFE_MODE_PUBLIC_LINKS_OFF" });
    expect(decide("gestion_pro", "GET", "/imprimer/partage/tok", e)).toMatchObject({ code: "SAFE_MODE_PUBLIC_LINKS_OFF" });
    expect(decide("gestion_pro", "GET", "/documents", e)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "GET", "/documentation", e)).toEqual({ action: "continuer" });
  });

  it("invitations : acceptation bloquée (toutes méthodes), gestion bloquée en mutation", () => {
    const e = etat(["reserves", "invitations"]);
    expect(decide("reserves", "GET", "/invitation/tok", e)).toMatchObject({ code: "SAFE_MODE_INVITATIONS_OFF" });
    expect(decide("reserves", "POST", "/intervenants", e, true)).toMatchObject({ code: "SAFE_MODE_INVITATIONS_OFF" });
    expect(decide("reserves", "GET", "/intervenants", e)).toEqual({ action: "continuer" });
    expect(decide("gestion_pro", "POST", "/parametres/acces", etat(["global", "invitations"]), true)).toMatchObject({
      code: "SAFE_MODE_INVITATIONS_OFF",
    });
  });

  it("chaque application déclare des règles (Tools : garde en base uniquement, documenté)", () => {
    expect(Object.keys(REGLES_PAR_APPLICATION).sort()).toEqual(["colors", "gestion_pro", "reserves", "studio", "tools"]);
    for (const [app, regles] of Object.entries(REGLES_PAR_APPLICATION)) {
      if (app === "tools") continue;
      expect(regles.toujoursOuverts.length, app).toBeGreaterThan(0);
    }
  });
});

describe("reponseIncident", () => {
  const d = decide("gestion_pro", "GET", "/document/x", etat(["global", "liens_publics"]));
  if (d.action !== "bloquer") throw new Error("attendu : bloquer");

  it("JSON pour l'API, avec Retry-After et code stable, sans cache", () => {
    const r = reponseIncident(d, false);
    expect(r.statut).toBe(503);
    expect(JSON.parse(r.corps)).toEqual({ error: d.message, code: "SAFE_MODE_PUBLIC_LINKS_OFF" });
    expect(r.entetes["Retry-After"]).toBe("120");
    expect(r.entetes["Cache-Control"]).toBe("no-store");
  });

  it("HTML échappé pour un navigateur", () => {
    const r = reponseIncident({ ...d, message: "<script>x</script>" }, true);
    expect(r.corps).not.toContain("<script>x");
    expect(r.entetes["Content-Type"]).toContain("text/html");
  });
});

describe("creerLecteurEtatIncident", () => {
  it("met en cache pendant le TTL puis relit (propagation bornée)", async () => {
    let t = 0;
    const charger = vi.fn().mockResolvedValue({ controles: [] });
    const lecteur = creerLecteurEtatIncident({ charger, ttlMs: 10_000, maintenant: () => t });
    await lecteur.lire();
    t = 9_999;
    await lecteur.lire();
    expect(charger).toHaveBeenCalledTimes(1);
    t = 10_000;
    await lecteur.lire();
    expect(charger).toHaveBeenCalledTimes(2);
  });

  it("base en panne : garde la dernière valeur connue (une coupure ne se lève pas toute seule)", async () => {
    let t = 0;
    const charger = vi
      .fn()
      .mockResolvedValueOnce({ controles: [{ portee: "global", controle: "app_coupee" }] })
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const lecteur = creerLecteurEtatIncident({ charger, ttlMs: 10_000, perimeMs: 300_000, maintenant: () => t });
    expect((await lecteur.lire())?.controles).toHaveLength(1);
    t = 60_000;
    expect((await lecteur.lire())?.controles).toHaveLength(1);
    t = 400_000;
    expect(await lecteur.lire()).toBeNull();
  });

  it("ne martèle pas une base en panne (≤ 1 tentative / seconde) et partage l'appel en cours", async () => {
    let t = 0;
    const charger = vi.fn().mockRejectedValue(new Error("down"));
    const lecteur = creerLecteurEtatIncident({ charger, maintenant: () => t });
    await Promise.all([lecteur.lire(), lecteur.lire(), lecteur.lire()]);
    await lecteur.lire();
    expect(charger).toHaveBeenCalledTimes(1);
    t = 1_000;
    await lecteur.lire();
    expect(charger).toHaveBeenCalledTimes(2);
  });

  it("réponse illisible = état inconnu", async () => {
    const lecteur = creerLecteurEtatIncident({ charger: async () => ({ pirate: true }) });
    expect(await lecteur.lire()).toBeNull();
  });
});

describe("chargeurPostgrest", () => {
  it("n'utilise que la clé publique et l'RPC publique", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ controles: [] }), { status: 200 }));
    await chargeurPostgrest({ urlSupabase: "https://x.supabase.co/", clePublique: "pk", fetchImpl })();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/incident_etat_public");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ apikey: "pk", Authorization: "Bearer pk", "Content-Type": "application/json" });
  });
  it("échoue explicitement sur HTTP non 2xx (le lecteur se replie)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("x", { status: 503 }));
    await expect(chargeurPostgrest({ urlSupabase: "https://x", clePublique: "pk", fetchImpl })()).rejects.toThrow("503");
  });
});

describe("codeIncidentDepuisErreur", () => {
  it("reconnaît les indices de la base", () => {
    expect(codeIncidentDepuisErreur({ hint: "SAFE_MODE_READ_ONLY" })).toBe("SAFE_MODE_READ_ONLY");
    expect(codeIncidentDepuisErreur({ hint: "SAFE_MODE_APP_OFF" })).toBe("SAFE_MODE_APP_OFF");
    expect(codeIncidentDepuisErreur({ hint: "SAFE_MODE_PUBLIC_LINKS_OFF" })).toBe("SAFE_MODE_PUBLIC_LINKS_OFF");
    expect(codeIncidentDepuisErreur({ code: "PT503" })).toBe("SAFE_MODE_READ_ONLY");
    expect(codeIncidentDepuisErreur({ code: "42501", hint: "RESERVES_HOTE_SUSPENDU" })).toBeNull();
    expect(codeIncidentDepuisErreur(null)).toBeNull();
  });
});

describe("evaluerSante", () => {
  const ok = (nom: string, critique = true) => ({ nom, critique, executer: async () => "ok" as const });

  it("OPERATIONAL quand tout répond", async () => {
    const r = await evaluerSante({ app: "gestion_pro", etat: etat(), controles: [ok("db"), ok("auth")] });
    expect(r.statut).toBe("OPERATIONAL");
    expect(codeHttpSante(r)).toBe(200);
  });

  it("critique en échec → OUTAGE (503) ; non critique → DEGRADED (200)", async () => {
    const ko = { nom: "db", critique: true, executer: async () => { throw new Error("password authentication failed for user postgres at db.secret.internal"); } };
    const lent = { nom: "email", critique: false, executer: () => new Promise<"ok">(() => {}) };
    const journal = vi.fn();
    const r = await evaluerSante({ app: "gestion_pro", etat: etat(), controles: [ko, ok("auth")], journaliser: journal });
    expect(r.statut).toBe("OUTAGE");
    expect(codeHttpSante(r)).toBe(503);
    const r2 = await evaluerSante({ app: "gestion_pro", etat: etat(), controles: [lent, ok("db")], delaiMs: 20 });
    expect(r2).toMatchObject({ statut: "DEGRADED", controles: { email: "ko", db: "ok" } });
    expect(journal).toHaveBeenCalledWith("db", expect.any(Error));
  });

  it("la réponse publique ne contient jamais le message d'erreur ni aucun secret", async () => {
    const secret = "sk_live_TOPSECRET postgres://u:p@h";
    const r = await evaluerSante({
      app: "gestion_pro",
      etat: etat(),
      controles: [{ nom: "stripe", critique: false, executer: async () => { throw new Error(secret); } }],
    });
    expect(JSON.stringify(r)).not.toContain("TOPSECRET");
    expect(JSON.stringify(r)).not.toContain("postgres://");
  });

  it("reflète le mode sûr : lecture seule → READ_ONLY, coupure → OUTAGE", async () => {
    const ro = await evaluerSante({ app: "reserves", etat: etat(["global", "lecture_seule"]), controles: [ok("db")] });
    expect(ro).toMatchObject({ statut: "READ_ONLY", mode_sur: { lecture_seule: true, application_coupee: false } });
    const off = await evaluerSante({ app: "reserves", etat: etat(["reserves", "app_coupee"]), controles: [ok("db")] });
    expect(off.statut).toBe("OUTAGE");
    const autre = await evaluerSante({ app: "colors", etat: etat(["reserves", "app_coupee"]), controles: [ok("db")] });
    expect(autre.statut).toBe("OPERATIONAL");
  });

  it("non_configure ne dégrade pas le statut (ex. e-mail absent en local)", async () => {
    const r = await evaluerSante({
      app: "gestion_pro",
      etat: null,
      controles: [ok("db"), { nom: "email", critique: false, executer: async () => "non_configure" as const }],
    });
    expect(r.statut).toBe("OPERATIONAL");
  });
});

describe("creerGardeProxy", () => {
  it("rend une réponse 503 pour l'application concernée seulement", async () => {
    const lecteur = { lire: async () => etat(["reserves", "app_coupee"]), invalider() {} };
    const reserves = creerGardeProxy({ app: "reserves", urlSupabase: "https://x", clePublique: "pk", lecteur });
    const colors = creerGardeProxy({ app: "colors", urlSupabase: "https://x", clePublique: "pk", lecteur });
    const r = await reserves({ chemin: "/dashboard", methode: "GET", entetes: new Headers({ accept: "text/html" }) });
    expect(r?.statut).toBe(503);
    expect(r?.entetes["Content-Type"]).toContain("text/html");
    expect(await colors({ chemin: "/dashboard", methode: "GET", entetes: new Headers() })).toBeNull();
  });
  it("sans configuration Supabase : aucun blocage, aucun appel réseau", async () => {
    const garde = creerGardeProxy({ app: "reserves", urlSupabase: undefined, clePublique: undefined });
    expect(await garde({ chemin: "/api/offline/photo", methode: "POST", entetes: new Headers() })).toBeNull();
  });
});
