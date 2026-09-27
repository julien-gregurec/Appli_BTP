import { describe, expect, it } from "vitest";
import { actor, fixedClock, releveFixture, sequentialUuid, TENANT_A, TENANT_B, USER_ADMIN, USER_OTHER, USER_OWNER } from "./fixtures";
import { InMemoryReleveRepository, ReleveConflictError } from "./repository";
import { RelevePermissionError, ReleveService } from "./service";
import {
  breadcrumbFor, breadcrumbText, deletedNodes, deletionImpact, deletionImpactText, etageNiveauLabel, filterReleves, matchReleve,
  moveInOrder, normalizeSearch, searchStructure, siblingsOf, suggestEtages,
} from "./terrain";
import { typeNiveauParDefaut, validateChantierDraft, validateNodePatch, ReleveValidationError } from "./validation";

function setup() {
  const repository = new InMemoryReleveRepository({ actorId: USER_OWNER, now: fixedClock(), uuid: sequentialUuid("aaaa") });
  const owner = new ReleveService(repository, actor(), sequentialUuid("0001"));
  return { repository, owner };
}

async function seed(service: ReleveService) {
  const releve = await service.create({ nom: "Résidence Les Tilleuls", chantierNom: "Chantier Nord", clientNom: "SCI Tilleuls", reference: "CH-14" });
  const batiment = await service.addBatiment(releve.id, { nom: "Bâtiment A" });
  const rdc = await service.addEtage(releve.id, batiment.id, { nom: "RDC", niveau: 0 });
  const r1 = await service.addEtage(releve.id, batiment.id, { nom: "R+1", niveau: 1, hauteurSousPlafondMm: 2500 });
  const est = await service.addZone(releve.id, r1.id, { nom: "Zone Est", type: "aile" });
  const bureau = await service.addPiece(releve.id, r1.id, { nom: "Bureau 12", usage: "bureau", zoneId: est.id, commentaire: "Fissure", statut: "releve" });
  const couloir = await service.addPiece(releve.id, r1.id, { nom: "Couloir", usage: "circulation" });
  const wc = await service.addPiece(releve.id, rdc.id, { nom: "WC", usage: "wc" });
  return { releve, batiment, rdc, r1, est, bureau, couloir, wc };
}

describe("validation Lot 3 (formulaires)", () => {
  it("chantier : client, référence, description, date, statut", () => {
    const result = validateChantierDraft({ nom: "Chantier", clientNom: " SCI ", reference: "R-1", dateReleve: "2026-09-27", statut: "a_relever" });
    expect(result.ok && result.value).toMatchObject({ clientNom: "SCI", reference: "R-1", dateReleve: "2026-09-27", statut: "a_relever" });
    expect(validateChantierDraft({ nom: "C", dateReleve: "27/09/2026" }).ok).toBe(false);
    expect(validateChantierDraft({ nom: "C", statut: "fini" }).ok).toBe(false);
  });

  it("patch partiel : seules les clés présentes, champs non modifiables refusés", () => {
    expect(validateNodePatch("piece", { commentaire: "  RAS  " })).toEqual({ ok: true, value: { commentaire: "RAS" } });
    expect(validateNodePatch("piece", { commentaire: "" })).toEqual({ ok: true, value: { commentaire: null } });
    expect(validateNodePatch("piece", { nom: "" }).ok).toBe(false);
    expect(validateNodePatch("piece", { etageId: "e3000000-0000-0000-0000-000000000001" }).ok).toBe(false);
    expect(validateNodePatch("piece", { surfaceCalculeeMm2: 12 }).ok).toBe(false);
    expect(validateNodePatch("etage", { typeNiveau: "combles", niveau: 3 }).ok).toBe(true);
    expect(validateNodePatch("etage", { hauteurSousPlafondMm: 100 }).ok).toBe(false);
    expect(validateNodePatch("zone", {}).ok).toBe(false);
  });

  it("type de niveau déduit : sous-sol, RDC, étage", () => {
    expect([-1, 0, 2].map(typeNiveauParDefaut)).toEqual(["sous_sol", "rdc", "etage"]);
    expect(etageNiveauLabel({ niveau: 3, typeNiveau: "combles" })).toBe("Combles");
    expect(etageNiveauLabel({ niveau: 1, typeNiveau: null })).toBe("R+1");
    expect(etageNiveauLabel({ niveau: -2, typeNiveau: "sous_sol" })).toBe("Sous-sol R-2");
    expect(suggestEtages([{ niveau: 0, deletedAt: null }, { niveau: 1, deletedAt: null }]).map((item) => item.nom)).toEqual(["R+2", "Combles", "Sous-sol"]);
  });
});

describe("navigation : fil d'Ariane", () => {
  it("Projet › Chantier › Bâtiment › Étage › Zone › Pièce", async () => {
    const { owner } = setup();
    const { releve, bureau, couloir } = await seed(owner);
    const structure = await owner.get(releve.id);
    expect(breadcrumbText(breadcrumbFor(structure, { kind: "piece", id: bureau.id })))
      .toBe("Résidence Les Tilleuls › Chantier Nord › Bâtiment A › R+1 › Zone Est › Bureau 12");
    expect(breadcrumbFor(structure, { kind: "piece", id: couloir.id }).map((item) => item.level)).toEqual(["projet", "chantier", "batiment", "etage", "piece"]);
    expect(breadcrumbFor(structure, null)).toHaveLength(1);
    expect(breadcrumbFor(structure, { kind: "piece", id: "inconnu" })).toHaveLength(1);
  });
});

describe("ReleveService — Lot 3 terrain", () => {
  it("premier chantier amorcé avec le client et la référence du projet", async () => {
    const { owner } = setup();
    const { releve } = await seed(owner);
    const { chantiers } = await owner.get(releve.id);
    expect(chantiers[0]).toMatchObject({ nom: "Chantier Nord", clientNom: "SCI Tilleuls", reference: "CH-14", statut: "en_cours" });
  });

  it("autosave : modification avec contrôle de révision, conflit sans écrasement silencieux", async () => {
    const { owner } = setup();
    const { releve, bureau } = await seed(owner);
    const updated = await owner.updateNode(releve.id, "piece", bureau.id, { commentaire: "Reprise enduit" }, bureau.revision);
    expect(updated).toMatchObject({ commentaire: "Reprise enduit", revision: bureau.revision + 1 });
    // Deuxième onglet resté sur l'ancienne révision.
    await expect(owner.updateNode(releve.id, "piece", bureau.id, { commentaire: "Autre" }, bureau.revision)).rejects.toBeInstanceOf(ReleveConflictError);
    const structure = await owner.get(releve.id);
    expect(structure.pieces.find((piece) => piece.id === bureau.id)?.commentaire).toBe("Reprise enduit");
  });

  it("relevé : sauvegarde de l'en-tête avec révision ; le partage exige `share`", async () => {
    const { owner, repository } = setup();
    const { releve } = await seed(owner);
    const saved = await owner.updateReleve(releve.id, { statut: "en_cours", reference: "  R-9 " }, releve.revision);
    expect(saved).toMatchObject({ statut: "en_cours", reference: "R-9" });
    await expect(owner.updateReleve(releve.id, { nom: "X" }, releve.revision)).rejects.toBeInstanceOf(ReleveConflictError);
    await repository.updateReleve(releve.id, { visibilite: "entreprise" }, saved.revision);
    const member = new ReleveService(repository, actor({ userId: USER_OTHER }));
    await expect(member.updateReleve(releve.id, { visibilite: "prive" }, saved.revision + 1)).rejects.toBeInstanceOf(RelevePermissionError);
  });

  it("déplacement : pièce vers une zone du même étage, jamais vers une zone d'un autre étage", async () => {
    const { owner } = setup();
    const { releve, rdc, couloir, est } = await seed(owner);
    await owner.updateNode(releve.id, "piece", couloir.id, { zoneId: est.id });
    const autre = await owner.addZone(releve.id, rdc.id, { nom: "Plateau", type: "plateau" });
    await expect(owner.updateNode(releve.id, "piece", couloir.id, { zoneId: autre.id })).rejects.toThrow(/Zone/);
  });

  it("duplication : sous-structure copiée, constats non recopiés, jamais de photos ni mesures", async () => {
    const { owner, repository } = setup();
    const { releve, batiment, r1, bureau } = await seed(owner);
    const copieId = await owner.duplicateNode(releve.id, "batiment", batiment.id, "Bâtiment B");
    const structure = await owner.get(releve.id);
    const etages = structure.etages.filter((etage) => etage.batimentId === copieId);
    expect(etages.map((etage) => etage.nom)).toEqual(["RDC", "R+1"]);
    const pieces = structure.pieces.filter((piece) => etages.some((etage) => etage.id === piece.etageId));
    expect(pieces).toHaveLength(3);
    expect(pieces.every((piece) => piece.statut === "a_relever" && piece.commentaire === null)).toBe(true);
    const bureauCopie = pieces.find((piece) => piece.nom === "Bureau 12")!;
    expect(structure.zones.find((zone) => zone.id === bureauCopie.zoneId)?.etageId).toBe(bureauCopie.etageId);
    const etageCopie = await owner.duplicateNode(releve.id, "etage", r1.id);
    expect((await owner.get(releve.id)).etages.find((etage) => etage.id === etageCopie)).toMatchObject({ nom: "R+2", niveau: 2, typeNiveau: "etage" });
    const pieceCopie = await owner.duplicateNode(releve.id, "piece", bureau.id);
    expect((await owner.get(releve.id)).pieces.find((piece) => piece.id === pieceCopie)).toMatchObject({ nom: "Bureau 12 (copie)", zoneId: bureau.zoneId, commentaire: null });
    const [journal] = (await owner.listActivity(releve.id)).filter((entry) => entry.action === "duplication" && entry.entiteId === copieId);
    expect(journal.details).toMatchObject({ elements_copies: 0, medias_copies: 0, noeuds: 1 + 2 + 1 + 3 });
    expect(repository).toBeDefined();
  });

  it("réordonnancement : monter / descendre sans changer les identifiants", async () => {
    const { owner } = setup();
    const { releve, r1, bureau, couloir } = await seed(owner);
    const douche = await owner.addPiece(releve.id, r1.id, { nom: "Douche", usage: "salle_d_eau" });
    await owner.move(releve.id, "piece", douche.id, -2);
    const structure = await owner.get(releve.id);
    expect(siblingsOf(structure, "piece", bureau.id).map((piece) => piece.nom)).toEqual(["Douche", "Bureau 12", "Couloir"]);
    expect(structure.pieces.find((piece) => piece.id === couloir.id)?.id).toBe(couloir.id);
    expect(moveInOrder(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
    expect(await owner.move(releve.id, "piece", douche.id, -1)).toBe(0);
    await expect(owner.reorder(releve.id, "piece", [bureau.id, couloir.id])).rejects.toBeInstanceOf(ReleveConflictError);
  });

  it("suppression maîtrisée : impact annoncé, corbeille, restauration sous parent actif", async () => {
    const { owner } = setup();
    const { releve, batiment, r1, est, bureau } = await seed(owner);
    const structure = await owner.get(releve.id);
    expect(deletionImpact(structure, { kind: "batiment", id: batiment.id })).toMatchObject({ etages: 2, zones: 1, pieces: 3 });
    expect(deletionImpactText(deletionImpact(structure, { kind: "zone", id: est.id }))).toMatch(/1 pièce\(s\) resteront sur l'étage/);
    await owner.removeNode(releve.id, "etage", r1.id);
    const after = await owner.get(releve.id);
    expect(deletedNodes(after).map((node) => `${node.kind}:${node.nom}`)).toEqual(["etage:R+1"]);
    await expect(owner.restoreNode(releve.id, "piece", bureau.id)).rejects.toThrow(/parent/);
    await owner.restoreNode(releve.id, "etage", r1.id);
    expect((await owner.get(releve.id)).pieces.filter((piece) => !piece.deletedAt)).toHaveLength(3);
    const actions = (await owner.listActivity(releve.id)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["creation", "suppression", "restauration"]));
  });

  it("audit : création, renommage, déplacement, réordonnancement", async () => {
    const { owner } = setup();
    const { releve, couloir, est, r1 } = await seed(owner);
    await owner.renameNode(releve.id, "piece", couloir.id, "Dégagement");
    await owner.updateNode(releve.id, "piece", couloir.id, { zoneId: est.id });
    const extra = await owner.addPiece(releve.id, r1.id, { nom: "Local", usage: "local_technique" });
    await owner.move(releve.id, "piece", extra.id, -1);
    const actions = (await owner.listActivity(releve.id)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["renommage", "deplacement", "reordonnancement", "creation"]));
  });

  it("recherche : chantier, bâtiment, pièce ; insensible aux accents ; limitée au tenant", async () => {
    const { owner, repository } = setup();
    const { releve } = await seed(owner);
    expect((await owner.search("bureau")).map((hit) => `${hit.entite}:${hit.libelle}`)).toEqual(["piece:Bureau 12"]);
    expect((await owner.search("RESIDENCE")).map((hit) => hit.entite)).toEqual(["releve"]);
    expect((await owner.search("ch-14")).map((hit) => hit.entite)).toEqual(["releve", "chantier"]);
    expect(await owner.search("b")).toEqual([]);
    const other = new ReleveService(repository, actor({ tenantId: TENANT_B, userId: USER_ADMIN, role: "tools_releve_admin" }));
    expect(await other.search("bureau")).toEqual([]);
    const structure = await owner.get(releve.id);
    expect(searchStructure(structure, "batiment a").map((hit) => hit.entite)).toEqual(["batiment"]);
    expect(normalizeSearch("Séjour Œuvre")).toBe("sejour ouvre");
  });

  it("permissions : consultation et autre tenant ne modifient, ne dupliquent ni ne réordonnent", async () => {
    const { owner, repository } = setup();
    const { releve, bureau } = await seed(owner);
    await owner.setVisibility(releve.id, "entreprise");
    const consultation = new ReleveService(repository, actor({ userId: USER_OTHER, role: "tools_releve_consultation" }));
    await expect(consultation.updateNode(releve.id, "piece", bureau.id, { nom: "X" })).rejects.toBeInstanceOf(RelevePermissionError);
    await expect(consultation.duplicateNode(releve.id, "piece", bureau.id)).rejects.toBeInstanceOf(RelevePermissionError);
    await expect(consultation.move(releve.id, "piece", bureau.id, 1)).rejects.toBeInstanceOf(RelevePermissionError);
    expect((await consultation.listActivity(releve.id)).length).toBeGreaterThan(0);
    const other = new ReleveService(repository, actor({ tenantId: TENANT_B, userId: USER_ADMIN, role: "tools_releve_admin" }));
    await expect(other.duplicateNode(releve.id, "piece", bureau.id)).rejects.toThrow(/introuvable/);
    expect(TENANT_A).not.toBe(TENANT_B);
  });
});

describe("filtres de la liste : actifs, archivés, récents, corbeille", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  const releves = [
    releveFixture({ id: "e1000000-0000-0000-0000-000000000001" as never, nom: "Actif récent", updatedAt: "2026-09-26T10:00:00.000Z" }),
    releveFixture({ id: "e1000000-0000-0000-0000-000000000002" as never, nom: "Actif ancien", updatedAt: "2026-06-01T10:00:00.000Z" }),
    releveFixture({ id: "e1000000-0000-0000-0000-000000000003" as never, nom: "Archivé", statut: "archive", updatedAt: "2026-09-20T10:00:00.000Z" }),
    releveFixture({ id: "e1000000-0000-0000-0000-000000000004" as never, nom: "Supprimé", deletedAt: "2026-09-25T10:00:00.000Z" }),
  ];
  it.each([
    ["actifs", ["Actif récent", "Actif ancien"]],
    ["archives", ["Archivé"]],
    ["recents", ["Actif récent", "Archivé"]],
    ["corbeille", ["Supprimé"]],
  ] as const)("%s", (filter, expected) => {
    expect(filterReleves(releves, filter, now).map((releve) => releve.nom)).toEqual(expected);
  });
  it("filtre texte local", () => {
    expect(matchReleve(releves[0], "strasbourg")).toBe(true);
    expect(matchReleve(releves[0], "lyon")).toBe(false);
    expect(ReleveValidationError).toBeDefined();
  });
});
