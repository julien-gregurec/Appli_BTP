import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ESTIMATION_GP_CONTRACT, type EstimationGpPayload } from "./estimation";
import { classerErreurEnvoiGp, gpEnvoisFromJson, gpImportMessage, gpImportResultatFromJson, resumeEnvoiGp } from "./gp-handoff";

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");
const sql = lire("../../../supabase/migrations/20261002001116_gp_tools_import_estimation_v1.sql");
const estimationTs = lire("./estimation.ts");

describe("parité contrat Tools (Lot 10) ↔ import Gestion Pro (migration 20261002001116)", () => {
  it("même nom de contrat, majeure 1 acceptée côté GP", () => {
    expect(sql).toContain(`'${ESTIMATION_GP_CONTRACT.name}'`);
    expect(ESTIMATION_GP_CONTRACT.version).toMatch(/^1\.\d+\.\d+$/);
    expect(sql).toContain("'^1\\.[0-9]+\\.[0-9]+$'");
  });
  it("mêmes clés commerciales interdites que validateEstimationGpPayload", () => {
    const ts = /numeroDevis\|devisNumero\|numeroFacture\|facture\|commande\|signature\|marge\|remise\|prixVente\|prix_vente\|tauxTva\|tva\|ttc\|statutDevis\|accepte\|refuse/;
    expect(estimationTs).toMatch(ts);
    expect(sql).toMatch(ts);
  });
  it("même référence de ligne (plan:ouvrage:pièce|etage-<étage>:état:nature) : le serveur recompare chaque ligne", () => {
    expect(estimationTs).toContain("ref: `${source.planId}:${ligne.ouvrageId}:${ligne.pieceId ?? `etage-${source.etageId}`}:${ligne.etatProjet}:${ligne.nature}`");
    expect(sql.replace(/\s+/g, " ")).toContain("x.plan_id || ':' || (x.l->>'ouvrageId') || ':' || coalesce(x.l->>'pieceId', 'etage-' || x.etage_id) || ':' || (x.l->>'etatProjet') || ':' || (x.l->>'nature')");
  });
  it("Tools ne crée aucun devis : la création de devis n'existe que côté GP, en brouillon, sur action explicite", () => {
    expect(sql).toContain("gp_tools_import_creer_devis");
    expect(sql).toMatch(/insert into public\.devis \(entreprise_id, client_id, chantier_id, statut, notes_internes\)\s+values \(v_imp\.entreprise_id, v_client, v_chantier, 'brouillon'/);
    expect(estimationTs).not.toMatch(/creer_devis|gp_tools_import_creer_devis/);
  });
});

const payload = {
  contract: ESTIMATION_GP_CONTRACT,
  source: { plans: [{ planId: "p1" }, { planId: "p2" }] },
  quantitatif: { ouvrages: [{ ref: "o1" }, { ref: "o2" }, { ref: "o3" }] },
  lignes: [{ montantRetenu: "10.00" }, { montantRetenu: null }, { montantRetenu: "5.50" }],
  totaux: { total: "15.50" },
  photos: [{}], annotations: [{}, {}], anomalies: [], revetements: [{}],
} as unknown as EstimationGpPayload;

describe("envoi vers Gestion Pro : résumé, résultat, messages", () => {
  it("résumé avant envoi (source, version, ouvrages, montant estimatif HT, pièces jointes)", () => {
    expect(resumeEnvoiGp(payload)).toEqual({
      // Train V9 : Lot 11 porté sur le Lot 10 1.1.0 (contrat émis = version courante du domaine).
      contrat: `${ESTIMATION_GP_CONTRACT.name} ${ESTIMATION_GP_CONTRACT.version}`, ouvrages: 3, lignes: 3, lignesSansPrix: 1, montantHt: "15.50", plans: 2, photos: 1, annotations: 2, anomalies: 0, revetements: 1,
    });
  });
  it("résultat normalisé (numeric PostgREST éventuellement en chaîne) ; réponse illisible refusée", () => {
    expect(gpImportResultatFromJson({ statut: "nouvelle_version", importId: "i2", version: "2", montant: "1007.00", lignes: 4, ouvrages: "3", devisPrecedent: true }))
      .toEqual({ statut: "nouvelle_version", importId: "i2", version: 2, montant: 1007, lignes: 4, ouvrages: 3, devisPrecedent: true, devisCree: false });
    expect(() => gpImportResultatFromJson({ statut: "devis", importId: "x" })).toThrow("illisible");
    expect(() => gpImportResultatFromJson(null)).toThrow();
  });
  it("messages : premier import, nouvelle version (devis non modifié), déjà transmis (aucun doublon) ; jamais de devis côté Tools", () => {
    const base = { importId: "i", montant: 1007, lignes: 4, ouvrages: 3, devisPrecedent: false, devisCree: false };
    expect(gpImportMessage({ ...base, statut: "importe", version: 1 })).toBe("Transmis à Gestion Pro : import version 1 — 3 ouvrages, 4 lignes, 1 007,00 € HT estimatifs. Le chiffrage (prix de vente, marge, TVA, devis) se fait dans Gestion Pro.".replace(/ (?=007)/, " "));
    expect(gpImportMessage({ ...base, statut: "nouvelle_version", version: 2, devisPrecedent: true })).toContain("le devis déjà créé n'est pas modifié");
    expect(gpImportMessage({ ...base, statut: "deja_importe", version: 1 })).toBe("Déjà transmis à Gestion Pro (version 1) : contenu identique, aucun doublon créé.");
  });
  it("erreurs : source obsolète, contrat invalide, droits, GP inaccessible, réseau (renvoi sans risque)", () => {
    expect(classerErreurEnvoiGp({ code: "PT409", message: "L'estimation a changé", hint: "SOURCE_OBSOLETE" })).toMatchObject({ type: "obsolete", reessayable: false });
    expect(classerErreurEnvoiGp({ code: "22023", message: "Version de contrat non prise en charge : 2.0.0", hint: "CONTRAT_INVALIDE" }))
      .toEqual({ type: "contrat", message: "Contrat refusé par Gestion Pro : Version de contrat non prise en charge : 2.0.0", reessayable: false });
    expect(classerErreurEnvoiGp({ code: "42501", message: "Gestion Pro n'est pas accessible pour cette entreprise", hint: "GP_INACCESSIBLE" })).toMatchObject({ type: "gp_inaccessible" });
    expect(classerErreurEnvoiGp({ code: "42501", message: "Envoi vers Gestion Pro non autorisé" })).toMatchObject({ type: "droits", reessayable: false });
    expect(classerErreurEnvoiGp({ code: "PT503", message: "ELSATIA est temporairement en lecture seule" })).toMatchObject({ type: "gp_inaccessible", reessayable: true });
    for (const e of [null, { message: "TypeError: Failed to fetch" }, { code: "", message: "" }, { code: "PGRST000" }, { code: "08006" }, { code: "503" }]) {
      expect(classerErreurEnvoiGp(e)).toMatchObject({ type: "reseau", reessayable: true });
    }
    expect(classerErreurEnvoiGp({ code: "XX000", message: "boom" })).toMatchObject({ type: "contrat", message: "Envoi refusé par Gestion Pro : boom" });
  });
  it("historique des envois vu depuis Tools", () => {
    expect(gpEnvoisFromJson([{ importId: "i1", etat: "existant", version: 1, le: "2026-10-01T00:00:00Z", montant: "1007.00", lignes: 4, ouvrages: 3, contractVersion: "1.0.0", priseEnCharge: true, nouvelleVersion: true }]))
      .toEqual([{ importId: "i1", etat: "existant", version: 1, le: "2026-10-01T00:00:00Z", montant: 1007, lignes: 4, ouvrages: 3, contractVersion: "1.0.0", priseEnCharge: true, nouvelleVersion: true }]);
    expect(gpEnvoisFromJson(null)).toEqual([]);
  });
});
