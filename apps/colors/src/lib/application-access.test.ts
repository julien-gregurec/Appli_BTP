import { describe, expect, it, vi } from "vitest";
import {
  AccesApplicationRefuseError,
  creerControleAccesApplications,
  type ClientAccesApplications,
} from "@elsatia/application-access";

describe("protection serveur directe", () => {
  it("refuse une route Colors quand la décision SQL est négative", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const controle = creerControleAccesApplications(async () => ({ rpc }) as ClientAccesApplications);
    await expect(controle.exigerAccesApplication({ entrepriseId: "org-1" }, "colors"))
      .rejects.toBeInstanceOf(AccesApplicationRefuseError);
    expect(rpc).toHaveBeenCalledWith("a_acces_application", {
      p_entreprise_id: "org-1",
      p_application_code: "colors",
    });
  });

  it("autorise la route uniquement quand la décision SQL est positive", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const controle = creerControleAccesApplications(async () => ({ rpc }) as ClientAccesApplications);
    await expect(controle.exigerAccesApplication({ entrepriseId: "org-1" }, "colors")).resolves.toBeUndefined();
  });

  it("permet au serveur de vérifier un admin plateforme sans organisation active", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const controle = creerControleAccesApplications(async () => ({ rpc }) as ClientAccesApplications);
    await expect(controle.verifierAccesApplication({ entrepriseId: null }, "colors")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("a_acces_application", {
      p_entreprise_id: null,
      p_application_code: "colors",
    });
  });
});
