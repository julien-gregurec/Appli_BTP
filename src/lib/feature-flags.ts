import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ContexteEntreprise } from "@/lib/entreprise";
import { FEATURE_CATALOGUE, type FeatureKey, type FeatureStatus } from "@/lib/feature-catalogue";

type OverrideRow = { feature_key: string; statut: FeatureStatus; active: boolean };

function normalizePlan(plan: string | null | undefined) {
  if (plan === "essentiel") return "mini";
  if (plan === "premium") return "business";
  return plan ?? "mini";
}

export const activeFeaturesForCompany = cache(async function activeFeaturesForCompany(
  ctx: ContexteEntreprise,
  permissions: string[] | null,
  platformAdmin: boolean,
): Promise<FeatureKey[]> {
  const supabase = await createClient();
  const [{ data: company }, { data: overrides }] = await Promise.all([
    supabase.from("entreprises").select("abonnement_offre").eq("id", ctx.entrepriseId).maybeSingle(),
    supabase.from("entreprise_feature_flags").select("feature_key,statut,active").eq("entreprise_id", ctx.entrepriseId),
  ]);
  const plan = normalizePlan(company?.abonnement_offre);
  const byKey = new Map(((overrides ?? []) as OverrideRow[]).map((row) => [row.feature_key, row]));

  return (Object.entries(FEATURE_CATALOGUE) as Array<[FeatureKey, (typeof FEATURE_CATALOGUE)[FeatureKey]]>)
    .filter(([key, definition]) => {
      const override = byKey.get(key);
      const active = override ? override.active && override.statut !== "disabled" : definition.visibleByDefault;
      if (!active) return false;
      if (definition.adminOnly && permissions !== null && !permissions.includes("acces_parametres")) return false;
      if (definition.plans?.length && !definition.plans.includes(plan) && !platformAdmin) return false;
      return true;
    })
    .map(([key]) => key);
});
