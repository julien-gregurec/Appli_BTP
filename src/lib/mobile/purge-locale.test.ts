import { describe, expect, it } from "vitest";
import { doitObeirALaPurge, purgerStockageCleValeur } from "@/lib/mobile/purge-locale";
import { cleLocale } from "@/lib/mobile/identite-locale";

/** Stockage énumérable, fidèle au comportement de `Storage` : `key(i)` suit l'ordre d'insertion. */
function stockageFactice(entrees: Record<string, string>) {
  const donnees = new Map(Object.entries(entrees));
  return {
    donnees,
    get length() { return donnees.size; },
    key: (i: number) => [...donnees.keys()][i] ?? null,
    getItem: (c: string) => donnees.get(c) ?? null,
    removeItem: (c: string) => { donnees.delete(c); },
  };
}

const A = { entrepriseId: "ent-a", utilisateurId: "usr-1" };
const B = { entrepriseId: "ent-b", utilisateurId: "usr-9" };

describe("purge des données locales", () => {
  it("efface les clés de Gestion Pro de TOUTES les identités présentes", () => {
    // La déconnexion ferme la session courante, mais l'appareil peut porter les restes
    // d'un compte précédent. On les emporte aussi : personne n'est là pour les réclamer.
    const stockage = stockageFactice({
      [cleLocale(A, "brouillon:note")!]: "{}",
      [cleLocale(B, "brouillon:note")!]: "{}",
      "elsatia-dashboard-masques": "[]",
    });
    expect(purgerStockageCleValeur(stockage)).toBe(3);
    expect(stockage.donnees.size).toBe(0);
  });

  it("ne touche pas à ce qui n'appartient pas à Gestion Pro", () => {
    // Un `clear()` paraît plus sûr et ne l'est pas : il est moins précis.
    const stockage = stockageFactice({
      [cleLocale(A, "brouillon:note")!]: "{}",
      "elsatia:reserves:ent-a:usr-1:file": "[]",
      "theme": "sombre",
    });
    expect(purgerStockageCleValeur(stockage)).toBe(1);
    expect(stockage.getItem("elsatia:reserves:ent-a:usr-1:file")).toBe("[]");
    expect(stockage.getItem("theme")).toBe("sombre");
  });

  it("n'en saute aucune, même quand toutes sont à effacer", () => {
    // Régression visée : supprimer pendant qu'on parcourt l'index par position décale
    // les clés suivantes et en saute une sur deux. La collecte précède la suppression.
    const entrees: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1) entrees[cleLocale(A, `usage-${i}`)!] = "{}";
    const stockage = stockageFactice(entrees);
    expect(purgerStockageCleValeur(stockage)).toBe(12);
    expect(stockage.donnees.size).toBe(0);
  });

  it("rend 0 sans lever quand le stockage est inaccessible", () => {
    // Navigation privée, ou navigateur réglé pour refuser le stockage de site.
    const refus = {
      get length(): number { throw new DOMException("refusé", "SecurityError"); },
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
    };
    expect(purgerStockageCleValeur(refus)).toBe(0);
  });
});

describe("coordination de la purge entre onglets", () => {
  it("un onglet obéit à une purge décidée dans un AUTRE onglet", () => {
    expect(doitObeirALaPurge({ type: "purger", origine: "onglet-b" }, "onglet-a")).toBe(true);
  });

  it("un onglet n'obéit JAMAIS à sa propre purge", () => {
    // Défaut constaté en recette : l'onglet qui se déconnectait recevait son propre message,
    // partait vers /login avant la fermeture de session, et revenait connecté sur /dashboard.
    expect(doitObeirALaPurge({ type: "purger", origine: "onglet-a" }, "onglet-a")).toBe(false);
  });

  it("ignore un message sans origine — l'ancien format ne prouve pas qu'il vient d'ailleurs", () => {
    expect(doitObeirALaPurge({ type: "purger" }, "onglet-a")).toBe(false);
  });

  it("ignore tout ce qui n'est pas un ordre de purge", () => {
    for (const message of [null, undefined, "purger", 42, { type: "autre", origine: "onglet-b" }]) {
      expect(doitObeirALaPurge(message, "onglet-a")).toBe(false);
    }
  });
});
