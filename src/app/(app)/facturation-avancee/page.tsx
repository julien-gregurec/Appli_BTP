import Link from "next/link";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { euros } from "@/lib/devis";
import { creerFactureAvanceeAction, creerSituationAction, facturerSituationAction } from "@/app/actions/suite-metier";

const champ = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const libelleClient = (client: { nom?: string | null; prenom?: string | null; societe?: string | null } | null) => client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "Client";
const un = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? v[0] ?? null : v;

export default async function FacturationAvanceePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const message = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [devisResult, situationsResult, remisesResult] = await Promise.all([
    supabase.from("devis").select("id,numero,montant_ht,chantier_id,client:clients(nom,prenom,societe),chantier:chantiers!devis_chantier_id_fkey(nom)").eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte").order("date_emission", { ascending: false }),
    supabase.from("situations_travaux").select("id,numero,date_situation,statut,montant_marche_ht,montant_cumule_ht,montant_periode_ht,montant_retenue,facture_id,devis:devis(numero,client:clients(nom,prenom,societe)),chantier:chantiers(nom)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("remises_banque").select("id,numero,date_remise,mode,statut,montant").eq("entreprise_id", ctx.entrepriseId).order("date_remise", { ascending: false }).limit(12),
  ]);
  const devis = devisResult.data ?? [];
  const situations = situationsResult.data ?? [];
  const remises = remisesResult.data ?? [];
  const devisAvecChantier = devis.filter((item) => item.chantier_id);
  const erreursChargement = [
    devisResult.error && "les devis acceptés",
    situationsResult.error && "les situations de travaux",
    remisesResult.error && "les remises en banque",
  ].filter(Boolean) as string[];
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header><h1 className="text-xl font-semibold">Facturation avancée</h1><p className="text-sm text-neutral-500">Situations de travaux, acomptes, avoirs, factures finales, DGD et remises en banque.</p></header>
    {message.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message.error}</p>}
    {message.success && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{message.success}</p>}
    {erreursChargement.length > 0 && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Impossible de charger {erreursChargement.join(", ")}. Rechargez la page ou contactez l’administrateur si le problème persiste.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={creerSituationAction} className="space-y-3 rounded-xl border p-4"><div><h2 className="font-semibold">Nouvelle situation de travaux</h2><p className="text-xs text-neutral-500">L’avancement indiqué est le cumul total du marché.</p></div>
        <label className="block text-xs">Devis accepté<select required name="devis_id" className={champ} disabled={devisAvecChantier.length === 0}><option value="">Choisir…</option>{devisAvecChantier.map(d => { const c=un(d.client); const ch=un(d.chantier); return <option key={d.id} value={d.id}>{d.numero} · {libelleClient(c)} · {ch?.nom} · {euros(d.montant_ht)}</option>; })}</select></label>
        {!devisResult.error && devisAvecChantier.length === 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">Aucun devis accepté associé à un chantier. <Link href="/devis?statut=accepte" className="font-semibold underline">Consulter les devis acceptés</Link> puis associez le devis au chantier concerné.</p>}
        <div className="grid grid-cols-2 gap-3"><label className="text-xs">Avancement cumulé (%)<input required name="avancement_pct" type="number" min="0.01" max="100" step="0.01" className={champ}/></label><label className="text-xs">Retenue de garantie (%)<input name="retenue_garantie_pct" type="number" min="0" max="20" step="0.01" defaultValue="0" className={champ}/></label></div>
        <label className="block text-xs">Notes<textarea name="notes" rows={2} className={champ}/></label><button disabled={devisAvecChantier.length === 0} className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Calculer la situation</button>
      </form>
      <form action={creerFactureAvanceeAction} className="space-y-3 rounded-xl border p-4"><div><h2 className="font-semibold">Acompte, avoir ou solde</h2><p className="text-xs text-neutral-500">Le document est créé en brouillon avant émission.</p></div>
        <label className="block text-xs">Devis accepté<select required name="devis_id" className={champ} disabled={devis.length === 0}><option value="">Choisir…</option>{devis.map(d => { const ch=un(d.chantier); return <option key={d.id} value={d.id}>{d.numero} · {libelleClient(un(d.client))} · {ch?.nom ?? "Sans chantier"} · {euros(d.montant_ht)}</option>; })}</select></label>
        {!devisResult.error && devis.length === 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">Aucun devis accepté n’est disponible. <Link href="/devis" className="font-semibold underline">Ouvrir les devis</Link> pour en accepter un.</p>}
        <div className="grid grid-cols-2 gap-3"><label className="text-xs">Type<select name="type" className={champ}><option value="acompte">Acompte</option><option value="finale">Facture finale</option><option value="avoir">Avoir</option></select></label><label className="text-xs">Pourcentage du devis<input required name="pourcentage" type="number" min="0.01" max="100" step="0.01" defaultValue="30" className={champ}/></label></div>
        <label className="flex items-center gap-2 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900"><input type="checkbox" name="est_dgd" value="true"/> Marquer comme décompte général définitif (DGD)</label><button disabled={devis.length === 0} className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900">Créer le brouillon</button>
      </form>
    </div>
    <section className="space-y-3"><h2 className="font-semibold">Situations du chantier</h2><div className="grid gap-3 xl:grid-cols-2">{(situations ?? []).map(s => { const d=un(s.devis); const c=d ? un(d.client) : null; const ch=un(s.chantier); return <article key={s.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><strong>Situation n° {s.numero} · {d?.numero}</strong><p className="text-sm text-neutral-500">{libelleClient(c)} · {ch?.nom} · {s.date_situation}</p></div><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{s.statut}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><span className="block text-xs text-neutral-500">Période</span>{euros(s.montant_periode_ht)}</div><div><span className="block text-xs text-neutral-500">Cumul</span>{euros(s.montant_cumule_ht)}</div><div><span className="block text-xs text-neutral-500">Marché</span>{euros(s.montant_marche_ht)}</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full bg-blue-600" style={{width:`${Math.min(100,Number(s.montant_marche_ht)>0?Number(s.montant_cumule_ht)*100/Number(s.montant_marche_ht):0)}%`}}/></div><div className="mt-3 flex items-center justify-between"><span className="text-xs text-neutral-500">Retenue : {euros(s.montant_retenue)}</span>{s.facture_id ? <Link className="text-sm font-medium text-blue-700 hover:underline" href={`/factures/${s.facture_id}`}>Voir la facture</Link> : <form action={facturerSituationAction.bind(null,s.id)}><button className="rounded bg-green-700 px-3 py-2 text-sm text-white">Créer la facture</button></form>}</div></article>; })}{!situations?.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500 xl:col-span-2">Aucune situation créée.</p>}</div></section>
    <section><h2 className="mb-3 font-semibold">Remises en banque</h2><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[600px] text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="p-3">N°</th><th>Date</th><th>Mode</th><th>Statut</th><th className="pr-3 text-right">Montant</th></tr></thead><tbody>{(remises??[]).map(r=><tr key={r.id} className="border-t"><td className="p-3 font-mono">{r.numero}</td><td>{r.date_remise}</td><td>{r.mode}</td><td>{r.statut}</td><td className="pr-3 text-right font-mono">{euros(r.montant)}</td></tr>)}</tbody></table></div></section>
  </div></main>;
}
