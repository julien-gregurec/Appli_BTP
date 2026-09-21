import type { ConseilFiche } from "../types";
import { calerUnDormantSansLeDeformer } from "./caler-un-dormant-sans-le-deformer";
import { calerUnVitrageDansSonChassis } from "./caler-un-vitrage-dans-son-chassis";
import { choisirUneChevilleSelonLeSupport } from "./choisir-une-cheville-selon-le-support";
import { couperEtAssemblerDesProfilsAluminium } from "./couper-et-assembler-des-profils-aluminium";
import { diagnostiquerUneFissureSurBandeDeJoint } from "./diagnostiquer-une-fissure-sur-bande-de-joint";
import { diagnostiquerUnePorteQuiFrotte } from "./diagnostiquer-une-porte-qui-frotte";
import { diviserUneLongueurEnEntraxesReguliers } from "./diviser-une-longueur-en-entraxes-reguliers";
import { diviserUnCercleEnPartsEgales } from "./diviser-un-cercle-en-parts-egales";
import { entretenirUneMenuiserieAluminiumEtSonVitrage } from "./entretenir-une-menuiserie-aluminium-et-son-vitrage";
import { estimerLePoidsEtManutentionnerUnVitrage } from "./estimer-le-poids-et-manutentionner-un-vitrage";
import { fixerUneChargeEnCloisonDePlaques } from "./fixer-une-charge-en-cloison-de-plaques";
import { implanterUneCloisonEnPlaquesDePlatre } from "./implanter-une-cloison-en-plaques-de-platre";
import { manutentionnerUneChargeLourdeADeux } from "./manutentionner-une-charge-lourde-a-deux";
import { poncerUnEnduitSansMarquerLaPlaque } from "./poncer-un-enduit-sans-marquer-la-plaque";
import { poserUnBlocPorteInterieurEnCloison } from "./poser-un-bloc-porte-interieur-en-cloison";
import { prendreLesCotesDUnVitrageEnFeuillure } from "./prendre-les-cotes-d-un-vitrage-en-feuillure";
import { prendreLesCotesDUneBaieAvantCommande } from "./prendre-les-cotes-d-une-baie-avant-commande";
import { realiserUnJointSiliconeNet } from "./realiser-un-joint-silicone-net";
import { reglerLesJeuxDUnePorteInterieure } from "./regler-les-jeux-d-une-porte-interieure";
import { reporterUnTraceDuSolVersLePlafond } from "./reporter-un-trace-du-sol-vers-le-plafond";
import { reporterUnTraitDeNiveauDeReference } from "./reporter-un-trait-de-niveau-de-reference";
import { tracerUnArcPleinCintre } from "./tracer-un-arc-plein-cintre";
import { tracerUnCercleSansCompas } from "./tracer-un-cercle-sans-compas";
import { tracerUneEllipseParLesFoyers } from "./tracer-une-ellipse-par-les-foyers";
import { tracerUneEtoileACinqBranches } from "./tracer-une-etoile-a-cinq-branches";
import { tracerUneOgiveEquilaterale } from "./tracer-une-ogive-equilaterale";
import { traiterLEtancheiteALAirDUneTraversee } from "./traiter-l-etancheite-a-l-air-d-une-traversee";
import { traiterLaJonctionCloisonPlafond } from "./traiter-la-jonction-cloison-plafond";
import { trouverLeCentreDUnRectangle } from "./trouver-le-centre-d-un-rectangle";
import { verifierUnAngleDroitAu345 } from "./verifier-un-angle-droit-au-3-4-5";

/**
 * Contenu versionné localement — 30 fiches ELSATIA originales.
 *
 * Ajouter une fiche = créer son fichier ici, l'importer ci-dessus et l'ajouter au tableau.
 * L'ordre de ce tableau n'a pas d'importance : `registry.ts` trie par titre (locale FR).
 * `validateConseilRegistry` refuse tout id/slug dupliqué, toute catégorie inconnue et tout
 * `relatedTraceIds` hors du registre des 13 modèles réels.
 */
export const CONSEIL_FICHES_SOURCE: readonly ConseilFiche[] = [
  calerUnDormantSansLeDeformer,
  calerUnVitrageDansSonChassis,
  choisirUneChevilleSelonLeSupport,
  couperEtAssemblerDesProfilsAluminium,
  diagnostiquerUneFissureSurBandeDeJoint,
  diagnostiquerUnePorteQuiFrotte,
  diviserUneLongueurEnEntraxesReguliers,
  diviserUnCercleEnPartsEgales,
  entretenirUneMenuiserieAluminiumEtSonVitrage,
  estimerLePoidsEtManutentionnerUnVitrage,
  fixerUneChargeEnCloisonDePlaques,
  implanterUneCloisonEnPlaquesDePlatre,
  manutentionnerUneChargeLourdeADeux,
  poncerUnEnduitSansMarquerLaPlaque,
  poserUnBlocPorteInterieurEnCloison,
  prendreLesCotesDUnVitrageEnFeuillure,
  prendreLesCotesDUneBaieAvantCommande,
  realiserUnJointSiliconeNet,
  reglerLesJeuxDUnePorteInterieure,
  reporterUnTraceDuSolVersLePlafond,
  reporterUnTraitDeNiveauDeReference,
  tracerUnArcPleinCintre,
  tracerUnCercleSansCompas,
  tracerUneEllipseParLesFoyers,
  tracerUneEtoileACinqBranches,
  tracerUneOgiveEquilaterale,
  traiterLEtancheiteALAirDUneTraversee,
  traiterLaJonctionCloisonPlafond,
  trouverLeCentreDUnRectangle,
  verifierUnAngleDroitAu345,
];
