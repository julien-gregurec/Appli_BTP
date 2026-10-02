"use client";

import { supprimerGroupeAffectationsAction } from "@/app/actions/planning";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ModifierAffectationDiffere } from "@/components/ModifierAffectationDiffere";
import { lienMaps } from "@/lib/maps";

// Planning : vue mobile (jour par jour) et tableau bureau (ouvrier × jour) de la semaine.
//
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : rendues par la page serveur, ces deux vues étaient
// encodées DEUX fois dans la réponse (HTML + flux RSC), carte par carte et vue par vue : 660 Ko de
// flux RSC pour une semaine de 38 salariés. Ici, les affectations de la semaine arrivent UNE fois
// (données compactes) et les deux vues sont rendues depuis elles, côté serveur (même HTML) puis au
// client. Même JSX, mêmes classes, mêmes formulaires, mêmes actions qu'avant le déplacement.

export type JourPlanning = { iso: string; court: string; long: string };
export type EmployePlanning = { id: string; prenom: string; nom: string };
export type CartePlanning = {
  id: string;
  date: string;
  heures: number;
  tache: string | null;
  lieu: string | null;
  libelle: string;
  /** Index dans COULEURS (couleur stable par chantier, calculée par la page). */
  couleur: number;
  employe: EmployePlanning | null;
  /** Heures validées (pointages) du salarié ce jour-là, sur ce chantier le cas échéant. */
  valide: number;
};

export const COULEURS_PLANNING = [
  "border-l-blue-500 bg-blue-50",
  "border-l-amber-500 bg-amber-50",
  "border-l-emerald-500 bg-emerald-50",
  "border-l-violet-500 bg-violet-50",
  "border-l-rose-500 bg-rose-50",
  "border-l-cyan-500 bg-cyan-50",
];

type Props = {
  jours: JourPlanning[];
  aujourdhui: string;
  retour: string;
  employes: EmployePlanning[];
  cartes: CartePlanning[];
  peutGererPlanning: boolean;
};

function Modifier({ id, peutGererPlanning }: { id: string; peutGererPlanning: boolean }) {
  if (!peutGererPlanning) return null;
  return <ModifierAffectationDiffere affectationId={id} />;
}

export function PlanningSemaineVues({ jours, aujourdhui, retour, employes, cartes, peutGererPlanning }: Props) {
  const couleur = (index: number) => COULEURS_PLANNING[index % COULEURS_PLANNING.length];
  return (
    <>
      {/* Vue mobile : lecture jour par jour, sans tableau horizontal. */}
      <div className="space-y-4 md:hidden">
        <nav aria-label="Jours de la semaine" className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-y bg-white/95 px-4 py-2 shadow-sm backdrop-blur dark:bg-neutral-950/95">
          {jours.map((d) => {
            const jour = d.iso;
            const nombre = cartes.filter((a) => a.date === jour).length;
            return <a key={jour} href={`#jour-${jour}`} className={`min-w-[72px] rounded-lg border px-3 py-2 text-center ${jour===aujourdhui?"border-[#c9a24a] bg-[#c9a24a]/15":"bg-white dark:bg-neutral-950"}`}><span className="block text-xs font-semibold capitalize">{d.court}</span><span className="text-[10px] text-neutral-500">{nombre} activité{nombre>1?"s":""}</span></a>;
          })}
        </nav>
        {jours.map((d) => {
          const jour=d.iso;
          const cellules=cartes.filter((a)=>a.date===jour);
          const totalJour=cellules.reduce((s,a)=>s+Number(a.heures),0);
          return <section id={`jour-${jour}`} key={jour} className={`scroll-mt-36 overflow-hidden rounded-xl border ${jour===aujourdhui?"border-[#c9a24a] ring-1 ring-[#c9a24a]/30":"border-neutral-200 dark:border-neutral-800"}`}>
            <header className="flex items-center justify-between bg-neutral-50 px-4 py-3 dark:bg-neutral-900"><div><h2 className="font-semibold capitalize">{d.long}</h2>{jour===aujourdhui&&<span className="text-xs font-medium text-[#9a741d]">Aujourd’hui</span>}</div><span className="font-mono text-xs text-neutral-500">{totalJour} h prévues</span></header>
            <div className="space-y-2 p-3">
              {cellules.map((a)=>{const emp=a.employe;const realise=emp?a.valide:0;return <article key={a.id} className={`relative rounded-lg border-l-4 p-3 pr-9 ${couleur(a.couleur)}`}>
                <p className="text-sm font-semibold text-neutral-950">{emp?`${emp.prenom} ${emp.nom}`:"Employé non renseigné"}</p>
                <p className="mt-0.5 text-sm font-medium text-neutral-800">{a.libelle}</p>
                {a.lieu&&<p className="mt-1 text-xs text-neutral-600">Lieu : {a.lieu} · <a href={lienMaps(a.lieu)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">Itinéraire</a></p>}
                {a.tache&&<p className="mt-1 text-xs text-neutral-600">Tâche : {a.tache}</p>}
                <p className="mt-2 font-mono text-xs text-neutral-700">Prévu {a.heures} h{realise>0&&<span className="ml-2 font-semibold text-green-700">· Validé {realise} h</span>}</p>
                <Modifier id={a.id} peutGererPlanning={peutGererPlanning} />
                <form action={supprimerGroupeAffectationsAction} className="absolute right-2 top-2"><input type="hidden" name="retour" value={retour}/><input type="hidden" name="ids" value={a.id}/><ConfirmSubmitButton message="Retirer cette affectation ?" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-neutral-500 shadow-sm hover:text-red-600">×</ConfirmSubmitButton></form>
              </article>})}
              {!cellules.length&&<p className="py-4 text-center text-sm text-neutral-500">Aucune activité planifiée.</p>}
            </div>
          </section>;
        })}
      </div>

      {/* Tableau (ordinateur) : lignes = ouvriers, colonnes = jours */}
      <div className="hidden overflow-x-auto pb-2 md:block">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border border-neutral-200 bg-neutral-100 px-3 py-2 text-left dark:border-neutral-800 dark:bg-neutral-900">Ouvrier</th>
              {jours.map((d) => {
                const est = d.iso === aujourdhui;
                return <th key={d.iso} className={`border border-neutral-200 px-2 py-2 text-center capitalize dark:border-neutral-800 ${est ? "bg-[#c9a24a]/20" : "bg-neutral-100 dark:bg-neutral-900"}`}>{d.court}</th>;
              })}
              <th className="border border-neutral-200 bg-neutral-100 px-2 py-2 text-center dark:border-neutral-800 dark:bg-neutral-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {employes.map((e) => {
              const semaine = cartes.filter((a) => a.employe?.id === e.id);
              const totalEmp = semaine.reduce((s, a) => s + Number(a.heures), 0);
              return (
                <tr key={e.id} className="align-top">
                  <th className="sticky left-0 z-10 whitespace-nowrap border border-neutral-200 bg-white px-3 py-2 text-left font-medium dark:border-neutral-800 dark:bg-neutral-950">{e.prenom} {e.nom}</th>
                  {jours.map((d) => {
                    const cellules = semaine.filter((a) => a.date === d.iso);
                    const est = d.iso === aujourdhui;
                    return (
                      <td key={d.iso} className={`border border-neutral-200 p-1 dark:border-neutral-800 ${est ? "bg-[#c9a24a]/5" : ""}`}>
                        {cellules.map((a) => (
                          <div key={a.id} className={`relative mb-1 rounded border-l-4 px-2 py-1 pr-4 ${couleur(a.couleur)}`}>
                            <div className="font-medium leading-tight text-neutral-900">{a.libelle}</div>
                            {a.lieu && <div className="text-[11px] text-neutral-600">{a.lieu} · <a href={lienMaps(a.lieu)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">Itinéraire</a></div>}
                            {a.tache && <div className="text-[11px] text-neutral-600">{a.tache}</div>}
                            <div className="font-mono text-[11px] text-neutral-700">Prévu {a.heures} h{a.valide>0&&<span className="ml-1 font-semibold text-green-700">· validé {a.valide} h</span>}</div>
                            <Modifier id={a.id} peutGererPlanning={peutGererPlanning} />
                            <form action={supprimerGroupeAffectationsAction} className="absolute right-0.5 top-0.5">
                              <input type="hidden" name="retour" value={retour} />
                              <input type="hidden" name="ids" value={a.id} />
                              <ConfirmSubmitButton message="Retirer cette affectation ?" className="px-1 text-xs leading-none text-neutral-400 hover:text-red-600">×</ConfirmSubmitButton>
                            </form>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                  <td className="border border-neutral-200 px-2 text-center font-mono font-semibold dark:border-neutral-800">{totalEmp} h</td>
                </tr>
              );
            })}
            {!employes.length && (
              <tr><td colSpan={jours.length + 2} className="border border-neutral-200 px-3 py-6 text-center text-neutral-400 dark:border-neutral-800">Aucun employé actif.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
