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

function adminFactice(preparation: { data: unknown; error: unknown }, reservation: { data: unknown; error: unknown } = { data: true, error: null }) {
  const rpc = vi.fn(async (nom: string) => {
    if (nom === "push_preparer_notification_service") return preparation;
    if (nom === "push_reserver_notification_service") return reservation;
    return { data: null, error: null };
  });
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

  it("signale un échec (réessai différé) si sa lecture échoue, sans la marquer", async () => {
    const { client, rpc } = adminFactice({ data: null, error: { code: "42501" } });
    expect(await traiterNotificationPush(client, "notif-1")).toBe("echec");
    expect(rpc).toHaveBeenCalledWith("push_echec_notification_service", { p_notification_id: "notif-1" });
    expect(rpc).not.toHaveBeenCalledWith("push_marquer_notification_envoyee_service", expect.anything());
    expect(console.error).toHaveBeenCalled();
  });

  it("ne fait rien pour une notification absente ou déjà traitée", async () => {
    const { client, rpc } = adminFactice({ data: null, error: null });
    expect(await traiterNotificationPush(client, "notif-1")).toBe("ignoree");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("webhook : réserve d'abord la notification et s'abstient si un autre worker la tient", async () => {
    const { client, rpc } = adminFactice({ data: NOTIFICATION, error: null }, { data: false, error: null });
    expect(await traiterNotificationPush(client, "notif-1")).toBe("ignoree");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("push_reserver_notification_service", { p_notification_id: "notif-1" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("cron : une notification déjà réservée par le lot n'est pas re-réservée", async () => {
    webpush.sendNotification.mockResolvedValue({});
    const { client, rpc } = adminFactice({ data: NOTIFICATION, error: null });
    expect(await traiterNotificationPush(client, "notif-1", { dejaReservee: true })).toBe("envoyee");
    expect(rpc).not.toHaveBeenCalledWith("push_reserver_notification_service", expect.anything());
  });

  it("tous les envois en échec transitoire : réessai, jamais marquée envoyée", async () => {
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error("Timeout"), { statusCode: 503 }));
    const { client, rpc } = adminFactice({ data: NOTIFICATION, error: null });
    expect(await traiterNotificationPush(client, "notif-1")).toBe("echec");
    expect(rpc).toHaveBeenCalledWith("push_echec_notification_service", { p_notification_id: "notif-1" });
    expect(rpc).not.toHaveBeenCalledWith("push_marquer_notification_envoyee_service", expect.anything());
  });

  it("un appareil servi sur deux : marquée envoyée (pas de double push au réessai)", async () => {
    webpush.sendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error("Timeout"), { statusCode: 503 }));
    const deuxAppareils = { ...NOTIFICATION, abonnements: [...NOTIFICATION.abonnements, { id: "abo-2", endpoint: "https://push.invalid/2", p256dh: "p", auth: "a" }] };
    const { client, rpc } = adminFactice({ data: deuxAppareils, error: null });
    expect(await traiterNotificationPush(client, "notif-1")).toBe("envoyee");
    expect(rpc).toHaveBeenCalledWith("push_marquer_notification_envoyee_service", { p_notification_id: "notif-1" });
  });
});
