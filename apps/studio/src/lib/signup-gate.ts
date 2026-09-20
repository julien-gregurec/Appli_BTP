/** Registration gate: no public opening yet (decision Q-007). Pure, unit-tested. */
export type SignupMode = "open" | "allowlist" | "closed";
export function parseSignupMode(value: string | undefined): SignupMode {
  const v = (value ?? "open").trim().toLowerCase();
  return v === "allowlist" || v === "closed" ? v : "open";
}
/** Entries are full addresses or `@domain.tld`; comparison is case-insensitive. */
export function isAllowlisted(email: string, list: string | undefined): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.slice(address.lastIndexOf("@"));
  return (list ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => entry === address || (entry.startsWith("@") && entry === domain));
}
export function signupDecision(
  mode: SignupMode,
  email: string,
  allowlist: string | undefined,
  hasInvitation: boolean,
): boolean {
  if (mode === "open") return true;
  if (hasInvitation) return true;
  return mode === "allowlist" && isAllowlisted(email, allowlist);
}
