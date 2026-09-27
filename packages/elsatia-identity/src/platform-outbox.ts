// Côté plateforme : livraison des événements de cycle de vie (boîte d'envoi transactionnelle).
// Les événements sont écrits en base par un trigger sur auth.users, dans la même transaction que
// le ban / la suppression : aucune désactivation ne peut « oublier » d'être notifiée. Ce module
// les réclame par lots (verrou SKIP LOCKED côté SQL), les signe au moment de l'envoi et applique
// un recul exponentiel en cas d'échec. L'événement portant l'ÉTAT (pas un delta) et une séquence,
// une livraison en double ou dans le désordre est sans effet côté destinataire.
import {
  IdentityError,
  type AccountState,
  type Entitlement,
  type LifecycleReason,
} from "./contract";
import type { IdentityIssuer } from "./issuer";

export interface OutboxRow {
  seq: number;
  eventId: string;
  audience: string;
  subject: string;
  account: AccountState;
  reason: LifecycleReason;
  attempts: number;
  email: string | null;
}

export interface OutboxStore {
  /** Réclame jusqu'à `limit` événements dus, avec un bail (pas de double envoi concurrent). */
  claim(limit: number): Promise<OutboxRow[]>;
  delivered(seq: number): Promise<void>;
  failed(seq: number, error: string, retryInS: number): Promise<void>;
  /** Ré-émet l'état courant des sujets dont l'état livré diverge (ban temporaire expiré, envoi mort). */
  resync(limit: number): Promise<number>;
}

export type Deliver = (audience: string, token: string) => Promise<{ status: number; body?: unknown }>;

export const MAX_BACKOFF_S = 3600;
export function backoffSeconds(attempts: number): number {
  return Math.min(MAX_BACKOFF_S, 15 * 2 ** Math.max(0, Math.min(attempts - 1, 12)));
}

export interface DispatchOptions {
  store: OutboxStore;
  issuer: IdentityIssuer;
  deliver: Deliver;
  /** Décision d'accès courante pour un compte actif (null = inchangée). */
  entitlementFor?: (row: OutboxRow) => Entitlement | null;
  limit?: number;
}

export async function dispatchOutbox(options: DispatchOptions) {
  const resynced = await options.store.resync(options.limit ?? 50);
  const rows = await options.store.claim(options.limit ?? 50);
  const summary = { resynced, claimed: rows.length, delivered: 0, failed: 0, errors: [] as string[] };
  for (const row of rows) {
    try {
      const { token } = options.issuer.issueLifecycle({
        subject: row.subject,
        audience: row.audience,
        eventId: row.eventId,
        seq: row.seq,
        account: row.account,
        reason: row.reason,
        ent: row.account === "active" ? (options.entitlementFor?.(row) ?? null) : null,
      });
      const response = await options.deliver(row.audience, token);
      if (response.status >= 200 && response.status < 300) {
        await options.store.delivered(row.seq);
        summary.delivered++;
        continue;
      }
      // Tout refus est réessayé : un 400 UNKNOWN_KID pendant une rotation, un 503 pendant une panne
      // Studio sont transitoires ; un vrai rejet finit « mort » et est signalé par la supervision.
      throw new IdentityError("PLATFORM_UNAVAILABLE", { detail: `HTTP ${response.status} ${JSON.stringify(response.body ?? null).slice(0, 200)}` });
    } catch (error) {
      summary.failed++;
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${row.seq}:${message.slice(0, 200)}`);
      await options.store.failed(row.seq, message.slice(0, 500), backoffSeconds(row.attempts));
    }
  }
  return summary;
}

/** Livraison HTTP vers les points d'entrée configurés par audience (https, pas de redirection). */
export function httpDeliver(endpoints: Record<string, string>, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Deliver {
  return async (audience, token) => {
    const url = endpoints[audience];
    if (!url) throw new IdentityError("CONFIG_INVALID", { detail: `aucun point d'entrée pour ${audience}` });
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/jwt" },
      body: token,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}
