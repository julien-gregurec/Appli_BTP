import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { creerAffectationAction, supprimerGroupeAffectationsAction } from "@/app/actions/planning";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { PlanningAffectationForm } from "@/components/PlanningAffectationForm";

type A = {
  id: string;
  date: string;
  heures: number;
  tache: string | null;
  type_activite: string;
  lieu_activite: string | null;
  chantier: { id: string; nom: string } | { id: string; nom: string }[] | null;
  employe: { id: string; prenom: string; nom: string } | { id: string; prenom: string; nom: string }[] | null;
};
type P={date:string;heures_normales:number;heures_supplementaires:number;verification_statut:string;employe_id:string;chantier_id:string|null};
const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
function lundi(reference?: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(reference ?? "") ? new Date(`${reference}T12:00:00`) : new Date();
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  d.setHours(12, 0, 0, 0);
  return d;
}
const dateFr = (d: Date, large = false) =>
  new Intl.DateTimeFormat("fr-FR", large ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric" }).format(d);

const couleurs = [
  "border-l-blue-500 bg-blue-50",
  "border-l-amber-500 bg-amber-50",
  "border-l-emerald-500 bg-emerald-50",
  "border-l-violet-500 bg-violet-50",
  "border-l-rose-500 bg-rose-50",
  "border-l-cyan-500 bg-cyan-50",
];
const activites: Record<string, string> = { chantier: "Chantier", bureau: "Bureau", depot: "Dépôt", visite_medicale: "Visite médicale", formation: "Formation", conge: "Congé / absence", autre: "Autre activité" };
const libelleAffectation = (affectation: A) => un(affectation.chantier)?.nom ?? activites[affectation.type_activite] ?? "Activité interne";

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ semaine?: string; error?: string }> }) {
  const p = await searchParams;
  const debut = lundi(p.semaine);
  const dates = Array.from({ length: 7 }, (_, i) => new Date(debut.getTime() + i * 86400000));
  const fin = dates[6];
  const precedent = new Date(debut.getTime() - 7 * 86400000);
  const suivant = new Date(debut.getTime() + 7 * 86400000);
  const ctx = await getContexteEntreprise();
  const sb = await createClient();

  const [{ data: chantiers }, { data: employes }, { data: affectationsData }, {data:pointagesData}] = await Promise.all([
    sb.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(archive,annule)").order("nom"),
    sb.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").order("nom"),
    sb.from("affectations").select("id,date,heures,tache,type_activite,lieu_activite,chantier:chantiers(id,nom),employe:employes(id,prenom,nom)").eq("entreprise_id", ctx.entrepriseId).gte("date", iso(debut)).lte("date", iso(fin)).order("date"),
    sb.from("pointages").select("date,heures_normales,heures_supplementaires,verification_statut,employe_id,chantier_id").eq("entreprise_id",ctx.entrepriseId).gte("date",iso(debut)).lte("date",iso(fin)).eq("verification_statut","valide"),
  ]);

  const affectations = (affectationsData ?? []) as A[];
  const pointages=(pointagesData??[]) as P[];
  const heuresRealisees=(employeId:string,date:string,chantierId?:string|null)=>pointages.filter(p=>p.employe_id===employeId&&p.date===date&&(!chantierId||p.chantier_id===chantierId)).reduce((s,p)=>s+Number(p.heures_normales)+Number(p.heures_supplementaires),0);
  // Couleur stable par chantier.
  const chantiersIds = [...new Set(affectations.map((a) => un(a.chantier)?.id).filter(Boolean) as string[])];
  const couleur = (id: string) => couleurs[Math.max(0, chantiersIds.indexOf(id)) % couleurs.length];
  const total = affectations.reduce((s, a) => s + Number(a.heures), 0);
  const totalOuvriers = new Set(affectations.map((a) => un(a.employe)?.id).filter(Boolean)).size;
  const aujourdhui = iso(new Date());

  // Message de partage (une ligne par affectation, groupé par jour).
  const lignesPartage = dates.flatMap((d) =>
    affectations
      .filter((a) => a.date === iso(d) && un(a.employe))
      .map((a) => `${dateFr(d)} · ${un(a.employe)!.prenom} ${un(a.employe)!.nom} → ${libelleAffectation(a)}${a.lieu_activite ? ` · ${a.lieu_activite}` : ""}${a.tache ? ` (${a.tache})` : ""} · ${a.heures} h`),
  );
  const message = `Planning LIRIA CONCEPT — semaine du ${dateFr(debut, true)} au ${dateFr(fin, true)}\n\n${lignesPartage.length ? lignesPartage.join("\n") : "Aucune affectation planifiée."}`;

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Planning des équipes</h1>
            <p className="text-sm text-neutral-500">Tableau par ouvrier et par jour : chantiers, bureau, dépôt, visites médicales, formations et absences.</p>
          </div>
          <div className="flex gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(`Planning LIRIA — semaine du ${dateFr(debut)}`)}&body=${encodeURIComponent(message)}`} className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Partager par email</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Partager par WhatsApp</a>
          </div>
        </div>
        {p.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{p.error}</p>}

        <div className="flex items-center justify-between rounded-md border p-3 dark:border-neutral-800">
          <Link href={`/planning?semaine=${iso(precedent)}`} className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100">← Semaine précédente</Link>
          <div className="text-center">
            <p className="font-semibold capitalize">{dateFr(debut, true)} — {dateFr(fin, true)}</p>
            <p className="text-xs text-neutral-500">{total} heures planifiées · {totalOuvriers} ouvrier(s)</p>
          </div>
          <div className="flex gap-2">
            <Link href="/planning" className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100">Aujourd’hui</Link>
            <Link href={`/planning?semaine=${iso(suivant)}`} className="rounded px-3 py-1.5 text-sm hover:bg-neutral-100">Semaine suivante →</Link>
          </div>
        </div>

        {employes?.length ? (
          <PlanningAffectationForm action={creerAffectationAction} retour={iso(debut)} debut={iso(debut)} fin={iso(fin)} chantiers={chantiers ?? []} employes={employes} />
        ) : (
          <p className="rounded border border-dashed p-5 text-sm text-neutral-500">Ajoutez au moins un employé actif.</p>
        )}

        {/* Vue mobile : lecture jour par jour, sans tableau horizontal. */}
        <div className="space-y-4 md:hidden">
          <nav aria-label="Jours de la semaine" className="sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto border-y bg-white/95 px-4 py-2 shadow-sm backdrop-blur dark:bg-neutral-950/95">
            {dates.map((d) => {
              const jour = iso(d);
              const nombre = affectations.filter((a) => a.date === jour).length;
              return <a key={jour} href={`#jour-${jour}`} className={`min-w-[72px] rounded-lg border px-3 py-2 text-center ${jour===aujourdhui?"border-[#c9a24a] bg-[#c9a24a]/15":"bg-white dark:bg-neutral-950"}`}><span className="block text-xs font-semibold capitalize">{dateFr(d)}</span><span className="text-[10px] text-neutral-500">{nombre} activité{nombre>1?"s":""}</span></a>;
            })}
          </nav>
          {dates.map((d) => {
            const jour=iso(d);
            const cellules=affectations.filter((a)=>a.date===jour);
            const totalJour=cellules.reduce((s,a)=>s+Number(a.heures),0);
            return <section id={`jour-${jour}`} key={jour} className={`scroll-mt-36 overflow-hidden rounded-xl border ${jour===aujourdhui?"border-[#c9a24a] ring-1 ring-[#c9a24a]/30":"border-neutral-200 dark:border-neutral-800"}`}>
              <header className="flex items-center justify-between bg-neutral-50 px-4 py-3 dark:bg-neutral-900"><div><h2 className="font-semibold capitalize">{dateFr(d,true)}</h2>{jour===aujourdhui&&<span className="text-xs font-medium text-[#9a741d]">Aujourd’hui</span>}</div><span className="font-mono text-xs text-neutral-500">{totalJour} h prévues</span></header>
              <div className="space-y-2 p-3">
                {cellules.map((a)=>{const ch=un(a.chantier);const emp=un(a.employe);const realise=emp?heuresRealisees(emp.id,a.date,ch?.id):0;return <article key={a.id} className={`relative rounded-lg border-l-4 p-3 pr-9 ${couleur(ch?.id??a.type_activite)}`}>
                  <p className="text-sm font-semibold text-neutral-950">{emp?`${emp.prenom} ${emp.nom}`:"Employé non renseigné"}</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-800">{libelleAffectation(a)}</p>
                  {a.lieu_activite&&<p className="mt-1 text-xs text-neutral-600">Lieu : {a.lieu_activite}</p>}
                  {a.tache&&<p className="mt-1 text-xs text-neutral-600">Tâche : {a.tache}</p>}
                  <p className="mt-2 font-mono text-xs text-neutral-700">Prévu {a.heures} h{realise>0&&<span className="ml-2 font-semibold text-green-700">· Validé {realise} h</span>}</p>
                  <form action={supprimerGroupeAffectationsAction} className="absolute right-2 top-2"><input type="hidden" name="retour" value={iso(debut)}/><input type="hidden" name="ids" value={a.id}/><ConfirmSubmitButton message="Retirer cette affectation ?" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-neutral-500 shadow-sm hover:text-red-600">×</ConfirmSubmitButton></form>
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
                {dates.map((d) => {
                  const est = iso(d) === aujourdhui;
                  return <th key={iso(d)} className={`border border-neutral-200 px-2 py-2 text-center capitalize dark:border-neutral-800 ${est ? "bg-[#c9a24a]/20" : "bg-neutral-100 dark:bg-neutral-900"}`}>{dateFr(d)}</th>;
                })}
                <th className="border border-neutral-200 bg-neutral-100 px-2 py-2 text-center dark:border-neutral-800 dark:bg-neutral-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {(employes ?? []).map((e) => {
                const semaine = affectations.filter((a) => un(a.employe)?.id === e.id);
                const totalEmp = semaine.reduce((s, a) => s + Number(a.heures), 0);
                return (
                  <tr key={e.id} className="align-top">
                    <th className="sticky left-0 z-10 whitespace-nowrap border border-neutral-200 bg-white px-3 py-2 text-left font-medium dark:border-neutral-800 dark:bg-neutral-950">{e.prenom} {e.nom}</th>
                    {dates.map((d) => {
                      const cellules = semaine.filter((a) => a.date === iso(d));
                      const est = iso(d) === aujourdhui;
                      return (
                        <td key={iso(d)} className={`border border-neutral-200 p-1 dark:border-neutral-800 ${est ? "bg-[#c9a24a]/5" : ""}`}>
                          {cellules.map((a) => {
                            const ch = un(a.chantier);
                            const identifiantCouleur = ch?.id ?? a.type_activite;
                            return (
                              <div key={a.id} className={`relative mb-1 rounded border-l-4 px-2 py-1 pr-4 ${couleur(identifiantCouleur)}`}>
                                <div className="font-medium leading-tight text-neutral-900">{libelleAffectation(a)}</div>
                                {a.lieu_activite && <div className="text-[11px] text-neutral-600">{a.lieu_activite}</div>}
                                {a.tache && <div className="text-[11px] text-neutral-600">{a.tache}</div>}
                                <div className="font-mono text-[11px] text-neutral-700">Prévu {a.heures} h{heuresRealisees(e.id,a.date,ch?.id)>0&&<span className="ml-1 font-semibold text-green-700">· validé {heuresRealisees(e.id,a.date,ch?.id)} h</span>}</div>
                                <form action={supprimerGroupeAffectationsAction} className="absolute right-0.5 top-0.5">
                                  <input type="hidden" name="retour" value={iso(debut)} />
                                  <input type="hidden" name="ids" value={a.id} />
                                  <ConfirmSubmitButton message="Retirer cette affectation ?" className="px-1 text-xs leading-none text-neutral-400 hover:text-red-600">×</ConfirmSubmitButton>
                                </form>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                    <td className="border border-neutral-200 px-2 text-center font-mono font-semibold dark:border-neutral-800">{totalEmp} h</td>
                  </tr>
                );
              })}
              {!employes?.length && (
                <tr><td colSpan={dates.length + 2} className="border border-neutral-200 px-3 py-6 text-center text-neutral-400 dark:border-neutral-800">Aucun employé actif.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
