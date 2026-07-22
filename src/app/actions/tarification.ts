"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { estCodeOffreTarifaire } from "@/lib/tarification";

const nombre = (formData: FormData, cle: string) => Number(String(formData.get(cle) ?? "").replace(",", "."));

export async function creerVersionTarifaireAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const code = String(formData.get("code") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const valideDu = String(formData.get("valide_du") ?? "");
  const prixMensuel = nombre(formData, "prix_mensuel_ht");
  const prixAnnuel = nombre(formData, "prix_annuel_ht");
  const utilisateurs = Math.round(nombre(formData, "utilisateurs_inclus"));
  const administrateurs = Math.round(nombre(formData, "administrateurs_inclus"));
  const operationsIA = Math.round(nombre(formData, "operations_ia_incluses"));
  const stockage = nombre(formData, "stockage_go_inclus");
  if (!estCodeOffreTarifaire(code) || !nom || motif.length < 5 || !valideDu ||
      [prixMensuel, prixAnnuel, utilisateurs, administrateurs, operationsIA, stockage].some((valeur) => !Number.isFinite(valeur) || valeur < 0)) {
    redirect(`/plateforme/tarification?error=${encodeURIComponent("Informations tarifaires incomplètes ou invalides")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("plateforme_creer_version_tarif", {
    p_code: code,
    p_nom: nom,
    p_prix_mensuel_ht: prixMensuel,
    p_prix_annuel_ht: prixAnnuel,
    p_utilisateurs_inclus: utilisateurs,
    p_administrateurs_inclus: administrateurs,
    p_operations_ia_incluses: operationsIA,
    p_stockage_go_inclus: stockage,
    p_valide_du: valideDu,
    p_motif: motif,
  });
  if (error) redirect(`/plateforme/tarification?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme/tarification");
  revalidatePath("/tarifs");
  redirect("/plateforme/tarification?succes=1");
}
