"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { aPermissionPlateforme } from "@/lib/plateforme";
import { creerSessionCheckoutBoutique } from "@/lib/stripe-boutique";
import { boutiqueEstActive, MESSAGE_BOUTIQUE_INDISPONIBLE } from "@/lib/preview-features";

type LignePanier = { produitId: string; quantite: number };

function parserPanier(brut: string): LignePanier[] {
  let valeurs: unknown;
  try { valeurs = JSON.parse(brut); } catch { return []; }
  if (!Array.isArray(valeurs)) return [];
  return valeurs
    .map((v) => {
      const objet = v as { produitId?: unknown; quantite?: unknown };
      return { produitId: String(objet?.produitId ?? ""), quantite: Math.trunc(Number(objet?.quantite ?? 0)) };
    })
    .filter((ligne): ligne is LignePanier => Boolean(ligne.produitId) && ligne.quantite > 0);
}

export async function passerCommandeAction(formData: FormData) {
  if (!boutiqueEstActive()) redirect(`/dashboard?error=${encodeURIComponent(MESSAGE_BOUTIQUE_INDISPONIBLE)}`);
  const ctx = await getContexteEntreprise();
  const droits = await permissionsUtilisateur(ctx);
  if (droits !== null && !droits.includes("gerer_boutique")) {
    redirect(`/boutique/panier?error=${encodeURIComponent("Votre poste ne permet pas de commander dans la boutique")}`);
  }
  const lignesPanier = parserPanier(String(formData.get("panier") ?? "[]"));
  if (!lignesPanier.length) redirect(`/boutique/panier?error=${encodeURIComponent("Le panier est vide")}`);

  const supabase = await createClient();
  // Prix et stock recalculés côté serveur : jamais faire confiance aux montants soumis par le client.
  const { data: produits } = await supabase
    .from("boutique_produits")
    .select("id,sku,nom,prix_ht,taux_tva,stock_disponible,actif")
    .in("id", lignesPanier.map((l) => l.produitId))
    .eq("actif", true);
  const lignes = lignesPanier.flatMap((ligne) => {
    const produit = produits?.find((p) => p.id === ligne.produitId);
    if (!produit) return [];
    const quantite = Math.min(ligne.quantite, produit.stock_disponible);
    return quantite > 0 ? [{ produit, quantite }] : [];
  });
  if (!lignes.length) redirect(`/boutique/panier?error=${encodeURIComponent("Les produits du panier ne sont plus disponibles en stock")}`);

  const montantHt = lignes.reduce((total, l) => total + Number(l.produit.prix_ht) * l.quantite, 0);
  const montantTva = lignes.reduce((total, l) => total + Number(l.produit.prix_ht) * l.quantite * Number(l.produit.taux_tva), 0);

  const champTexte = (nom: string) => String(formData.get(nom) ?? "").trim() || null;

  const { data: commande, error: commandeErreur } = await supabase
    .from("boutique_commandes")
    .insert({
      entreprise_id: ctx.entrepriseId,
      utilisateur_id: ctx.userId,
      montant_ht: montantHt,
      montant_tva: montantTva,
      montant_ttc: montantHt + montantTva,
      nom_destinataire: champTexte("nom_destinataire"),
      adresse_livraison: champTexte("adresse_livraison"),
      code_postal: champTexte("code_postal"),
      ville: champTexte("ville"),
      telephone: champTexte("telephone"),
    })
    .select("id")
    .single();
  if (commandeErreur || !commande) redirect(`/boutique/panier?error=${encodeURIComponent("Impossible de créer la commande")}`);

  const { error: lignesErreur } = await supabase.from("boutique_lignes_commande").insert(
    lignes.map((l) => ({
      commande_id: commande.id,
      produit_id: l.produit.id,
      sku_snapshot: l.produit.sku,
      nom_snapshot: l.produit.nom,
      prix_unitaire_ht_snapshot: l.produit.prix_ht,
      quantite: l.quantite,
      montant_ht: Number(l.produit.prix_ht) * l.quantite,
    })),
  );
  if (lignesErreur) redirect(`/boutique/panier?error=${encodeURIComponent("Impossible d’enregistrer les lignes de la commande")}`);

  // creerSessionCheckoutBoutique()/redirect() ne doivent pas partager un même try/catch :
  // redirect() lève une exception interne que le catch générique intercepterait à tort.
  let urlPaiement: string;
  try {
    const session = await creerSessionCheckoutBoutique({
      commandeId: commande.id,
      entrepriseId: ctx.entrepriseId,
      lignes: lignes.map((l) => ({
        nom: l.produit.nom,
        quantite: l.quantite,
        prixUnitaireCentimes: Math.round(Number(l.produit.prix_ht) * (1 + Number(l.produit.taux_tva)) * 100),
      })),
    });
    if (!session.url) throw new Error("Stripe n’a pas renvoyé de lien de paiement");
    const { error } = await supabase.from("boutique_commandes").update({
      stripe_checkout_id: session.id,
      stripe_checkout_url: session.url,
      statut: "en_attente_paiement",
      updated_at: new Date().toISOString(),
    }).eq("id", commande.id);
    if (error) throw error;
    urlPaiement = session.url;
  } catch (error) {
    redirect(`/boutique/commande/${commande.id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Paiement indisponible")}`);
  }
  revalidatePath("/boutique");
  redirect(urlPaiement);
}

export async function annulerCommandeAction(commandeId: string) {
  if (!boutiqueEstActive()) redirect(`/dashboard?error=${encodeURIComponent(MESSAGE_BOUTIQUE_INDISPONIBLE)}`);
  const ctx = await getContexteEntreprise();
  const droits = await permissionsUtilisateur(ctx);
  if (droits !== null && !droits.includes("gerer_boutique")) {
    redirect(`/boutique/commande/${commandeId}?error=${encodeURIComponent("Votre poste ne permet pas d’annuler cette commande")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("boutique_commandes")
    .update({ statut: "annulee", updated_at: new Date().toISOString() })
    .eq("id", commandeId).eq("entreprise_id", ctx.entrepriseId)
    .in("statut", ["brouillon", "en_attente_paiement"]);
  if (error) redirect(`/boutique/commande/${commandeId}?error=${encodeURIComponent("Impossible d’annuler cette commande")}`);
  revalidatePath("/boutique");
  revalidatePath(`/boutique/commande/${commandeId}`);
  redirect(`/boutique/commande/${commandeId}`);
}

export async function creerProduitBoutiqueAction(formData: FormData) {
  if (!boutiqueEstActive()) redirect(`/plateforme?error=${encodeURIComponent(MESSAGE_BOUTIQUE_INDISPONIBLE)}`);
  if (!(await aPermissionPlateforme("gerer_boutique"))) redirect("/dashboard");
  const sku = String(formData.get("sku") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "");
  if (!sku || !nom || !categorie) redirect(`/plateforme/boutique?error=${encodeURIComponent("Référence, nom et catégorie sont obligatoires")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("boutique_produits").insert({
    sku,
    nom,
    categorie,
    description: String(formData.get("description") ?? "").trim() || null,
    prix_ht: Number(formData.get("prix_ht") ?? 0),
    taux_tva: Number(formData.get("taux_tva") ?? 0.20),
    image_url: String(formData.get("image_url") ?? "").trim() || null,
    stock_disponible: Math.max(0, Math.trunc(Number(formData.get("stock_disponible") ?? 0))),
    seuil_alerte_stock: Math.max(0, Math.trunc(Number(formData.get("seuil_alerte_stock") ?? 0))),
  });
  if (error) redirect(`/plateforme/boutique?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme/boutique");
  revalidatePath("/boutique");
  redirect(`/plateforme/boutique?success=${encodeURIComponent("Produit créé")}`);
}

export async function modifierProduitBoutiqueAction(produitId: string, formData: FormData) {
  if (!boutiqueEstActive()) redirect(`/plateforme?error=${encodeURIComponent(MESSAGE_BOUTIQUE_INDISPONIBLE)}`);
  if (!(await aPermissionPlateforme("gerer_boutique"))) redirect("/dashboard");
  const supabase = await createClient();
  const { error } = await supabase.from("boutique_produits").update({
    prix_ht: Number(formData.get("prix_ht") ?? 0),
    stock_disponible: Math.max(0, Math.trunc(Number(formData.get("stock_disponible") ?? 0))),
    seuil_alerte_stock: Math.max(0, Math.trunc(Number(formData.get("seuil_alerte_stock") ?? 0))),
    actif: formData.get("actif") === "on",
    updated_at: new Date().toISOString(),
  }).eq("id", produitId);
  if (error) redirect(`/plateforme/boutique?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme/boutique");
  revalidatePath("/boutique");
  redirect(`/plateforme/boutique?success=${encodeURIComponent("Produit mis à jour")}`);
}
