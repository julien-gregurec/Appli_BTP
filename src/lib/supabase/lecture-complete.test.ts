import { describe, expect, it } from "vitest";
import { lireParCurseur, lireParLots, lireToutesLesLignes, LectureTropVolumineuseError } from "./lecture-complete";

// Simule PostgREST : `max_rows` plafonne chaque réponse, sans erreur.
function serveur(total: number, maxRows: number, { compte = true, erreurPage }: { compte?: boolean; erreurPage?: number } = {}) {
  const lignes = Array.from({ length: total }, (_, i) => ({ id: i }));
  const appels: { debut: number; fin: number; count?: string }[] = [];
  const construire = (options: { count?: "exact" }) => ({
    range(debut: number, fin: number) {
      appels.push({ debut, fin, count: options.count });
      if (erreurPage !== undefined && appels.length - 1 === erreurPage) return Promise.resolve({ data: null, error: { message: "boom" }, count: null });
      const page = lignes.slice(debut, Math.min(fin + 1, debut + maxRows));
      return Promise.resolve({ data: page, error: null, count: options.count && compte ? total : null });
    },
  });
  return { construire, appels };
}

describe("lireToutesLesLignes", () => {
  it.each([0, 1, 500, 999, 1000, 1001, 1462, 5000, 20000])("rend exactement %i lignes, sans doublon ni trou", async (total) => {
    const { construire } = serveur(total, 1000);
    const { data, error } = await lireToutesLesLignes(construire);
    expect(error).toBeNull();
    expect(data).toHaveLength(total);
    expect(new Set(data!.map((l) => l.id)).size).toBe(total);
  });

  it("une seule requête sous la taille de page", async () => {
    const { construire, appels } = serveur(500, 1000);
    await lireToutesLesLignes(construire);
    expect(appels).toEqual([{ debut: 0, fin: 999, count: "exact" }]);
  });

  it("ne demande le comptage qu'à la première page", async () => {
    const { construire, appels } = serveur(2500, 1000);
    await lireToutesLesLignes(construire);
    expect(appels.map((a) => a.count)).toEqual(["exact", undefined, undefined]);
  });

  it("reste complet si max_rows serveur est inférieur à la page demandée", async () => {
    const { construire } = serveur(1462, 300);
    const { data } = await lireToutesLesLignes(construire);
    expect(data).toHaveLength(1462);
  });

  it("sans comptage rendu, lit jusqu'à une page vide", async () => {
    const { construire } = serveur(1462, 500, { compte: false });
    const { data } = await lireToutesLesLignes(construire);
    expect(data).toHaveLength(1462);
  });

  it("propage l'erreur d'une page intermédiaire au lieu d'un résultat partiel", async () => {
    const { construire } = serveur(5000, 1000, { erreurPage: 2 });
    const { data, error } = await lireToutesLesLignes(construire);
    expect(data).toBeNull();
    expect(error).toEqual({ message: "boom" });
  });

  it("échoue explicitement au-delà du plafond, sans tronquer", async () => {
    const { construire, appels } = serveur(5000, 1000);
    const { data, error } = await lireToutesLesLignes(construire, { maxLignes: 2000 });
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(LectureTropVolumineuseError);
    expect(appels).toHaveLength(1);
  });
});

// Simule une table triée par `id` derrière PostgREST plafonné à `maxRows`.
function table(total: number, maxRows: number) {
  const lignes = Array.from({ length: total }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}` }));
  const appels: string[] = [];
  const construire = () => {
    let apres: string | null = null;
    const requete = {
      gt(_colonne: string, valeur: string) { apres = valeur; return requete; },
      order() { return requete; },
      limit(n: number) {
        appels.push(apres ?? "");
        const reste = lignes.filter((l) => apres === null || l.id > apres);
        return Promise.resolve({ data: reste.slice(0, Math.min(n, maxRows)), error: null });
      },
    };
    return requete;
  };
  return { construire, appels };
}

describe("lireParCurseur", () => {
  it.each([0, 1, 999, 1000, 1001, 1462, 5000, 20000])("rend exactement %i lignes dans l'ordre de la clé", async (total) => {
    const { construire } = table(total, 1000);
    const { data } = await lireParCurseur(construire, "id");
    expect(data).toHaveLength(total);
    expect(new Set(data!.map((l) => l.id)).size).toBe(total);
    expect([...data!].sort((a, b) => a.id.localeCompare(b.id))).toEqual(data);
  });
  it("reste complet si max_rows est inférieur à la page demandée", async () => {
    const { construire } = table(1462, 300);
    expect((await lireParCurseur(construire, "id")).data).toHaveLength(1462);
  });
  it("chaque page repart de la dernière clé lue", async () => {
    const { construire, appels } = table(2500, 1000);
    await lireParCurseur(construire, "id");
    expect(appels).toEqual(["", "id-000999", "id-001999", "id-002499"]);
  });
  it("propage l'erreur et refuse au-delà du plafond", async () => {
    const enErreur = () => ({ gt() { return this; }, order() { return this; }, limit: () => Promise.resolve({ data: null, error: { message: "boom" } }) });
    expect(await lireParCurseur(enErreur, "id")).toEqual({ data: null, error: { message: "boom" } });
    const { construire } = table(5000, 1000);
    expect((await lireParCurseur(construire, "id", { maxLignes: 2000 })).error).toBeInstanceOf(LectureTropVolumineuseError);
  });
});

describe("lireParLots", () => {
  it("découpe les identifiants en lots et lit chaque lot en entier", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `n${i}`);
    const lots: number[] = [];
    // Chaque identifiant porte 3 lignes : 100 identifiants → 300 lignes par lot.
    const construire = (lot: string[], options: { count?: "exact" }) => ({
      range(debut: number, fin: number) {
        if (debut === 0) lots.push(lot.length);
        const lignes = lot.flatMap((id) => [1, 2, 3].map((k) => ({ id: `${id}-${k}` })));
        return Promise.resolve({ data: lignes.slice(debut, Math.min(fin + 1, debut + 250)), error: null, count: options.count ? lignes.length : null });
      },
    });
    const { data } = await lireParLots(ids, construire);
    expect(lots).toEqual([100, 100, 100, 100, 50]);
    expect(data).toHaveLength(1350);
  });
});
