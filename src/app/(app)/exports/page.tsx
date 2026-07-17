import Link from "next/link";

const exportsComptables = [
  { type: "ventes", titre: "Journal des ventes", detail: "Une ligne par facture ou avoir : client, HT, TVA, TTC, encaissé et reste dû." },
  { type: "achats", titre: "Journal des achats", detail: "Factures fournisseurs : HT, taux, TVA déductible, TTC, règlement et chantier." },
  { type: "reglements", titre: "Journal des règlements clients", detail: "Tous les encaissements de la période avec facture, client, mode et référence." },
  { type: "tva", titre: "TVA collectée sur les ventes", detail: "Bases HT et TVA par facture client et par taux, avec synthèse en fin de fichier." },
  { type: "tva-achats", titre: "TVA déductible sur les achats", detail: "Factures fournisseurs détaillées et synthèse de la TVA déductible par taux." },
];

export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ debut?: string; fin?: string }> }) {
  const params = await searchParams;
  const maintenant = new Date();
  const debut = /^\d{4}-\d{2}-\d{2}$/.test(params.debut ?? "") ? params.debut! : `${maintenant.getFullYear()}-01-01`;
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(params.fin ?? "") ? params.fin! : maintenant.toISOString().slice(0, 10);
  const href = (type: string, format: "xlsx" | "csv") => `/api/exports/comptabilite?type=${type}&format=${format}&debut=${debut}&fin=${fin}`;

  return <main className="p-4 sm:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Exports comptables</h1>
        <p className="text-sm text-neutral-500">Classeur Excel mis en forme automatiquement, limité aux données de votre entreprise. Le CSV brut reste disponible pour les logiciels comptables qui l’exigent.</p>
      </div>
      <form className="grid gap-3 rounded-md border p-4 dark:border-neutral-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm">Du<input name="debut" type="date" defaultValue={debut} className="mt-1 block w-full rounded-md border px-3 py-2 dark:bg-neutral-900" /></label>
        <label className="text-sm">Au<input name="fin" type="date" defaultValue={fin} className="mt-1 block w-full rounded-md border px-3 py-2 dark:bg-neutral-900" /></label>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">Appliquer la période</button>
      </form>
      <div className="grid gap-4">
        {exportsComptables.map((item) => <article key={item.type} className="grid gap-4 rounded-md border p-5 dark:border-neutral-800 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-semibold">{item.titre}</h2>
            <p className="mt-1 text-sm text-neutral-500">{item.detail}</p>
            <p className="mt-2 text-xs text-neutral-400">Période : {debut} → {fin}</p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Link href={href(item.type, "xlsx")} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Télécharger Excel</Link>
            <Link href={href(item.type, "csv")} className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">CSV brut</Link>
          </div>
        </article>)}
      </div>
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <strong>Format Excel recommandé</strong>
        <p className="mt-1">Les colonnes sont séparées automatiquement, les largeurs s’adaptent au contenu, les en-têtes restent visibles pendant le défilement et les dates, taux et montants conservent leur véritable format.</p>
      </div>
      <p className="text-xs text-neutral-500">Les brouillons sans numéro ne figurent pas dans le journal des ventes. Les avoirs sont exportés avec des montants négatifs.</p>
    </div>
  </main>;
}
