import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { StatutChantierSelect } from "@/components/StatutChantierSelect";
import { TacheItem } from "@/components/TacheItem";
import { ajouterTacheAction } from "@/app/actions/chantiers";
import { euros, statutDevis } from "@/lib/devis";
import { statutFacture } from "@/lib/factures";

export default async function ChantierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*, client:clients(id, nom, prenom, societe), type:types_chantier(nom)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!chantier) notFound();

  const { data: taches } = await supabase
    .from("taches")
    .select("id, libelle, statut, echeance")
    .eq("chantier_id", id)
    .order("created_at");

  const [{ data: devis }, { data: factures }, { data: affectations }, { count: documentsCount }] = await Promise.all([
    supabase.from("devis").select("id, numero, statut, montant_ttc").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("factures").select("id, numero, statut, montant_ttc, montant_paye").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("affectations").select("heures").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId),
    supabase.from("documents_chantier").select("id", { count: "exact", head: true }).eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId),
  ]);
  const totalDevisAccepte = (devis ?? []).filter((item) => item.statut === "accepte").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalFacture = (factures ?? []).filter((item) => item.statut !== "annulee").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalPaye = (factures ?? []).reduce((total, item) => total + Number(item.montant_paye ?? 0), 0);
  const totalHeures = (affectations ?? []).reduce((total, item) => total + Number(item.heures ?? 0), 0);

  const client = Array.isArray(chantier.client) ? chantier.client[0] : chantier.client;
  const type = Array.isArray(chantier.type) ? chantier.type[0] : chantier.type;
  const ajouterTache = ajouterTacheAction.bind(null, id);

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
            <Link href="/chantiers" className="text-sm text-neutral-500 hover:underline">← Chantiers</Link>
            <h1 className="mt-1 text-xl font-semibold">{chantier.nom}</h1>
            <p className="font-mono text-xs text-neutral-500">{chantier.reference_interne}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/chantiers/${id}/documents`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
              Photos & documents{documentsCount ? ` (${documentsCount})` : ""}
            </Link>
            <StatutChantierSelect chantierId={id} statut={chantier.statut} />
          </div>
        </div>

        <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Informations</h2>
          {client && (
            <div className="flex gap-2 text-sm">
              <span className="w-40 flex-none text-neutral-500">Client</span>
              <Link href={`/clients/${client.id}`} className="hover:underline">{nomClient(client)}</Link>
            </div>
          )}
          {ligne("Type", type?.nom)}
          {ligne("Adresse", chantier.adresse)}
          {ligne("Code postal / Ville", [chantier.code_postal, chantier.ville].filter(Boolean).join(" "))}
          {ligne("Début prévu", chantier.date_debut_prevue)}
          {ligne("Fin prévue", chantier.date_fin_prevue)}
          {ligne("Budget prévisionnel", chantier.budget_previsionnel ? `${chantier.budget_previsionnel} €` : null)}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Pilotage financier</h2><Link href={`/devis/nouveau?client=${chantier.client_id}&chantier=${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">+ Nouveau devis</Link></div>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Devis acceptés</div><div className="mt-1 font-mono font-semibold">{euros(totalDevisAccepte)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Facturé</div><div className="mt-1 font-mono font-semibold">{euros(totalFacture)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Encaissé</div><div className="mt-1 font-mono font-semibold text-green-700 dark:text-green-400">{euros(totalPaye)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Heures planifiées</div><div className="mt-1 font-mono font-semibold">{totalHeures} h</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Devis</div>{devis?.length ? devis.slice(0, 5).map((item) => { const st = statutDevis(item.statut); return <Link key={item.id} href={`/devis/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; }) : <p className="text-sm text-neutral-500">Aucun devis.</p>}</div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Factures</div>{factures?.length ? factures.slice(0, 5).map((item) => { const st = statutFacture(item.statut); return <Link key={item.id} href={`/factures/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; }) : <p className="text-sm text-neutral-500">Aucune facture.</p>}</div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Tâches</h2>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {taches && taches.length > 0 ? (
              taches.map((t) => (
                <TacheItem
                  key={t.id}
                  tacheId={t.id}
                  chantierId={id}
                  libelle={t.libelle}
                  echeance={t.echeance}
                  fait={t.statut === "fait"}
                />
              ))
            ) : (
              <p className="py-1 text-sm text-neutral-500">Aucune tâche.</p>
            )}
          </div>
          <form action={ajouterTache} className="flex gap-2 pt-2">
            <input
              name="libelle"
              required
              placeholder="Nouvelle tâche…"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="echeance"
              type="date"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              Ajouter
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
