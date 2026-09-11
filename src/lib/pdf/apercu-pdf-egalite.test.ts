/**
 * Preuve « aperçu = PDF » du moteur de présentation v2, sur un VRAI Chromium.
 *
 * Le HTML rendu par DocumentA4 (le composant de l'aperçu) est imprimé par le générateur de
 * production (`genererPdfDepuisHtml`, même chemin d'impression que `genererPdfDepuisUrl`), puis
 * le texte de CHAQUE page du PDF est relu. On exige que Chromium n'ait ni ajouté, ni retiré, ni
 * déplacé une page ou une ligne par rapport à ce que `paginer()` a décidé.
 *
 * Nécessite un Chromium local : `PDF_CHROMIUM_EXECUTABLE_PATH=<binaire> vitest run <ce fichier>`.
 * Sans cette variable, la suite est IGNORÉE (et affichée comme telle), jamais faussement verte.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { extractTextItems, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { euros } from "@/lib/devis";
import { construireVueDocument, type VueDocument } from "@/lib/devis/document-modele";
import { resoudreFiligrane } from "@/lib/devis/filigrane";
import { sourceFictive } from "@/lib/devis/fixtures/document-fictif";
import { paginer, type PageDocument } from "@/lib/devis/pagination";
import { genererPdfDepuisHtml, messageDebordement } from "@/lib/pdf/generer";

const chromium = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
/** Un seul lancement de Chromium par test, sur un poste chargé : délai large, aucune relance. */
const DELAI_MS = 120_000;

function htmlComplet(vue: VueDocument, pages?: PageDocument[]): string {
  const corps = renderToStaticMarkup(createElement(DocumentA4, { vue, pages, mode: "impression" }));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="margin:0">${corps}</body></html>`;
}

/**
 * Texte de chaque page du PDF.
 *
 * `extractText` d'unpdf colle les fragments SANS séparateur : « Prestation fictive n° 12 » suivi
 * de la cellule « 2 u » donnerait « n° 122 u », et un numéro de ligne FAUX. On relit donc les
 * fragments (même `getTextContent` de PDF.js) et on les joint par une espace.
 */
async function textesDesPages(pdf: Buffer): Promise<string[]> {
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const { items } = await extractTextItems(document);
  return items.map((fragments) => fragments.map((f) => f.str).join(" "));
}

const numerosLus = (texte: string): number[] =>
  [...new Set([...texte.matchAll(/Prestation\s*fictive\s*n\s*°\s*(\d+)/g)].map((r) => Number(r[1])))].sort((a, b) => a - b);

const numerosAttendus = (page: PageDocument): number[] =>
  page.blocs
    .flatMap((b) => (b.type === "tableau" ? b.lignes.map((l) => l.cle) : []))
    .filter((cle) => /^l\d+$/.test(cle))
    .map((cle) => Number(cle.slice(1)))
    .sort((a, b) => a - b);

/** Espaces (y compris insécables et fines insécables des montants) retirées des deux côtés. */
const compact = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, "");
const contientMontant = (texte: string, montant: number) => {
  const cible = compact(euros(montant)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d,])${cible}`).test(compact(texte));
};

function montantsDesTotaux(vue: VueDocument): number[] {
  const t = vue.totaux;
  const a = vue.totauxAffiches;
  return [
    ...(t.remiseGlobaleHt !== 0 ? [t.sousTotalHt, t.remiseGlobaleHt] : []),
    a.totalHt,
    ...(t.ventilation.length > 1 ? t.ventilation.flatMap((v) => [v.baseHt, v.montantTva]) : []),
    a.totalTva,
    a.totalTtc,
  ];
}

/** Imprime la vue et confronte chaque page du PDF à la pagination décidée par les données. */
async function constater(vue: VueDocument) {
  const pages = paginer(vue);
  const pdf = await genererPdfDepuisHtml(htmlComplet(vue), { moteur: 2 });
  const textes = await textesDesPages(pdf);

  // (1) Même nombre de pages.
  expect(textes.length, "nombre de pages du PDF").toBe(pages.length);

  // (2) Sur chaque page, exactement les lignes décidées par le paginateur. Tous les écarts sont
  // rassemblés pour que l'échec dise QUELLE page diffère et comment.
  const ecarts = pages
    .map((p, i) => ({ page: p.numero, attendus: numerosAttendus(p), lus: numerosLus(textes[i] ?? "") }))
    .filter((e) => e.attendus.join(",") !== e.lus.join(","));
  expect(ecarts, "pages dont les lignes diffèrent (attendus = paginer, lus = PDF)").toEqual([]);
  expect(pages.flatMap(numerosAttendus)).toHaveLength(vue.lignes.filter((l) => /^l\d+$/.test(l.cle)).length);

  // (3) Chaque page porte son propre « Page i / n ».
  const n = pages.length;
  textes.forEach((texte, i) => {
    expect(texte, `pied de la page ${i + 1}`).toMatch(new RegExp(`Page\\s*${i + 1}\\s*/\\s*${n}(?!\\d)`));
  });

  // (4) Les totaux sont sur la page où le paginateur les a posés.
  const indexTotaux = pages.findIndex((p) => p.blocs.some((b) => b.type === "totaux"));
  expect(indexTotaux).toBeGreaterThanOrEqual(0);

  // Constat lisible dans la sortie du test : pages et lignes relues dans le PDF.
  console.info(
    `[aperçu = PDF] ${pdf.length} octets, ${textes.length} page(s), totaux page ${indexTotaux + 1} — `
      + textes.map((t, i) => {
        const lus = numerosLus(t);
        return `p${i + 1}: ${lus.length ? `n° ${lus[0]}–${lus[lus.length - 1]} (${lus.length})` : "aucune ligne libre"}`;
      }).join(" ; "),
  );
  return { pages, textes, pdf, indexTotaux };
}

describe.skipIf(!chromium)("aperçu = PDF (moteur v2, Chromium réel)", () => {
  it(
    "devis fictif de 70 lignes libres : mêmes pages, mêmes lignes par page, pieds et total TTC",
    async () => {
      const vue = construireVueDocument(sourceFictive({ lignesLibres: 70 }));
      const { pages, textes, pdf, indexTotaux } = await constater(vue);
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      // Les totaux peuvent légitimement précéder une dernière page de mentions : on les cherche sur
      // la page où le paginateur les a posés (la dernière, pour ce document).
      expect(contientMontant(textes[indexTotaux], vue.totauxAffiches.totalTtc), `total TTC ${euros(vue.totauxAffiches.totalTtc)} page ${indexTotaux + 1}/${pages.length}`).toBe(true);
    },
    DELAI_MS,
  );

  it(
    "avec filigrane BROUILLON : la pagination tient et chaque montant des totaux reste présent",
    async () => {
      const filigrane = resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", document: { type: "texte", preset: "BROUILLON" } });
      expect(filigrane.type).toBe("texte");
      const vue = construireVueDocument(sourceFictive({ lignesLibres: 70, filigrane }));
      const { textes, indexTotaux } = await constater(vue);
      const absents = montantsDesTotaux(vue).filter((x) => !contientMontant(textes[indexTotaux], x)).map((x) => euros(x));
      expect(absents, "montants des totaux absents du PDF").toEqual([]);
    },
    DELAI_MS,
  );

  it(
    "une page qui déborde réellement n'est JAMAIS imprimée : erreur explicite",
    async () => {
      const vue = construireVueDocument(sourceFictive({ lignesLibres: 70 }));
      // Pagination volontairement fausse : les 70 lignes sur une seule page.
      const pages = paginer(vue, undefined, Number.MAX_SAFE_INTEGER);
      expect(pages).toHaveLength(1);
      await expect(genererPdfDepuisHtml(htmlComplet(vue, pages), { moteur: 2 })).rejects.toThrow(messageDebordement([1]));
    },
    DELAI_MS,
  );
});
