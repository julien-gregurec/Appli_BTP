"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise, type ContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { validerNomFamille } from "@/lib/catalogue/familles";
import { ENTITES_REFERENCE, validerFormat, type EntiteReference } from "@/lib/references";

// Bibliothèque articles / ouvrages (GP V1, lot B). Chaque action revérifie le drapeau, l'entreprise
// ET le droit requis : une Server Action est un point d'entrée public (voir
// node_modules/next/dist/docs/01-app/02-guides/server-actions.md) ; la base revérifie ensuite
// (RLS, RPC SECURITY DEFINER). Toutes restent inertes tant que GP_DEVIS_V2 n'est pas posé.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INACTIF = "Le nouvel éditeur de devis n’est pas encore activé.";
const REFUS = "Vous n’avez pas le droit de faire cette opération.";
const TAILLE_MAX_IMAGE = 2 * 1024 * 1024; // limite des Server Actions (next.config.ts : bodySizeLimit 2 Mo)
const FORMATS_IMAGE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function vers(chemin: string, parametres: Record<string, string | undefined> = {}): never {
  const q = new URLSearchParams(Object.entries(parametres).filter((e): e is [string, string] => Boolean(e[1])));
  redirect(q.size ? `${chemin}?${q}` : chemin);
}

/** Drapeau, entreprise et droit ; sinon retour à `chemin` avec le motif. */
async function exiger(droit: string, chemin: string): Promise<{ ctx: ContexteEntreprise; supabase: Supabase }> {
  if (!devisV2Actif()) vers(chemin, { error: INACTIF });
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!(permissions === null || permissions.includes(droit))) vers(chemin, { error: REFUS });
  return { ctx, supabase: await createClient() };
}

const fiche = (id: string) => `/prestations/${id}/modifier`;
const texte = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function rafraichirCatalogue(prestationId?: string) {
  revalidatePath("/prestations");
  revalidatePath("/devis/nouveau");
  if (prestationId) revalidatePath(fiche(prestationId));
}

/** L'article existe dans l'entreprise courante (lecture sous RLS). */
async function articleExiste(supabase: Supabase, ctx: ContexteEntreprise, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { data } = await supabase.from("prestations_catalogue").select("id").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  return Boolean(data);
}

// ── Image ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Nouvelle image d'article. L'ancienne n'est JAMAIS supprimée (elle peut figurer sur un document
 * déjà émis, même règle que le logo) : chaque envoi a son propre chemin.
 */
export async function envoyerImagePrestationAction(prestationId: string, formData: FormData) {
  const { ctx, supabase } = await exiger("gerer_devis", fiche(prestationId));
  if (!(await articleExiste(supabase, ctx, prestationId))) vers("/prestations", { error: "Article introuvable." });
  const fichier = formData.get("image");
  if (!(fichier instanceof File) || !fichier.size) vers(fiche(prestationId), { error: "Choisissez une image." });
  const ext = FORMATS_IMAGE[fichier.type];
  if (!ext) vers(fiche(prestationId), { error: "Format accepté : PNG, JPG ou WebP." });
  if (fichier.size > TAILLE_MAX_IMAGE) vers(fiche(prestationId), { error: "L’image dépasse 2 Mo." });

  const chemin = `${ctx.entrepriseId}/${prestationId}/${crypto.randomUUID()}.${ext}`;
  const { error: envoi } = await supabase.storage.from("catalogue-images").upload(chemin, fichier, {
    contentType: fichier.type, cacheControl: "3600", upsert: false,
  });
  if (envoi) vers(fiche(prestationId), { error: messageErreurUtilisateur("envoyerImagePrestationAction:upload", envoi, "Impossible d’envoyer l’image.") });
  const { error } = await supabase.from("prestations_catalogue").update({ image_chemin: chemin })
    .eq("id", prestationId).eq("entreprise_id", ctx.entrepriseId);
  if (error) vers(fiche(prestationId), { error: messageErreurUtilisateur("envoyerImagePrestationAction", error, "Image envoyée, mais non rattachée à l’article.") });
  rafraichirCatalogue(prestationId);
  vers(fiche(prestationId), { succes: "image" });
}

/** Retire l'image de la fiche (le fichier, lui, est conservé). */
export async function retirerImagePrestationAction(prestationId: string) {
  const { ctx, supabase } = await exiger("gerer_devis", fiche(prestationId));
  const { error } = await supabase.from("prestations_catalogue").update({ image_chemin: null })
    .eq("id", prestationId).eq("entreprise_id", ctx.entrepriseId);
  if (error) vers(fiche(prestationId), { error: messageErreurUtilisateur("retirerImagePrestationAction", error, "Impossible de retirer l’image.") });
  rafraichirCatalogue(prestationId);
  vers(fiche(prestationId));
}

// ── Codes distributeurs ──────────────────────────────────────────────────────────────────────────

export async function ajouterCodeFournisseurAction(prestationId: string, formData: FormData) {
  const { ctx, supabase } = await exiger("gerer_devis", fiche(prestationId));
  const fournisseurId = texte(formData.get("fournisseur_id"));
  const code = texte(formData.get("code_article"));
  const principal = formData.get("principal") === "on";
  if (!UUID.test(fournisseurId)) vers(fiche(prestationId), { error: "Choisissez un distributeur." });
  if (!code || Array.from(code).length > 120) vers(fiche(prestationId), { error: "Le code distributeur comporte de 1 à 120 caractères." });

  if (principal) {
    await supabase.from("catalogue_codes_fournisseurs").update({ principal: false })
      .eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId).eq("principal", true);
  }
  const { error } = await supabase.from("catalogue_codes_fournisseurs").insert({
    entreprise_id: ctx.entrepriseId, prestation_id: prestationId, fournisseur_id: fournisseurId, code_article: code, principal,
  });
  if (error) vers(fiche(prestationId), { error: messageErreurUtilisateur("ajouterCodeFournisseurAction", error, "Impossible d’ajouter ce code distributeur.") });
  rafraichirCatalogue(prestationId);
  vers(fiche(prestationId), { succes: "code" });
}

export async function retirerCodeFournisseurAction(prestationId: string, codeId: string) {
  const { ctx, supabase } = await exiger("gerer_devis", fiche(prestationId));
  const { error } = await supabase.from("catalogue_codes_fournisseurs").delete()
    .eq("id", codeId).eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId);
  if (error) vers(fiche(prestationId), { error: messageErreurUtilisateur("retirerCodeFournisseurAction", error, "Impossible de retirer ce code.") });
  rafraichirCatalogue(prestationId);
  vers(fiche(prestationId));
}

export async function definirCodePrincipalAction(prestationId: string, codeId: string) {
  const { ctx, supabase } = await exiger("gerer_devis", fiche(prestationId));
  // Retirer d'abord l'ancien principal : l'index unique n'en admet qu'un par article.
  await supabase.from("catalogue_codes_fournisseurs").update({ principal: false })
    .eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId).eq("principal", true);
  const { error } = await supabase.from("catalogue_codes_fournisseurs").update({ principal: true })
    .eq("id", codeId).eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId);
  if (error) vers(fiche(prestationId), { error: messageErreurUtilisateur("definirCodePrincipalAction", error, "Impossible de changer le distributeur principal.") });
  rafraichirCatalogue(prestationId);
  vers(fiche(prestationId));
}

// ── Duplication et favoris ───────────────────────────────────────────────────────────────────────

export async function dupliquerPrestationAction(prestationId: string) {
  const { supabase } = await exiger("gerer_devis", fiche(prestationId));
  const { data, error } = await supabase.rpc("dupliquer_prestation", { p_prestation_id: prestationId });
  if (error || !data) vers(fiche(prestationId), { error: messageErreurUtilisateur("dupliquerPrestationAction", error, "Impossible de dupliquer cet article.") });
  rafraichirCatalogue();
  vers(fiche(String(data)), { succes: "duplication" });
}

export async function basculerFavoriPrestationAction(prestationId: string, favori: boolean, retourVers?: string) {
  const chemin = retourVers === "/prestations" ? "/prestations" : fiche(prestationId);
  const { ctx, supabase } = await exiger("acces_devis", chemin);
  const requete = favori
    ? supabase.from("catalogue_favoris").insert({ entreprise_id: ctx.entrepriseId, prestation_id: prestationId, utilisateur_id: ctx.userId })
    : supabase.from("catalogue_favoris").delete().eq("prestation_id", prestationId).eq("utilisateur_id", ctx.userId);
  const { error } = await requete;
  // Un favori déjà posé (double clic) n'est pas une erreur pour l'utilisateur.
  if (error && error.code !== "23505") vers(chemin, { error: messageErreurUtilisateur("basculerFavoriPrestationAction", error, "Impossible de modifier ce favori.") });
  rafraichirCatalogue(prestationId);
  vers(chemin);
}

// ── Familles ─────────────────────────────────────────────────────────────────────────────────────

const FAMILLES = "/prestations/familles";

function lireFamille(formData: FormData): { nom: string; parentId: string | null; ordre: number } | { erreur: string } {
  const nom = validerNomFamille(texte(formData.get("nom")));
  if (!nom.ok) return { erreur: nom.erreur };
  const parent = texte(formData.get("parent_id"));
  if (parent && !UUID.test(parent)) return { erreur: "Famille parente invalide." };
  const ordreBrut = texte(formData.get("ordre"));
  const ordre = ordreBrut ? Number(ordreBrut) : 0;
  if (!Number.isInteger(ordre) || Math.abs(ordre) > 10000) return { erreur: "L’ordre est un nombre entier." };
  return { nom: nom.valeur, parentId: parent || null, ordre };
}

const MESSAGE_FAMILLE = "Impossible d’enregistrer cette famille.";

export async function creerFamilleAction(formData: FormData) {
  const { ctx, supabase } = await exiger("gerer_devis", FAMILLES);
  const lu = lireFamille(formData);
  if ("erreur" in lu) vers(FAMILLES, { error: lu.erreur });
  const { error } = await supabase.from("catalogue_familles").insert({
    entreprise_id: ctx.entrepriseId, nom: lu.nom, parent_id: lu.parentId, ordre: lu.ordre,
  });
  if (error) {
    const message = error.code === "23505" ? "Une famille de ce nom existe déjà à cet endroit."
      : error.code === "P0001" ? error.message : messageErreurUtilisateur("creerFamilleAction", error, MESSAGE_FAMILLE);
    vers(FAMILLES, { error: message });
  }
  rafraichirCatalogue();
  revalidatePath(FAMILLES);
  vers(FAMILLES, { succes: "creee" });
}

export async function modifierFamilleAction(familleId: string, formData: FormData) {
  const { ctx, supabase } = await exiger("gerer_devis", FAMILLES);
  const lu = lireFamille(formData);
  if ("erreur" in lu) vers(FAMILLES, { error: lu.erreur });
  const { error } = await supabase.from("catalogue_familles")
    .update({ nom: lu.nom, parent_id: lu.parentId, ordre: lu.ordre })
    .eq("id", familleId).eq("entreprise_id", ctx.entrepriseId);
  if (error) {
    const message = error.code === "23505" ? "Une famille de ce nom existe déjà à cet endroit."
      : error.code === "P0001" ? error.message : messageErreurUtilisateur("modifierFamilleAction", error, MESSAGE_FAMILLE);
    vers(FAMILLES, { error: message });
  }
  rafraichirCatalogue();
  revalidatePath(FAMILLES);
  vers(FAMILLES, { succes: "modifiee" });
}

export async function changerActivationFamilleAction(familleId: string, actif: boolean) {
  const { ctx, supabase } = await exiger("gerer_devis", FAMILLES);
  const { error } = await supabase.from("catalogue_familles").update({ actif })
    .eq("id", familleId).eq("entreprise_id", ctx.entrepriseId);
  if (error) vers(FAMILLES, { error: messageErreurUtilisateur("changerActivationFamilleAction", error, MESSAGE_FAMILLE) });
  revalidatePath(FAMILLES);
  vers(FAMILLES);
}

export async function supprimerFamilleAction(familleId: string) {
  const { ctx, supabase } = await exiger("gerer_devis", FAMILLES);
  const { error } = await supabase.from("catalogue_familles").delete().eq("id", familleId).eq("entreprise_id", ctx.entrepriseId);
  if (error) {
    const message = error.code === "23503"
      ? "Cette famille range encore des articles, des ouvrages ou des sous-familles : archivez-la plutôt."
      : messageErreurUtilisateur("supprimerFamilleAction", error, MESSAGE_FAMILLE);
    vers(FAMILLES, { error: message });
  }
  revalidatePath(FAMILLES);
  vers(FAMILLES, { succes: "supprimee" });
}

// ── Numérotation des références (Paramètres) ─────────────────────────────────────────────────────

const PARAMETRES = "/parametres";

export async function modifierParametresReferencesAction(formData: FormData) {
  const { ctx, supabase } = await exiger("gerer_parametres", PARAMETRES);
  const lignes = [];
  for (const entite of ENTITES_REFERENCE) {
    const format = {
      prefixe: texte(formData.get(`prefixe_${entite}`)).toUpperCase(),
      largeur: Number(texte(formData.get(`largeur_${entite}`))),
      avecAnnee: formData.get(`annee_${entite}`) === "on",
    };
    const refus = validerFormat(format);
    if (refus) vers(PARAMETRES, { error: `Références (${entite}) : ${refus}` });
    lignes.push({
      entreprise_id: ctx.entrepriseId,
      entite,
      prefixe: format.prefixe,
      largeur: format.largeur,
      avec_annee: format.avecAnnee,
      // Le fournisseur est toujours numéroté : sa référence est obligatoire.
      generation_auto: entite === "fournisseur" ? true : formData.get(`auto_${entite}`) === "on",
      maj_le: new Date().toISOString(),
      maj_par: ctx.userId,
    });
  }
  const { error } = await supabase.from("references_parametres").upsert(lignes, { onConflict: "entreprise_id,entite" });
  if (error) vers(PARAMETRES, { error: messageErreurUtilisateur("modifierParametresReferencesAction", error, "Impossible d’enregistrer la numérotation.") });
  revalidatePath(PARAMETRES);
  vers(PARAMETRES, { succes: "references" });
}

const DROIT_ATTRIBUTION: Partial<Record<EntiteReference, string>> = {
  client: "gerer_clients", chantier: "gerer_chantiers", article: "gerer_devis", ouvrage: "gerer_ouvrages",
};

export async function attribuerReferencesManquantesAction(entite: EntiteReference) {
  const droit = DROIT_ATTRIBUTION[entite];
  if (!droit) vers(PARAMETRES, { error: "Cette nature d’objet est toujours numérotée." });
  const { ctx, supabase } = await exiger(droit, PARAMETRES);
  const { data, error } = await supabase.rpc("attribuer_references_manquantes", { p_entreprise_id: ctx.entrepriseId, p_entite: entite });
  if (error) vers(PARAMETRES, { error: messageErreurUtilisateur("attribuerReferencesManquantesAction", error, "Impossible d’attribuer les références.") });
  rafraichirCatalogue();
  revalidatePath(PARAMETRES);
  vers(PARAMETRES, { succes: "references", attribuees: String(Number(data ?? 0)) });
}
