import { describe, expect, it } from "vitest";
import {
  DELAI_SUPPRESSION_MS,
  evaluerEcheance,
  executerPurgeEntreprise,
  lireConfigPlanificateurPurge,
  planifierPurgesRgpd,
  runIdPlanifie,
  type CandidatPurge,
  type ConfigPlanificateur,
  type PortPurge,
} from "./rgpd-purge-planificateur";

const MAINTENANT = new Date("2026-09-23T03:15:00.000Z");
const ID_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ID_B = "aaaaaaaa-0000-0000-0000-000000000002";

function candidatEchu(id = ID_A): CandidatPurge {
  const prevue = new Date(MAINTENANT.getTime() - 60_000);
  return {
    id,
    suppression_demandee_at: new Date(prevue.getTime() - DELAI_SUPPRESSION_MS).toISOString(),
    suppression_prevue_at: prevue.toISOString(),
    purgee_at: null,
  };
}

type Table = { categorie: "DELETE" | "ANONYMIZE" | "RETAIN"; ordre: number; lignes: number; anonymisee?: boolean };

// Faux serveur en mémoire qui reproduit le contrat des RPC de purge : idempotence
// (table vide → ok, 0 ligne), rapport qui n'affiche que les tables DELETE non vides,
// classement Storage ORPHELIN/A_PURGER, garde de complétude du marquage.
function fauxServeur(options: { echecsPurge?: Record<string, number>; echecStorage?: number } = {}) {
  const tables: Record<string, Table> = {
    pointages: { categorie: "DELETE", ordre: 0, lignes: 3 },
    chantiers: { categorie: "DELETE", ordre: 1, lignes: 2 },
    clients: { categorie: "ANONYMIZE", ordre: 0, lignes: 2 },
    factures: { categorie: "RETAIN", ordre: 0, lignes: 5 },
  };
  const fichiers = [
    { bucket_id: "pointage-preuves", chemin: `${ID_A}/p1.jpg`, lie: "pointages" },
    { bucket_id: "notes-frais", chemin: `${ID_A}/nf.pdf`, lie: "RETAIN" },
  ];
  const echecsPurge = { ...(options.echecsPurge ?? {}) };
  let echecStorage = options.echecStorage ?? 0;
  const appels: string[] = [];
  const audit: Array<{ runId: string; ok: boolean; detail: Record<string, unknown> }> = [];
  let purgee = false;
  const supprimes: string[] = [];

  const classer = () =>
    fichiers
      .filter((f) => !supprimes.includes(f.chemin))
      .map((f) => ({
        bucket_id: f.bucket_id,
        chemin: f.chemin,
        categorie: f.lie === "RETAIN" ? "RETAIN" : tables[f.lie].lignes > 0 ? "A_PURGER" : "ORPHELIN",
      }));

  const port: PortPurge = {
    async listerEcheances() {
      appels.push("listerEcheances");
      return purgee ? [] : [candidatEchu()];
    },
    async rapport() {
      appels.push("rapport");
      return Object.entries(tables)
        .filter(([, t]) => t.categorie !== "DELETE" || t.lignes > 0)
        .map(([nom, t]) => ({ table_nom: nom, categorie: t.categorie, ordre: t.ordre, nb_lignes: t.lignes }));
    },
    async fichiersStorage() {
      appels.push("fichiersStorage");
      return classer();
    },
    async purgerTable(_id, table) {
      appels.push(`purger:${table}`);
      if ((echecsPurge[table] ?? 0) > 0) {
        echecsPurge[table] -= 1;
        return { ok: false, lignes: null, erreur: "violates foreign key constraint (transitoire)" };
      }
      // Contrainte d'ordre réelle : chantiers est restreint par pointages.
      if (table === "chantiers" && tables.pointages.lignes > 0) {
        return { ok: false, lignes: null, erreur: "violates foreign key constraint pointages_chantier_id_fkey" };
      }
      const n = tables[table].lignes;
      tables[table].lignes = 0;
      return { ok: true, lignes: n, erreur: null };
    },
    async anonymiserTable(_id, table) {
      appels.push(`anonymiser:${table}`);
      const n = tables[table].anonymisee ? 0 : tables[table].lignes;
      tables[table].anonymisee = true;
      return { ok: true, lignes: n, erreur: null };
    },
    async supprimerFichiers(bucket, chemins) {
      appels.push(`storage:${bucket}`);
      if (echecStorage > 0) {
        echecStorage -= 1;
        return { ok: false, erreur: "Storage indisponible" };
      }
      supprimes.push(...chemins);
      return { ok: true, erreur: null };
    },
    async marquerPurgee() {
      appels.push("marquer");
      if (Object.values(tables).some((t) => t.categorie === "DELETE" && t.lignes > 0)) return { ok: false, erreur: "Purge incomplete" };
      purgee = true;
      return { ok: true, erreur: null };
    },
    async consigner(_id, runId, ok, detail) {
      appels.push("consigner");
      audit.push({ runId, ok, detail });
    },
  };
  return { port, tables, appels, audit, supprimes, echecsPurge, estPurgee: () => purgee };
}

const EXECUTE: ConfigPlanificateur = { mode: "execute", maxEntreprises: 1, decisionRef: "D4/P1-6 test", raison: "execute_autorise" };
const MUTATIONS = /^(purger|anonymiser|storage|marquer|consigner)/;

describe("lireConfigPlanificateurPurge — fail-closed", () => {
  it("est désactivé par défaut (variable absente ou vide)", () => {
    expect(lireConfigPlanificateurPurge({}).mode).toBe("off");
    expect(lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: "  " }).mode).toBe("off");
  });

  it("retombe sur off pour une valeur inconnue (true, 1, on...)", () => {
    for (const valeur of ["true", "1", "on", "executer", "EXECUTE-NOW"]) {
      const config = lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: valeur, RGPD_PURGE_DECISION_REF: "ref" });
      expect(config.mode).toBe("off");
      expect(config.raison).toMatch(/^mode_inconnu:/);
    }
  });

  it("refuse execute sans référence de décision propriétaire", () => {
    const config = lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: "execute" });
    expect(config).toMatchObject({ mode: "off", raison: "execute_sans_reference_de_decision" });
  });

  it("accepte dry-run sans référence et execute avec référence", () => {
    expect(lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: "dry-run" }).mode).toBe("dry-run");
    expect(
      lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: " Execute ", RGPD_PURGE_DECISION_REF: "Décision D4 du 01/10/2026" }),
    ).toMatchObject({ mode: "execute", decisionRef: "Décision D4 du 01/10/2026" });
  });

  it("borne le nombre d'entreprises par passage", () => {
    expect(lireConfigPlanificateurPurge({}).maxEntreprises).toBe(1);
    expect(lireConfigPlanificateurPurge({ RGPD_PURGE_MAX_ENTREPRISES: "0" }).maxEntreprises).toBe(1);
    expect(lireConfigPlanificateurPurge({ RGPD_PURGE_MAX_ENTREPRISES: "500" }).maxEntreprises).toBe(10);
    expect(lireConfigPlanificateurPurge({ RGPD_PURGE_MAX_ENTREPRISES: "abc" }).maxEntreprises).toBe(1);
  });
});

describe("evaluerEcheance — mauvaises dates", () => {
  it("accepte une échéance échue cohérente avec le délai de 30 jours", () => {
    expect(evaluerEcheance(candidatEchu(), MAINTENANT)).toEqual({ eligible: true, raison: "echue" });
  });

  it("refuse une entreprise sans échéance ou déjà purgée", () => {
    expect(evaluerEcheance({ ...candidatEchu(), suppression_prevue_at: null }, MAINTENANT).raison).toBe("aucune_echeance");
    expect(evaluerEcheance({ ...candidatEchu(), suppression_prevue_at: "" }, MAINTENANT).raison).toBe("aucune_echeance");
    expect(evaluerEcheance({ ...candidatEchu(), purgee_at: "2026-09-01T00:00:00Z" }, MAINTENANT).raison).toBe("deja_purgee");
  });

  it("refuse une échéance illisible", () => {
    for (const valeur of ["pas-une-date", "2026-13-45", "NaN"]) {
      expect(evaluerEcheance({ ...candidatEchu(), suppression_prevue_at: valeur }, MAINTENANT).raison).toBe("echeance_invalide");
    }
    const nonTexte = { ...candidatEchu(), suppression_prevue_at: 12345 as unknown as string };
    expect(evaluerEcheance(nonTexte, MAINTENANT).raison).toBe("echeance_invalide");
  });

  it("refuse une échéance future, même d'une seconde", () => {
    const futur = new Date(MAINTENANT.getTime() + 1000).toISOString();
    expect(evaluerEcheance({ ...candidatEchu(), suppression_prevue_at: futur }, MAINTENANT).raison).toBe("echeance_future");
  });

  it("refuse une échéance plus courte que demande + 30 jours (date posée à la main ou corrompue)", () => {
    const epoch = { ...candidatEchu(), suppression_demandee_at: "1970-01-01T00:00:00Z", suppression_prevue_at: "1970-01-01T00:00:00Z" };
    expect(evaluerEcheance(epoch, MAINTENANT).raison).toBe("delai_incoherent");
    const raccourcie = { ...candidatEchu(), suppression_demandee_at: new Date(MAINTENANT.getTime() - 86_400_000).toISOString() };
    expect(evaluerEcheance(raccourcie, MAINTENANT).raison).toBe("delai_incoherent");
  });

  it("refuse une demande absente, illisible ou dans le futur", () => {
    expect(evaluerEcheance({ ...candidatEchu(), suppression_demandee_at: null }, MAINTENANT).raison).toBe("demande_absente");
    expect(evaluerEcheance({ ...candidatEchu(), suppression_demandee_at: "hier" }, MAINTENANT).raison).toBe("demande_invalide");
    expect(evaluerEcheance({ ...candidatEchu(), suppression_demandee_at: "2099-01-01T00:00:00Z" }, MAINTENANT).raison).toBe("demande_future");
  });

  it("refuse tout si l'horloge applicative est invalide", () => {
    expect(evaluerEcheance(candidatEchu(), new Date("invalide")).raison).toBe("horloge_invalide");
  });
});

describe("runIdPlanifie", () => {
  it("est un UUID stable par (entreprise, échéance)", () => {
    const prevue = candidatEchu().suppression_prevue_at as string;
    const a = runIdPlanifie(ID_A, prevue);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(runIdPlanifie(ID_A, prevue)).toBe(a);
    // Même instant, autre écriture (fuseau) → même run.
    expect(runIdPlanifie(ID_A, new Date(prevue).toISOString().replace("Z", "+00:00"))).toBe(a);
    expect(runIdPlanifie(ID_B, prevue)).not.toBe(a);
    expect(runIdPlanifie(ID_A, "2026-10-01T00:00:00Z")).not.toBe(a);
  });
});

describe("planifierPurgesRgpd — désactivé par défaut", () => {
  it("mode off : aucun appel serveur, quelle que soit la situation", async () => {
    const serveur = fauxServeur();
    const bilan = await planifierPurgesRgpd(serveur.port, lireConfigPlanificateurPurge({}), MAINTENANT);
    expect(bilan).toMatchObject({ mode: "off", traitees: [], ignorees: [] });
    expect(serveur.appels).toEqual([]);
  });

  it("mode dry-run : lecture seule, aucune écriture (ni purge, ni Storage, ni audit)", async () => {
    const serveur = fauxServeur();
    const bilan = await planifierPurgesRgpd(serveur.port, lireConfigPlanificateurPurge({ RGPD_PURGE_PLANIFICATEUR_MODE: "dry-run" }), MAINTENANT);
    expect(bilan.traitees[0]).toMatchObject({ statut: "simulee", aSupprimer: 2, aAnonymiser: 1, fichiersAPurger: 1 });
    expect(serveur.appels.filter((a) => MUTATIONS.test(a))).toEqual([]);
    expect(serveur.tables.pointages.lignes).toBe(3);
  });

  it("n'est jamais bloqué par une entreprise inéligible en tête de file", async () => {
    const serveur = fauxServeur();
    const inelegible = { ...candidatEchu(ID_B), suppression_demandee_at: null };
    serveur.port.listerEcheances = async () => [inelegible, candidatEchu()];
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.ignorees).toEqual([{ entrepriseId: ID_B, raison: "demande_absente" }]);
    expect(bilan.traitees.map((t) => [t.entrepriseId, t.statut])).toEqual([[ID_A, "complete"]]);
  });

  it("ne lève jamais vers le cron, même si la lecture des échéances échoue", async () => {
    const serveur = fauxServeur();
    serveur.port.listerEcheances = async () => {
      throw new Error("base indisponible");
    };
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.erreur).toBe("base indisponible");
  });
});

describe("planifierPurgesRgpd — exécution, idempotence, retry", () => {
  it("purge complète dans l'ordre, anonymise, supprime les seuls orphelins, marque, audite la décision", async () => {
    const serveur = fauxServeur();
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.traitees[0]).toMatchObject({ statut: "complete", tablesPurgees: 2, tablesAnonymisees: 1, fichiersSupprimes: 1 });
    expect(serveur.appels.indexOf("purger:pointages")).toBeLessThan(serveur.appels.indexOf("purger:chantiers"));
    expect(serveur.supprimes).toEqual([`${ID_A}/p1.jpg`]);
    expect(serveur.tables.factures.lignes).toBe(5);
    expect(serveur.estPurgee()).toBe(true);
    expect(serveur.audit.map((a) => a.detail.evenement)).toEqual(["debut", "fin"]);
    expect(serveur.audit.every((a) => a.detail.decision_ref === "D4/P1-6 test")).toBe(true);
    expect(serveur.audit.at(-1)?.ok).toBe(true);
  });

  it("idempotence : rejouer la purge d'une entreprise déjà purgée ne supprime rien de plus", async () => {
    const serveur = fauxServeur();
    const runId = runIdPlanifie(ID_A, candidatEchu().suppression_prevue_at as string);
    const premiere = await executerPurgeEntreprise(serveur.port, ID_A, runId, "execute");
    const seconde = await executerPurgeEntreprise(serveur.port, ID_A, runId, "execute");
    expect(premiere.statut).toBe("complete");
    expect(seconde).toMatchObject({ statut: "complete", tablesPurgees: 0, fichiersSupprimes: 0 });
    expect(serveur.tables.factures.lignes).toBe(5);
    // Et le planificateur ne la resélectionne pas (purgee_at renseigné).
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.traitees).toEqual([]);
  });

  it("retry dans le passage : un échec transitoire est rattrapé par les passes suivantes", async () => {
    const serveur = fauxServeur({ echecsPurge: { pointages: 1 } });
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.traitees[0].statut).toBe("complete");
    expect(serveur.appels.filter((a) => a === "purger:pointages")).toHaveLength(2);
  });

  it("retry entre passages : un échec persistant laisse une purge incomplète, reprise au passage suivant avec le même run_id", async () => {
    const serveur = fauxServeur({ echecsPurge: { pointages: 99 } });
    const premier = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(premier.traitees[0].statut).toBe("incomplete");
    expect(premier.traitees[0].echecs.map((e) => e.cible).sort()).toEqual(["chantiers", "pointages"]);
    expect(serveur.appels).not.toContain("marquer");
    expect(serveur.audit.at(-1)).toMatchObject({ ok: false });

    // Cause levée (ex. contrainte corrigée) : le passage du lendemain reprend le même run.
    serveur.echecsPurge.pointages = 0;
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, new Date(MAINTENANT.getTime() + 86_400_000));
    expect(bilan.traitees[0]).toMatchObject({ statut: "complete", tablesPurgees: 2 });
    expect(bilan.traitees[0].runId).toBe(premier.traitees[0].runId);
    expect(new Set(serveur.audit.map((a) => a.runId)).size).toBe(1);
    expect(serveur.estPurgee()).toBe(true);
  });

  it("retry Storage : un échec de suppression de fichier n'aboutit jamais au marquage, le passage suivant termine", async () => {
    const serveur = fauxServeur({ echecStorage: 1 });
    const premier = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(premier.traitees[0]).toMatchObject({ statut: "incomplete" });
    expect(serveur.estPurgee()).toBe(false);
    const second = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(second.traitees[0]).toMatchObject({ statut: "complete", tablesPurgees: 0, fichiersSupprimes: 1 });
    expect(serveur.estPurgee()).toBe(true);
  });

  it("une exception serveur en cours de purge est rendue, jamais propagée", async () => {
    const serveur = fauxServeur();
    serveur.port.anonymiserTable = async () => {
      throw new Error("connexion perdue");
    };
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.traitees[0]).toMatchObject({ statut: "erreur" });
    expect(bilan.traitees[0].echecs[0].erreur).toBe("connexion perdue");
    expect(serveur.estPurgee()).toBe(false);
  });

  it("un échec d'écriture de l'audit planificateur n'interrompt pas la purge", async () => {
    const serveur = fauxServeur();
    serveur.port.consigner = async () => {
      throw new Error("audit indisponible");
    };
    const bilan = await planifierPurgesRgpd(serveur.port, EXECUTE, MAINTENANT);
    expect(bilan.traitees[0].statut).toBe("complete");
  });
});
