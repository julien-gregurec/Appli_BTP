import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient, statutChantier, CLIENT_TYPES, CLIENT_STATUTS } from "@/lib/chantier-statuts";
import { euros, statutDevis } from "@/lib/devis";
import { statutFacture } from "@/lib/factures";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!client) notFound();

  const { data: chantiers } = await supabase
    .from("chantiers")
    .select("id, reference_interne, nom, statut, ville")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  const [{ data: devis }, { data: factures }] = await Promise.all([
    supabase.from("devis").select("id, numero, statut, date_emission, montant_ttc").eq("client_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("factures").select("id, numero, statut, date_emission, montant_ttc, montant_paye").eq("client_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
  ]);
  const totalFacture = (factures ?? []).filter((facture) => facture.statut !== "annulee").reduce((total, facture) => total + Number(facture.montant_ttc ?? 0), 0);
  const totalPaye = (factures ?? []).reduce((total, facture) => total + Number(facture.montant_paye ?? 0), 0);
  const resteDu = Math.max(0, totalFacture - totalPaye);

  const typeLabel = CLIENT_TYPES.find((t) => t.cle === client.type)?.libelle ?? client.type;
  const statutLabel = CLIENT_STATUTS.find((s) => s.cle === client.statut)?.libelle ?? client.statut;

  const ligne = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex gap-2 text-sm">
        <span className="w-40 flex-none text-neutral-500">{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/clients" className="text-sm text-neutral-500 hover:underline">← Clients</Link>
            <h1 className="mt-1 text-xl font-semibold">{nomClient(client)}</h1>
            <p className="font-mono text-xs text-neutral-500">
              {client.reference_interne} · {typeLabel} · {statutLabel}
            </p>
          </div>
          <Link href={`/clients/${id}/modifier`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Modifier
          </Link>
        </div>

        <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Coordonnées</h2>
          {ligne("Société", client.societe)}
          {ligne("SIRET", client.siret)}
          {ligne("Adresse", client.adresse_facturation)}
          {ligne("Code postal / Ville", [client.code_postal, client.ville].filter(Boolean).join(" "))}
          {ligne("Téléphone", client.telephone)}
          {ligne("Email", client.email)}
          {ligne("Conditions de paiement", client.conditions_paiement)}
          {ligne("Délai de paiement", `${client.delai_paiement_jours ?? 30} jours`)}
          {ligne("Notes", client.notes)}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Situation financière</h2><Link href={`/devis/nouveau?client=${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">+ Nouveau devis</Link></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Facturé</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalFacture)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Encaissé</div><div className="mt-1 font-mono text-lg font-semibold text-green-700 dark:text-green-400">{euros(totalPaye)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Reste dû</div><div className="mt-1 font-mono text-lg font-semibold text-amber-700 dark:text-amber-400">{euros(resteDu)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Derniers devis</div>{devis?.length ? <div className="space-y-1">{devis.slice(0, 5).map((item) => { const st = statutDevis(item.statut); return <Link key={item.id} href={`/devis/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucun devis.</p>}</div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Dernières factures</div>{factures?.length ? <div className="space-y-1">{factures.slice(0, 5).map((item) => { const st = statutFacture(item.statut); return <Link key={item.id} href={`/factures/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucune facture.</p>}</div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Chantiers</h2>
            <Link href={`/chantiers/nouveau?client=${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
              + Nouveau chantier
            </Link>
          </div>
          {!chantiers || chantiers.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucun chantier pour ce client.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <tbody>
                  {chantiers.map((ch) => {
                    const st = statutChantier(ch.statut);
                    return (
                      <tr key={ch.id} className="border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                        <td className="px-4 py-2 font-mono text-xs text-neutral-500">{ch.reference_interne}</td>
                        <td className="px-4 py-2">
                          <Link href={`/chantiers/${ch.id}`} className="font-medium hover:underline">{ch.nom}</Link>
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                            <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />
                            {st.libelle}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
