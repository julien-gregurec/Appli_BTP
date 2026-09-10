import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpc, signOut, emailDesactive } = vi.hoisted(() => ({
  rpc: vi.fn(),
  signOut: vi.fn(),
  emailDesactive: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc, auth: { signOut } })),
}));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: emailDesactive }));

import { POST } from "./route";

function requete(entetes: Record<string, string> = {}) {
  return new NextRequest("https://gp.example.invalid/auth/deconnexion", {
    method: "POST",
    headers: { host: "gp.example.invalid", origin: "https://gp.example.invalid", ...entetes },
  });
}

describe("déconnexion par route dédiée", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: false });
    signOut.mockReset().mockResolvedValue({ error: null });
    emailDesactive.mockReset().mockReturnValue(false);
  });

  it("ferme la session et renvoie vers /login, en 303 relatif", async () => {
    const reponse = await POST(requete());
    expect(signOut).toHaveBeenCalledOnce();
    expect(reponse.status).toBe(303);
    expect(reponse.headers.get("location")).toBe("/login");
  });

  it("refuse une déconnexion forcée depuis un autre site, sans toucher à la session", async () => {
    const reponse = await POST(requete({ origin: "https://site-hostile.example" }));
    expect(reponse.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("accepte l'hôte transmis par le proxy TLS", async () => {
    const reponse = await POST(requete({ host: "127.0.0.1:3200", "x-forwarded-host": "gp.example.invalid" }));
    expect(reponse.status).toBe(303);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("renvoie un compte dépôt vers la borne sans le déconnecter", async () => {
    rpc.mockResolvedValue({ data: true });
    const reponse = await POST(requete());
    expect(reponse.headers.get("location")).toBe("/stock/borne?deconnexion=1");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("respecte la connexion par e-mail désactivée, comme l'action qu'elle remplace", async () => {
    emailDesactive.mockReturnValue(true);
    const reponse = await POST(requete());
    expect(reponse.headers.get("location")).toBe("/dashboard");
    expect(signOut).not.toHaveBeenCalled();
  });
});
