"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

// Un ou plusieurs ouvriers affectés à une tâche, une date et un nombre d'heures.
export async function creerAffectationAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const typeActivite = champ(formData, "type_activite") ?? "chantier";
  const typesAutorises = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"];
  const chantierId = typeActivite === "chantier" ? champ(formData, "chantier_id") : null;
  const employeIds = [...new Set(formData.getAll("employe_ids").map(String).filter(Boolean))];
  const date = champ(formData, "date");
  const heures = Number(formData.get("heures"));

  const retour = champ(formData, "retour");
  const destination = retour ? `/planning?semaine=${encodeURIComponent(retour)}` : "/planning";
  if (!typesAutorises.includes(typeActivite) || (typeActivite === "chantier" && !chantierId) || employeIds.length === 0 || !date) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Activité, ouvriers et date obligatoires")}`);
  }
  if (!heures || heures <= 0) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Nombre d'heures invalide")}`);
  }
  const [{ data: chantier }, { data: employes }] = await Promise.all([
    chantierId ? supabase.from("chantiers").select("id").eq("id",chantierId).eq("entreprise_id",ctx.entrepriseId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("employes").select("id").eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").in("id",employeIds),
  ]);
  if ((chantierId && !chantier) || (employes?.length ?? 0) !== employeIds.length) redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Activité ou ouvrier invalide")}`);
  const tache = champ(formData,"tache");
  const lieuActivite = typeActivite === "chantier" ? null : champ(formData, "lieu_activite");
  const { error } = await supabase.from("affectations").insert(employeIds.map((employeId) => ({ entreprise_id:ctx.entrepriseId,chantier_id:chantierId,employe_id:employeId,date,heures,tache,type_activite:typeActivite,lieu_activite:lieuActivite })));

  if (error) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/planning");
  redirect(destination);
}

// Compare deux valeurs "chantier_id/lieu_activite/tache" en traitant null a part :
// Postgrest utilise .is() pour null et .eq() pour une vraie valeur, jamais l'un pour l'autre.
function surColonne<T>(requete: T, colonne: string, valeur: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (valeur === null ? (requete as any).is(colonne, null) : (requete as any).eq(colonne, valeur)) as T;
}

// Meme validation que creerAffectationAction, mais pour une affectation existante :
// permet de corriger un doublon ou une erreur de saisie sans avoir a supprimer/recréer.
// Quand appliquer_a_tous est coche, la meme modification est propagee a toutes les
// affectations qui partagent exactement date/heures/type/chantier-ou-lieu/tache avec la
// version AVANT modification (typiquement les autres employes d'une meme saisie groupee),
// puisque rien ne relie ces lignes entre elles autrement que ces valeurs identiques.
export async function modifierAffectationAction(affectationId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: original } = await supabase.from("affectations").select("date,heures,type_activite,chantier_id,lieu_activite,tache").eq("id", affectationId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();

  const typeActivite = champ(formData, "type_activite") ?? "chantier";
  const typesAutorises = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"];
  const chantierId = typeActivite === "chantier" ? champ(formData, "chantier_id") : null;
  const date = champ(formData, "date");
  const heures = Number(formData.get("heures"));
  const appliquerATous = formData.get("appliquer_a_tous") === "on";

  const retour = champ(formData, "retour");
  const destination = retour ? `/planning?semaine=${encodeURIComponent(retour)}` : "/planning";
  if (!original) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Affectation introuvable")}`);
  }
  if (!typesAutorises.includes(typeActivite) || (typeActivite === "chantier" && !chantierId) || !date) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Activité et date obligatoires")}`);
  }
  if (!heures || heures <= 0) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Nombre d'heures invalide")}`);
  }
  if (chantierId) {
    const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
    if (!chantier) redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent("Chantier invalide")}`);
  }
  const tache = champ(formData, "tache");
  const lieuActivite = typeActivite === "chantier" ? null : champ(formData, "lieu_activite");

  let requete = supabase.from("affectations").update({ chantier_id: chantierId, date, heures, tache, type_activite: typeActivite, lieu_activite: lieuActivite }).eq("entreprise_id", ctx.entrepriseId);
  requete = appliquerATous
    ? surColonne(surColonne(surColonne(requete.eq("date", original!.date).eq("heures", original!.heures).eq("type_activite", original!.type_activite), "chantier_id", original!.chantier_id), "lieu_activite", original!.lieu_activite), "tache", original!.tache)
    : requete.eq("id", affectationId);
  const { error } = await requete;

  if (error) {
    redirect(`${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/planning");
  redirect(destination);
}

export async function supprimerAffectationAction(affectationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  await supabase.from("affectations").delete().eq("id", affectationId).eq("entreprise_id", ctx.entrepriseId);
  revalidatePath("/planning");
}

export async function supprimerGroupeAffectationsAction(formData:FormData){
  const ctx=await getContexteEntreprise();const supabase=await createClient();
  const ids=[...new Set(formData.getAll("ids").map(String).filter(Boolean))];const retour=champ(formData,"retour");
  if(ids.length) await supabase.from("affectations").delete().eq("entreprise_id",ctx.entrepriseId).in("id",ids);
  revalidatePath("/planning");redirect(retour?`/planning?semaine=${encodeURIComponent(retour)}`:"/planning");
}
