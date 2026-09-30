import { nomFichierSur } from "@/lib/expenses/files";

export type EntreeManifeste = {
  chemin: string;
  sha256: string;
  taille: number;
  noteReference: string;
  documentVersionId: string;
};

export function nomJustificatifExport(date: string, fournisseur: string | null, montantTtc: number, reference: string, extension: string) {
  return nomFichierSur(`${date}_${fournisseur || "Sans-fournisseur"}_${montantTtc.toFixed(2).replace(".", "-")}EUR_${reference}.${extension}`);
}

// Caractères qui, en tête d'une cellule, déclenchent une formule dans Excel /
// LibreOffice (injection CSV). Un justificatif de note de frais porte des champs
// saisis par le salarié (fournisseur, chantier) : ils sont neutralisés par un
// apostrophe de tête (REDTEAM-V2 D5).
const CARACTERES_FORMULE_CSV = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function celluleCsv(value: unknown): string {
  const texte = value === null || value === undefined ? "" : String(value);
  const sur = texte.length > 0 && CARACTERES_FORMULE_CSV.has(texte.charAt(0)) ? `'${texte}` : texte;
  return `"${sur.replace(/"/g, '""')}"`;
}

export function creerCsv(entetes: string[], lignes: unknown[][]): string {
  return [entetes, ...lignes].map((ligne) => ligne.map(celluleCsv).join(";")).join("\n");
}

export function creerManifeste(params: {
  entrepriseId: string;
  entrepriseNom: string;
  periodeDebut: string;
  periodeFin: string;
  genereAt: string;
  fichiers: EntreeManifeste[];
}) {
  return {
    schema: "elsatia-gestion-pro/expense-export/v2",
    ...params,
    avertissement: "Les empreintes permettent un contrôle d’intégrité technique. Cet export n’est pas présenté comme un archivage qualifié.",
  };
}
