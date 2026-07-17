"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";

export async function genererDoeAction(chantierId: string) {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_doe")) {
    redirect(`/chantiers/${chantierId}/doe?error=${encodeURIComponent("Votre poste ne permet pas de figer un DOE")}`);
  }
  const supabase = await createClient();
  const { data: chantier } = await supabase.from("chantiers").select("id,reference_interne,nom")
    .eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!chantier) redirect("/chantiers");

  const [{ data: documents }, { data: mouvements }, { data: derniere }] = await Promise.all([
    supabase.from("documents_chantier").select("id,nom,categorie,created_at").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId),
    supabase.from("mouvements_stock").select("article_id").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).eq("type", "sortie"),
    supabase.from("doe_generations").select("version").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const articles = [...new Set((mouvements ?? []).map((mouvement) => mouvement.article_id).filter(Boolean))];
  const { data: fiches } = articles.length
    ? await supabase.from("fiches_techniques_articles").select("id,article_id,titre,type_document,version").eq("entreprise_id", ctx.entrepriseId).in("article_id", articles)
    : { data: [] };
  const version = Number(derniere?.version ?? 0) + 1;
  const manifeste = {
    chantier: { id: chantier.id, reference: chantier.reference_interne, nom: chantier.nom },
    documents: documents ?? [],
    articles,
    fiches_techniques: fiches ?? [],
    genere_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("doe_generations").insert({
    entreprise_id: ctx.entrepriseId, chantier_id: chantierId, version, manifeste,
  });
  if (error) redirect(`/chantiers/${chantierId}/doe?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/chantiers/${chantierId}/doe`);
  redirect(`/chantiers/${chantierId}/doe?success=${encodeURIComponent(`DOE version ${version} figé`)}`);
}
