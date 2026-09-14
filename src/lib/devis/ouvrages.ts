/**
 * Bibliothèque d'ouvrages composés — module PUR.
 *
 * Un ouvrage est un ensemble RÉUTILISABLE de fournitures, main-d'œuvre, matériel, location,
 * sous-traitance et prestations, exprimé pour une unité principale (le m² d'un plancher
 * chauffant, le ml d'une cloison…). Insérer un ouvrage dans un devis, c'est calculer les
 * quantités de ses composants pour une quantité principale, puis en poser un INSTANTANÉ.
 *
 * ── Règles qui ne se négocient pas ──────────────────────────────────────────────────────
 *
 * 1. Aucune formule métier n'est codée ici. Le module applique des mécanismes GÉNÉRIQUES
 *    (coefficient, quantité fixe, perte, minimum, arrondi, condition) avec les valeurs que
 *    l'entreprise a saisies. Il ne sait pas ce qu'est un plancher chauffant.
 * 2. L'insertion pose un instantané COMPLET du modèle. Modifier ensuite la bibliothèque ne
 *    modifie jamais un devis existant ; réappliquer une nouvelle version est un geste explicite,
 *    réservé au brouillon, précédé d'une comparaison.
 * 3. L'instantané stocké dans le devis ne contient AUCUN prix d'achat : il est lisible par
 *    quiconque lit le devis. Les coûts voyagent à part, sur les lignes, et ne sont persistés
 *    que dans une table protégée par permission.
 * 4. Tous les calculs passent par l'arithmétique décimale exacte de `montants.ts`.
 */

import {
  add,
  arrondir,
  cmp,
  dec,
  montantLigneHtExact,
  mul,
  multipleProche,
  multipleSuperieur,
  pourcent,
  somme,
  versNombre,
  type Decimal,
} from "@/lib/devis/montants";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NatureComposant =
  | "article"
  | "prestation"
  | "main_oeuvre"
  | "location"
  | "materiel"
  | "sous_traitance"
  | "libre";

export const NATURES_COMPOSANT: ReadonlyArray<{ cle: NatureComposant; libelle: string }> = [
  { cle: "article", libelle: "Article du catalogue" },
  { cle: "prestation", libelle: "Prestation" },
  { cle: "main_oeuvre", libelle: "Main-d'œuvre" },
  { cle: "location", libelle: "Location" },
  { cle: "materiel", libelle: "Matériel" },
  { cle: "sous_traitance", libelle: "Sous-traitance" },
  { cle: "libre", libelle: "Ligne libre" },
];

/** Valeurs admises par la contrainte existante `lignes_devis_type_check`. */
export type TypeLigneDevis = "main_oeuvre" | "fourniture" | "sous_traitance" | "deplacement" | "forfait";

/**
 * Type de ligne de devis posé pour chaque nature. La nature fine est conservée à part : le
 * `type` n'existe que parce que la contrainte SQL existante ne connaît que cinq valeurs.
 */
export const TYPE_LIGNE_PAR_NATURE: Readonly<Record<NatureComposant, TypeLigneDevis>> = {
  article: "fourniture",
  prestation: "forfait",
  main_oeuvre: "main_oeuvre",
  location: "fourniture",
  materiel: "fourniture",
  sous_traitance: "sous_traitance",
  libre: "forfait",
};

export type RegleArrondi =
  | { mode: "aucun" }
  /** Multiple supérieur : on n'achète jamais moins que le besoin (conditionnements). */
  | { mode: "superieur"; pas: number }
  | { mode: "proche"; pas: number };

export type ConditionInclusion =
  | { type: "toujours" }
  /** Inclus seulement si la quantité principale atteint le seuil. */
  | { type: "quantite_min"; seuil: number }
  /** Inclus si l'option est cochée au moment de l'insertion. */
  | { type: "option"; cle: string; libelle: string; parDefaut: boolean };

/** Base à laquelle s'applique le coefficient. */
export type BaseCalcul = { type: "principale" } | { type: "composant"; cle: string };

/** Paramètres qui déterminent la quantité d'un composant — communs au modèle et au devis. */
export type ParametresQuantite = {
  cle: string;
  designation: string;
  unite: string;
  coefficient: number | null;
  base: BaseCalcul;
  quantiteFixe: number | null;
  /** Quantité à saisir à l'insertion (métrage relevé sur place, par exemple). */
  saisieRequise: boolean;
  pertePct: number;
  arrondi: RegleArrondi;
  quantiteMin: number | null;
  condition: ConditionInclusion;
};

export type SourceComposant = { catalogue: "prestation" | "article"; id: string } | null;

export type ComposantOuvrage = ParametresQuantite & {
  ordre: number;
  nature: NatureComposant;
  source: SourceComposant;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  fabricant: string | null;
  fournisseur: string | null;
  descriptionClient: string | null;
  /** `null` : inconnu, ou masqué parce que l'utilisateur n'a pas le droit de le voir. */
  prixAchatHt: number | null;
  prixVenteHt: number;
  tauxTva: number;
  visibleClient: boolean;
};

export type StatutOuvrage = "actif" | "archive";

export type VersionOuvrage = {
  ouvrageId: string;
  entrepriseId: string;
  version: number;
  referenceInterne: string | null;
  nom: string;
  descriptionInterne: string | null;
  descriptionClient: string | null;
  categorie: string | null;
  unitePrincipale: string;
  quantitePrincipale: number;
  statut: StatutOuvrage;
  composants: ComposantOuvrage[];
  auteur: string | null;
  creeLe: string;
  modifieLe: string;
};

export type ModePresentation = "regroupe" | "semi_detaille" | "eclate" | "personnalise";

export const MODES_PRESENTATION: ReadonlyArray<{ cle: ModePresentation; libelle: string; aide: string }> = [
  { cle: "regroupe", libelle: "Regroupée", aide: "Une seule ligne client ; les composants restent internes." },
  { cle: "semi_detaille", libelle: "Semi-détaillée", aide: "Composants et quantités visibles, prix global seul." },
  { cle: "eclate", libelle: "Éclatée", aide: "Chaque composant avec quantité, prix unitaire et total." },
  { cle: "personnalise", libelle: "Personnalisée", aide: "Vous choisissez composant par composant." },
];

// ── Validation d'une version ──────────────────────────────────────────────────

const positifOuNul = (x: number | null) => x === null || (Number.isFinite(x) && x >= 0);

/** Erreurs bloquantes d'une version d'ouvrage — tableau vide si elle est enregistrable. */
export function validerVersion(v: Pick<VersionOuvrage, "nom" | "unitePrincipale" | "quantitePrincipale" | "composants">): string[] {
  const erreurs: string[] = [];
  if (!v.nom.trim()) erreurs.push("L’ouvrage doit porter un nom.");
  if (!v.unitePrincipale.trim()) erreurs.push("L’unité principale est obligatoire.");
  if (!(Number.isFinite(v.quantitePrincipale) && v.quantitePrincipale > 0)) {
    erreurs.push("La quantité principale doit être strictement positive.");
  }
  if (v.composants.length === 0) erreurs.push("Un ouvrage compte au moins un composant.");

  const cles = new Set<string>();
  for (const c of v.composants) {
    const nom = c.designation.trim() || c.cle;
    if (cles.has(c.cle)) erreurs.push(`Deux composants portent la même clé « ${c.cle} ».`);
    cles.add(c.cle);
    if (!c.designation.trim()) erreurs.push(`Le composant « ${c.cle} » n’a pas de désignation.`);
    if (!c.unite.trim()) erreurs.push(`« ${nom} » : unité manquante.`);
    if (!positifOuNul(c.coefficient)) erreurs.push(`« ${nom} » : coefficient invalide.`);
    if (!positifOuNul(c.quantiteFixe)) erreurs.push(`« ${nom} » : quantité fixe invalide.`);
    if (!positifOuNul(c.quantiteMin)) erreurs.push(`« ${nom} » : quantité minimale invalide.`);
    if (c.coefficient === null && c.quantiteFixe === null && !c.saisieRequise) {
      erreurs.push(`« ${nom} » : indiquez un coefficient, une quantité fixe ou une saisie à l’insertion.`);
    }
    if (!(Number.isFinite(c.pertePct) && c.pertePct >= 0 && c.pertePct <= 100)) {
      erreurs.push(`« ${nom} » : la perte doit être comprise entre 0 et 100 %.`);
    }
    if (c.arrondi.mode !== "aucun" && !(Number.isFinite(c.arrondi.pas) && c.arrondi.pas > 0)) {
      erreurs.push(`« ${nom} » : le pas d’arrondi doit être strictement positif.`);
    }
    if (!(Number.isFinite(c.prixVenteHt) && c.prixVenteHt >= 0)) erreurs.push(`« ${nom} » : prix de vente invalide.`);
    if (!positifOuNul(c.prixAchatHt)) erreurs.push(`« ${nom} » : prix d’achat invalide.`);
    if (!(Number.isFinite(c.tauxTva) && c.tauxTva >= 0 && c.tauxTva <= 100)) erreurs.push(`« ${nom} » : taux de TVA invalide.`);
    if (c.condition.type === "option" && !c.condition.cle.trim()) erreurs.push(`« ${nom} » : option sans clé.`);
    if (c.condition.type === "quantite_min" && !(c.condition.seuil >= 0)) erreurs.push(`« ${nom} » : seuil invalide.`);
  }
  for (const c of v.composants) {
    if (c.base.type === "composant" && !cles.has(c.base.cle)) {
      erreurs.push(`« ${c.designation || c.cle} » dépend d’un composant inexistant « ${c.base.cle} ».`);
    }
  }
  if (erreurs.length === 0 && ordreDeCalcul(v.composants) === null) {
    erreurs.push("Les composants dépendent les uns des autres en boucle.");
  }
  return erreurs;
}

/** Ordre topologique des composants (base avant dépendant) ; `null` en cas de cycle. */
function ordreDeCalcul(composants: readonly ParametresQuantite[]): ParametresQuantite[] | null {
  const parCle = new Map(composants.map((c) => [c.cle, c]));
  const etat = new Map<string, "encours" | "fait">();
  const ordre: ParametresQuantite[] = [];
  const visiter = (c: ParametresQuantite): boolean => {
    const e = etat.get(c.cle);
    if (e === "fait") return true;
    if (e === "encours") return false;
    etat.set(c.cle, "encours");
    if (c.base.type === "composant") {
      const base = parCle.get(c.base.cle);
      if (base && !visiter(base)) return false;
    }
    etat.set(c.cle, "fait");
    ordre.push(c);
    return true;
  };
  for (const c of composants) if (!visiter(c)) return null;
  return ordre;
}

// ── Calcul des quantités ─────────────────────────────────────────────────────

export type QuantiteCalculee = {
  cle: string;
  inclus: boolean;
  motifExclusion: string | null;
  /** Coefficient × base + quantité fixe (+ saisie). */
  quantiteBrute: number;
  quantiteAvecPerte: number;
  /** Quantité finale, après minimum puis arrondi. Trois décimales au plus. */
  quantite: number;
  /** Explication lisible, étape par étape — ce que l'utilisateur voit en survolant la ligne. */
  detail: string;
  /** Vrai si une saisie était attendue et n'a pas été faite. */
  saisieManquante: boolean;
};

const fr = (x: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(x);

function estInclus(c: ParametresQuantite, quantitePrincipale: number, options: ReadonlySet<string>): string | null {
  switch (c.condition.type) {
    case "toujours":
      return null;
    case "quantite_min":
      return quantitePrincipale >= c.condition.seuil
        ? null
        : `inclus à partir de ${fr(c.condition.seuil)} (quantité principale ${fr(quantitePrincipale)})`;
    case "option":
      return options.has(c.condition.cle) ? null : `option « ${c.condition.libelle} » non retenue`;
  }
}

/**
 * Calcule les quantités de tous les composants pour une quantité principale.
 *
 * Ordre des étapes, fixe et affiché : base × coefficient + quantité fixe (+ saisie) → perte →
 * minimum → arrondi. L'arrondi vient en DERNIER pour que la quantité finale soit toujours un
 * multiple du conditionnement, même quand le minimum s'applique.
 */
export function calculerQuantites(
  composants: readonly ParametresQuantite[],
  quantitePrincipale: number,
  options: ReadonlySet<string> = new Set(),
  saisies: Readonly<Record<string, number>> = {},
): Map<string, QuantiteCalculee> {
  const ordre = ordreDeCalcul(composants);
  if (!ordre) throw new Error("Les composants dépendent les uns des autres en boucle.");
  const resultats = new Map<string, QuantiteCalculee>();

  for (const c of ordre) {
    let motif = estInclus(c, quantitePrincipale, options);
    let base = dec(quantitePrincipale);
    let libelleBase = `${fr(quantitePrincipale)}`;
    if (c.base.type === "composant") {
      const r = resultats.get(c.base.cle);
      if (r && !r.inclus && motif === null) motif = `dépend d’un composant non inclus`;
      base = dec(r?.inclus ? r.quantite : 0);
      libelleBase = `${fr(r?.quantite ?? 0)} (quantité de « ${c.base.cle} »)`;
    }

    const etapes: string[] = [];
    let brute = dec(0);
    if (c.coefficient !== null) {
      brute = mul(base, dec(c.coefficient));
      etapes.push(`${libelleBase} × ${fr(c.coefficient)}`);
    }
    if (c.quantiteFixe !== null) {
      brute = add(brute, dec(c.quantiteFixe));
      etapes.push(`${etapes.length ? "+ " : ""}${fr(c.quantiteFixe)} fixe`);
    }
    const saisie = saisies[c.cle];
    const saisieManquante = c.saisieRequise && !(Number.isFinite(saisie) && saisie >= 0);
    if (c.saisieRequise && !saisieManquante) {
      brute = add(brute, dec(saisie));
      etapes.push(`${etapes.length ? "+ " : ""}${fr(saisie)} saisi`);
    }

    let q = brute;
    if (c.pertePct > 0) {
      q = add(q, pourcent(mul(q, dec(c.pertePct))));
      etapes.push(`+ ${fr(c.pertePct)} % de perte = ${fr(versNombre(arrondir(q, 3)))}`);
    }
    const avecPerte = q;
    if (c.quantiteMin !== null && cmp(q, dec(c.quantiteMin)) < 0) {
      q = dec(c.quantiteMin);
      etapes.push(`minimum ${fr(c.quantiteMin)}`);
    }
    if (c.arrondi.mode === "superieur") {
      q = multipleSuperieur(q, dec(c.arrondi.pas));
      etapes.push(`arrondi au multiple supérieur de ${fr(c.arrondi.pas)}`);
    } else if (c.arrondi.mode === "proche") {
      q = multipleProche(q, dec(c.arrondi.pas));
      etapes.push(`arrondi au multiple le plus proche de ${fr(c.arrondi.pas)}`);
    }
    const quantite = versNombre(arrondir(q, 3));
    const inclus = motif === null;

    resultats.set(c.cle, {
      cle: c.cle,
      inclus,
      motifExclusion: motif,
      quantiteBrute: versNombre(arrondir(brute, 3)),
      quantiteAvecPerte: versNombre(arrondir(avecPerte, 3)),
      quantite: inclus ? quantite : 0,
      detail: inclus
        ? `${etapes.join(" ") || "0"} → ${fr(quantite)} ${c.unite}`
        : `Non inclus : ${motif}`,
      saisieManquante: inclus && saisieManquante,
    });
  }
  return resultats;
}

// ── Instance d'ouvrage dans un devis ─────────────────────────────────────────

/** Raison d'être d'une ligne d'ajustement — jamais un composant réel, jamais un coût. */
export type MotifAjustement = "ajustement_prix_global" | "remise" | "ecart_arrondi";

export type LigneOuvrage = ParametresQuantite & {
  origine: "modele" | "ajout_manuel" | "ajustement";
  /** Renseigné seulement pour `origine === "ajustement"`. */
  motifAjustement: MotifAjustement | null;
  ordre: number;
  nature: NatureComposant;
  type: TypeLigneDevis;
  source: SourceComposant;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  descriptionClient: string | null;
  quantite: number;
  /** Une quantité saisie à la main n'est plus recalculée. */
  quantiteForcee: boolean;
  prixAchatHt: number | null;
  prixVenteHt: number;
  tauxTva: number;
  remiseLignePct: number;
  visibleClient: boolean;
  afficherQuantite: boolean;
  afficherPrix: boolean;
  descriptionPersonnalisee: string | null;
  detailCalcul: string;
};

export type InstantaneModele = Omit<VersionOuvrage, "composants"> & {
  composants: Array<Omit<ComposantOuvrage, "prixAchatHt">>;
};

export type InstanceOuvrage = {
  cle: string;
  ouvrageId: string;
  version: number;
  referenceInterne: string | null;
  nom: string;
  categorie: string | null;
  unitePrincipale: string;
  quantitePrincipale: number;
  options: string[];
  saisies: Record<string, number>;
  libelleClient: string;
  descriptionClient: string | null;
  mode: ModePresentation;
  ordre: number;
  /** Instantané COMPLET du modèle à l'insertion, SANS aucun prix d'achat. */
  modele: InstantaneModele;
  lignes: LigneOuvrage[];
  /** Champs modifiés à la main, par clé de composant — sert à la comparaison de versions. */
  modificationsManuelles: Record<string, string[]>;
};

/** Copie du modèle sans aucun prix d'achat : c'est ce qui sera lisible dans le devis. */
export function instantaneModele(v: VersionOuvrage): InstantaneModele {
  const copie = structuredClone(v);
  return {
    ...copie,
    composants: copie.composants.map((c) => {
      const { prixAchatHt: _retire, ...reste } = c;
      void _retire;
      return reste;
    }),
  };
}

export type OptionsInsertion = {
  cle: string;
  ordre: number;
  quantitePrincipale: number;
  options?: readonly string[];
  saisies?: Readonly<Record<string, number>>;
  mode?: ModePresentation;
  /** Obligatoire pour insérer un ouvrage archivé. */
  confirmeArchive?: boolean;
};

export type IssueInsertion =
  | { etat: "pret"; instance: InstanceOuvrage; saisiesManquantes: string[] }
  | { etat: "refuse"; motif: string };

/** Options cochées par défaut d'une version (conditions `option` avec `parDefaut`). */
export function optionsParDefaut(v: Pick<VersionOuvrage, "composants">): string[] {
  const cles = new Set<string>();
  for (const c of v.composants) if (c.condition.type === "option" && c.condition.parDefaut) cles.add(c.condition.cle);
  return [...cles];
}

function ligneDepuisComposant(c: ComposantOuvrage, q: QuantiteCalculee): LigneOuvrage {
  return {
    cle: c.cle,
    designation: c.designation,
    unite: c.unite,
    coefficient: c.coefficient,
    base: structuredClone(c.base),
    quantiteFixe: c.quantiteFixe,
    saisieRequise: c.saisieRequise,
    pertePct: c.pertePct,
    arrondi: structuredClone(c.arrondi),
    quantiteMin: c.quantiteMin,
    condition: structuredClone(c.condition),
    origine: "modele",
    motifAjustement: null,
    ordre: c.ordre,
    nature: c.nature,
    type: TYPE_LIGNE_PAR_NATURE[c.nature],
    source: c.source ? { ...c.source } : null,
    referenceInterne: c.referenceInterne,
    referenceFabricant: c.referenceFabricant,
    descriptionClient: c.descriptionClient,
    quantite: q.quantite,
    quantiteForcee: false,
    prixAchatHt: c.prixAchatHt,
    prixVenteHt: c.prixVenteHt,
    tauxTva: c.tauxTva,
    remiseLignePct: 0,
    visibleClient: c.visibleClient,
    afficherQuantite: true,
    afficherPrix: true,
    descriptionPersonnalisee: null,
    detailCalcul: q.detail,
  };
}

/**
 * Prépare l'insertion d'un ouvrage dans un devis : quantités calculées, instantané posé.
 *
 * Seuls les composants INCLUS deviennent des lignes ; l'instantané du modèle, lui, les garde
 * tous — c'est ce qui permet de comprendre plus tard pourquoi un composant manquait.
 */
export function instancierOuvrage(v: VersionOuvrage, o: OptionsInsertion): IssueInsertion {
  const erreurs = validerVersion(v);
  if (erreurs.length) return { etat: "refuse", motif: erreurs[0] };
  if (v.statut === "archive" && !o.confirmeArchive) {
    return { etat: "refuse", motif: `« ${v.nom} » est archivé : confirmez explicitement son insertion.` };
  }
  if (!(Number.isFinite(o.quantitePrincipale) && o.quantitePrincipale > 0)) {
    return { etat: "refuse", motif: "La quantité principale doit être strictement positive." };
  }
  const options = [...(o.options ?? optionsParDefaut(v))];
  const saisies = { ...(o.saisies ?? {}) };
  const quantites = calculerQuantites(v.composants, o.quantitePrincipale, new Set(options), saisies);
  const lignes = [...v.composants]
    .sort((a, b) => a.ordre - b.ordre)
    .filter((c) => quantites.get(c.cle)!.inclus)
    .map((c) => ligneDepuisComposant(c, quantites.get(c.cle)!));

  return {
    etat: "pret",
    saisiesManquantes: [...quantites.values()].filter((q) => q.saisieManquante).map((q) => q.cle),
    instance: {
      cle: o.cle,
      ouvrageId: v.ouvrageId,
      version: v.version,
      referenceInterne: v.referenceInterne,
      nom: v.nom,
      categorie: v.categorie,
      unitePrincipale: v.unitePrincipale,
      quantitePrincipale: o.quantitePrincipale,
      options,
      saisies,
      libelleClient: v.nom,
      descriptionClient: v.descriptionClient,
      mode: o.mode ?? "regroupe",
      ordre: o.ordre,
      modele: instantaneModele(v),
      lignes,
      modificationsManuelles: {},
    },
  };
}

/**
 * Recalcule les quantités d'une instance (nouvelle quantité principale, coefficient ou perte
 * modifiés sur une ligne). Une quantité FORCÉE à la main n'est jamais écrasée.
 */
export function recalculerInstance(
  instance: InstanceOuvrage,
  changement: { quantitePrincipale?: number; options?: readonly string[]; saisies?: Readonly<Record<string, number>> } = {},
): InstanceOuvrage {
  const quantitePrincipale = changement.quantitePrincipale ?? instance.quantitePrincipale;
  const options = [...(changement.options ?? instance.options)];
  const saisies = { ...instance.saisies, ...(changement.saisies ?? {}) };
  const calculables = instance.lignes.filter((l) => l.origine !== "ajustement");
  const quantites = calculerQuantites(calculables, quantitePrincipale, new Set(options), saisies);
  return {
    ...instance,
    quantitePrincipale,
    options,
    saisies,
    lignes: instance.lignes.map((l) => {
      if (l.origine === "ajustement" || l.quantiteForcee) return { ...l };
      const q = quantites.get(l.cle)!;
      return { ...l, quantite: q.quantite, detailCalcul: q.detail };
    }),
  };
}

export type ModificationLigne = Partial<Pick<LigneOuvrage,
  | "designation" | "descriptionClient" | "unite" | "coefficient" | "quantiteFixe" | "pertePct" | "arrondi"
  | "quantiteMin" | "prixVenteHt" | "prixAchatHt" | "tauxTva" | "remiseLignePct" | "visibleClient"
  | "afficherQuantite" | "afficherPrix" | "descriptionPersonnalisee">> & { quantite?: number };

/**
 * Modifie un composant DE L'INSTANCE — jamais le modèle de la bibliothèque.
 *
 * Saisir une quantité la force (elle ne sera plus recalculée) ; modifier un coefficient, une
 * perte ou un arrondi relance le calcul des lignes non forcées.
 */
export function modifierLigne(instance: InstanceOuvrage, cle: string, patch: ModificationLigne): InstanceOuvrage {
  const index = instance.lignes.findIndex((l) => l.cle === cle);
  if (index < 0) throw new Error(`Composant « ${cle} » absent de l’ouvrage.`);
  const avant = instance.lignes[index];
  const { quantite, ...champs } = patch;
  const ligne: LigneOuvrage = { ...avant, ...structuredClone(champs) };
  if (quantite !== undefined) {
    if (!(Number.isFinite(quantite) && quantite >= 0)) throw new RangeError("Quantité invalide.");
    ligne.quantite = quantite;
    ligne.quantiteForcee = true;
    ligne.detailCalcul = `Saisi à la main : ${fr(quantite)} ${ligne.unite}`;
  }
  const modifies = new Set(instance.modificationsManuelles[cle] ?? []);
  for (const champ of Object.keys(patch)) modifies.add(champ);
  const suivante: InstanceOuvrage = {
    ...instance,
    lignes: instance.lignes.map((l, i) => (i === index ? ligne : { ...l })),
    modificationsManuelles: { ...instance.modificationsManuelles, [cle]: [...modifies] },
  };
  const relance = ["coefficient", "quantiteFixe", "pertePct", "arrondi", "quantiteMin"].some((c) => c in patch);
  return relance ? recalculerInstance(suivante) : suivante;
}

/** Ajoute une ligne à l'instance (composant absent du modèle). Sa quantité est saisie. */
export function ajouterLigne(
  instance: InstanceOuvrage,
  ligne: Pick<LigneOuvrage, "cle" | "designation" | "unite" | "nature" | "quantite" | "prixVenteHt" | "tauxTva">
    & Partial<LigneOuvrage>,
): InstanceOuvrage {
  if (instance.lignes.some((l) => l.cle === ligne.cle)) throw new Error(`La clé « ${ligne.cle} » existe déjà.`);
  const ordre = Math.max(0, ...instance.lignes.map((l) => l.ordre)) + 1;
  const nouvelle: LigneOuvrage = {
    coefficient: null,
    base: { type: "principale" },
    quantiteFixe: null,
    saisieRequise: false,
    pertePct: 0,
    arrondi: { mode: "aucun" },
    quantiteMin: null,
    condition: { type: "toujours" },
    motifAjustement: null,
    ordre,
    type: TYPE_LIGNE_PAR_NATURE[ligne.nature],
    source: null,
    referenceInterne: null,
    referenceFabricant: null,
    descriptionClient: null,
    prixAchatHt: null,
    remiseLignePct: 0,
    visibleClient: true,
    afficherQuantite: true,
    afficherPrix: true,
    descriptionPersonnalisee: null,
    detailCalcul: `Ajouté à la main : ${fr(ligne.quantite)} ${ligne.unite}`,
    ...ligne,
    origine: ligne.origine ?? "ajout_manuel",
    quantiteForcee: true,
  };
  return {
    ...instance,
    lignes: [...instance.lignes.map((l) => ({ ...l })), nouvelle],
    modificationsManuelles: { ...instance.modificationsManuelles, [ligne.cle]: ["ajout"] },
  };
}

/** Retire une ligne de l'instance. Une ligne dont une autre dépend ne peut pas être retirée. */
export function retirerLigne(instance: InstanceOuvrage, cle: string): InstanceOuvrage {
  const dependante = instance.lignes.find((l) => l.base.type === "composant" && l.base.cle === cle && !l.quantiteForcee);
  if (dependante) {
    throw new Error(`« ${dependante.designation} » est calculé à partir de ce composant : modifiez-le d’abord.`);
  }
  return {
    ...instance,
    lignes: instance.lignes.filter((l) => l.cle !== cle).map((l) => ({ ...l })),
    modificationsManuelles: { ...instance.modificationsManuelles, [cle]: ["retrait"] },
  };
}

// ── Montants de l'instance ───────────────────────────────────────────────────

export type MontantsOuvrage = {
  venteHt: number;
  /** `null` si au moins une ligne non-ajustement n'a pas de prix d'achat connu. */
  achatHt: number | null;
  lignesSansPrixAchat: string[];
  tauxTva: number[];
};

export function montantsInstance(instance: Pick<InstanceOuvrage, "lignes">): MontantsOuvrage {
  const vente = somme(instance.lignes.map((l) => montantLigneHtExact({
    quantite: l.quantite, prixUnitaireHt: l.prixVenteHt, remiseLignePct: l.remiseLignePct, tauxTva: l.tauxTva,
  })));
  const sansAchat = instance.lignes.filter((l) => l.origine !== "ajustement" && l.prixAchatHt === null).map((l) => l.cle);
  const achat: Decimal = somme(instance.lignes
    .filter((l) => l.origine !== "ajustement" && l.prixAchatHt !== null)
    .map((l) => mul(dec(l.quantite), dec(l.prixAchatHt!))));
  return {
    venteHt: versNombre(arrondir(vente)),
    achatHt: sansAchat.length ? null : versNombre(arrondir(achat)),
    lignesSansPrixAchat: sansAchat,
    tauxTva: [...new Set(instance.lignes.map((l) => l.tauxTva))].sort((a, b) => b - a),
  };
}

// ── Comparaison et réapplication d'une nouvelle version ──────────────────────

export type ChangementChamp = { champ: string; avant: unknown; apres: unknown };

export type ComparaisonVersions = {
  versionActuelle: number;
  nouvelleVersion: number;
  ajoutes: Array<{ cle: string; designation: string }>;
  retires: Array<{ cle: string; designation: string }>;
  modifies: Array<{ cle: string; designation: string; changements: ChangementChamp[] }>;
  /** Modifications faites à la main dans le devis, que la réapplication remplacerait. */
  modificationsManuelles: Array<{ cle: string; champs: string[] }>;
  venteHtAvant: number;
  venteHtApres: number;
};

const CHAMPS_COMPARES = [
  "designation", "descriptionClient", "unite", "coefficient", "quantiteFixe", "pertePct", "arrondi",
  "quantiteMin", "condition", "prixVenteHt", "tauxTva", "visibleClient", "referenceInterne", "referenceFabricant",
] as const;

const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Compare l'instance d'un devis à une nouvelle version du modèle — AVANT toute réapplication.
 * Rien n'est modifié ici : l'utilisateur voit ce qui changerait, et décide.
 */
export function comparerAvecVersion(instance: InstanceOuvrage, nouvelle: VersionOuvrage): ComparaisonVersions {
  const avant = new Map(instance.modele.composants.map((c) => [c.cle, c]));
  const apres = new Map(nouvelle.composants.map((c) => [c.cle, c]));
  const simulation = reappliquerSansControle(instance, nouvelle, false);
  return {
    versionActuelle: instance.version,
    nouvelleVersion: nouvelle.version,
    ajoutes: nouvelle.composants.filter((c) => !avant.has(c.cle)).map((c) => ({ cle: c.cle, designation: c.designation })),
    retires: instance.modele.composants.filter((c) => !apres.has(c.cle)).map((c) => ({ cle: c.cle, designation: c.designation })),
    modifies: nouvelle.composants
      .filter((c) => avant.has(c.cle))
      .map((c) => {
        const ancien = avant.get(c.cle)! as unknown as Record<string, unknown>;
        const courant = c as unknown as Record<string, unknown>;
        return {
          cle: c.cle,
          designation: c.designation,
          changements: CHAMPS_COMPARES
            .filter((champ) => !egal(ancien[champ], courant[champ]))
            .map((champ) => ({ champ, avant: ancien[champ], apres: courant[champ] })),
        };
      })
      .filter((m) => m.changements.length > 0),
    modificationsManuelles: Object.entries(instance.modificationsManuelles).map(([cle, champs]) => ({ cle, champs })),
    venteHtAvant: montantsInstance(instance).venteHt,
    venteHtApres: montantsInstance(simulation).venteHt,
  };
}

function reappliquerSansControle(instance: InstanceOuvrage, nouvelle: VersionOuvrage, conserver: boolean): InstanceOuvrage {
  const issue = instancierOuvrage(nouvelle, {
    cle: instance.cle,
    ordre: instance.ordre,
    quantitePrincipale: instance.quantitePrincipale,
    options: instance.options,
    saisies: instance.saisies,
    mode: instance.mode,
    confirmeArchive: true,
  });
  if (issue.etat !== "pret") throw new Error(issue.motif);
  let resultat: InstanceOuvrage = {
    ...issue.instance,
    libelleClient: instance.libelleClient,
    descriptionClient: instance.descriptionClient,
  };
  if (conserver) {
    for (const [cle, champs] of Object.entries(instance.modificationsManuelles)) {
      const ancienne = instance.lignes.find((l) => l.cle === cle);
      if (!ancienne) continue;
      if (champs.includes("ajout")) {
        resultat = ajouterLigne(resultat, { ...ancienne });
        continue;
      }
      if (!resultat.lignes.some((l) => l.cle === cle)) continue;
      const patch: Record<string, unknown> = {};
      for (const champ of champs) if (champ in ancienne) patch[champ] = (ancienne as Record<string, unknown>)[champ];
      resultat = modifierLigne(resultat, cle, patch as ModificationLigne);
    }
    for (const [cle, champs] of Object.entries(instance.modificationsManuelles)) {
      if (champs.includes("retrait") && resultat.lignes.some((l) => l.cle === cle)) resultat = retirerLigne(resultat, cle);
    }
  }
  return resultat;
}

export type IssueReapplication =
  | { etat: "reapplique"; instance: InstanceOuvrage }
  | { etat: "refuse"; motif: string };

/**
 * Réapplique une nouvelle version de l'ouvrage à une instance d'un devis ENCORE EN BROUILLON,
 * après confirmation explicite. Un devis envoyé, accepté ou facturé n'est jamais touché.
 */
export function reappliquerVersion(
  instance: InstanceOuvrage,
  nouvelle: VersionOuvrage,
  o: { statutDevis: string; confirmer: boolean; conserverModificationsManuelles: boolean },
): IssueReapplication {
  if (o.statutDevis !== "brouillon") {
    return { etat: "refuse", motif: "Seul un devis en brouillon peut recevoir une nouvelle version d’ouvrage." };
  }
  if (!o.confirmer) return { etat: "refuse", motif: "Consultez la comparaison et confirmez la réapplication." };
  if (nouvelle.ouvrageId !== instance.ouvrageId) return { etat: "refuse", motif: "Il ne s’agit pas du même ouvrage." };
  try {
    return { etat: "reapplique", instance: reappliquerSansControle(instance, nouvelle, o.conserverModificationsManuelles) };
  } catch (e) {
    return { etat: "refuse", motif: e instanceof Error ? e.message : "Réapplication impossible." };
  }
}
