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

export function celluleCsv(value: unknown): string {
  const texte = value === null || value === undefined ? "" : String(value);
  return `"${texte.replace(/"/g, '""')}"`;
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
    schema: "liria-gestion-pro/expense-export/v1",
    ...params,
    avertissement: "Les empreintes permettent un contrôle d’intégrité technique. Cet export n’est pas présenté comme un archivage qualifié.",
  };
}
