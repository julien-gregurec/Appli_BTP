import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ rpc: vi.fn(), row: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({
  createStudioClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.row }) }) }),
    rpc: mock.rpc,
  }),
}));
import { authorizeProject } from "../src/lib/media-service";
const id = "10000000-0000-4000-8000-000000000001";
const status = (value: unknown, error: unknown = null) => (fn: string) =>
  Promise.resolve(fn === "studio_identity_session_status" ? { data: value, error } : { data: "owner", error: null });

beforeEach(() => {
  delete process.env.STUDIO_IDENTITY_MODE; // défaut : pont ELSATIA
  mock.rpc.mockReset();
  mock.row.mockReset();
  mock.row.mockResolvedValue({ data: { id, workspace_id: id, status: "draft" }, error: null });
});

it("session ouverte par le pont, compte actif : accès, avec l'âge maximal imposé par la config", async () => {
  mock.rpc.mockImplementation(status({ status: "ok", access: "full" }));
  await expect(authorizeProject(id, true)).resolves.toMatchObject({ role: "owner" });
  expect(mock.rpc).toHaveBeenCalledWith("studio_identity_session_status", { p_soft_max_age_s: 43200, p_hard_max_age_s: 86400 });
});

it.each(["disabled", "unregistered", "unlinked", "expired", "anonymous"])("statut %s → 401, aucune lecture de projet", async (s) => {
  mock.rpc.mockImplementation(status({ status: s }));
  await expect(authorizeProject(id)).rejects.toMatchObject({ status: 401 });
  expect(mock.row).not.toHaveBeenCalled();
});

it("droit retiré (lecture seule) : lecture permise, écriture refusée 403", async () => {
  mock.rpc.mockImplementation(status({ status: "ok", access: "read_only" }));
  await expect(authorizeProject(id)).resolves.toBeTruthy();
  await expect(authorizeProject(id, true)).rejects.toMatchObject({ status: 403 });
});

it("session à revalider : les appels API restent servis jusqu'à l'âge maximal", async () => {
  mock.rpc.mockImplementation(status({ status: "stale", access: "full" }));
  await expect(authorizeProject(id, true)).resolves.toBeTruthy();
});

it("contrôle d'identité indisponible → 503, jamais un accès", async () => {
  mock.rpc.mockImplementation(status(null, { code: "PGRST000", message: "down" }));
  await expect(authorizeProject(id)).rejects.toMatchObject({ status: 503 });
  expect(mock.row).not.toHaveBeenCalled();
});
