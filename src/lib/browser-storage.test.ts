import { describe, expect, it } from "vitest";
import { lireEtMigrerCleStockage, type StockageNavigateur } from "./browser-storage";

function stockage(initial: Record<string, string> = {}) {
  const valeurs = new Map(Object.entries(initial));
  const api: StockageNavigateur = {
    getItem: (cle) => valeurs.get(cle) ?? null,
    setItem: (cle, valeur) => valeurs.set(cle, valeur),
    removeItem: (cle) => valeurs.delete(cle),
  };
  return { api, valeurs };
}

describe("migration des clés navigateur Elsatia", () => {
  it("transfère la valeur historique puis supprime uniquement son ancienne clé", () => {
    const { api, valeurs } = stockage({ ancienne: "valeur", autre: "intacte" });

    expect(lireEtMigrerCleStockage(api, "nouvelle", "ancienne")).toBe("valeur");
    expect(valeurs.get("nouvelle")).toBe("valeur");
    expect(valeurs.has("ancienne")).toBe(false);
    expect(valeurs.get("autre")).toBe("intacte");
  });

  it("préserve la nouvelle valeur lorsqu'elle existe déjà", () => {
    const { api, valeurs } = stockage({ ancienne: "historique", nouvelle: "actuelle" });

    expect(lireEtMigrerCleStockage(api, "nouvelle", "ancienne")).toBe("actuelle");
    expect(valeurs.get("ancienne")).toBe("historique");
  });

  it("ne supprime pas l'ancienne clé lorsque l'écriture échoue", () => {
    const { api, valeurs } = stockage({ ancienne: "valeur" });
    api.setItem = () => { throw new Error("stockage indisponible"); };

    expect(lireEtMigrerCleStockage(api, "nouvelle", "ancienne")).toBe("valeur");
    expect(valeurs.get("ancienne")).toBe("valeur");
  });
});
