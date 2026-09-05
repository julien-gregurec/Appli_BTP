import type { ConseilFiche } from "../types";
import { diviserLongueurEntraxesReguliers } from "./diviser-longueur-entraxes-reguliers";
import { trouverCentreRectangle } from "./trouver-centre-rectangle";
import { verifierAngleDroit345 } from "./verifier-angle-droit-3-4-5";

/**
 * Contenu versionné localement. V1 : 3 fiches de démonstration ELSATIA originales.
 * Ajouter une fiche = créer son fichier ici puis l'ajouter à ce tableau.
 */
export const CONSEIL_FICHES_SOURCE: readonly ConseilFiche[] = [
  verifierAngleDroit345,
  trouverCentreRectangle,
  diviserLongueurEntraxesReguliers,
];
