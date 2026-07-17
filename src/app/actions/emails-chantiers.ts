"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";

const champ = (fd: FormData, nom: string) => String(fd.get(nom) ?? "").trim() || null;

async function contexteGestion() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (permissions !== null && !permissions.includes("gerer_email_chantier")) redirect("/connecteurs?error=Accès refusé");
  return { ctx, supabase: await createClient() };
}

export async function preparerConnexionEmailAction(fd: FormData) {
  const { ctx, supabase } = await contexteGestion();
  const adresseEmail = champ(fd, "adresse_email");
  const fournisseur = champ(fd, "fournisseur");
  if (!adresseEmail || !fournisseur || !["google", "microsoft", "imap"].includes(fournisseur)) {
    redirect(`/connecteurs?error=${encodeURIComponent("Adresse et fournisseur de messagerie obligatoires")}`);
  }
  const { error } = await supabase.from("connexions_email").upsert({
    entreprise_id: ctx.entrepriseId, fournisseur, adresse_email: adresseEmail, statut: "a_configurer", updated_at: new Date().toISOString(),
  }, { onConflict: "entreprise_id,adresse_email" });
  if (error) redirect(`/connecteurs?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/connecteurs");
  redirect(`/connecteurs?success=${encodeURIComponent("Boîte enregistrée. L’activation OAuth nécessite les identifiants officiels Google ou Microsoft dans le coffre Vercel.")}`);
}

export async function archiverEmailChantierAction(chantierId: string, fd: FormData) {
  const { ctx, supabase } = await contexteGestion();
  const objet = champ(fd, "objet");
  const expediteur = champ(fd, "expediteur");
  const apercu = champ(fd, "apercu");
  const recuAt = champ(fd, "recu_at");
  if (!objet || !recuAt) redirect(`/chantiers/${chantierId}/emails?error=${encodeURIComponent("Objet et date obligatoires")}`);
  const destinataires = (champ(fd, "destinataires") ?? "").split(/[;,]/).map((valeur) => valeur.trim()).filter(Boolean);
  const copie = (champ(fd, "copie") ?? "").split(/[;,]/).map((valeur) => valeur.trim()).filter(Boolean);
  const { error } = await supabase.from("emails_chantier").insert({
    entreprise_id: ctx.entrepriseId, chantier_id: chantierId, identifiant_externe: `manuel-${crypto.randomUUID()}`,
    direction: champ(fd, "direction") === "sortant" ? "sortant" : "entrant", expediteur,
    destinataires, copie, objet, apercu, recu_at: new Date(recuAt).toISOString(),
  });
  if (error) redirect(`/chantiers/${chantierId}/emails?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/chantiers/${chantierId}/emails`);
  redirect(`/chantiers/${chantierId}/emails?success=${encodeURIComponent("E-mail archivé dans le chantier")}`);
}
