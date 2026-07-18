import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { AutoPrint } from "@/components/AutoPrint";

export default async function ImprimerCommandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: commande }, { data: lignes }, { data: entreprise }, { data: signatures }] = await Promise.all([
    supabase.from("commandes_fournisseurs").select("*,fournisseur:fournisseurs(nom,adresse,code_postal,ville,siret)").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("lignes_commande").select("*").eq("commande_id", id).order("ordre"),
    supabase.from("entreprises").select("*").eq("id", ctx.entrepriseId).single(),
    supabase.from("signatures_documents").select("id,employe_id,nom_signataire,fonction_signataire,signed_at,document_sha256").eq("entreprise_id", ctx.entrepriseId).eq("type_document", "commande").eq("document_id", id).order("signed_at"),
  ]);
  if (!commande) notFound();
  const fournisseur = Array.isArray(commande.fournisseur) ? commande.fournisseur[0] : commande.fournisseur;
  return <><AutoPrint /><DocumentImprimable typeDoc="Bon de commande" numero={commande.numero} dateEmission={commande.date_commande} dateSecondaire={commande.date_livraison_prevue ? { label: "Livraison souhaitée le", valeur: commande.date_livraison_prevue } : null} entreprise={entreprise ?? { nom: ctx.entrepriseNom }} client={{ nom_affiche: fournisseur?.nom ?? "—", adresse_facturation: fournisseur?.adresse, code_postal: fournisseur?.code_postal, ville: fournisseur?.ville, siret: fournisseur?.siret }} lignes={(lignes ?? []).map((ligne) => ({ designation: ligne.designation, description: ligne.description, quantite: ligne.quantite, unite: ligne.unite, prix_unitaire_ht: ligne.prix_unitaire_ht, remise_ligne: 0, taux_tva: ligne.taux_tva }))} montantHt={commande.montant_ht} montantTva={commande.montant_tva} montantTtc={commande.montant_ttc} estFacture={false} signatures={signatures ?? []} /></>;
}
