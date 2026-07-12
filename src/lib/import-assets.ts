type Row = Record<string, string>;
const normalise = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function tableDepuisFichier(fichier: File): Promise<string[][]> {
  const nom = fichier.name.toLowerCase(); const buffer = Buffer.from(await fichier.arrayBuffer());
  if (nom.endsWith(".xlsx")) { const ExcelJS = (await import("@excel.js/exceljs")).default; const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); const feuille = workbook.worksheets[0]; if (!feuille) throw new Error("Classeur Excel vide"); const rows: string[][] = []; feuille.eachRow({ includeEmpty: false }, (row) => { const cells: string[] = []; for (let i = 1; i <= row.cellCount; i += 1) cells.push(row.getCell(i).text.trim()); rows.push(cells); }); return rows; }
  if (nom.endsWith(".csv")) { const texte = buffer.toString("utf8").replace(/^\uFEFF/, ""); const premiere = texte.split("\n")[0]; const separateur = (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ";" : ","; return texte.split(/\r?\n/).filter(Boolean).map((line) => line.split(separateur).map((cell) => cell.replace(/^"|"$/g, "").trim())); }
  if (nom.endsWith(".pdf")) { const { extractText } = await import("unpdf"); const { text } = await extractText(new Uint8Array(buffer), { mergePages: true }); return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\t|\s{2,}|;/).map((cell) => cell.trim()).filter(Boolean)); }
  throw new Error("Format accepté : XLSX, CSV ou PDF");
}

function objets(rows: string[][], aliases: Record<string, string[]>): Row[] {
  const required = Object.keys(aliases).slice(0, 2);
  const headerIndex = rows.findIndex((row, index) => index < 30 && required.every((key) => row.some((cell) => aliases[key].includes(normalise(cell)))));
  if (headerIndex < 0) throw new Error(`Colonnes ${required.join(" et ")} introuvables`);
  const headers = rows[headerIndex].map(normalise);
  return rows.slice(headerIndex + 1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(
    Object.entries(aliases).map(([key, values]) => {
      const index = headers.findIndex((header) => values.includes(header));
      return [key, index >= 0 ? String(row[index] ?? "").trim() : ""];
    }),
  ) as Row);
}

const nombre = (value: string) => { const parsed = Number(value.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; };
export async function lireImportVehicules(fichier: File) {
  const rows = objets(await tableDepuisFichier(fichier), { immatriculation: ["immatriculation", "plaque", "immat"], marque: ["marque", "constructeur"], modele: ["modele", "model"], type: ["type", "categorie"], kilometrage: ["kilometrage", "km", "compteur"], date_mise_circulation: ["date_mise_circulation", "mise_en_circulation", "date"], controle_technique_echeance: ["controle_technique", "echeance_controle", "ct"], assurance_echeance: ["assurance", "echeance_assurance"], notes: ["notes", "commentaire"] });
  return rows.map((row) => ({ immatriculation: row.immatriculation.toUpperCase(), marque: row.marque, modele: row.modele, type: ["utilitaire", "voiture", "poids_lourd", "autre"].includes(normalise(row.type)) ? normalise(row.type) : "utilitaire", kilometrage: Math.max(0, nombre(row.kilometrage)), date_mise_circulation: row.date_mise_circulation || null, controle_technique_echeance: row.controle_technique_echeance || null, assurance_echeance: row.assurance_echeance || null, notes: row.notes || null })).filter((row) => row.immatriculation && row.marque && row.modele);
}

export async function lireImportOutils(fichier: File) {
  const rows = objets(await tableDepuisFichier(fichier), { reference: ["reference", "ref", "code"], designation: ["designation", "outil", "libelle", "nom"], categorie: ["categorie", "type"], marque: ["marque", "fabricant"], modele: ["modele", "model"], numero_serie: ["numero_serie", "serie", "serial"], etat: ["etat", "condition"], date_achat: ["date_achat", "achat", "date"], prix_achat_ht: ["prix_achat_ht", "prix_ht", "prix"], prochaine_verification: ["prochaine_verification", "verification", "echeance"], notes: ["notes", "commentaire"] });
  const categories = ["electroportatif", "manuel", "mesure", "securite", "levage", "autre"]; const etats = ["neuf", "bon", "usage", "abime", "hors_service"];
  return rows.map((row) => ({ reference: row.reference, designation: row.designation, categorie: categories.includes(normalise(row.categorie)) ? normalise(row.categorie) : "autre", marque: row.marque || null, modele: row.modele || null, numero_serie: row.numero_serie || null, etat: etats.includes(normalise(row.etat)) ? normalise(row.etat) : "bon", date_achat: row.date_achat || null, prix_achat_ht: nombre(row.prix_achat_ht) || null, prochaine_verification: row.prochaine_verification || null, notes: row.notes || null })).filter((row) => row.reference && row.designation);
}
