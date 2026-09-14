import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Puppeteer et @sparticuz/chromium sont remplacés par des doublures : aucun navigateur n'est
// lancé ici. On vérifie ce que le générateur DEMANDE à Chromium (cookies, navigation, options
// d'impression), pas le rendu — la preuve sur un vrai Chromium est dans apercu-pdf-egalite.test.ts.
const m = vi.hoisted(() => {
  const etat = { debordements: [] as number[], statut: 200 };
  const page = {
    setExtraHTTPHeaders: vi.fn(async () => {}),
    setCookie: vi.fn(async () => {}),
    goto: vi.fn(async () => ({ ok: () => etat.statut >= 200 && etat.statut < 300, status: () => etat.statut })),
    setContent: vi.fn(async () => {}),
    evaluate: vi.fn(),
    pdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  };
  const navigateur = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  const launch = vi.fn(async () => navigateur);
  return { etat, page, navigateur, launch };
});

vi.mock("puppeteer-core", () => ({ launch: m.launch }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: ["--argument-sparticuz"], executablePath: async () => "/chemin/sparticuz/chromium" },
}));

import {
  cookiesPourUrl,
  genererPdfDepuisHtml,
  genererPdfDepuisUrl,
  messageDebordement,
  nomFichierPdf,
  optionsPdf,
  pagesEnDebordement,
} from "@/lib/pdf/generer";

const URL_DOCUMENT = "https://app.exemple.invalid/imprimer/devis/0000-fictif";

const OPTIONS_V1 = {
  format: "A4",
  printBackground: true,
  margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
};
const OPTIONS_V2 = {
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  displayHeaderFooter: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.etat.debordements = [];
  m.etat.statut = 200;
  m.page.evaluate.mockImplementation(async (fn: unknown) => (fn === pagesEnDebordement ? m.etat.debordements : undefined));
  // Chemin de production par défaut, quel que soit l'environnement du poste qui lance les tests.
  vi.stubEnv("PDF_CHROMIUM_EXECUTABLE_PATH", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cookiesPourUrl : l'en-tête Cookie devient des cookies nommés portés par l'URL du document", () => {
  it("découpe plusieurs cookies et attache chacun à l'URL", () => {
    expect(cookiesPourUrl("a=1; b=deux; c=3", URL_DOCUMENT)).toEqual([
      { name: "a", value: "1", url: URL_DOCUMENT },
      { name: "b", value: "deux", url: URL_DOCUMENT },
      { name: "c", value: "3", url: URL_DOCUMENT },
    ]);
  });

  it("conserve tous les « = » après le premier (valeurs base64)", () => {
    expect(cookiesPourUrl("sb-ref-auth-token.0=base64-eyJhIjoiYiJ9==; x=a=b=c", URL_DOCUMENT)).toEqual([
      { name: "sb-ref-auth-token.0", value: "base64-eyJhIjoiYiJ9==", url: URL_DOCUMENT },
      { name: "x", value: "a=b=c", url: URL_DOCUMENT },
    ]);
  });

  it("ignore les morceaux vides et les espaces autour des séparateurs", () => {
    expect(cookiesPourUrl(" ;; a=1 ;  ; b=2; ", URL_DOCUMENT)).toEqual([
      { name: "a", value: "1", url: URL_DOCUMENT },
      { name: "b", value: "2", url: URL_DOCUMENT },
    ]);
    expect(cookiesPourUrl("", URL_DOCUMENT)).toEqual([]);
  });

  it("ignore les morceaux sans « = » ou sans nom, garde une valeur vide", () => {
    expect(cookiesPourUrl("sansegal; =orphelin; vide=; ok=1", URL_DOCUMENT)).toEqual([
      { name: "vide", value: "", url: URL_DOCUMENT },
      { name: "ok", value: "1", url: URL_DOCUMENT },
    ]);
  });

  it("chaque cookie est lié à l'URL passée, et à aucune autre", () => {
    const autre = "http://localhost:3000/imprimer/factures/1";
    const cookies = cookiesPourUrl("a=1; b=2", autre);
    expect(cookies.map((c) => c.url)).toEqual([autre, autre]);
    expect(Object.keys(cookies[0]).sort()).toEqual(["name", "url", "value"]);
  });
});

describe("genererPdfDepuisUrl : la session ne quitte jamais l'origine du document", () => {
  it("pose les cookies avec setCookie, liés à l'URL, et n'utilise JAMAIS setExtraHTTPHeaders", async () => {
    await genererPdfDepuisUrl(URL_DOCUMENT, "sb-ref-auth-token.0=base64-eyJhIjoiYiJ9==; theme=sombre");
    expect(m.page.setExtraHTTPHeaders).not.toHaveBeenCalled();
    expect(m.page.setCookie).toHaveBeenCalledTimes(1);
    expect(m.page.setCookie).toHaveBeenCalledWith(
      { name: "sb-ref-auth-token.0", value: "base64-eyJhIjoiYiJ9==", url: URL_DOCUMENT },
      { name: "theme", value: "sombre", url: URL_DOCUMENT },
    );
    // Les cookies sont posés AVANT la navigation.
    expect(m.page.setCookie.mock.invocationCallOrder[0]).toBeLessThan(m.page.goto.mock.invocationCallOrder[0]);
  });

  it("sans en-tête, ou avec un en-tête inexploitable : aucun cookie posé", async () => {
    await genererPdfDepuisUrl(URL_DOCUMENT);
    await genererPdfDepuisUrl(URL_DOCUMENT, null);
    await genererPdfDepuisUrl(URL_DOCUMENT, " ; sansegal ; =x");
    expect(m.page.setCookie).not.toHaveBeenCalled();
    expect(m.page.setExtraHTTPHeaders).not.toHaveBeenCalled();
  });

  it("refuse une réponse en erreur et ferme toujours le navigateur", async () => {
    m.etat.statut = 404;
    await expect(genererPdfDepuisUrl(URL_DOCUMENT, "a=1")).rejects.toThrow("Document introuvable (404)");
    expect(m.page.pdf).not.toHaveBeenCalled();
    expect(m.navigateur.close).toHaveBeenCalledTimes(1);
  });
});

describe("moteur 1 : options d'impression historiques inchangées", () => {
  it("par défaut : A4, fond imprimé, marges 10 mm, attente « load », aucun contrôle en page", async () => {
    const pdf = await genererPdfDepuisUrl(URL_DOCUMENT, "a=1");
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(m.page.goto).toHaveBeenCalledWith(URL_DOCUMENT, { waitUntil: "load" });
    expect(m.page.pdf.mock.calls[0]).toStrictEqual([OPTIONS_V1]);
    expect(m.page.evaluate).not.toHaveBeenCalled();
    expect(m.navigateur.close).toHaveBeenCalledTimes(1);
  });

  it("{ moteur: 1 } explicite : identique", async () => {
    await genererPdfDepuisUrl(URL_DOCUMENT, null, { moteur: 1 });
    expect(m.page.pdf.mock.calls[0]).toStrictEqual([OPTIONS_V1]);
    expect(optionsPdf(1)).toStrictEqual(OPTIONS_V1);
  });
});

describe("moteur 2 : pages A4 dessinées par le document, jamais de page tronquée", () => {
  it("attend les polices, contrôle le débordement, puis imprime au format CSS sans marge ni pied", async () => {
    await genererPdfDepuisUrl(URL_DOCUMENT, "a=1", { moteur: 2 });
    expect(m.page.goto).toHaveBeenCalledWith(URL_DOCUMENT, { waitUntil: "load" });
    expect(m.page.evaluate).toHaveBeenCalledTimes(2);
    const [[attentePolices], [controle]] = m.page.evaluate.mock.calls;
    expect(attentePolices).not.toBe(pagesEnDebordement);
    expect(controle).toBe(pagesEnDebordement);
    expect(m.page.evaluate.mock.invocationCallOrder[1]).toBeLessThan(m.page.pdf.mock.invocationCallOrder[0]);
    expect(m.page.pdf.mock.calls[0]).toStrictEqual([OPTIONS_V2]);
    expect(optionsPdf(2)).toStrictEqual(OPTIONS_V2);
  });

  it("un débordement mesuré LÈVE une erreur explicite, n'imprime rien et ferme le navigateur", async () => {
    m.etat.debordements = [2, 3];
    await expect(genererPdfDepuisUrl(URL_DOCUMENT, null, { moteur: 2 })).rejects.toThrow(
      "Mise en page à corriger : débordement page(s) 2, 3",
    );
    expect(m.page.pdf).not.toHaveBeenCalled();
    expect(m.navigateur.close).toHaveBeenCalledTimes(1);
  });

  it("messageDebordement : texte français attendu", () => {
    expect(messageDebordement([2, 3])).toBe("Mise en page à corriger : débordement page(s) 2, 3");
    expect(messageDebordement([1])).toBe("Mise en page à corriger : débordement page(s) 1");
  });
});

describe("pagesEnDebordement : mesure des pages A4 (DOM simulé)", () => {
  type FaussePage = { numero: string | null; contenu: { scrollHeight: number; clientHeight: number } | null };
  const racine = (pages: FaussePage[]) =>
    ({
      querySelectorAll: (selecteur: string) => {
        expect(selecteur).toBe(".doc-a4__page");
        return pages.map((p) => ({
          getAttribute: (nom: string) => (nom === "data-page" ? p.numero : null),
          querySelector: (s: string) => (s === ".doc-a4__contenu" ? p.contenu : null),
        }));
      },
    }) as unknown as ParentNode;

  it("signale chaque page dont le contenu dépasse de plus d'1 px, par son numéro", () => {
    expect(
      pagesEnDebordement(
        racine([
          { numero: "1", contenu: { scrollHeight: 1000, clientHeight: 1000 } },
          { numero: "2", contenu: { scrollHeight: 1001, clientHeight: 1000 } }, // arrondi toléré
          { numero: "3", contenu: { scrollHeight: 1002, clientHeight: 1000 } },
          { numero: null, contenu: { scrollHeight: 5000, clientHeight: 1000 } }, // sans numéro : rang
          { numero: "5", contenu: null },
        ]),
      ),
    ).toEqual([3, 4]);
  });

  it("aucune page ou aucun débordement : liste vide", () => {
    expect(pagesEnDebordement(racine([]))).toEqual([]);
    expect(pagesEnDebordement(racine([{ numero: "1", contenu: { scrollHeight: 10, clientHeight: 900 } }]))).toEqual([]);
  });
});

describe("genererPdfDepuisHtml : impression d'un HTML complet, sans navigation ni cookie", () => {
  it("charge le HTML par setContent (attente « load ») et suit le chemin du moteur 2", async () => {
    const html = "<!doctype html><html><body>fictif</body></html>";
    await genererPdfDepuisHtml(html, { moteur: 2 });
    expect(m.page.setContent).toHaveBeenCalledWith(html, { waitUntil: "load" });
    expect(m.page.goto).not.toHaveBeenCalled();
    expect(m.page.setCookie).not.toHaveBeenCalled();
    expect(m.page.setExtraHTTPHeaders).not.toHaveBeenCalled();
    expect(m.page.pdf.mock.calls[0]).toStrictEqual([OPTIONS_V2]);
    expect(m.navigateur.close).toHaveBeenCalledTimes(1);
  });

  it("par défaut : moteur 1", async () => {
    await genererPdfDepuisHtml("<p>fictif</p>");
    expect(m.page.pdf.mock.calls[0]).toStrictEqual([OPTIONS_V1]);
  });
});

describe("lancement de Chromium", () => {
  it("production : exactement le lancement @sparticuz/chromium d'avant", async () => {
    await genererPdfDepuisUrl(URL_DOCUMENT);
    expect(m.launch).toHaveBeenCalledWith({
      args: ["--argument-sparticuz"],
      executablePath: "/chemin/sparticuz/chromium",
      headless: true,
    });
  });

  it("PDF_CHROMIUM_EXECUTABLE_PATH défini : Chromium local, headless, sans bac à sable", async () => {
    vi.stubEnv("PDF_CHROMIUM_EXECUTABLE_PATH", "/chemin/local/chromium");
    await genererPdfDepuisHtml("<p>fictif</p>");
    expect(m.launch).toHaveBeenCalledWith({
      executablePath: "/chemin/local/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  });
});

describe("nomFichierPdf (inchangé)", () => {
  it("nomme devis et factures sans caractère venu d'une saisie", () => {
    expect(nomFichierPdf(false, "D-2026/001")).toBe("devis-D-2026-001.pdf");
    expect(nomFichierPdf(true, "")).toBe("facture-document.pdf");
  });
});
