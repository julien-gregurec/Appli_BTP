import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifiedUser, StudioAuthUnavailable } from "../src/lib/verified-user";
it("identité seulement après réponse Auth valide", async () => {
  const read = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "verified" } }, error: null });
  expect(await verifiedUser(read)).toEqual({ id: "verified" });
  expect(read).toHaveBeenCalledTimes(1);
});
it("refus Auth ne déclenche aucun réessai", async () => {
  const read = vi
    .fn()
    .mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401 },
    });
  expect(await verifiedUser(read)).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});
it("session absente reste absente", async () => {
  const read = vi
    .fn()
    .mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400 },
    });
  expect(await verifiedUser(read)).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});
it("timeout puis succès : une seule reprise vérifiée", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 504 },
    })
    .mockResolvedValueOnce({ data: { user: { id: "verified" } }, error: null });
  expect(await verifiedUser(read)).toEqual({ id: "verified" });
  expect(read).toHaveBeenCalledTimes(2);
});
it("panne persistante : erreur explicite, aucune identité", async () => {
  const read = vi
    .fn()
    .mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0 },
    });
  await expect(verifiedUser(read)).rejects.toBeInstanceOf(
    StudioAuthUnavailable,
  );
  expect(read).toHaveBeenCalledTimes(2);
});
