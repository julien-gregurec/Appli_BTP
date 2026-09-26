import { describe, expect, it } from "vitest";

import {
  findPrimaryAddress,
  formatPostalAddress,
  listSiteAddresses,
  resolveBillingAddress,
  toPostalAddress,
  validateClientAddress,
  validateClientAddressCollection,
} from "./address";
import { validateClientDetails } from "./client";
import { asClientAddressId } from "./ids";
import { CLIENT_A, TENANT_A, TENANT_B, makeAddress, makeDetails } from "./fixtures";

const ADDRESS_2 = asClientAddressId("dddddddd-dddd-4ddd-8ddd-dddddddddd02");
const ADDRESS_3 = asClientAddressId("dddddddd-dddd-4ddd-8ddd-dddddddddd03");

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("rôles d'adresse", () => {
  it("accepte une adresse unique portant à la fois le rôle principal et le rôle facturation", () => {
    const addresses = [makeAddress({ roles: ["primary", "billing"] })];
    expect(validateClientAddressCollection(addresses, TENANT_A, CLIENT_A).ok).toBe(true);
    expect(resolveBillingAddress(addresses)?.id).toBe(addresses[0]?.id);
  });

  it("replie la facturation sur l'adresse principale quand aucune ne porte le rôle facturation", () => {
    const addresses = [makeAddress({ roles: ["primary"] })];
    expect(resolveBillingAddress(addresses)?.city).toBe("Strasbourg");
  });

  it("distingue une adresse de facturation différente de l'adresse principale", () => {
    const addresses = [
      makeAddress({ roles: ["primary"] }),
      makeAddress({
        id: ADDRESS_2,
        roles: ["billing"],
        label: "Service comptabilité",
        line1: "5 avenue de la Paix",
        postalCode: "68000",
        city: "Colmar",
      }),
    ];
    expect(validateClientAddressCollection(addresses, TENANT_A, CLIENT_A).ok).toBe(true);
    expect(findPrimaryAddress(addresses)?.city).toBe("Strasbourg");
    expect(resolveBillingAddress(addresses)?.city).toBe("Colmar");
  });

  it("accepte plusieurs adresses de chantier", () => {
    const addresses = [
      makeAddress({ roles: ["primary", "billing"] }),
      makeAddress({ id: ADDRESS_2, roles: ["site"], label: "Chantier Nord", city: "Haguenau", postalCode: "67500" }),
      makeAddress({ id: ADDRESS_3, roles: ["site"], label: "Chantier Sud", city: "Mulhouse", postalCode: "68100" }),
    ];
    expect(validateClientAddressCollection(addresses, TENANT_A, CLIENT_A).ok).toBe(true);
    expect(listSiteAddresses(addresses)).toHaveLength(2);
  });

  it("refuse deux adresses principales", () => {
    const addresses = [makeAddress({ roles: ["primary"] }), makeAddress({ id: ADDRESS_2, roles: ["primary"] })];
    expect(codes(validateClientAddressCollection(addresses, TENANT_A, CLIENT_A))).toContain(":invariant_violated");
  });

  it("refuse une adresse sans rôle", () => {
    expect(codes(validateClientAddress(makeAddress({ roles: [] })))).toContain("roles:required");
  });

  it("refuse un rôle inconnu", () => {
    const address = { ...makeAddress(), roles: ["livraison"] };
    expect(codes(validateClientAddress(address))).toContain("roles[0]:invalid_enum");
  });
});

describe("format postal", () => {
  it("refuse un code postal français qui n'a pas cinq chiffres", () => {
    expect(codes(validateClientAddress(makeAddress({ postalCode: "6700" })))).toContain("postalCode:invalid_format");
  });

  it("accepte un code postal étranger de forme alphanumérique", () => {
    const address = makeAddress({ country: "GB", postalCode: "SW1A 1AA", city: "London" });
    expect(validateClientAddress(address).ok).toBe(true);
  });

  it("refuse un pays qui n'est pas un code ISO alpha-2", () => {
    expect(codes(validateClientAddress(makeAddress({ country: "France" })))).toContain("country:invalid_format");
  });

  it("refuse des coordonnées hors bornes", () => {
    const address = makeAddress({ coordinates: { latitude: 120, longitude: 7.75 } });
    expect(codes(validateClientAddress(address))).toContain("coordinates.latitude:out_of_range");
  });

  it("compose un bloc imprimable en omettant les lignes vides", () => {
    const postal = toPostalAddress(makeAddress({ line2: "Bâtiment C" }));
    expect(postal).not.toBeNull();
    expect(formatPostalAddress(postal!)).toEqual(["12 rue des Tanneurs", "Bâtiment C", "67000 Strasbourg"]);
  });
});

describe("confinement de locataire", () => {
  it("refuse une adresse rattachée à un autre locataire", () => {
    const addresses = [makeAddress({ tenantId: TENANT_B })];
    expect(codes(validateClientAddressCollection(addresses, TENANT_A, CLIENT_A))).toContain("[0].tenantId:tenant_mismatch");
  });

  it("attrape la fuite depuis la fiche complète, pas seulement depuis la collection", () => {
    const details = makeDetails({ addresses: [makeAddress({ tenantId: TENANT_B })] });
    const result = validateClientDetails(details);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("addresses[0].tenantId:tenant_mismatch");
  });
});
