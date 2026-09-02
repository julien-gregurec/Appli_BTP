import { createHash } from "node:crypto";

export type ModeStripeWebhook = "test" | "live";
export type ConfigurationModeStripeWebhook =
  | { valide: true; mode: ModeStripeWebhook; livemode: boolean }
  | { valide: false; motif: "absente" | "vide" | "invalide" };

export function resoudreModeStripeWebhook(env: Record<string, string | undefined> = process.env): ConfigurationModeStripeWebhook {
  const valeur = env.STRIPE_WEBHOOK_EXPECTED_MODE;
  if (valeur === undefined) return { valide: false, motif: "absente" };
  const mode = valeur.trim().toLowerCase();
  if (!mode) return { valide: false, motif: "vide" };
  if (mode === "test") return { valide: true, mode, livemode: false };
  if (mode === "live") return { valide: true, mode, livemode: true };
  return { valide: false, motif: "invalide" };
}

export function empreinteEvenementStripe(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

export function identifiantUuidValide(valeur: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valeur);
}

type ErreurSupabaseMinimale = { code?: string | null; message?: string | null } | null | undefined;

export type CategorieErreurSupabase =
  | "violation_cle_etrangere"
  | "table_ou_migration_absente"
  | "connexion_supabase"
  | "autorisation_supabase"
  | "erreur_supabase";

export function categoriserErreurSupabase(erreur: ErreurSupabaseMinimale): CategorieErreurSupabase {
  const code = erreur?.code ?? "";
  if (code === "23503") return "violation_cle_etrangere";
  if (code === "42P01" || code === "PGRST205") return "table_ou_migration_absente";
  if (code === "42501" || code === "PGRST301") return "autorisation_supabase";
  if (code.startsWith("08") || code === "PGRST000" || code === "PGRST001" || /fetch|network|connexion/i.test(erreur?.message ?? "")) return "connexion_supabase";
  return "erreur_supabase";
}
