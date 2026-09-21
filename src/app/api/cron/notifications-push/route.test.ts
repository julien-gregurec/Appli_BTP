import { afterEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
const traiterNotificationPush = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/push", () => ({ traiterNotificationPush }));

const { GET } = await import("./route");

afterEach(() => vi.unstubAllEnvs());

describe("cron notifications push", () => {
  it("s'arrête avant tout accès administratif lorsqu'il est désactivé", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    const reponse = await GET(new Request("http://localhost/api/cron/notifications-push"));
    expect(reponse.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(traiterNotificationPush).not.toHaveBeenCalled();
  });
});
