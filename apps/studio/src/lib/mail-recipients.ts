/**
 * Recipient guard for Studio e-mails — same rule as packages/email (destinataires.ts,
 * environnement.ts), kept local because Studio is built in isolation from the shared packages.
 * Outside a PROVEN production (ELSATIA_APPLICATION_ENV=production and VERCEL_ENV absent or
 * "production"), a recipient is served only if listed in EMAIL_PREVIEW_ALLOWLIST (exact addresses
 * or whole "@domain" entries, no wildcard). Empty or missing list: nobody is served, and the caller
 * falls back to showing the link to copy.
 */
type Env = Record<string, string | undefined>;

const ADDRESS =
  /^[^\s@,;<>"'()\\]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/;

function normalize(value: string): string | null {
  const address = value.trim().toLowerCase();
  if (!address || address.length > 254) return null;
  return ADDRESS.test(address) ? address : null;
}

export function isProvenProduction(env: Env): boolean {
  const vercel = env.VERCEL_ENV?.trim();
  return env.ELSATIA_APPLICATION_ENV?.trim() === "production" && (!vercel || vercel === "production");
}

export function mayEmail(recipient: string, env: Env = process.env): boolean {
  const address = normalize(recipient);
  if (!address) return false;
  if (isProvenProduction(env)) return true;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  for (const raw of (env.EMAIL_PREVIEW_ALLOWLIST ?? "").split(/[,;\s]+/)) {
    const entry = raw.trim().toLowerCase();
    if (!entry || entry.includes("*")) continue;
    if (entry.startsWith("@") ? entry.slice(1) === domain : entry === address) return true;
  }
  return false;
}
