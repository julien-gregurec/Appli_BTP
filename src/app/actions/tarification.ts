"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { estCodeOffreTarifaire } from "@/lib/tarification";

const nombre = (formData: FormData, cle: string) => Number(String(formData.get(cle) ?? "").replace(",", "."));
const nombreOptionnel = (formData: FormData, cle: string) => {
  const valeur = String(formData.get(cle) ?? "").replace(",", ".").trim();
  return valeur === "" ? null : Number(valeur);
};

export async function creerVersionTarifaireAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const code = String(formData.get("code") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const valideDu = String(formData.get("valide_du") ?? "");
  const prixMensuel = nombreOptionnel(formData, "prix_mensuel_ht");
  const prixAnnuel = nombreOptionnel(formData, "prix_annuel_ht");
  const utilisateurs = Math.round(nombre(formData, "utilisateurs_inclus"));
  const administrateursSaisis = nombreOptionnel(formData, "administrateurs_inclus");
  const administrateurs = administrateursSaisis === null ? null : Math.round(administrateursSaisis);
  const operationsIA = Math.round(nombre(formData, "operations_ia_incluses"));
  const stockage = nombre(formData, "stockage_go_inclus");
  const prixInvalides = code === "sur_mesure"
    ? prixMensuel !== null || prixAnnuel !== null
    : prixMensuel === null || prixAnnuel === null || !Number.isFinite(prixMensuel) || !Number.isFinite(prixAnnuel) || prixMensuel < 0 || prixAnnuel < 0;
  const administrateursInvalides = administrateurs !== null && (!Number.isFinite(administrateurs) || administrateurs < 0);
  if (!estCodeOffreTarifaire(code) || !nom || motif.length < 5 || !valideDu || prixInvalides || administrateursInvalides ||
      [utilisateurs, operationsIA, stockage].some((valeur) => !Number.isFinite(valeur) || valeur < 0)) {
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
