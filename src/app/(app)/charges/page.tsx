import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { materialiserChargeAction } from "@/app/actions/charges";
import { ChargeRecurrenteForm } from "@/components/ChargeRecurrenteForm";
import { DEPENSE_CATEGORIES } from "@/lib/depenses";
import { euros } from "@/lib/devis";

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const messages = await searchParams;
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: charges }, { data: fournisseurs }, { data: chantiers }] = await Promise.all([
    supabase.from("charges_recurrentes").select("*,fournisseur:fournisseurs(nom),chantier:chantiers(nom)").eq("entreprise_id", contexte.entrepriseId).order("prochaine_echeance"),
    supabase.from("fournisseurs").select("id,nom").eq("entreprise_id", contexte.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", contexte.entrepriseId).order("nom"),
  ]);
  const champ = "rounded-md border px-3 py-2 text-sm dark:bg-neutral-900";
  const aujourdHui = new Date().toISOString().slice(0, 10);

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Charges récurrentes</h1><p className="text-sm text-neutral-500">Loyers, assurances, abonnements et locations intégrés à la trésorerie future.</p></div>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
    {messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    {fournisseurs?.length ? <ChargeRecurrenteForm fournisseurs={fournisseurs} chantiers={chantiers ?? []} dateDuJour={aujourdHui}/> : <p className="rounded border border-dashed p-5 text-sm text-neutral-500">Créez d’abord un fournisseur dans le module Fournisseurs.</p>}
    <div className="grid gap-3">{charges?.map((charge) => {
      const fournisseur = un(charge.fournisseur as { nom: string } | { nom: string }[] | null);
      const chantier = un(charge.chantier as { nom: string } | { nom: string }[] | null);
      return <article key={charge.id} className={`rounded border p-4 dark:border-neutral-800 ${!charge.actif ? "opacity-50" : ""}`}>
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{charge.libelle}</h2><p className="text-sm text-neutral-500">{fournisseur?.nom} · {DEPENSE_CATEGORIES[charge.categorie]} · {charge.periodicite}{chantier ? ` · ${chantier.nom}` : " · frais généraux"}</p><p className="mt-1 text-xs text-neutral-500">{euros(charge.montant_ht)} HT · TVA {Number(charge.taux_tva).toLocaleString("fr-FR")} % : {euros(charge.montant_tva)}</p></div><div className="text-right"><strong>{euros(Number(charge.montant_ht) + Number(charge.montant_tva))} TTC</strong><p className="text-xs text-neutral-500">Prochaine : {charge.prochaine_echeance}</p></div></div>
        {charge.actif && <form action={materialiserChargeAction.bind(null, charge.id)} className="mt-3 grid gap-2 border-t pt-3 dark:border-neutral-800 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><input name="numero_piece" required placeholder="N° facture reçue" className={champ}/><input name="date_piece" type="date" defaultValue={aujourdHui} className={champ}/><button className="rounded border px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900">Créer la facture fournisseur</button><p className="text-xs text-neutral-500 sm:col-span-3">La facture générée reprend le fournisseur, le chantier, le HT et le taux de TVA de cette charge.</p></form>}
      </article>;
    })}{(!charges || !charges.length) && <p className="rounded border border-dashed p-8 text-center text-sm text-neutral-500">Aucune charge récurrente.</p>}</div>
  </div></main>;
}
