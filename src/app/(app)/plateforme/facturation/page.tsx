import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { genererSnapshotFacturationAction } from "@/app/actions/plateforme";

type Ligne = { employe_id: string; employe: string; poste: string | null; offre: string | null; statut: string; montant_ht: number; motif: string };
type Releve = { entreprise_id: string; entreprise_nom: string; mois: string; nombre_comptes: number; montant_ht: number; detail: Ligne[] };
const euros = (montant: number) => Number(montant).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default async function FacturationPlateformePage({ searchParams }: { searchParams: Promise<{ mois?: string; error?: string; succes?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const params = await searchParams;
  const mois = /^\d{4}-\d{2}$/.test(params.mois ?? "") ? params.mois as string : new Date().toISOString().slice(0, 7);
  if (isEmailLoginDisabled()) return <main className="p-3 sm:p-8"><div className="mx-auto max-w-6xl space-y-4"><Link href="/plateforme" className="text-sm text-neutral-500">← Plateforme</Link><h1 className="text-xl font-semibold">Relevés mensuels des comptes</h1><p className="rounded bg-amber-50 p-4 text-sm text-amber-900">Les relevés nominatifs sont fermés en mode prototype. Ils seront disponibles avec le compte propriétaire authentifié.</p></div></main>;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_releve_facturation", { p_mois: `${mois}-01` });
  const releves = (data ?? []) as Releve[];
  const total = releves.reduce((somme, releve) => somme + Number(releve.montant_ht), 0);
  const comptes = releves.reduce((somme, releve) => somme + Number(releve.nombre_comptes), 0);
  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><Link href="/plateforme" className="text-sm text-neutral-500">← Plateforme</Link><h1 className="mt-2 text-xl font-semibold">Relevés mensuels des comptes</h1><p className="text-sm text-neutral-500">Photo figée des comptes ouverts ou en pause, au tarif de leur poste pour le mois.</p></div>
    {(params.error || error) && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{params.error ?? error?.message}</p>}{params.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{params.succes}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded border p-4"><p className="text-xs text-neutral-500">Mois</p><strong>{mois}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Comptes facturés</p><strong className="text-xl">{comptes}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Total HT</p><strong className="text-xl">{euros(total)}</strong></div></div>
    <div className="flex flex-wrap items-end gap-3 rounded border p-4"><form method="get" className="flex items-end gap-2"><label className="text-xs text-neutral-500">Consulter le mois<input name="mois" type="month" defaultValue={mois} className="mt-1 block rounded border px-3 py-2 text-sm"/></label><button className="rounded border px-3 py-2 text-sm">Afficher</button></form><form action={genererSnapshotFacturationAction}><input type="hidden" name="mois" value={mois}/><input type="hidden" name="retour" value={`/plateforme/facturation?mois=${mois}`}/><button className="rounded bg-[#0d1b2a] px-3 py-2 text-sm text-white">Figer les comptes de ce mois</button></form></div>
    <div className="space-y-3">{releves.map((releve) => <details key={releve.entreprise_id} className="rounded-lg border p-4"><summary className="cursor-pointer"><span className="flex items-center justify-between gap-3"><strong>{releve.entreprise_nom}</strong><span>{releve.nombre_comptes} compte(s) · <strong>{euros(releve.montant_ht)}</strong></span></span></summary><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-2">Employé</th><th>Poste</th><th>Offre</th><th>Statut</th><th className="text-right">Montant HT</th></tr></thead><tbody>{(releve.detail ?? []).map((ligne) => <tr key={ligne.employe_id} className="border-t"><td className="py-2">{ligne.employe}</td><td>{ligne.poste ?? "Sans poste"}</td><td>{ligne.offre ?? "standard"}</td><td>{ligne.statut}</td><td className="text-right font-mono">{euros(ligne.montant_ht)}</td></tr>)}</tbody></table></div></details>)}</div>
  </div></main>;
}
