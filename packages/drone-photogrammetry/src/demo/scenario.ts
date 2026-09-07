/**
 * Démonstration de bout en bout sans GPU (§23 du brief prototype).
 *
 * Téléversement par morceaux → validation de sécurité → lecture EXIF →
 * contrôle qualité → file (clé d'idempotence calculée par le noyau) → moteur de
 * démonstration → artefacts référencés → estimation de coût. Tout est
 * déterministe : ni réseau, ni horloge réelle, ni matériel.
 */

import {
  asDroneProjectId,
  asEntrepriseId,
  asMediaAssetId,
  asReconstructionJobId,
  type MediaAssetId,
  type ReconstructionArtifacts,
  type ReconstructionParameters,
  type StorageObjectRef,
} from "@elsatia/drone-core";

import {
  ecrireParametres,
  estTerminal,
  PARAMETRES_PROTOTYPE_DEFAUT,
  type ParametresPrototype,
} from "../moteur/base";
import { creerMoteurDemo, type OptionsMoteurDemo } from "../moteur/demo";
import { creerFileReconstruction, type TravailFile } from "../file/file-locale";
import { calculerSha256 } from "../ingestion/empreinte";
import { lireExifJpeg } from "../ingestion/exif";
import { controlerQualite, type MediaAnalyse, type RapportQualite } from "../ingestion/qualite";
import { creerEcrivainMemoire, creerGestionnaireTeleversement } from "../ingestion/televersement";
import { construireRefMedia, validerMediaImporte } from "../securite/entrees";
import { verifierCompletude, type ChampArtefact } from "../sortie/normalisation";
import {
  estimerCout,
  TARIFS_NON_RELEVES,
  type EstimationCout,
  type TarifsInfrastructure,
} from "../couts/estimation";
import { construireJeuDemo, type OptionsJeuDemo } from "./fixtures";

/** Identifiants de démonstration : des UUID, comme partout dans le noyau. */
export const ENTREPRISE_DEMO = "11111111-1111-4111-8111-111111111111";
export const PROJET_DEMO = "22222222-2222-4222-8222-222222222222";
export const TRAVAIL_DEMO = "33333333-3333-4333-8333-333333333333";

function uuidMedia(index: number): string {
  return `44444444-4444-4444-8444-${index.toString().padStart(12, "0")}`;
}

export type MediaImporte = {
  mediaId: MediaAssetId;
  ref: StorageObjectRef;
  nomAffichage: string;
  mime: string;
  octets: number;
  sha256: string;
};

export type OptionsDemo = {
  jeu?: OptionsJeuDemo;
  parametres?: ParametresPrototype;
  moteur?: OptionsMoteurDemo;
  /** Tarifs réels si l'on veut une estimation. Sans eux, `cout` reste `null`. */
  tarifs?: TarifsInfrastructure;
  tailleBloc?: number;
};

export type RapportDemo = {
  medias: MediaImporte[];
  qualite: RapportQualite;
  parametres: ReconstructionParameters;
  travail: TravailFile;
  artefacts: ReconstructionArtifacts | null;
  manquesArtefacts: ChampArtefact[];
  cout: EstimationCout | null;
  /** Ce que la démonstration ne prouve pas. Toujours renseigné : c'est l'essentiel. */
  avertissements: string[];
};

export async function executerScenarioDemo(options: OptionsDemo = {}): Promise<RapportDemo> {
  const entrepriseId = asEntrepriseId(ENTREPRISE_DEMO);
  const projetId = asDroneProjectId(PROJET_DEMO);
  const jobId = asReconstructionJobId(TRAVAIL_DEMO);
  const parametres = options.parametres ?? PARAMETRES_PROTOTYPE_DEFAUT;
  const tailleBloc = options.tailleBloc ?? 512;

  const ecrivain = creerEcrivainMemoire();
  const televersements = creerGestionnaireTeleversement(ecrivain);
  const jeu = construireJeuDemo(options.jeu ?? { nombre: 12, indexSansExif: 3, indexDoublon: 7 });

  const medias: MediaImporte[] = [];
  const analyses: MediaAnalyse[] = [];

  for (const [index, media] of jeu.entries()) {
    const mediaId = asMediaAssetId(uuidMedia(index + 1));
    const valide = validerMediaImporte({
      contenu: media.contenu,
      mimeDeclare: null,
      nomFichier: media.nomFichier,
    });
    const ref = construireRefMedia({ entrepriseId, projetId, mediaId, type: valide.type });

    // Téléversement par morceaux, avec vérification d'empreinte à la clôture.
    televersements.ouvrir({
      sessionId: mediaId,
      ref,
      tailleTotale: media.contenu.length,
      tailleBloc,
      sha256Attendu: calculerSha256(media.contenu),
    });
    for (let offset = 0; offset < media.contenu.length; offset += tailleBloc) {
      await televersements.televerserBloc(
        mediaId,
        offset,
        media.contenu.subarray(offset, Math.min(offset + tailleBloc, media.contenu.length)),
      );
    }
    const televerse = await televersements.terminer(mediaId);

    medias.push({
      mediaId,
      ref: televerse.ref,
      nomAffichage: valide.nomAffichage,
      mime: valide.type,
      octets: televerse.octets,
      sha256: televerse.sha256,
    });
    analyses.push({
      mediaId,
      sha256: televerse.sha256,
      octets: televerse.octets,
      type: valide.type,
      exif: lireExifJpeg(media.contenu),
      nettete: null,
    });
  }

  const qualite = controlerQualite(analyses);
  const rejetes = new Set(
    qualite.medias.filter((media) => media.verdict === "rejete").map((media) => media.mediaId),
  );
  const retenus = medias.filter((media) => !rejetes.has(media.mediaId));

  const moteur = creerMoteurDemo(options.moteur);
  const file = creerFileReconstruction({ moteur });
  const parametresJson = ecrireParametres(parametres);

  await file.soumettre({
    jobId,
    entrepriseId,
    projetId,
    inputSet: retenus.map((media) => media.mediaId),
    // URL signées simulées : le moteur ne reçoit jamais un chemin de stockage brut.
    inputUrls: retenus.map((media) => `https://stockage.test/${media.ref.path}?signature=demo`),
    parameters: parametresJson,
  });

  // Boucle de pilotage : elle relance les tentatives d'un échec réessayable
  // jusqu'à la lettre morte, exactement comme le ferait un ordonnanceur.
  let travail = file.lire(jobId);
  for (let iteration = 0; iteration < 60 && !estTerminal(travail.statut); iteration += 1) {
    if (travail.statut === "queued") {
      await file.demarrerProchain();
      travail = file.lire(jobId);
      continue;
    }
    if (travail.handle !== null) moteur.avancer(travail.handle.engine_job_id);
    travail = await file.rafraichir(jobId);
  }

  const artefacts = travail.outcome?.artifacts ?? null;
  const manquesArtefacts = artefacts === null ? [] : verifierCompletude(artefacts, parametres);

  let cout: EstimationCout | null = null;
  const tarifs = options.tarifs ?? TARIFS_NON_RELEVES;
  if (travail.outcome !== null && tarifs.gpuCentimesParHeure !== null) {
    const entreeGo = medias.reduce((somme, media) => somme + media.octets, 0) / 1024 ** 3;
    cout = estimerCout(
      {
        runtimeS: travail.outcome.duration_s,
        stockageGo: entreeGo,
        retentionMois: 12,
        egressGo: entreeGo,
      },
      tarifs,
    );
  }

  return {
    medias,
    qualite,
    parametres: parametresJson,
    travail,
    artefacts,
    manquesArtefacts,
    cout,
    avertissements: [
      "Moteur de démonstration : aucune reconstruction réelle, aucune mesure de qualité géométrique.",
      "Aucune mesure de performance exploitable — benchmarks non exécutés (§12).",
      cout === null
        ? "Coût non estimé : aucun tarif relevé (aucun serveur GPU créé, §14/§15)."
        : "Coût estimé à partir de tarifs fournis par l'appelant, à reconfirmer auprès du fournisseur.",
    ],
  };
}
