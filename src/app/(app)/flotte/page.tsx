import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

const dateFr = (d: string | null) => d ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${d}T12:00:00`)) : "—";
export default async function FlottePage() {
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  const { data: vehicules } = await supabase.from("vehicules").select("*").eq("entreprise_id", ctx.entrepriseId).order("immatriculation");
  const aujourdHui = new Date().toISOString().slice(0,10);
  const alertes = (vehicules ?? []).filter(v => [v.controle_technique_echeance,v.assurance_echeance,v.prochain_entretien_date].some(d => d && d <= aujourdHui)).length;
  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">Flotte automobile</h1><p className="text-sm text-neutral-500">{vehicules?.length ?? 0} véhicule(s) · {alertes} échéance(s) à traiter</p></div><Link href="/flotte/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">+ Nouveau véhicule</Link></div>
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Immatriculation</th><th>Véhicule</th><th>Kilométrage</th><th>Contrôle technique</th><th>Assurance</th><th>Statut</th></tr></thead><tbody>
    {(vehicules ?? []).map(v => <tr key={v.id} className="border-t border-neutral-100 dark:border-neutral-800"><td className="px-4 py-3"><Link href={`/flotte/${v.id}`} className="font-mono font-medium hover:underline">{v.immatriculation}</Link></td><td>{v.marque} {v.modele}</td><td>{Number(v.kilometrage).toLocaleString("fr-FR")} km</td><td>{dateFr(v.controle_technique_echeance)}</td><td>{dateFr(v.assurance_echeance)}</td><td className="capitalize">{v.statut.replace("_"," ")}</td></tr>)}
    {(!vehicules || vehicules.length===0)&&<tr><td colSpan={6} className="p-8 text-center text-neutral-500">Aucun véhicule enregistré.</td></tr>}</tbody></table></div>
  </div></main>;
}
