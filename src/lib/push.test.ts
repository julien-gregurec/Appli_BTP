import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 : après la migration 255, service_role ne lit ni n'écrit plus
// notifications, préférences et abonnements push ; traiterNotificationPush passe par des RPC de service.

const webpush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webpush }));

const { traiterNotificationPush } = await import("./push");

const NOTIFICATION = {
  id: "notif-1",
  utilisateur_id: "user-1",
  titre: "Titre",
  message: "Message",
  lien: "/lien",
  niveau: "information",
  preference_active: null,
  abonnements: [{ id: "abo-1", endpoint: "https://push.invalid/1", p256dh: "p", auth: "a" }],
};

function adminFactice(preparation: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (nom: string) => (nom === "push_preparer_notification_service" ? preparation : { data: null, error: null }));
  const from = vi.fn(() => { throw new Error("aucune lecture directe de table attendue"); });
  return { client: { rpc, from } as never, rpc, from };
}

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "publique");
  vi.stubEnv("VAPID_PRIVATE_KEY", "privee");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@invalid.local");
  webpush.sendNotification.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("traiterNotificationPush (chemin de service)", () => {
  it("envoie sur chaque abonnement puis marque la notification, sans lire aucune table", async () => {
    webpush.sendNotification.mockResolvedValue({});
    const { client, rpc, from } = adminFactice({ data: NOTIFICATION, error: null });
    await traiterNotificationPush(client, "notif-1");
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.invalid/1", keys: { p256dh: "p", auth: "a" } },
      JSON.stringify({ titre: "Titre", message: "Message", lien: "/lien", niveau: "information" }),
    );
    expect(rpc).toHaveBeenCalledWith("push_marquer_notification_envoyee_service", { p_notification_id: "notif-1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("respecte une préférence désactivée mais marque tout de même la notification", async () => {
    const { client, rpc } = adminFactice({ data: { ...NOTIFICATION, preference_active: false }, error: null });
    await traiterNotificationPush(client, "notif-1");
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("push_marquer_notification_envoyee_service", { p_notification_id: "notif-1" });
  });

  it("supprime un abonnement expiré (410) de son propriétaire", async () => {
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const { client, rpc } = adminFactice({ data: NOTIFICATION, error: null });
    await traiterNotificationPush(client, "notif-1");
    expect(rpc).toHaveBeenCalledWith("push_supprimer_abonnement_service", { p_abonnement_id: "abo-1", p_utilisateur_id: "user-1" });
  });

  it("laisse la notification en attente si sa lecture échoue (reprise par le cron)", async () => {
    const { client, rpc } = adminFactice({ data: null, error: { code: "42501" } });
    await traiterNotificationPush(client, "notif-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("ne fait rien pour une notification absente ou déjà traitée", async () => {
    const { client, rpc } = adminFactice({ data: null, error: null });
    await traiterNotificationPush(client, "notif-1");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
