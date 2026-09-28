import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEVE_METRE_OFFER, TOOLS_ADDON_CAPABILITIES, TOOLS_OFFERS, TOOLS_PRO_CAPABILITIES, expandOfferCapabilities, offerCapabilities } from "./entitlement";
import {
  ANNOTATION_FORMES, ELEMENT_TYPES, EQUIPEMENT_CATEGORIES, REVETEMENT_TYPES, mesureUniteAttendue, ETAGE_ETATS, MATERIAU_CATEGORIES, MEDIA_CATEGORIES, MESURE_SOURCES, MESURE_TYPES,
  MESURE_UNITES, MUR_TYPES, OUVERTURE_TYPES, PIECE_USAGES, QUANTITE_QUALITES, QUANTITE_UNITES, RELEVE_STATUTS,
  RELEVE_VISIBILITES, VERSION_TYPES, ZONE_TYPES, ENTITY_REF_KINDS, ZONE_TYPES_LOT2, PIECE_USAGES_LOT2, CHANTIER_STATUTS, ETAGE_TYPES_NIVEAU, PIECE_STATUTS,
} from "./model";
import { ACTIVITY_ACTIONS } from "./terrain";
import { RELEVE_ACTIONS, RELEVE_ROLES } from "./permissions";
import { MEDIA_CATEGORY_POLICIES, RELEVE_STORAGE_BUCKET, RELEVE_STORAGE_MAX_BYTES } from "./storage";
import { PHOTO_ANNOTATION_COULEURS, RELEVE_LIMITS } from "./validation";
import { FORBIDDEN_LOCATION_KEYS, PHOTO_DATE_SOURCES, PHOTO_METADATA_KEYS, PHOTO_METADATA_REQUIRED_KEYS, PHOTO_ORIENTATIONS, PHOTO_SOURCES } from "./media";
import { PHOTO_ANNOTATION_FORMES, PHOTO_ANNOTATION_FORMES_PREVUES, PHOTO_TARGET_KINDS } from "./photo";
import { PHOTO_COMMENT_MAX } from "./media-service";
import { DEFAULT_PLAN_CADRE, OPENING_ISSUE_CODES, OPENING_ISSUE_MESSAGES, PLAN_CREATION_MESSAGES, PLAN_ETATS, PLAN_LIMITS } from "./plan";
import { OUVERTURE_MODELES, OUVERTURE_POUSSEES, OUVERTURE_SENS, OUVERTURE_VANTAUX } from "./model";
import { RELEVE_COORDINATE_LIMIT_MM } from "./model";

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

const lot3 = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260927000701_tools_releve_metre_lot3_structure_terrain.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

describe("parité domaine ↔ migration tools_releve_metre_foundation_v1", () => {
  it.each([
    ["statuts", RELEVE_STATUTS], ["visibilités", RELEVE_VISIBILITES], ["états d'étage", ETAGE_ETATS],
    ["types de zone", ZONE_TYPES_LOT2], ["usages de pièce", PIECE_USAGES_LOT2], ["types d'élément", ELEMENT_TYPES],
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

describe("parité domaine ↔ migration tools_releve_metre_lot3_structure_terrain", () => {
  const flat = lot3.replace(/, ?/g, ",");
  it.each([
    ["statuts de chantier", CHANTIER_STATUTS], ["types de niveau", ETAGE_TYPES_NIVEAU], ["statuts de pièce", PIECE_STATUTS],
    ["types de zone (Lot 3)", ZONE_TYPES], ["types de pièce (Lot 3)", PIECE_USAGES], ["actions du journal", ACTIVITY_ACTIONS],
  ] as const)("énumération %s identique", (_label, values) => {
    expect(flat).toContain(quoted(values));
  });

  it("les listes Lot 3 sont des sur-ensembles stricts de la fondation (aucune valeur retirée)", () => {
    expect(ZONE_TYPES.slice(0, ZONE_TYPES_LOT2.length)).toEqual([...ZONE_TYPES_LOT2]);
    expect(PIECE_USAGES.slice(0, PIECE_USAGES_LOT2.length)).toEqual([...PIECE_USAGES_LOT2]);
  });

  it("aucun prix ni SKU dans la migration Lot 3", () => {
    expect(lot3).not.toMatch(new RegExp(`${RELEVE_METRE_OFFER.monthlyPriceCents}|${RELEVE_METRE_OFFER.annualPriceCents}|24,90|249 €|product_sku`));
  });
});

describe("parité domaine ↔ migration tools_releve_metre_capture_media_v1 (Lot 4)", () => {
  const capture = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20260927000801_tools_releve_metre_capture_media_v1.sql", import.meta.url)),
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

  it("colonnes Lot 4 : états documentés = types de version, commentaire borné comme le domaine", () => {
    expect(capture).toContain(`etat_documente in (${VERSION_TYPES.map((value) => `'${value}'`).join(",")})`);
    expect(capture).toContain(`char_length(commentaire) <= ${PHOTO_COMMENT_MAX}`);
  });

  it("garde de rattachement : chaque nature de cible du domaine est contrôlée par le serveur", () => {
    for (const kind of ENTITY_REF_KINDS) expect(capture).toContain(`when '${kind}' then`);
    for (const kind of PHOTO_TARGET_KINDS.filter((kind) => kind === "plan")) expect(capture).toContain(`v_kind = '${kind}'`);
  });

  it("formes prévues (rectangle, zone, dimension, symbole) refusées sur photo tant qu'elles ne sont pas livrées", () => {
    const geometrie = /function public\.tools_releve_geometrie_photo_valide[\s\S]*?\$\$;/.exec(capture)?.[0] ?? "";
    for (const forme of PHOTO_ANNOTATION_FORMES_PREVUES) expect(geometrie).not.toContain(`when '${forme}'`);
  });
});

const plan2d = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260928000101_tools_releve_metre_plan_2d_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("parité domaine ↔ migration tools_releve_metre_plan_2d_v1 (Lot 5)", () => {
  it("états du plan = types de version", () => {
    expect(PLAN_ETATS).toEqual(VERSION_TYPES);
    expect(plan2d).toContain(`etat_documente in (${quoted(PLAN_ETATS)})`);
  });
  it("cadre par défaut identique", () => {
    expect(plan2d).toContain(`'${JSON.stringify(DEFAULT_PLAN_CADRE)}'::jsonb`);
  });
  it("bornes des murs, ouvertures, contours et lots identiques", () => {
    expect(plan2d).toContain(`::numeric > ${PLAN_LIMITS.epaisseurMaxMm}`);
    expect(plan2d).toContain(`not between ${PLAN_LIMITS.hauteurMinMm} and ${PLAN_LIMITS.hauteurMaxMm}`);
    expect(plan2d).toContain(`> v_longueur + ${PLAN_LIMITS.ouvertureToleranceMm}`);
    expect(plan2d).toContain(`not between ${PLAN_LIMITS.pointsMin} and ${PLAN_LIMITS.pointsMax}`);
    expect(plan2d).toContain(`jsonb_array_length(p) > ${PLAN_LIMITS.contoursMax}`);
    expect(plan2d).toContain(`> ${PLAN_LIMITS.lotMax}`);
    expect(plan2d).toContain(`> ${PLAN_LIMITS.supprimesMax}`);
    expect(plan2d).toContain(`>= ${PLAN_LIMITS.cadreEtendueMinMm}`);
    expect(plan2d).toContain(`char_length(libelle) <= ${PLAN_LIMITS.libelle}`);
    expect(plan2d).toContain(`${RELEVE_COORDINATE_LIMIT_MM}`);
  });
  it("seuls murs et ouvertures appartiennent à un plan ; journal « plan »", () => {
    expect(plan2d).toContain("plan_id is null or type in ('mur','ouverture')");
    expect(plan2d).toContain("'version','plan'");
  });
  it("messages de création alignés sur la RPC", () => {
    const sqlText = (message: string) => message.replace(/\.$/, "").replaceAll("'", "''");
    for (const code of ["initial_not_first", "initial_with_base", "initial_missing", "base_not_found", "editable_exists"] as const) {
      expect(plan2d).toContain(sqlText(PLAN_CREATION_MESSAGES[code]));
    }
  });
});

const lot6 = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260928000401_tools_releve_metre_geometrie_batiment_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("parité domaine ↔ migration tools_releve_metre_geometrie_batiment_v1 (Lot 6)", () => {
  it("attributs de menuiserie : mêmes valeurs admises", () => {
    expect(lot6).toContain(`not in (${quoted(OUVERTURE_SENS)})`);
    expect(lot6).toContain(`not in (${quoted(OUVERTURE_POUSSEES)})`);
    expect(lot6).toContain(`not in (${quoted(OUVERTURE_MODELES)})`);
    expect(lot6).toContain(`not in (${OUVERTURE_VANTAUX.map((v) => `'${v}'`).join(",")})`);
  });
  it("codes et messages d'anomalie identiques (la jonction reste côté client)", () => {
    const sqlText = (message: string) => message.replaceAll("'", "''");
    for (const code of OPENING_ISSUE_CODES) {
      if (code === "invalide") { expect(lot6).toContain(`else '${sqlText(OPENING_ISSUE_MESSAGES.invalide)}'`); continue; }
      expect(lot6).toContain(`when '${code}' then '${sqlText(OPENING_ISSUE_MESSAGES[code])}'`);
    }
  });
  it("tolérance d'arrondi et hauteur maximale identiques", () => {
    expect(lot6).toContain(`> p_longueur + ${PLAN_LIMITS.ouvertureToleranceMm}`);
    expect(lot6).toContain(`> p_hauteur_mur + ${PLAN_LIMITS.ouvertureToleranceMm}`);
    expect(lot6).toContain(`v_hauteur > ${PLAN_LIMITS.hauteurMaxMm}`);
    expect(lot6).toContain(`b.fin - ${PLAN_LIMITS.ouvertureToleranceMm}`);
  });
});
