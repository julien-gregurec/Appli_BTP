import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ErreurBailPerdu,
  ErreurTransitoire,
  executerUnExport,
  type ExportDbPort,
  type FichierBase,
  type Reclamation,
  type SectionBase,
  type StockagePort,
  type StudioExport,
  type StudioPort,
} from "./runner";

const dossier = mkdtempSync(join(tmpdir(), "runner-test-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

const JOB = "11111111-1111-4111-8111-111111111111";
const ENT = "a0000000-0000-0000-0000-000000000001";
const SHA = (s: string) => createHash("sha256").update(s).digest("hex");

interface Etat {
  type: "UTILISATEUR" | "ENTREPRISE";
  sections: SectionBase[];
  lignes: Record<string, Record<string, unknown>[]>;
  fichiers: FichierBase[];
  bail: string;
  studio_sujet_connu: boolean;
  appels: string[];
  termine?: { chemin: string; sha256: string; octets: number; complet: boolean; resume: Record<string, unknown> };
  echec?: { code: string; reessayable: boolean };
  pris: boolean;
  manquantsBase: number;
}

function etat(partiel: Partial<Etat> = {}): Etat {
  const lignes = partiel.lignes ?? {
    clients: Array.from({ length: 2503 }, (_, i) => ({ id: `c${String(i).padStart(5, "0")}`, entreprise_id: ENT, nom: `Client ${i}`, note: i === 7 ? "=HYPERLIEN()" : "ok" })),
    documents_chantier: [{ id: "d1", entreprise_id: ENT, storage_path: `${ENT}/x/plan.pdf` }],
  };
  return {
    type: "ENTREPRISE",
    sections: Object.entries(lignes).map(([t, l]) => ({ section: t, table_nom: t, entreprise_id: ENT, application: "gestion_pro", domaine: "test",
      categorie: "BUSINESS_DATA", nb_lignes: l.length })),
    lignes,
    fichiers: [
      { seq: 1, section: "documents_chantier", ligne_id: "d1", colonne: "storage_path", bucket: "chantier-documents", chemin: `${ENT}/x/plan.pdf`,
        nom: "plan.pdf", mime: "application/pdf", taille_declaree: 11, taille_stockage: 11, sha256_declare: SHA("contenu-pdf"), statut: "A_INCLURE" },
      { seq: 2, section: "documents_chantier", ligne_id: "d2", colonne: "storage_path", bucket: "chantier-documents", chemin: `${ENT}/x/plan.pdf`,
        nom: "plan.pdf", mime: "application/pdf", taille_declaree: 11, taille_stockage: 11, sha256_declare: null, statut: "A_INCLURE" },
    ],
    bail: "b1",
    studio_sujet_connu: false,
    appels: [],
    pris: false,
    manquantsBase: 0,
    ...partiel,
  };
}

function db(e: Etat, options: { perdreBailAuPage?: number } = {}): ExportDbPort {
  let pages = 0;
  const bail = (b: string) => {
    if (b !== e.bail) throw new ErreurBailPerdu();
  };
  return {
    async reclamer(): Promise<Reclamation | null> {
      if (e.pris) return null;
      e.pris = true;
      e.appels.push("reclamer");
      return { job_id: JOB, bail: e.bail, tentative: 1, type_export: e.type, entreprise_id: e.type === "ENTREPRISE" ? ENT : null,
        format_version: "elsatia.rgpd-export/1", reprise: false, studio_sujet_connu: e.studio_sujet_connu };
    },
    async prolonger(_j, b) {
      bail(b);
      e.appels.push("prolonger");
    },
    async materialiser(_j, b) {
      bail(b);
      return { statut: "RUNNING", resume: {}, instantane_at: "2026-09-28T10:00:00Z", demandeur_studio: e.type === "UTILISATEUR" ? "22222222-2222-4222-8222-222222222222" : null };
    },
    async sections(_j, b) {
      bail(b);
      return e.sections;
    },
    async page(_j, b, section, apres, limite) {
      bail(b);
      if (options.perdreBailAuPage !== undefined && ++pages >= options.perdreBailAuPage) e.bail = "vole";
      return (e.lignes[section] ?? []).map((ligne, i) => ({ seq: i + 1, ligne })).filter((x) => x.seq > apres).slice(0, limite);
    },
    async fichiers(_j, b, apres, limite) {
      bail(b);
      return e.fichiers.filter((f) => f.seq > apres).slice(0, limite);
    },
    async classification() {
      return [{ table_nom: "clients", categorie: "THIRD_PARTY" }];
    },
    async terminer(_j, b, chemin, sha256, octets, complet, resume) {
      bail(b);
      // Miroir de la règle SQL : jamais complet si la base compte un fichier ABSENT / HORS_TENANT.
      const baseComplete = !e.fichiers.some((f) => f.statut === "ABSENT" || f.statut === "HORS_TENANT");
      e.termine = { chemin, sha256, octets, complet: complet && baseComplete, resume };
      return { statut: "READY", complet: complet && baseComplete, objets_obsoletes: [] };
    },
    async echouer(_j, b, code, reessayable) {
      bail(b);
      e.echec = { code, reessayable };
      return { statut: reessayable ? "PENDING" : "FAILED" };
    },
  };
}

function stockage(fichiers: Record<string, string | "PANNE">, depots: Record<string, string> = {}): StockagePort {
  return {
    async lire(bucket, chemin) {
      const v = fichiers[`${bucket}/${chemin}`];
      if (v === "PANNE") throw new ErreurTransitoire("STOCKAGE_ERREUR");
      if (v === undefined) return null;
      return (async function* () {
        for (let i = 0; i < v.length; i += 3) yield Buffer.from(v.slice(i, i + 3));
      })();
    },
    async televerserArchive(chemin, local) {
      const copie = join(dossier, chemin.replace(/\//g, "_"));
      copyFileSync(local, copie);
      depots[chemin] = copie;
    },
    async supprimerArchives() {},
  };
}

function lireArchive(chemin: string): { noms: string[]; meta: Record<string, unknown>; manifeste: Array<Record<string, unknown>>; clients: unknown[]; csv: string; sums: string } {
  const out = execFileSync("python3", ["-c", `
import zipfile, json, sys, hashlib
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
noms = z.namelist()
sums = z.read("SHA256SUMS").decode()
for l in sums.strip().split("\\n"):
    h, n = l.split("  ", 1); assert hashlib.sha256(z.read(n)).hexdigest() == h, n
print(json.dumps({"noms": noms, "meta": json.loads(z.read("export.json")), "manifeste": json.loads(z.read("fichiers/manifeste.json")),
  "clients": json.loads(z.read("donnees/${ENT}/gestion_pro/clients.json")) if "donnees/${ENT}/gestion_pro/clients.json" in noms else [],
  "csv": z.read("csv/${ENT}/gestion_pro/clients.csv").decode("utf-8") if "csv/${ENT}/gestion_pro/clients.csv" in noms else "", "sums": sums}))
`, chemin], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return JSON.parse(out);
}

describe("worker d'export RGPD", () => {
  it("aucun job : rien à faire", async () => {
    const e = etat({ pris: true });
    expect((await executerUnExport({ db: db(e), stockage: stockage({}) })).etat).toBe("aucun_job");
  });

  it("export entreprise complet : JSON paginé (2 503 lignes, pages de 1 000), CSV neutralisé, fichier copié une seule fois, empreintes vérifiées", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const logs: string[] = [];
    const r = await executerUnExport({ db: db(e), stockage: stockage({ [`chantier-documents/${ENT}/x/plan.pdf`]: "contenu-pdf" }, depots), tailleePage: 1000,
      log: (ev, d) => logs.push(JSON.stringify({ ev, ...d })) });
    expect(r).toMatchObject({ etat: "ready", complet: true, lignes: 2504 });
    expect(e.termine?.chemin).toBe(`${JOB}/1.zip`);
    const a = lireArchive(depots[`${JOB}/1.zip`]);
    expect(e.termine?.sha256).toBe(SHA(readFileSync(depots[`${JOB}/1.zip`]) as unknown as string));
    expect(a.clients).toHaveLength(2503);
    expect(a.meta).toMatchObject({ format: "elsatia.rgpd-export/1", type: "ENTREPRISE", complet: true, motifs_incompletude: [] });
    expect(a.noms).toEqual(expect.arrayContaining(["export.json", "LISEZMOI.txt", "SHA256SUMS", "classification.json", "fichiers/manifeste.json",
      `fichiers/chantier-documents/${ENT}/x/plan.pdf`]));
    expect(a.noms.filter((n) => n.startsWith("fichiers/chantier-documents/"))).toHaveLength(1); // dédoublonné
    expect(a.manifeste.map((f) => f.statut)).toEqual(["INCLUS", "INCLUS"]);
    expect(a.manifeste[0].sha256).toBe(SHA("contenu-pdf"));
    expect(a.csv.startsWith("﻿id;entreprise_id;nom;note")).toBe(true);
    expect(a.csv).toContain(";'=HYPERLIEN()");
    // Journal : compteurs seulement, jamais le contenu.
    expect(logs.join("\n")).not.toMatch(/Client 1|contenu-pdf|HYPERLIEN/);
  });

  it("fichier absent du stockage (lecture 404) : archive produite, jamais déclarée complète", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const r = await executerUnExport({ db: db(e), stockage: stockage({}, depots) });
    expect(r).toMatchObject({ etat: "ready", complet: false });
    const a = lireArchive(depots[`${JOB}/1.zip`]);
    expect(a.meta).toMatchObject({ complet: false, motifs_incompletude: ["FICHIER_ILLISIBLE"] });
    expect(a.manifeste[0].statut).toBe("ILLISIBLE");
  });

  it("fichiers ABSENT / HORS_TENANT signalés par la base : jamais lus, archive incomplète", async () => {
    const e = etat();
    e.fichiers[0].statut = "HORS_TENANT";
    e.fichiers[1].statut = "ABSENT";
    const lus: string[] = [];
    const s = stockage({});
    const r = await executerUnExport({ db: db(e), stockage: { ...s, lire: async (b, c) => { lus.push(`${b}/${c}`); return null; } } });
    expect(lus).toEqual([]);
    expect(r).toMatchObject({ etat: "ready", complet: false });
    expect(e.termine?.resume.motifs).toEqual(["FICHIER_ABSENT", "FICHIER_HORS_TENANT"]);
  });

  it("empreinte divergente (fichier altéré) : incluse mais signalée, archive incomplète", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const r = await executerUnExport({ db: db(e), stockage: stockage({ [`chantier-documents/${ENT}/x/plan.pdf`]: "ALTERE" }, depots) });
    expect(r.complet).toBe(false);
    expect(lireArchive(depots[`${JOB}/1.zip`]).manifeste[0].statut).toBe("EMPREINTE_DIVERGENTE");
  });

  it("stockage en panne : job replanifié (réessai), aucune archive déposée", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const r = await executerUnExport({ db: db(e), stockage: stockage({ [`chantier-documents/${ENT}/x/plan.pdf`]: "PANNE" }, depots) });
    expect(r).toMatchObject({ etat: "retry", code: "STOCKAGE_ERREUR" });
    expect(e.echec).toEqual({ code: "STOCKAGE_ERREUR", reessayable: true });
    expect(depots).toEqual({});
    expect(e.termine).toBeUndefined();
  });

  it("job interrompu (coupure du worker) : rien n'est terminé ni échoué, le bail expirera et le job sera repris", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const r = await executerUnExport({ db: db(e), stockage: stockage({}, depots), interrompreApresSections: 1 });
    expect(r.etat).toBe("bail_perdu");
    expect(e.termine).toBeUndefined();
    expect(e.echec).toBeUndefined();
    expect(depots).toEqual({});
  });

  it("bail repris par un autre worker en cours de route : arrêt sans écriture concurrente", async () => {
    const e = etat();
    const depots: Record<string, string> = {};
    const r = await executerUnExport({ db: db(e, { perdreBailAuPage: 2 }), stockage: stockage({}, depots), tailleePage: 1000 });
    expect(r.etat).toBe("bail_perdu");
    expect(e.termine).toBeUndefined();
    expect(depots).toEqual({});
  });

  it("rejeu après interruption : même contenu, archive identique octet pour octet (même tentative, même date)", async () => {
    const fichiers = { [`chantier-documents/${ENT}/x/plan.pdf`]: "contenu-pdf" };
    const d1: Record<string, string> = {};
    const d2: Record<string, string> = {};
    const now = () => new Date("2026-09-28T10:00:00Z");
    await executerUnExport({ db: db(etat()), stockage: stockage(fichiers, d1), now });
    await executerUnExport({ db: db(etat()), stockage: stockage(fichiers, d2), now });
    expect(SHA(readFileSync(d1[`${JOB}/1.zip`]) as unknown as string)).toBe(SHA(readFileSync(d2[`${JOB}/1.zip`]) as unknown as string));
  });

  describe("Studio (export individuel, projet dédié)", () => {
    const studioOk = (reponse: StudioExport | "PANNE", fichiers: Record<string, string> = {}): StudioPort => ({
      async exporter() {
        if (reponse === "PANNE") throw new ErreurTransitoire("STUDIO_INDISPONIBLE");
        return reponse;
      },
      async lireUrl(url) {
        const v = fichiers[url];
        return v === undefined ? null : (async function* () { yield Buffer.from(v); })();
      },
    });
    const usager = () => etat({ type: "UTILISATEUR", studio_sujet_connu: true, fichiers: [], lignes: { profil: [{ id: "u1" }] } });

    it("Studio indisponible : réessai, jamais d'archive déclarée complète", async () => {
      const e = usager();
      const r = await executerUnExport({ db: db(e), stockage: stockage({}), studio: studioOk("PANNE") });
      expect(r).toMatchObject({ etat: "retry", code: "STUDIO_INDISPONIBLE" });
      expect(e.termine).toBeUndefined();
    });

    it("Studio non configuré alors qu'un sujet Studio existe : archive INCOMPLÈTE", async () => {
      const e = usager();
      const r = await executerUnExport({ db: db(e), stockage: stockage({}), studio: null });
      expect(r).toMatchObject({ etat: "ready", complet: false });
      expect(e.termine?.resume.studio).toBe("NON_CONFIGURE");
    });

    it("Studio répond : données + fichiers OWN_DATA inclus, SHARED en métadonnées seulement", async () => {
      const e = usager();
      const depots: Record<string, string> = {};
      const r = await executerUnExport({ db: db(e), stockage: stockage({}, depots), studio: studioOk({
        statut: "ok", format: "elsatia.studio-export/1", donnees: { workspaces: [{ id: "w" }] },
        fichiers: [
          { bucket: "studio-originals", cle: "studio/w/a.mp4", nom: "a.mp4", mime: "video/mp4", octets: 5, categorie: "OWN_DATA", url: "u1" },
          { bucket: "studio-originals", cle: "studio/w2/b.mp4", nom: "b.mp4", mime: "video/mp4", octets: 5, categorie: "SHARED", url: null },
        ],
      }, { u1: "video" }) });
      expect(r).toMatchObject({ etat: "ready", complet: true });
      const a = lireArchive(depots[`${JOB}/1.zip`]);
      expect(a.noms).toEqual(expect.arrayContaining(["studio/donnees.json", "studio/fichiers/studio-originals/studio/w/a.mp4"]));
      expect(a.manifeste.map((f) => [f.source, f.statut])).toEqual([["studio", "INCLUS"], ["studio", "EXCLU_POLITIQUE"]]);
      expect(a.meta.studio).toMatchObject({ statut: "INCLUS", fichiers: 1 });
    });

    it("aucun compte Studio : section vide, complète", async () => {
      const e = usager();
      const r = await executerUnExport({ db: db(e), stockage: stockage({}), studio: studioOk({ statut: "aucun_compte", format: "elsatia.studio-export/1" }) });
      expect(r).toMatchObject({ etat: "ready", complet: true });
      expect(e.termine?.resume.studio).toBe("AUCUN_COMPTE");
    });
  });
});
