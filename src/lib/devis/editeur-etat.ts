/**
 * État de l'éditeur de devis v2 — opérations PURES sur la liste des éléments.
 *
 * L'éditeur manipule des ÉLÉMENTS (lignes libres et ouvrages) et, à part, l'ORIGINE de chaque ligne
 * libre (saisie, catalogue avec ses deux références figées, prix d'achat quand l'utilisateur y a
 * droit). Chaque opération rend un nouvel état ; aucune ne modifie l'état reçu.
 *
 * La sélection multiple d'articles réutilise `ajouterSelection` (recherche-articles.ts) : mêmes
 * décisions explicites pour un article déjà présent, même refus d'un archivé non confirmé, jamais
 * de fusion silencieuse.
 */

import type { OrigineLigneLibre } from "@/lib/devis/enregistrement-v2";
import type { InstanceOuvrage, TypeLigneDevis } from "@/lib/devis/ouvrages";
import type { ElementDevis, LigneLibre } from "@/lib/devis/presentation";
import {
  ajouterSelection,
  instantaneLigne,
  type ArticleCatalogue,
  type DecisionDejaPresent,
  type LigneDevisInstantanee,
  type Selection,
} from "@/lib/devis/recherche-articles";
import { baseRemiseSection } from "@/lib/devis/presentation";
import { arrondir, dec, mul, versNombre } from "@/lib/devis/montants";
import {
  DESIGNATION_PAR_DEFAUT,
  estChiffree,
  exigeDesignation,
  normaliserSelonType,
  typeDe,
  type TypeLigneGrille,
} from "@/lib/devis/types-ligne";

export type EtatElements = {
  elements: ElementDevis[];
  origines: Record<string, OrigineLigneLibre>;
};

export const TYPES_LIGNE: readonly TypeLigneDevis[] = ["main_oeuvre", "fourniture", "sous_traitance", "deplacement", "forfait"];

/** Taux posé quand le catalogue n'en porte pas (articles du stock) — signalé à l'écran. */
export const TAUX_TVA_PAR_DEFAUT = 20;

function typeDeLigne(type: string | null | undefined, source: "prestation" | "article"): TypeLigneDevis {
  return TYPES_LIGNE.includes(type as TypeLigneDevis) ? (type as TypeLigneDevis) : source === "article" ? "fourniture" : "forfait";
}

type LigneElement = Extract<ElementDevis, { type: "ligne" }>;
const estLigne = (e: ElementDevis): e is LigneElement => e.type === "ligne";

/** Renumérote l'ordre des éléments de 1 à n, dans leur ordre actuel. */
export function renumeroter(elements: readonly ElementDevis[]): ElementDevis[] {
  return [...elements].sort((a, b) => a.ordre - b.ordre).map((e, i) => ({ ...e, ordre: i + 1 }));
}

export type IssueSelection =
  | { etat: "ajoute"; suivant: EtatElements; clesAjoutees: string[] }
  | { etat: "decision_requise"; articlesDejaPresents: string[] }
  | { etat: "refuse"; motif: string };

/**
 * Ajoute une sélection de plusieurs articles EN UNE ACTION : une ligne par article, chacune avec sa
 * quantité, son unité, sa description et son prix éventuellement modifiés.
 */
export function appliquerSelectionArticles(
  etat: EtatElements,
  selections: readonly Selection[],
  catalogue: readonly ArticleCatalogue[],
  decisions: Readonly<Record<string, DecisionDejaPresent>>,
  genererCle: () => string,
): IssueSelection {
  // Seules les lignes issues du catalogue peuvent être « déjà présentes ».
  const libres = [...etat.elements].sort((a, b) => a.ordre - b.ordre).filter(estLigne)
    .filter((e) => !!etat.origines[e.ligne.cle]?.sourceId);
  const existantes: LigneDevisInstantanee[] = libres.map((e) => {
    const o = etat.origines[e.ligne.cle];
    return {
      sourceCatalogue: o.sourceCatalogue ?? "prestation",
      sourceId: o.sourceId!,
      referenceInterneInstantane: o.referenceInterne ?? null,
      referenceFabricantInstantane: o.referenceFabricant ?? null,
      designation: e.ligne.designation,
      description: e.ligne.description,
      quantite: e.ligne.quantite,
      unite: e.ligne.unite,
      prixUnitaireHt: e.ligne.prixUnitaireHt,
      tauxTva: e.ligne.tauxTva,
      typeLigne: e.ligne.type,
    };
  });

  const issue = ajouterSelection(existantes, selections, catalogue, decisions);
  if (issue.etat !== "ajoute") return issue;

  const parId = new Map(catalogue.map((a) => [a.id, a]));
  const elements = etat.elements.map((e) => ({ ...e })) as ElementDevis[];
  const origines = { ...etat.origines };

  // Les premières lignes rendues correspondent, dans l'ordre, aux lignes existantes.
  issue.lignes.slice(0, libres.length).forEach((l, i) => {
    const cle = libres[i].ligne.cle;
    const index = elements.findIndex((e) => estLigne(e) && e.ligne.cle === cle);
    const avant = elements[index] as LigneElement;
    elements[index] = {
      ...avant,
      ligne: {
        ...avant.ligne,
        designation: l.designation,
        description: l.description,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        tauxTva: l.tauxTva ?? avant.ligne.tauxTva,
      },
    };
    if (decisions[l.sourceId] === "remplacer") {
      origines[cle] = {
        ...origines[cle],
        referenceInterne: l.referenceInterneInstantane,
        referenceFabricant: l.referenceFabricantInstantane,
        prixAchatHt: parId.get(l.sourceId)?.prixAchatHt ?? null,
      };
    }
  });

  const ordreMax = Math.max(0, ...elements.map((e) => e.ordre));
  const clesAjoutees: string[] = [];
  issue.lignes.slice(libres.length).forEach((l, k) => {
    const cle = genererCle();
    clesAjoutees.push(cle);
    elements.push({
      type: "ligne",
      ordre: ordreMax + k + 1,
      ligne: {
        cle,
        // Ligne issue du catalogue : type de ligne « Article » (la grille affichait « Libre » — recette preview).
        typeLigne: "article",
        designation: l.designation,
        description: l.description,
        type: typeDeLigne(l.typeLigne, l.sourceCatalogue),
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        remiseLignePct: 0,
        tauxTva: l.tauxTva ?? TAUX_TVA_PAR_DEFAUT,
      },
    });
    origines[cle] = {
      origine: "catalogue",
      sourceCatalogue: l.sourceCatalogue,
      sourceId: l.sourceId,
      referenceInterne: l.referenceInterneInstantane,
      referenceFabricant: l.referenceFabricantInstantane,
      prixAchatHt: parId.get(l.sourceId)?.prixAchatHt ?? null,
    };
  });

  return { etat: "ajoute", suivant: { elements: renumeroter(elements), origines }, clesAjoutees };
}

export function ajouterLigneLibre(etat: EtatElements, cle: string, ligne: Partial<LigneLibre> = {}): EtatElements {
  const ordre = Math.max(0, ...etat.elements.map((e) => e.ordre)) + 1;
  return {
    elements: [...etat.elements, {
      type: "ligne",
      ordre,
      ligne: {
        cle,
        designation: "",
        description: null,
        type: "fourniture",
        quantite: 1,
        unite: "u",
        prixUnitaireHt: 0,
        remiseLignePct: 0,
        tauxTva: TAUX_TVA_PAR_DEFAUT,
        typeLigne: "libre",
        ...ligne,
      },
    }],
    origines: { ...etat.origines, [cle]: { origine: "saisie" } },
  };
}

export function modifierLigneLibre(etat: EtatElements, cle: string, patch: Partial<Omit<LigneLibre, "cle">>): EtatElements {
  const suivant = {
    elements: etat.elements.map((e) => (estLigne(e) && e.ligne.cle === cle ? { ...e, ligne: normaliserSelonType({ ...e.ligne, ...patch }) } : e)),
    origines: etat.origines,
  };
  // Un changement de type ou de montant peut modifier la base d'une remise en pourcentage plus bas.
  return recalculerRemisesSection(suivant);
}

export function ajouterOuvrage(etat: EtatElements, instance: InstanceOuvrage): EtatElements {
  const ordre = Math.max(0, ...etat.elements.map((e) => e.ordre)) + 1;
  return { elements: [...etat.elements, { type: "ouvrage", ordre, instance: { ...instance, ordre } }], origines: etat.origines };
}

export function remplacerOuvrage(etat: EtatElements, instance: InstanceOuvrage): EtatElements {
  return {
    elements: etat.elements.map((e) => (e.type === "ouvrage" && e.instance.cle === instance.cle ? { ...e, instance } : e)),
    origines: etat.origines,
  };
}

/** Clé d'un élément : clé de la ligne libre ou de l'instance d'ouvrage. */
export const cleElement = (e: ElementDevis): string => (e.type === "ligne" ? e.ligne.cle : e.instance.cle);

export function retirerElement(etat: EtatElements, cle: string): EtatElements {
  const { [cle]: _retiree, ...origines } = etat.origines;
  void _retiree;
  return { elements: renumeroter(etat.elements.filter((e) => cleElement(e) !== cle)), origines };
}

const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const entre = (x: unknown, min: number, max: number) => fini(x) && x >= min && x <= max;

/**
 * Validation SERVEUR d'un brouillon avant enregistrement — première erreur rencontrée, `null` si
 * tout est enregistrable. Le navigateur n'est jamais cru sur parole : la base revérifie ensuite.
 */
export function validerBrouillon(o: { clientId: string | null | undefined; remiseGlobalePct: number; elements: readonly ElementDevis[] }): string | null {
  if (!o.clientId) return "Choisissez un client.";
  if (!entre(o.remiseGlobalePct, 0, 100)) return "La remise globale doit être comprise entre 0 et 100 %.";
  if (o.elements.length === 0) return "Ajoutez au moins une ligne ou un ouvrage.";
  for (const e of o.elements) {
    if (e.type === "ligne") {
      const l = e.ligne;
      const type = typeDe(l);
      const nom = l.designation.trim() || "Une ligne";
      if (exigeDesignation(type) && !l.designation.trim()) return "Chaque ligne doit porter une désignation.";
      if (!fini(l.quantite)) return `« ${nom} » : quantité invalide.`;
      if (!fini(l.prixUnitaireHt)) return `« ${nom} » : prix invalide.`;
      if (!entre(l.remiseLignePct, 0, 100)) return `« ${nom} » : la remise doit être comprise entre 0 et 100 %.`;
      if (!entre(l.tauxTva, 0, 100)) return `« ${nom} » : taux de TVA invalide.`;
      if (!TYPES_LIGNE.includes(l.type)) return `« ${nom} » : type de ligne inconnu.`;
      if (type === "remise") {
        if (l.quantite !== 1 || l.prixUnitaireHt > 0) return `« ${nom} » : une remise est un montant négatif, quantité 1.`;
        if (l.remiseSectionPct !== null && l.remiseSectionPct !== undefined && !entre(l.remiseSectionPct, 0, 100)) return `« ${nom} » : le pourcentage de remise doit être compris entre 0 et 100.`;
      } else if (!estChiffree(type) && (l.quantite !== 0 || l.prixUnitaireHt !== 0 || l.remiseLignePct !== 0)) {
        return `« ${nom} » : une ligne « ${type} » ne porte ni quantité ni prix.`;
      }
      continue;
    }
    const i = e.instance;
    if (!(fini(i.quantitePrincipale) && i.quantitePrincipale > 0)) return `« ${i.nom} » : la quantité principale doit être strictement positive.`;
    if (!i.libelleClient.trim()) return `« ${i.nom} » : le libellé client est obligatoire.`;
    if (i.lignes.length === 0) return `« ${i.nom} » : l’ouvrage n’a plus aucun composant.`;
    for (const l of i.lignes) {
      const nom = l.designation.trim() || l.cle;
      if (!l.designation.trim()) return `« ${i.nom} » : un composant n’a pas de désignation.`;
      if (!fini(l.quantite)) return `« ${i.nom} » / « ${nom} » : quantité invalide.`;
      if (!fini(l.prixVenteHt)) return `« ${i.nom} » / « ${nom} » : prix invalide.`;
      if (!entre(l.remiseLignePct, 0, 100)) return `« ${i.nom} » / « ${nom} » : remise invalide.`;
      if (!entre(l.tauxTva, 0, 100)) return `« ${i.nom} » / « ${nom} » : taux de TVA invalide.`;
    }
  }
  return null;
}

/** Monte (−1) ou descend (+1) un élément d'un rang ; sans effet aux extrémités. */
export function deplacerElement(etat: EtatElements, cle: string, sens: -1 | 1): EtatElements {
  const tries = renumeroter(etat.elements);
  const i = tries.findIndex((e) => cleElement(e) === cle);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= tries.length) return { elements: tries, origines: etat.origines };
  [tries[i], tries[j]] = [tries[j], tries[i]];
  return { elements: renumeroter(tries.map((e, k) => ({ ...e, ordre: k + 1 }))), origines: etat.origines };
}

// ── GP V1 (lot C) : grille — insertion, duplication, déplacement libre, remises de section ────────

const indexDe = (elements: readonly ElementDevis[], cle: string) => renumeroter(elements).findIndex((e) => cleElement(e) === cle);

/** Insère un élément après `apresCle` (ou à la fin si `null`), puis renumérote. */
function insererElement(etat: EtatElements, element: ElementDevis, apresCle: string | null): EtatElements {
  const tries = renumeroter(etat.elements);
  const i = apresCle === null ? tries.length - 1 : indexDe(tries, apresCle);
  const position = i < 0 ? tries.length : i + 1;
  tries.splice(position, 0, element);
  return { elements: renumeroter(tries.map((e, k) => ({ ...e, ordre: k + 1 }))), origines: etat.origines };
}

/**
 * Nouvelle ligne d'un type donné, après `apresCle` (ou à la fin). Les valeurs numériques suivent le
 * type (une ligne de titre ne porte ni quantité ni prix) ; la désignation par défaut est celle du type.
 */
export function insererLigne(etat: EtatElements, cle: string, typeLigne: TypeLigneGrille, apresCle: string | null, ligne: Partial<LigneLibre> = {}): EtatElements {
  const base: LigneLibre = normaliserSelonType({
    cle,
    designation: DESIGNATION_PAR_DEFAUT[typeLigne] ?? "",
    description: null,
    type: "fourniture",
    quantite: 1,
    unite: "u",
    prixUnitaireHt: 0,
    remiseLignePct: 0,
    tauxTva: TAUX_TVA_PAR_DEFAUT,
    typeLigne,
    remiseSectionPct: null,
    commentaireInterne: null,
    ...ligne,
  });
  const suivant = insererElement({ ...etat, origines: { ...etat.origines, [cle]: { origine: "saisie" } } }, { type: "ligne", ordre: 0, ligne: base }, apresCle);
  return recalculerRemisesSection(suivant);
}

/** Insère un ouvrage après `apresCle` (ou à la fin). */
export function insererOuvrage(etat: EtatElements, instance: InstanceOuvrage, apresCle: string | null): EtatElements {
  return insererElement(etat, { type: "ouvrage", ordre: 0, instance }, apresCle);
}

/**
 * Duplique un élément juste après lui. Une ligne reçoit `nouvelleCle` et hérite de son origine (références,
 * coûts) ; un ouvrage reçoit une nouvelle clé d'instance (ses composants gardent leurs clés, scopées par elle).
 */
export function dupliquerElement(etat: EtatElements, cle: string, nouvelleCle: string): EtatElements {
  const source = etat.elements.find((e) => cleElement(e) === cle);
  if (!source) return etat;
  if (source.type === "ligne") {
    const copie: ElementDevis = { type: "ligne", ordre: 0, ligne: { ...source.ligne, cle: nouvelleCle } };
    const origines = { ...etat.origines, [nouvelleCle]: { ...(etat.origines[cle] ?? { origine: "saisie" as const }) } };
    return recalculerRemisesSection(insererElement({ ...etat, origines }, copie, cle));
  }
  const copie: ElementDevis = { type: "ouvrage", ordre: 0, instance: { ...source.instance, cle: nouvelleCle } };
  return recalculerRemisesSection(insererElement(etat, copie, cle));
}

/** Déplace un élément à l'index cible (0-based), pour le glisser-déposer. */
export function deplacerElementVers(etat: EtatElements, cle: string, indexCible: number): EtatElements {
  const tries = renumeroter(etat.elements);
  const i = indexDe(tries, cle);
  if (i < 0) return { elements: tries, origines: etat.origines };
  const cible = Math.max(0, Math.min(tries.length - 1, indexCible));
  if (cible === i) return { elements: tries, origines: etat.origines };
  const [element] = tries.splice(i, 1);
  tries.splice(cible, 0, element);
  return recalculerRemisesSection({ elements: renumeroter(tries.map((e, k) => ({ ...e, ordre: k + 1 }))), origines: etat.origines });
}

/**
 * Remplace une ligne par l'INSTANTANÉ d'un article (recherche depuis la cellule) : la clé est conservée,
 * l'origine devient « catalogue » avec ses références, sa famille, son distributeur et son prix d'achat.
 */
export function remplacerLigneParArticle(etat: EtatElements, cle: string, article: ArticleCatalogue, selection: Partial<Selection> = {}): EtatElements {
  const instantane = instantaneLigne(article, { articleId: article.id, quantite: selection.quantite ?? 1, ...selection });
  const elements = etat.elements.map((e): ElementDevis => {
    if (!estLigne(e) || e.ligne.cle !== cle) return e;
    return {
      ...e,
      ligne: normaliserSelonType({
        ...e.ligne,
        typeLigne: "article",
        designation: instantane.designation,
        description: instantane.description,
        type: typeDeLigne(instantane.typeLigne, instantane.sourceCatalogue),
        quantite: instantane.quantite,
        unite: instantane.unite,
        prixUnitaireHt: instantane.prixUnitaireHt,
        tauxTva: instantane.tauxTva ?? TAUX_TVA_PAR_DEFAUT,
        remiseSectionPct: null,
      }),
    };
  });
  const origines = {
    ...etat.origines,
    [cle]: {
      origine: "catalogue" as const,
      sourceCatalogue: article.source,
      sourceId: article.id,
      referenceInterne: article.referenceInterne,
      referenceFabricant: article.referenceFabricant,
      prixAchatHt: article.prixAchatHt,
      famille: article.famille ?? null,
      fournisseur: article.fournisseur,
      codeFournisseur: article.codesFournisseurs?.[0] ?? null,
      coutMainOeuvreHt: null,
      coefficient: null,
    },
  };
  return recalculerRemisesSection({ elements, origines });
}

/** Modifie les coûts d'une ligne (prix d'achat, main-d'œuvre, coefficient) — droits vérifiés par l'appelant. */
export function modifierCoutsLigne(etat: EtatElements, cle: string, couts: { prixAchatHt?: number | null; coutMainOeuvreHt?: number | null; coefficient?: number | null }): EtatElements {
  const actuelle = etat.origines[cle] ?? { origine: "saisie" as const };
  return { elements: etat.elements, origines: { ...etat.origines, [cle]: { ...actuelle, ...couts } } };
}

/**
 * Recalcule le montant des remises exprimées en pourcentage de leur section (lignes chiffrées et ouvrages
 * depuis le sous-total précédent, avant la remise). Le montant enregistré est `prixUnitaireHt` ≤ 0 : la base
 * n'a pas à connaître la règle pour totaliser juste. Une remise à montant fixe n'est pas touchée.
 */
export function recalculerRemisesSection(etat: EtatElements): EtatElements {
  let modifie = false;
  const elements = etat.elements.map((e): ElementDevis => {
    if (!estLigne(e) || typeDe(e.ligne) !== "remise") return e;
    const pct = e.ligne.remiseSectionPct;
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return e;
    const base = baseRemiseSection(etat.elements, e.ligne.cle);
    const montant = -versNombre(arrondir(mul(dec(base.montantHt), dec(pct / 100)), 2));
    const tauxTva = base.tauxTva.length === 1 ? base.tauxTva[0] : e.ligne.tauxTva;
    if (montant === e.ligne.prixUnitaireHt && tauxTva === e.ligne.tauxTva) return e;
    modifie = true;
    return { ...e, ligne: { ...e.ligne, prixUnitaireHt: montant, quantite: 1, remiseLignePct: 0, tauxTva } };
  });
  return modifie ? { elements, origines: etat.origines } : etat;
}

/** Remises en % dont la section mélange plusieurs taux de TVA : à signaler, jamais réparti en silence. */
export function remisesTvaMixte(etat: EtatElements): string[] {
  return etat.elements
    .filter((e): e is LigneElement => estLigne(e) && typeDe(e.ligne) === "remise" && e.ligne.remiseSectionPct !== null && e.ligne.remiseSectionPct !== undefined)
    .filter((e) => baseRemiseSection(etat.elements, e.ligne.cle).tauxTva.length > 1)
    .map((e) => e.ligne.cle);
}
