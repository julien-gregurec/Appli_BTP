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
  type ArticleCatalogue,
  type DecisionDejaPresent,
  type LigneDevisInstantanee,
  type Selection,
} from "@/lib/devis/recherche-articles";

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
        ...ligne,
      },
    }],
    origines: { ...etat.origines, [cle]: { origine: "saisie" } },
  };
}

export function modifierLigneLibre(etat: EtatElements, cle: string, patch: Partial<Omit<LigneLibre, "cle">>): EtatElements {
  return {
    elements: etat.elements.map((e) => (estLigne(e) && e.ligne.cle === cle ? { ...e, ligne: { ...e.ligne, ...patch } } : e)),
    origines: etat.origines,
  };
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
      const nom = l.designation.trim() || "Une ligne";
      if (!l.designation.trim()) return "Chaque ligne doit porter une désignation.";
      if (!fini(l.quantite)) return `« ${nom} » : quantité invalide.`;
      if (!fini(l.prixUnitaireHt)) return `« ${nom} » : prix invalide.`;
      if (!entre(l.remiseLignePct, 0, 100)) return `« ${nom} » : la remise doit être comprise entre 0 et 100 %.`;
      if (!entre(l.tauxTva, 0, 100)) return `« ${nom} » : taux de TVA invalide.`;
      if (!TYPES_LIGNE.includes(l.type)) return `« ${nom} » : type de ligne inconnu.`;
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
