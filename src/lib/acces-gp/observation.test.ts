import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELAI_RETEST_RPC_ABSENTE_MS,
  DELAI_RPC_MS,
  NOM_EVENEMENT,
  categorieChemin,
  creerDeduplication,
  creerObservateurAccesGp,
  estRpcAbsente,
  hacherIdentifiant,
  type EntreeObservation,
  type RetourRpc,
} from "./observation";

const USER = "11111111-2222-4333-8444-555555555555";
const ENT = "e0000000-0000-4000-8000-0000000000aa";
const EMAIL = "jean.dupont@exemple.fr";

function banc(env: Record<string, string | undefined> = { ELSATIA_GP_ACCES_APP: "observe", ELSATIA_GP_ACCES_APP_ECHANTILLON: "1", ELSATIA_GP_ACCES_APP_SEL: "sel-de-test" }) {
  let t = 1_000_000;
  let alea = 0;
  const taches: Array<() => Promise<void>> = [];
  const lignes: Array<{ niveau: "warn" | "info"; ligne: string }> = [];
  const observateur = creerObservateurAccesGp({
    env: () => env,
    aleatoire: () => alea,
    maintenant: () => t,
    planifier: (tache) => void taches.push(tache),
    journal: { warn: (ligne) => lignes.push({ niveau: "warn", ligne }), info: (ligne) => lignes.push({ niveau: "info", ligne }) },
  });
  return {
    observateur,
    taches,
    lignes,
    json: () => lignes.map((l) => JSON.parse(l.ligne) as Record<string, unknown>),
    avancer: (ms: number) => void (t += ms),
    fixerAleatoire: (v: number) => void (alea = v),
    vider: async () => {
      while (taches.length) await taches.shift()!();
    },
  };
}

const retour = (data: unknown, error: RetourRpc["error"] = null): RetourRpc => ({ data, error });
const refus = (decision: string) => retour({ version: 1, decision, application_code: "gestion_pro", entreprise: null });
const autorise = (role = "gestion_pro_utilisateur") => retour({ version: 1, decision: "autorise", application_code: "gestion_pro", role_code: role, entreprise: null });

function entree(surcharge: Partial<EntreeObservation> = {}, rpc: (s: AbortSignal) => PromiseLike<RetourRpc> = async () => refus("sans_habilitation")): EntreeObservation {
  return {
    utilisateurId: USER,
    entrepriseId: ENT,
    chemin: `/devis/${"3f2c1a9e-1111-4222-8333-444455556666"}/edit`,
    publique: false,
    compteDepot: false,
    accesSupport: false,
    droitRequis: "acces_devis",
    droitAcces: true,
    appeler: rpc,
    ...surcharge,
  };
}

describe("observation — désactivée ou hors périmètre : zéro coût", () => {
  it.each([
    ["variable absente", { ELSATIA_GP_ACCES_APP: undefined }],
    ["off explicite", { ELSATIA_GP_ACCES_APP: "off" }],
    ["valeur inconnue", { ELSATIA_GP_ACCES_APP: "banana" }],
  ])("%s → ni tâche planifiée ni appel RPC", async (_n, env) => {
    const b = banc({ ...env, ELSATIA_GP_ACCES_APP_ECHANTILLON: "1" });
    const rpc = vi.fn(async () => refus("sans_habilitation"));
    b.observateur.observer(entree({}, rpc));
    await b.vider();
    expect(b.taches).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(b.json().filter((l) => l.type)).toHaveLength(0);
  });

  it.each([
    ["chemin public", { publique: true }],
    ["webhook", { chemin: "/api/stripe/webhook" }],
    ["onboarding", { chemin: "/onboarding" }],
    ["plateforme", { chemin: "/plateforme" }],
    ["Tools monétisation", { chemin: "/api/tools/monetization/apple" }],
    ["compte dépôt", { compteDepot: true }],
    ["session d'assistance", { accesSupport: true }],
    ["sans entreprise", { entrepriseId: null }],
  ])("exemption %s → aucun appel RPC", async (_n, surcharge) => {
    const b = banc();
    const rpc = vi.fn(async () => refus("sans_habilitation"));
    b.observateur.observer(entree(surcharge, rpc));
    await b.vider();
    expect(rpc).not.toHaveBeenCalled();
    expect(b.lignes).toHaveLength(0);
  });

  it("échantillonnage : on n'appelle la RPC que si aléatoire < échantillon", async () => {
    const b = banc({ ELSATIA_GP_ACCES_APP: "observe" }); // défaut 1 %
    const rpc = vi.fn(async () => refus("sans_habilitation"));
    b.fixerAleatoire(0.5);
    b.observateur.observer(entree({}, rpc));
    b.fixerAleatoire(0.0099);
    b.observateur.observer(entree({}, rpc));
    await b.vider();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("échantillon 0 : observation muette", async () => {
    const b = banc({ ELSATIA_GP_ACCES_APP: "observe", ELSATIA_GP_ACCES_APP_ECHANTILLON: "0" });
    const rpc = vi.fn(async () => refus("sans_habilitation"));
    b.observateur.observer(entree({}, rpc));
    await b.vider();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("observation — journal des écarts", () => {
  it("écart prouvé (poste OK, aucune habilitation) : une ligne JSON structurée en warn, sans PII", async () => {
    const b = banc();
    b.observateur.observer(entree({ chemin: `/devis/3f2c1a9e-1111-4222-8333-444455556666/edit?email=${EMAIL}` }));
    await b.vider();
    expect(b.lignes).toHaveLength(1);
    expect(b.lignes[0].niveau).toBe("warn");
    const ligne = b.lignes[0].ligne;
    expect(ligne).not.toContain("\n");
    const j = JSON.parse(ligne);
    expect(j).toMatchObject({
      evenement: NOM_EVENEMENT,
      version: 1,
      type: "gp_autorise_decision_refuse",
      gravite: "bloquant_si_enforcement",
      decision: "sans_habilitation",
      gp: "droit_poste_ok",
      droit_requis: "acces_devis",
      chemin: "/devis",
      echantillon: 1,
    });
    // PII : ni identifiants en clair, ni e-mail, ni identifiant de ressource.
    for (const interdit of [USER, ENT, EMAIL, "3f2c1a9e", "jean", "dupont"]) expect(ligne).not.toContain(interdit);
    expect(j.utilisateur).toMatch(/^[0-9a-f]{12}$/);
    expect(j.entreprise).toMatch(/^[0-9a-f]{12}$/);
    expect(j.utilisateur).toBe(await hacherIdentifiant(USER, "sel-de-test"));
    expect(typeof j.latence_ms).toBe("number");
  });

  it("concordance : info (pas warn) — on mesure aussi le taux de concordance", async () => {
    const b = banc();
    b.observateur.observer(entree({}, async () => autorise()));
    await b.vider();
    expect(b.lignes).toHaveLength(1);
    expect(b.lignes[0].niveau).toBe("info");
    expect(b.json()[0]).toMatchObject({ type: "concordant_autorise", decision: "autorise" });
  });

  it("concordant_refuse et gp_refuse_decision_autorise", async () => {
    const b = banc();
    b.observateur.observer(entree({ droitAcces: false, utilisateurId: "u1" }, async () => refus("sans_habilitation")));
    b.observateur.observer(entree({ droitAcces: false, utilisateurId: "u2" }, async () => autorise("gestion_pro_admin")));
    await b.vider();
    expect(b.json().map((l) => l.type)).toEqual(["concordant_refuse", "gp_refuse_decision_autorise"]);
    expect(b.lignes[1].niveau).toBe("warn");
  });

  it("le bypass administrateur plateforme n'est pas journalisé", async () => {
    const b = banc();
    b.observateur.observer(entree({ droitAcces: false }, async () => autorise("administrateur_plateforme_global")));
    await b.vider();
    expect(b.lignes).toHaveLength(0);
  });

  it("sans sel : identifiants tout de même hachés (jamais en clair)", async () => {
    const b = banc({ ELSATIA_GP_ACCES_APP: "observe", ELSATIA_GP_ACCES_APP_ECHANTILLON: "1" });
    b.observateur.observer(entree());
    await b.vider();
    const j = b.json()[0];
    expect(j.utilisateur).toBe(await hacherIdentifiant(USER, ""));
    expect(b.lignes[0].ligne).not.toContain(USER);
  });

  it("déduplication : une ligne par (utilisateur, type) et par fenêtre ; un autre type ou utilisateur repasse", async () => {
    const b = banc();
    for (let i = 0; i < 5; i++) b.observateur.observer(entree());
    await b.vider();
    expect(b.lignes).toHaveLength(1);
    b.observateur.observer(entree({ utilisateurId: "autre-utilisateur" }));
    b.observateur.observer(entree({}, async () => autorise())); // autre type pour le même utilisateur
    await b.vider();
    expect(b.lignes).toHaveLength(3);
    b.avancer(11 * 60 * 1000); // fenêtre écoulée
    b.observateur.observer(entree());
    await b.vider();
    expect(b.lignes).toHaveLength(4);
  });

  it("completer() : module non inclus connu tardivement → GP refuse, la comparaison suit", async () => {
    const b = banc();
    const h = b.observateur.observer(entree({}, async () => refus("application_non_incluse")));
    h.completer({ moduleInclus: false, abonnementStatut: "essai" });
    await b.vider();
    expect(b.json()[0]).toMatchObject({ type: "concordant_refuse", gp: "module_non_inclus" });
  });

  it("completer() : abonnement suspendu des deux côtés = concordant, pas un écart", async () => {
    const b = banc();
    const h = b.observateur.observer(entree({}, async () => refus("abonnement_suspendu")));
    h.completer({ moduleInclus: true, abonnementStatut: "suspendu" });
    await b.vider();
    expect(b.json()[0]).toMatchObject({ type: "concordant_refuse", decision: "abonnement_suspendu", gp: "abonnement_bloque" });
  });
});

describe("observation — ne bloque jamais, ne lève jamais", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("observer() est synchrone et retourne avant tout appel réseau (aucun await sur le chemin critique)", () => {
    const b = banc();
    const rpc = vi.fn(async () => refus("sans_habilitation"));
    const poignee = b.observateur.observer(entree({}, rpc));
    expect(rpc).not.toHaveBeenCalled(); // seulement planifié
    expect(b.taches).toHaveLength(1);
    expect(typeof poignee.completer).toBe("function");
  });

  it("RPC qui lève → decision_indisponible, aucune exception", async () => {
    const b = banc();
    b.observateur.observer(entree({}, () => { throw new Error("boom sync"); }));
    b.observateur.observer(entree({ utilisateurId: "u2" }, async () => { throw new Error("boom async"); }));
    await expect(b.vider()).resolves.toBeUndefined();
    expect(b.json().map((l) => [l.type, l.decision])).toEqual([
      ["decision_indisponible", "indisponible"],
      ["decision_indisponible", "indisponible"],
    ]);
  });

  it("RPC qui expire : abandon à 400 ms, signal interrompu, decision_indisponible", async () => {
    const b = banc();
    let signal: AbortSignal | undefined;
    b.observateur.observer(entree({}, (s) => { signal = s; return new Promise<RetourRpc>(() => {}); }));
    const fin = b.vider();
    await vi.advanceTimersByTimeAsync(DELAI_RPC_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await fin;
    expect(DELAI_RPC_MS).toBeLessThanOrEqual(400);
    expect(signal?.aborted).toBe(true);
    expect(b.json()[0]).toMatchObject({ type: "decision_indisponible" });
    expect(vi.getTimerCount()).toBe(0); // minuterie nettoyée
  });

  it("réponse malformée (fail-closed) : jamais « autorisé » par accident", async () => {
    const b = banc();
    b.observateur.observer(entree({}, async () => retour({ decision: "autorise" }))); // sans version
    b.observateur.observer(entree({ utilisateurId: "u2" }, async () => retour(true)));
    b.observateur.observer(entree({ utilisateurId: "u3" }, async () => retour(null)));
    await b.vider();
    expect(b.json().map((l) => l.type)).toEqual(["decision_indisponible", "decision_indisponible", "decision_indisponible"]);
  });

  it("erreur SQL quelconque (droit refusé, réseau) → decision_indisponible", async () => {
    const b = banc();
    b.observateur.observer(entree({}, async () => retour(null, { code: "42501", message: "permission denied" })));
    await b.vider();
    expect(b.json()[0]).toMatchObject({ type: "decision_indisponible" });
  });

  it.each([
    ["42883", "function public.decision_acces_application(text, uuid) does not exist"],
    ["PGRST202", "Could not find the function public.decision_acces_application"],
  ])("RPC absente (%s) : UN avertissement par processus, puis silence et plus aucun appel", async (code, message) => {
    const b = banc();
    const rpc = vi.fn(async () => retour(null, { code, message }));
    b.observateur.observer(entree({}, rpc));
    await b.vider();
    expect(b.lignes).toHaveLength(1);
    expect(b.lignes[0].niveau).toBe("warn");
    expect(b.json()[0]).toMatchObject({ niveau: "configuration" });
    for (let i = 0; i < 20; i++) b.observateur.observer(entree({ utilisateurId: `u${i}` }, rpc));
    await b.vider();
    expect(rpc).toHaveBeenCalledTimes(1); // plus aucun appel pendant la période de silence
    expect(b.lignes).toHaveLength(1); // et aucun nouvel avertissement
    // Après la période de re-test : on ré-essaie, sans re-avertir.
    b.avancer(DELAI_RETEST_RPC_ABSENTE_MS + 1);
    b.observateur.observer(entree({}, rpc));
    await b.vider();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(b.lignes).toHaveLength(1);
  });

  it("enforce : rétrogradé en observe, avertissement explicite émis UNE fois, et l'observation fonctionne", async () => {
    const b = banc({ ELSATIA_GP_ACCES_APP: "enforce", ELSATIA_GP_ACCES_APP_ECHANTILLON: "1" });
    b.observateur.observer(entree());
    b.observateur.observer(entree({ utilisateurId: "u2" }));
    await b.vider();
    const avert = b.json().filter((l) => l.niveau === "configuration");
    expect(avert).toHaveLength(1);
    expect(avert[0].message).toBe("enforcement non implémenté : qualification du backfill requise");
    expect(b.json().filter((l) => l.type)).toHaveLength(2); // observation active, mais rien n'est bloqué
  });

  it("dépendance défaillante (env qui lève, journal qui lève) : observer() ne lève jamais", () => {
    const o = creerObservateurAccesGp({
      env: () => { throw new Error("env"); },
      planifier: () => { throw new Error("planifier"); },
      journal: { warn: () => { throw new Error("journal"); }, info: () => { throw new Error("journal"); } },
    });
    expect(() => o.observer(entree())).not.toThrow();
    const o2 = creerObservateurAccesGp({
      env: () => ({ ELSATIA_GP_ACCES_APP: "observe", ELSATIA_GP_ACCES_APP_ECHANTILLON: "1" }),
      aleatoire: () => 0,
      planifier: () => { throw new Error("planifier"); },
      journal: { warn: () => { throw new Error("journal"); }, info: () => { throw new Error("journal"); } },
    });
    expect(() => o2.observer(entree())).not.toThrow();
  });

  it("journal qui lève dans la tâche : la tâche se termine sans rejet", async () => {
    const taches: Array<() => Promise<void>> = [];
    const o = creerObservateurAccesGp({
      env: () => ({ ELSATIA_GP_ACCES_APP: "observe", ELSATIA_GP_ACCES_APP_ECHANTILLON: "1" }),
      aleatoire: () => 0,
      planifier: (t) => void taches.push(t),
      journal: { warn: () => { throw new Error("journal"); }, info: () => { throw new Error("journal"); } },
    });
    o.observer(entree());
    await expect(taches[0]()).resolves.toBeUndefined();
  });
});

describe("utilitaires", () => {
  it("hacherIdentifiant : déterministe, 12 hex, dépend du sel, ne contient pas l'identifiant", async () => {
    const a = await hacherIdentifiant(USER, "s1");
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(await hacherIdentifiant(USER, "s1")).toBe(a);
    expect(await hacherIdentifiant(USER, "s2")).not.toBe(a);
    expect(await hacherIdentifiant("autre", "s1")).not.toBe(a);
    expect(a).not.toContain(USER.slice(0, 4));
  });

  it.each([
    ["/", "/"],
    ["/devis", "/devis"],
    ["/devis/3f2c1a9e-1111-4222-8333-444455556666/edit", "/devis"],
    ["/clients/12345", "/clients"],
    ["/api/employes/3f2c1a9e-1111-4222-8333-444455556666", "/api/employes"],
    ["/api/notes-frais", "/api/notes-frais"],
    ["/api/3f2c1a9e-1111-4222-8333-444455556666", "/api"],
    ["/devis?email=a@b.fr", "/devis"],
  ])("categorieChemin(%s) = %s", (chemin, attendu) => {
    expect(categorieChemin(chemin)).toBe(attendu);
  });

  it("creerDeduplication est bornée (jamais de fuite mémoire)", () => {
    const d = creerDeduplication({ fenetreMs: 1000, maxEntrees: 3 });
    for (let i = 0; i < 100; i++) d.premiereOccurrence(`k${i}`, 5000 + i);
    expect(d.taille()).toBeLessThanOrEqual(3);
    expect(d.premiereOccurrence("x", 10_000)).toBe(true);
    expect(d.premiereOccurrence("x", 10_500)).toBe(false);
    expect(d.premiereOccurrence("x", 11_001)).toBe(true);
  });

  it("estRpcAbsente", () => {
    expect(estRpcAbsente({ code: "42883" })).toBe(true);
    expect(estRpcAbsente({ code: "PGRST202" })).toBe(true);
    expect(estRpcAbsente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(estRpcAbsente(null)).toBe(false);
  });
});
