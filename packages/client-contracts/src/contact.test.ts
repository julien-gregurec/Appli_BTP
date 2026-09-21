import { describe, expect, it } from "vitest";

import {
  computeContactDisplayName,
  findPrimaryContact,
  listSiteContacts,
  resolveBillingContact,
  validateClientContact,
  validateClientContactCollection,
} from "./contact";
import { asClientContactId } from "./ids";
import { CLIENT_A, TENANT_A, TENANT_B, makeContact } from "./fixtures";

const CONTACT_2 = asClientContactId("cccccccc-cccc-4ccc-8ccc-cccccccccc02");
const CONTACT_3 = asClientContactId("cccccccc-cccc-4ccc-8ccc-cccccccccc03");

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("collection de contacts", () => {
  it("accepte plusieurs contacts aux rôles distincts", () => {
    const contacts = [
      makeContact({ roles: ["primary"] }),
      makeContact({ id: CONTACT_2, roles: ["billing"], firstName: "Paul", lastName: "Weber", email: "compta@example.fr" }),
      makeContact({ id: CONTACT_3, roles: ["site"], firstName: "Léa", lastName: "Schmitt", email: null, phone: "0388998877" }),
    ];
    expect(validateClientContactCollection(contacts, TENANT_A, CLIENT_A).ok).toBe(true);
    expect(findPrimaryContact(contacts)?.firstName).toBe("Claire");
    expect(resolveBillingContact(contacts)?.firstName).toBe("Paul");
    expect(listSiteContacts(contacts)).toHaveLength(1);
  });

  it("replie le contact de facturation sur le contact principal", () => {
    const contacts = [makeContact({ roles: ["primary"] })];
    expect(resolveBillingContact(contacts)?.firstName).toBe("Claire");
  });

  it("refuse deux contacts principaux actifs", () => {
    const contacts = [makeContact({ roles: ["primary"] }), makeContact({ id: CONTACT_2, roles: ["primary"] })];
    expect(codes(validateClientContactCollection(contacts, TENANT_A, CLIENT_A))).toContain(":invariant_violated");
  });

  it("laisse un contact principal archivé cohabiter avec son remplaçant", () => {
    const contacts = [
      makeContact({ roles: ["primary"], status: "inactive" }),
      makeContact({ id: CONTACT_2, roles: ["primary"], firstName: "Paul", lastName: "Weber" }),
    ];
    expect(validateClientContactCollection(contacts, TENANT_A, CLIENT_A).ok).toBe(true);
    expect(findPrimaryContact(contacts)?.firstName).toBe("Paul");
  });

  it("refuse deux contacts de même identifiant", () => {
    const contacts = [makeContact({ roles: ["primary"] }), makeContact({ roles: ["site"] })];
    expect(codes(validateClientContactCollection(contacts, TENANT_A, CLIENT_A))).toContain("[1].id:duplicate");
  });

  it("refuse un contact d'un autre locataire", () => {
    const contacts = [makeContact({ tenantId: TENANT_B })];
    expect(codes(validateClientContactCollection(contacts, TENANT_A, CLIENT_A))).toContain("[0].tenantId:tenant_mismatch");
  });
});

describe("contact isolé", () => {
  it("refuse un contact sans nom ni moyen de le joindre", () => {
    const contact = makeContact({ firstName: null, lastName: null, email: null, phone: null, mobile: null });
    expect(codes(validateClientContact(contact))).toContain(":invariant_violated");
  });

  it("refuse un e-mail mal formé", () => {
    expect(codes(validateClientContact(makeContact({ email: "claire.muller@localhost" })))).toContain("email:invalid_format");
  });

  it("compose un nom d'affichage, et se replie sur l'e-mail", () => {
    expect(computeContactDisplayName({ firstName: "Claire", lastName: "Muller", email: null })).toBe("Claire Muller");
    expect(computeContactDisplayName({ firstName: null, lastName: null, email: "compta@example.fr" })).toBe("compta@example.fr");
  });
});
