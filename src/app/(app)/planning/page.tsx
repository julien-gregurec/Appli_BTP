import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { creerAffectationAction } from "@/app/actions/planning";
import { PlanningAffectationForm } from "@/components/PlanningAffectationForm";
import { Lien as Link } from "@/components/Lien";
import { ChantiersPlanningProvider, type DonneesAffectation } from "@/components/ModifierAffectationDiffere";
import { PlanningSemaineVues, type CartePlanning } from "@/components/PlanningSemaineVues";
import { ACTIVITES_AFFECTATION } from "@/lib/planning";

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
// Formateurs construits une seule fois (ELSATIA_NEXT_MEMORY_CAPACITY_V1) : `new Intl.DateTimeFormat`
// à chaque appel alloue des objets ICU natifs libérés seulement au GC ; appelé par cellule/ligne,
// il faisait monter le serveur à ~3 Go de RSS (mémoire native retenue après GC). Instances immuables,
// sans état : partageables entre requêtes.
const FORMAT_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
const FORMAT_JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const FORMAT_JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const iso = (d: Date) => FORMAT_ISO.format(d);
function lundi(reference?: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(reference ?? "") ? new Date(`${reference}T12:00:00`) : new Date();
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  d.setHours(12, 0, 0, 0);
  return d;
}
const dateFr = (d: Date, large = false) => (large ? FORMAT_JOUR_LONG : FORMAT_JOUR_COURT).format(d);

const activites: Record<string, string> = Object.fromEntries(ACTIVITES_AFFECTATION);
const libelleAffectation = (affectation: A) => un(affectation.chantier)?.nom ?? activites[affectation.type_activite] ?? "Activité interne";

// Formulaire d'edition compact : les deux champs "Chantier" et "Lieu / précision" restent
// toujours visibles (pas de JS pour les basculer selon le type) — le serveur ne retient que
// celui qui correspond au type_activite soumis. Permet de corriger une saisie ou un doublon
// sans passer par supprimer + recréer. Le formulaire lui-même n'est rendu qu'à l'ouverture
// (ModifierAffectationDiffere, dans PlanningSemaineVues) et ses données (affectation, lot,
// chantiers, types d'activité) sont transmises une seule fois par ChantiersPlanningProvider.

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ semaine?: string; error?: string }> }) {
  const p = await searchParams;
  const debut = lundi(p.semaine);
  const dates = Array.from({ length: 7 }, (_, i) => new Date(debut.getTime() + i * 86400000));
  const fin = dates[6];
  const precedent = new Date(debut.getTime() - 7 * 86400000);
  const suivant = new Date(debut.getTime() + 7 * 86400000);
  const ctx = await getContexteEntreprise();
  const sb = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererPlanning = permissions === null || permissions.includes("gerer_planning");
  // PL-05 : sans droit de vue globale, le planning est celui du salarié connecté,
  // pas celui de toute l'entreprise. Mêmes droits que le prédicat RLS
  // peut_consulter_affectation_employe() (migration 20260923000327) pour que
  // l'écran et la base disent exactement la même chose, et même geste que le
  // tableau de bord qui filtrait déjà ses prochaines affectations.
  const peutVoirToutLePlanning = permissions === null
    || permissions.includes("gerer_planning")
    || permissions.includes("voir_pointages_equipe")
    || permissions.includes("voir_heures_chantiers");
  const { data: employeCompte } = peutVoirToutLePlanning
    ? { data: null }
    : await sb.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  const requeteAffectations = sb.from("affectations").select("id,date,heures,tache,type_activite,lieu_activite,chantier:chantiers(id,nom),employe:employes(id,prenom,nom)").eq("entreprise_id", ctx.entrepriseId).gte("date", iso(debut)).lte("date", iso(fin)).order("date");

  const [{ data: chantiers }, { data: employes }, { data: affectationsData }, {data:pointagesData}] = await Promise.all([
    sb.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(archive,annule)").order("nom"),
    sb.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").order("nom"),
    peutVoirToutLePlanning ? requeteAffectations : requeteAffectations.eq("employe_id", employeCompte?.id ?? "00000000-0000-0000-0000-000000000000"),
    sb.from("pointages").select("date,heures_normales,heures_supplementaires,verification_statut,employe_id,chantier_id").eq("entreprise_id",ctx.entrepriseId).gte("date",iso(debut)).lte("date",iso(fin)).eq("verification_statut","valide"),
  ]);

  const affectations = (affectationsData ?? []) as A[];
  const pointages=(pointagesData??[]) as P[];
  // Heures validées indexées une fois (salarié|jour et salarié|jour|chantier) : même résultat que
  // le filtre de tous les pointages de la semaine à chaque carte, sans le coût quadratique.
  const heuresValidees=new Map<string,number>();
  for(const p of pointages){
    const h=Number(p.heures_normales)+Number(p.heures_supplementaires);
    for(const cle of [`${p.employe_id}|${p.date}`,`${p.employe_id}|${p.date}|${p.chantier_id}`])heuresValidees.set(cle,(heuresValidees.get(cle)??0)+h);
  }
  const heuresRealisees=(employeId:string,date:string,chantierId?:string|null)=>heuresValidees.get(chantierId?`${employeId}|${date}|${chantierId}`:`${employeId}|${date}`)??0;
  // Couleur stable par chantier.
  const chantiersIds = [...new Set(affectations.map((a) => un(a.chantier)?.id).filter(Boolean) as string[])];
  // Autres affectations identiques (meme jour, heures, activite, chantier/lieu, tache) pour
  // un employe different — signe qu'elles viennent de la meme saisie groupee (planning manuel
  // multi-ouvriers, ou l'assistant IA), rien d'autre ne les relie en base. Proposees en cases
  // a cocher individuelles : chacune reste un choix explicite, jamais une propagation globale.
  // Clé de lot : mêmes critères d'égalité qu'avant, calculée une fois par affectation ; chaque lot
  // est transmis une seule fois au formulaire (plus de copie quadratique par affectation et par vue).
  const cleLot = (a: A) => JSON.stringify([a.date, Number(a.heures), a.type_activite, un(a.chantier)?.id ?? null, a.lieu_activite, a.tache]);
  const lots: Record<string, { id: string; libelle: string }[]> = {};
  const donneesEdition: Record<string, DonneesAffectation> = {};
  for (const a of affectations) {
    const lot = cleLot(a);
    const emp = un(a.employe);
    (lots[lot] ??= []).push({ id: a.id, libelle: emp ? `${emp.prenom} ${emp.nom}` : "Employé" });
    donneesEdition[a.id] = { typeActivite: a.type_activite, chantierId: un(a.chantier)?.id ?? null, lieuActivite: a.lieu_activite, date: a.date, heures: a.heures, tache: a.tache, lot };
  }
  // Un lot d'une seule affectation n'apporte aucune case à cocher : inutile de le transmettre.
  for (const [cle, membres] of Object.entries(lots)) if (membres.length < 2) delete lots[cle];
  const total = affectations.reduce((s, a) => s + Number(a.heures), 0);
  const totalOuvriers = new Set(affectations.map((a) => un(a.employe)?.id).filter(Boolean)).size;
  const aujourdhui = iso(new Date());

  // Message de partage (une ligne par affectation, groupé par jour).
  const lignesPartage = dates.flatMap((d) =>
    affectations
      .filter((a) => a.date === iso(d) && un(a.employe))
      .map((a) => `${dateFr(d)} · ${un(a.employe)!.prenom} ${un(a.employe)!.nom} → ${libelleAffectation(a)}${a.lieu_activite ? ` · ${a.lieu_activite}` : ""}${a.tache ? ` (${a.tache})` : ""} · ${a.heures} h`),
  );
  // Affectations de la semaine, une fois, au format des deux vues (mobile et bureau).
  const cartes: CartePlanning[] = affectations.map((a) => {
    const ch = un(a.chantier);
    const emp = un(a.employe);
    return {
      id: a.id, date: a.date, heures: a.heures, tache: a.tache, lieu: a.lieu_activite, libelle: libelleAffectation(a),
      couleur: Math.max(0, chantiersIds.indexOf(ch?.id ?? a.type_activite)),
      employe: emp ? { id: emp.id, prenom: emp.prenom, nom: emp.nom } : null,
      valide: emp ? heuresRealisees(emp.id, a.date, ch?.id) : 0,
    };
  });
  const message = `Planning ${ctx.entrepriseNom} — semaine du ${dateFr(debut, true)} au ${dateFr(fin, true)}\n\n${lignesPartage.length ? lignesPartage.join("\n") : "Aucune affectation planifiée."}`;

  return (
    <ChantiersPlanningProvider chantiers={chantiers ?? []} retour={iso(debut)} affectations={peutGererPlanning ? donneesEdition : {}} lots={peutGererPlanning ? lots : {}}>
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Planning des équipes</h1>
            <p className="text-sm text-neutral-500">Tableau par ouvrier et par jour : chantiers, bureau, dépôt, visites médicales, formations et absences.</p>
          </div>
          <div className="flex gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(`Planning ${ctx.entrepriseNom} — semaine du ${dateFr(debut)}`)}&body=${encodeURIComponent(message)}`} className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Partager par email</a>
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

        <PlanningSemaineVues
          jours={dates.map((d) => ({ iso: iso(d), court: dateFr(d), long: dateFr(d, true) }))}
          aujourdhui={aujourdhui}
          retour={iso(debut)}
          employes={employes ?? []}
          cartes={cartes}
          peutGererPlanning={peutGererPlanning}
        />
      </div>
    </main>
    </ChantiersPlanningProvider>
  );
}
