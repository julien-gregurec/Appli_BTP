import type { CookieOptions } from "@supabase/ssr";

export function optionsCookieAuth(environment = process.env.NODE_ENV): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: environment === "production",
    // Les clients Supabase navigateur actuels lisent et rafraîchissent ce cookie.
    // Le passer HttpOnly invaliderait leur session ; XSS est traité par la CSP.
    httpOnly: false,
  };
}
