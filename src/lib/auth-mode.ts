function estUrlSupabaseLocale(value: string | undefined) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

// Le mode sans connexion est un outil de démonstration strictement local. Une
// variable isolée ne doit jamais ouvrir l'espace plateforme sur un déploiement.
export function isEmailLoginDisabled() {
  return process.env.DISABLE_EMAIL_LOGIN === "true"
    && process.env.ELSATIA_LOCAL_DEMO === "true"
    && process.env.NODE_ENV !== "production"
    && process.env.VERCEL === undefined
    && process.env.VERCEL_ENV === undefined
    && estUrlSupabaseLocale(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
