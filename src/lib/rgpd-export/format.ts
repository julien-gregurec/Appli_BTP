// Format de l'archive d'export RGPD ELSATIA — version 1 (machine : JSON ; lecture : CSV).
// Toute évolution incompatible change FORMAT_EXPORT (et la version enregistrée sur le job).

export const FORMAT_EXPORT = "elsatia.rgpd-export/1" as const;
export const FORMAT_STUDIO = "elsatia.studio-export/1" as const;

export type TypeExport = "UTILISATEUR" | "ENTREPRISE";
export type Categorie = "OWN_DATA" | "SHARED" | "THIRD_PARTY" | "BUSINESS_DATA";

/** Statut d'un fichier dans le manifeste final de l'archive. */
export type StatutFichier =
  | "INCLUS"
  | "ABSENT" // référencé en base, absent du stockage
  | "HORS_TENANT" // chemin hors du tenant de la ligne : jamais lu
  | "EXCLU_POLITIQUE" // métadonnées seulement (politique d'inclusion)
  | "ILLISIBLE" // présent mais lecture refusée / introuvable au moment de la copie
  | "EMPREINTE_DIVERGENTE"; // contenu copié mais SHA-256 ≠ empreinte enregistrée

export interface SectionIndex {
  section: string;
  table: string;
  application: string;
  domaine: string;
  categorie: Categorie;
  entreprise_id: string | null;
  lignes: number;
  json: string;
  csv: string | null;
}

export interface FichierIndex {
  source: "gestion_pro" | "studio";
  section: string;
  ligne_id: string | null;
  colonne: string;
  bucket: string;
  chemin: string;
  nom: string | null;
  mime: string | null;
  statut: StatutFichier;
  octets: number | null;
  sha256: string | null;
  sha256_attendu: string | null;
  archive: string | null;
}

export interface MetaExport {
  format: typeof FORMAT_EXPORT;
  job_id: string;
  type: TypeExport;
  entreprise_id: string | null;
  /** Export individuel : la personne ; export entreprise : null (le demandeur figure au journal). */
  demandeur_id: string | null;
  genere_le: string;
  instantane_le: string | null;
  complet: boolean;
  motifs_incompletude: string[];
  sections: SectionIndex[];
  fichiers: Record<StatutFichier, number>;
  studio: { statut: StatutStudio; format: string | null; sections: number; fichiers: number };
  perimetre_utilisateur: unknown;
}

export type StatutStudio = "NON_APPLICABLE" | "INCLUS" | "AUCUN_COMPTE" | "NON_CONFIGURE" | "INDISPONIBLE";

/** Chemins de l'archive (relatifs, sans « .. » ; les segments viennent de la base, validés). */
export const cheminsArchive = {
  meta: "export.json",
  lisezMoi: "LISEZMOI.txt",
  empreintes: "SHA256SUMS",
  manifeste: "fichiers/manifeste.json",
  classification: "classification.json",
  donnees: (s: { entreprise_id: string | null; application: string; table: string }) =>
    `donnees/${s.entreprise_id ?? "compte"}/${s.application}/${s.table}.json`,
  csv: (s: { entreprise_id: string | null; application: string; table: string }) =>
    `csv/${s.entreprise_id ?? "compte"}/${s.application}/${s.table}.csv`,
  fichier: (bucket: string, chemin: string) => `fichiers/${bucket}/${chemin}`,
  studioDonnees: "studio/donnees.json",
  studioFichier: (bucket: string, cle: string) => `studio/fichiers/${bucket}/${cle}`,
};

export const LISEZ_MOI = `EXPORT DE DONNÉES ELSATIA (${FORMAT_EXPORT})

export.json              Description de l'export : type, périmètre, complétude, index des sections.
donnees/…/<table>.json   Données, une table par fichier (tableau JSON d'objets), format machine.
csv/…/<table>.csv        Les mêmes données en CSV (UTF-8, séparateur « ; »), pour un tableur.
fichiers/manifeste.json  Tous les fichiers référencés : statut, taille, empreinte SHA-256.
fichiers/<bucket>/…      Les fichiers inclus.
studio/                  Données ELSATIA Studio (export individuel, si vous avez utilisé Studio).
classification.json      Pour chaque table : application, catégorie (OWN_DATA, SHARED,
                         THIRD_PARTY, BUSINESS_DATA) et motif d'inclusion ou d'exclusion.
SHA256SUMS               Empreinte SHA-256 de chaque fichier de l'archive.

Si export.json indique "complet": false, la liste "motifs_incompletude" et le manifeste
précisent ce qui manque. Une archive incomplète n'est jamais présentée comme complète.
`;
