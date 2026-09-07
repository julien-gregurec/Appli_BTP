/**
 * Validation des cinq contrats d'export versionnés.
 *
 * L'enjeu n'est pas de re-typer ce que TypeScript sait déjà : c'est de vérifier, **au moment
 * où un contrat franchit la frontière**, deux choses que le typage ne garantit pas côté
 * consommateur :
 *
 * 1. l'enveloppe est bien celle annoncée (`contract` et `contract_version` cohérents) ;
 * 2. aucune valeur numérique publiée n'a perdu son bloc de provenance en route.
 */

import { estIsoDateTime } from "../common";
import { estUuid } from "../ids";
import { MEASUREMENT_ORIGINS } from "../provenance";
import { MEASUREMENT_QUALITY_LEVELS } from "../quality";
import type {
  DroneInspectionExportV1,
  DroneMeasurementExportV1,
  DroneProjectSummaryV1,
  DroneRoofExportV1,
  DroneSolarExportV1,
} from "../exports";
import type { DroneContractName } from "../exports";
import type { ValidationResult } from "./core";
import { CollecteurAnomalies, echec, estObjet, succes } from "./core";

function validerEnveloppe(
  collecteur: CollecteurAnomalies,
  entree: Record<string, unknown>,
  contrat: DroneContractName,
): void {
  if (entree.contract !== contrat) {
    collecteur.ajouter(collecteur.chemin("contract"), `contrat « ${contrat} » attendu`);
  }
  if (entree.contract_version !== 1) {
    collecteur.ajouter(collecteur.chemin("contract_version"), "version 1 attendue");
  }
  if (!estIsoDateTime(entree.generated_at)) {
    collecteur.ajouter(collecteur.chemin("generated_at"), "horodatage ISO 8601 UTC attendu");
  }
  if (!estUuid(entree.project_id)) {
    collecteur.ajouter(collecteur.chemin("project_id"), "UUID de projet attendu");
  }
  collecteur.exigerPresence(entree, "reconstruction_version");
}

/**
 * §84 — une valeur exportée sans provenance est une valeur que le consommateur présentera
 * comme certaine. Ce contrôle est le dernier filet avant la frontière.
 */
function validerProvenance(
  collecteur: CollecteurAnomalies,
  parent: Record<string, unknown>,
  chemin: string,
): void {
  const provenance = parent.provenance;
  if (!estObjet(provenance)) {
    collecteur.ajouter(`${chemin}.provenance`, "bloc de provenance obligatoire");
    return;
  }

  if (typeof provenance.origin !== "string" || !MEASUREMENT_ORIGINS.includes(provenance.origin as never)) {
    collecteur.ajouter(`${chemin}.provenance.origin`, "origine de mesure attendue");
  }
  if (
    typeof provenance.quality_level !== "string" ||
    !MEASUREMENT_QUALITY_LEVELS.includes(provenance.quality_level as never)
  ) {
    collecteur.ajouter(`${chemin}.provenance.quality_level`, "niveau de qualité attendu");
  }
  if (typeof provenance.trusted !== "boolean") {
    collecteur.ajouter(`${chemin}.provenance.trusted`, "booléen attendu");
  }
  if (typeof provenance.degraded_source !== "boolean") {
    collecteur.ajouter(`${chemin}.provenance.degraded_source`, "booléen attendu");
  }
  if (typeof provenance.warning !== "string") {
    collecteur.ajouter(`${chemin}.provenance.warning`, "mention attendue, chaîne vide si aucune");
  }

  const valeur = provenance.uncertainty_value;
  const unite = provenance.uncertainty_unit;
  if ((valeur === null) !== (unite === null)) {
    collecteur.ajouter(
      `${chemin}.provenance.uncertainty_value`,
      "incertitude incomplète : valeur et unité vont ensemble, ou sont toutes deux nulles",
    );
  }
}

function preparer(entree: unknown): {
  collecteur: CollecteurAnomalies;
  objet: Record<string, unknown> | null;
} {
  const collecteur = new CollecteurAnomalies();
  if (!estObjet(entree)) {
    collecteur.ajouter("$", "objet attendu");
    return { collecteur, objet: null };
  }
  return { collecteur, objet: entree };
}

export function validateDroneProjectSummaryV1(
  entree: unknown,
): ValidationResult<DroneProjectSummaryV1> {
  const { collecteur, objet } = preparer(entree);
  if (!objet) return echec(collecteur.issues);

  validerEnveloppe(collecteur, objet, "drone.project_summary");
  collecteur.exigerChaine(objet, "project_name");

  const quantites = collecteur.exigerTableau(objet, "quantities");
  quantites?.forEach((quantite, index) => {
    const chemin = `$.quantities[${index}]`;
    if (!estObjet(quantite)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    if (typeof quantite.value !== "number" || !Number.isFinite(quantite.value)) {
      collecteur.ajouter(`${chemin}.value`, "nombre fini attendu");
    }
    if (typeof quantite.unit !== "string") {
      collecteur.ajouter(`${chemin}.unit`, "unité attendue");
    }
    validerProvenance(collecteur, quantite, chemin);
  });

  collecteur.exigerTableau(objet, "findings_summary");
  collecteur.exigerNombre(objet, "findings_total");

  return collecteur.valide
    ? succes(objet as unknown as DroneProjectSummaryV1)
    : echec(collecteur.issues);
}

export function validateDroneRoofExportV1(entree: unknown): ValidationResult<DroneRoofExportV1> {
  const { collecteur, objet } = preparer(entree);
  if (!objet) return echec(collecteur.issues);

  validerEnveloppe(collecteur, objet, "drone.roof");
  validerProvenance(collecteur, objet, "$");
  collecteur.exigerNombre(objet, "total_area_m2");
  collecteur.exigerBooleen(objet, "fully_validated");
  collecteur.exigerObjet(objet, "reference_frame");

  const pans = collecteur.exigerTableau(objet, "planes");
  pans?.forEach((pan, index) => {
    const chemin = `$.planes[${index}]`;
    if (!estObjet(pan)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    for (const cle of ["area_m2", "slope_deg", "slope_percent", "azimuth_deg"]) {
      if (typeof pan[cle] !== "number" || !Number.isFinite(pan[cle])) {
        collecteur.ajouter(`${chemin}.${cle}`, "nombre fini attendu");
      }
    }
    const azimut = pan.azimuth_deg;
    if (typeof azimut === "number" && (azimut < 0 || azimut >= 360)) {
      collecteur.ajouter(`${chemin}.azimuth_deg`, "azimut attendu dans [0, 360)");
    }
    validerProvenance(collecteur, pan, chemin);
  });

  collecteur.exigerTableau(objet, "edges");
  collecteur.exigerTableau(objet, "obstacles");

  return collecteur.valide
    ? succes(objet as unknown as DroneRoofExportV1)
    : echec(collecteur.issues);
}

export function validateDroneMeasurementExportV1(
  entree: unknown,
): ValidationResult<DroneMeasurementExportV1> {
  const { collecteur, objet } = preparer(entree);
  if (!objet) return echec(collecteur.issues);

  validerEnveloppe(collecteur, objet, "drone.measurements");

  const mesures = collecteur.exigerTableau(objet, "measurements");
  mesures?.forEach((mesure, index) => {
    const chemin = `$.measurements[${index}]`;
    if (!estObjet(mesure)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    if (typeof mesure.value !== "number" || !Number.isFinite(mesure.value)) {
      collecteur.ajouter(`${chemin}.value`, "nombre fini attendu");
    }
    if (typeof mesure.nature_label !== "string") {
      collecteur.ajouter(`${chemin}.nature_label`, "mention MESURÉ / CALCULÉ / ESTIMÉ attendue");
    }
    if (!estIsoDateTime(mesure.created_at)) {
      collecteur.ajouter(`${chemin}.created_at`, "horodatage ISO 8601 UTC attendu");
    }
    validerProvenance(collecteur, mesure, chemin);
  });

  return collecteur.valide
    ? succes(objet as unknown as DroneMeasurementExportV1)
    : echec(collecteur.issues);
}

export function validateDroneInspectionExportV1(
  entree: unknown,
): ValidationResult<DroneInspectionExportV1> {
  const { collecteur, objet } = preparer(entree);
  if (!objet) return echec(collecteur.issues);

  validerEnveloppe(collecteur, objet, "drone.inspection");

  const constats = collecteur.exigerTableau(objet, "findings");
  constats?.forEach((constat, index) => {
    const chemin = `$.findings[${index}]`;
    if (!estObjet(constat)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    if (typeof constat.title !== "string" || constat.title.length === 0) {
      collecteur.ajouter(`${chemin}.title`, "intitulé attendu");
    }
    if (!estIsoDateTime(constat.created_at)) {
      collecteur.ajouter(`${chemin}.created_at`, "horodatage ISO 8601 UTC attendu");
    }
  });

  const brouillons = collecteur.exigerTableau(objet, "reserve_drafts");
  brouillons?.forEach((brouillon, index) => {
    const chemin = `$.reserve_drafts[${index}]`;
    if (!estObjet(brouillon)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    // §118 — un brouillon ne porte aucun statut de workflow : la validation reste chez Réserves.
    if (Object.prototype.hasOwnProperty.call(brouillon, "status")) {
      collecteur.ajouter(
        `${chemin}.status`,
        "un brouillon de réserve ne porte pas de statut : le workflow appartient à Réserves",
      );
    }
  });

  return collecteur.valide
    ? succes(objet as unknown as DroneInspectionExportV1)
    : echec(collecteur.issues);
}

export function validateDroneSolarExportV1(entree: unknown): ValidationResult<DroneSolarExportV1> {
  const { collecteur, objet } = preparer(entree);
  if (!objet) return echec(collecteur.issues);

  validerEnveloppe(collecteur, objet, "drone.solar");

  if (objet.shading_model !== "none") {
    // §31 — l'ombrage est hors périmètre. Annoncer un autre modèle serait promettre un calcul
    // que le produit ne fait pas.
    collecteur.ajouter(collecteur.chemin("shading_model"), "seul « none » est publiable en V1");
  }

  const variantes = collecteur.exigerTableau(objet, "variants");
  variantes?.forEach((variante, index) => {
    const chemin = `$.variants[${index}]`;
    if (!estObjet(variante)) {
      collecteur.ajouter(chemin, "objet attendu");
      return;
    }
    for (const cle of ["panel_count", "total_peak_power_w", "used_area_m2", "plane_area_m2"]) {
      if (typeof variante[cle] !== "number" || !Number.isFinite(variante[cle])) {
        collecteur.ajouter(`${chemin}.${cle}`, "nombre fini attendu");
      }
    }
    const utilisee = variante.used_area_m2;
    const pan = variante.plane_area_m2;
    if (typeof utilisee === "number" && typeof pan === "number" && utilisee > pan) {
      collecteur.ajouter(
        `${chemin}.used_area_m2`,
        "surface utilisée supérieure à la surface du pan",
      );
    }
    validerProvenance(collecteur, variante, chemin);
  });

  collecteur.exigerTableau(objet, "declared_regulatory_setbacks");

  return collecteur.valide
    ? succes(objet as unknown as DroneSolarExportV1)
    : echec(collecteur.issues);
}
