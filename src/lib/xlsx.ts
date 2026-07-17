type CelluleExcel = {
  value: unknown;
  text: string;
  numFmt: string;
  font: Record<string, unknown>;
  fill: Record<string, unknown>;
  alignment: Record<string, unknown>;
  border: Record<string, unknown>;
};

type LigneExcel = {
  height: number;
  getCell(index: number): CelluleExcel;
  eachCell(callback: (cellule: CelluleExcel) => void): void;
};

type ColonneExcel = { width: number };

type FeuilleExcel = {
  rowCount: number;
  columnCount: number;
  views: Array<Record<string, unknown>>;
  autoFilter: string;
  properties: { defaultRowHeight: number };
  pageSetup: Record<string, unknown>;
  addRows(lignes: unknown[][]): void;
  getRow(index: number): LigneExcel;
  getColumn(index: number): ColonneExcel;
  mergeCells(plage: string): void;
};

type ClasseurExcel = {
  creator: string;
  created: Date;
  addWorksheet(nom: string): FeuilleExcel;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
};

export type OptionsXlsx = {
  nomFeuille?: string;
  ligneEntetes?: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMULE_DANGEREUSE = /^[=+\-@]/;

function lettreColonne(index: number) {
  let resultat = "";
  for (let valeur = index; valeur > 0; valeur = Math.floor((valeur - 1) / 26)) {
    resultat = String.fromCharCode(65 + ((valeur - 1) % 26)) + resultat;
  }
  return resultat;
}

function texteVisible(valeur: unknown) {
  if (valeur instanceof Date) return "00/00/0000";
  if (valeur == null) return "";
  return String(valeur);
}

function valeurSecurisee(valeur: unknown) {
  if (typeof valeur === "string" && FORMULE_DANGEREUSE.test(valeur)) return `'${valeur}`;
  if (typeof valeur === "string" && ISO_DATE.test(valeur)) return new Date(`${valeur}T12:00:00Z`);
  return valeur;
}

export function calculerLargeursXlsx(lignes: unknown[][], nombreColonnes: number) {
  return Array.from({ length: nombreColonnes }, (_, index) => {
    const largeur = Math.max(...lignes.map((ligne) => texteVisible(ligne[index]).length), 10) + 2;
    return Math.min(42, largeur);
  });
}

export async function creerClasseurXlsx(lignes: unknown[][], options: OptionsXlsx = {}) {
  const ExcelJS = (await import("@excel.js/exceljs")).default;
  const classeur = new ExcelJS.Workbook() as unknown as ClasseurExcel;
  classeur.creator = "Liria Gestion Pro";
  classeur.created = new Date();

  const feuille = classeur.addWorksheet((options.nomFeuille ?? "Export").slice(0, 31));
  const nombreColonnes = Math.max(1, ...lignes.map((ligne) => ligne.length));
  const ligneEntetes = Math.min(Math.max(options.ligneEntetes ?? 1, 1), Math.max(lignes.length, 1));
  const lignesNormalisees = lignes.map((ligne) => Array.from({ length: nombreColonnes }, (_, index) => valeurSecurisee(ligne[index] ?? null)));

  feuille.addRows(lignesNormalisees);
  feuille.properties.defaultRowHeight = 20;
  feuille.views = [{ state: "frozen", ySplit: ligneEntetes, activeCell: `A${ligneEntetes + 1}` }];
  feuille.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  feuille.autoFilter = `A${ligneEntetes}:${lettreColonne(nombreColonnes)}${ligneEntetes}`;

  const entetes = lignes[ligneEntetes - 1] ?? [];
  const largeurs = calculerLargeursXlsx(lignes, nombreColonnes);
  const couleurs = { bleu: "FF0D1B2A", or: "FFC9A24A", blanc: "FFFFFFFF", ligne: "FFE5E7EB", alterne: "FFF8FAFC" };
  const bordure = { style: "thin", color: { argb: couleurs.ligne } };
  const enTete = feuille.getRow(ligneEntetes);
  enTete.height = 28;
  enTete.eachCell((cellule) => {
    cellule.font = { bold: true, color: { argb: couleurs.blanc } };
    cellule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleurs.bleu } };
    cellule.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cellule.border = { bottom: { style: "medium", color: { argb: couleurs.or } } };
  });

  if (ligneEntetes > 1 && lignes[0]?.filter((valeur) => valeur != null && valeur !== "").length === 1) {
    feuille.mergeCells(`A1:${lettreColonne(nombreColonnes)}1`);
    const titre = feuille.getRow(1);
    titre.height = 32;
    titre.eachCell((cellule) => {
      cellule.font = { bold: true, size: 16, color: { argb: couleurs.blanc } };
      cellule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleurs.bleu } };
      cellule.alignment = { vertical: "middle", horizontal: "left" };
    });
  }

  for (let index = 1; index <= nombreColonnes; index += 1) {
    feuille.getColumn(index).width = largeurs[index - 1];
    const libelle = String(entetes[index - 1] ?? "").toLocaleLowerCase("fr-FR");
    const estTaux = libelle.includes("taux");
    const estMontant = !estTaux && /(montant|ht|tva|ttc|encaiss|régl|reste|valeur|prix)/.test(libelle);
    const estQuantite = /(quantité|écart quantité|articles)/.test(libelle);
    for (let ligne = 1; ligne <= feuille.rowCount; ligne += 1) {
      const cellule = feuille.getRow(ligne).getCell(index);
      if (cellule.value instanceof Date) cellule.numFmt = "dd/mm/yyyy";
      else if (typeof cellule.value === "number" && estTaux) cellule.numFmt = '0.00 " %"';
      else if (typeof cellule.value === "number" && estMontant) cellule.numFmt = '#,##0.00 "€"';
      else if (typeof cellule.value === "number" && estQuantite) cellule.numFmt = "#,##0.00";
      if (typeof cellule.value === "number") cellule.alignment = { horizontal: "right", vertical: "middle" };
      else if (ligne !== ligneEntetes) cellule.alignment = { horizontal: "left", vertical: "middle", wrapText: libelle.includes("commentaire") || libelle.includes("article") };
      if (ligne > ligneEntetes && lignes[ligne - 1]?.some((valeur) => valeur != null && valeur !== "")) {
        cellule.border = { bottom: bordure };
        if ((ligne - ligneEntetes) % 2 === 0) cellule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: couleurs.alterne } };
      }
    }
  }

  for (let ligne = 1; ligne <= feuille.rowCount; ligne += 1) {
    const premiereCellule = feuille.getRow(ligne).getCell(1);
    const libelle = String(premiereCellule.value ?? "").toLocaleLowerCase("fr-FR");
    const valeur = feuille.getRow(ligne).getCell(2);
    if (ligne < ligneEntetes && typeof valeur.value === "number") {
      if (/(valeur|prix|montant)/.test(libelle)) valeur.numFmt = '#,##0.00 "€"';
      else valeur.numFmt = "#,##0.00";
      valeur.alignment = { horizontal: "right", vertical: "middle" };
    }
    if (String(premiereCellule.value ?? "").startsWith("SYNTHÈSE")) {
      feuille.getRow(ligne).eachCell((cellule) => {
        cellule.font = { bold: true, color: { argb: couleurs.bleu } };
        cellule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E6" } };
      });
    }
  }

  const buffer = await classeur.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function reponseXlsx(lignes: unknown[][], nomFichier: string, options: OptionsXlsx = {}) {
  const contenu = await creerClasseurXlsx(lignes, options);
  return new Response(contenu, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomFichier.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
