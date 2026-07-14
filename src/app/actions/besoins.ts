"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { recommanderOffre } from "@/lib/plateforme";

export async function enregistrerBesoinsAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const entrepriseId = ctx.entrepriseId;
  if (!entrepriseId) redirect("/onboarding");

  const nbEmployes = Math.max(0, Number(String(formData.get("nb_employes") ?? "0").replace(",", ".")) || 0);
  const besoins = formData.getAll("besoins").map((b) => String(b));
  const attentes = formData.getAll("attentes").map((a) => String(a));
  const commentaire = String(formData.get("commentaire") ?? "").trim() || null;

  const { offre } = recommanderOffre(besoins, nbEmployes);

  const supabase = await createClient();
  const { error } = await supabase.from("entreprise_besoins").upsert(
    {
      entreprise_id: entrepriseId,
      nb_employes: nbEmployes,
      besoins,
      attentes,
      commentaire,
      offre_recommandee: offre.cle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entreprise_id" },
  );
  if (error) redirect(`/onboarding/besoins?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/onboarding/besoins");
  redirect(`/onboarding/besoins?recommande=${offre.cle}&nb=${nbEmployes}`);
}
