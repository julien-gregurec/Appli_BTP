import { describe, expect, it, vi } from "vitest";
import { TRANCHE, TRANCHES_MAX, toutesLesLignes } from "./donnees";

/**
 * Pagination au-delà du plafond de l'API de données.
 *
 * Ce que ces tests protègent n'est pas une optimisation : c'est l'exactitude d'un
 * document contractuel. `max_rows = 1000` coupe une réponse SANS le dire — ni statut, ni
 * en-tête. Un chantier de mille cinq cents réserves rendait donc une « liste complète »
 * amputée d'un tiers, que personne n'avait moyen de repérer à la lecture.
 */

/** Simule une source de N lignes derrière un plafond de `TRANCHE` par requête. */
function source(total: number, plafond = TRANCHE) {
  const appels: [number, number][] = [];
  const lire = (de: number, a: number) => {
    appels.push([de, a]);
    const demande = Math.min(a - de + 1, plafond);
    const lignes = Array.from({ length: Math.max(0, Math.min(demande, total - de)) },
      (_, i) => ({ n: de + i }));
    return Promise.resolve({ data: lignes });
  };
  return { lire, appels };
}

describe("lecture paginée", () => {
  it("rend toutes les lignes quand il y en a plus que le plafond", async () => {
    const { lire } = source(2_000);
    const lignes = await toutesLesLignes<{ n: number }>(lire);
    expect(lignes).toHaveLength(2_000);
    expect(lignes[0].n).toBe(0);
    // La ligne qui disparaissait avant le correctif : la première au-delà du plafond.
    expect(lignes[TRANCHE].n).toBe(TRANCHE);
    expect(lignes[1_999].n).toBe(1_999);
  });

  it("ne demande qu'une seule tranche quand tout tient dedans", async () => {
    const { lire, appels } = source(12);
    expect(await toutesLesLignes(lire)).toHaveLength(12);
    expect(appels).toHaveLength(1);
  });

  it("s'arrête sur une tranche EXACTEMENT pleine suivie d'une vide", async () => {
    // Cas limite désagréable : mille lignes pile. Rien ne distingue « complet » de
    // « coupé », il faut donc une requête de plus pour en avoir le cœur net.
    const { lire, appels } = source(TRANCHE);
    expect(await toutesLesLignes(lire)).toHaveLength(TRANCHE);
    expect(appels).toHaveLength(2);
  });

  it("rend une liste vide sans requête superflue", async () => {
    const { lire, appels } = source(0);
    expect(await toutesLesLignes(lire)).toEqual([]);
    expect(appels).toHaveLength(1);
  });

  it("traite une réponse nulle comme une fin de liste", async () => {
    const lire = vi.fn().mockResolvedValue({ data: null });
    expect(await toutesLesLignes(lire)).toEqual([]);
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("demande des intervalles contigus et sans recouvrement", async () => {
    const { lire, appels } = source(2_500);
    await toutesLesLignes(lire);
    expect(appels).toEqual([
      [0, TRANCHE - 1], [TRANCHE, 2 * TRANCHE - 1], [2 * TRANCHE, 3 * TRANCHE - 1],
    ]);
  });

  it("refuse de boucler indéfiniment si le serveur rend toujours une tranche pleine", async () => {
    // Garde d'arrêt : une pagination qui ne se termine pas fige un rendu serveur, et le
    // symptôme — une page qui ne revient jamais — n'apprend rien à personne.
    const lire = vi.fn(async (de: number) => ({
      data: Array.from({ length: TRANCHE }, (_, i) => ({ n: de + i })),
    }));
    const lignes = await toutesLesLignes(lire);
    expect(lire).toHaveBeenCalledTimes(TRANCHES_MAX);
    expect(lignes).toHaveLength(TRANCHES_MAX * TRANCHE);
  });
});
