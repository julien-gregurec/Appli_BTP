import { timingSafeEqual } from "node:crypto";
import type { ControleSante, ResultatControle } from "@elsatia/incident-control";

/**
 * Contrôles de santé de Gestion Pro.
 *
 * Deux profondeurs :
 *   • « publique » (par défaut, sans authentification) : base (PostgREST), Auth, Storage — des
 *     sondes de disponibilité sans effet de bord — plus la COHÉRENCE de configuration e-mail et
 *     Stripe, vérifiée localement (présence, préfixe attendu), sans aucun appel externe ;
 *   • « complète » (en-tête `Authorization: Bearer <CRON_SECRET>`) : ajoute un appel en lecture
 *     à Brevo et à Stripe pour vérifier que les clés sont réellement acceptées.
 *
 * Aucune valeur de configuration, URL, clé ou message d'erreur ne sort de ces fonctions : seul
 * un résultat ok / ko / non_configure est rendu (voir `evaluerSante`).
 */

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const statutOk = async (reponse: Promise<Response>): Promise<ResultatControle> => ((await reponse).ok ? "ok" : "ko");

export function profondeurDemandee(autorisation: string | null, env: Env = process.env): "publique" | "complete" {
  const secret = env.CRON_SECRET;
  if (!secret || !autorisation?.startsWith("Bearer ")) return "publique";
  const a = Buffer.from(autorisation.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "complete" : "publique";
}

/** Cohérence de la clé Stripe avec l'environnement : jamais une clé live hors Production, ni l'inverse. */
export function configurationStripeCoherente(env: Env): ResultatControle {
  const cle = env.STRIPE_SECRET_KEY;
  if (!cle) return "non_configure";
  const live = /^(?:sk|rk)_live_/.test(cle);
  const test = /^(?:sk|rk)_test_/.test(cle);
  if (!live && !test) return "ko";
  const production = env.VERCEL_ENV === "production";
  if (production !== live) return "ko";
  const secretsWebhook = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_ABONNEMENT_SECRET, env.STRIPE_WEBHOOK_BOUTIQUE_SECRET];
  if (secretsWebhook.some((s) => s !== undefined && s !== "" && !s.startsWith("whsec_"))) return "ko";
  if (!env.STRIPE_WEBHOOK_SECRET) return "ko";
  return "ok";
}

export function configurationEmailCoherente(env: Env): ResultatControle {
  if (!env.BREVO_API_KEY) return "non_configure";
  if (!env.BREVO_API_KEY.startsWith("xkeysib-") || !env.EMAIL_FROM_ADDRESS?.includes("@")) return "ko";
  return "ok";
}

export function controlesSanteGestionPro(options: {
  env?: Env;
  profondeur: "publique" | "complete";
  fetchImpl?: Fetch;
}): ControleSante[] {
  const env = options.env ?? process.env;
  const f = options.fetchImpl ?? fetch;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const cle = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const entetesSupabase = cle ? { apikey: cle, Authorization: `Bearer ${cle}` } : undefined;
  const nonConfigure = async (): Promise<ResultatControle> => "non_configure";

  const controles: ControleSante[] = [
    {
      nom: "db",
      critique: true,
      executer: !url || !entetesSupabase
        ? nonConfigure
        : (signal) => statutOk(f(`${url}/rest/v1/rpc/incident_etat_public`, {
          method: "POST",
          headers: { ...entetesSupabase, "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
          signal,
        })),
    },
    {
      nom: "auth",
      critique: true,
      executer: !url || !entetesSupabase
        ? nonConfigure
        : (signal) => statutOk(f(`${url}/auth/v1/health`, { headers: entetesSupabase, cache: "no-store", signal })),
    },
    {
      nom: "storage",
      critique: false,
      executer: !url || !entetesSupabase
        ? nonConfigure
        : (signal) => statutOk(f(`${url}/storage/v1/status`, { headers: entetesSupabase, cache: "no-store", signal })),
    },
    {
      nom: "email",
      critique: false,
      executer: async (signal) => {
        const config = configurationEmailCoherente(env);
        if (config !== "ok" || options.profondeur !== "complete") return config;
        return statutOk(f("https://api.brevo.com/v3/account", {
          headers: { "api-key": env.BREVO_API_KEY!, accept: "application/json" },
          cache: "no-store",
          signal,
        }));
      },
    },
    {
      nom: "stripe_configuration",
      critique: false,
      executer: async (signal) => {
        const config = configurationStripeCoherente(env);
        if (config !== "ok" || options.profondeur !== "complete") return config;
        return statutOk(f("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
          cache: "no-store",
          signal,
        }));
      },
    },
  ];
  return controles;
}
