import { createProjectId, createToolProject, migrateProject, parseProjectFile, type CreateProjectInput, type ToolProject } from "./model";
import type { ProjectRepository } from "./repository";

export type ProjectMutationSink = { changed(project: ToolProject): Promise<void>; deleted(project: ToolProject): Promise<void> };

export class ProjectService {
  constructor(private readonly repository: ProjectRepository, private readonly now: () => Date = () => new Date(), private readonly id: () => string = createProjectId, private readonly mutations?: ProjectMutationSink) {}
  list() { return this.repository.list(); }
  get(id: string) { return this.repository.get(id); }
  async create(input: CreateProjectInput) { const project = createToolProject(input, this.now(), this.id()); await this.repository.put(project); await this.mutations?.changed(project); return project; }
  async save(project: ToolProject, patch: Partial<Pick<ToolProject, "name" | "siteName" | "notes" | "inputParameters" | "options" | "tags">>) {
    const current = migrateProject(project); const next = migrateProject({ ...current, ...patch, units: patch.inputParameters?.unit ?? current.units, updatedAt: this.now().toISOString() }); await this.repository.put(next); await this.mutations?.changed(next); return next;
  }
  async rename(project: ToolProject, name: string) { return this.save(project, { name }); }
  async duplicate(project: ToolProject) {
    const now = this.now().toISOString(); const copy = migrateProject({ ...project, id: this.id(), name: `${project.name} - copie`, createdAt: now, updatedAt: now, archived: false, source: "duplicated" }); await this.repository.put(copy); await this.mutations?.changed(copy); return copy;
  }
  async setArchived(project: ToolProject, archived: boolean) { const next = migrateProject({ ...project, archived, updatedAt: this.now().toISOString() }); await this.repository.put(next); await this.mutations?.changed(next); return next; }
  async delete(project: ToolProject) { await this.mutations?.deleted(project); await this.repository.delete(project.id); }
  async import(content: string) { const parsed = parseProjectFile(content); const now = this.now().toISOString(); const project = migrateProject({ ...parsed, id: this.id(), createdAt: now, updatedAt: now, source: "imported" }); await this.repository.put(project); return project; }
}
