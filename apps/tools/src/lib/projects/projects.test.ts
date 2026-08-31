import { describe, expect, it } from "vitest";
import { createToolProject, parseProjectFile, PROJECT_SCHEMA_VERSION, serializeProject } from "./model";
import { MemoryProjectRepository, projectDatabaseName, projectStorageScope } from "./repository";
import { syncDatabaseName } from "./sync";
import { ProjectService } from "./service";
import { proToolDefaults } from "../pro-engine";

const input = { name: "Plafond salle réunion", siteName: "Lidl Strasbourg", toolId: "fleur-6" as const, inputParameters: proToolDefaults["fleur-6"], notes: "Axe depuis mur façade." };

describe("projets locaux versionnés", () => {
  it("cloisonne les projets et conflits locaux par entreprise", () => {
    const a = projectStorageScope("a0000000-0000-0000-0000-000000000001");
    const b = projectStorageScope("b0000000-0000-0000-0000-000000000001");
    expect(projectDatabaseName(a)).not.toBe(projectDatabaseName(b));
    expect(syncDatabaseName(a)).not.toBe(syncDatabaseName(b));
    expect(projectDatabaseName(projectStorageScope(null))).toBe("elsatia-tools");
  });
  it("crée un projet recalculable sans stocker de SVG ou de résultat", () => {
    const project = createToolProject(input, new Date("2026-08-30T10:00:00Z"), "12345678-1234-1234-1234-123456789012");
    expect(project).toMatchObject({ schemaVersion: PROJECT_SCHEMA_VERSION, toolId: "fleur-6", units: "mm", archived: false });
    expect(project.inputParameters).toEqual(proToolDefaults["fleur-6"]); expect(project).not.toHaveProperty("svg"); expect(project).not.toHaveProperty("geometry");
  });

  it("réalise CRUD, duplication, archivage, restauration et suppression", async () => {
    const repository = new MemoryProjectRepository(); let counter = 0;
    const service = new ProjectService(repository, () => new Date(`2026-08-30T10:00:0${counter}Z`), () => `12345678-1234-1234-1234-${String(++counter).padStart(12, "0")}`);
    const created = await service.create(input); expect(await service.list()).toHaveLength(1);
    const renamed = await service.rename(created, "Salle réunion A"); expect((await service.get(created.id))?.name).toBe("Salle réunion A");
    const copy = await service.duplicate(renamed); expect(copy.id).not.toBe(renamed.id); expect(copy.source).toBe("duplicated");
    const archived = await service.setArchived(copy, true); expect(archived.archived).toBe(true);
    expect((await service.setArchived(archived, false)).archived).toBe(false);
    await service.delete(renamed); expect(await service.get(renamed.id)).toBeNull(); expect(await service.list()).toHaveLength(1);
  });

  it("exporte et importe un fichier portable strictement validé", async () => {
    const source = createToolProject(input, new Date("2026-08-30T10:00:00Z"), "12345678-1234-1234-1234-123456789012");
    expect(parseProjectFile(serializeProject(source))).toEqual(source);
    expect(() => parseProjectFile('{"schemaVersion":999}')).toThrow(/version/);
    expect(() => parseProjectFile(JSON.stringify({ ...source, toolId: "outil-inconnu" }))).toThrow(/inconnu/);
    expect(() => parseProjectFile(JSON.stringify({ ...source, inputParameters: { ...source.inputParameters, attack: "code" } }))).toThrow(/inconnu/);
    const service = new ProjectService(new MemoryProjectRepository(), () => new Date("2026-09-01T00:00:00Z"), () => "abcdefab-1234-1234-1234-123456789012");
    const imported = await service.import(serializeProject(source)); expect(imported.source).toBe("imported"); expect(imported.id).not.toBe(source.id);
  });
});
