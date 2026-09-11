/**
 * Du rendu JSON produit par la base à la source du moteur de présentation v2 — module PUR.
 *
 * `document_rendu` (utilisateur connecté) et `document_rendu_par_token` (portail, pièce jointe
 * d'e-mail) renvoient le MÊME objet : l'instantané figé d'un document émis, ou le rendu courant
 * d'un brouillon. Ce module est la seule traduction de cet objet vers `SourceDocument` — impression,
 * PDF, portail et e-mail passent donc tous par ici, puis par `construireVueDocument`.
 *
 * Voir `construire_rendu_devis` / `construire_rendu_facture` dans
 * supabase/proposed/gp-devis-wysiwyg-catalogue-ouvrages-v1.sql.proposed.
 */

import type { IdentiteDestinataire, IdentiteEmetteur, SourceDocument, StyleDocument } from "@/lib/devis/document-modele";
import { resoudreFiligrane, type Filigrane, type ReglagesFiligraneEntreprise } from "@/lib/devis/filigrane";
import type {
  InstanceOuvrage,
  LigneOuvrage,
  ModePresentation,
  MotifAjustement,
  NatureComposant,
  TypeLigneDevis,
} from "@/lib/devis/ouvrages";
import type { ElementDevis } from "@/lib/devis/presentation";
import { typeFactureLabel } from "@/lib/factures";

export type LigneRendu = {
  cle_ligne: string;
  ouvrage_cle: string | null;
  ordre: number;
  designation: string;
  description: string | null;
  type: TypeLigneDevis;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  taux_tva: number;
  origine_ligne?: string | null;
  nature?: NatureComposant | null;
  reference_interne_instantane?: string | null;
  reference_fabricant_instantane?: string | null;
  visible_client?: boolean | null;
  afficher_quantite?: boolean | null;
  afficher_prix?: boolean | null;
  description_client_personnalisee?: string | null;
  motif_ajustement?: MotifAjustement | null;
};

export type OuvrageRendu = {
  cle: string;
  ordre: number;
  ouvrage_version: number;
  ouvrage_reference: string | null;
  ouvrage_nom: string;
  categorie: string | null;
  unite_principale: string;
  quantite_principale: number;
  libelle_client: string;
  description_client: string | null;
  mode_presentation: ModePresentation;
};

export type RenduDocument = {
  version: 1;
  moteur: 1 | 2;
  type_document: "devis" | "facture";
  type_facture?: string | null;
  provenance: string;
  numero: string | null;
  statut: string;
  date_emission: string | null;
  date_validite?: string | null;
  date_echeance?: string | null;
  remise_globale: number;
  montants: { ht: number; tva: number; ttc: number };
  conditions?: string | null;
  notes_client: string | null;
  entreprise: Record<string, unknown> | null;
  client: Record<string, unknown> | null;
  filigrane: Partial<Filigrane> | null;
  filigrane_document?: Partial<Filigrane> | null;
  filigranes_entreprise?: ReglagesFiligraneEntreprise | null;
  ouvrages: OuvrageRendu[];
  lignes: LigneRendu[];
};

export type ReponseRendu = { source: "instantane" | "brouillon" | "moteur_v1"; rendu: RenduDocument | null };

const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const nombre = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

function ligneOuvrage(l: LigneRendu): LigneOuvrage {
  const ajustement = l.origine_ligne === "ajustement";
  // Clé de ligne enregistrée = « <ouvrage>:<composant> » (enregistrement-v2.ts) : on retrouve la clé
  // du composant, pour que relire un devis donne exactement les lignes qu'on a enregistrées.
  const prefixe = l.ouvrage_cle ? `${l.ouvrage_cle}:` : null;
  return {
    cle: prefixe && l.cle_ligne.startsWith(prefixe) ? l.cle_ligne.slice(prefixe.length) : l.cle_ligne,
    designation: l.designation,
    unite: l.unite,
    // Paramètres de calcul : internes, jamais transmis au rendu — inutiles pour présenter.
    coefficient: null,
    base: { type: "principale" },
    quantiteFixe: null,
    saisieRequise: false,
    pertePct: 0,
    arrondi: { mode: "aucun" },
    quantiteMin: null,
    condition: { type: "toujours" },
    origine: ajustement ? "ajustement" : "modele",
    motifAjustement: l.motif_ajustement ?? null,
    ordre: nombre(l.ordre),
    nature: l.nature ?? "libre",
    type: l.type,
    source: null,
    referenceInterne: l.reference_interne_instantane ?? null,
    referenceFabricant: l.reference_fabricant_instantane ?? null,
    descriptionClient: l.description,
    quantite: nombre(l.quantite),
    quantiteForcee: true,
    prixAchatHt: null,
    prixVenteHt: nombre(l.prix_unitaire_ht),
    tauxTva: nombre(l.taux_tva),
    remiseLignePct: nombre(l.remise_ligne),
    visibleClient: l.visible_client !== false,
    afficherQuantite: l.afficher_quantite !== false,
    afficherPrix: l.afficher_prix !== false,
    descriptionPersonnalisee: l.description_client_personnalisee ?? null,
    detailCalcul: "",
  };
}

/** Éléments du document (lignes libres et ouvrages), dans l'ordre enregistré. */
export function elementsDepuisRendu(r: Pick<RenduDocument, "ouvrages" | "lignes">): ElementDevis[] {
  const cles = new Set(r.ouvrages.map((o) => o.cle));
  const elements: ElementDevis[] = r.lignes
    .filter((l) => !l.ouvrage_cle || !cles.has(l.ouvrage_cle))
    .map((l) => ({
      type: "ligne" as const,
      ordre: nombre(l.ordre),
      ligne: {
        cle: l.cle_ligne,
        designation: l.designation,
        description: l.description,
        type: l.type,
        quantite: nombre(l.quantite),
        unite: l.unite,
        prixUnitaireHt: nombre(l.prix_unitaire_ht),
        remiseLignePct: nombre(l.remise_ligne),
        tauxTva: nombre(l.taux_tva),
      },
    }));
  for (const o of r.ouvrages) {
    const instance: InstanceOuvrage = {
      cle: o.cle,
      ouvrageId: "",
      version: nombre(o.ouvrage_version),
      referenceInterne: o.ouvrage_reference,
      nom: o.ouvrage_nom,
      categorie: o.categorie,
      unitePrincipale: o.unite_principale,
      quantitePrincipale: nombre(o.quantite_principale),
      options: [],
      saisies: {},
      libelleClient: o.libelle_client,
      descriptionClient: o.description_client,
      mode: o.mode_presentation,
      ordre: nombre(o.ordre),
      modele: {
        ouvrageId: "", entrepriseId: "", version: nombre(o.ouvrage_version), referenceInterne: o.ouvrage_reference,
        nom: o.ouvrage_nom, descriptionInterne: null, descriptionClient: o.description_client, categorie: o.categorie,
        unitePrincipale: o.unite_principale, quantitePrincipale: nombre(o.quantite_principale), statut: "actif",
        composants: [], auteur: null, creeLe: "", modifieLe: "",
      },
      lignes: r.lignes.filter((l) => l.ouvrage_cle === o.cle).map(ligneOuvrage),
      modificationsManuelles: {},
    };
    elements.push({ type: "ouvrage", ordre: nombre(o.ordre), instance });
  }
  return elements.sort((a, b) => a.ordre - b.ordre);
}

function emetteur(e: Record<string, unknown> | null): IdentiteEmetteur {
  const x = e ?? {};
  return {
    nom: texte(x.nom) ?? "",
    raisonSociale: texte(x.raison_sociale),
    siret: texte(x.siret),
    adresse: texte(x.adresse),
    codePostal: texte(x.code_postal),
    ville: texte(x.ville),
    logoUrl: texte(x.logo_url),
    assuranceDecennaleNumero: texte(x.assurance_decennale_numero),
    assuranceDecennaleAssureur: texte(x.assurance_decennale_assureur),
    assuranceRcProNumero: texte(x.assurance_rc_pro_numero),
    tauxPenalitesRetard: x.taux_penalites_retard === null || x.taux_penalites_retard === undefined ? null : nombre(x.taux_penalites_retard),
    texteEntete: texte(x.texte_entete),
    textePiedPage: texte(x.texte_pied_page),
  };
}

function style(e: Record<string, unknown> | null): Partial<StyleDocument> {
  const x = e ?? {};
  return {
    police: x.police_documents as StyleDocument["police"],
    taillePolice: x.taille_police_documents === null || x.taille_police_documents === undefined ? undefined : nombre(x.taille_police_documents),
    logoLargeur: x.logo_largeur_documents === null || x.logo_largeur_documents === undefined ? undefined : nombre(x.logo_largeur_documents),
    couleur: texte(x.couleur_documents) ?? undefined,
    couleurSecondaire: texte(x.couleur_secondaire_documents) ?? undefined,
    miseEnPage: x.mise_en_page_documents as StyleDocument["miseEnPage"],
    positionLogo: x.position_logo_documents as StyleDocument["positionLogo"],
    afficherLogo: x.afficher_logo_documents !== false,
    afficherDescriptions: x.afficher_descriptions_documents !== false,
    afficherTvaLignes: x.afficher_tva_lignes_documents !== false,
  };
}

function destinataire(c: Record<string, unknown> | null): IdentiteDestinataire {
  const x = c ?? {};
  return {
    nomAffiche: texte(x.nom_affiche) ?? "(sans nom)",
    adresse: texte(x.adresse_facturation),
    codePostal: texte(x.code_postal),
    ville: texte(x.ville),
    siret: texte(x.siret),
  };
}

export class MoteurNonV2 extends Error {
  constructor() {
    super("Document du moteur de présentation v1 : à rendre par le chemin historique.");
  }
}

/**
 * Source v2 d'un rendu. Un document émis n'utilise QUE son filigrane figé ; un brouillon applique la
 * règle du brouillon (réglage du document, puis « brouillon » de l'entreprise, puis défaut).
 */
export function sourceDepuisRendu(
  r: RenduDocument,
  o: { nomProduit: string; estDuplicata?: boolean },
): SourceDocument {
  if (r.moteur !== 2) throw new MoteurNonV2();
  const estFacture = r.type_document === "facture";
  const brouillon = r.statut === "brouillon";
  const typeFacture = r.type_facture ?? "simple";
  const duplicata = !!o.estDuplicata && estFacture && !brouillon;
  return {
    typeDocument: r.type_document,
    titre: estFacture ? (typeFacture === "simple" ? "Facture" : `Facture — ${typeFactureLabel(typeFacture)}`) : "Devis",
    statut: r.statut,
    numero: r.numero,
    dateEmission: r.date_emission,
    dateSecondaire: estFacture
      ? (r.date_echeance ? { libelle: "Échéance le", valeur: r.date_echeance } : null)
      : (r.date_validite ? { libelle: "Valable jusqu’au", valeur: r.date_validite } : null),
    emetteur: emetteur(r.entreprise),
    style: style(r.entreprise),
    destinataire: destinataire(r.client),
    elements: elementsDepuisRendu(r),
    remiseGlobalePct: nombre(r.remise_globale),
    totauxEnregistres: { totalHt: nombre(r.montants.ht), totalTva: nombre(r.montants.tva), totalTtc: nombre(r.montants.ttc) },
    conditions: estFacture ? null : (r.conditions ?? null),
    notesClient: r.notes_client,
    filigrane: resoudreFiligrane({
      typeDocument: r.type_document,
      statut: r.statut,
      fige: brouillon ? undefined : r.filigrane,
      document: brouillon && r.filigrane_document ? r.filigrane_document : undefined,
      entreprise: brouillon ? (r.filigranes_entreprise ?? null) : null,
      estDuplicata: duplicata,
    }),
    duplicata: duplicata && r.numero ? { numeroOriginal: r.numero, dateEmissionOriginal: r.date_emission } : null,
    nomProduit: o.nomProduit,
  };
}
