import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  row: vi.fn(),
  role: vi.fn(),
  limits: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  createStudioClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "actor" } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mock.row }),
        single: mock.limits,
      }),
    }),
    rpc: mock.role,
  }),
}));
import {
  authorizeProject,
  authorizeAsset,
  reserveMedia,
} from "../src/lib/media-service";
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  mock.row.mockReset();
  mock.role.mockReset();
  mock.limits.mockReset();
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

it.each([401, 403, 404, 409])(
  "une erreur REST explicite %i conserve son statut",
  async (status) => {
    mock.row.mockResolvedValue({
      data: { id, workspace_id: id, status: "draft" },
      error: null,
      status: 200,
    });
    mock.role.mockResolvedValue({
      data: null,
      error: { code: "42501" },
      status,
    });
    await expect(authorizeProject(id, true)).rejects.toMatchObject({ status });
  },
);
it("un owner vérifié reste owner et un viewer reste en lecture seule", async () => {
  mock.row.mockResolvedValue({
    data: { id, workspace_id: id, status: "draft" },
    error: null,
    status: 200,
  });
  mock.role.mockResolvedValue({ data: "owner", error: null, status: 200 });
  await expect(authorizeProject(id, true)).resolves.toMatchObject({
    role: "owner",
  });
  mock.role.mockResolvedValue({ data: "viewer", error: null, status: 200 });
  await expect(authorizeProject(id, true)).rejects.toMatchObject({
    status: 403,
  });
});

it.each([0, -1, 5000])(
  "invalid file size %i remains 400 without a reservation",
  async (size) => {
    mock.row.mockResolvedValue({
      data: { id, workspace_id: id, status: "draft" },
      error: null,
      status: 200,
    });
    mock.role.mockResolvedValue({ data: "owner", error: null, status: 200 });
    mock.limits.mockResolvedValue({
      data: { image_bytes: 1000, video_bytes: 1000 },
      error: null,
      status: 200,
    });
    await expect(
      reserveMedia(id, {
        requestId: id,
        name: "x.jpg",
        mime: "image/jpeg",
        size,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mock.role).toHaveBeenCalledTimes(1);
    expect(mock.role).toHaveBeenCalledWith("studio_my_role", {
      p_workspace_id: id,
    });
  },
);
