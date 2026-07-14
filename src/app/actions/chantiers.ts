"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ROLES_CHANTIER, type RoleChantier } from "@/lib/chantier-statuts";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

async function peutGererChantiers(ctx: Awaited<ReturnType<typeof getContexteEntreprise>>) {
  const permissions = await permissionsUtilisateur(ctx);
  return permissions === null || permissions.includes("gerer_chantiers");
}

export async function creerChantierAction(formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) {
    redirect(`/chantiers?error=${encodeURIComponent("Vous pouvez consulter les chantiers, mais pas en créer.")}`);
  }

  const clientId = champ(formData, "client_id");
  if (!clientId) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent("Client obligatoire")}`);
  }

  const { data, error } = await supabase
    .from("chantiers")
    .insert({
      entreprise_id: ctx.entrepriseId,
      client_id: clientId,
      nom: champ(formData, "nom"),
      adresse: champ(formData, "adresse"),
      code_postal: champ(formData, "code_postal"),
      ville: champ(formData, "ville"),
      type_chantier_id: champ(formData, "type_chantier_id"),
      statut: champ(formData, "statut") ?? "prospect",
      date_debut_prevue: champ(formData, "date_debut_prevue"),
      date_fin_prevue: champ(formData, "date_fin_prevue"),
      budget_previsionnel: champ(formData, "budget_previsionnel"),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/chantiers/nouveau?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  revalidatePath("/chantiers");
  redirect(`/chantiers/${data.id}`);
}

// Création rapide d'un chantier depuis l'éditeur de devis (retourne du JSON, pas de redirect).
export type ChantierRapide = {
  client_id: string;
  nom: string;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
};

export async function creerChantierRapideAction(
  data: ChantierRapide,
): Promise<{ id: string; label: string } | { error: string }> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return { error: "Votre poste ne permet pas de créer un chantier." };

  if (!data.client_id) return { error: "Choisis d'abord un client." };
  const nom = data.nom?.trim();
  if (!nom) return { error: "Donne un nom au chantier." };

  const { data: cree, error } = await supabase
    .from("chantiers")
    .insert({
      entreprise_id: ctx.entrepriseId,
      client_id: data.client_id,
      nom,
      adresse: data.adresse?.trim() || null,
      code_postal: data.code_postal?.trim() || null,
      ville: data.ville?.trim() || null,
      statut: "prospect",
    })
    .select("id, nom")
    .single();

  if (error || !cree) return { error: error?.message ?? "Impossible de créer le chantier." };
  revalidatePath("/chantiers");
  return { id: cree.id, label: cree.nom };
}

export async function changerStatutChantierAction(chantierId: string, statut: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const { error } = await supabase
    .from("chantiers")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId);

  if (!error) {
    revalidatePath(`/chantiers/${chantierId}`);
    revalidatePath("/chantiers");
  }
}

export async function ajouterTacheAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const libelle = String(formData.get("libelle") ?? "").trim();
  if (libelle === "") return;
  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase.from("taches").insert({
    chantier_id: chantierId,
    libelle,
    echeance: champ(formData, "echeance"),
  });

  revalidatePath(`/chantiers/${chantierId}`);
}

export async function basculerTacheAction(tacheId: string, chantierId: string, fait: boolean) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  if (!(await peutGererChantiers(ctx))) return;

  const { data: chantier } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).single();
  if (!chantier) return;

  await supabase
    .from("taches")
    .update({ statut: fait ? "fait" : "a_faire" })
    .eq("id", tacheId)
    .eq("chantier_id", chantierId);

  revalidatePath(`/chantiers/${chantierId}`);
}

export async function affecterEmployeChantierAction(chantierId: string, formData: FormData) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!(await peutGererChantiers(ctx))) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Votre poste ne permet pas de modifier l’équipe du chantier.")}`);
  }

  const employeId = champ(formData, "employe_id");
  const roleSaisi = champ(formData, "role_chantier") ?? "ouvrier";
  const role = ROLES_CHANTIER.some((option) => option.cle === roleSaisi)
    ? (roleSaisi as RoleChantier)
    : null;
  const dateDebut = champ(formData, "date_debut") ?? new Date().toISOString().slice(0, 10);
  if (!employeId || !role || !/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Affectation incomplète ou invalide.")}`);
  }

  const [{ data: chantier }, { data: employe }] = await Promise.all([
    supabase.from("chantiers").select("id").eq("id", chantierId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("employes").select("id").eq("id", employeId).eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(sorti,suspendu)").maybeSingle(),
  ]);
  if (!chantier || !employe) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent("Chantier ou collaborateur introuvable dans cette entreprise.")}`);
  }

  const { data: existante } = await supabase
    .from("equipes_chantiers")
    .select("id")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("chantier_id", chantierId)
    .eq("employe_id", employeId)
    .is("date_fin", null)
    .maybeSingle();

  const valeurs = {
    role_chantier: role,
    date_debut: dateDebut,
    note: champ(formData, "note"),
    updated_at: new Date().toISOString(),
  };
  const resultat = existante
    ? await supabase.from("equipes_chantiers").update(valeurs).eq("id", existante.id).eq("entreprise_id", ctx.entrepriseId)
    : await supabase.from("equipes_chantiers").insert({
        entreprise_id: ctx.entrepriseId,
        chantier_id: chantierId,
        employe_id: employeId,
        ...valeurs,
      });

  if (resultat.error) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent(resultat.error.message)}`);
  }
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/mes-travaux");
  redirect(`/chantiers/${chantierId}?success=${encodeURIComponent("Collaborateur affecté au chantier.")}`);
}

export async function retirerEmployeChantierAction(chantierId: string, affectationId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!(await peutGererChantiers(ctx))) return;

  const { error } = await supabase
    .from("equipes_chantiers")
    .update({ date_fin: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq("id", affectationId)
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", ctx.entrepriseId)
    .is("date_fin", null);
  if (error) {
    redirect(`/chantiers/${chantierId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/mes-travaux");
}
