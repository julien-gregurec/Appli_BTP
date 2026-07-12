import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { importerVehiculesAction } from "@/app/actions/flotte";

const dateFr = (d: string | null) => d ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${d}T12:00:00`)) : "—";
export default async function FlottePage({searchParams}:{searchParams:Promise<{error?:string;success?:string}>}) {
  const messages=await searchParams;
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const { data: vehicules } = await supabase.from("vehicules").select("*").eq("entreprise_id", ctx.entrepriseId).order("immatriculation");
  const aujourdHui = new Date().toISOString().slice(0,10);
  const alertes = (vehicules ?? []).filter(v => [v.controle_technique_echeance,v.assurance_echeance,v.prochain_entretien_date].some(d => d && d <= aujourdHui)).length;
  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">Flotte automobile</h1><p className="text-sm text-neutral-500">{vehicules?.length ?? 0} véhicule(s) · {alertes} échéance(s) à traiter</p></div><Link href="/flotte/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">+ Nouveau véhicule</Link></div>
    {messages.error&&<p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}{messages.success&&<p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    <form action={importerVehiculesAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4"><div className="min-w-64 flex-1"><h2 className="font-semibold">Importer une liste de véhicules</h2><p className="text-xs text-neutral-500">Excel, CSV ou PDF : immatriculation, marque, modèle, kilométrage et échéances.</p></div><input name="fichier" type="file" accept=".xlsx,.csv,.pdf,application/pdf" required className="rounded border px-3 py-2 text-sm"/><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm text-white">Importer</button></form>
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Immatriculation</th><th>Véhicule</th><th>Kilométrage</th><th>Contrôle technique</th><th>Assurance</th><th>Statut</th></tr></thead><tbody>
    {(vehicules ?? []).map(v => <tr key={v.id} className="border-t border-neutral-100 dark:border-neutral-800"><td className="px-4 py-3"><Link href={`/flotte/${v.id}`} className="font-mono font-medium hover:underline">{v.immatriculation}</Link></td><td>{v.marque} {v.modele}</td><td>{Number(v.kilometrage).toLocaleString("fr-FR")} km</td><td>{dateFr(v.controle_technique_echeance)}</td><td>{dateFr(v.assurance_echeance)}</td><td className="capitalize">{v.statut.replace("_"," ")}</td></tr>)}
    {(!vehicules || vehicules.length===0)&&<tr><td colSpan={6} className="p-8 text-center text-neutral-500">Aucun véhicule enregistré.</td></tr>}</tbody></table></div>
  </div></main>;
}
