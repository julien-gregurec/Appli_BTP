/**
 * Jeux de données de test partagés (domaine, adaptateurs, interface). Aucun usage en
 * production : ce module n'est pas réexporté par `index.ts`.
 */

import { asTenantId, asUserId, type ReleveId } from "./ids";
import type { ReleveActorContext, ReleveRole } from "./permissions";
import type { Releve } from "./model";

export const TENANT_A = asTenantId("a0000000-0000-0000-0000-000000000001");
export const TENANT_B = asTenantId("b0000000-0000-0000-0000-000000000001");
export const USER_OWNER = asUserId("10000000-0000-0000-0000-000000000003");
export const USER_OTHER = asUserId("10000000-0000-0000-0000-000000000004");
export const USER_ADMIN = asUserId("10000000-0000-0000-0000-000000000006");

export function actor(overrides: Partial<ReleveActorContext> & { role?: ReleveRole | null } = {}): ReleveActorContext {
  return {
    userId: USER_OWNER, tenantId: TENANT_A, tenantHasTools: true, hasReleveCapability: true,
    role: "tools_releve_metreur", gpGererOuvrages: false, ...overrides,
  };
}

/** Générateur d'UUID déterministe : `00000000-0000-4000-8000-00000000000n`. */
export function sequentialUuid(prefix = "0000"): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix.padStart(8, "0")}-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };
}

export function fixedClock(start = Date.parse("2026-09-26T10:00:00.000Z")): () => string {
  let tick = 0;
  return () => new Date(start + (tick++) * 1000).toISOString();
}

export function releveFixture(overrides: Partial<Releve> = {}): Releve {
  return {
    id: "e1000000-0000-0000-0000-000000000001" as ReleveId, kind: "releve", schemaVersion: 1, entrepriseId: TENANT_A,
    proprietaireId: USER_OWNER, nom: "Relevé appartement", reference: null, statut: "brouillon", visibilite: "prive",
    chantier: { nom: "Rue des Lilas", adresse: null, codePostal: "67000", ville: "Strasbourg", gpChantierId: null },
    client: { nom: null, gpClientId: null }, dateReleve: null, notes: null,
    createdAt: "2026-09-26T10:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z", createdBy: USER_OWNER, updatedBy: USER_OWNER,
    revision: 1, deletedAt: null, ...overrides,
  };
}
