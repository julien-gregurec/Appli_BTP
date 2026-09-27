import { describe, expect, it } from "vitest";
import { AutosaveController, type AutosaveTimers } from "./autosave";
import { breadcrumbOf, pieceFiche, surfaceM2, surfaceMm2FromM2, volumeM3 } from "./fiche";
import { actor, fixedClock, sequentialUuid, TENANT_A, TENANT_B, USER_OTHER, USER_OWNER } from "./fixtures";
import { buildReleveTree, compareEtages, deletionImpact, etageLabel, niveauLabel, siblingsOf, suggestNextEtage, trashOf } from "./hierarchy";
import type { ReleveElement } from "./model";
import { InMemoryReleveRepository, ReleveConflictError } from "./repository";
import { RelevePermissionError, ReleveService } from "./service";
import { ReleveValidationError, validateNodePatch } from "./validation";

function setup() {
  const repository = new InMemoryReleveRepository({ actorId: USER_OWNER, now: fixedClock(), uuid: sequentialUuid("bbbb") });
  const service = new ReleveService(repository, actor(), sequentialUuid("0005"));
  return { repository, service };
}

async function terrain(service: ReleveService) {
  const releve = await service.create({ nom: "Résidence Les Tilleuls", reference: "REL-042", chantierNom: "Bâtiment principal", chantierVille: "Colmar", clientNom: "SCI Tilleuls", dateReleve: "2026-09-28" });
  const structure = await service.get(releve.id);
  const chantier = structure.chantiers[0];
  const batA = await service.addBatiment(releve.id, { nom: "Bâtiment A" });
  const batB = await service.addBatiment(releve.id, { nom: "Bâtiment B" });
  const sousSol = await service.addEtage(releve.id, batA.id, { nom: "Sous-sol", niveau: -1, categorieNiveau: "sous_sol" });
  const rdc = await service.addEtage(releve.id, batA.id, { nom: "RDC", niveau: 0 });
  const r1 = await service.addEtage(releve.id, batA.id, { nom: "R+1", niveau: 1, hauteurSousPlafondMm: 2500 });
  const combles = await service.addEtage(releve.id, batA.id, { nom: "Combles", niveau: null, categorieNiveau: "combles" });
  const appart = await service.addZone(releve.id, r1.id, { nom: "Appartement 12", type: "appartement" });
  const technique = await service.addZone(releve.id, rdc.id, { nom: "Chaufferie", type: "zone_technique" });
  const sejour = await service.addPiece(releve.id, r1.id, { nom: "Séjour", usage: "sejour", zoneId: appart.id, statut: "en_cours", surfaceDeclareeMm2: 24.5e6 });
  const chambre = await service.addPiece(releve.id, r1.id, { nom: "Chambre", usage: "chambre", zoneId: appart.id });
  const palier = await service.addPiece(releve.id, r1.id, { nom: "Palier", usage: "circulation" });
  const local = await service.addPiece(releve.id, rdc.id, { nom: "Local chaudière", usage: "local_technique", zoneId: technique.id, hauteurSousPlafondMm: 2200 });
  return { releve, chantier, batA, batB, sousSol, rdc, r1, combles, appart, technique, sejour, chambre, palier, local };
}

describe("Lot 3 — chantier métier", () => {
  it("le premier chantier reprend client, référence et date du relevé ; champs modifiables avec contrôle de révision", async () => {
    const { service } = setup();
    const { releve, chantier } = await terrain(service);
    expect(chantier).toMatchObject({ nom: "Bâtiment principal", ville: "Colmar", clientNom: "SCI Tilleuls", reference: "REL-042", dateReleve: "2026-09-28", statut: "en_cours" });
    const revision = await service.updateNode(releve.id, "chantier", chantier.id, { description: "Relevé avant rénovation", codePostal: "68000", statut: "termine" }, chantier.revision);
    expect(revision).toBe(chantier.revision + 1);
    const updated = (await service.get(releve.id)).chantiers[0];
    expect(updated).toMatchObject({ description: "Relevé avant rénovation", codePostal: "68000", statut: "termine" });
    // Onglet périmé : même révision de départ → conflit, rien n'est écrasé.
    await expect(service.updateNode(releve.id, "chantier", chantier.id, { description: "Écrasement" }, chantier.revision)).rejects.toBeInstanceOf(ReleveConflictError);
    expect((await service.get(releve.id)).chantiers[0].description).toBe("Relevé avant rénovation");
  });

  it("patchs refusés : champ non modifiable, date invalide, statut inconnu, patch vide", () => {
    expect(validateNodePatch("chantier", { releveId: "x" })).toMatchObject({ ok: false, issues: [{ path: "releveId" }] });
    expect(validateNodePatch("chantier", { dateReleve: "28/09/2026" })).toMatchObject({ ok: false, issues: [{ path: "dateReleve" }] });
    expect(validateNodePatch("chantier", { statut: "perdu" })).toMatchObject({ ok: false });
    expect(validateNodePatch("piece", {})).toMatchObject({ ok: false });
    expect(validateNodePatch("piece", { nom: "  Salle d'eau  ", surfaceDeclareeMm2: null })).toEqual({ ok: true, value: { nom: "Salle d'eau", surfaceDeclareeMm2: null } });
  });
});

describe("Lot 3 — étages libres, zones, pièces", () => {
  it("sous-sol, RDC, R+1, combles sans numéro : tri et libellés", async () => {
    const { service } = setup();
    const { releve, batA } = await terrain(service);
    const tree = buildReleveTree(await service.get(releve.id));
    const etages = tree.chantiers[0].batiments.find((node) => node.batiment.id === batA.id)!.etages.map((node) => node.etage);
    expect(etages.map((etage) => [etage.nom, etageLabel(etage)])).toEqual([["Sous-sol", "Sous-sol · R-1"], ["RDC", "RDC"], ["R+1", "R+1"], ["Combles", "Combles"]]);
    expect(niveauLabel(1.5)).toBe("R+1,5");
    expect(niveauLabel(null)).toBe("—");
    expect(suggestNextEtage(etages)).toEqual({ niveau: 2, categorieNiveau: "etage", nom: "R+2" });
    expect(suggestNextEtage([])).toEqual({ niveau: 0, categorieNiveau: "rdc", nom: "RDC" });
    expect([...etages].reverse().sort(compareEtages).map((etage) => etage.nom)).toEqual(["Sous-sol", "RDC", "R+1", "Combles"]);
  });

  it("fiche pièce : type, statut, hauteur (pièce ou étage), surface déclarée, volume, préparation des lots suivants", async () => {
    const { service } = setup();
    const { releve, sejour, local, r1 } = await terrain(service);
    const structure = await service.get(releve.id);
    const elements = [
      { id: "e1", type: "materiau", pieceId: sejour.id, deletedAt: null }, { id: "e2", type: "photo_anchor", pieceId: sejour.id, deletedAt: null },
      { id: "e3", type: "mesure", pieceId: sejour.id, deletedAt: null }, { id: "e4", type: "mesure", pieceId: sejour.id, deletedAt: "2026-01-01" },
    ] as unknown as ReleveElement[];
    const fiche = pieceFiche(structure, sejour.id, elements)!;
    expect(fiche).toMatchObject({ hauteurMm: 2500, hauteurProvenance: "etage", surfaceMm2: 24.5e6, surfaceProvenance: "declaree", preparation: { revetements: 1, photos: 1, mesures: 1, equipements: 0, murs: 0 } });
    expect(fiche.piece).toMatchObject({ usage: "sejour", statut: "en_cours" });
    expect([surfaceM2(fiche.surfaceMm2), volumeM3(fiche.volumeMm3)]).toEqual([24.5, 61.25]);
    expect(surfaceMm2FromM2(12.34)).toBe(12_340_000);
    const technique = pieceFiche(structure, local.id)!;
    expect(technique).toMatchObject({ hauteurMm: 2200, hauteurProvenance: "piece", surfaceMm2: null, volumeMm3: null, surfaceProvenance: "inconnue" });
    expect(pieceFiche(structure, "inconnue")).toBeNull();
    expect(breadcrumbOf(structure, { kind: "piece", id: sejour.id }).map((crumb) => crumb.label)).toEqual(["Résidence Les Tilleuls", "Bâtiment A", "R+1", "Appartement 12", "Séjour"]);
    expect(breadcrumbOf(structure, { kind: "etage", id: r1.id }).map((crumb) => crumb.kind)).toEqual(["releve", "batiment", "etage"]);
  });

  it("pièce déplacée d'une zone à l'autre du même étage ; jamais vers une zone d'un autre étage", async () => {
    const { service } = setup();
    const { releve, palier, appart, technique } = await terrain(service);
    await service.updateNode(releve.id, "piece", palier.id, { zoneId: appart.id }, palier.revision);
    expect((await service.get(releve.id)).pieces.find((piece) => piece.id === palier.id)?.zoneId).toBe(appart.id);
    await expect(service.updateNode(releve.id, "piece", palier.id, { zoneId: technique.id }, palier.revision + 1)).rejects.toThrow(/Zone de cet étage/);
  });
});

describe("Lot 3 — ordre, duplication, suppression contrôlée", () => {
  it("réordonne bâtiments, étages, zones et pièces sans casser les relations", async () => {
    const { service } = setup();
    const { releve, batA, batB, sejour, chambre, palier } = await terrain(service);
    expect(await service.move(releve.id, "batiment", batB.id, -1)).toBe(true);
    expect(await service.move(releve.id, "batiment", batB.id, -1)).toBe(false);
    let structure = await service.get(releve.id);
    expect(siblingsOf(structure, "batiment", batA.id)).toEqual([batB.id, batA.id]);
    // Pièces : réordonnées DANS leur zone ; le palier (sans zone) est un groupe distinct.
    expect(siblingsOf(structure, "piece", sejour.id)).toEqual([sejour.id, chambre.id]);
    await service.move(releve.id, "piece", chambre.id, -1);
    structure = await service.get(releve.id);
    expect(siblingsOf(structure, "piece", sejour.id)).toEqual([chambre.id, sejour.id]);
    expect(siblingsOf(structure, "piece", palier.id)).toEqual([palier.id]);
    expect(structure.pieces.find((piece) => piece.id === chambre.id)).toMatchObject({ zoneId: sejour.zoneId, etageId: sejour.etageId });
    await expect(service.reorder(releve.id, "piece", [sejour.id])).rejects.toBeInstanceOf(ReleveValidationError);
    await expect(service.reorder(releve.id, "piece", [sejour.id, palier.id])).rejects.toBeInstanceOf(ReleveValidationError);
  });

  it("duplique un bâtiment (étages, zones, pièces) sans éléments ; statuts remis à « à relever »", async () => {
    const { service, repository } = setup();
    const { releve, batA } = await terrain(service);
    const copie = await service.duplicate(releve.id, "batiment", batA.id);
    const structure = await service.get(releve.id);
    const node = buildReleveTree(structure).chantiers[0].batiments.find((item) => item.batiment.id === copie)!;
    expect(node.batiment.nom).toBe("Bâtiment A (copie)");
    expect(node.etages.map((item) => item.etage.nom)).toEqual(["Sous-sol", "RDC", "R+1", "Combles"]);
    const r1 = node.etages[2];
    expect(r1.zones.map((item) => [item.zone.nom, item.zone.type, item.pieces.map((piece) => [piece.nom, piece.statut, piece.surfaceDeclareeMm2])]))
      .toEqual([["Appartement 12", "appartement", [["Séjour", "a_relever", null], ["Chambre", "a_relever", null]]]]);
    expect(r1.piecesSansZone.map((piece) => piece.nom)).toEqual(["Palier"]);
    expect((await repository.listJournal(releve.id)).find((entry) => entry.action === "duplication")).toMatchObject({ entite: "batiment", entiteId: copie, champs: [`source:${batA.id}`] });
  });

  it("duplique un étage (niveau suivant) et une pièce (même zone)", async () => {
    const { service } = setup();
    const { releve, r1, sejour } = await terrain(service);
    const r2 = await service.duplicate(releve.id, "etage", r1.id, "R+2");
    const piece = await service.duplicate(releve.id, "piece", sejour.id);
    const structure = await service.get(releve.id);
    expect(structure.etages.find((etage) => etage.id === r2)).toMatchObject({ nom: "R+2", niveau: 2, hauteurSousPlafondMm: 2500, altitudeMm: null });
    expect(structure.pieces.filter((item) => item.etageId === r2).map((item) => item.nom)).toEqual(["Séjour", "Chambre", "Palier"]);
    expect(structure.pieces.find((item) => item.id === piece)).toMatchObject({ nom: "Séjour (copie)", zoneId: sejour.zoneId, etageId: sejour.etageId, statut: "a_relever" });
  });

  it("impact affiché avant suppression, corbeille, restauration symétrique", async () => {
    const { service } = setup();
    const { releve, batA, r1, appart } = await terrain(service);
    let structure = await service.get(releve.id);
    expect(deletionImpact(structure, { kind: "batiment", id: batA.id })).toEqual({ batiments: 0, etages: 4, zones: 2, pieces: 4, piecesDetachees: 0 });
    expect(deletionImpact(structure, { kind: "zone", id: appart.id })).toEqual({ batiments: 0, etages: 0, zones: 0, pieces: 0, piecesDetachees: 2 });
    await service.removeNode(releve.id, "etage", r1.id);
    structure = await service.get(releve.id);
    expect(trashOf(structure).map((entry) => [entry.kind, entry.nom, entry.contexte])).toEqual([["etage", "R+1", "Bâtiment A"]]);
    await service.restoreNode(releve.id, "etage", r1.id);
    structure = await service.get(releve.id);
    expect(trashOf(structure)).toEqual([]);
    expect(structure.pieces.filter((piece) => piece.etageId === r1.id && !piece.deletedAt)).toHaveLength(3);
  });
});

describe("Lot 3 — recherche, audit, versions, droits", () => {
  it("recherche chantier, bâtiment, pièce ; filtres actif / archivé / récent", async () => {
    const { service } = setup();
    const { releve } = await terrain(service);
    const archive = await service.create({ nom: "Ancien relevé", chantierNom: "Entrepôt", statut: "archive" });
    const types = async (texte: string, filtre?: "actif" | "archive" | "recent" | "tous") => (await service.search(texte, filtre)).map((result) => `${result.type}:${result.libelle}`);
    expect(await types("chambre")).toEqual(["piece:Chambre"]);
    expect(await types("bâtiment a")).toEqual(["batiment:Bâtiment A"]);
    expect(await types("colmar")).toEqual(expect.arrayContaining(["releve:Résidence Les Tilleuls", "chantier:Bâtiment principal"]));
    expect(await types("")).toEqual(["releve:Résidence Les Tilleuls"]);
    expect(await types("", "archive")).toEqual(["releve:Ancien relevé"]);
    expect(await types("", "tous")).toHaveLength(2);
    expect(await types("", "recent")).toHaveLength(2);
    expect((await service.search("séjour"))[0]).toMatchObject({ releveId: releve.id, contexte: "Résidence Les Tilleuls · R+1" });
    expect(archive.statut).toBe("archive");
  });

  it("journal : création, renommage, déplacement, réordre, suppression, restauration, duplication", async () => {
    const { service } = setup();
    const { releve, batA, batB, palier, appart, sejour } = await terrain(service);
    await service.updateNode(releve.id, "batiment", batA.id, { nom: "Bâtiment Nord" }, batA.revision);
    await service.updateNode(releve.id, "piece", palier.id, { zoneId: appart.id }, palier.revision);
    await service.move(releve.id, "batiment", batB.id, -1);
    await service.removeNode(releve.id, "piece", sejour.id);
    await service.restoreNode(releve.id, "piece", sejour.id);
    await service.duplicate(releve.id, "piece", sejour.id);
    const actions = new Set((await service.journal(releve.id)).map((entry) => `${entry.entite}:${entry.action}`));
    for (const expected of ["releve:creation", "batiment:creation", "batiment:renommage", "piece:deplacement", "batiment:reordre", "piece:suppression", "piece:restauration", "piece:duplication"]) {
      expect(actions).toContain(expected);
    }
  });

  it("version INITIALE créée réellement (idempotent), puis corrigée / projetée / tel que construit", async () => {
    const { service } = setup();
    const { releve } = await terrain(service);
    const initiale = await service.ensureInitialVersion(releve.id);
    expect(initiale).toMatchObject({ numero: 1, typeVersion: "initial", versionBaseId: null });
    expect((await service.ensureInitialVersion(releve.id)).id).toBe(initiale.id);
    const corrigee = await service.createVersion(releve.id, "Après contre-visite", { type: "corrige" });
    const projetee = await service.createVersion(releve.id, null, { type: "projete", baseId: initiale.id });
    const asBuilt = await service.createVersion(releve.id, null, { type: "as_built", baseId: projetee.id });
    expect([corrigee, projetee, asBuilt].map((version) => [version.numero, version.typeVersion, version.versionBaseId])).toEqual([[2, "corrige", initiale.id], [3, "projete", initiale.id], [4, "as_built", projetee.id]]);
  });

  it("consultation : lecture seule ; autre tenant : introuvable", async () => {
    const { service, repository } = setup();
    const { releve, batA } = await terrain(service);
    await service.setVisibility(releve.id, "entreprise");
    const lecteur = new ReleveService(repository, actor({ userId: USER_OTHER, role: "tools_releve_consultation" }));
    expect((await lecteur.get(releve.id)).batiments.length).toBe(2);
    await expect(lecteur.updateNode(releve.id, "batiment", batA.id, { nom: "X" }, batA.revision)).rejects.toBeInstanceOf(RelevePermissionError);
    await expect(lecteur.duplicate(releve.id, "batiment", batA.id)).rejects.toBeInstanceOf(RelevePermissionError);
    await expect(lecteur.move(releve.id, "batiment", batA.id, 1)).rejects.toBeInstanceOf(RelevePermissionError);
    const autre = new ReleveService(repository, actor({ tenantId: TENANT_B }));
    await expect(autre.get(releve.id)).rejects.toThrow(/introuvable/);
    expect(await autre.search("")).toEqual([]);
    expect(TENANT_A).not.toBe(TENANT_B);
  });
});

describe("Lot 3 — enregistrement automatique", () => {
  function fakeTimers() {
    const pending: Array<{ callback: () => void; handle: number }> = []; let next = 0;
    const timers: AutosaveTimers = { set: (callback) => { next += 1; pending.push({ callback, handle: next }); return next; }, clear: (handle) => { const index = pending.findIndex((item) => item.handle === handle); if (index >= 0) pending.splice(index, 1); } };
    return { timers, fire: async () => { const items = pending.splice(0); for (const item of items) item.callback(); await new Promise((resolve) => setTimeout(resolve, 0)); }, pending };
  }
  const conflict = (error: unknown) => error instanceof ReleveConflictError;

  it("regroupe les frappes en une écriture ; saving → saved", async () => {
    const { timers, fire, pending } = fakeTimers();
    const saves: Array<[string, number]> = []; const statuses: string[] = [];
    const controller = new AutosaveController({ value: "Séjour", revision: 3, timers, isConflict: conflict, onChange: (state) => statuses.push(state.status), save: async (value, revision) => { saves.push([value, revision]); return revision + 1; } });
    controller.edit("Séj"); controller.edit("Séjour d"); controller.edit("Séjour double");
    expect(pending).toHaveLength(1);
    await fire();
    expect(saves).toEqual([["Séjour double", 3]]);
    expect(controller.current).toMatchObject({ status: "saved", revision: 4, savedValue: "Séjour double" });
    expect(statuses).toContain("saving");
    controller.edit("Séjour double");
    expect(controller.current.status).toBe("saved");
  });

  it("erreur réseau → error, valeur conservée, retry → saved", async () => {
    let fail = true;
    const controller = new AutosaveController({ value: "A", revision: 1, isConflict: conflict, save: async (_value, revision) => { if (fail) throw new Error("Réseau indisponible"); return revision + 1; } });
    controller.edit("B"); await controller.flush();
    expect(controller.current).toMatchObject({ status: "error", value: "B", savedValue: "A", error: "Réseau indisponible" });
    fail = false; await controller.retry();
    expect(controller.current).toMatchObject({ status: "saved", savedValue: "B", revision: 2 });
    controller.dispose();
  });

  it("conflit de révision → conflict, aucune réécriture tant qu'on n'a pas rechargé", async () => {
    let calls = 0;
    const controller = new AutosaveController({ value: "A", revision: 1, isConflict: conflict, save: async () => { calls += 1; throw new ReleveConflictError(5); } });
    controller.edit("B"); await controller.flush();
    expect(controller.current.status).toBe("conflict");
    controller.edit("C"); await controller.flush(); await controller.retry();
    expect(calls).toBe(1);
    controller.reset("Serveur", 5);
    expect(controller.current).toMatchObject({ status: "idle", value: "Serveur", revision: 5 });
  });

  it("saisie pendant l'enregistrement : rejouée ensuite avec la nouvelle révision", async () => {
    let release: () => void = () => undefined; const saves: Array<[string, number]> = [];
    const controller = new AutosaveController({ value: "A", revision: 1, isConflict: conflict, delayMs: 0, save: (value, revision) => new Promise<number>((resolve) => { saves.push([value, revision]); release = () => resolve(revision + 1); }) });
    controller.edit("B");
    const first = controller.flush();
    controller.edit("BC");
    release(); await new Promise((resolve) => setTimeout(resolve, 0));
    release(); await first;
    expect(saves).toEqual([["B", 1], ["BC", 2]]);
    expect(controller.current).toMatchObject({ status: "saved", savedValue: "BC", revision: 3 });
  });
});
