"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { lireContenuDoe, type ContenuDoe } from "@/lib/fiches-agregats";

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

  // Contenu complet en une RPC (gp_doe_contenu) : les lectures PostgREST
  // plafonnées à 1 000 lignes figeaient un manifeste incomplet sans erreur.
  // Une erreur de lecture refuse de figer plutôt que de figer un DOE partiel.
  const [contenu, { data: derniere }] = await Promise.all([
    lireContenuDoe(supabase, ctx.entrepriseId, chantierId).catch((err): ContenuDoe | null => {
      console.error("[doe] contenu indisponible", err instanceof Error ? err.message : err);
      return null;
    }),
    supabase.from("doe_generations").select("version").eq("entreprise_id", ctx.entrepriseId).eq("chantier_id", chantierId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!contenu) redirect(`/chantiers/${chantierId}/doe?error=${encodeURIComponent("Contenu du DOE indisponible : réessayez.")}`);
  const version = Number(derniere?.version ?? 0) + 1;
  const manifeste = {
    chantier: { id: chantier.id, reference: chantier.reference_interne, nom: chantier.nom },
    documents: contenu.documents.map(({ id, nom, categorie, created_at }) => ({ id, nom, categorie, created_at })),
    articles: contenu.articleIds,
    fiches_techniques: contenu.fichesTechniques.map(({ id, article_id, titre, type_document, version }) => ({ id, article_id, titre, type_document, version })),
    genere_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("doe_generations").insert({
    entreprise_id: ctx.entrepriseId, chantier_id: chantierId, version, manifeste,
  });
  if (error) redirect(`/chantiers/${chantierId}/doe?error=${encodeURIComponent(messageErreurUtilisateur("genererDoeAction", error, "Impossible de générer le DOE pour ce chantier."))}`);
  revalidatePath(`/chantiers/${chantierId}/doe`);
  redirect(`/chantiers/${chantierId}/doe?success=${encodeURIComponent(`DOE version ${version} figé`)}`);
}
