import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  authorize: vi.fn(),
  context: vi.fn(),
}));
vi.mock("../src/lib/media-service", () => ({
  mediaContext: mocks.context,
  authorizeProject: mocks.authorize,
  MediaError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import {
  createStudioProject,
  updateStudioProject,
  archiveStudioProject,
  restoreStudioProject,
  deleteStudioProject,
  duplicateStudioProject,
  setProjectCover,
  reorderProjectMedia,
  listStudioProjects,
  removeProjectMedia,
} from "../src/lib/projects";
const id = "53000000-0000-0000-0000-000000000001";
const input = {
  name: "Projet",
  project_type: "travel",
  description: "",
  location_label: "",
  started_at: null,
  ended_at: null,
  target_aspect_ratio: "9:16",
  target_duration_seconds: null,
  status: "draft",
  metadata_json: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ client: { rpc: mocks.rpc } });
  mocks.authorize.mockResolvedValue({
    client: { rpc: mocks.rpc },
    project: { workspace_id: id },
  });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
it("création valide et session demandée", async () => {
  expect(await createStudioProject(id, input)).toBe(id);
  expect(mocks.context).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "studio_save_project",
    expect.objectContaining({ p_workspace: id, p_project: null }),
  );
});
it("validation avant mutation", async () => {
  await expect(
    createStudioProject(id, { ...input, name: "" }),
  ).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("édition transmet la révision et le workspace serveur", async () => {
  await updateStudioProject(id, input, 4);
  expect(mocks.authorize).toHaveBeenCalledWith(id, true);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "studio_save_project",
    expect.objectContaining({ p_revision: 4, p_workspace: id }),
  );
});
it("conflit de révision ne prétend pas sauvegarder", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
  await expect(updateStudioProject(id, input, 1)).rejects.toThrow(/rechargez/i);
});
for (const [name, fn] of [
  ["archive", archiveStudioProject],
  ["restore", restoreStudioProject],
  ["delete", deleteStudioProject],
] as const) {
  it(`${name} refuse le refus SQL`, async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(fn(id)).rejects.toThrow(/réservée/);
  });
  it(`${name} passe par contrôle projet`, async () => {
    await fn(id);
    expect(mocks.authorize).toHaveBeenCalledWith(id);
  });
}
it("duplication conserve les erreurs métier", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
  await expect(duplicateStudioProject(id)).rejects.toThrow(
    /imports non validés/,
  );
});
it("couverture refuse un identifiant non UUID", async () => {
  await expect(setProjectCover(id, "../../bucket")).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("couverture et suppression contrôlent le projet courant", async () => {
  await setProjectCover(id, id);
  await removeProjectMedia(id, id);
  expect(mocks.authorize).toHaveBeenCalledWith(id, true);
});
it("réordonnement refuse doublons sans mutation", async () => {
  await expect(reorderProjectMedia(id, [id, id], false, 1)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("tri par date utilise la transaction SQL", async () => {
  await reorderProjectMedia(id, [], true, 7);
  expect(mocks.rpc).toHaveBeenCalledWith("studio_order_project_media", {
    p_project: id,
    p_ids: [],
    p_chronological: true,
    p_revision: 7,
  });
});
it("liste et compteurs utilisent une seule RPC sans N+1", async () => {
  mocks.rpc.mockResolvedValue({
    data: { projects: [], total: 0 },
    error: null,
  });
  await listStudioProjects(id, {
    q: "Croatie",
    type: "travel",
    status: "active",
    sort: "name",
  });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("filtres non allowlistés refusés", async () => {
  await expect(
    listStudioProjects(id, { sort: "name;drop table" }),
  ).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
