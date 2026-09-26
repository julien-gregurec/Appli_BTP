import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOLS_ADDON_CAPABILITIES } from "./entitlement";
import {
  ELEMENT_TYPES, EQUIPEMENT_CATEGORIES, ETAGE_ETATS, MATERIAU_CATEGORIES, MEDIA_CATEGORIES, MESURE_SOURCES, MESURE_TYPES,
  MESURE_UNITES, MUR_TYPES, OUVERTURE_TYPES, PIECE_USAGES, QUANTITE_QUALITES, QUANTITE_UNITES, RELEVE_STATUTS,
  RELEVE_VISIBILITES, ZONE_TYPES,
} from "./model";
import { RELEVE_ACTIONS, RELEVE_ROLES } from "./permissions";
import { MEDIA_CATEGORY_POLICIES, RELEVE_STORAGE_BUCKET, RELEVE_STORAGE_MAX_BYTES } from "./storage";
import { RELEVE_LIMITS } from "./validation";

/**
 * Parité TypeScript ↔ SQL. Le domaine et la migration sont deux copies d'un même contrat :
 * ce test échoue dès qu'une énumération, une borne ou un chemin diverge.
 */
const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260926000401_tools_releve_metre_foundation_v1.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(",");

describe("parité domaine ↔ migration tools_releve_metre_foundation_v1", () => {
  it.each([
    ["statuts", RELEVE_STATUTS], ["visibilités", RELEVE_VISIBILITES], ["états d'étage", ETAGE_ETATS],
    ["types de zone", ZONE_TYPES], ["usages de pièce", PIECE_USAGES], ["types d'élément", ELEMENT_TYPES],
    ["types de mur", MUR_TYPES], ["types d'ouverture", OUVERTURE_TYPES], ["catégories d'équipement", EQUIPEMENT_CATEGORIES],
    ["types de mesure", MESURE_TYPES], ["unités de mesure", MESURE_UNITES], ["sources de mesure", MESURE_SOURCES],
    ["catégories de matériau", MATERIAU_CATEGORIES], ["unités de quantité", QUANTITE_UNITES], ["qualités", QUANTITE_QUALITES],
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
