import { describe, expect, it } from "vitest";
import capacitorConfig from "../../capacitor.config";

describe("configuration native canonique", () => {
  it("embarque l’export statique sous le même identifiant iOS et Android", () => {
    expect(capacitorConfig.appId).toBe("fr.elsatia.tools");
    expect(capacitorConfig.appName).toBe("ELSATIA Tools");
    expect(capacitorConfig.webDir).toBe("out");
  });

  it("n’utilise jamais un serveur distant comme source de l’application", () => {
    expect(capacitorConfig.server).not.toHaveProperty("url");
    expect(capacitorConfig.server?.hostname).toBe("localhost");
    expect(capacitorConfig.android?.allowMixedContent).toBe(false);
  });

  it("laisse les permissions natives absentes tant qu’une capacité ne les exige pas", () => {
    expect(capacitorConfig.ios?.contentInset).toBe("never");
    expect(capacitorConfig.ios?.preferredContentMode).toBe("mobile");
    expect(capacitorConfig.zoomEnabled).toBe(false);
  });
});
