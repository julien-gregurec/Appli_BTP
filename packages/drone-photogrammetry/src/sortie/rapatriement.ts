/**
 * Rapatriement des artefacts moteur vers le stockage ELSATIA.
 *
 * Le noyau exige des **références de stockage** (bucket + chemin), pas des URL
 * de moteur : une URL NodeODM ne survit pas à l'arrêt de la machine, et la
 * persister reviendrait à publier des médias de chantier. Ce module fait donc
 * le seul travail qui manque entre les deux : télécharger, vérifier, écrire,
 * empreindre.
 *
 * Le téléchargement et l'écriture sont des ports : aucun bucket Production
 * n'est requis pour exécuter ce code.
 */

import type { ReconstructionArtifacts, StorageObjectRef } from "@elsatia/drone-core";

import { calculerSha256 } from "../ingestion/empreinte";
import { cheminEcriture, type EcrivainBlocs } from "../ingestion/televersement";
import {
  composerArtefacts,
  deduireChampArtefact,
  detecterFormat,
  type AssetMoteur,
  type ChampArtefact,
  type FormatArtefact,
} from "./normalisation";

/** Retourne `null` quand le moteur n'a pas produit ce fichier (404) : ce n'est pas une erreur. */
export type Telechargeur = (url: string) => Promise<Uint8Array | null>;

/** Où ranger un artefact donné. Fournie par l'appelant : le prototype n'invente aucun bucket. */
export type DestinationArtefact = (asset: {
  nom: string;
  champ: ChampArtefact;
  format: FormatArtefact;
}) => StorageObjectRef;

export type ArtefactRapatrie = {
  nom: string;
  champ: ChampArtefact;
  format: FormatArtefact;
  ref: StorageObjectRef;
  octets: number;
  sha256: string;
};

export type DemandeRapatriement = {
  assets: readonly AssetMoteur[];
  telechargeur: Telechargeur;
  ecrivain: EcrivainBlocs;
  destination: DestinationArtefact;
};

export type ResultatRapatriement = {
  artefacts: ReconstructionArtifacts;
  /** Détail par fichier : format réel, taille, empreinte. Trace de ce qui a été écrit. */
  manifeste: ArtefactRapatrie[];
  /** Fichiers moteur ignorés faute d'emplacement correspondant dans le noyau. */
  ignores: string[];
  /** Fichiers attendus que le moteur n'a pas produits. */
  absents: string[];
};

/**
 * Télécharge les fichiers du moteur, confirme leur format par leurs octets, les
 * écrit dans le stockage et retourne les références.
 */
export async function rapatrierArtefacts(
  demande: DemandeRapatriement,
): Promise<ResultatRapatriement> {
  const manifeste: ArtefactRapatrie[] = [];
  const ignores: string[] = [];
  const absents: string[] = [];

  for (const asset of demande.assets) {
    const champ = deduireChampArtefact(asset.nom);
    if (champ === null) {
      ignores.push(asset.nom);
      continue;
    }
    const contenu = await demande.telechargeur(asset.url);
    if (contenu === null) {
      absents.push(asset.nom);
      continue;
    }
    // Le format est confirmé par les octets reçus, pas par le nom annoncé.
    const format = detecterFormat(asset.nom, contenu.subarray(0, 8));
    const ref = demande.destination({ nom: asset.nom, champ, format });
    await demande.ecrivain.ecrire(cheminEcriture(ref), 0, contenu);
    manifeste.push({
      nom: asset.nom,
      champ,
      format,
      ref,
      octets: contenu.length,
      sha256: calculerSha256(contenu),
    });
  }

  return {
    artefacts: composerArtefacts(manifeste.map(({ champ, ref }) => ({ champ, ref }))),
    manifeste,
    ignores,
    absents,
  };
}
