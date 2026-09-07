/**
 * Validateurs runtime des entités dont les invariants ne se laissent pas exprimer par le
 * système de types : cohérence unité / grandeur, incertitude complète ou absente, propagation
 * de la source dégradée, préfixe locataire d'un chemin de stockage, jeu d'entrée non vide.
 *
 * Le périmètre est délibérément celui des entités **qui traversent une frontière** — import
 * de médias, soumission de travail, mesure publiée. Les entités purement internes sont
 * couvertes par le typage statique, et les redoubler ici n'ajouterait que du code à maintenir.
 */

import { estIsoDateTime } from "../common";
import { estUuid } from "../ids";
import type { MediaAsset } from "../media";
import { estSha256, estSourceDegradee, MEDIA_KINDS, MEDIA_SOURCES } from "../media";
import type { Measurement } from "../measurement";
import {
  MEASUREMENT_KINDS,
  MEASUREMENT_METHODS,
  MEASUREMENT_NATURES,
  MEASUREMENT_SOURCES,
  UNITE_PAR_GRANDEUR,
} from "../measurement";
import { MEASUREMENT_ORIGINS } from "../provenance";
import { MEASUREMENT_QUALITY_LEVELS } from "../quality";
import type { ReconstructionJob } from "../reconstruction";
import { RECONSTRUCTION_ENGINES, RECONSTRUCTION_STATUSES } from "../reconstruction";
import { estDroneBucket } from "../storage-ref";
import { MEASUREMENT_UNITS } from "../units";
import type { ValidationResult } from "./core";
import { CollecteurAnomalies, echec, estObjet, succes } from "./core";

function exigerUuid(
  collecteur: CollecteurAnomalies,
  source: Record<string, unknown>,
  cle: string,
): string | null {
  const valeur = source[cle];
  if (!estUuid(valeur)) {
    collecteur.ajouter(collecteur.chemin(cle), "UUID attendu");
    return null;
  }
  return valeur;
}

function exigerIsoDateTime(
  collecteur: CollecteurAnomalies,
  source: Record<string, unknown>,
  cle: string,
): void {
  if (!estIsoDateTime(source[cle])) {
    collecteur.ajouter(collecteur.chemin(cle), "horodatage ISO 8601 UTC attendu");
  }
}

export function validateMediaAsset(entree: unknown): ValidationResult<MediaAsset> {
  const collecteur = new CollecteurAnomalies();

  if (!estObjet(entree)) {
    collecteur.ajouter("$", "objet attendu");
    return echec(collecteur.issues);
  }

  exigerUuid(collecteur, entree, "id");
  exigerUuid(collecteur, entree, "project_id");
  const entrepriseId = exigerUuid(collecteur, entree, "entreprise_id");

  const kind = collecteur.exigerEnum(entree, "kind", MEDIA_KINDS);
  const source = collecteur.exigerEnum(entree, "source", MEDIA_SOURCES);
  collecteur.exigerChaine(entree, "mime");

  const taille = collecteur.exigerNombre(entree, "size_bytes");
  if (taille !== null && taille <= 0) {
    collecteur.ajouter(collecteur.chemin("size_bytes"), "taille strictement positive attendue");
  }

  if (!estSha256(entree.sha256)) {
    collecteur.ajouter(collecteur.chemin("sha256"), "empreinte SHA-256 hexadécimale attendue");
  }

  const stockage = collecteur.exigerObjet(entree, "storage_ref");
  if (stockage) {
    if (!estDroneBucket(stockage.bucket)) {
      collecteur.ajouter(collecteur.chemin("storage_ref", "bucket"), "bucket Drone attendu");
    }
    const chemin = typeof stockage.path === "string" ? stockage.path : null;
    if (chemin === null) {
      collecteur.ajouter(collecteur.chemin("storage_ref", "path"), "chemin attendu");
    } else if (entrepriseId !== null && !chemin.startsWith(`${entrepriseId}/`)) {
      // Les policies `storage.objects` valident l'UUID du premier segment : un chemin qui ne
      // commence pas par l'entreprise serait refusé côté base, silencieusement, à l'écriture.
      collecteur.ajouter(
        collecteur.chemin("storage_ref", "path"),
        "le chemin doit commencer par l'entreprise_id",
      );
    }
  }

  const degrade = collecteur.exigerBooleen(entree, "degraded_source");
  if (degrade !== null && kind !== null && source !== null) {
    const attendu = estSourceDegradee(kind, source);
    if (attendu && !degrade) {
      collecteur.ajouter(
        collecteur.chemin("degraded_source"),
        "une frame extraite d'une vidéo est dégradée par construction (§77)",
      );
    }
  }

  const qualite = collecteur.exigerObjet(entree, "quality_flags");
  if (qualite) {
    if (typeof qualite.usable !== "boolean") {
      collecteur.ajouter(collecteur.chemin("quality_flags", "usable"), "booléen attendu");
    }
  }

  collecteur.exigerPresence(entree, "exif");
  exigerIsoDateTime(collecteur, entree, "created_at");
  exigerIsoDateTime(collecteur, entree, "updated_at");

  return collecteur.valide ? succes(entree as unknown as MediaAsset) : echec(collecteur.issues);
}

export function validateMeasurement(entree: unknown): ValidationResult<Measurement> {
  const collecteur = new CollecteurAnomalies();

  if (!estObjet(entree)) {
    collecteur.ajouter("$", "objet attendu");
    return echec(collecteur.issues);
  }

  exigerUuid(collecteur, entree, "id");
  exigerUuid(collecteur, entree, "project_id");
  exigerUuid(collecteur, entree, "entreprise_id");

  const kind = collecteur.exigerEnum(entree, "kind", MEASUREMENT_KINDS);
  const unit = collecteur.exigerEnum(entree, "unit", MEASUREMENT_UNITS);
  collecteur.exigerEnum(entree, "nature", MEASUREMENT_NATURES);
  collecteur.exigerEnum(entree, "source", MEASUREMENT_SOURCES);
  collecteur.exigerEnum(entree, "method", MEASUREMENT_METHODS);
  collecteur.exigerEnum(entree, "origin", MEASUREMENT_ORIGINS);
  collecteur.exigerNombre(entree, "value");

  if (kind !== null && unit !== null && UNITE_PAR_GRANDEUR[kind] !== unit) {
    collecteur.ajouter(
      collecteur.chemin("unit"),
      `unité ${UNITE_PAR_GRANDEUR[kind]} attendue pour la grandeur ${kind}`,
    );
  }

  const geometrie = collecteur.exigerObjet(entree, "geometry_ref");
  if (geometrie && typeof geometrie.kind !== "string") {
    collecteur.ajouter(collecteur.chemin("geometry_ref", "kind"), "nature de géométrie attendue");
  }

  collecteur.exigerPresence(entree, "reconstruction_version");
  exigerIsoDateTime(collecteur, entree, "created_at");

  const qualite = collecteur.exigerObjet(entree, "quality");
  if (qualite) {
    collecteur.exigerEnum(qualite, "level", MEASUREMENT_QUALITY_LEVELS);

    const valeur = qualite.uncertainty_value;
    const unite = qualite.uncertainty_unit;
    const valeurPresente = valeur !== null && valeur !== undefined;
    const unitePresente = unite !== null && unite !== undefined;

    if (valeurPresente !== unitePresente) {
      // §25 — une incertitude est complète ou absente. Une moitié d'incertitude est une donnée
      // corrompue, pas une donnée partielle.
      collecteur.ajouter(
        collecteur.chemin("quality", "uncertainty_value"),
        "incertitude incomplète : valeur et unité vont ensemble, ou sont toutes deux nulles",
      );
    }
    if (valeurPresente && typeof valeur !== "number") {
      collecteur.ajouter(collecteur.chemin("quality", "uncertainty_value"), "nombre attendu");
    }
    if (typeof qualite.degraded_source !== "boolean") {
      collecteur.ajouter(collecteur.chemin("quality", "degraded_source"), "booléen attendu");
    }
  }

  return collecteur.valide ? succes(entree as unknown as Measurement) : echec(collecteur.issues);
}

export function validateReconstructionJob(entree: unknown): ValidationResult<ReconstructionJob> {
  const collecteur = new CollecteurAnomalies();

  if (!estObjet(entree)) {
    collecteur.ajouter("$", "objet attendu");
    return echec(collecteur.issues);
  }

  exigerUuid(collecteur, entree, "id");
  exigerUuid(collecteur, entree, "project_id");
  exigerUuid(collecteur, entree, "entreprise_id");

  collecteur.exigerEnum(entree, "status", RECONSTRUCTION_STATUSES);
  collecteur.exigerEnum(entree, "engine", RECONSTRUCTION_ENGINES);
  collecteur.exigerChaine(entree, "engine_version");
  collecteur.exigerChaine(entree, "idempotency_key");
  collecteur.exigerObjet(entree, "parameters");

  const jeu = collecteur.exigerTableau(entree, "input_set");
  if (jeu) {
    if (jeu.length === 0) {
      collecteur.ajouter(collecteur.chemin("input_set"), "jeu de médias d'entrée vide");
    }
    jeu.forEach((identifiant, index) => {
      if (!estUuid(identifiant)) {
        collecteur.ajouter(collecteur.chemin("input_set") + `[${index}]`, "UUID attendu");
      }
    });
    if (new Set(jeu).size !== jeu.length) {
      collecteur.ajouter(collecteur.chemin("input_set"), "doublons dans le jeu de médias");
    }
  }

  const tentatives = collecteur.exigerNombre(entree, "attempts");
  const maxTentatives = collecteur.exigerNombre(entree, "max_attempts");
  if (tentatives !== null && maxTentatives !== null && tentatives > maxTentatives) {
    collecteur.ajouter(
      collecteur.chemin("attempts"),
      "nombre de tentatives supérieur à la borne : le travail aurait dû partir en dead-letter",
    );
  }

  exigerIsoDateTime(collecteur, entree, "created_at");

  return collecteur.valide
    ? succes(entree as unknown as ReconstructionJob)
    : echec(collecteur.issues);
}
