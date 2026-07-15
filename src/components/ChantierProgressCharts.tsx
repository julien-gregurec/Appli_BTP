import { euros } from "@/lib/devis";

function Barre({ label, valeur, maximum, texte, couleur }: { label: string; valeur: number; maximum: number; texte: string; couleur: string }) {
  const largeur = maximum > 0 ? Math.min(100, valeur / maximum * 100) : 0;
  return <div><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="text-neutral-600 dark:text-neutral-300">{label}</span><strong>{texte}</strong></div><div className="h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"><div className="h-full rounded-full" style={{width:`${largeur}%`,backgroundColor:couleur}}/></div></div>;
}

export function ChantierProgressCharts({ finances, heures, taches }: {
  finances: { devis: number; facture: number; paye: number } | null;
  heures: { planifiees: number; validees: number } | null;
  taches: { total: number; faites: number };
}) {
  const maximumFinance = finances ? Math.max(finances.devis, finances.facture, finances.paye, 1) : 1;
  return <section><div className="mb-3"><h2 className="font-semibold">Avancement du chantier</h2><p className="text-xs text-neutral-500">Lecture rapide des éléments autorisés pour votre compte.</p></div><div className="grid gap-4 md:grid-cols-3">
    {finances&&<article className="space-y-3 rounded-xl border p-4 dark:border-neutral-800"><h3 className="text-sm font-semibold">Avancement financier</h3><Barre label="Devis acceptés" valeur={finances.devis} maximum={maximumFinance} texte={euros(finances.devis)} couleur="#c9a24a"/><Barre label="Facturé" valeur={finances.facture} maximum={maximumFinance} texte={euros(finances.facture)} couleur="#315c86"/><Barre label="Encaissé" valeur={finances.paye} maximum={maximumFinance} texte={euros(finances.paye)} couleur="#3f7d58"/></article>}
    {heures&&<article className="space-y-3 rounded-xl border p-4 dark:border-neutral-800"><h3 className="text-sm font-semibold">Temps chantier</h3><Barre label="Heures planifiées" valeur={heures.planifiees} maximum={Math.max(heures.planifiees,heures.validees,1)} texte={`${heures.planifiees} h`} couleur="#c9a24a"/><Barre label="Heures réalisées validées" valeur={heures.validees} maximum={Math.max(heures.planifiees,heures.validees,1)} texte={`${heures.validees} h`} couleur="#3f7d58"/><p className="text-xs text-neutral-500">Les pointages en attente de validation ne sont pas comptés.</p></article>}
    <article className="space-y-3 rounded-xl border p-4 dark:border-neutral-800"><h3 className="text-sm font-semibold">Tâches</h3><Barre label="Tâches terminées" valeur={taches.faites} maximum={Math.max(taches.total,1)} texte={`${taches.faites} / ${taches.total}`} couleur="#3f7d58"/><p className="text-xs text-neutral-500">{taches.total===0?"Aucune tâche créée.":taches.faites===taches.total?"Toutes les tâches sont terminées.":`${taches.total-taches.faites} tâche(s) restante(s).`}</p></article>
  </div></section>;
}
