import type { Entitlement } from "./contract";

export type StudioAccessMode = "open" | "allowlist" | "closed";

/** FAIL-CLOSED : absent ou inconnu = fermé. */
export function studioAccessMode(value: string | undefined): StudioAccessMode {
  const v = value?.trim().toLowerCase();
  return v === "open" || v === "allowlist" ? v : "closed";
}

/** Entrées séparées par des virgules : adresses exactes ou `@domaine`. Vide = personne. */
export function isAllowlisted(email: string, allowlist: string | undefined): boolean {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const domain = address.slice(at);
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}

/**
 * Décision d'accès Studio calculée par la PLATEFORME (autorité unique). Studio n'a pas encore de
 * facturation : la décision est une politique d'ouverture ; le jour où un catalogue Studio existe,
 * seule cette fonction change, le contrat (`ent`) reste le même.
 */
export function studioEntitlement(email: string, env: { mode?: string; allowlist?: string; plan?: string }): Entitlement {
  const mode = studioAccessMode(env.mode);
  const granted = mode === "open" || (mode === "allowlist" && isAllowlisted(email, env.allowlist));
  return { granted, plan: granted ? (env.plan?.trim() || "studio") : null, valid_until: null };
}
