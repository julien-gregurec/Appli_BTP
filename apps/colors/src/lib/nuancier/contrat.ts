/**
 * Contrat d'un nuancier chargé dans ELSATIA Colors.
 *
 * ### Pourquoi aucun nuancier n'est livré avec l'application
 *
 * Les nuanciers du marché — RAL Classic au premier chef, et l'essentiel des
 * nuanciers fabricants — sont des bases protégées. Les recopier dans le dépôt
 * ferait porter à ELSATIA une contrefaçon, et le ferait pour un gain nul : une
 * valeur sRGB approchée d'un standard mesuré en laboratoire n'a pas la valeur
 * du standard. Colors ne livre donc AUCUNE référence, et n'en fabrique aucune.
 *
 * Ce que l'application fournit est le mécanisme : un format déclaré, une
 * source nommée, une version, une mention de licence, et un moteur de
 * proximité. Fournir les données est une décision de l'exploitant, qui seul
 * peut détenir les droits correspondants — licence RAL, nuancier fabricant
 * communiqué par contrat, ou nuancier propre à l'organisation.
 *
 * ### Format
 *
 * Un fichier JSON désigné par la variable d'environnement
 * `COLORS_NUANCIER_FICHIER` (chemin absolu, ou relatif au répertoire de
 * travail du serveur) :
 *
 * ```json
 * {
 *   "source": "Nuancier interne Peintures Martin",
 *   "version": "2026-03",
 *   "licence": "Communiqué par le fournisseur, usage interne autorisé",
 *   "references": [{ "code": "PM-1024", "nom": "Bleu atelier", "hex": "#2E5B8A" }]
 * }
 * ```
 *
 * Les quatre champs de tête sont obligatoires : un nuancier sans source ni
 * version ne peut pas être cité dans un export, et un nuancier sans mention de
 * licence ne devrait pas être chargé du tout. Un fichier incomplet est refusé
 * en bloc plutôt que chargé à moitié.
 */

export type ReferenceNuancier = { code: string; nom: string | null; hex: `#${string}` };

export type NuancierCharge = {
  disponible: true;
  source: string;
  version: string;
  licence: string;
  references: ReferenceNuancier[];
};

export type NuancierAbsent = {
  disponible: false;
  /** Pourquoi aucun nuancier n'est exploitable. Toujours affichable en clair. */
  raison: "non_configure" | "introuvable" | "illisible" | "format_invalide" | "vide";
};

export type EtatNuancier = NuancierCharge | NuancierAbsent;

export const RAISONS_NUANCIER: Record<NuancierAbsent["raison"], string> = {
  non_configure: "Aucun nuancier n’est configuré pour cette installation.",
  introuvable: "Le fichier de nuancier déclaré est introuvable.",
  illisible: "Le fichier de nuancier déclaré n’a pas pu être lu.",
  format_invalide: "Le fichier de nuancier ne respecte pas le format attendu.",
  vide: "Le nuancier chargé ne contient aucune référence exploitable.",
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

function texteNonVide(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null;
}

/**
 * Analyse le contenu d'un fichier de nuancier.
 *
 * Fonction pure : elle ne lit aucun fichier et ne consulte aucune variable
 * d'environnement, ce qui la rend testable dans les deux sens — nuancier
 * conforme et nuancier refusé — sans toucher au disque.
 *
 * Les références invalides sont écartées une à une plutôt que de faire échouer
 * l'ensemble : un nuancier fabricant comporte souvent des lignes de séparation
 * ou des références sans valeur numérique. En revanche, une entête incomplète
 * refuse le fichier entier : sans source, version et licence, rien de ce qui
 * suit ne peut être cité honnêtement.
 */
export function analyserNuancier(contenu: unknown): EtatNuancier {
  if (typeof contenu !== "object" || contenu === null || Array.isArray(contenu)) {
    return { disponible: false, raison: "format_invalide" };
  }
  const brut = contenu as Record<string, unknown>;
  const source = texteNonVide(brut.source);
  const version = texteNonVide(brut.version);
  const licence = texteNonVide(brut.licence);
  if (!source || !version || !licence || !Array.isArray(brut.references)) {
    return { disponible: false, raison: "format_invalide" };
  }

  const vues = new Set<string>();
  const references: ReferenceNuancier[] = [];
  for (const entree of brut.references) {
    if (typeof entree !== "object" || entree === null) continue;
    const ligne = entree as Record<string, unknown>;
    const code = texteNonVide(ligne.code);
    const hex = texteNonVide(ligne.hex);
    if (!code || !hex || !HEX.test(hex)) continue;
    if (vues.has(code)) continue;
    vues.add(code);
    references.push({ code, nom: texteNonVide(ligne.nom), hex: hex.toUpperCase() as `#${string}` });
  }

  if (references.length === 0) return { disponible: false, raison: "vide" };
  return { disponible: true, source, version, licence, references };
}
