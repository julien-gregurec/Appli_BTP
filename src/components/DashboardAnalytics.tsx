type DonutItem = { label: string; value: number; color: string };
type MonthItem = { label: string; devis: number; factures: number };

const eurosCompact = (valeur: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
}).format(valeur);

function Donut({ items }: { items: DonutItem[] }) {
  const total = items.reduce((somme, item) => somme + item.value, 0);
  let position = 0;
  const segments = items.filter((item) => item.value > 0).map((item) => {
    const debut = position;
    position += total ? item.value / total * 100 : 0;
    return `${item.color} ${debut}% ${position}%`;
  });
  return <div className="flex flex-col items-center gap-4 sm:flex-row">
    <div className="relative h-32 w-32 flex-none rounded-full" style={{background: total ? `conic-gradient(${segments.join(",")})` : "#e5e7eb"}}>
      <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white dark:bg-neutral-950"><strong className="text-2xl">{total}</strong><span className="text-[10px] text-neutral-500">chantiers</span></div>
    </div>
    <div className="min-w-0 flex-1 space-y-2">{items.filter((item)=>item.value>0).map((item)=><div key={item.label} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{background:item.color}}/><span className="flex-1 truncate text-neutral-600 dark:text-neutral-300">{item.label}</span><strong>{item.value}</strong></div>)}{total===0&&<p className="text-sm text-neutral-500">Aucun chantier enregistré.</p>}</div>
  </div>;
}

function MonthlyBars({ months }: { months: MonthItem[] }) {
  const maximum = Math.max(1, ...months.flatMap((mois) => [mois.devis, mois.factures]));
  return <div>
    <div className="flex h-36 items-end gap-3 border-b border-neutral-200 px-1 dark:border-neutral-800">{months.map((mois)=><div key={mois.label} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1"><div title={`Devis : ${eurosCompact(mois.devis)}`} className="w-[38%] max-w-5 rounded-t bg-[#b8792e]" style={{height:`${Math.max(mois.devis?6:0,mois.devis/maximum*100)}%`}}/><div title={`Factures : ${eurosCompact(mois.factures)}`} className="w-[38%] max-w-5 rounded-t bg-[#2563eb]" style={{height:`${Math.max(mois.factures?6:0,mois.factures/maximum*100)}%`}}/></div>)}</div>
    <div className="mt-2 flex gap-3 px-1">{months.map((mois)=><span key={mois.label} className="min-w-0 flex-1 text-center text-[10px] text-neutral-500">{mois.label}</span>)}</div>
    <div className="mt-3 flex justify-center gap-4 text-xs"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#b8792e]"/>Devis émis</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#2563eb]"/>Facturé</span></div>
  </div>;
}

function Encaissement({ facture, encaisse }: { facture: number; encaisse: number }) {
  const pourcentage = facture > 0 ? Math.min(100, encaisse / facture * 100) : 0;
  return <div className="space-y-4">
    <div className="flex items-end justify-between"><div><p className="text-xs text-neutral-500">Taux d’encaissement</p><strong className="text-3xl">{Math.round(pourcentage)} %</strong></div><span className="text-sm font-semibold text-green-700">{eurosCompact(encaisse)}</span></div>
    <div className="h-4 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"><div className="h-full rounded-full bg-green-600 transition-all" style={{width:`${pourcentage}%`}}/></div>
    <div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900"><span className="block text-xs text-neutral-500">Facturé</span><strong>{eurosCompact(facture)}</strong></div><div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30"><span className="block text-xs text-neutral-500">À encaisser</span><strong className="text-amber-800 dark:text-amber-300">{eurosCompact(Math.max(0,facture-encaisse))}</strong></div></div>
  </div>;
}

export function DashboardAnalytics({ chantiers, months, finance }: { chantiers?: DonutItem[]; months?: MonthItem[]; finance?: { facture: number; encaisse: number } }) {
  const colonnes = [chantiers, months, finance].filter(Boolean).length;
  if (!colonnes) return null;
  return <section><div className="mb-3"><h2 className="font-semibold">Vue d’ensemble</h2><p className="text-xs text-neutral-500">Les graphiques suivent uniquement les domaines autorisés pour votre poste.</p></div><div className={`grid gap-4 ${colonnes>=3?"xl:grid-cols-3":"md:grid-cols-2"}`}>
    {chantiers&&<article className="rounded-xl border p-4 dark:border-neutral-800"><h3 className="mb-4 text-sm font-semibold">État des chantiers</h3><Donut items={chantiers}/></article>}
    {months&&<article className="rounded-xl border p-4 dark:border-neutral-800"><h3 className="text-sm font-semibold">Activité des 6 derniers mois</h3><p className="mb-3 text-xs text-neutral-500">Montants TTC</p><MonthlyBars months={months}/></article>}
    {finance&&<article className="rounded-xl border p-4 dark:border-neutral-800"><h3 className="mb-4 text-sm font-semibold">Encaissements</h3><Encaissement facture={finance.facture} encaisse={finance.encaisse}/></article>}
  </div></section>;
}
