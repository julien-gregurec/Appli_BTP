import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEVE_METRE_OFFER, TOOLS_ADDON_CAPABILITIES, TOOLS_OFFERS, TOOLS_PRO_CAPABILITIES, expandOfferCapabilities, offerCapabilities } from "./entitlement";
import {
  ANNOTATION_FORMES, ELEMENT_TYPES, EQUIPEMENT_CATEGORIES, REVETEMENT_TYPES, mesureUniteAttendue, ETAGE_ETATS, MATERIAU_CATEGORIES, MEDIA_CATEGORIES, MESURE_SOURCES, MESURE_TYPES,
  MESURE_UNITES, MUR_TYPES, OUVERTURE_TYPES, PIECE_USAGES, CHANTIER_STATUTS, ETAGE_CATEGORIES, PIECE_STATUTS, QUANTITE_QUALITES, QUANTITE_UNITES, RELEVE_STATUTS,
  RELEVE_VISIBILITES, VERSION_TYPES, ZONE_TYPES,
} from "./model";
import { RELEVE_ACTIONS, RELEVE_ROLES } from "./permissions";
import { JOURNAL_ACTIONS, SEARCH_FILTERS } from "./repository";
import { MEDIA_CATEGORY_POLICIES, RELEVE_STORAGE_BUCKET, RELEVE_STORAGE_MAX_BYTES } from "./storage";
import { RELEVE_LIMITS } from "./validation";
import { PHOTO_ANNOTATION_COULEURS } from "./validation";
import { FORBIDDEN_LOCATION_KEYS, PHOTO_DATE_SOURCES, PHOTO_METADATA_KEYS, PHOTO_METADATA_REQUIRED_KEYS, PHOTO_ORIENTATIONS, PHOTO_SOURCES } from "./media";
import { PHOTO_ANNOTATION_FORMES } from "./photo";

/**
 * Parité TypeScript ↔ SQL. Le domaine et la migration sont deux copies d'un même contrat :
 * ce test échoue dès qu'une énumération, une borne ou un chemin diverge.
 */
const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260927000601_tools_releve_metre_foundation_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const complements = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260927000602_tools_releve_metre_lot2_complements.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const contratElements = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260927000604_tools_releve_metre_contrat_elements_v2.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

describe("parité domaine ↔ migration tools_releve_metre_foundation_v1", () => {
  it.each([
    ["statuts", RELEVE_STATUTS], ["visibilités", RELEVE_VISIBILITES], ["états d'étage", ETAGE_ETATS],
    ["types d'élément", ELEMENT_TYPES],
    ["catégories de média", MEDIA_CATEGORIES], ["rôles", RELEVE_ROLES], ["capabilities add-on", TOOLS_ADDON_CAPABILITIES],
  ] as const)("énumération %s identique", (_label, values) => {
    expect(sql.replace(/, /g, ",")).toContain(quoted(values));
  });

  it("les sept actions sont reconnues par tools_releve_action_autorisee", () => {
    expect(sql.replace(/, /g, ",")).toContain(`p_action not in (${quoted(RELEVE_ACTIONS)})`);
  });

  it("bornes de texte identiques", () => {
    expect(sql).toContain(`char_length(nom) <= ${RELEVE_LIMITS.nom}`);
    expect(sql).toContain(`char_length(chantier_nom) <= ${RELEVE_LIMITS.chantierNom}`);
    expect(sql).toContain(`char_length(notes) <= ${RELEVE_LIMITS.notes}`);
    expect(sql).toContain(`hauteur_sous_plafond_mm between ${RELEVE_LIMITS.hauteurMinMm} and ${RELEVE_LIMITS.hauteurMaxMm}`);
  });

  it("stockage : bucket, taille et types par catégorie identiques", () => {
    expect(sql).toContain(`'${RELEVE_STORAGE_BUCKET}', '${RELEVE_STORAGE_BUCKET}', false, ${RELEVE_STORAGE_MAX_BYTES}`);
    for (const [categorie, policy] of Object.entries(MEDIA_CATEGORY_POLICIES)) {
      expect(sql.replace(/, /g, ",")).toContain(`when '${categorie}' then mime_type in (${quoted(Object.keys(policy.mimeTypes))})`);
    }
  });
});

describe("parité domaine ↔ migration tools_releve_metre_lot2_complements", () => {
  it("types de version identiques au CHECK SQL", () => {
    expect(complements.replace(/, /g, ",")).toContain(`type_version in (${quoted(VERSION_TYPES)})`);
  });

  it("18 capabilities Tools Pro identiques à tools_capabilities_pro()", () => {
    expect(sql.replace(/, ?/g, ",")).toContain(quoted(TOOLS_PRO_CAPABILITIES));
  });

  it("catalogue d'offres : releve_pro inclut tools_pro, non commercial, sans prix", () => {
    expect(complements).toContain("('releve_pro', 'Relevé & Métré Pro', 'releve-metre', public.tools_capabilities_addon(), array['tools_pro'], false, 'reference')");
    expect(TOOLS_OFFERS.releve_pro).toMatchObject({ offresIncluses: ["tools_pro"], commercialementActive: false });
    expect(complements).not.toMatch(new RegExp(`${RELEVE_METRE_OFFER.monthlyPriceCents}|${RELEVE_METRE_OFFER.annualPriceCents}|24,90|249 €`));
  });

  it("extension d'offre : miroir de tools_capabilities_etendues", () => {
    expect(offerCapabilities("releve_pro")).toHaveLength(19);
    expect(expandOfferCapabilities(["releve-metre"])).toEqual(offerCapabilities("releve_pro"));
    expect(expandOfferCapabilities(TOOLS_PRO_CAPABILITIES)).toEqual([...TOOLS_PRO_CAPABILITIES].sort());
    expect(expandOfferCapabilities(["basic-calculation"])).toEqual(["basic-calculation"]);
  });
});

describe("parité domaine ↔ migration tools_releve_metre_contrat_elements_v2 (validateur courant des éléments)", () => {
  it.each([
    ["types de mur", MUR_TYPES], ["types d'ouverture", OUVERTURE_TYPES], ["catégories d'équipement", EQUIPEMENT_CATEGORIES],
    ["types de mesure", MESURE_TYPES], ["unités de mesure", MESURE_UNITES], ["sources de mesure", MESURE_SOURCES],
    ["catégories de matériau", MATERIAU_CATEGORIES], ["unités de quantité", QUANTITE_UNITES], ["qualités", QUANTITE_QUALITES],
    ["formes d'annotation", ANNOTATION_FORMES], ["revêtements", REVETEMENT_TYPES],
  ] as const)("énumération %s identique", (_label, values) => {
    expect(contratElements.replace(/, /g, ",")).toContain(quoted(values));
  });

  it("la définition 604 est un sur-ensemble de 601 : chaque ancienne valeur reste admise", () => {
    const anciennes = [["longueur", "hauteur", "diagonale", "angle", "surface"], ["mm", "rad", "mm2"], ["manuel", "laser", "photo", "ar", "lidar"]];
    for (const liste of anciennes) {
      expect(sql.replace(/, /g, ",")).toContain(quoted(liste));
      for (const valeur of liste) expect(contratElements).toContain(`'${valeur}'`);
    }
  });

  it("unité attendue par type de mesure (appliquée par le domaine)", () => {
    expect(MESURE_TYPES.map((type) => `${type}:${mesureUniteAttendue(type)}`)).toEqual([
      "longueur:mm", "largeur:mm", "hauteur:mm", "diagonale:mm", "distance:mm", "angle:rad", "surface:mm2", "volume:mm3",
    ]);
  });
});

describe("parité domaine ↔ migration tools_releve_metre_structure_terrain_v1 (Lot 3)", () => {
  const terrain = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260928000701_tools_releve_metre_structure_terrain_v1.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ").replace(/, /g, ",");

  it.each([
    ["types de zone", ZONE_TYPES], ["usages de pièce", PIECE_USAGES], ["statuts de chantier", CHANTIER_STATUTS],
    ["catégories de niveau", ETAGE_CATEGORIES], ["statuts de pièce", PIECE_STATUTS], ["actions du journal", JOURNAL_ACTIONS],
  ] as const)("énumération %s identique", (_label, values) => {
    expect(terrain).toContain(quoted(values));
  });

  it("sur-ensemble du Lot 2 : chaque ancien type de zone et usage de pièce reste admis", () => {
    const zones601 = ["logement", "lot", "parties_communes", "local_technique", "exterieur", "autre"];
    const usages601 = ["sejour", "chambre", "cuisine", "salle_de_bain", "salle_d_eau", "wc", "entree", "degagement", "bureau", "cellier", "buanderie", "garage", "cave", "combles", "escalier", "exterieur", "autre"];
    expect(sql.replace(/, /g, ",")).toContain(quoted(zones601));
    expect(sql.replace(/, /g, ",")).toContain(quoted(usages601));
    expect(ZONE_TYPES.slice(0, zones601.length)).toEqual(zones601);
    expect(PIECE_USAGES.slice(0, usages601.length)).toEqual(usages601);
  });

  it("bornes identiques : textes, surface, niveau décimal", () => {
    expect(terrain).toContain(`char_length(description) <= ${RELEVE_LIMITS.description}`);
    expect(terrain).toContain(`char_length(commentaire) <= ${RELEVE_LIMITS.commentaire}`);
    expect(terrain).toContain(`char_length(client_nom) <= ${RELEVE_LIMITS.clientNom}`);
    expect(terrain).toContain(`char_length(reference) <= ${RELEVE_LIMITS.reference}`);
    expect(terrain).toContain("surface_declaree_mm2 between 1 and 1e12");
    expect(RELEVE_LIMITS.surfaceMaxMm2).toBe(1e12);
    expect(terrain).toContain("numeric(5,1)");
  });

  it("filtres de recherche identiques à tools_releve_rechercher", () => {
    for (const filtre of SEARCH_FILTERS) if (filtre !== "actif") expect(terrain).toContain(`when '${filtre}' then`);
  });
});

describe("parité domaine ↔ migration tools_releve_metre_capture_media_v1 (Lot 4)", () => {
  const capture = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260928000801_tools_releve_metre_capture_media_v1.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ").replace(/, /g, ",");

  it.each([
    ["clés de métadonnées (liste fermée)", PHOTO_METADATA_KEYS], ["sources de photo", PHOTO_SOURCES],
    ["origines de date", PHOTO_DATE_SOURCES], ["orientations", PHOTO_ORIENTATIONS], ["couleurs d'annotation", PHOTO_ANNOTATION_COULEURS],
  ] as const)("énumération %s identique", (_label, values) => {
    expect(capture).toContain(quoted(values));
  });

  it("clés obligatoires, bornes des repères et du libellé identiques", () => {
    for (const key of PHOTO_METADATA_REQUIRED_KEYS) expect(capture).toMatch(new RegExp(`'${key}'`));
    expect(capture).toContain(`jsonb_array_length(p_reperes) <= ${RELEVE_LIMITS.reperesMax}`);
    expect(capture).toContain(`char_length(r->>'label') <= ${RELEVE_LIMITS.labelRepere}`);
    expect(capture).toContain(`tools_releve_entier_facultatif_valide(p_donnees->'ordre',0,${RELEVE_LIMITS.ordreMax})`);
  });

  it("aucune clé de localisation n'est admise par la liste fermée SQL", () => {
    const liste = /k not in \(([^)]*)\)/.exec(capture)?.[1] ?? "";
    expect(liste).not.toBe("");
    for (const interdite of FORBIDDEN_LOCATION_KEYS) expect(liste.toLowerCase()).not.toContain(`'${interdite}'`);
  });

  it("formes dessinables sur photo : texte, flèche, cercle", () => {
    for (const forme of PHOTO_ANNOTATION_FORMES) expect(capture).toContain(`when '${forme}' then public.tools_releve_nombre_unitaire`);
  });
});
