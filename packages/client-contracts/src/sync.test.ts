import { describe, expect, it } from "vitest";

import {
  buildIdempotencyKey,
  canWriteDirectly,
  createSyncEnvelopeBase,
  detectClientSyncConflict,
  validateClientSyncEnvelope,
  type ClientRemoteState,
  type ClientSyncEnvelope,
  type ClientSyncScope,
} from "./sync";
import { parseClientSyncEnvelope, serializeClientSyncEnvelope } from "./serialization";
import { asActorId } from "./ids";
import { CLIENT_A, EARLIER, NOW, TENANT_A, TENANT_B } from "./fixtures";

const ACTOR = asActorId("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");

function envelope(
  overrides: Partial<ClientSyncEnvelope> = {},
  scopes: readonly ClientSyncScope[] = ["client:propose"],
  sourceApp: "gestion_pro" | "reserves" | "drone" = "drone",
): ClientSyncEnvelope {
  return {
    ...createSyncEnvelopeBase({
      idempotencyKey: "drone:projet-17:create",
      sourceApp,
      targetApp: "gestion_pro",
      tenantId: TENANT_A,
      actor: { actorId: ACTOR, tenantId: TENANT_A, scopes },
      occurredAt: NOW,
      externalReference: "projet-17",
    }),
    operation: "create",
    payload: { tenantId: TENANT_A, category: "professionnel", legalName: "TOITURE VOSGES" },
    ...overrides,
  } as ClientSyncEnvelope;
}

const REMOTE_PRESENT: ClientRemoteState = {
  exists: true,
  tenantId: TENANT_A,
  clientId: CLIENT_A,
  updatedAt: NOW,
  archived: false,
};

function codes(result: { ok: boolean; issues?: readonly { path: string; code: string }[] }): readonly string[] {
  return result.ok ? [] : (result.issues ?? []).map((issue) => `${issue.path}:${issue.code}`);
}

describe("enveloppe", () => {
  it("accepte une proposition de création émise par une application tierce", () => {
    expect(validateClientSyncEnvelope(envelope()).ok).toBe(true);
  });

  it("survit à un aller-retour JSON", () => {
    const parsed = parseClientSyncEnvelope(serializeClientSyncEnvelope(envelope()));
    expect(parsed.ok).toBe(true);
  });

  it("refuse une charge utile visant un autre locataire que l'enveloppe", () => {
    const result = validateClientSyncEnvelope(
      envelope({ payload: { tenantId: TENANT_B, category: "professionnel", legalName: "TOITURE VOSGES" } }),
    );
    expect(codes(result)).toContain("payload.tenantId:tenant_mismatch");
  });

  it("refuse un acteur d'un autre locataire", () => {
    const result = validateClientSyncEnvelope(
      envelope({ actor: { actorId: ACTOR, tenantId: TENANT_B, scopes: ["client:propose"] } }),
    );
    expect(codes(result)).toContain("actor.tenantId:tenant_mismatch");
  });

  it("refuse la portée client:write à une application qui ne fait pas autorité", () => {
    const result = validateClientSyncEnvelope(envelope({}, ["client:write"], "reserves"));
    expect(codes(result)).toContain("actor.scopes:invariant_violated");
  });

  it("accorde client:write à Gestion Pro", () => {
    const result = validateClientSyncEnvelope(envelope({}, ["client:write"], "gestion_pro"));
    expect(result.ok).toBe(true);
    expect(canWriteDirectly(envelope({}, ["client:write"], "gestion_pro"))).toBe(true);
    expect(canWriteDirectly(envelope({}, ["client:propose"], "drone"))).toBe(false);
  });

  it("refuse une enveloppe sans clé d'idempotence", () => {
    expect(codes(validateClientSyncEnvelope(envelope({ idempotencyKey: "" })))).toContain("idempotencyKey:required");
  });

  it("exige un clientId pour un archivage", () => {
    const result = validateClientSyncEnvelope(
      envelope({ operation: "archive", expectedUpdatedAt: NOW, reason: null } as unknown as ClientSyncEnvelope),
    );
    expect(codes(result)).toContain("clientId:required");
  });

  it("produit une clé d'idempotence déterministe", () => {
    const parts = {
      sourceApp: "drone" as const,
      tenantId: TENANT_A,
      operation: "create" as const,
      subject: "projet-17",
      occurredAt: NOW,
    };
    expect(buildIdempotencyKey(parts)).toBe(buildIdempotencyKey(parts));
  });
});

describe("détection de conflit", () => {
  it("ne signale rien sur une création valide", () => {
    expect(detectClientSyncConflict(envelope(), { ...REMOTE_PRESENT, exists: false })).toBeNull();
  });

  it("signale une version périmée", () => {
    const update = envelope({
      operation: "update",
      payload: { tenantId: TENANT_A, clientId: CLIENT_A, expectedUpdatedAt: EARLIER, notes: "rappel" },
    } as unknown as ClientSyncEnvelope);
    const conflict = detectClientSyncConflict(update, REMOTE_PRESENT);
    expect(conflict?.kind).toBe("version_mismatch");
    expect(conflict?.resolution).toBe("manual");
    expect(conflict?.expectedUpdatedAt).toBe(EARLIER);
    expect(conflict?.actualUpdatedAt).toBe(NOW);
  });

  it("ne signale rien quand la version attendue correspond", () => {
    const update = envelope({
      operation: "update",
      payload: { tenantId: TENANT_A, clientId: CLIENT_A, expectedUpdatedAt: NOW, notes: "rappel" },
    } as unknown as ClientSyncEnvelope);
    expect(detectClientSyncConflict(update, REMOTE_PRESENT)).toBeNull();
  });

  it("fait primer le locataire sur toute autre anomalie, pour ne rien divulguer", () => {
    const update = envelope({
      operation: "update",
      payload: { tenantId: TENANT_A, clientId: CLIENT_A, expectedUpdatedAt: EARLIER },
    } as unknown as ClientSyncEnvelope);
    const conflict = detectClientSyncConflict(update, { ...REMOTE_PRESENT, tenantId: TENANT_B });
    expect(conflict?.kind).toBe("tenant_mismatch");
    expect(conflict?.resolution).toBe("rejected");
  });

  it("refuse une écriture directe demandée sans la portée correspondante", () => {
    const direct = envelope({}, ["client:read"], "gestion_pro");
    expect(detectClientSyncConflict(direct, REMOTE_PRESENT)?.kind).toBe("permission_denied");
  });

  it("signale une cible inexistante", () => {
    const update = envelope({
      operation: "update",
      payload: { tenantId: TENANT_A, clientId: CLIENT_A },
    } as unknown as ClientSyncEnvelope);
    expect(detectClientSyncConflict(update, { ...REMOTE_PRESENT, exists: false })?.kind).toBe("client_not_found");
  });

  it("signale une fiche archivée, mais laisse passer la rupture de liaison", () => {
    const archived = { ...REMOTE_PRESENT, archived: true };
    const update = envelope({
      operation: "update",
      payload: { tenantId: TENANT_A, clientId: CLIENT_A },
    } as unknown as ClientSyncEnvelope);
    expect(detectClientSyncConflict(update, archived)?.kind).toBe("client_archived");

    const unlink = envelope({ operation: "unlink", clientId: CLIENT_A, reason: null } as unknown as ClientSyncEnvelope);
    expect(detectClientSyncConflict(unlink, archived)).toBeNull();
  });
});
