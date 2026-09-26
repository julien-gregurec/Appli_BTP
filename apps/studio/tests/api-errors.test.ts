import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../src/lib/config", () => ({
  studioOrigin: () => "http://127.0.0.1:3030",
}));
vi.mock("../src/lib/projects", () => ({ getStudioProject: mocks.get }));
vi.mock("../src/lib/media-service", () => ({
  MediaError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import { MediaError } from "../src/lib/media-service";
import { GET, POST } from "../src/app/api/projects/[[...path]]/route";
const params = () => ({
  params: Promise.resolve({ path: ["10000000-0000-4000-8000-000000000001"] }),
});
beforeEach(() => {
  mocks.get.mockReset();
});
it.each([401, 403, 404, 409])("API preserves genuine %i", async (status) => {
  mocks.get.mockRejectedValue(new MediaError("refus", status));
  const response = await GET(
    new Request("http://127.0.0.1:3030/api/projects/x"),
    params(),
  );
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it.each(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET"])(
  "API reports %s as unavailable without retry",
  async (code) => {
    mocks.get.mockRejectedValue(
      new TypeError("fetch failed", { cause: { code } }),
    );
    const response = await GET(
      new Request("http://127.0.0.1:3030/api/projects/x"),
      params(),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service projets indisponible.",
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);
  },
);
it("unexpected server failure is not invalid user input", async () => {
  mocks.get.mockRejectedValue(new Error("internal SQL details"));
  const response = await GET(
    new Request("http://127.0.0.1:3030/api/projects/x"),
    params(),
  );
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("internal SQL");
});
it("invalid JSON remains 400 before any project query", async () => {
  const response = await POST(
    new Request("http://127.0.0.1:3030/api/projects/x", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:3030" },
      body: "{",
    }),
    params(),
  );
  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});
