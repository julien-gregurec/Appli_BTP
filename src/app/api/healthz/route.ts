import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeEstConfigure } from "@/lib/stripe";
import { pushEstConfigure } from "@/lib/push";
import { obtenirIdCorrelation } from "@/lib/observability/request-id";
import { logErreur } from "@/lib/observability/logger";

// Healthcheck d'exploitation : distingue UP/DEGRADED/DOWN par composant, sans jamais
// exposer de message d'erreur interne au public. Les détails (raison précise) ne sont
// rendus qu'avec le secret HEALTHCHECK_SECRET (même modèle que CRON_SECRET), destiné
// à l'outillage d'astreinte, pas à un moniteur externe non authentifié.

type EtatComposant = "up" | "degraded" | "down";
type Resultat = { etat: EtatComposant; detail?: string; dureeMs: number };

async function avecDelai<T>(promesse: Promise<T>, budgetMs: number): Promise<T> {
  return await Promise.race([
    promesse,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Délai dépassé (${budgetMs}ms)`)), budgetMs)),
  ]);
}

async function verifier(nom: string, fn: () => Promise<void>): Promise<Resultat> {
  const debut = Date.now();
  try {
    await avecDelai(fn(), 4000);
    return { etat: "up", dureeMs: Date.now() - debut };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return { etat: "down", detail, dureeMs: Date.now() - debut };
  }
}

export async function GET(request: Request) {
  const requestId = obtenirIdCorrelation(request);
  const admin = createAdminClient();
  const secretAttendu = process.env.HEALTHCHECK_SECRET;
  const autorise = Boolean(secretAttendu) && request.headers.get("authorization") === `Bearer ${secretAttendu}`;

  const [db, storage, auth] = await Promise.all([
    verifier("db", async () => {
      const { error } = await admin.from("entreprises").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw new Error(error.message);
    }),
    verifier("storage", async () => {
      const { error } = await admin.storage.listBuckets();
      if (error) throw new Error(error.message);
    }),
    verifier("auth", async () => {
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
    }),
  ]);

  const stripe: Resultat = stripeEstConfigure()
    ? { etat: "up", dureeMs: 0 }
    : { etat: "degraded", detail: "Variables Stripe absentes (mode démo ?)", dureeMs: 0 };

  const email: Resultat = { etat: auth.etat === "up" ? "up" : "degraded", detail: "Aucun fournisseur transactionnel dédié : dépend de l'e-mail intégré Supabase Auth (réinitialisation de mot de passe).", dureeMs: 0 };

  const push: Resultat = pushEstConfigure()
    ? { etat: "up", dureeMs: 0 }
    : { etat: "degraded", detail: "Clés VAPID absentes : notifications push désactivées.", dureeMs: 0 };

  const jobs = await verifier("jobs", async () => {
    const seuil = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("job_runs")
      .select("job_name, statut, started_at")
      .gte("started_at", seuil)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    const attendus = ["cron:abonnements", "cron:notifications-push"];
    const manquants = attendus.filter((nom) => !(data ?? []).some((r) => r.job_name === nom));
    const enEchec = (data ?? []).filter((r) => r.statut === "echec").map((r) => r.job_name);
    if (manquants.length) throw new Error(`Aucune exécution récente pour: ${manquants.join(", ")}`);
    if (enEchec.length) throw new Error(`Dernières exécutions en échec: ${[...new Set(enEchec)].join(", ")}`);
  });

  const composants: Record<string, Resultat> = { db, storage, auth, stripe, email, push, jobs };
  const critiques: EtatComposant[] = [db.etat, auth.etat];
  const global: EtatComposant = critiques.includes("down")
    ? "down"
    : Object.values(composants).some((r) => r.etat !== "up")
      ? "degraded"
      : "up";

  if (global !== "up") {
    logErreur("platform", "Healthcheck en état dégradé ou down", { requestId, route: "/api/healthz", global, echecs: Object.entries(composants).filter(([, r]) => r.etat !== "up").map(([k]) => k) });
  }

  const corps: Record<string, unknown> = {
    status: global,
    timestamp: new Date().toISOString(),
    requestId,
    components: Object.fromEntries(Object.entries(composants).map(([k, v]) => [k, v.etat])),
  };
  if (autorise) {
    corps.details = Object.fromEntries(Object.entries(composants).map(([k, v]) => [k, { etat: v.etat, detail: v.detail, dureeMs: v.dureeMs }]));
  }

  return NextResponse.json(corps, { status: global === "up" ? 200 : global === "degraded" ? 200 : 503 });
}
