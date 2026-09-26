import { describe, expect, it } from "vitest";
import { actor, fixedClock, sequentialUuid, TENANT_A, USER_ADMIN, USER_OTHER, USER_OWNER } from "./fixtures";
import { buildReleveTree, checkStructureIntegrity, niveauLabel, structureStats } from "./hierarchy";
import { InMemoryReleveRepository, ReleveConflictError } from "./repository";
import { RelevePermissionError, ReleveService } from "./service";
import { ReleveValidationError } from "./validation";

function setup() {
  const repository = new InMemoryReleveRepository({ actorId: USER_OWNER, now: fixedClock(), uuid: sequentialUuid("aaaa") });
  const owner = new ReleveService(repository, actor(), sequentialUuid("0001"));
  return { repository, owner };
}

async function seed(service: ReleveService) {
  const releve = await service.create({ nom: "Relevé T3", chantierNom: "Rue des Lilas", chantierCodePostal: "67000" });
  const batiment = await service.addBatiment(releve.id, { nom: "Bâtiment A" });
  const rdc = await service.addEtage(releve.id, batiment.id, { nom: "Rez-de-chaussée", niveau: 0, hauteurSousPlafondMm: 2500 });
  const etage1 = await service.addEtage(releve.id, batiment.id, { nom: "Étage", niveau: 1 });
  const logement = await service.addZone(releve.id, rdc.id, { nom: "Logement 1" });
  const sejour = await service.addPiece(releve.id, rdc.id, { nom: "Séjour", usage: "sejour", zoneId: logement.id });
  const palier = await service.addPiece(releve.id, rdc.id, { nom: "Palier", usage: "degagement" });
  const chambre = await service.addPiece(releve.id, etage1.id, { nom: "Chambre", usage: "chambre" });
  return { releve, batiment, rdc, etage1, logement, sejour, palier, chambre };
}

describe("ReleveService — hiérarchie chantier → bâtiment → étage → zone → pièce", () => {
  it("crée une structure complète sans scan et la restitue en arbre ordonné", async () => {
    const { owner } = setup();
    const { releve } = await seed(owner);
    expect(releve).toMatchObject({ kind: "releve", entrepriseId: TENANT_A, proprietaireId: USER_OWNER, visibilite: "prive", revision: 1 });
    const structure = await owner.get(releve.id);
    expect(checkStructureIntegrity(structure)).toEqual([]);
    expect(structureStats(structure)).toEqual({ batiments: 1, etages: 2, zones: 1, pieces: 3 });
    const tree = buildReleveTree(structure);
    expect(tree.chantier.nom).toBe("Rue des Lilas");
    const [batiment] = tree.batiments;
    expect(batiment.etages.map((node) => niveauLabel(node.etage.niveau))).toEqual(["RDC", "R+1"]);
    expect(batiment.etages[0].zones[0].pieces.map((piece) => piece.nom)).toEqual(["Séjour"]);
    expect(batiment.etages[0].piecesSansZone.map((piece) => piece.nom)).toEqual(["Palier"]);
  });

  it("attribue un ordre croissant aux frères", async () => {
    const { owner } = setup();
    const { releve, batiment } = await seed(owner);
    const second = await owner.addBatiment(releve.id, { nom: "Bâtiment B" });
    expect([batiment.ordre, second.ordre]).toEqual([0, 1]);
  });

  it("refuse une zone d'un autre étage et un parent inexistant", async () => {
    const { owner } = setup();
    const { releve, etage1, logement } = await seed(owner);
    await expect(owner.addPiece(releve.id, etage1.id, { nom: "Intrus", zoneId: logement.id })).rejects.toThrow(/Zone/);
    await expect(owner.addEtage(releve.id, "e2000000-0000-0000-0000-00000000ffff", { nom: "X", niveau: 3 })).rejects.toThrow(/Bâtiment/);
  });

  it("valide les saisies avant toute écriture", async () => {
    const { owner } = setup();
    await expect(owner.create({ nom: "", chantierNom: "" })).rejects.toBeInstanceOf(ReleveValidationError);
  });

  it("supprime en cascade et restaure symétriquement, sans ranimer une suppression antérieure", async () => {
    const { owner } = setup();
    const { releve, batiment, palier } = await seed(owner);
    await owner.removeNode(releve.id, "piece", palier.id);
    await owner.removeNode(releve.id, "batiment", batiment.id);
    expect(structureStats(await owner.get(releve.id))).toEqual({ batiments: 0, etages: 0, zones: 0, pieces: 0 });
    await owner.restoreNode(releve.id, "batiment", batiment.id);
    expect(structureStats(await owner.get(releve.id))).toEqual({ batiments: 1, etages: 2, zones: 1, pieces: 2 });
  });

  it("une zone supprimée libère ses pièces vers l'étage", async () => {
    const { owner } = setup();
    const { releve, logement } = await seed(owner);
    await owner.removeNode(releve.id, "zone", logement.id);
    const tree = buildReleveTree(await owner.get(releve.id));
    expect(tree.batiments[0].etages[0].piecesSansZone.map((piece) => piece.nom)).toEqual(["Séjour", "Palier"]);
  });

  it("numérote les versions et renseigne la révision source", async () => {
    const { owner } = setup();
    const { releve } = await seed(owner);
    const v1 = await owner.createVersion(releve.id, "Relevé initial");
    const v2 = await owner.createVersion(releve.id);
    expect([v1.numero, v2.numero, v1.libelle, v2.libelle]).toEqual([1, 2, "Relevé initial", null]);
    expect((await owner.listVersions(releve.id)).map((version) => version.numero)).toEqual([2, 1]);
  });

  it("détecte un conflit de révision", async () => {
    const { owner, repository } = setup();
    const { releve } = await seed(owner);
    await owner.rename(releve.id, "Relevé T3 bis");
    await expect(repository.updateReleve(releve.id, { nom: "Périmé" }, 1)).rejects.toBeInstanceOf(ReleveConflictError);
  });
});

describe("ReleveService — permissions appliquées avant le dépôt", () => {
  it("un collègue ne voit ni ne modifie un relevé privé, puis le peut une fois partagé", async () => {
    const { owner, repository } = setup();
    const { releve, rdc } = await seed(owner);
    const colleague = new ReleveService(repository, actor({ userId: USER_OTHER, role: "tools_pro" }));
    expect(await colleague.list()).toEqual([]);
    await expect(colleague.get(releve.id)).rejects.toBeInstanceOf(RelevePermissionError);
    await owner.setVisibility(releve.id, "entreprise");
    expect((await colleague.list()).map((item) => item.id)).toEqual([releve.id]);
    await expect(colleague.addPiece(releve.id, rdc.id, { nom: "Cuisine", usage: "cuisine" })).resolves.toMatchObject({ nom: "Cuisine" });
    await expect(colleague.setVisibility(releve.id, "prive")).rejects.toMatchObject({ reason: "ownership" });
    await expect(colleague.remove(releve.id)).rejects.toMatchObject({ reason: "ownership" });
  });

  it("consultation : lecture seule", async () => {
    const { owner, repository } = setup();
    const { releve } = await seed(owner);
    await owner.setVisibility(releve.id, "entreprise");
    const reader = new ReleveService(repository, actor({ userId: USER_OTHER, role: "tools_releve_consultation" }));
    await expect(reader.get(releve.id)).resolves.toBeTruthy();
    await expect(reader.addBatiment(releve.id, { nom: "X" })).rejects.toMatchObject({ reason: "role" });
    await expect(reader.create({ nom: "X", chantierNom: "Y" })).rejects.toMatchObject({ reason: "role" });
  });

  it("sans entitlement releve-metre, même la liste est refusée", async () => {
    const { repository } = setup();
    const free = new ReleveService(repository, actor({ hasReleveCapability: false }));
    await expect(free.list()).rejects.toMatchObject({ reason: "entitlement" });
  });

  it("un autre tenant ne peut pas atteindre un relevé, même avec son identifiant", async () => {
    const { owner, repository } = setup();
    const { releve } = await seed(owner);
    const foreign = new ReleveService(repository, actor({ tenantId: "b0000000-0000-0000-0000-000000000001" as never, userId: USER_ADMIN, role: "tools_releve_admin" }));
    await expect(foreign.get(releve.id)).rejects.toThrow(/introuvable/);
    expect(await foreign.list()).toEqual([]);
  });

  it("corbeille : suppression puis restauration par le propriétaire, plus aucune écriture entre-temps", async () => {
    const { owner } = setup();
    const { releve } = await seed(owner);
    await owner.remove(releve.id);
    expect(await owner.list()).toEqual([]);
    expect((await owner.listDeleted()).map((item) => item.id)).toEqual([releve.id]);
    await expect(owner.addBatiment(releve.id, { nom: "X" })).rejects.toMatchObject({ reason: "deleted" });
    await owner.restore(releve.id);
    expect((await owner.list()).map((item) => item.id)).toEqual([releve.id]);
  });
});
