/**
 * WORKSHOP-UI-CANONICAL-V2 §6/§13 — état du parcours « photo → tracé libre », isolé du rendu.
 *
 * Module PUR : aucun React, aucun DOM, aucune image. Il ne décode rien, ne détecte rien, ne
 * calibre rien — tout cela appartient à `lib/tracing/` et n'est pas dupliqué ici. Ce module
 * répond à une seule question, celle que l'écran doit poser en permanence : **où en est-on, et
 * qu'est-ce qui est encore interdit ?**
 *
 * La raison d'être de cette séparation est la même que partout ailleurs dans l'Atelier : le
 * parcours photo comporte des refus (échelle non définie, contour non confirmé, projet
 * paramétrique) que l'interface doit annoncer AVANT de laisser l'artisan travailler pour rien.
 * Ces refus sont testables sans monter de composant, donc ils le sont.
 */

import type { PerspectiveQuad } from "../../../lib/tracing/perspective";
import type { ReliabilityNotice } from "../../../lib/tracing/reliability";
import { isCalibrated } from "../../../lib/tracing/reference-image";
import type { TracingProject, TracingReferenceImage } from "../../../lib/tracing/project";
import type { RawContour } from "../../../lib/tracing/vectorization";

export type PhotoPoint = { x: number; y: number };

/** Ce que le prochain clic sur l'image doit produire. `none` : l'image n'attend rien. */
export type PhotoPicking = "none" | "calibration" | "control" | "quad";

/** Nombre de points attendus par mode de saisie — au-delà, le clic est ignoré. */
export const PICKING_TARGET: Readonly<Record<PhotoPicking, number>> = {
  none: 0,
  calibration: 2,
  control: 2,
  quad: 4,
};

export type PhotoStepId = "import" | "calibration" | "perspective" | "contour" | "confirmation";
export type PhotoStepStatus = "done" | "current" | "locked";

export type PhotoStep = {
  id: PhotoStepId;
  label: string;
  status: PhotoStepStatus;
  /** Pourquoi cette étape est verrouillée, ou ce qu'elle a produit. Jamais vide. */
  detail: string;
};

export type PhotoWorkflowInput = {
  image: TracingReferenceImage | null;
  contour: RawContour | null;
  /** Le contour a-t-il déjà été versé dans le tracé libre du projet ? */
  confirmed: boolean;
};

/**
 * Parcours affiché sous l'image. Chaque étape dit ce qu'elle attend, et une étape verrouillée
 * dit POURQUOI — un pas-à-pas qui se contente de griser ses boutons oblige l'artisan à deviner.
 *
 * Le redressement est déclaré facultatif et n'entre jamais dans le chemin critique : le canon
 * refuse un redressement depuis une seule cote, et une photo prise de face n'en a pas besoin.
 */
export function photoSteps({ image, contour, confirmed }: PhotoWorkflowInput): readonly PhotoStep[] {
  const imported = image !== null;
  // `isCalibrated` est le garde de type du canon : il fait passer `CalibrationState` à
  // `CalibrationResult`, seule forme qui porte `mmPerPixel` et `check`. On garde la référence
  // affinée plutôt que de la retester, sans quoi TypeScript la reperd à chaque accès.
  const calibration = image && isCalibrated(image.calibration) ? image.calibration : null;
  const traced = contour !== null;

  return [
    {
      id: "import",
      label: "Image de référence",
      status: imported ? "done" : "current",
      detail: imported
        ? `${image.name} — ${image.widthPx} × ${image.heightPx} px de travail`
        : "Choisissez une photo JPEG, PNG ou WEBP. Elle reste sur cet appareil.",
    },
    {
      id: "calibration",
      label: "Calibration",
      status: calibration ? "done" : imported ? "current" : "locked",
      detail: !imported
        ? "Importez d’abord une image."
        : calibration
          ? `Échelle : ${round(calibration.mmPerPixel, 4)} mm par pixel${
              calibration.check ? ` — contrôle ${calibration.check.quality}` : " — non contrôlée"
            }`
          : "Cliquez deux points sur une distance que vous connaissez, puis saisissez cette distance.",
    },
    {
      id: "perspective",
      label: "Perspective (facultatif)",
      status: calibration ? "current" : "locked",
      detail: calibration
        ? "Désignez les quatre coins d’un rectangle réel pour mesurer l’inclinaison de la photo."
        : "Calibrez d’abord l’échelle.",
    },
    {
      id: "contour",
      label: "Contour",
      status: traced ? "done" : calibration ? "current" : "locked",
      detail: !calibration
        ? "Calibrez d’abord l’échelle : sans elle, un contour n’a aucune dimension."
        : traced
          ? `${contour.points.length} points — ${contour.source === "detected" ? "détecté" : "tracé à la main"}, ${contour.status === "confirmed" ? "confirmé" : "proposition"}`
          : "Lancez la détection automatique, ou cliquez le contour point par point.",
    },
    {
      id: "confirmation",
      label: "Versement dans le tracé",
      status: confirmed ? "done" : traced ? "current" : "locked",
      detail: confirmed
        ? "Le relevé est devenu un tracé libre ordinaire : il s’édite, s’annule et s’exporte comme le reste."
        : traced
          ? "Vérifiez les réserves ci-dessous, puis versez le relevé dans le tracé libre."
          : "Obtenez d’abord un contour.",
    },
  ];
}

/**
 * Ce qui EMPÊCHE de verser le relevé dans le projet, en clair. Liste vide = versement possible.
 *
 * Les trois refus viennent du canon, pas d'une règle d'interface : `confirmVectorizationIntoProject`
 * lève sur un projet paramétrique, `contourToGeometricShape` lève sans calibration, et
 * `hasBlockingNotice` porte les réserves de niveau « erreur ». Les annoncer ici évite de laisser
 * l'artisan faire tout le relevé avant de découvrir que son projet ne peut pas l'accueillir.
 */
export function confirmBlockers(
  project: Pick<TracingProject, "modelId">,
  image: TracingReferenceImage | null,
  contour: RawContour | null,
  notices: readonly ReliabilityNotice[],
): readonly string[] {
  const blockers: string[] = [];
  if (project.modelId) {
    blockers.push(
      "Ce tracé suit un modèle paramétrique : il ne peut pas recevoir de tracé libre. Créez un tracé « dessin libre » pour y verser le relevé photo.",
    );
  }
  if (!contour) blockers.push("Aucun contour relevé.");
  if (!image || !isCalibrated(image.calibration)) {
    blockers.push("Échelle non définie : un contour en pixels ne peut pas devenir une géométrie en millimètres.");
  }
  for (const notice of notices) {
    if (notice.level === "erreur") blockers.push(`${notice.title} — ${notice.detail}`);
  }
  return blockers;
}

/**
 * Quadrilatère de perspective à partir des quatre points cliqués, dans l'ordre de saisie
 * (haut-gauche, haut-droit, bas-droit, bas-gauche). `null` tant que les quatre ne sont pas
 * posés — on ne devine pas un coin manquant.
 */
export function quadOf(points: readonly PhotoPoint[]): PerspectiveQuad | null {
  if (points.length < 4) return null;
  const [a, b, c, d] = points;
  return { a, b, c, d };
}

/**
 * Distance réelle saisie au clavier. Accepte la virgule décimale — c'est ce qu'un clavier
 * français produit — et refuse tout le reste plutôt que de retenir un `NaN` qui contaminerait
 * la calibration.
 */
export function parseRealDistance(text: string): number | null {
  const parsed = Number(text.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Ajoute un point cliqué, en s'arrêtant net au nombre attendu par le mode de saisie. */
export function addPickedPoint(
  points: readonly PhotoPoint[],
  point: PhotoPoint,
  picking: PhotoPicking,
): readonly PhotoPoint[] {
  const target = PICKING_TARGET[picking];
  if (target === 0 || points.length >= target) return points;
  return [...points, point];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
