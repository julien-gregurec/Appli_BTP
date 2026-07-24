import Link from "next/link";
import { creerPeriodePaieAction } from "@/app/actions/paie";
import { getContexteEntreprise } from "@/lib/entreprise";
import { formaterMois, statutPeriodePaie } from "@/lib/paie";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function PaiePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ error, success }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient(); const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_paie");
  const peutParametrer = permissions === null || permissions.includes("parametrer_paie");
  const { data: periodes } = await supabase.from("periodes_paie").select("id,mois,date_debut,date_fin,date_limite_saisie,statut,date_validation,date_export,dossiers_paie_salaries(id,statut,employe_id)").eq("entreprise_id", ctx.entrepriseId).order("mois", { ascending: false }).limit(36);
  const { data: monEmploye } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Préparation de la paie</h1><p className="text-sm text-neutral-500">Variables mensuelles consolidées avant transmission au cabinet comptable.</p></div><div className="flex gap-2">{peutParametrer&&<Link href="/paie/parametres" className="rounded-md border px-3 py-2 text-sm">Paramètres permanents</Link>}<Link href="/paiements-bancaires" className="rounded-md border px-3 py-2 text-sm">Bulletins & virements</Link></div></header>
    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Important :</strong> ce module prépare les éléments variables. Il ne produit pas un bulletin officiel, ne calcule pas les cotisations sociales et ne remplace pas le logiciel de paie ni le contrôle du cabinet comptable.</p>
    {error&&<p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p className="rounded bg-green-50 p-3 text-sm text-green-700">{success}</p>}
    {peutGerer&&<section className="rounded-lg border p-4"><h2 className="font-semibold">Ouvrir une période mensuelle</h2><form action={creerPeriodePaieAction} className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs text-neutral-500">Mois<input name="mois" type="month" required defaultValue={new Date().toISOString().slice(0,7)} className="mt-1 block rounded border px-3 py-2 text-sm"/></label><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Créer et synchroniser</button></form></section>}
    <section className="space-y-3"><h2 className="font-semibold">Périodes</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-3">Mois</th><th className="px-4 py-3">Clôture de saisie</th><th className="px-4 py-3">Salariés</th><th className="px-4 py-3">À contrôler</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3"></th></tr></thead><tbody>{(periodes??[]).map(p=>{const dossiers=p.dossiers_paie_salaries??[];const visibles=peutGerer?dossiers:dossiers.filter(d=>d.employe_id===monEmploye?.id);return <tr key={p.id} className="border-t"><td className="px-4 py-3 font-medium capitalize">{formaterMois(p.mois)}</td><td className="px-4 py-3">{p.date_limite_saisie??"—"}</td><td className="px-4 py-3">{visibles.length}</td><td className="px-4 py-3">{visibles.filter(d=>["a_controler","correction_demandee"].includes(d.statut)).length}</td><td className="px-4 py-3">{statutPeriodePaie(p.statut)}</td><td className="px-4 py-3 text-right"><Link href={`/paie/${p.id}`} className="font-medium text-blue-700 hover:underline">Ouvrir →</Link></td></tr>})}{!(periodes??[]).length&&<tr><td colSpan={6} className="p-8 text-center text-neutral-500">Aucune période de paie.</td></tr>}</tbody></table></div></section>
  </div></main>;
}
