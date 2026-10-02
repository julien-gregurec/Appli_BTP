"use server";

import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import {
  construireAlertes,
  lireEtatAlertes,
  lireSourcesAlertes,
  pageAlertes,
  repartirAlertes,
  TAILLE_PAGE_ALERTES,
  type FiltreAlertes,
  type PageAlertes,
} from "@/lib/alertes-operationnelles";

type ResultatAction = { ok: true } | { ok: false; error: string };

function nettoyerCle(valeur: string) {
  const cle = valeur.trim();
  return /^[a-z0-9-]{1,120}$/i.test(cle) ? cle : null;
}

export async function ignorerAlerteOperationnelleAction(
  alerteCle: string,
  signature: string,
  titre: string,
): Promise<ResultatAction> {
  const cle = nettoyerCle(alerteCle);
  const signatureNettoyee = signature.trim();
  const titreNettoye = titre.trim().slice(0, 250);

  if (!cle || !signatureNettoyee || signatureNettoyee.length > 1_000) {
    return { ok: false, error: "Cette alerte ne peut pas être ignorée." };
  }

  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase
    .from("alertes_operationnelles_ignorees")
    .upsert(
      {
        entreprise_id: ctx.entrepriseId,
        utilisateur_id: ctx.userId,
        alerte_cle: cle,
        signature: signatureNettoyee,
        titre: titreNettoye || null,
        ignoree_at: new Date().toISOString(),
      },
      { onConflict: "entreprise_id,utilisateur_id,alerte_cle" },
    );

  if (error) return { ok: false, error: "Impossible d’ignorer l’alerte pour le moment." };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function retablirAlerteOperationnelleAction(
  alerteCle: string,
): Promise<ResultatAction> {
  const cle = nettoyerCle(alerteCle);
  if (!cle) return { ok: false, error: "Alerte invalide." };

  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase
    .from("alertes_operationnelles_ignorees")
    .delete()
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("utilisateur_id", ctx.userId)
    .eq("alerte_cle", cle);

  if (error) return { ok: false, error: "Impossible de rétablir l’alerte pour le moment." };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleguerAlerteOperationnelleAction(
  alerte: { id: string; domaine: string; titre: string; href: string; niveau: "critique" | "attention" },
  employeId: string,
  commentaire: string,
): Promise<ResultatAction> {
  const cle = nettoyerCle(alerte.id);
  if (!cle) return { ok: false, error: "Cette alerte ne peut pas être déléguée." };
  if (!employeId || employeId.trim().length === 0) {
    return { ok: false, error: "Sélectionnez un employé." };
  }
  const commentaireNettoye = commentaire.trim().slice(0, 500);

  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase.rpc("deleguer_alerte_operationnelle", {
    p_entreprise_id: ctx.entrepriseId,
    p_alerte_cle: cle,
    p_alerte_domaine: alerte.domaine,
    p_alerte_titre: alerte.titre.slice(0, 250),
    p_alerte_href: alerte.href.slice(0, 250),
    p_alerte_niveau: alerte.niveau,
    p_employe_id: employeId,
    p_commentaire: commentaireNettoye || null,
  });

  if (error) {
    console.error("deleguerAlerteOperationnelleAction", error);
    if (error.message.includes("Accès refusé")) return { ok: false, error: "Vous n’avez pas les droits nécessaires pour déléguer cette alerte." };
    if (error.message.includes("droits nécessaires")) return { ok: false, error: "Cet employé n’a pas les droits nécessaires pour cette alerte." };
    if (error.message.includes("compte applicatif")) return { ok: false, error: "Cet employé n’a pas encore de compte applicatif." };
    if (error.message.includes("Employé invalide")) return { ok: false, error: "Employé invalide." };
    return { ok: false, error: "Impossible de déléguer l’alerte pour le moment." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

const FILTRES: FiltreAlertes[] = ["toutes", "mes_alertes", "deleguees_par_moi", "ignorees"];

/**
 * Suite du centre d'alertes, chargée à la demande (ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1) :
 * mêmes alertes, mêmes droits et même état (ignorées, déléguées) que le tableau de bord, qui n'en
 * envoie plus qu'un résumé et une première page. Lecture seule ; RLS et contexte d'entreprise
 * inchangés.
 */
export async function chargerAlertesOperationnellesAction(
  filtre: FiltreAlertes,
  debut: number,
  nombre: number = TAILLE_PAGE_ALERTES,
): Promise<{ ok: true; page: PageAlertes } | { ok: false; error: string }> {
  if (!FILTRES.includes(filtre) || !Number.isFinite(debut) || !Number.isFinite(nombre)) return { ok: false, error: "Demande invalide." };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const autorise = (cle: string) => permissions === null || permissions.includes(cle);
  const voir = {
    devis: autorise("acces_devis"), factures: autorise("acces_factures"), stock: autorise("acces_stock"),
    flotte: autorise("acces_flotte"), outillage: autorise("acces_outillage"), achats: autorise("acces_achats"),
  };
  if (!Object.values(voir).some(Boolean)) return { ok: false, error: "Accès refusé." };
  const voirIndicateursFinanciers = permissions !== null && permissions.includes("voir_indicateurs_financiers");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [sources, etat, { data: employeCompte }] = await Promise.all([
    lireSourcesAlertes(supabase, ctx.entrepriseId, voir, aujourdhui),
    permissions !== null ? lireEtatAlertes(supabase, ctx.entrepriseId, ctx.userId) : Promise.resolve({ masquages: [], delegations: [] }),
    permissions !== null
      ? supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).eq("statut", "actif").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const centre = repartirAlertes(construireAlertes(sources, aujourdhui, voirIndicateursFinanciers), etat);
  const page = await pageAlertes(supabase, ctx.entrepriseId, centre, {
    filtre, debut, nombre, employeCourantId: employeCompte?.id ?? null, utilisateurCourantId: ctx.userId,
  });
  return { ok: true, page };
}
