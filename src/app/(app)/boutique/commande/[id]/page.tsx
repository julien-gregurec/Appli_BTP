import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { euros } from "@/lib/devis";
import { annulerCommandeAction } from "@/app/actions/boutique";

const STATUT_LABEL: Record<string, { texte: string; classe: string }> = {
  brouillon: { texte: "Brouillon", classe: "bg-neutral-100 text-neutral-600" },
  en_attente_paiement: { texte: "En attente de paiement", classe: "bg-amber-50 text-amber-700" },
  payee: { texte: "Payée", classe: "bg-green-50 text-green-700" },
  annulee: { texte: "Annulée", classe: "bg-neutral-100 text-neutral-500" },
  expiree: { texte: "Expirée", classe: "bg-red-50 text-red-700" },
};

export default async function CommandeBoutiquePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: commande }, { data: lignes }] = await Promise.all([
    supabase.from("boutique_commandes")
      .select("id,statut,montant_ht,montant_tva,montant_ttc,nom_destinataire,adresse_livraison,code_postal,ville,stripe_checkout_url,created_at")
      .eq("id", id).maybeSingle(),
    supabase.from("boutique_lignes_commande").select("id,nom_snapshot,quantite,prix_unitaire_ht_snapshot,montant_ht").eq("commande_id", id).order("id"),
  ]);
  if (!commande) notFound();
  const statut = STATUT_LABEL[commande.statut] ?? STATUT_LABEL.brouillon;

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-2xl space-y-6">
    <Link href="/boutique" className="text-sm text-neutral-500 hover:underline">← Boutique</Link>
    <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Commande</h1><span className={`rounded-full px-3 py-1 text-xs font-medium ${statut.classe}`}>{statut.texte}</span></div>
    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {commande.statut === "payee" && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Paiement confirmé, merci ! Le matériel sera préparé pour expédition.</p>}
    {commande.statut === "en_attente_paiement" && commande.stripe_checkout_url && <a href={commande.stripe_checkout_url} className="block rounded-md bg-[#0d1b2a] px-4 py-3 text-center text-sm font-semibold text-white">Reprendre le paiement</a>}

    <div className="divide-y rounded-md border">
      {(lignes ?? []).map((ligne) => <div key={ligne.id} className="flex justify-between p-3 text-sm"><span>{ligne.nom_snapshot} × {ligne.quantite}</span><strong className="font-mono">{euros(ligne.montant_ht)}</strong></div>)}
    </div>
    <div className="rounded-md border p-4 text-sm">
      <div className="flex justify-between"><span>Total HT</span><span className="font-mono">{euros(commande.montant_ht)}</span></div>
      <div className="flex justify-between"><span>TVA</span><span className="font-mono">{euros(commande.montant_tva)}</span></div>
      <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total TTC</span><span className="font-mono">{euros(commande.montant_ttc)}</span></div>
    </div>
    {commande.adresse_livraison && <div className="rounded-md border p-4 text-sm text-neutral-600"><p className="mb-1 text-xs font-semibold uppercase text-neutral-400">Livraison</p>{commande.nom_destinataire && <p>{commande.nom_destinataire}</p>}<p>{commande.adresse_livraison}</p><p>{commande.code_postal} {commande.ville}</p></div>}

    {["brouillon", "en_attente_paiement"].includes(commande.statut) && <form action={annulerCommandeAction.bind(null, commande.id)}><button className="text-sm text-red-600 hover:underline">Annuler cette commande</button></form>}
  </div></main>;
}
