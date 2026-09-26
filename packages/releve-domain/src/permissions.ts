/**
 * Permissions Relevé & Métré.
 *
 * Cette matrice est la **copie conforme** de `tools_releve_action_autorisee()` et
 * `tools_releve_peut()` (migration `tools_releve_metre_foundation_v1`). Le serveur reste la
 * seule autorité — RLS et RPC —, ce module sert à ne pas proposer dans l'interface une action
 * que le serveur refusera. Un test de parité (`permissions.test.ts`) fige la table ; toute
 * évolution se fait des deux côtés dans le même lot.
 *
 * Trois dimensions, toutes obligatoires :
 * 1. **Organisation** — l'entreprise a Tools activé et l'utilisateur en est membre actif
 *    (`a_acces_application(entreprise, 'tools')`).
 * 2. **Entitlement personnel** — l'utilisateur détient la capability `releve-metre`
 *    (tarification par utilisateur).
 * 3. **Rôle applicatif** — rôle Tools de l'utilisateur dans cette entreprise, combiné à la
 *    propriété et à la visibilité du relevé.
 */

import type { TenantId, UserId } from "./ids";
import type { ReleveVisibilite } from "./model";

export const RELEVE_ACTIONS = ["view", "create", "edit", "delete", "share", "export", "sync-gp"] as const;
export type ReleveAction = (typeof RELEVE_ACTIONS)[number];

/**
 * Rôles Tools qui ouvrent le module. `tools_pro` (rôle historique R8) est traité comme un
 * métreur : il n'obtient ni la vue des relevés privés des autres, ni l'administration.
 */
export const RELEVE_ROLES = ["tools_releve_admin", "tools_releve_metreur", "tools_releve_consultation", "tools_pro"] as const;
export type ReleveRole = (typeof RELEVE_ROLES)[number];

export type ReleveRoleProfile = "admin" | "metreur" | "consultation";
export function roleProfile(role: ReleveRole): ReleveRoleProfile {
  if (role === "tools_releve_admin") return "admin";
  if (role === "tools_releve_consultation") return "consultation";
  return "metreur";
}

export type ReleveActorContext = {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  /** Accès applicatif de l'organisation (`a_acces_application(tenant,'tools')`). */
  readonly tenantHasTools: boolean;
  /** Capability personnelle `releve-metre` résolue par le serveur. */
  readonly hasReleveCapability: boolean;
  readonly role: ReleveRole | null;
  /** Permission Gestion Pro `gerer_ouvrages` dans le même tenant (double autorisation GP). */
  readonly gpGererOuvrages: boolean;
};

export type ReleveSubject = {
  readonly entrepriseId: TenantId;
  readonly proprietaireId: UserId;
  readonly visibilite: ReleveVisibilite;
  readonly deletedAt: string | null;
};

export const RELEVE_DENIAL_REASONS = [
  "tenant_access", "entitlement", "role", "cross_tenant", "ownership", "deleted", "gp_permission",
] as const;
export type ReleveDenialReason = (typeof RELEVE_DENIAL_REASONS)[number];
export type ReleveDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: ReleveDenialReason };

const ALLOW: ReleveDecision = { allowed: true };
const deny = (reason: ReleveDenialReason): ReleveDecision => ({ allowed: false, reason });

/** Niveau organisation : l'action est-elle possible dans ce tenant, avant tout relevé ? */
export function tenantDecision(ctx: ReleveActorContext, action: ReleveAction): ReleveDecision {
  if (!ctx.tenantHasTools) return deny("tenant_access");
  if (!ctx.hasReleveCapability) return deny("entitlement");
  if (!ctx.role) return deny("role");
  const profile = roleProfile(ctx.role);
  if (action === "view" || action === "export") return ALLOW;
  if (profile === "consultation") return deny("role");
  if (action === "sync-gp" && !ctx.gpGererOuvrages) return deny("gp_permission");
  return ALLOW;
}

/**
 * Niveau objet. Sans `subject`, seule `create` a un sens (décision organisation).
 *
 * | action  | admin            | métreur / tools_pro           | consultation |
 * |---------|------------------|-------------------------------|--------------|
 * | view    | tous             | propres + partagés            | partagés     |
 * | create  | oui              | oui                           | non          |
 * | edit    | tous             | propres + partagés            | non          |
 * | delete  | tous             | propres                       | non          |
 * | share   | tous             | propres                       | non          |
 * | export  | = view           | = view                        | = view       |
 * | sync-gp | tous + GP        | propres + partagés, + GP      | non          |
 *
 * Un relevé supprimé (suppression douce) n'autorise plus que `view` et `delete` (pour la
 * corbeille et la restauration), et seulement à ceux qui ont `delete` dessus.
 */
export function canPerform(ctx: ReleveActorContext, action: ReleveAction, subject?: ReleveSubject): ReleveDecision {
  const base = tenantDecision(ctx, action);
  if (!base.allowed) return base;
  if (!subject) return action === "create" ? ALLOW : deny("role");
  if (subject.entrepriseId !== ctx.tenantId) return deny("cross_tenant");
  if (action === "create") return ALLOW;

  const profile = roleProfile(ctx.role!);
  const owner = subject.proprietaireId === ctx.userId;
  const shared = subject.visibilite === "entreprise";

  const ownerOrAdmin = profile === "admin" || (profile === "metreur" && owner);
  if (subject.deletedAt) {
    if (action !== "view" && action !== "delete") return deny("deleted");
    return ownerOrAdmin ? ALLOW : deny("deleted");
  }

  const canView = profile === "admin" || owner || shared;
  switch (action) {
    case "view":
    case "export":
      return canView ? ALLOW : deny("ownership");
    case "edit":
    case "sync-gp":
      return profile === "admin" || (profile === "metreur" && (owner || shared)) ? ALLOW : deny("ownership");
    case "delete":
    case "share":
      return ownerOrAdmin ? ALLOW : deny("ownership");
  }
}

/**
 * Actions ouvertes. Avec un `subject`, `create` est exclu : c'est une décision
 * d'organisation, jamais une action sur un relevé existant (`tools_releve_peut(_, 'create')`
 * vaut toujours faux côté SQL).
 */
export function allowedActions(ctx: ReleveActorContext, subject?: ReleveSubject): ReleveAction[] {
  return RELEVE_ACTIONS.filter((action) => !(subject && action === "create") && canPerform(ctx, action, subject).allowed);
}

export const RELEVE_DENIAL_MESSAGES: Record<ReleveDenialReason, string> = {
  tenant_access: "ELSATIA Tools n'est pas activé pour cette entreprise.",
  entitlement: "Module Relevé & Métré non inclus dans votre abonnement.",
  role: "Votre rôle Tools ne permet pas cette action.",
  cross_tenant: "Ce relevé appartient à une autre entreprise.",
  ownership: "Ce relevé n'est pas partagé avec vous.",
  deleted: "Ce relevé est dans la corbeille.",
  gp_permission: "La permission Gestion Pro « Ouvrages et métrés » est requise.",
};
