// Broker d'identité côté application à projet dédié (Studio).
// Transforme un jeton de passage vérifié en utilisateur + session du projet Studio, et applique
// les événements de cycle de vie poussés par la plateforme. Toutes les dépendances sont des ports
// (base Studio, admin Auth Studio, ouverture de session) : le cœur est testable contre la mémoire
// comme contre un vrai GoTrue + PostgreSQL.
import {
  IdentityError,
  isIdentityError,
  type AccountState,
  type Entitlement,
  type HandoffClaims,
  type IdentityErrorCode,
  type LifecycleClaims,
} from "./contract";
import { nonceForState } from "./subject";
import type { IdentityVerifier } from "./verifier";

export type StudioAccess = "full" | "read_only";

/** Base du projet Studio (tables `studio_identity.*`, RPC réservées à service_role). */
export interface StudioIdentityStore {
  /** Insère le jti ; false s'il était déjà consommé. Sûr en concurrence (clé primaire). */
  consumeHandoff(jti: string, expiresAt: Date): Promise<boolean>;
  /**
   * Accepte le passage pour le sujet : applique « actif à la séquence seq » si c'est plus récent
   * que l'état local, sinon garde l'état local (désactivation reçue après l'émission).
   */
  acceptHandoff(input: { subject: string; seq: number; ent: Entitlement }): Promise<{
    account: AccountState;
    userId: string | null;
    email: string | null;
    unbanRequired: boolean;
  }>;
  /** Utilisateur Auth Studio portant cet e-mail et son sujet ELSATIA (app_metadata), s'il existe. */
  userByEmail(email: string): Promise<{ userId: string; subject: string | null } | null>;
  /** Écrit le lien sujet → utilisateur. `exists` = même lien déjà présent (course bénigne). */
  link(input: { subject: string; userId: string; email: string }): Promise<"linked" | "exists" | "conflict">;
  recordHandoff(input: { subject: string; email: string }): Promise<void>;
  registerSession(input: { sessionId: string; userId: string; subject: string }): Promise<void>;
  /** Transaction unique : dédoublonnage, ordre par seq, état, suppression des sessions si coupure. */
  applyLifecycle(event: LifecycleClaims): Promise<{
    status: "applied" | "stale" | "duplicate";
    userId: string | null;
    account: AccountState;
  }>;
  /** Utilisateurs dont l'état de ban GoTrue n'est pas encore confirmé conforme à l'état voulu. */
  banDrift(limit: number): Promise<Array<{ userId: string; banned: boolean }>>;
  confirmBan(userId: string, banned: boolean): Promise<void>;
  purge(): Promise<{ handoffs: number; events: number }>;
}

/** Admin Auth du projet Studio (clé service Studio uniquement). */
export interface StudioAuthAdminPort {
  /** Lève IdentityError("EMAIL_EXISTS") si l'adresse existe déjà (séquentiel OU concurrent). */
  createUser(input: { email: string; subject: string }): Promise<{ id: string }>;
  setBanned(userId: string, banned: boolean): Promise<void>;
  /** Resynchronise l'e-mail Studio après un changement côté plateforme (meilleur effort). */
  updateEmail(userId: string, email: string): Promise<void>;
}

/** Ouvre une session émise par GoTrue Studio lui-même (aucun JWT forgé). */
export interface StudioSessionPort {
  open(user: { userId: string }): Promise<{ sessionId: string }>;
}

export interface StudioBrokerOptions {
  verifier: IdentityVerifier;
  store: StudioIdentityStore;
  auth: StudioAuthAdminPort;
  /** Précondition locale à toute création de compte (ex. CGU Studio publiées). Fail-closed. */
  canProvision?: () => boolean;
  log?: (event: string, detail: Record<string, unknown>) => void;
}

// Toute panne d'infrastructure devient un code stable ; un code métier déjà levé traverse tel quel.
function infra(code: IdentityErrorCode) {
  return (error: unknown): never => {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError(code, { cause: error });
  };
}

export function createStudioIdentityBroker(options: StudioBrokerOptions) {
  const { verifier, store, auth } = options;
  const log = options.log ?? (() => {});
  const db = infra("STUDIO_DB_UNAVAILABLE");
  const authDown = infra("STUDIO_AUTH_UNAVAILABLE");

  async function provision(claims: HandoffClaims): Promise<string> {
    if (options.canProvision && !options.canProvision()) throw new IdentityError("NOT_ENTITLED");
    // Reprise idempotente : un provisioning interrompu (utilisateur créé, lien non écrit) laisse un
    // utilisateur portant app_metadata.elsatia_subject, que seule la clé service peut écrire.
    const existing = await store.userByEmail(claims.email).catch(db);
    if (existing) {
      if (existing.subject === claims.sub) return existing.userId;
      // Jamais de rattachement automatique par e-mail : prise de compte triviale sinon.
      throw new IdentityError("ACCOUNT_LINK_REQUIRED");
    }
    try {
      return (await auth.createUser({ email: claims.email, subject: claims.sub }).catch(authDown)).id;
    } catch (error) {
      // Course : un échange concurrent du même sujet vient de créer l'utilisateur. GoTrue v2.192.0
      // répond alors 500 (23505 users_email_partial_key), que supabase-js rend opaque (« 500 {} ») :
      // après TOUT échec de création, on relit par e-mail et on n'adopte que le même sujet.
      const raced = await store.userByEmail(claims.email).catch(db);
      if (raced?.subject === claims.sub) return raced.userId;
      if (raced || isIdentityError(error, "EMAIL_EXISTS")) throw new IdentityError("ACCOUNT_LINK_REQUIRED");
      throw error;
    }
  }

  return {
    /**
     * « Continuer avec mon compte ELSATIA ». `state` = valeur du cookie httpOnly posé au départ.
     * Ordre : signature et contrat → jti consommé (AVANT tout effet) → état du sujet → lien ou
     * création → session GoTrue Studio → enregistrement de la session.
     */
    async exchange(token: unknown, state: string, sessions: StudioSessionPort) {
      const claims = await verifier.verifyHandoff(token, nonceForState(state));
      if (!(await store.consumeHandoff(claims.jti, new Date(claims.exp * 1000)).catch(db)))
        throw new IdentityError("REPLAY");

      const accepted = await store.acceptHandoff({ subject: claims.sub, seq: claims.seq, ent: claims.ent }).catch(db);
      if (accepted.account !== "active") throw new IdentityError("ACCOUNT_DISABLED");

      let userId = accepted.userId;
      if (!userId) {
        if (!claims.ent.granted) throw new IdentityError("NOT_ENTITLED"); // jamais de compte sans droit
        userId = await provision(claims);
        const linked = await store.link({ subject: claims.sub, userId, email: claims.email }).catch(db);
        if (linked === "conflict") throw new IdentityError("LINK_CONFLICT");
      } else if (accepted.email !== claims.email) {
        // Changement d'e-mail côté plateforme : même utilisateur (lien par sujet), e-mail resynchronisé.
        await auth.updateEmail(userId, claims.email).catch((error) => log("email_sync_failed", { error: String(error) }));
      }
      if (accepted.unbanRequired) {
        // Réactivation connue par ce passage avant l'événement : lever le ban maintenant, sinon la
        // réconciliation le fera (l'état voulu est déjà « non banni » en base).
        await auth
          .setBanned(userId, false)
          .then(() => store.confirmBan(userId!, false))
          .catch((error) => log("unban_deferred", { error: String(error) }));
      }
      await store.recordHandoff({ subject: claims.sub, email: claims.email }).catch(db);

      const session = await sessions.open({ userId }).catch(authDown);
      await store.registerSession({ sessionId: session.sessionId, userId, subject: claims.sub }).catch(db);
      log("exchange_ok", { subject: claims.sub, created: !accepted.userId });
      return {
        userId,
        sessionId: session.sessionId,
        created: !accepted.userId,
        access: (claims.ent.granted ? "full" : "read_only") as StudioAccess,
      };
    },

    /**
     * Webhook plateforme → Studio. Idempotent (jti), ordonné (seq), transactionnel côté base :
     * l'état et la suppression des sessions sont écrits ensemble ; le ban GoTrue suit, et s'il
     * échoue, la réconciliation le rejoue (l'état « désactivé » suffit déjà à tout refuser).
     */
    async applyLifecycle(token: unknown) {
      const claims = await verifier.verifyLifecycle(token);
      const result = await store.applyLifecycle(claims).catch(db);
      let banPending = false;
      if (result.status === "applied" && result.userId) {
        const banned = result.account !== "active";
        try {
          await auth.setBanned(result.userId, banned);
          await store.confirmBan(result.userId, banned);
        } catch (error) {
          banPending = true;
          log("ban_deferred", { error: String(error) });
        }
      }
      log("lifecycle", { status: result.status, account: result.account, seq: claims.seq });
      return { ...result, banPending, seq: claims.seq };
    },

    /** Réconciliation périodique : bans non confirmés, purge des jti et événements expirés. */
    async reconcile(limit = 100) {
      const drift = await store.banDrift(limit).catch(db);
      let fixed = 0;
      const failed: string[] = [];
      for (const item of drift) {
        try {
          await auth.setBanned(item.userId, item.banned);
          await store.confirmBan(item.userId, item.banned);
          fixed++;
        } catch {
          failed.push(item.userId);
        }
      }
      const purged = await store.purge().catch(db);
      return { drift: drift.length, fixed, failed, purged };
    },
  };
}

export type StudioIdentityBroker = ReturnType<typeof createStudioIdentityBroker>;
