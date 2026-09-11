/**
 * De l'état de l'éditeur à l'appel `enregistrer_devis_brouillon_v2` — module PUR.
 *
 * Une seule traduction, testée dans les deux sens : ce qui est enregistré ici, relu par
 * `elementsDepuisRendu`, donne exactement les mêmes lignes client et les mêmes totaux.
 *
 * Ordre : les éléments (lignes libres et ouvrages) partagent un même espace d'ordre, par pas de
 * 1 000 ; les composants d'un ouvrage suivent son rang (`rang × 1000 + i + 1`). Relu par la base
 * (`order by ordre`), un devis v2 garde donc aussi un ordre cohérent pour tout lecteur historique.
 *
 * Coûts : `p_couts` n'est rempli que si l'appelant peut gérer les coûts — la base l'ignorerait
 * sinon, mais on ne transmet pas une donnée qui ne doit pas circuler.
 */

import { TYPE_LIGNE_PAR_NATURE, type InstanceOuvrage, type LigneOuvrage } from "@/lib/devis/ouvrages";
import type { Filigrane } from "@/lib/devis/filigrane";
import type { ElementDevis } from "@/lib/devis/presentation";

export const PAS_ORDRE = 1000;

export type EnteteDevisV2 = {
  client_id: string;
  chantier_id: string | null;
  date_emission: string | null;
  date_validite: string | null;
  conditions: string | null;
  notes_client: string | null;
  notes_internes: string | null;
  remise_globale: number;
  /** `null` : hérite des réglages de l'entreprise. */
  filigrane: Partial<Filigrane> | null;
};

export type LigneDevisV2 = {
  cle_ligne: string;
  ouvrage_cle: string | null;
  ordre: number;
  designation: string;
  description: string | null;
  type: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  taux_tva: number;
  origine_ligne: "saisie" | "catalogue" | "ouvrage" | "ajustement" | "ia" | "modele";
  source_catalogue: "prestation" | "article" | null;
  source_id: string | null;
  reference_interne_instantane: string | null;
  reference_fabricant_instantane: string | null;
  nature: string | null;
  parametres_quantite: Record<string, unknown> | null;
  quantite_forcee: boolean;
  visible_client: boolean;
  afficher_quantite: boolean;
  afficher_prix: boolean;
  description_client_personnalisee: string | null;
  motif_ajustement: string | null;
  detail_calcul: string | null;
};

export type OuvrageDevisV2 = {
  cle: string;
  ordre: number;
  ouvrage_id: string | null;
  ouvrage_version: number;
  ouvrage_reference: string | null;
  ouvrage_nom: string;
  categorie: string | null;
  unite_principale: string;
  quantite_principale: number;
  options: string[];
  saisies: Record<string, number>;
  libelle_client: string;
  description_client: string | null;
  mode_presentation: string;
  instantane_modele: unknown;
  modifications_manuelles: Record<string, string[]>;
};

export type PayloadEnregistrementV2 = {
  p_devis: EnteteDevisV2;
  p_ouvrages: OuvrageDevisV2[];
  p_lignes: LigneDevisV2[];
  p_couts: Array<{ cle_ligne: string; prix_achat_ht: number }>;
};

/** Ligne libre de l'éditeur, avec son origine et ses éventuelles références figées. */
export type OrigineLigneLibre = {
  origine?: "saisie" | "catalogue" | "ia" | "modele";
  sourceCatalogue?: "prestation" | "article" | null;
  sourceId?: string | null;
  referenceInterne?: string | null;
  referenceFabricant?: string | null;
  prixAchatHt?: number | null;
};

function parametres(l: LigneOuvrage): Record<string, unknown> {
  return {
    coefficient: l.coefficient,
    base: l.base,
    quantiteFixe: l.quantiteFixe,
    saisieRequise: l.saisieRequise,
    pertePct: l.pertePct,
    arrondi: l.arrondi,
    quantiteMin: l.quantiteMin,
    condition: l.condition,
  };
}

function ligneDOuvrage(instance: InstanceOuvrage, l: LigneOuvrage, rang: number, i: number): LigneDevisV2 {
  const ajustement = l.origine === "ajustement";
  return {
    cle_ligne: `${instance.cle}:${l.cle}`,
    ouvrage_cle: instance.cle,
    ordre: rang * PAS_ORDRE + i + 1,
    designation: l.designation,
    description: l.descriptionClient,
    type: l.type ?? TYPE_LIGNE_PAR_NATURE[l.nature],
    quantite: l.quantite,
    unite: l.unite,
    prix_unitaire_ht: l.prixVenteHt,
    remise_ligne: l.remiseLignePct,
    taux_tva: l.tauxTva,
    origine_ligne: ajustement ? "ajustement" : "ouvrage",
    source_catalogue: l.source?.catalogue ?? null,
    source_id: l.source?.id ?? null,
    reference_interne_instantane: l.referenceInterne,
    reference_fabricant_instantane: l.referenceFabricant,
    nature: l.nature,
    parametres_quantite: ajustement ? null : parametres(l),
    quantite_forcee: l.quantiteForcee,
    visible_client: l.visibleClient,
    afficher_quantite: l.afficherQuantite,
    afficher_prix: l.afficherPrix,
    description_client_personnalisee: l.descriptionPersonnalisee,
    motif_ajustement: l.motifAjustement,
    detail_calcul: l.detailCalcul || null,
  };
}

/**
 * Construit l'appel d'enregistrement. `origines` complète les lignes libres (catalogue, IA…) par
 * leur clé ; `inclureCouts` n'est vrai que pour un utilisateur autorisé à gérer les coûts.
 */
export function payloadEnregistrementV2(
  entete: EnteteDevisV2,
  elements: readonly ElementDevis[],
  o: { inclureCouts: boolean; origines?: Readonly<Record<string, OrigineLigneLibre>> },
): PayloadEnregistrementV2 {
  const tries = [...elements].sort((a, b) => a.ordre - b.ordre);
  const p_ouvrages: OuvrageDevisV2[] = [];
  const p_lignes: LigneDevisV2[] = [];
  const p_couts: Array<{ cle_ligne: string; prix_achat_ht: number }> = [];

  tries.forEach((e, index) => {
    const rang = index + 1;
    if (e.type === "ligne") {
      const l = e.ligne;
      const origine = o.origines?.[l.cle] ?? {};
      p_lignes.push({
        cle_ligne: l.cle,
        ouvrage_cle: null,
        ordre: rang * PAS_ORDRE,
        designation: l.designation,
        description: l.description,
        type: l.type,
        quantite: l.quantite,
        unite: l.unite,
        prix_unitaire_ht: l.prixUnitaireHt,
        remise_ligne: l.remiseLignePct,
        taux_tva: l.tauxTva,
        origine_ligne: origine.origine ?? (origine.sourceId ? "catalogue" : "saisie"),
        source_catalogue: origine.sourceCatalogue ?? null,
        source_id: origine.sourceId ?? null,
        reference_interne_instantane: origine.referenceInterne ?? null,
        reference_fabricant_instantane: origine.referenceFabricant ?? null,
        nature: null,
        parametres_quantite: null,
        quantite_forcee: false,
        visible_client: true,
        afficher_quantite: true,
        afficher_prix: true,
        description_client_personnalisee: null,
        motif_ajustement: null,
        detail_calcul: null,
      });
      if (o.inclureCouts && origine.prixAchatHt !== null && origine.prixAchatHt !== undefined) {
        p_couts.push({ cle_ligne: l.cle, prix_achat_ht: origine.prixAchatHt });
      }
      return;
    }
    const i = e.instance;
    p_ouvrages.push({
      cle: i.cle,
      ordre: rang * PAS_ORDRE,
      ouvrage_id: i.ouvrageId || null,
      ouvrage_version: i.version,
      ouvrage_reference: i.referenceInterne,
      ouvrage_nom: i.nom,
      categorie: i.categorie,
      unite_principale: i.unitePrincipale,
      quantite_principale: i.quantitePrincipale,
      options: [...i.options],
      saisies: { ...i.saisies },
      libelle_client: i.libelleClient,
      description_client: i.descriptionClient,
      mode_presentation: i.mode,
      instantane_modele: i.modele,
      modifications_manuelles: { ...i.modificationsManuelles },
    });
    [...i.lignes].sort((a, b) => a.ordre - b.ordre).forEach((l, k) => {
      const ligne = ligneDOuvrage(i, l, rang, k);
      p_lignes.push(ligne);
      if (o.inclureCouts && l.origine !== "ajustement" && l.prixAchatHt !== null) {
        p_couts.push({ cle_ligne: ligne.cle_ligne, prix_achat_ht: l.prixAchatHt });
      }
    });
  });

  return { p_devis: { ...entete }, p_ouvrages, p_lignes, p_couts };
}
