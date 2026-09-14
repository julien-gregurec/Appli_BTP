/**
 * Éditeur de la bibliothèque d'ouvrages — module PUR (aucun accès réseau, aucun React).
 *
 * Il fait le pont entre le formulaire (des chaînes, telles que saisies) et le modèle
 * `VersionOuvrage` de `src/lib/devis/ouvrages.ts`, qui reste la seule source des règles de
 * calcul et de validation. Rien ici ne calcule une quantité : la simulation appelle
 * `instancierOuvrage` / `calculerQuantites` tels quels.
 *
 * ── Règles ──────────────────────────────────────────────────────────────────────────────
 * 1. La clé d'un composant est posée UNE fois, à sa création, depuis sa désignation ; elle ne
 *    change plus jamais (les dépendances, les devis et la comparaison de versions s'y réfèrent).
 * 2. Une clé n'est jamais réattribuée à un autre composant, même après un retrait : les clés de la
 *    version chargée restent réservées.
 * 3. Sans le droit de VOIR les coûts, aucun prix d'achat n'entre dans le formulaire ni dans la
 *    simulation — même si l'appelant en fournissait par erreur.
 */

import {
  calculerQuantites,
  instancierOuvrage,
  validerVersion,
  type ComposantOuvrage,
  type ConditionInclusion,
  type NatureComposant,
  type QuantiteCalculee,
  type RegleArrondi,
  type SourceComposant,
  type VersionOuvrage,
} from "@/lib/devis/ouvrages";
import { arrondir, montantLigneHtExact, versNombre } from "@/lib/devis/montants";
import { avertissementsPrix, indicateursPrix, type Avertissement, type IndicateursPrix } from "@/lib/devis/prix";

// ── Formulaire ────────────────────────────────────────────────────────────────

export type ModeArrondi = RegleArrondi["mode"];
export type TypeCondition = ConditionInclusion["type"];

/** Un composant tel qu'édité : les nombres restent des chaînes tant qu'ils ne sont pas convertis. */
export type ComposantFormulaire = {
  cle: string;
  nature: NatureComposant;
  /** Lien catalogue d'origine, conservé tel quel (l'éditeur ne le modifie pas). */
  source: SourceComposant;
  designation: string;
  descriptionClient: string;
  unite: string;
  referenceInterne: string;
  referenceFabricant: string;
  fabricant: string;
  fournisseur: string;
  coefficient: string;
  /** `null` : quantité principale ; sinon clé du composant de base. */
  baseCle: string | null;
  quantiteFixe: string;
  saisieRequise: boolean;
  pertePct: string;
  arrondiMode: ModeArrondi;
  arrondiPas: string;
  quantiteMin: string;
  conditionType: TypeCondition;
  conditionSeuil: string;
  optionCle: string;
  optionLibelle: string;
  optionParDefaut: boolean;
  prixVenteHt: string;
  tauxTva: string;
  prixAchatHt: string;
  visibleClient: boolean;
};

export type OuvrageFormulaire = {
  referenceInterne: string;
  nom: string;
  categorie: string;
  unitePrincipale: string;
  quantitePrincipale: string;
  descriptionInterne: string;
  descriptionClient: string;
  composants: ComposantFormulaire[];
};

/** Métadonnées d'une version que le formulaire n'édite pas. */
export type MetaVersion = Pick<VersionOuvrage, "ouvrageId" | "entrepriseId" | "version" | "statut" | "auteur" | "creeLe" | "modifieLe">;

const texte = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "" : String(x));

/**
 * Nombre saisi : virgule ou point décimal, espaces ignorés. Vide → `null` ; illisible → `NaN`,
 * que `validerVersion` signalera (on ne remplace jamais une saisie invalide par une valeur).
 */
export function lireNombre(saisie: string): number | null {
  const s = saisie.replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return Number.NaN;
  return Number(s);
}

const texteOuNul = (s: string) => s.trim() || null;

export function composantVersFormulaire(c: ComposantOuvrage, o: { inclureCouts: boolean }): ComposantFormulaire {
  return {
    cle: c.cle,
    nature: c.nature,
    source: c.source ? { ...c.source } : null,
    designation: c.designation,
    descriptionClient: c.descriptionClient ?? "",
    unite: c.unite,
    referenceInterne: c.referenceInterne ?? "",
    referenceFabricant: c.referenceFabricant ?? "",
    fabricant: c.fabricant ?? "",
    fournisseur: c.fournisseur ?? "",
    coefficient: texte(c.coefficient),
    baseCle: c.base.type === "composant" ? c.base.cle : null,
    quantiteFixe: texte(c.quantiteFixe),
    saisieRequise: c.saisieRequise,
    pertePct: c.pertePct ? texte(c.pertePct) : "",
    arrondiMode: c.arrondi.mode,
    arrondiPas: c.arrondi.mode === "aucun" ? "" : texte(c.arrondi.pas),
    quantiteMin: texte(c.quantiteMin),
    conditionType: c.condition.type,
    conditionSeuil: c.condition.type === "quantite_min" ? texte(c.condition.seuil) : "",
    optionCle: c.condition.type === "option" ? c.condition.cle : "",
    optionLibelle: c.condition.type === "option" ? c.condition.libelle : "",
    optionParDefaut: c.condition.type === "option" ? c.condition.parDefaut : false,
    prixVenteHt: texte(c.prixVenteHt),
    tauxTva: texte(c.tauxTva),
    // Règle 3 : sans droit de lecture, la valeur n'entre même pas dans l'état du formulaire.
    prixAchatHt: o.inclureCouts ? texte(c.prixAchatHt) : "",
    visibleClient: c.visibleClient,
  };
}

export function versionVersFormulaire(v: VersionOuvrage | null, o: { inclureCouts: boolean }): OuvrageFormulaire {
  if (!v) {
    return {
      referenceInterne: "",
      nom: "",
      categorie: "",
      unitePrincipale: "",
      quantitePrincipale: "1",
      descriptionInterne: "",
      descriptionClient: "",
      composants: [],
    };
  }
  return {
    referenceInterne: v.referenceInterne ?? "",
    nom: v.nom,
    categorie: v.categorie ?? "",
    unitePrincipale: v.unitePrincipale,
    quantitePrincipale: texte(v.quantitePrincipale),
    descriptionInterne: v.descriptionInterne ?? "",
    descriptionClient: v.descriptionClient ?? "",
    composants: [...v.composants].sort((a, b) => a.ordre - b.ordre).map((c) => composantVersFormulaire(c, o)),
  };
}

function arrondiDepuis(c: ComposantFormulaire): RegleArrondi {
  if (c.arrondiMode === "aucun") return { mode: "aucun" };
  return { mode: c.arrondiMode, pas: lireNombre(c.arrondiPas) ?? Number.NaN };
}

function conditionDepuis(c: ComposantFormulaire): ConditionInclusion {
  if (c.conditionType === "quantite_min") return { type: "quantite_min", seuil: lireNombre(c.conditionSeuil) ?? Number.NaN };
  if (c.conditionType === "option") {
    const libelle = c.optionLibelle.trim();
    return { type: "option", cle: c.optionCle.trim() || slugCle(libelle, ""), libelle: libelle || c.optionCle.trim(), parDefaut: c.optionParDefaut };
  }
  return { type: "toujours" };
}

export function composantDepuisFormulaire(c: ComposantFormulaire, ordre: number, o: { inclureCouts: boolean }): ComposantOuvrage {
  return {
    cle: c.cle,
    ordre,
    nature: c.nature,
    source: c.source ? { ...c.source } : null,
    designation: c.designation.trim(),
    descriptionClient: texteOuNul(c.descriptionClient),
    unite: c.unite.trim(),
    referenceInterne: texteOuNul(c.referenceInterne),
    referenceFabricant: texteOuNul(c.referenceFabricant),
    fabricant: texteOuNul(c.fabricant),
    fournisseur: texteOuNul(c.fournisseur),
    coefficient: lireNombre(c.coefficient),
    base: c.baseCle ? { type: "composant", cle: c.baseCle } : { type: "principale" },
    quantiteFixe: lireNombre(c.quantiteFixe),
    saisieRequise: c.saisieRequise,
    pertePct: lireNombre(c.pertePct) ?? 0,
    arrondi: arrondiDepuis(c),
    quantiteMin: lireNombre(c.quantiteMin),
    condition: conditionDepuis(c),
    prixAchatHt: o.inclureCouts ? lireNombre(c.prixAchatHt) : null,
    prixVenteHt: lireNombre(c.prixVenteHt) ?? 0,
    tauxTva: lireNombre(c.tauxTva) ?? Number.NaN,
    visibleClient: c.visibleClient,
  };
}

/**
 * Version complète issue du formulaire. `inclureCouts` : `true` pour la simulation d'un
 * utilisateur qui voit les coûts, `true` à la publication seulement s'il peut les gérer.
 */
export function formulaireVersVersion(f: OuvrageFormulaire, meta: MetaVersion, o: { inclureCouts: boolean }): VersionOuvrage {
  return {
    ...meta,
    referenceInterne: texteOuNul(f.referenceInterne),
    nom: f.nom.trim(),
    descriptionInterne: texteOuNul(f.descriptionInterne),
    descriptionClient: texteOuNul(f.descriptionClient),
    categorie: texteOuNul(f.categorie),
    unitePrincipale: f.unitePrincipale.trim(),
    quantitePrincipale: lireNombre(f.quantitePrincipale) ?? Number.NaN,
    composants: f.composants.map((c, i) => composantDepuisFormulaire(c, i + 1, o)),
  };
}

/**
 * Copie de la version SANS aucun prix d'achat — à appliquer côté serveur avant de transmettre
 * une version à un utilisateur qui n'a pas le droit de voir les coûts.
 */
export function retirerCouts(v: VersionOuvrage): VersionOuvrage {
  return { ...v, composants: v.composants.map((c) => ({ ...c, prixAchatHt: null })) };
}

/** Ce qu'attend `publierOuvrageAction` : l'identité et les composants, rien d'autre. */
export function payloadPublication(v: VersionOuvrage): Pick<VersionOuvrage,
  "referenceInterne" | "nom" | "descriptionInterne" | "descriptionClient" | "categorie" | "unitePrincipale" | "quantitePrincipale" | "composants"> {
  return {
    referenceInterne: v.referenceInterne,
    nom: v.nom,
    descriptionInterne: v.descriptionInterne,
    descriptionClient: v.descriptionClient,
    categorie: v.categorie,
    unitePrincipale: v.unitePrincipale,
    quantitePrincipale: v.quantitePrincipale,
    composants: v.composants,
  };
}

// ── Clés de composants ────────────────────────────────────────────────────────

const CLE_MAX = 40;

/**
 * Clé lisible dérivée d'un libellé : minuscules, sans accents, `_` comme séparateur
 * (« Main-d’œuvre de pose » → `main_d_oeuvre_de_pose`). Chaîne vide → `repli`.
 */
export function slugCle(libelle: string, repli = "composant"): string {
  const s = libelle
    .replace(/œ/g, "oe").replace(/Œ/g, "oe").replace(/æ/g, "ae").replace(/Æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CLE_MAX)
    .replace(/_+$/g, "");
  return s || repli;
}

/** `base`, ou `base_2`, `base_3`… : la première forme absente de `prises`. */
export function cleUnique(base: string, prises: ReadonlySet<string>): string {
  if (!prises.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base.slice(0, CLE_MAX - String(i).length - 1)}_${i}`;
    if (!prises.has(candidate)) return candidate;
  }
}

/** Nouveau composant, avec une clé posée une fois pour toutes depuis sa désignation. */
export function nouveauComposant(designation: string, prises: ReadonlySet<string>, o: { tauxTva?: number } = {}): ComposantFormulaire {
  return {
    cle: cleUnique(slugCle(designation), prises),
    nature: "article",
    source: null,
    designation: designation.trim(),
    descriptionClient: "",
    unite: "u",
    referenceInterne: "",
    referenceFabricant: "",
    fabricant: "",
    fournisseur: "",
    coefficient: "1",
    baseCle: null,
    quantiteFixe: "",
    saisieRequise: false,
    pertePct: "",
    arrondiMode: "aucun",
    arrondiPas: "",
    quantiteMin: "",
    conditionType: "toujours",
    conditionSeuil: "",
    optionCle: "",
    optionLibelle: "",
    optionParDefaut: true,
    prixVenteHt: "",
    tauxTva: String(o.tauxTva ?? 20),
    prixAchatHt: "",
    visibleClient: true,
  };
}

/** Clés déjà prises : composants présents ET composants de la version chargée (règle 2). */
export function clesReservees(composants: readonly Pick<ComposantFormulaire, "cle">[], initiales: readonly string[] = []): Set<string> {
  return new Set([...initiales, ...composants.map((c) => c.cle)]);
}

// ── Liste des composants ──────────────────────────────────────────────────────

/** Déplace l'élément `index` de `delta` positions ; hors bornes, la liste est rendue inchangée. */
export function deplacer<T>(liste: readonly T[], index: number, delta: number): T[] {
  const cible = index + delta;
  if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) return [...liste];
  const copie = [...liste];
  const [element] = copie.splice(index, 1);
  copie.splice(cible, 0, element);
  return copie;
}

/** Composants calculés DIRECTEMENT à partir de `cle`. */
export function dependantsDirects<T extends Pick<ComposantFormulaire, "cle" | "baseCle">>(composants: readonly T[], cle: string): T[] {
  return composants.filter((c) => c.baseCle === cle);
}

/** Clés dont la chaîne de bases mène (directement ou non) à `cle`. */
function dependantsTransitifs(composants: readonly Pick<ComposantFormulaire, "cle" | "baseCle">[], cle: string): Set<string> {
  const resultat = new Set<string>();
  let frontiere = [cle];
  while (frontiere.length) {
    const suivante: string[] = [];
    for (const c of composants) {
      if (c.baseCle && frontiere.includes(c.baseCle) && !resultat.has(c.cle) && c.cle !== cle) {
        resultat.add(c.cle);
        suivante.push(c.cle);
      }
    }
    frontiere = suivante;
  }
  return resultat;
}

export type OptionBase = { valeur: string | null; libelle: string };

/**
 * Bases proposées pour le composant `cle` : la quantité principale, puis les autres composants,
 * par leur désignation — sauf lui-même et ceux qui dépendent déjà de lui (une boucle serait
 * refusée à la publication ; autant ne pas la proposer).
 */
export function optionsBase(composants: readonly Pick<ComposantFormulaire, "cle" | "baseCle" | "designation">[], cle: string): OptionBase[] {
  const exclus = dependantsTransitifs(composants, cle);
  exclus.add(cle);
  return [
    { valeur: null, libelle: "Quantité principale" },
    ...composants.filter((c) => !exclus.has(c.cle)).map((c) => ({ valeur: c.cle, libelle: `Quantité de « ${c.designation.trim() || c.cle} »` })),
  ];
}

/** Options d'inclusion distinctes déclarées par les composants (clé, libellé, cochée par défaut). */
export function optionsDeclarees(v: Pick<VersionOuvrage, "composants">): Array<{ cle: string; libelle: string; parDefaut: boolean }> {
  const vues = new Map<string, { cle: string; libelle: string; parDefaut: boolean }>();
  for (const c of v.composants) {
    if (c.condition.type === "option" && c.condition.cle && !vues.has(c.condition.cle)) {
      vues.set(c.condition.cle, { cle: c.condition.cle, libelle: c.condition.libelle || c.condition.cle, parDefaut: c.condition.parDefaut });
    }
  }
  return [...vues.values()];
}

// ── Simulation ────────────────────────────────────────────────────────────────

export type EntreeSimulation = {
  quantitePrincipale: number;
  options: readonly string[];
  saisies: Readonly<Record<string, number>>;
};

export type LigneSimulee = QuantiteCalculee & { designation: string; unite: string; venteHt: number | null };

export type ResultatSimulation =
  | { etat: "invalide"; erreurs: string[] }
  | {
      etat: "calcule";
      lignes: LigneSimulee[];
      saisiesManquantes: string[];
      /** Coût, marge et taux : `null` sans le droit de voir les coûts. */
      indicateurs: IndicateursPrix;
      avertissements: Avertissement[];
    };

const CODES_COUTS: ReadonlySet<Avertissement["code"]> = new Set(["prix_inferieur_cout", "marge_sous_seuil", "cout_inconnu"]);

/**
 * Simule l'insertion de l'ouvrage édité, avec les fonctions du moteur (aucun calcul refait ici).
 * Sans `peutVoirCouts`, les prix d'achat sont retirés AVANT le calcul et les avertissements qui
 * parlent de coûts sont écartés : rien ne permet de les reconstituer.
 */
export function simulerOuvrage(
  version: VersionOuvrage,
  entree: EntreeSimulation,
  o: { peutVoirCouts: boolean; seuilTauxMarquePct?: number | null },
): ResultatSimulation {
  const v: VersionOuvrage = o.peutVoirCouts
    ? version
    : { ...version, composants: version.composants.map((c) => ({ ...c, prixAchatHt: null })) };
  const erreurs = validerVersion(v);
  if (erreurs.length) return { etat: "invalide", erreurs };
  const issue = instancierOuvrage(v, {
    cle: "simulation",
    ordre: 1,
    quantitePrincipale: entree.quantitePrincipale,
    options: entree.options,
    saisies: entree.saisies,
    confirmeArchive: true,
  });
  if (issue.etat === "refuse") return { etat: "invalide", erreurs: [issue.motif] };

  const quantites = calculerQuantites(v.composants, entree.quantitePrincipale, new Set(entree.options), entree.saisies);
  // Montant de chaque ligne par l'arithmétique décimale exacte du moteur, jamais en flottants.
  const venteParCle = new Map(issue.instance.lignes.map((l) => [
    l.cle,
    versNombre(arrondir(montantLigneHtExact({ quantite: l.quantite, prixUnitaireHt: l.prixVenteHt, remiseLignePct: l.remiseLignePct, tauxTva: l.tauxTva }))),
  ]));
  const lignes = [...v.composants]
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({
      ...quantites.get(c.cle)!,
      designation: c.designation,
      unite: c.unite,
      venteHt: venteParCle.get(c.cle) ?? null,
    }));
  const indicateurs = indicateursPrix(issue.instance);
  const avertissements = avertissementsPrix(issue.instance, { seuilTauxMarquePct: o.seuilTauxMarquePct ?? null });
  return {
    etat: "calcule",
    lignes,
    saisiesManquantes: issue.saisiesManquantes,
    indicateurs: o.peutVoirCouts
      ? indicateurs
      : { ...indicateurs, coutAchatHt: null, margeHt: null, tauxMargePct: null, tauxMarquePct: null },
    avertissements: o.peutVoirCouts ? avertissements : avertissements.filter((a) => !CODES_COUTS.has(a.code)),
  };
}
