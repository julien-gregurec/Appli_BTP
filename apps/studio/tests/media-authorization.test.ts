import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ row: vi.fn(), role: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({
  createStudioClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.row }) }) }),
    rpc: mock.role,
  }),
}));
import { authorizeProject, authorizeAsset } from "../src/lib/media-service";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  mock.row.mockReset();
  mock.role.mockReset();
});
it("une panne de lecture projet reste temporaire, sans faux 404", async () => {
  mock.row.mockResolvedValue({ data: null, error: { code: "PGRST000" } });
  await expect(authorizeProject(id)).rejects.toMatchObject({ status: 503 });
  expect(mock.role).not.toHaveBeenCalled();
});
it("une panne de vérification du rôle ne devient pas un rôle viewer", async () => {
  mock.row.mockResolvedValue({
    data: { id, workspace_id: id, status: "draft" },
    error: null,
  });
  mock.role.mockResolvedValue({ data: null, error: { code: "PGRST000" } });
  await expect(authorizeProject(id, true)).rejects.toMatchObject({
    status: 503,
  });
});
it("une panne de lecture média ne signe aucun accès", async () => {
  mock.row.mockResolvedValue({ data: null, error: { code: "PGRST000" } });
  await expect(authorizeAsset(id)).rejects.toMatchObject({ status: 503 });
});
it("un projet réellement absent ou filtré par RLS reste introuvable", async () => {
  mock.row.mockResolvedValue({ data: null, error: null });
  await expect(authorizeProject(id)).rejects.toMatchObject({ status: 404 });
});
