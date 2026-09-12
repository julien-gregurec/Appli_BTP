/**
 * Des lignes enregistrées en base à l'état de l'éditeur v2 — module PUR.
 *
 * C'est l'inverse exact de `payloadEnregistrementV2` : rouvrir un brouillon puis l'enregistrer sans
 * rien toucher rend les mêmes lignes, les mêmes paramètres de calcul, les mêmes modifications
 * manuelles, les mêmes coûts (voir le test d'aller-retour).
 */

import type { EnteteDevisV2, OrigineLigneLibre } from "@/lib/devis/enregistrement-v2";
import type { EtatElements } from "@/lib/devis/editeur-etat";
import type { Filigrane } from "@/lib/devis/filigrane";
import type {
  InstanceOuvrage,
  InstantaneModele,
  LigneOuvrage,
  ModePresentation,
  MotifAjustement,
  NatureComposant,
  ParametresQuantite,
  TypeLigneDevis,
} from "@/lib/devis/ouvrages";
import type { ElementDevis } from "@/lib/devis/presentation";
import { estTypeLigne, TYPE_LIGNE_DEFAUT } from "@/lib/devis/types-ligne";

export type LigneDevisBase = {
  cle_ligne: string;
  ouvrage_cle: string | null;
  ordre: number;
  designation: string;
  description: string | null;
  type: string;
  quantite: number | string;
  unite: string;
  prix_unitaire_ht: number | string;
  remise_ligne: number | string;
  taux_tva: number | string;
  origine_ligne: string | null;
  source_catalogue: "prestation" | "article" | null;
  source_id: string | null;
  reference_interne_instantane: string | null;
  reference_fabricant_instantane: string | null;
  nature: string | null;
  parametres_quantite: Partial<ParametresQuantite> | null;
  quantite_forcee: boolean | null;
  visible_client: boolean | null;
  afficher_quantite: boolean | null;
  afficher_prix: boolean | null;
  description_client_personnalisee: string | null;
  motif_ajustement: string | null;
  detail_calcul: string | null;
  // GP V1 (lot C) — absents avant la migration de la grille.
  type_ligne?: string | null;
  remise_section_pct?: number | string | null;
  commentaire_interne?: string | null;
  famille_instantane?: string | null;
  fournisseur_instantane?: string | null;
  code_fournisseur_instantane?: string | null;
};

/** Coûts d'une ligne lus en base (table protégée) ; `prix_achat_ht` seul avant la grille. */
export type CoutLigneBase = { prix_achat_ht: number | string; cout_main_oeuvre_ht?: number | string | null; coefficient?: number | string | null };

export type OuvrageDevisBase = {
  cle: string;
  ordre: number;
  ouvrage_id: string | null;
  ouvrage_version: number;
  ouvrage_reference: string | null;
  ouvrage_nom: string;
  categorie: string | null;
  unite_principale: string;
  quantite_principale: number | string;
  options: string[] | null;
  saisies: Record<string, number> | null;
  libelle_client: string;
  description_client: string | null;
  mode_presentation: string;
  instantane_modele: InstantaneModele;
  modifications_manuelles: Record<string, string[]> | null;
};

export type DevisBase = {
  client_id: string;
  chantier_id: string | null;
  date_emission: string | null;
  date_validite: string | null;
  conditions: string | null;
  notes_client: string | null;
  notes_internes: string | null;
  remise_globale: number | string;
  filigrane: Partial<Filigrane> | null;
  reference_interne?: string | null;
  reference_client?: string | null;
  mode_reglement?: string | null;
  conditions_paiement?: string | null;
  commercial_employe_id?: string | null;
};

const n = (x: number | string | null | undefined) => Number(x ?? 0);
const nOuNul = (x: number | string | null | undefined) => (x === null || x === undefined || x === "" ? null : Number(x));
const MODES: readonly ModePresentation[] = ["regroupe", "semi_detaille", "eclate", "personnalise"];
const ORIGINES_LIBRES = ["saisie", "catalogue", "ia", "modele"] as const;

function ligneOuvrageDepuisBase(l: LigneDevisBase, instanceCle: string, manuelles: Record<string, string[]>, cout: number | null): LigneOuvrage {
  const prefixe = `${instanceCle}:`;
  const cle = l.cle_ligne.startsWith(prefixe) ? l.cle_ligne.slice(prefixe.length) : l.cle_ligne;
  const p = l.parametres_quantite ?? {};
  const ajustement = l.origine_ligne === "ajustement";
  return {
    cle,
    designation: l.designation,
    unite: l.unite,
    coefficient: p.coefficient ?? null,
    base: p.base ?? { type: "principale" },
    quantiteFixe: p.quantiteFixe ?? null,
    saisieRequise: p.saisieRequise ?? false,
    pertePct: p.pertePct ?? 0,
    arrondi: p.arrondi ?? { mode: "aucun" },
    quantiteMin: p.quantiteMin ?? null,
    condition: p.condition ?? { type: "toujours" },
    origine: ajustement ? "ajustement" : (manuelles[cle] ?? []).includes("ajout") ? "ajout_manuel" : "modele",
    motifAjustement: (l.motif_ajustement as MotifAjustement | null) ?? null,
    ordre: n(l.ordre) % 1000,
    nature: (l.nature as NatureComposant | null) ?? "libre",
    type: l.type as TypeLigneDevis,
    source: l.source_id && l.source_catalogue ? { catalogue: l.source_catalogue, id: l.source_id } : null,
    referenceInterne: l.reference_interne_instantane,
    referenceFabricant: l.reference_fabricant_instantane,
    descriptionClient: l.description,
    quantite: n(l.quantite),
    quantiteForcee: l.quantite_forcee ?? false,
    prixAchatHt: ajustement ? null : cout,
    prixVenteHt: n(l.prix_unitaire_ht),
    tauxTva: n(l.taux_tva),
    remiseLignePct: n(l.remise_ligne),
    visibleClient: l.visible_client !== false,
    afficherQuantite: l.afficher_quantite !== false,
    afficherPrix: l.afficher_prix !== false,
    descriptionPersonnalisee: l.description_client_personnalisee,
    detailCalcul: l.detail_calcul ?? "",
  };
}

/**
 * État de l'éditeur depuis les lignes, instances d'ouvrages et coûts enregistrés.
 * `couts` : prix d'achat par clé de ligne ; `coutsDetail` (GP V1) : main-d'œuvre et coefficient.
 */
export function etatDepuisBase(
  lignes: readonly LigneDevisBase[],
  ouvrages: readonly OuvrageDevisBase[],
  couts: Readonly<Record<string, number>> = {},
  coutsDetail: Readonly<Record<string, Pick<CoutLigneBase, "cout_main_oeuvre_ht" | "coefficient">>> = {},
): EtatElements {
  const cles = new Set(ouvrages.map((o) => o.cle));
  const origines: Record<string, OrigineLigneLibre> = {};
  const elements: ElementDevis[] = [];

  for (const l of lignes) {
    if (l.ouvrage_cle && cles.has(l.ouvrage_cle)) continue;
    const origine = (ORIGINES_LIBRES as readonly string[]).includes(l.origine_ligne ?? "") ? (l.origine_ligne as OrigineLigneLibre["origine"]) : "saisie";
    const detail = coutsDetail[l.cle_ligne];
    origines[l.cle_ligne] = {
      origine,
      sourceCatalogue: l.source_catalogue,
      sourceId: l.source_id,
      referenceInterne: l.reference_interne_instantane,
      referenceFabricant: l.reference_fabricant_instantane,
      prixAchatHt: couts[l.cle_ligne] ?? null,
      famille: l.famille_instantane ?? null,
      fournisseur: l.fournisseur_instantane ?? null,
      codeFournisseur: l.code_fournisseur_instantane ?? null,
      coutMainOeuvreHt: detail ? nOuNul(detail.cout_main_oeuvre_ht) : null,
      coefficient: detail ? nOuNul(detail.coefficient) : null,
    };
    elements.push({
      type: "ligne",
      ordre: n(l.ordre),
      ligne: {
        cle: l.cle_ligne,
        designation: l.designation,
        description: l.description,
        type: l.type as TypeLigneDevis,
        quantite: n(l.quantite),
        unite: l.unite,
        prixUnitaireHt: n(l.prix_unitaire_ht),
        remiseLignePct: n(l.remise_ligne),
        tauxTva: n(l.taux_tva),
        typeLigne: estTypeLigne(l.type_ligne) ? l.type_ligne : TYPE_LIGNE_DEFAUT,
        remiseSectionPct: nOuNul(l.remise_section_pct),
        commentaireInterne: l.commentaire_interne ?? null,
      },
    });
  }

  for (const o of ouvrages) {
    const manuelles = o.modifications_manuelles ?? {};
    const instance: InstanceOuvrage = {
      cle: o.cle,
      ouvrageId: o.ouvrage_id ?? "",
      version: o.ouvrage_version,
      referenceInterne: o.ouvrage_reference,
      nom: o.ouvrage_nom,
      categorie: o.categorie,
      unitePrincipale: o.unite_principale,
      quantitePrincipale: n(o.quantite_principale),
      options: [...(o.options ?? [])],
      saisies: { ...(o.saisies ?? {}) },
      libelleClient: o.libelle_client,
      descriptionClient: o.description_client,
      mode: MODES.includes(o.mode_presentation as ModePresentation) ? (o.mode_presentation as ModePresentation) : "regroupe",
      ordre: n(o.ordre),
      modele: o.instantane_modele,
      lignes: lignes
        .filter((l) => l.ouvrage_cle === o.cle)
        .sort((a, b) => n(a.ordre) - n(b.ordre))
        .map((l) => ligneOuvrageDepuisBase(l, o.cle, manuelles, couts[l.cle_ligne] ?? null)),
      modificationsManuelles: { ...manuelles },
    };
    elements.push({ type: "ouvrage", ordre: n(o.ordre), instance });
  }

  const tries = elements.sort((a, b) => a.ordre - b.ordre).map((e, i) => {
    const ordre = i + 1;
    return e.type === "ouvrage" ? { ...e, ordre, instance: { ...e.instance, ordre } } : { ...e, ordre };
  });
  return { elements: tries, origines };
}

export function enteteDepuisBase(d: DevisBase): EnteteDevisV2 {
  return {
    client_id: d.client_id,
    chantier_id: d.chantier_id,
    date_emission: d.date_emission,
    date_validite: d.date_validite,
    conditions: d.conditions,
    notes_client: d.notes_client,
    notes_internes: d.notes_internes,
    remise_globale: n(d.remise_globale),
    filigrane: d.filigrane,
    reference_interne: d.reference_interne ?? null,
    reference_client: d.reference_client ?? null,
    mode_reglement: d.mode_reglement ?? null,
    conditions_paiement: d.conditions_paiement ?? null,
    commercial_employe_id: d.commercial_employe_id ?? null,
  };
}
