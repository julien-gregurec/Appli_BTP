export type StudioSignupMode = "open" | "allowlist" | "closed";
/** Fail-closed: anything other than the two explicit open modes denies signup. */
export function studioSignupMode(value: string | undefined): StudioSignupMode {
  return value === "open" || value === "allowlist" ? value : "closed";
}
/** Fail-closed: an empty or missing allowlist matches nobody. */
export function isStudioSignupAllowlisted(
  email: string,
  allowlist: string | undefined,
): boolean {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) =>
      entry.startsWith("@") ? domain === entry.slice(1) : normalized === entry,
    );
}
/** Kill switch: fail-open by design (an unset variable must not take the whole app down). */
export function studioEnabled(value: string | undefined): boolean {
  return !["0", "false", "off"].includes((value ?? "").trim().toLowerCase());
}
/** Fail-closed: only the explicit "1" marks Studio's legal/consent flow as published. */
export function studioLegalPublished(value: string | undefined): boolean {
  return value === "1";
}
