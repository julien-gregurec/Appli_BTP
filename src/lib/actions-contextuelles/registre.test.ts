import { describe, expect, it } from "vitest";
import { actionsClient, actionsDevis, actionsFacture, actionsPlanning, type ActionContextuelle } from "./registre";

const par = (liste: ActionContextuelle[], cle: string) => liste.find((a) => a.cle === cle)!;
const tous = null;
const commercial = ["acces_clients", "gerer_clients", "acces_devis", "gerer_devis", "acces_chantiers"];
const poseur = ["acces_chantiers", "acces_planning"];

describe("actions du devis", () => {
  const brouillon = { id: "d1", statut: "brouillon", chantierId: null, clientId: "c1", moteurV2: true, aDesLignes: true };
  it("toute action indisponible porte un motif", () => {
    for (const a of actionsDevis(brouillon, poseur)) if (!a.disponible) expect(a.motif, a.cle).toBeTruthy();
  });
  it("transformer en facture : seulement accepté, avec les droits", () => {
    expect(par(actionsDevis(brouillon, tous), "transformer_facture")).toMatchObject({ disponible: false, motif: "Disponible uniquement lorsque le devis est accepté." });
    expect(par(actionsDevis({ ...brouillon, statut: "accepte" }, tous), "transformer_facture").disponible).toBe(true);
    expect(par(actionsDevis({ ...brouillon, statut: "accepte" }, commercial), "transformer_facture").motif).toMatch(/gerer_factures/);
  });
  it("modifier et ajouter une ligne : brouillon seulement ; supprimer : brouillon, refusé, annulé", () => {
    expect(par(actionsDevis({ ...brouillon, statut: "envoye" }, tous), "modifier").disponible).toBe(false);
    expect(par(actionsDevis({ ...brouillon, statut: "envoye" }, tous), "supprimer").disponible).toBe(false);
    expect(par(actionsDevis({ ...brouillon, statut: "refuse" }, tous), "supprimer").disponible).toBe(true);
  });
  it("un poseur ne peut rien faire, mais voit tout, grisé", () => {
    const liste = actionsDevis(brouillon, poseur);
    expect(liste.length).toBeGreaterThan(15);
    expect(liste.filter((a) => a.disponible).map((a) => a.cle)).toEqual(["apercu", "pdf", "imprimer", "historique"]);
    expect(par(liste, "modifier").motif).toMatch(/gerer_devis/);
  });
  it("la transformation en commande est annoncée indisponible en V1, pas cachée", () => {
    expect(par(actionsDevis(brouillon, tous), "transformer_commande")).toMatchObject({ disponible: false, motif: expect.stringContaining("V1") });
  });
  it("envoyer : droit fin, client rattaché, statut", () => {
    expect(par(actionsDevis({ ...brouillon, clientId: null }, tous), "envoyer").motif).toMatch(/client/);
    expect(par(actionsDevis({ ...brouillon, statut: "annule" }, tous), "envoyer").disponible).toBe(false);
    expect(par(actionsDevis(brouillon, ["gerer_devis"]), "envoyer").disponible).toBe(true);
  });
});

describe("actions du client", () => {
  const client = { id: "c1", telephone: "06 12 34 56 78", email: null, adresse: "1 rue Fictive", statut: "actif" };
  it("appeler, e-mail et localiser suivent les données de la fiche", () => {
    const liste = actionsClient(client, tous);
    expect(par(liste, "appeler")).toMatchObject({ disponible: true, href: "tel:0612345678" });
    expect(par(liste, "email")).toMatchObject({ disponible: false, motif: expect.stringContaining("e-mail") });
    expect(par(liste, "localiser").href).toContain("1%20rue%20Fictive");
  });
  it("un client archivé ne reçoit plus de devis ; jamais de suppression", () => {
    expect(par(actionsClient({ ...client, statut: "archive" }, tous), "nouveau_devis").disponible).toBe(false);
    expect(par(actionsClient(client, tous), "supprimer").disponible).toBe(false);
  });
});

describe("factures et planning", () => {
  it("une facture émise ne se modifie plus mais se relance tant qu'elle n'est pas soldée", () => {
    const f = { id: "f1", statut: "envoyee", resteAPayer: 120, devisOrigineId: "d1", moteurV2: true };
    expect(par(actionsFacture(f, tous), "modifier").motif).toMatch(/avoir/);
    expect(par(actionsFacture(f, tous), "relancer").disponible).toBe(true);
    expect(par(actionsFacture({ ...f, resteAPayer: 0 }, tous), "relancer").disponible).toBe(false);
  });
  it("planning : sans sélection, seules création et impression sont disponibles", () => {
    const liste = actionsPlanning(null, tous);
    expect(liste.filter((a) => a.disponible).map((a) => a.cle)).toEqual(["creer", "imprimer"]);
    expect(par(actionsPlanning({ id: "e", chantierId: "ch", clientId: null, statut: "planifie" }, tous), "chantier").href).toBe("/chantiers/ch");
  });
});
