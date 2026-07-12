"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { lireImportVehicules } from "@/lib/import-assets";

const champ = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const dateOuNull = (f: FormData, n: string) => champ(f, n) || null;

export async function creerVehiculeAction(formData: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const immatriculation = champ(formData, "immatriculation").toUpperCase();
  const marque = champ(formData, "marque"); const modele = champ(formData, "modele");
  if (!immatriculation || !marque || !modele) redirect(`/flotte/nouveau?error=${encodeURIComponent("Immatriculation, marque et modèle obligatoires")}`);
  const { data, error } = await supabase.from("vehicules").insert({
    entreprise_id: ctx.entrepriseId, immatriculation, marque, modele,
    type: champ(formData, "type") || "utilitaire",
    date_mise_circulation: dateOuNull(formData, "date_mise_circulation"),
    kilometrage: Math.max(0, Number(champ(formData, "kilometrage")) || 0),
    controle_technique_echeance: dateOuNull(formData, "controle_technique_echeance"),
    assurance_echeance: dateOuNull(formData, "assurance_echeance"),
    prochain_entretien_date: dateOuNull(formData, "prochain_entretien_date"),
    prochain_entretien_km: Number(champ(formData, "prochain_entretien_km")) || null,
    notes: champ(formData, "notes") || null,
  }).select("id").single();
  if (error || !data) redirect(`/flotte/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  revalidatePath("/flotte"); redirect(`/flotte/${data.id}`);
}

export async function ajouterReleveKilometrageAction(vehiculeId: string, formData: FormData) {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const kilometrage = Number(champ(formData, "kilometrage"));
  const { error } = await supabase.from("releves_kilometrage").insert({
    entreprise_id: ctx.entrepriseId, vehicule_id: vehiculeId,
    kilometrage, date_releve: dateOuNull(formData, "date_releve") ?? new Date().toISOString().slice(0, 10),
    note: champ(formData, "note") || null,
  });
  if (error) redirect(`/flotte/${vehiculeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/flotte"); revalidatePath(`/flotte/${vehiculeId}`); redirect(`/flotte/${vehiculeId}?success=Kilométrage enregistré`);
}

export async function affecterVehiculeAction(vehiculeId:string,formData:FormData){const ctx=await getContexteEntreprise(),supabase=await createClient(),employeId=champ(formData,"employe_id")||null;const{error}=await supabase.rpc("affecter_vehicule",{p_entreprise_id:ctx.entrepriseId,p_vehicule_id:vehiculeId,p_employe_id:employeId,p_note:champ(formData,"note")||null});if(error)redirect(`/flotte/${vehiculeId}?error=${encodeURIComponent(error.message)}`);revalidatePath("/flotte");revalidatePath(`/flotte/${vehiculeId}`);redirect(`/flotte/${vehiculeId}?success=Affectation enregistrée et historisée`)}

export async function importerVehiculesAction(formData: FormData) { const fichier=formData.get("fichier"); if(!(fichier instanceof File)||!fichier.size)redirect(`/flotte?error=${encodeURIComponent("Choisissez un fichier")}`); try{const lignes=await lireImportVehicules(fichier);if(!lignes.length)throw new Error("Aucun véhicule exploitable");const ctx=await getContexteEntreprise(),supabase=await createClient();const{error}=await supabase.from("vehicules").upsert(lignes.map(ligne=>({entreprise_id:ctx.entrepriseId,...ligne,statut:"actif"})),{onConflict:"entreprise_id,immatriculation"});if(error)throw error;revalidatePath("/flotte");redirect(`/flotte?success=${encodeURIComponent(`${lignes.length} véhicule(s) importé(s)`)}`)}catch(error){redirect(`/flotte?error=${encodeURIComponent(error instanceof Error?error.message:"Import impossible")}`)} }
