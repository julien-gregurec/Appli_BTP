/**
 * Exports CSV du catalogue et des lignes d'un devis — module PUR.
 *
 * Les deux fichiers passent par `csv()` (src/lib/csv.ts) : séparateur `;`, BOM UTF-8 pour Excel,
 * virgule décimale, et neutralisation des cellules qui commencent par `=`, `+`, `-` ou `@`
 * (injection de formule). Ce module ne choisit que les colonnes et les valeurs.
 *
 * ── Les coûts ne sortent que sur demande ─────────────────────────────────────────────────
 *
 * Sans l'option, la colonne du prix d'achat n'existe PAS — ni vide, ni masquée. Une colonne vide
 * se lirait « prix inconnu » et inviterait à la remplir ; une colonne absente ne se prête à
 * aucune lecture. Le droit de l'utilisateur est vérifié par l'appelant ; ici, on obéit. Quand
 * elle est présente, cette colonne vient en DERNIER : les autres gardent la même position que le
 * fichier contienne ou non les coûts, et un tableur préparé pour l'un sert pour l'autre.
 *
 * Le fichier catalogue reprend exactement les en-têtes que lit `planifierImportCatalogue` :
 * exporter, corriger dans un tableur, réimporter ne produit que les changements saisis.
 */

import { csv } from "@/lib/csv";
import type { ArticleExistant, ColonneImportCatalogue } from "@/lib/devis/import-catalogue";
import { dec, montantLigneHt, versTexte } from "@/lib/devis/montants";
import type { ElementDevis } from "@/lib/devis/presentation";

export const ENTETES_CATALOGUE = [
  "reference_interne",
  "reference_fabricant",
  "code_barres",
  "designation",
  "description",
  "fabricant",
  "fournisseur",
  "unite",
  "prix_vente_ht",
  "taux_tva",
  "categorie",
  "actif",
] as const satisfies readonly ColonneImportCatalogue[];

export const ENTETES_LIGNES_DEVIS = [
  "ordre",
  "ouvrage_reference",
  "ouvrage_nom",
  "ouvrage_version",
  "cle_ligne",
  "reference_interne",
  "reference_fabricant",
  "designation",
  "quantite",
  "unite",
  "prix_unitaire_ht",
  "remise_ligne_pct",
  "taux_tva",
  "total_ht",
] as const;

/**
 * Valeur décimale telle que `csv()` doit la recevoir.
 *
 * Jusqu'à deux décimales, on passe le nombre : `csv()` l'écrit « 12,50 », sans guillemets, et
 * exactement. Au-delà — une quantité de 12,345 m², un prix unitaire au millième, ce que les lignes
 * de devis (`numeric` sans échelle) admettent — `nombreCsv` arrondirait au centime : on passe le
 * texte EXACT à virgule. Limite connue, héritée de `csv()` et acceptée : un tel texte NÉGATIF
 * (ajustement au millième) reçoit l'apostrophe anti-formule et se lit comme du texte.
 *
 * Un nombre non fini sort vide plutôt qu'en « 0,00 » : un zéro inventé est une donnée fausse.
 */
function decimalCsv(x: number | null | undefined): number | string | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const texte = versTexte(dec(x));
  return (texte.split(".")[1] ?? "").length <= 2 ? x : texte.replace(".", ",");
}

/**
 * Catalogue d'articles au format de réimport.
 *
 * `nomsFournisseurs` : identifiant → nom. Un fournisseur absent de la table sort vide : réimporté,
 * un vide laisse le rattachement intact, alors qu'un identifiant technique serait refusé comme
 * fournisseur inconnu.
 */
export function exporterCatalogueCsv(
  articles: readonly ArticleExistant[],
  o: { inclurePrixAchat: boolean; nomsFournisseurs: ReadonlyMap<string, string> },
): string {
  const entetes: string[] = [...ENTETES_CATALOGUE, ...(o.inclurePrixAchat ? ["prix_achat_ht"] : [])];
  const lignes = articles.map((a) => {
    const ligne: unknown[] = [
      a.referenceInterne,
      a.referenceFabricant,
      a.codeBarres,
      a.designation,
      a.description,
      a.fabricant,
      a.fournisseurId ? (o.nomsFournisseurs.get(a.fournisseurId) ?? null) : null,
      a.unite,
      decimalCsv(a.prixVenteHt),
      decimalCsv(a.tauxTva),
      a.categorie,
      a.actif ? "oui" : "non",
    ];
    if (o.inclurePrixAchat) ligne.push(decimalCsv(a.prixAchatHt));
    return ligne;
  });
  return csv([entetes, ...lignes]);
}

type LigneExport = {
  ordre: number;
  ouvrage: { reference: string | null; nom: string; version: number } | null;
  cle: string;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  designation: string;
  quantite: number;
  unite: string;
  prixUnitaireHt: number;
  remiseLignePct: number;
  tauxTva: number;
  prixAchatHt: number | null;
};

/**
 * Lignes INTERNES d'un devis : chaque ligne libre, et chaque ligne de chaque ouvrage — composants
 * internes et lignes d'ajustement compris. C'est la vue de travail de l'entreprise, pas la vue
 * client : le mode de présentation de l'ouvrage n'y change rien.
 *
 * - `ordre` : l'ordre de l'ÉLÉMENT du devis. Les lignes d'un même ouvrage le partagent ; elles
 *   suivent, dans le fichier, l'ordre de leurs composants.
 * - `ordre` et `ouvrage_version` sont écrits comme du texte : `csv()` donnerait deux décimales à
 *   tout nombre, et « 2,00 » n'est pas un rang.
 * - `total_ht` : `montantLigneHt()`, l'arrondi au centime que la base appliquerait — pas une
 *   multiplication en virgule flottante.
 * - `prix_achat_ht` (option `inclureCouts`) : vide pour une ligne libre, qui n'en porte pas.
 */
export function exporterLignesDevisCsv(elements: readonly ElementDevis[], o: { inclureCouts: boolean }): string {
  const lignes: LigneExport[] = [];
  for (const e of [...elements].sort((a, b) => a.ordre - b.ordre)) {
    if (e.type === "ligne") {
      const l = e.ligne;
      lignes.push({
        ordre: e.ordre,
        ouvrage: null,
        cle: l.cle,
        referenceInterne: null,
        referenceFabricant: null,
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        remiseLignePct: l.remiseLignePct,
        tauxTva: l.tauxTva,
        prixAchatHt: null,
      });
      continue;
    }
    const i = e.instance;
    for (const l of [...i.lignes].sort((a, b) => a.ordre - b.ordre)) {
      lignes.push({
        ordre: e.ordre,
        ouvrage: { reference: i.referenceInterne, nom: i.nom, version: i.version },
        cle: l.cle,
        referenceInterne: l.referenceInterne,
        referenceFabricant: l.referenceFabricant,
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixVenteHt,
        remiseLignePct: l.remiseLignePct,
        tauxTva: l.tauxTva,
        prixAchatHt: l.prixAchatHt,
      });
    }
  }

  const entetes: string[] = [...ENTETES_LIGNES_DEVIS, ...(o.inclureCouts ? ["prix_achat_ht"] : [])];
  return csv([
    entetes,
    ...lignes.map((l) => {
      const ligne: unknown[] = [
        String(l.ordre),
        l.ouvrage?.reference ?? null,
        l.ouvrage?.nom ?? null,
        l.ouvrage ? String(l.ouvrage.version) : null,
        l.cle,
        l.referenceInterne,
        l.referenceFabricant,
        l.designation,
        decimalCsv(l.quantite),
        l.unite,
        decimalCsv(l.prixUnitaireHt),
        decimalCsv(l.remiseLignePct),
        decimalCsv(l.tauxTva),
        montantLigneHt(l),
      ];
      if (o.inclureCouts) ligne.push(decimalCsv(l.prixAchatHt));
      return ligne;
    }),
  ]);
}
