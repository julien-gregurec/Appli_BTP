import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient, statutChantier, CLIENT_TYPES, CLIENT_STATUTS } from "@/lib/chantier-statuts";
import { euros, statutDevis } from "@/lib/devis";
import { statutFacture } from "@/lib/factures";
import { ExclusionRelanceClient } from "@/components/ExclusionRelanceClient";
import { lireChantiersClient, lireCurseur, lireSyntheseClient, type SyntheseClient } from "@/lib/fiches-agregats";

const TAILLE_PAGE_CHANTIERS = 50;

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ chantiers_apres?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!client) notFound();

  // Totaux calculés en base (gp_client_synthese) : un client peut dépasser
  // 1 000 factures, que PostgREST tronquait sans erreur. Listes bornées :
  // 5 derniers devis / factures, chantiers paginés par curseur.
  const curseurChantiers = lireCurseur(messages.chantiers_apres);
  const [synthese, pageChantiers, { data: devis }, { data: factures }] = await Promise.all([
    lireSyntheseClient(supabase, ctx.entrepriseId, id).catch((err): SyntheseClient | null => {
      console.error("[client] synthèse indisponible", err instanceof Error ? err.message : err);
      return null;
    }),
    lireChantiersClient(supabase, ctx.entrepriseId, id, TAILLE_PAGE_CHANTIERS, curseurChantiers),
    supabase.from("devis").select("id, numero, statut, date_emission, montant_ttc").eq("client_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5),
    supabase.from("factures").select("id, numero, statut, date_emission, montant_ttc, montant_paye").eq("client_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5),
  ]);
  const chantiers = pageChantiers.lignes;
  const totalFacture = synthese?.totalFacture ?? null;
  const totalPaye = synthese?.totalPaye ?? null;
  const resteDu = totalFacture === null || totalPaye === null ? null : Math.max(0, totalFacture - totalPaye);
  const montant = (valeur: number | null) => (valeur === null ? "indisponible" : euros(valeur));

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
          {/*
            Dénomination légale (ELSATIA-GP-CLIENT-LEGAL-FIELDS-V1). Affichée seulement si
            elle diffère du nom commercial : répéter deux fois le même nom n'informe personne.
          */}
          {client.raison_sociale && client.raison_sociale !== client.societe
            ? ligne("Raison sociale", client.raison_sociale)
            : null}
          {ligne("Forme juridique", client.forme_juridique)}
          {ligne("SIRET", client.siret)}
          {ligne("N° TVA", client.numero_tva)}
          {ligne("Adresse", client.adresse_facturation)}
          {ligne("Complément d’adresse", client.adresse_complement)}
          {ligne("Code postal / Ville", [client.code_postal, client.ville].filter(Boolean).join(" "))}
          {/*
            `pays` non renseigné est traité comme la France à la LECTURE, jamais écrit en base
            (cf. commentaire de la colonne, migration 20260908000274). Le libellé le dit.
          */}
          {ligne("Pays", client.pays ?? "FR (par défaut)")}
          {ligne("Téléphone", client.telephone)}
          {ligne("Email", client.email)}
          {ligne("Conditions de paiement", client.conditions_paiement)}
          {ligne("Délai de paiement", `${client.delai_paiement_jours ?? 30} jours`)}
          {ligne("Notes", client.notes)}
          <div className="border-t border-neutral-100 pt-2 dark:border-neutral-800">
            <ExclusionRelanceClient clientId={id} exclueInitial={Boolean(client.relance_auto_exclue)} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Situation financière</h2><Link href={`/devis/nouveau?client=${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">+ Nouveau devis</Link></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Facturé</div><div className="mt-1 font-mono text-lg font-semibold">{montant(totalFacture)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Encaissé</div><div className="mt-1 font-mono text-lg font-semibold text-green-700 dark:text-green-400">{montant(totalPaye)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Reste dû</div><div className="mt-1 font-mono text-lg font-semibold text-amber-700 dark:text-amber-400">{montant(resteDu)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Derniers devis{synthese ? ` (${synthese.nbDevis} au total)` : ""}</div>{devis?.length ? <div className="space-y-1">{devis.map((item) => { const st = statutDevis(item.statut); return <Link key={item.id} href={`/devis/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucun devis.</p>}</div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Dernières factures{synthese ? ` (${synthese.nbFactures} au total)` : ""}</div>{factures?.length ? <div className="space-y-1">{factures.map((item) => { const st = statutFacture(item.statut); return <Link key={item.id} href={`/factures/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucune facture.</p>}</div>
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
          {(curseurChantiers || pageChantiers.suivant) && (
            <nav aria-label="Pagination des chantiers" className="flex items-center justify-between text-sm">
              {curseurChantiers ? <Link href={`/clients/${id}`} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">← Plus récents</Link> : <span />}
              {pageChantiers.suivant ? <Link href={`/clients/${id}?${new URLSearchParams({ chantiers_apres: pageChantiers.suivant })}`} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">Plus anciens →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
