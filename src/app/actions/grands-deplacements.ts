"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { calculerForfaitGrandDeplacement, BAREMES_GRAND_DEPLACEMENT_2026 } from "@/lib/grands-deplacements";

function texte(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

function nombre(formData: FormData, nom: string) {
  const valeur = Number(texte(formData, nom).replace(",", "."));
  return Number.isFinite(valeur) ? valeur : 0;
}

function erreur(message: string): never {
  redirect(`/grands-deplacements?error=${encodeURIComponent(message)}`);
}

export async function creerGrandDeplacementAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: employe }, { data: entreprise }] = await Promise.all([
    supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).eq("statut", "actif").maybeSingle(),
    supabase.from("entreprises").select("mode_grand_deplacement,bareme_grand_deplacement").eq("id", ctx.entrepriseId).single(),
  ]);
  if (!employe) erreur("Votre compte doit être lié à une fiche employé active");
  const dateOrigine = texte(formData, "date_origine_mission");
  const dateDebut = texte(formData, "date_debut");
  const dateFin = texte(formData, "date_fin");
  if (!dateOrigine || !dateDebut || !dateFin || dateOrigine > dateDebut || dateDebut > dateFin) erreur("Période de déplacement invalide");
  const destination = texte(formData, "destination");
  if (!destination) erreur("La destination est obligatoire");
  const distanceAllerKm = Math.max(0, nombre(formData, "distance_aller_km"));
  const transportPublicAllerMinutes = Math.max(0, Math.round(nombre(formData, "transport_public_aller_minutes")));
  const eligibiliteStandard = distanceAllerKm >= 50 && transportPublicAllerMinutes >= 90;
  const conditionsConfirmees = formData.get("conditions_confirmees") === "on";
  const justificationEligibilite = texte(formData, "justification_eligibilite") || null;
  if (!conditionsConfirmees) erreur("Vous devez confirmer les conditions du grand déplacement");
  if (!eligibiliteStandard && !justificationEligibilite) erreur("Précisez les circonstances qui empêchent le retour quotidien");
  const chantierId = texte(formData, "chantier_id") || null;
  if (chantierId) {
    const { data: chantier } = await supabase.from("chantiers").select("id").eq("entreprise_id", ctx.entrepriseId).eq("id", chantierId).maybeSingle();
    if (!chantier) erreur("Chantier invalide ou inaccessible");
  }
  const mode = entreprise?.mode_grand_deplacement === "forfait_urssaf" ? "forfait_urssaf" : "frais_reels";
  const zone = texte(formData, "zone_logement") === "paris" ? "paris" : "province";
  const nbRepas = Math.max(0, nombre(formData, "nombre_repas"));
  const nbNuits = Math.max(0, nombre(formData, "nombre_nuits"));
  const brut = entreprise?.bareme_grand_deplacement as Record<string, Record<string, number>> | null;
  const valeurBareme = (valeur: unknown, repli: number) => {
    const nombre = Number(valeur);
    return Number.isFinite(nombre) && nombre >= 0 ? nombre : repli;
  };
  const baremes = brut ? {
    phase1: { repas: valeurBareme(brut.phase1?.repas, 21.4), logementParis: valeurBareme(brut.phase1?.logement_paris, 76.6), logementProvince: valeurBareme(brut.phase1?.logement_province, 56.8) },
    phase2: { repas: valeurBareme(brut.phase2?.repas, 18.2), logementParis: valeurBareme(brut.phase2?.logement_paris, 65.1), logementProvince: valeurBareme(brut.phase2?.logement_province, 48.3) },
    phase3: { repas: valeurBareme(brut.phase3?.repas, 15), logementParis: valeurBareme(brut.phase3?.logement_paris, 53.6), logementProvince: valeurBareme(brut.phase3?.logement_province, 39.8) },
  } : BAREMES_GRAND_DEPLACEMENT_2026;
  const calcul = calculerForfaitGrandDeplacement({ dateOrigine, dateDebut, nbRepas, nbNuits, zone, baremes });
  const budgetManuel = mode === "frais_reels" ? Math.max(0, nombre(formData, "budget_manuel")) : null;
  const { error } = await supabase.from("grands_deplacements").insert({
    entreprise_id: ctx.entrepriseId,
    employe_id: employe.id,
    chantier_id: chantierId,
    date_origine_mission: dateOrigine,
    date_debut: dateDebut,
    date_fin: dateFin,
    destination,
    zone_logement: zone,
    mode_calcul: mode,
    nombre_repas: nbRepas,
    nombre_nuits: nbNuits,
    taux_repas: mode === "forfait_urssaf" ? calcul.tauxRepas : 0,
    taux_logement: mode === "forfait_urssaf" ? calcul.tauxLogement : 0,
    phase_bareme: mode === "forfait_urssaf" ? calcul.phase : null,
    budget_manuel: budgetManuel,
    montant_calcule: mode === "forfait_urssaf" ? calcul.montant : budgetManuel ?? 0,
    commentaire: texte(formData, "commentaire") || null,
    distance_aller_km: distanceAllerKm,
    transport_public_aller_minutes: transportPublicAllerMinutes,
    eligibilite_standard: eligibiliteStandard,
    conditions_confirmees: conditionsConfirmees,
    justification_eligibilite: justificationEligibilite,
    cree_par: ctx.userId,
  });
  if (error) erreur(error.message);
  revalidatePath("/grands-deplacements");
  redirect("/grands-deplacements?succes=1");
}

export async function transitionGrandDeplacementAction(id: string, statut: "soumis" | "valide" | "refuse") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_grand_deplacement", { p_id: id, p_statut: statut });
  if (error) erreur(error.message);
  revalidatePath("/grands-deplacements");
  redirect("/grands-deplacements?succes=statut");
}
