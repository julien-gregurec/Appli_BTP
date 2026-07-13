import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

type Ligne = { designation: string; description: string | null; quantite: number; unite: string };
type DevisTerrain = { id: string; numero: string | null; statut: string; date_emission: string | null; chantier_id: string; chantier: string; notes: string | null; lignes: Ligne[] };

export default async function MesTravauxPage() {
  if (isEmailLoginDisabled()) return <main className="p-3 sm:p-8"><div className="mx-auto max-w-5xl"><h1 className="text-xl font-semibold">Mes travaux à réaliser</h1><p className="mt-4 rounded bg-amber-50 p-4 text-sm text-amber-900">Un compte personnel sécurisé est nécessaire pour identifier vos chantiers sans exposer ceux des autres équipes.</p></div></main>;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mes_devis_chantiers_sans_prix", { p_entreprise_id: ctx.entrepriseId });
  const devis = (data ?? []) as DevisTerrain[];
  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-xl font-semibold">Mes travaux à réaliser</h1><p className="text-sm text-neutral-500">Prestations des devis acceptés ou envoyés sur vos chantiers. Les prix et totaux ne sont jamais transmis ici.</p></div>
    {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
    {devis.map((document) => <article key={document.id} className="overflow-hidden rounded-lg border"><div className="bg-[#0d1b2a] p-4 text-white"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{document.chantier}</h2><p className="text-xs text-white/60">{document.numero ?? "Devis"}{document.date_emission ? ` · ${document.date_emission}` : ""}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs">{document.statut}</span></div></div><div className="divide-y">{document.lignes.map((ligne, index) => <div key={`${ligne.designation}-${index}`} className="p-4"><div className="flex justify-between gap-3"><strong>{ligne.designation}</strong><span className="font-mono text-sm">{ligne.quantite} {ligne.unite}</span></div>{ligne.description && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{ligne.description}</p>}</div>)}</div>{document.notes && <p className="border-t bg-neutral-50 p-4 text-sm"><strong>Consignes :</strong> {document.notes}</p>}</article>)}
    {!devis.length && !error && <p className="rounded border border-dashed p-8 text-center text-sm text-neutral-500">Aucun devis de chantier ne vous est encore affecté.</p>}
  </div></main>;
}
