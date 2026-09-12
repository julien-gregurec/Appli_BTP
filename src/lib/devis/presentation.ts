/**
 * Présentation client d'un devis — module PUR.
 *
 * Un devis se compose d'ÉLÉMENTS : des lignes libres et des ouvrages. Chaque ouvrage choisit son
 * mode de présentation (regroupée, semi-détaillée, éclatée, personnalisée). Ce module traduit
 * ces éléments en lignes destinées au CLIENT.
 *
 * ── Deux garanties, vérifiées par les tests ──────────────────────────────────────────────
 *
 * 1. Le mode de présentation ne change JAMAIS les calculs : les totaux viennent de
 *    `lignesMontants()`, qui ignore la présentation.
 * 2. Aucun coût d'achat, aucune marge, aucune information interne (description interne,
 *    détail de calcul, composant interne) n'atteint une ligne client : le type `LigneClient`
 *    n'a tout simplement pas de champ pour les porter.
 */

import {
  arrondir,
  montantLigneHtExact,
  somme,
  totauxDocument,
  versNombre,
  type LigneMontant,
  type TotauxDocument,
} from "@/lib/devis/montants";
import type { InstanceOuvrage, LigneOuvrage, TypeLigneDevis } from "@/lib/devis/ouvrages";
import { porteMontant, typeDe, type TypeLigneGrille } from "@/lib/devis/types-ligne";

export type LigneLibre = {
  cle: string;
  designation: string;
  description: string | null;
  /** Nature comptable d'une ligne chiffrée (main-d'œuvre, fourniture…). */
  type: TypeLigneDevis;
  quantite: number;
  unite: string;
  prixUnitaireHt: number;
  remiseLignePct: number;
  tauxTva: number;
  /** Type de ligne de la grille (GP V1). Absent : ligne chiffrée « libre », comme avant. */
  typeLigne?: TypeLigneGrille | null;
  /** Remise en % de la section (type « remise ») ; `null` : montant fixe. Le montant est dans `prixUnitaireHt` (≤ 0). */
  remiseSectionPct?: number | null;
  /** Jamais imprimé. */
  commentaireInterne?: string | null;
  /** Référence interne de l'article d'origine (instantané), pour l'impression (GP V1, lot G). */
  referenceInterne?: string | null;
};

export type ElementDevis =
  | { type: "ligne"; ordre: number; ligne: LigneLibre }
  | { type: "ouvrage"; ordre: number; instance: InstanceOuvrage };

const montantDe = (l: LigneOuvrage): LigneMontant => ({
  quantite: l.quantite,
  prixUnitaireHt: l.prixVenteHt,
  remiseLignePct: l.remiseLignePct,
  tauxTva: l.tauxTva,
});

/**
 * Toutes les lignes qui entrent dans les totaux — indépendamment de toute présentation. Les lignes
 * de structure (titre, sous-total, commentaire…) n'y sont pas : un sous-total est recalculé, jamais
 * additionné.
 */
export function lignesMontants(elements: readonly ElementDevis[]): LigneMontant[] {
  return [...elements]
    .sort((a, b) => a.ordre - b.ordre)
    .flatMap((e) => (e.type === "ligne" ? (porteMontant(typeDe(e.ligne)) ? [e.ligne] : []) : e.instance.lignes.map(montantDe)));
}

export function totauxDevis(elements: readonly ElementDevis[], remiseGlobalePct = 0): TotauxDocument {
  return totauxDocument(lignesMontants(elements), remiseGlobalePct);
}

/**
 * Montant HT d'une section pour chaque sous-total : la somme des lignes chiffrées, ouvrages et
 * remises depuis le sous-total précédent (ou le début). Clé du sous-total → montant.
 */
export function sousTotauxSections(elements: readonly ElementDevis[]): Map<string, number> {
  const resultat = new Map<string, number>();
  let cumul = somme([]);
  for (const e of [...elements].sort((a, b) => a.ordre - b.ordre)) {
    if (e.type === "ouvrage") {
      cumul = somme([cumul, ...e.instance.lignes.map((l) => montantLigneHtExact(montantDe(l)))]);
      continue;
    }
    const type = typeDe(e.ligne);
    if (type === "sous_total") {
      resultat.set(e.ligne.cle, versNombre(arrondir(cumul)));
      cumul = somme([]);
    } else if (porteMontant(type)) {
      cumul = somme([cumul, montantLigneHtExact(e.ligne)]);
    }
  }
  return resultat;
}

/**
 * Base d'une remise en pourcentage : les lignes chiffrées et ouvrages de sa section, AVANT elle,
 * depuis le sous-total précédent — jamais les autres remises (pas de remise sur remise).
 */
export function baseRemiseSection(elements: readonly ElementDevis[], cleRemise: string): { montantHt: number; tauxTva: number[] } {
  let cumul = somme([]);
  const taux = new Set<number>();
  for (const e of [...elements].sort((a, b) => a.ordre - b.ordre)) {
    if (e.type === "ouvrage") {
      cumul = somme([cumul, ...e.instance.lignes.map((l) => montantLigneHtExact(montantDe(l)))]);
      e.instance.lignes.forEach((l) => taux.add(l.tauxTva));
      continue;
    }
    const type = typeDe(e.ligne);
    if (e.ligne.cle === cleRemise) break;
    if (type === "sous_total") { cumul = somme([]); taux.clear(); continue; }
    if (type === "article" || type === "libre") {
      cumul = somme([cumul, montantLigneHtExact(e.ligne)]);
      taux.add(e.ligne.tauxTva);
    }
  }
  return { montantHt: versNombre(arrondir(cumul)), tauxTva: [...taux].sort((a, b) => a - b) };
}

export type GenreLigneClient = "ligne" | "titre" | "sous_titre" | "commentaire" | "sous_total" | "remise" | "vide" | "separateur" | "saut_page";

export type LigneClient = {
  cle: string;
  /** Rendu de la ligne : chiffrée (défaut), titre, sous-total… */
  genre: GenreLigneClient;
  /** 0 : ligne ou ouvrage ; 1 : composant affiché sous son ouvrage. */
  niveau: 0 | 1;
  enTeteOuvrage: boolean;
  designation: string;
  description: string | null;
  /** `null` : masqué. */
  quantite: number | null;
  unite: string | null;
  prixUnitaireHt: number | null;
  remisePct: number | null;
  totalHt: number | null;
  /** `null` : masqué, ou plusieurs taux (voir `mentionTva`). */
  tauxTva: number | null;
  mentionTva: string | null;
  /** Référence interne de l'article ou de l'ouvrage (GP V1, lot G) ; imprimée seulement si l'entreprise le demande. */
  reference?: string | null;
};

const arrondi = (l: LigneMontant) => versNombre(arrondir(montantLigneHtExact(l)));

function tauxUnique(lignes: readonly LigneOuvrage[]): { tauxTva: number | null; mentionTva: string | null } {
  const taux = [...new Set(lignes.map((l) => l.tauxTva))];
  return taux.length === 1
    ? { tauxTva: taux[0], mentionTva: null }
    : { tauxTva: null, mentionTva: "Plusieurs taux — voir la ventilation de TVA" };
}

function enTete(instance: InstanceOuvrage): LigneClient {
  return {
    cle: instance.cle,
    genre: "ligne",
    niveau: 0,
    enTeteOuvrage: true,
    designation: instance.libelleClient,
    description: instance.descriptionClient,
    reference: instance.referenceInterne ?? null,
    quantite: instance.quantitePrincipale,
    unite: instance.unitePrincipale,
    prixUnitaireHt: null,
    remisePct: null,
    totalHt: versNombre(arrondir(somme(instance.lignes.map((l) => montantLigneHtExact(montantDe(l)))))),
    ...tauxUnique(instance.lignes),
  };
}

function ligneComposant(
  l: LigneOuvrage,
  o: { quantite: boolean; prix: boolean; description: string | null },
): LigneClient {
  return {
    cle: l.cle,
    genre: "ligne",
    niveau: 1,
    enTeteOuvrage: false,
    designation: l.designation,
    description: o.description,
    reference: l.referenceInterne ?? null,
    quantite: o.quantite ? l.quantite : null,
    unite: o.quantite ? l.unite : null,
    prixUnitaireHt: o.prix ? l.prixVenteHt : null,
    remisePct: o.prix && l.remiseLignePct ? l.remiseLignePct : null,
    totalHt: o.prix ? arrondi(montantDe(l)) : null,
    tauxTva: o.prix ? l.tauxTva : null,
    mentionTva: null,
  };
}

/**
 * Lignes d'un ouvrage pour le client, selon son mode.
 *
 * - regroupée : une seule ligne (quantité principale, montant global).
 * - semi-détaillée : en-tête avec le montant global, puis les composants VISIBLES avec leur
 *   quantité et leur description, sans aucun prix.
 * - éclatée : en-tête, puis chaque composant visible chiffré ; les composants internes sont
 *   agrégés sur une seule ligne sans détail, et les ajustements apparaissent tels quels — la
 *   somme des lignes retombe donc sur le montant de l'ouvrage.
 * - personnalisée : en-tête avec le montant global, puis chaque composant selon SES réglages
 *   (visible ou interne, quantité et prix affichés ou masqués, description personnalisée).
 */
export function lignesClientOuvrage(instance: InstanceOuvrage): LigneClient[] {
  const tete = enTete(instance);
  const composants = [...instance.lignes].sort((a, b) => a.ordre - b.ordre);
  const reels = composants.filter((l) => l.origine !== "ajustement");
  const descriptionClient = (l: LigneOuvrage) => l.descriptionPersonnalisee ?? l.descriptionClient;

  switch (instance.mode) {
    case "regroupe":
      return [tete];
    case "semi_detaille":
      return [tete, ...reels.filter((l) => l.visibleClient).map((l) => ligneComposant(l, { quantite: true, prix: false, description: descriptionClient(l) }))];
    case "eclate": {
      const visibles = composants.filter((l) => l.visibleClient || l.origine === "ajustement");
      const internes = reels.filter((l) => !l.visibleClient);
      const lignes = [
        { ...tete, totalHt: tete.totalHt, prixUnitaireHt: null },
        ...visibles.map((l) =>
          ligneComposant(l, { quantite: l.origine !== "ajustement", prix: true, description: descriptionClient(l) })),
      ];
      if (internes.length) {
        lignes.push({
          cle: `${instance.cle}-annexes`,
          genre: "ligne",
          niveau: 1,
          enTeteOuvrage: false,
          designation: "Autres fournitures et prestations de l’ouvrage",
          description: null,
          reference: null,
          quantite: null,
          unite: null,
          prixUnitaireHt: null,
          remisePct: null,
          totalHt: versNombre(arrondir(somme(internes.map((l) => montantLigneHtExact(montantDe(l)))))),
          ...tauxUnique(internes),
        });
      }
      return lignes;
    }
    case "personnalise":
      return [
        tete,
        ...reels
          .filter((l) => l.visibleClient)
          .map((l) => ligneComposant(l, { quantite: l.afficherQuantite, prix: l.afficherPrix, description: descriptionClient(l) })),
      ];
  }
}

const vide = (l: LigneLibre, genre: GenreLigneClient): LigneClient => ({
  cle: l.cle,
  genre,
  niveau: 0,
  enTeteOuvrage: false,
  designation: l.designation,
  description: l.description,
  reference: null,
  quantite: null,
  unite: null,
  prixUnitaireHt: null,
  remisePct: null,
  totalHt: null,
  tauxTva: null,
  mentionTva: null,
});

/**
 * Toutes les lignes client du devis, dans l'ordre des éléments. Une ligne de structure (titre,
 * commentaire, sous-total, remise, mise en page) est rendue selon son genre ; le sous-total porte le
 * montant calculé de sa section, jamais une valeur saisie.
 */
export function lignesClient(elements: readonly ElementDevis[]): LigneClient[] {
  const sousTotaux = sousTotauxSections(elements);
  return [...elements]
    .sort((a, b) => a.ordre - b.ordre)
    .flatMap((e) => {
      if (e.type === "ouvrage") return lignesClientOuvrage(e.instance);
      const l = e.ligne;
      const type = typeDe(l);
      switch (type) {
        case "article":
        case "libre":
          return [{
            cle: l.cle,
            genre: "ligne" as const,
            niveau: 0 as const,
            enTeteOuvrage: false,
            designation: l.designation,
            description: l.description,
            reference: l.referenceInterne ?? null,
            quantite: l.quantite,
            unite: l.unite,
            prixUnitaireHt: l.prixUnitaireHt,
            remisePct: l.remiseLignePct || null,
            totalHt: arrondi(l),
            tauxTva: l.tauxTva,
            mentionTva: null,
          }];
        case "sous_total":
          return [{ ...vide(l, "sous_total"), totalHt: sousTotaux.get(l.cle) ?? 0 }];
        case "remise":
          return [{
            ...vide(l, "remise"),
            description: l.remiseSectionPct ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(l.remiseSectionPct)} % de la section` : l.description,
            totalHt: arrondi(l),
            tauxTva: l.tauxTva,
          }];
        default:
          return [vide(l, type)];
      }
    });
}
