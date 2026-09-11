/**
 * Import du catalogue des devis par l'assistant de reprise — profil « moteur de devis v2 ».
 * Module PUR, utilisable côté écran comme côté serveur.
 *
 * N'est employé que si `devisV2Actif()` : l'action serveur le signale à l'assistant lors de
 * l'analyse du fichier. Éteint, le profil « Catalogue / articles » historique reste inchangé.
 *
 * L'assistant associe chaque champ à une colonne du fichier ; ce module transforme ces
 * associations en lignes au format de `planifierImportCatalogue` (en-têtes canoniques), qui décide
 * seul de chaque création, mise à jour ou refus.
 */

import {
  COLONNES_IMPORT_CATALOGUE,
  STATUTS_LIGNE_IMPORT,
  type CleRapprochement,
  type ColonneImportCatalogue,
  type StatutLigneImport,
} from "@/lib/devis/import-catalogue";
import { normaliserEnteteImport, type ChampImport } from "@/lib/import/config";

export { STATUTS_LIGNE_IMPORT };

/** Ce que l'analyse du fichier transmet à l'assistant quand le moteur v2 est actif. */
export type OptionsImportCatalogueV2 = {
  /** Droit d'importer dans le catalogue des devis (revérifié par l'action d'import). */
  autorise: boolean;
  /** Droit de modifier les prix d'achat : sans lui, la colonne est lue mais jamais importée. */
  prixAchat: boolean;
};

const possede = (p: readonly string[] | null, cle: string) => p === null || p.includes(cle);

/**
 * Droits de l'import v2 du catalogue.
 * - `importer` : le droit d'accès à l'assistant (le même que sa page : gérer les utilisateurs ou
 *   les connecteurs) ET l'accès aux devis — sans lui, la RLS masquerait le catalogue et chaque
 *   ligne serait prise pour un nouvel article — ET la gestion des devis.
 * - `voirCouts` : les prix d'achat existants sont lus pour comparer, jamais renvoyés.
 * - `gererCouts` : les prix d'achat du fichier sont importés.
 */
export function droitsImportCatalogueV2(permissions: readonly string[] | null) {
  const importer = (possede(permissions, "gerer_utilisateurs") || possede(permissions, "gerer_connecteurs"))
    && possede(permissions, "acces_devis")
    && possede(permissions, "gerer_devis");
  return {
    importer,
    voirCouts: importer && possede(permissions, "voir_couts_devis"),
    gererCouts: importer && possede(permissions, "gerer_couts_devis"),
  };
}

export const CHAMPS_CATALOGUE_V2 = [
  { cle: "reference_interne", libelle: "Référence interne", aide: "Clé de rapprochement par défaut" },
  { cle: "reference_fabricant", libelle: "Référence fabricant" },
  { cle: "code_barres", libelle: "Code-barres / EAN" },
  { cle: "designation", libelle: "Désignation", aide: "Obligatoire pour créer un article" },
  { cle: "description", libelle: "Description" },
  { cle: "fabricant", libelle: "Fabricant / marque" },
  { cle: "fournisseur", libelle: "Fournisseur", aide: "Nom ou référence d’un fournisseur existant — un import n’en crée jamais" },
  { cle: "unite", libelle: "Unité", aide: "Obligatoire pour créer un article (h, m², ml, u…)" },
  { cle: "prix_vente_ht", libelle: "Prix de vente HT", aide: "Obligatoire pour créer un article" },
  { cle: "taux_tva", libelle: "Taux TVA (%)" },
  { cle: "categorie", libelle: "Catégorie" },
  { cle: "actif", libelle: "Actif", aide: "oui / non, true / false, 1 / 0, actif / archivé" },
  { cle: "prix_achat_ht", libelle: "Prix d’achat HT", aide: "Importé seulement avec le droit de gérer les coûts" },
] as const satisfies ReadonlyArray<ChampImport & { cle: ColonneImportCatalogue }>;

export const CLES_RAPPROCHEMENT: ReadonlyArray<{ cle: CleRapprochement; libelle: string }> = [
  { cle: "reference_interne", libelle: "Référence interne" },
  { cle: "reference_fabricant", libelle: "Référence fabricant" },
  { cle: "code_barres", libelle: "Code-barres" },
  { cle: "aucune", libelle: "Aucune — créer toutes les lignes" },
];

export function lireCleRapprochement(valeur: unknown): CleRapprochement | null {
  return CLES_RAPPROCHEMENT.find((c) => c.cle === valeur)?.cle ?? null;
}

export const LIBELLES_STATUT_IMPORT: Record<StatutLigneImport, string> = {
  creee: "Créée",
  mise_a_jour: "Mise à jour",
  ignoree: "Ignorée",
  doublon: "Doublon",
  reference_absente: "Référence absente",
  fournisseur_inconnu: "Fournisseur inconnu",
  valeur_invalide: "Valeur invalide",
  refusee: "Refusée",
};

const ALIASES: Record<ColonneImportCatalogue, string[]> = {
  reference_interne: ["referenceinterne", "refinterne", "reference", "ref", "codearticle", "referencearticle", "codeproduit"],
  reference_fabricant: ["referencefabricant", "reffabricant", "referenceconstructeur", "refconstructeur", "referencefab", "reffab"],
  code_barres: ["codebarres", "codebarre", "ean", "ean13", "codeean", "gtin"],
  designation: ["designation", "libellearticle", "libelle", "article", "nomarticle"],
  description: ["description", "descriptionlongue", "detail"],
  fabricant: ["fabricant", "marque", "constructeur"],
  fournisseur: ["fournisseur", "nomfournisseur", "fournisseurprincipal"],
  unite: ["unite", "unitedevente", "uvente"],
  prix_vente_ht: ["prixventeht", "pvht", "prixvente", "tarifht", "prixunitaireht", "puht"],
  taux_tva: ["tauxtva", "tva", "pourcentagetva"],
  categorie: ["categorie", "famille", "rubrique", "sousfamille"],
  actif: ["actif", "active"],
  prix_achat_ht: ["prixachatht", "paht", "prixachat", "coutunitaire", "prixrevient"],
};

/**
 * Correspondances proposées. Deux passes, pour qu'un intitulé exact ne soit jamais pris par un
 * champ voisin : d'abord les égalités exactes ; ensuite, pour les champs restants, les inclusions,
 * les plus longues d'abord (« Réf. fabricant » va à la référence fabricant, pas à la référence
 * interne parce qu'il contient « ref »).
 */
export function suggererMappingCatalogueV2(colonnes: readonly string[]): Record<string, number> {
  const normalisees = colonnes.map(normaliserEnteteImport);
  const aliases = (cle: ColonneImportCatalogue) => [...new Set([...ALIASES[cle], cle, ...CHAMPS_CATALOGUE_V2.filter((c) => c.cle === cle).map((c) => c.libelle)]
    .map(normaliserEnteteImport).filter(Boolean))];
  const mapping: Record<string, number> = Object.fromEntries(CHAMPS_CATALOGUE_V2.map((c) => [c.cle, -1]));
  const utilisees = new Set<number>();

  for (const { cle } of CHAMPS_CATALOGUE_V2) {
    const liste = aliases(cle);
    const index = normalisees.findIndex((col, i) => !utilisees.has(i) && liste.includes(col));
    if (index >= 0) { mapping[cle] = index; utilisees.add(index); }
  }

  const candidats: Array<{ cle: ColonneImportCatalogue; index: number; force: number; rang: number }> = [];
  CHAMPS_CATALOGUE_V2.forEach(({ cle }, rang) => {
    if (mapping[cle] >= 0) return;
    for (const alias of aliases(cle)) {
      if (alias.length < 5) continue;
      normalisees.forEach((col, index) => {
        if (utilisees.has(index) || col.length < 3) return;
        if (col.includes(alias) || alias.includes(col)) candidats.push({ cle, index, force: Math.min(alias.length, col.length), rang });
      });
    }
  });
  candidats.sort((a, b) => b.force - a.force || a.rang - b.rang || a.index - b.index);
  for (const c of candidats) {
    if (mapping[c.cle] >= 0 || utilisees.has(c.index)) continue;
    mapping[c.cle] = c.index;
    utilisees.add(c.index);
  }
  return mapping;
}

/** Associations valides : champ connu → index entier d'une colonne existante. */
function associationsValides(mapping: Readonly<Record<string, unknown>>, nbColonnes: number): Array<[ColonneImportCatalogue, number]> {
  const valides: Array<[ColonneImportCatalogue, number]> = [];
  for (const colonne of COLONNES_IMPORT_CATALOGUE) {
    const index = mapping[colonne];
    if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < nbColonnes) valides.push([colonne, index]);
  }
  return valides;
}

/**
 * Lignes du fichier → enregistrements aux en-têtes canoniques pour le planificateur.
 * `colonnesInconnues` : colonnes du fichier associées à aucun champ — elles ne sont pas importées,
 * et le rapport les nomme (une colonne oubliée est une donnée perdue).
 */
export function lignesPourPlanificateur(
  entete: readonly string[],
  lignes: readonly (readonly unknown[])[],
  mapping: Readonly<Record<string, unknown>>,
): { lignes: Record<string, string>[]; colonnesInconnues: string[] } {
  const associations = associationsValides(mapping, entete.length);
  const utilisees = new Set(associations.map(([, index]) => index));
  return {
    lignes: lignes.map((ligne) => Object.fromEntries(associations.map(([colonne, index]) => [colonne, String(ligne[index] ?? "")]))),
    colonnesInconnues: entete
      .map((nom, index) => ({ nom: String(nom ?? "").trim() || `Colonne ${index + 1}`, index }))
      .filter(({ index }) => !utilisees.has(index))
      .map(({ nom }) => nom),
  };
}

/** Contrôle avant l'envoi : message à afficher, ou `null`. */
export function erreurMappingCatalogueV2(mapping: Readonly<Record<string, number>>, cle: CleRapprochement): string | null {
  const associe = (c: ColonneImportCatalogue) => (mapping[c] ?? -1) >= 0;
  if (cle !== "aucune" && !associe(cle)) {
    const libelle = CLES_RAPPROCHEMENT.find((c) => c.cle === cle)?.libelle ?? cle;
    return `La clé de rapprochement « ${libelle} » n’est associée à aucune colonne du fichier. Associez-la, ou choisissez « Aucune » pour tout créer.`;
  }
  if (cle === "aucune") {
    const manquants = CHAMPS_CATALOGUE_V2.filter((c) => ["designation", "unite", "prix_vente_ht"].includes(c.cle) && !associe(c.cle));
    if (manquants.length) return `Champs obligatoires pour créer des articles non associés : ${manquants.map((c) => c.libelle).join(", ")}`;
  }
  return null;
}
