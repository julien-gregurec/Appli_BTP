import { describe, expect, it } from "vitest";
import { CLE_REGISTRE, basesAPurger, basesDesAutresEntreprises, inscrireAuRegistre, lireRegistre, oublierRegistre } from "@/lib/mobile/offline/registre-bases";

function stockage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

describe("registre des bases (Firefox n'a pas indexedDB.databases())", () => {
  it("retient chaque base ouverte, sans doublon", () => {
    const s = stockage();
    inscrireAuRegistre(s, "elsatia:gp:ent-a:usr-1");
    inscrireAuRegistre(s, "elsatia:gp:ent-a:usr-1");
    inscrireAuRegistre(s, "elsatia:gp:ent-b:usr-1");
    expect(lireRegistre(s)).toEqual(["elsatia:gp:ent-a:usr-1", "elsatia:gp:ent-b:usr-1"]);
  });

  it("n'inscrit jamais une base qui n'est pas de Gestion Pro", () => {
    const s = stockage();
    inscrireAuRegistre(s, "elsatia:reserves:ent-a:usr-1");
    expect(lireRegistre(s)).toEqual([]);
  });

  it("résiste à un registre corrompu", () => {
    const s = stockage();
    s.setItem(CLE_REGISTRE, "{pas du json");
    expect(lireRegistre(s)).toEqual([]);
  });

  it("s'oublie après la purge", () => {
    const s = stockage();
    inscrireAuRegistre(s, "elsatia:gp:ent-a:usr-1");
    oublierRegistre(s);
    expect(lireRegistre(s)).toEqual([]);
  });

  it("purge l'union du registre et de l'énumération native", () => {
    expect(basesAPurger(["elsatia:gp:a:1"], ["elsatia:gp:b:1", "autre-app"])).toEqual(["elsatia:gp:a:1", "elsatia:gp:b:1"]);
  });

  it("purge le registre seul quand l'énumération native n'existe pas (Firefox)", () => {
    expect(basesAPurger(["elsatia:gp:a:1"], null)).toEqual(["elsatia:gp:a:1"]);
  });

  it("désigne les bases des autres entreprises au changement d'entreprise", () => {
    const noms = ["elsatia:gp:ent-a:usr-1", "elsatia:gp:ent-b:usr-1", "elsatia:gp:ent-b:usr-2"];
    // Changement vers ent-a : la base ent-b de usr-1 part ; celle d'usr-2 n'est pas à lui.
    expect(basesDesAutresEntreprises(noms, "ent-a", "usr-1")).toEqual(["elsatia:gp:ent-b:usr-1"]);
  });
});
