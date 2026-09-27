import { describe, expect, it } from "vitest";
import {
  copierPlans,
  lireEtatReserves,
  lireRapportSynchronisation,
  messageErreurSynchronisation,
  messageSynchronisation,
  synchroniserChantierReserves,
  urlChantierReserves,
  type ClientReservesGp,
} from "./reserves-gp";

const rapportBrut = {
  chantier_reserves_id: "rc-1",
  cree: true,
  rattache: false,
  champs_conserves: [],
  entreprises: { creees: 2, mises_a_jour: 0, rattachees: 0, inchangees: 0, autorise: true },
  contacts: { crees: 5, mis_a_jour: 0, inchanges: 0, autorise: true },
  plans: { crees: 2, a_jour: 0, mis_a_jour: 0, conflits: 0, autorise: true },
  plans_a_copier: [
    { plan_id: "p1", source_chemin: "ent/ch/rdc.pdf", destination_chemin: "ent/rc-1/p1/a.pdf", mime_type: "application/pdf" },
    { plan_id: "p2", source_chemin: "ent/ch/etage.png", destination_chemin: "ent/rc-1/p2/b.png", mime_type: "image/png" },
  ],
};

type Appel = { type: string; args: unknown[] };

function faux(options: {
  rpc?: (fn: string, params: Record<string, unknown>) => { data: unknown; error: { message: string } | null };
  download?: (chemin: string) => { data: Blob | null; error: { message: string } | null };
  upload?: (chemin: string) => { data: unknown; error: { message: string } | null };
} = {}) {
  const appels: Appel[] = [];
  const client: ClientReservesGp = {
    rpc: async (fn, params) => {
      appels.push({ type: `rpc:${fn}`, args: [params] });
      return options.rpc?.(fn, params) ?? { data: fn === "reserves_synchroniser_chantier_gp" ? rapportBrut : { remplace: true }, error: null };
    },
    storage: {
      from: (bucket) => ({
        download: async (chemin) => {
          appels.push({ type: `download:${bucket}`, args: [chemin] });
          return options.download?.(chemin) ?? { data: new Blob(["%PDF"]), error: null };
        },
        upload: async (chemin, _fichier, opts) => {
          appels.push({ type: `upload:${bucket}`, args: [chemin, opts] });
          return options.upload?.(chemin) ?? { data: {}, error: null };
        },
      }),
    },
  };
  return { client, appels };
}

describe("lireEtatReserves", () => {
  it("null quand la base ne rend pas de bloc (pas d'entitlement, pas de rôle, pas d'accès GP)", () => {
    expect(lireEtatReserves(null)).toBeNull();
    expect(lireEtatReserves([])).toBeNull();
    expect(lireEtatReserves("x")).toBeNull();
  });
  it("chantier non suivi : propose l'action selon le droit", () => {
    expect(lireEtatReserves({ lie: false, chantier_reserves_id: null, peut_synchroniser: true })).toEqual({ lie: false, peutSynchroniser: true });
    expect(lireEtatReserves({ lie: false, peut_synchroniser: false })).toEqual({ lie: false, peutSynchroniser: false });
  });
  it("chantier suivi : compteurs normalisés", () => {
    expect(lireEtatReserves({
      lie: true, chantier_reserves_id: "rc", peut_synchroniser: false, total: 7, ouvertes: 1, en_cours: 3,
      attente_levee: 2, levees: 1, en_retard: "2", plans_maj_disponible: 1, synchronise_at: "2026-09-27T10:00:00Z",
    })).toEqual({
      lie: true, chantierReservesId: "rc", peutSynchroniser: false, total: 7, ouvertes: 1, enCours: 3,
      attenteLevee: 2, levees: 1, enRetard: 2, plansMajDisponible: 1, synchroniseAt: "2026-09-27T10:00:00Z",
    });
  });
  it("valeurs invalides ramenées à zéro, jamais négatives", () => {
    const etat = lireEtatReserves({ lie: true, chantier_reserves_id: "rc", total: -3, ouvertes: "abc" });
    expect(etat).toMatchObject({ total: 0, ouvertes: 0 });
  });
});

describe("lireRapportSynchronisation", () => {
  it("lit le rapport et les copies à effectuer", () => {
    const r = lireRapportSynchronisation(rapportBrut);
    expect(r.chantierReservesId).toBe("rc-1");
    expect(r.plansACopier).toHaveLength(2);
    expect(r.entreprises.creees).toBe(2);
  });
  it("rejette une réponse sans chantier", () => {
    expect(() => lireRapportSynchronisation({})).toThrow();
  });
  it("ignore une copie mal formée", () => {
    expect(lireRapportSynchronisation({ ...rapportBrut, plans_a_copier: [{ plan_id: 1 }] }).plansACopier).toEqual([]);
  });
});

describe("copierPlans", () => {
  it("lit dans le bucket GP, dépose dans le bucket Réserves sans écraser, puis confirme", async () => {
    const { client, appels } = faux();
    const resultat = await copierPlans(client, lireRapportSynchronisation(rapportBrut).plansACopier);
    expect(resultat).toEqual({ reussies: 2, echecs: [] });
    expect(appels.map((a) => a.type)).toEqual([
      "download:chantier-documents", "upload:reserves-plans", "rpc:reserves_confirmer_plan_gp",
      "download:chantier-documents", "upload:reserves-plans", "rpc:reserves_confirmer_plan_gp",
    ]);
    expect(appels[1].args).toEqual(["ent/rc-1/p1/a.pdf", { contentType: "application/pdf", upsert: false }]);
  });
  it("reprise : un objet déjà déposé est confirmé, pas redéposé", async () => {
    const { client, appels } = faux({ upload: () => ({ data: null, error: { message: "The resource already exists" } }) });
    const resultat = await copierPlans(client, lireRapportSynchronisation(rapportBrut).plansACopier);
    expect(resultat.reussies).toBe(2);
    expect(appels.filter((a) => a.type === "rpc:reserves_confirmer_plan_gp")).toHaveLength(2);
  });
  it("un plan illisible (audience GP) n'est ni déposé ni confirmé, les autres passent", async () => {
    const { client, appels } = faux({ download: (c) => (c.endsWith("rdc.pdf") ? { data: null, error: { message: "Object not found" } } : { data: new Blob(["x"]), error: null }) });
    const resultat = await copierPlans(client, lireRapportSynchronisation(rapportBrut).plansACopier);
    expect(resultat).toEqual({ reussies: 1, echecs: ["p1"] });
    expect(appels.filter((a) => a.type === "upload:reserves-plans")).toHaveLength(1);
  });
  it("dépôt refusé par la policy : échec signalé, pas de confirmation", async () => {
    const { client, appels } = faux({ upload: () => ({ data: null, error: { message: "new row violates row-level security policy" } }) });
    const resultat = await copierPlans(client, lireRapportSynchronisation(rapportBrut).plansACopier);
    expect(resultat.echecs).toEqual(["p1", "p2"]);
    expect(appels.some((a) => a.type === "rpc:reserves_confirmer_plan_gp")).toBe(false);
  });
});

describe("synchroniserChantierReserves", () => {
  it("appelle la RPC avec le chantier GP puis copie les plans", async () => {
    const { client, appels } = faux();
    const { rapport, copies } = await synchroniserChantierReserves(client, "gp-1");
    expect(appels[0]).toEqual({ type: "rpc:reserves_synchroniser_chantier_gp", args: [{ p_chantier_gp_id: "gp-1" }] });
    expect(rapport.cree).toBe(true);
    expect(copies.reussies).toBe(2);
  });
  it("propage le refus de la base sans rien copier", async () => {
    const { client, appels } = faux({ rpc: () => ({ data: null, error: { message: "Synchronisation non autorisée côté Réserves" } }) });
    await expect(synchroniserChantierReserves(client, "gp-1")).rejects.toThrow("côté Réserves");
    expect(appels.some((a) => a.type.startsWith("download"))).toBe(false);
  });
});

describe("messages", () => {
  it("première utilisation", () => {
    expect(messageSynchronisation(lireRapportSynchronisation(rapportBrut), { reussies: 2, echecs: [] }))
      .toBe("Chantier créé dans ELSATIA Réserves : 2 entreprises ajoutées, 5 contacts ajoutés, 2 plans transmis.");
  });
  it("mise à jour sans changement", () => {
    const r = lireRapportSynchronisation({ ...rapportBrut, cree: false, entreprises: {}, contacts: {}, plans: {}, plans_a_copier: [] });
    expect(messageSynchronisation(r, { reussies: 0, echecs: [] })).toBe("Chantier mis à jour dans ELSATIA Réserves.");
  });
  it("conflit de plan, échec de copie et champs conservés sont dits simplement", () => {
    const r = lireRapportSynchronisation({ ...rapportBrut, cree: false, rattache: true, entreprises: {}, contacts: {},
      plans: { conflits: 1 }, champs_conserves: ["adresse", "code_postal"] });
    const m = messageSynchronisation(r, { reussies: 0, echecs: ["p1"] });
    expect(m).toContain("relié au chantier existant");
    expect(m).toContain("1 plan a une nouvelle version dans Gestion Pro");
    expect(m).toContain("n’a pas été remplacé");
    expect(m).toContain("1 plan n’a pas pu être transmis");
    expect(m).toContain("Modifié dans Réserves, conservé : adresse, code postal.");
    expect(m).not.toMatch(/gp_|rpc|uuid|storage/i);
  });
  it("erreurs traduites sans détail technique", () => {
    expect(messageErreurSynchronisation("Synchronisation non autorisée côté Gestion Pro")).toMatch(/pas accès à ce chantier/);
    expect(messageErreurSynchronisation("Synchronisation non autorisée côté Réserves")).toMatch(/rôle dans ELSATIA Réserves/);
    expect(messageErreurSynchronisation("connexion perdue")).toMatch(/Réessayez/);
  });
  it("lien vers Réserves construit depuis le catalogue", () => {
    expect(urlChantierReserves("http://localhost:3020/", "rc 1")).toBe("http://localhost:3020/chantiers/rc%201");
    expect(urlChantierReserves(null, "rc")).toBeNull();
  });
});
