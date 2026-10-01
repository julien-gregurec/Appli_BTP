import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { Lien as Link } from "@/components/Lien";
import { COLONNES_IMPORT, ETAT_SOURCE_LIBELLES, importToolsHref, montantImport, regrouperParSource, statutImport, type ImportTools } from "@/lib/imports-tools";

/**
 * Imports Tools / Relevé (Lot 11) : estimations transmises par ELSATIA Tools. Une carte par source (relevé × état) :
 * source, date, version, chantier, nombre d'ouvrages, montant estimatif Tools. Gestion Pro chiffre ensuite (devis).
 */
const TONS = { info: "bg-blue-50 text-blue-800", succes: "bg-green-50 text-green-800", alerte: "bg-amber-100 text-amber-900", neutre: "bg-neutral-100 text-neutral-700" } as const;

export default async function ImportsToolsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("gp_tools_imports")
    .select(COLONNES_IMPORT)
    .eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).limit(500);
  const groupes = regrouperParSource((data ?? []) as ImportTools[]);
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500"><Link href="/devis" className="hover:underline">Devis</Link> › Imports</p>
        <h1 className="text-xl font-semibold">Imports Tools / Relevé</h1>
        <p className="text-sm text-neutral-500">Estimations HT transmises par ELSATIA Tools (relevé, métré, quantitatif). Le prix de vente, la marge, la remise, la TVA et le devis se décident ici.</p>
      </div>
    </header>
    {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {groupes.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500" data-testid="imports-tools-vide">
      Aucun import. Dans ELSATIA Tools, ouvrez l&apos;estimation d&apos;un relevé puis « Envoyer vers Gestion Pro ».</p>}
    <ul className="grid gap-3" data-testid="imports-tools-liste">
      {groupes.map(({ derniere: i, versions }) => {
        const statut = statutImport(i);
        return <li key={i.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" data-testid="import-tools" data-version={i.source_version} data-releve={i.source_releve_id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={importToolsHref(i.id)} className="font-semibold hover:underline" data-testid="import-tools-lien">{i.releve_nom}{i.releve_reference ? ` · ${i.releve_reference}` : ""}</Link>
              <p className="text-xs text-neutral-500">Source : Tools · Relevé &amp; Métré · {ETAT_SOURCE_LIBELLES[i.source_etat] ?? i.source_etat} · reçu le {new Date(i.created_at).toLocaleString("fr-FR")}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${TONS[statut.ton]}`} data-testid="import-tools-statut">{statut.libelle}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-6">
            <div><dt className="text-xs text-neutral-500">Version</dt><dd data-testid="import-tools-version">v{i.source_version} <span className="text-xs text-neutral-500">(contrat {i.contract_version})</span></dd></div>
            <div><dt className="text-xs text-neutral-500">Chantier</dt><dd data-testid="import-tools-chantier">{i.chantier_nom}</dd></div>
            <div><dt className="text-xs text-neutral-500">Client</dt><dd>{i.client_nom ?? "—"}</dd></div>
            <div><dt className="text-xs text-neutral-500">Ouvrages</dt><dd data-testid="import-tools-ouvrages">{i.nb_ouvrages}</dd></div>
            <div><dt className="text-xs text-neutral-500">Lignes</dt><dd>{i.nb_lignes} · {i.nb_lignes_liees} liée(s)</dd></div>
            <div><dt className="text-xs text-neutral-500">Montant estimatif Tools</dt><dd className="font-mono" data-testid="import-tools-montant">{montantImport(i.montant_estimatif_ht)} HT</dd></div>
          </dl>
          {versions.length > 1 && <p className="mt-2 text-xs text-neutral-500">Versions antérieures : {versions.slice(1).map((v, k) => <span key={v.id}>{k > 0 ? " · " : ""}<Link href={importToolsHref(v.id)} className="underline">v{v.source_version}</Link>{v.devis_id ? " (devis créé)" : ""}</span>)}</p>}
        </li>;
      })}
    </ul>
  </div></main>;
}
