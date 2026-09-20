import { describe, expect, it } from "vitest";

import { refusApiDepuisErreur } from "@/lib/refus-api-colors";

function erreur(name: string, message = "x") {
  return Object.assign(new Error(message), { name });
}

describe("refusApiDepuisErreur", () => {
  it("un refus d'accès devient 403 JSON, jamais un 500 ni une redirection", async () => {
    const reponse = refusApiDepuisErreur(erreur("AccesApplicationRefuseError"));
    expect(reponse?.status).toBe(403);
    expect(reponse?.headers.get("content-type")).toContain("application/json");
    expect(await reponse?.json()).toEqual({ erreur: "Accès à Colors refusé", code: "refus_non_qualifie" });
  });

  it("une décision indisponible devient 503 réessayable, pas un refus", async () => {
    const reponse = refusApiDepuisErreur(erreur("AccesApplicationIndisponibleError"));
    expect(reponse?.status).toBe(503);
    expect(reponse?.headers.get("retry-after")).toBe("30");
    expect((await reponse?.json()).code).toBe("indisponible");
  });

  it("toute autre erreur est rendue à l'appelant (rien n'est avalé)", () => {
    expect(refusApiDepuisErreur(new Error("boom"))).toBeNull();
    expect(refusApiDepuisErreur("texte")).toBeNull();
    expect(refusApiDepuisErreur(undefined)).toBeNull();
  });

  it("ne divulgue aucun détail technique", async () => {
    const reponse = refusApiDepuisErreur(erreur("AccesApplicationIndisponibleError", "sensitive database detail"));
    expect(JSON.stringify(await reponse?.json())).not.toContain("sensitive");
  });
});
