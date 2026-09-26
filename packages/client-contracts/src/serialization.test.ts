import { describe, expect, it } from "vitest";

import { assertClientTenant, validateClientDetails } from "./client";
import { parseClientDetails, serializeClientDetails, serializeStable } from "./serialization";
import { CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable, parseSchemaVersion } from "./version";
import { asClientAddressId, asClientContactId } from "./ids";
import { TENANT_A, TENANT_B, makeAddress, makeContact, makeDetails, makeMinimalIndividual } from "./fixtures";

const SECOND_ADDRESS = asClientAddressId("dddddddd-dddd-4ddd-8ddd-dddddddddd02");
const SECOND_CONTACT = asClientContactId("cccccccc-cccc-4ccc-8ccc-cccccccccc02");

describe("sérialisation stable", () => {
  it("produit la même chaîne quel que soit l'ordre d'insertion des clés", () => {
    const a = { beta: 1, alpha: { z: true, a: null } };
    const b = { alpha: { a: null, z: true }, beta: 1 };
    expect(serializeStable(a)).toBe(serializeStable(b));
  });

  it("ramène undefined à null au lieu de l'effacer silencieusement", () => {
    expect(serializeStable({ champ: undefined })).toBe('{"champ":null}');
    expect(JSON.stringify({ champ: undefined })).toBe("{}");
  });

  it("neutralise les nombres non finis", () => {
    expect(serializeStable({ valeur: Number.NaN })).toBe('{"valeur":null}');
  });
});

describe("aller-retour", () => {
  it("conserve une fiche complète à l'identique", () => {
    const details = makeDetails();
    const parsed = parseClientDetails(serializeClientDetails(details));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeClientDetails(parsed.value)).toBe(serializeClientDetails(details));
  });

  it("conserve un particulier minimal", () => {
    const details = makeMinimalIndividual();
    const parsed = parseClientDetails(serializeClientDetails(details));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.identity.legal).toBeNull();
  });

  it("conserve une fiche à plusieurs adresses et plusieurs contacts", () => {
    const details = makeDetails({
      addresses: [
        makeAddress({ roles: ["primary", "billing"] }),
        makeAddress({ id: SECOND_ADDRESS, roles: ["site"], city: "Haguenau", postalCode: "67500" }),
      ],
      contacts: [
        makeContact({ roles: ["primary"] }),
        makeContact({ id: SECOND_CONTACT, roles: ["site"], firstName: "Léa" }),
      ],
    });
    const parsed = parseClientDetails(serializeClientDetails(details));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.addresses).toHaveLength(2);
      expect(parsed.value.contacts).toHaveLength(2);
    }
  });

  it("rend une anomalie structurée sur un JSON illisible", () => {
    const parsed = parseClientDetails("{ pas du json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0]?.code).toBe("invalid_format");
  });

  it("rend des anomalies de contenu sur un JSON lisible mais faux", () => {
    const parsed = parseClientDetails(JSON.stringify({ schemaVersion: "elsatia.client.details/1" }));
    expect(parsed.ok).toBe(false);
  });
});

describe("compatibilité de version", () => {
  it("décompose une version de schéma", () => {
    expect(parseSchemaVersion(CLIENT_SCHEMA_VERSIONS.clientDetails)).toEqual({
      name: "elsatia.client.details",
      major: 1,
    });
    expect(parseSchemaVersion("sans-majeur")).toBeNull();
  });

  it("accepte le même majeur et refuse un autre majeur", () => {
    expect(isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientDetails, "elsatia.client.details/1")).toBe(true);
    expect(isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientDetails, "elsatia.client.details/2")).toBe(false);
    expect(isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientDetails, "elsatia.client.summary/1")).toBe(false);
  });

  it("tolère un champ inconnu ajouté par un émetteur plus récent", () => {
    // Mécanique de compatibilité ascendante : un ajout optionnel ne casse pas un lecteur 1.0.
    const forward = { ...makeDetails(), champAjouteEnV1_1: "valeur inattendue" };
    expect(validateClientDetails(forward).ok).toBe(true);
  });

  it("refuse une charge utile dont le majeur a changé", () => {
    const future = { ...makeDetails(), schemaVersion: "elsatia.client.details/2" };
    const result = validateClientDetails(future);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("unsupported_schema_version");
  });
});

describe("confinement de locataire à la frontière", () => {
  it("accepte une fiche du locataire attendu", () => {
    expect(assertClientTenant(makeDetails(), TENANT_A).ok).toBe(true);
  });

  it("refuse une fiche d'un autre locataire", () => {
    const result = assertClientTenant(makeDetails(), TENANT_B);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.every((issue) => issue.code === "tenant_mismatch")).toBe(true);
  });
});
