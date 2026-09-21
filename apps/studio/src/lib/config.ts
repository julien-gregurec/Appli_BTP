export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configuration Studio manquante : renseignez les variables Supabase publiques.",
    );
  return { url, key };
}
export const studioCookieAttributes = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
export const studioCookieOptions = {
  ...studioCookieAttributes,
  name: "elsatia-studio-auth",
};
export function studioOrigin() {
  const value = process.env.NEXT_PUBLIC_STUDIO_URL;
  if (!value) throw new Error("NEXT_PUBLIC_STUDIO_URL manquante.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Origine Studio non sécurisée.");
  return url.origin;
}
