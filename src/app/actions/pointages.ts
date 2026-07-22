"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

const texte = (formData: FormData, nom: string) => String(formData.get(nom) ?? "").trim() || null;
// Le GPS reste la preuve par defaut, mais un poste de bureau (pas de puce GPS) ou un
// reseau indisponible ne doivent pas bloquer le pointage : un motif explicite permet
// de continuer sans position, conserve dans le commentaire pour le validateur.
function positionTerrain(formData: FormData): { latitude: number | null; longitude: number | null; precision: number | null; motifSansGps: string | null } {
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const precision = Number(formData.get("precision_metres"));
  const gpsValide = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  if (gpsValide) return { latitude, longitude, precision: Number.isFinite(precision) ? precision : null, motifSansGps: null };
  const motifSansGps = String(formData.get("motif_sans_gps") ?? "").trim();
  if (!motifSansGps) throw new Error("La position GPS est obligatoire, ou indique un motif si elle est indisponible.");
  return { latitude: null, longitude: null, precision: null, motifSansGps };
}

// Vérification périodique de zone (suivi de zone chantier) : appelée en tâche de fond par
// le client pendant qu'une session de pointage est ouverte, jamais via un <form>. Ne fait
// rien (et ne lève pas d'erreur) si le suivi est désactivé côté entreprise ou le chantier
// sans coordonnées : c'est le rôle de la fonction RPC de trancher.
export async function verifierZonePointageAction(sessionId: string, latitude: number, longitude: number, precision: number | null) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verifier_zone_pointage", {
    p_entreprise_id: ctx.entrepriseId,
    p_session_id: sessionId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_precision: precision,
  });
  if (error) return { ok: false as const, erreur: error.message };
  return { ok: true as const, dansZone: data as boolean | null };
}

export async function enregistrerArriveeAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  let employeId = texte(formData, "employe_id");
  const chantierId = texte(formData, "chantier_id");
  if (!isEmailLoginDisabled()) {
    const { data: employeCompte } = await supabase.from("employes").select("id").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",ctx.userId).eq("statut","actif").maybeSingle();
    employeId = employeCompte?.id ?? null;
  }
  if (!employeId || !chantierId) redirect(`/pointage?error=${encodeURIComponent("Employé et chantier obligatoires")}`);
  let preuve;
  try { preuve = positionTerrain(formData); } catch (error) { redirect(`/pointage?error=${encodeURIComponent(error instanceof Error ? error.message : "Position invalide")}`); }
  const sessionId = crypto.randomUUID();
  const commentaireBase = texte(formData, "commentaire");
  const commentaire = preuve.motifSansGps ? [commentaireBase, `Sans GPS (arrivée) : ${preuve.motifSansGps}`].filter(Boolean).join(" - ") : commentaireBase;
  const { error } = await supabase.from("sessions_pointage").insert({
    id: sessionId, entreprise_id: ctx.entrepriseId, employe_id: employeId, chantier_id: chantierId,
    arrivee_at: new Date().toISOString(), latitude_arrivee: preuve.latitude, longitude_arrivee: preuve.longitude,
    precision_arrivee_metres: preuve.precision, photo_arrivee_storage_path: null,
    tache: texte(formData, "tache"), commentaire,
  });
  if (error) redirect(`/pointage?error=${encodeURIComponent(error.code === "23505" ? "Cet employé a déjà une arrivée ouverte" : error.message)}`);
  revalidatePath("/pointage");
  revalidatePath("/dashboard");
  redirect("/pointage?succes=arrivee");
}

export async function enregistrerDepartAction(sessionId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  let preuve;
  try { preuve = positionTerrain(formData); } catch (error) { redirect(`/pointage?error=${encodeURIComponent(error instanceof Error ? error.message : "Position invalide")}`); }
  const { error } = await supabase.rpc("cloturer_session_pointage", {
    p_entreprise_id: ctx.entrepriseId, p_session_id: sessionId, p_depart_at: new Date().toISOString(),
    p_pause_minutes: Math.max(0, Number(formData.get("pause_minutes")) || 0), p_latitude: preuve.latitude,
    p_longitude: preuve.longitude, p_precision: preuve.precision, p_photo_path: null,
    p_motif_sans_gps: preuve.motifSansGps,
  });
  if (error) redirect(`/pointage?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/pointage");
  revalidatePath("/dashboard");
  redirect("/pointage?succes=depart");
}

export async function declarerPointageOublieAction(formData:FormData){
 const ctx=await getContexteEntreprise(),supabase=await createClient();let preuve;
 try{preuve=positionTerrain(formData);}catch(error){redirect(`/pointage?error=${encodeURIComponent(error instanceof Error?error.message:"Position invalide")}`);}
 // Le motif GPS reprend simplement l'explication deja obligatoire de ce formulaire
 // (voir ForgottenPointageForm) : pas besoin d'un second champ pour la meme raison.
 const{error}=await supabase.rpc("declarer_pointage_oublie",{p_entreprise_id:ctx.entrepriseId,p_chantier_id:texte(formData,"chantier_id"),p_date:texte(formData,"date"),p_arrivee:texte(formData,"heure_arrivee"),p_depart:texte(formData,"heure_depart"),p_pause_minutes:Math.max(0,Number(formData.get("pause_minutes"))||0),p_latitude:preuve.latitude,p_longitude:preuve.longitude,p_precision:preuve.precision,p_commentaire:texte(formData,"commentaire")});
 if(error)redirect(`/pointage?error=${encodeURIComponent(error.message)}`);revalidatePath("/pointage");revalidatePath("/dashboard");redirect(`/pointage?succes=${encodeURIComponent("Pointage oublié enregistré et transmis au responsable")}`);
}

export async function supprimerPointageAction(pointageId: string, mois: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const{data:p}=await supabase.from("pointages").select("photo_storage_path").eq("id",pointageId).eq("entreprise_id",ctx.entrepriseId).maybeSingle();
  const{error}=await supabase.from("pointages").delete().eq("id", pointageId).eq("entreprise_id", ctx.entrepriseId);
  if(error)redirect(`/pointage?mois=${mois}&error=${encodeURIComponent(error.message)}`);
  if(p?.photo_storage_path)await supabase.storage.from("pointage-preuves").remove([p.photo_storage_path]);
  revalidatePath("/pointage");
  redirect(`/pointage?mois=${mois}`);
}

export async function validerPointageAction(pointageId:string,statut:"valide"|"rejete",mois:string,formData:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),{error}=await supabase.rpc("valider_preuve_pointage",{p_entreprise_id:ctx.entrepriseId,p_pointage_id:pointageId,p_statut:statut,p_commentaire:texte(formData,"commentaire_verification")});if(error)redirect(`/pointage?mois=${mois}&error=${encodeURIComponent(error.message)}`);revalidatePath("/pointage");redirect(`/pointage?mois=${mois}&succes=validation`)}

export async function creerMaFichePointageAdministrateurAction(){
  const ctx=await getContexteEntreprise();
  const supabase=await createClient();
  const{error}=await supabase.rpc("garantir_fiche_pointage_courante",{p_entreprise_id:ctx.entrepriseId});
  if(error)redirect(`/pointage?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/pointage");
  revalidatePath("/employes");
  redirect("/pointage?succes=fiche_admin");
}
