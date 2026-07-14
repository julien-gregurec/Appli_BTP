import "server-only";

export type FichierAnalyse = { entete: string[]; lignes: string[][]; total: number };

// Parse un CSV en détectant le séparateur (`,` ou `;`, courant en France) et en gérant les guillemets.
function parseCsv(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, ""); // BOM
  const premiereLigne = contenu.slice(0, contenu.indexOf("\n") >= 0 ? contenu.indexOf("\n") : contenu.length);
  const sep = (premiereLigne.match(/;/g)?.length ?? 0) > (premiereLigne.match(/,/g)?.length ?? 0) ? ";" : ",";

  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let entreGuillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') { champ += '"'; i++; }
        else entreGuillemets = false;
      } else champ += c;
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ); champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some((v) => v.trim() !== "")) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); if (ligne.some((v) => v.trim() !== "")) lignes.push(ligne); }
  return lignes;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = await import("@excel.js/exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)));
  const sheet = workbook.worksheets[0];
  const lignes: string[][] = [];
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    const valeurs: string[] = [];
    // row.values est 1-indexé (index 0 vide).
    const brut = (row as unknown as { values: unknown[] }).values;
    for (let i = 1; i < brut.length; i++) {
      const v = brut[i];
      valeurs.push(v == null ? "" : typeof v === "object" && v !== null && "text" in v ? String((v as { text: unknown }).text) : String(v));
    }
    if (valeurs.some((v) => v.trim() !== "")) lignes.push(valeurs);
  });
  return lignes;
}

export async function analyserFichier(file: File): Promise<FichierAnalyse> {
  const nom = file.name.toLowerCase();
  let matrice: string[][];
  if (nom.endsWith(".xlsx") || nom.endsWith(".xls")) {
    matrice = await parseXlsx(await file.arrayBuffer());
  } else {
    matrice = parseCsv(await file.text());
  }
  if (matrice.length === 0) return { entete: [], lignes: [], total: 0 };
  const entete = matrice[0].map((v) => v.trim());
  const lignes = matrice.slice(1);
  return { entete, lignes, total: lignes.length };
}
