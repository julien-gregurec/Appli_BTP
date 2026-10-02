import { describe, expect, it } from "vitest";
import {
  AnnulationPdfError,
  creerFilePdf,
  DelaiPdfError,
  optionsDepuisEnv,
  SaturationPdfError,
  type NavigateurGere,
  type OptionsFilePdf,
} from "./file-pdf";

// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : file PDF avec un lanceur factice (aucun Chromium).
// Les mêmes scénarios sont rejoués sur un vrai Chromium dans file-pdf.chromium.test.ts.

type Faux = { id: number; ferme: boolean };
const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function banc(options: Partial<OptionsFilePdf> = {}, comportement: { fermetureBloquee?: boolean; lancementMs?: number } = {}) {
  let suivant = 0;
  const lances: Faux[] = [];
  const journal: Record<string, unknown>[] = [];
  let vivantsMax = 0;
  const vivants = () => lances.filter((n) => !n.ferme).length;
  const file = creerFilePdf<Faux>(async (signal) => {
    if (comportement.lancementMs) await attendre(comportement.lancementMs);
    if (signal.aborted && !comportement.lancementMs) throw signal.reason;
    const faux = { id: ++suivant, ferme: false };
    lances.push(faux);
    vivantsMax = Math.max(vivantsMax, vivants());
    const gere: NavigateurGere<Faux> = {
      navigateur: faux,
      pid: null,
      fermer: async () => {
        if (comportement.fermetureBloquee) await new Promise(() => undefined);
        faux.ferme = true;
      },
    };
    return gere;
  }, { concurrence: 2, fileMax: 3, attenteMaxMs: 1_000, dureeMaxMs: 1_000, delaiFermetureMs: 50, ...options }, (e) => journal.push(e));
  return { file, lances, journal, vivants, vivantsMax: () => vivantsMax };
}

describe("file PDF", () => {
  it("succès : résultat rendu, navigateur fermé, ligne de journal", async () => {
    const { file, lances, journal } = banc();
    await expect(file.executer(async () => "pdf")).resolves.toBe("pdf");
    expect(lances.every((n) => n.ferme)).toBe(true);
    expect(journal.at(-1)).toMatchObject({ issue: "succes", actifs: 0, en_file: 0, navigateurs_vivants: 0 });
    expect(file.etat().compteurs).toMatchObject({ total: 1, succes: 1 });
  });

  it("concurrence plafonnée : jamais plus de N navigateurs vivants, file FIFO", async () => {
    const { file, vivantsMax } = banc({ concurrence: 2, fileMax: 20 });
    const ordre: number[] = [];
    await Promise.all(Array.from({ length: 10 }, (_, i) => file.executer(async () => { await attendre(20); ordre.push(i); })));
    expect(vivantsMax()).toBe(2);
    expect(ordre.slice(0, 2).sort()).toEqual([0, 1]);
    expect(file.etat()).toMatchObject({ actifs: 0, enFile: 0, navigateursVivants: 0 });
  });

  it("saturation : file pleine → SaturationPdfError immédiate, sans lancer de navigateur", async () => {
    const { file, lances } = banc({ concurrence: 1, fileMax: 1 });
    const longs = [file.executer(() => attendre(100)), file.executer(() => attendre(100))];
    await expect(file.executer(async () => "x")).rejects.toBeInstanceOf(SaturationPdfError);
    await Promise.all(longs);
    expect(lances.length).toBe(2);
    expect(file.etat().compteurs.saturation).toBe(1);
  });

  it("attente trop longue en file → SaturationPdfError, la place n'est pas perdue", async () => {
    const { file } = banc({ concurrence: 1, fileMax: 5, attenteMaxMs: 30 });
    const long = file.executer(() => attendre(150));
    await expect(file.executer(async () => "x")).rejects.toBeInstanceOf(SaturationPdfError);
    await long;
    await expect(file.executer(async () => "ok")).resolves.toBe("ok");
    expect(file.etat()).toMatchObject({ actifs: 0, enFile: 0 });
  });

  it("délai global : DelaiPdfError, navigateur fermé, place rendue", async () => {
    const { file, lances } = banc({ dureeMaxMs: 50 });
    await expect(file.executer(() => new Promise(() => undefined))).rejects.toBeInstanceOf(DelaiPdfError);
    expect(lances[0].ferme).toBe(true);
    expect(file.etat()).toMatchObject({ actifs: 0, navigateursVivants: 0 });
    expect(file.etat().compteurs.delai).toBe(1);
  });

  it("échec de la tâche (navigation) : erreur d'origine, navigateur fermé", async () => {
    const { file, lances } = banc();
    await expect(file.executer(async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); })).rejects.toThrow("ERR_CONNECTION_REFUSED");
    expect(lances[0].ferme).toBe(true);
    expect(file.etat().compteurs.echec).toBe(1);
  });

  it("annulation en cours : AnnulationPdfError, navigateur fermé ; le signal est transmis à la tâche", async () => {
    const { file, lances } = banc();
    const controleur = new AbortController();
    let signalTache: AbortSignal | null = null;
    const p = file.executer(async (_, signal) => { signalTache = signal; await new Promise(() => undefined); }, controleur.signal);
    await attendre(10);
    controleur.abort();
    await expect(p).rejects.toBeInstanceOf(AnnulationPdfError);
    expect(signalTache!.aborted).toBe(true);
    expect(lances[0].ferme).toBe(true);
  });

  it("annulation en file : retirée de la file, aucun navigateur lancé pour elle", async () => {
    const { file, lances } = banc({ concurrence: 1 });
    const long = file.executer(() => attendre(80));
    const controleur = new AbortController();
    const enFile = file.executer(async () => "jamais", controleur.signal);
    await attendre(5);
    expect(file.etat().enFile).toBe(1);
    controleur.abort();
    await expect(enFile).rejects.toBeInstanceOf(AnnulationPdfError);
    expect(file.etat().enFile).toBe(0);
    await long;
    expect(lances.length).toBe(1);
  });

  it("signal déjà annulé : refus immédiat", async () => {
    const { file, lances } = banc();
    await expect(file.executer(async () => "x", AbortSignal.abort())).rejects.toBeInstanceOf(AnnulationPdfError);
    expect(lances.length).toBe(0);
  });

  it("close() bloqué : la place est rendue après delaiFermetureMs (arrêt forcé)", async () => {
    const { file } = banc({ delaiFermetureMs: 30 }, { fermetureBloquee: true });
    const debut = Date.now();
    await expect(file.executer(async () => "ok")).resolves.toBe("ok");
    expect(Date.now() - debut).toBeLessThan(500);
    expect(file.etat()).toMatchObject({ actifs: 0, navigateursVivants: 0 });
  });

  it("délai pendant le lancement : le navigateur lancé en retard est fermé, place rendue", async () => {
    const { file, lances } = banc({ dureeMaxMs: 20, delaiFermetureMs: 200 }, { lancementMs: 60 });
    await expect(file.executer(async () => "x")).rejects.toBeInstanceOf(DelaiPdfError);
    await attendre(20);
    expect(lances).toHaveLength(1);
    expect(lances[0].ferme).toBe(true);
    expect(file.etat()).toMatchObject({ actifs: 0, navigateursVivants: 0 });
  });

  it("réglages par variables d'environnement, avec valeurs par défaut sûres", () => {
    expect(optionsDepuisEnv({})).toEqual({ concurrence: 2, fileMax: 10, attenteMaxMs: 20_000, dureeMaxMs: 35_000, delaiFermetureMs: 3_000 });
    expect(optionsDepuisEnv({ PDF_CONCURRENCE: "4", PDF_FILE_MAX: "0", PDF_DUREE_MAX_MS: "abc" })).toMatchObject({ concurrence: 4, fileMax: 0, dureeMaxMs: 35_000 });
    expect(optionsDepuisEnv({ PDF_CONCURRENCE: "0" }).concurrence).toBe(2);
  });
});
