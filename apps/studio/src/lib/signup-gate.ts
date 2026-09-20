/**
 * Registration gate. The decision itself lives in the database (`studio_signup_permitted`, table
 * `studio_signup_policy`, default `closed`) and is enforced by the Auth hook `before_user_created`, by
 * `studio_create_workspace` and by the `signup` server action: one source of truth, none of it in the
 * environment. This module only holds the fail-closed reading of what the database answers.
 */
export type SignupMode = "open" | "allowlist" | "closed";
/** Anything that is not a known mode — including an absent value — is `closed`. */
export function parseSignupMode(value: string | null | undefined): SignupMode {
  const v = (value ?? "").trim().toLowerCase();
  return v === "open" || v === "allowlist" ? v : "closed";
}
/** Only an explicit `true` from the database admits; an RPC error, a null or any other value refuses. */
export function interpretSignupPermitted(
  data: unknown,
  error: unknown,
): boolean {
  return !error && data === true;
}
