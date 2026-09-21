import { describe, expect, it } from "vitest";

import {
  captureDocumentRecipient,
  diffSnapshotAgainstClient,
  renderRecipientBlock,
  validateDocumentRecipientSnapshot,
} from "./document-snapshot";
import { asClientAddressId } from "./ids";
import { parseDocumentRecipientSnapshot, serializeDocumentRecipientSnapshot } from "./serialization";
import { CLIENT_A, NOW, TENANT_A, makeAddress, makeDetails, makeIdentity, makeMinimalIndividual } from "./fixtures";

const CAPTURED_AT = "2026-03-01T09:00:00.000Z";

describe("capture", () => {
  it("fige le destinataire d'un professionnel, adresse de facturation comprise", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });

    expect(snapshot.displayName).toBe("MENUISERIE MULLER");
    expect(snapshot.capturedAt).toBe(CAPTURED_AT);
    expect(snapshot.tenantId).toBe(TENANT_A);
    expect(snapshot.sourceClientId).toBe(CLIENT_A);
    expect(snapshot.billingAddress?.city).toBe("Strasbourg");
    expect(snapshot.legal?.siret).toBe("73282932000009");
    expect(snapshot.contact?.displayName).toBe("Claire Muller");
    expect(validateDocumentRecipientSnapshot(snapshot).ok).toBe(true);
  });

  it("fige un particulier sans identité légale, sans adresse et sans contact", () => {
    const snapshot = captureDocumentRecipient(makeMinimalIndividual(), { capturedAt: CAPTURED_AT });
    expect(snapshot.legal).toBeNull();
    expect(snapshot.billingAddress).toBeNull();
    expect(snapshot.contact).toBeNull();
    expect(snapshot.displayName).toBe("Jean Dupont");
    expect(validateDocumentRecipientSnapshot(snapshot).ok).toBe(true);
  });

  it("fige l'adresse de facturation, pas l'adresse de chantier", () => {
    const details = makeDetails({
      addresses: [
        makeAddress({ roles: ["primary", "billing"] }),
        makeAddress({
          id: asClientAddressId("dddddddd-dddd-4ddd-8ddd-dddddddddd02"),
          roles: ["site"],
          city: "Haguenau",
          postalCode: "67500",
          line1: "Chantier Nord",
        }),
      ],
    });
    const snapshot = captureDocumentRecipient(details, { capturedAt: CAPTURED_AT });
    expect(snapshot.billingAddress?.city).toBe("Strasbourg");
  });

  it("est une fonction pure : deux captures de la même fiche au même instant sont identiques", () => {
    const details = makeDetails();
    const first = captureDocumentRecipient(details, { capturedAt: CAPTURED_AT });
    const second = captureDocumentRecipient(details, { capturedAt: CAPTURED_AT });
    expect(serializeDocumentRecipientSnapshot(first)).toBe(serializeDocumentRecipientSnapshot(second));
  });
});

describe("autonomie du snapshot — le P0 de l'audit", () => {
  it("rend un bloc destinataire complet sans jamais consulter la fiche client", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    // `renderRecipientBlock` n'accepte QUE le snapshot : sa seule exécution prouve qu'aucune
    // résolution de `sourceClientId` n'est nécessaire pour imprimer le document.
    expect(renderRecipientBlock(snapshot)).toEqual([
      "MENUISERIE MULLER",
      "À l'attention de Claire Muller (Conductrice de travaux)",
      "12 rue des Tanneurs",
      "67000 Strasbourg",
      "SIRET : 73282932000009",
      "TVA : FR44732829320",
    ]);
  });

  it("ne bouge pas quand la fiche client change après l'émission", () => {
    const before = makeDetails();
    const snapshot = captureDocumentRecipient(before, { capturedAt: CAPTURED_AT });
    const rendered = renderRecipientBlock(snapshot);

    // La fiche déménage, change de raison sociale et corrige son SIRET.
    const after = makeDetails({
      identity: makeIdentity({
        legalName: "MULLER AGENCEMENT",
        legal: { ...makeIdentity().legal!, siret: "73282932000017" },
      }),
      addresses: [makeAddress({ line1: "1 place Kléber", postalCode: "67100", city: "Strasbourg" })],
    });

    expect(renderRecipientBlock(snapshot)).toEqual(rendered);
    expect(snapshot.displayName).toBe("MENUISERIE MULLER");
    expect(after.identity.displayName).toBe("MULLER AGENCEMENT");
  });

  it("sait nommer la divergence sans jamais corriger le document", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    const after = makeDetails({
      identity: makeIdentity({ legalName: "MULLER AGENCEMENT", email: "nouveau@muller.example.fr" }),
      addresses: [makeAddress({ city: "Colmar", postalCode: "68000" })],
    });

    const divergences = diffSnapshotAgainstClient(snapshot, after);
    expect(divergences).toContain("displayName");
    expect(divergences).toContain("legalName");
    expect(divergences).toContain("email");
    expect(divergences).toContain("billingAddress");
  });

  it("ne signale aucune divergence face à la fiche inchangée", () => {
    const details = makeDetails();
    const snapshot = captureDocumentRecipient(details, { capturedAt: CAPTURED_AT });
    expect(diffSnapshotAgainstClient(snapshot, details)).toEqual([]);
  });

  it("ne porte aucun champ de la fiche vivante qui n'a rien à faire dans un document", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    const keys = Object.keys(snapshot);
    for (const forbidden of ["status", "notes", "addresses", "contacts", "references", "identity", "createdAt"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("porte une adresse nue, sans identifiant ni rôle qui pointerait vers un enregistrement vivant", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    const addressKeys = Object.keys(snapshot.billingAddress ?? {});
    expect(addressKeys.sort()).toEqual(["city", "country", "line1", "line2", "postalCode", "region"]);
  });
});

describe("validation et transport", () => {
  it("refuse un snapshot sans nom imprimable", () => {
    const snapshot = { ...captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT }), displayName: "  " };
    const result = validateDocumentRecipientSnapshot(snapshot);
    expect(result.ok).toBe(false);
  });

  it("refuse un snapshot dont billingAddress serait simplement absent plutôt que null", () => {
    const snapshot: Record<string, unknown> = {
      ...captureDocumentRecipient(makeMinimalIndividual(), { capturedAt: CAPTURED_AT }),
    };
    delete snapshot["billingAddress"];
    const result = validateDocumentRecipientSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toContain("billingAddress");
  });

  it("survit à un aller-retour JSON", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    const parsed = parseDocumentRecipientSnapshot(serializeDocumentRecipientSnapshot(snapshot));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(renderRecipientBlock(parsed.value)).toEqual(renderRecipientBlock(snapshot));
  });

  it("date la fiche source au moment de la capture", () => {
    const snapshot = captureDocumentRecipient(makeDetails(), { capturedAt: CAPTURED_AT });
    expect(snapshot.sourceClientUpdatedAt).toBe(NOW);
  });
});
