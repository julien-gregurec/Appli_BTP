import { describe, expect, it } from "vitest";

import {
  CLIENT_AUTHORITATIVE_APPLICATION,
  CLIENT_REFERENCE_UNLINKED,
  isClientReferenceUnlinked,
  markReferenceDesynchronized,
  refreshClientReference,
  validateClientReference,
  type ClientReference,
} from "./reference";
import { parseClientReference, serializeClientReference } from "./serialization";
import { CLIENT_SCHEMA_VERSIONS, CLIENT_CONTRACT_VERSION } from "./version";
import { CLIENT_A, NOW, TENANT_A } from "./fixtures";

const LINKED: ClientReference = {
  schemaVersion: CLIENT_SCHEMA_VERSIONS.clientReference,
  sourceApp: "gestion_pro",
  tenantId: TENANT_A,
  clientId: CLIENT_A,
  externalId: null,
  reference: "CLI-0042",
  label: "MENUISERIE MULLER",
  contractVersion: CLIENT_CONTRACT_VERSION,
  syncStatus: "linked",
  synchronizedAt: NOW,
  origin: "manual",
};

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("mode standalone", () => {
  it("accepte une référence entièrement nulle — le test d'acceptation du standalone", () => {
    expect(validateClientReference(CLIENT_REFERENCE_UNLINKED).ok).toBe(true);
    expect(isClientReferenceUnlinked(CLIENT_REFERENCE_UNLINKED)).toBe(true);
  });

  it("désigne Gestion Pro comme seule application faisant autorité", () => {
    expect(CLIENT_AUTHORITATIVE_APPLICATION).toBe("gestion_pro");
  });
});

describe("référence liée", () => {
  it("accepte une liaison complète", () => {
    expect(validateClientReference(LINKED).ok).toBe(true);
  });

  it("refuse une liaison sans locataire", () => {
    expect(codes(validateClientReference({ ...LINKED, tenantId: null }))).toContain("tenantId:invariant_violated");
  });

  it("refuse une liaison sans identité", () => {
    const orphan = { ...LINKED, clientId: null, externalId: null };
    expect(codes(validateClientReference(orphan))).toContain("clientId:invariant_violated");
  });

  it("accepte une liaison identifiée par un identifiant externe non-UUID", () => {
    const imported = { ...LINKED, clientId: null, externalId: "LEGACY-88", origin: "imported" as const };
    expect(validateClientReference(imported).ok).toBe(true);
  });

  it("refuse un statut not_linked portant une identité", () => {
    const contradiction = { ...LINKED, syncStatus: "not_linked" as const };
    expect(codes(validateClientReference(contradiction))).toContain("syncStatus:invariant_violated");
  });

  it("refuse une application source inconnue", () => {
    expect(codes(validateClientReference({ ...LINKED, sourceApp: "erp_maison" }))).toContain("sourceApp:invalid_enum");
  });
});

describe("cycle de vie", () => {
  it("marque une référence comme désynchronisée sans toucher au cache d'affichage", () => {
    const stale = markReferenceDesynchronized(LINKED);
    expect(stale.syncStatus).toBe("desynchronized");
    expect(stale.label).toBe("MENUISERIE MULLER");
    expect(validateClientReference(stale).ok).toBe(true);
  });

  it("laisse une référence non liée inchangée", () => {
    expect(markReferenceDesynchronized(CLIENT_REFERENCE_UNLINKED)).toBe(CLIENT_REFERENCE_UNLINKED);
  });

  it("rafraîchit le cache après résolution auprès de la source", () => {
    const refreshed = refreshClientReference(markReferenceDesynchronized(LINKED), {
      label: "MULLER AGENCEMENT",
      reference: "CLI-0042",
      synchronizedAt: "2026-09-08T09:00:00.000Z",
    });
    expect(refreshed.syncStatus).toBe("linked");
    expect(refreshed.label).toBe("MULLER AGENCEMENT");
    expect(validateClientReference(refreshed).ok).toBe(true);
  });

  it("survit à un aller-retour JSON", () => {
    const parsed = parseClientReference(serializeClientReference(LINKED));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(LINKED);
  });
});
