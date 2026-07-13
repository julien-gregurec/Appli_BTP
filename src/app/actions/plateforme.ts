"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin } from "@/lib/plateforme";

export async function modifierAbonnementAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) {
    redirect("/dashboard");
  }
  const statut = String(formData.get("statut") ?? "essai");
  const echeance = String(formData.get("echeance") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    // Mode prototype : mise à jour directe (l'admin plateforme réel passe par la RPC).
    await supabase
      .from("entreprises")
      .update({ abonnement_statut: statut, abonnement_echeance: echeance, abonnement_note: note, updated_at: new Date().toISOString() })
      .eq("id", entrepriseId);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_abonnement", {
      p_entreprise_id: entrepriseId,
      p_statut: statut,
      p_echeance: echeance,
      p_note: note,
    });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/plateforme");
  redirect("/plateforme?succes=1");
}

export async function creerEntreprisePlateformeAction(formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");const nom=String(formData.get("nom")??"").trim(),siret=String(formData.get("siret")??"").trim()||null,ville=String(formData.get("ville")??"").trim()||null;if(!nom)redirect(`/plateforme?error=${encodeURIComponent("Nom obligatoire")}`);const supabase=await createClient();if(isEmailLoginDisabled()){const{data:entreprise,error}=await supabase.from("entreprises").insert({nom,raison_sociale:nom,siret,ville,abonnement_statut:"essai",abonnement_note:"Créée par la plateforme"}).select("id").single();if(error||!entreprise)redirect(`/plateforme?error=${encodeURIComponent(error?.message??"Création impossible")}`);const noms=["Admin / Gérant","Conducteur de travaux","Chef de chantier","Chef d’équipe","Ouvrier","RH / Comptable"];const{data:postes,error:postesError}=await supabase.from("postes").insert(noms.map((poste)=>({entreprise_id:entreprise.id,nom:poste,tarif_compte_mensuel:0}))).select("id,nom");if(postesError)redirect(`/plateforme?error=${encodeURIComponent(postesError.message)}`);const{data:droits}=await supabase.from("permissions_disponibles").select("cle");if(postes?.length&&droits?.length){const socle=new Set(["acces_planning","acces_pointage","saisir_son_pointage","saisir_ses_notes_frais","demander_ses_conges","utiliser_borne_stock"]);const lignes=postes.flatMap((poste)=>droits.map((droit)=>({entreprise_id:entreprise.id,poste_id:poste.id,cle_permission:droit.cle,autorise:poste.nom.startsWith("Admin")||socle.has(droit.cle)})));const{error:permissionsError}=await supabase.from("permissions_poste").insert(lignes);if(permissionsError)redirect(`/plateforme?error=${encodeURIComponent(permissionsError.message)}`);}}else{const{error}=await supabase.rpc("plateforme_creer_entreprise",{p_nom:nom,p_siret:siret,p_ville:ville});if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);}revalidatePath("/plateforme");redirect("/plateforme?succes=entreprise");
}

export async function modifierTarifPostePlateformeAction(posteId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const codeOffre = String(formData.get("code_offre") ?? "standard").trim() || "standard";
  const tarif = Number(String(formData.get("tarif") ?? "0").replace(",", "."));
  if (!Number.isFinite(tarif) || tarif < 0) redirect(`/plateforme?error=${encodeURIComponent("Tarif invalide")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("postes").update({ code_offre: codeOffre, tarif_compte_mensuel: tarif }).eq("id", posteId);
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_tarif_poste", { p_poste_id: posteId, p_code_offre: codeOffre, p_tarif: tarif });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent("Tarif du poste mis à jour")}`);
}

export async function genererSnapshotFacturationAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Le relevé mensuel sécurisé sera disponible après activation des comptes personnels")}`);
  const moisSaisi = String(formData.get("mois") ?? "").trim();
  const mois = moisSaisi ? `${moisSaisi}-01` : new Date().toISOString().slice(0, 7) + "-01";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_snapshot_facturation", { p_mois: mois });
  if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`${data ?? 0} compte(s) ajouté(s) au relevé mensuel`)}`);
}
