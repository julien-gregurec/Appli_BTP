// ELSATIA SOAK V1 — Domaine F (niveau route) : tests ROUGES du cron de secours push.
// La RPC est simulée fidèlement (plafond 200, aucune garantie d'ordre, fenêtre p_depuis) ;
// traiterNotificationPush est le VRAI code de src/lib/push.ts (web-push mocké).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn(async () => ({}));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

type Notif = { id: string; created_at: number; push_envoyee_at: number | null; poison?: boolean };
let file: Notif[] = [];
const appelsPreparer: string[] = [];

function fauxAdmin() {
  return {
    rpc: vi.fn(async (nom: string, args: Record<string, unknown>) => {
      if (nom === "push_notifications_en_attente_service") {
        const depuis = Date.parse(String(args.p_depuis));
        const limite = Math.max(0, Math.min(Number(args.p_limite ?? 200), 500));
        // Ordre physique (insertion), comme le Bitmap Heap Scan mesuré en base.
        const ids = file.filter((n) => n.push_envoyee_at === null && n.created_at >= depuis).slice(0, limite);
        return { data: ids.map((n) => ({ id: n.id })), error: null };
      }
      if (nom === "push_preparer_notification_service") {
        const n = file.find((x) => x.id === args.p_notification_id);
        appelsPreparer.push(String(args.p_notification_id));
        if (n?.poison) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
        if (!n || n.push_envoyee_at !== null) return { data: null, error: null };
        return {
          data: { id: n.id, utilisateur_id: "u", type: "t", titre: "x", message: null, lien: null, niveau: "information",
            preference_active: null, abonnements: [{ id: "a", endpoint: "https://push.invalid/x", p256dh: "p", auth: "a" }] },
          error: null,
        };
      }
      if (nom === "push_marquer_notification_envoyee_service") {
        const n = file.find((x) => x.id === args.p_notification_id);
        if (n && n.push_envoyee_at === null) n.push_envoyee_at = Date.now();
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fauxAdmin() }));
vi.mock("@/lib/preview-features", () => ({ cronsSontActifs: () => true }));

const { GET } = await import("@/app/api/cron/notifications-push/route");
const appeler = () => GET(new Request("http://localhost/api/cron/notifications-push", { headers: { authorization: "Bearer s" } }));

function semer(n: number, prefixe: string, ilYaMs: number, extra: Partial<Notif> = {}) {
  for (let i = 0; i < n; i++) file.push({ id: `${prefixe}-${i}`, created_at: Date.now() - ilYaMs + i, push_envoyee_at: null, ...extra });
}

beforeEach(() => {
  file = []; appelsPreparer.length = 0; sendNotification.mockClear();
  vi.stubEnv("CRON_SECRET", "s");
  vi.stubEnv("VAPID_PUBLIC_KEY", "p"); vi.stubEnv("VAPID_PRIVATE_KEY", "k"); vi.stubEnv("VAPID_SUBJECT", "mailto:x@x.invalid");
});

describe("cron push — capacité d'un passage", () => {
  for (const n of [50, 199, 200, 201, 300, 1000]) {
    it(`N=${n} : un passage vide la file (ou la reprend sans perte au passage suivant de 24 h)`, async () => {
      semer(n, "n", 23 * 3600_000);
      const r = await (await appeler()).json();
      // Le passage suivant a lieu 24 h plus tard : tout ce qui reste aura alors > 25 h et sortira de la fenêtre.
      const restantes = file.filter((x) => x.push_envoyee_at === null).length;
      expect({ traitees: r.traitees, restantes }).toEqual({ traitees: n, restantes: 0 });
    });
  }
});

describe("cron push — message empoisonné", () => {
  it("200 notifications dont la préparation échoue n'empêchent pas une notification saine d'être poussée", async () => {
    semer(200, "poison", 20 * 3600_000, { poison: true });
    semer(1, "saine", 1 * 3600_000);
    for (let passage = 0; passage < 3; passage++) await appeler();
    expect(file.find((x) => x.id === "saine-0")?.push_envoyee_at).not.toBeNull();
  });
});

describe("cron push — VAPID absent", () => {
  it("documente : sans clés VAPID, les notifications sont marquées envoyées sans aucun push (consommées)", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    semer(10, "sansvapid", 3600_000);
    await appeler();
    // Comportement constaté (observation, pas un rouge) : la file est vidée sans envoi.
    expect(sendNotification).not.toHaveBeenCalled();
    expect(file.every((x) => x.push_envoyee_at !== null)).toBe(true);
  });
});
