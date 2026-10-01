import { describe, expect, it } from "vitest";
import { lireToutesLesLignes, LectureTropVolumineuseError } from "./lecture-complete";

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
