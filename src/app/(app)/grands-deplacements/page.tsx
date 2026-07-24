import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { euros } from "@/lib/devis";
import { creerGrandDeplacementAction, transitionGrandDeplacementAction } from "@/app/actions/grands-deplacements";

const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function GrandsDeplacementsPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_notes_frais");
  const [{ data: entreprise }, { data: employe }, { data: chantiers }, { data: missions }] = await Promise.all([
    supabase.from("entreprises").select("mode_grand_deplacement,bareme_grand_deplacement_annee").eq("id", ctx.entrepriseId).single(),
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).eq("statut", "actif").maybeSingle(),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(archive,annule)").order("nom"),
    supabase.from("grands_deplacements").select("id,date_debut,date_fin,destination,mode_calcul,zone_logement,nombre_repas,nombre_nuits,montant_calcule,budget_manuel,statut,distance_aller_km,transport_public_aller_minutes,eligibilite_standard,justification_eligibilite,employe:employes(prenom,nom),chantier:chantiers(nom),notes_frais(montant_ttc,statut)").eq("entreprise_id", ctx.entrepriseId).order("date_debut", { ascending: false }).limit(200),
  ]);
  const modeForfait = entreprise?.mode_grand_deplacement === "forfait_urssaf";
  const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Grands déplacements</h1><p className="text-sm text-neutral-500">Missions hors secteur, budget et indemnisation reliés aux chantiers et aux notes de frais.</p></div>
    {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {succes && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">Déplacement enregistré.</p>}
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Nouvelle mission</h2><p className="text-xs text-neutral-500">Mode choisi par l’entreprise : <strong>{modeForfait ? `barème automatique ${entreprise?.bareme_grand_deplacement_annee ?? 2026}` : "frais réels et budget manuel"}</strong>.</p></div><a href="/parametres#grands-deplacements" className="rounded-md border px-3 py-2 text-sm">Modifier le mode</a></div>
      {!employe && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Votre compte doit être relié à une fiche employé active.</p>}
      <form action={creerGrandDeplacementAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-neutral-500">Destination<input name="destination" required placeholder="Ville ou site" className={input}/></label>
        <label className="text-xs text-neutral-500">Chantier<select name="chantier_id" className={input}><option value="">Sans chantier</option>{(chantiers??[]).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
        <label className="text-xs text-neutral-500">Début initial de la mission<input name="date_origine_mission" required type="date" className={input}/></label>
        <label className="text-xs text-neutral-500">Début de la période<input name="date_debut" required type="date" className={input}/></label>
        <label className="text-xs text-neutral-500">Fin de la période<input name="date_fin" required type="date" className={input}/></label>
        <label className="text-xs text-neutral-500">Distance aller domicile–mission (km)<input name="distance_aller_km" required type="number" min="0" step="0.1" className={input}/></label>
        <label className="text-xs text-neutral-500">Trajet aller en transport public (minutes)<input name="transport_public_aller_minutes" required type="number" min="0" step="1" className={input}/></label>
        {modeForfait ? <><label className="text-xs text-neutral-500">Zone d’hébergement<select name="zone_logement" className={input}><option value="province">Hors Paris et petite couronne</option><option value="paris">Paris, 92, 93 ou 94</option></select></label><label className="text-xs text-neutral-500">Nombre de repas<input name="nombre_repas" type="number" min="0" step="0.5" defaultValue="0" className={input}/></label><label className="text-xs text-neutral-500">Nombre de nuits<input name="nombre_nuits" type="number" min="0" step="1" defaultValue="0" className={input}/></label></> : <label className="text-xs text-neutral-500">Budget manuel prévu (€)<input name="budget_manuel" type="number" min="0" step="0.01" required className={input}/></label>}
        <label className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Justification si les seuils 50 km et 1 h 30 ne sont pas tous les deux atteints<textarea name="justification_eligibilite" rows={2} placeholder="Circonstances de fait empêchant le retour quotidien" className={input}/></label>
        <label className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Commentaire<textarea name="commentaire" rows={2} className={input}/></label>
        <label className="flex items-start gap-2 text-xs text-neutral-600 sm:col-span-2 lg:col-span-4"><input name="conditions_confirmees" type="checkbox" required className="mt-0.5"/><span>Je confirme que le salarié est empêché de regagner chaque jour son domicile selon les critères renseignés ou les circonstances justifiées.</span></label>
        <button disabled={!employe} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 lg:col-span-4">Créer le déplacement</button>
      </form>
      <p className="mt-3 text-xs text-neutral-500">Le barème est une aide de calcul paramétrable. Le seuil usuel combine au moins 50 km à l’aller et un trajet en transport public qui ne peut pas être parcouru en moins de 1 h 30. Des circonstances de fait peuvent aussi être documentées. Les justificatifs restent à contrôler par l’entreprise et son conseil comptable.</p>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Missions enregistrées</h2><div className="grid gap-3">{(missions??[]).map(m=>{const emp=un(m.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null);const chantier=un(m.chantier as {nom:string}|{nom:string}[]|null);const frais=(m.notes_frais??[]).filter(n=>["valide","exporte_comptabilite","verrouille","archive"].includes(n.statut)).reduce((s,n)=>s+Number(n.montant_ttc),0);return <article key={m.id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{m.destination}</strong><p className="text-sm text-neutral-500">{m.date_debut} → {m.date_fin} · {emp?`${emp.prenom} ${emp.nom}`:"Employé"} · {chantier?.nom??"Sans chantier"}</p><p className="text-xs text-neutral-500">{m.distance_aller_km} km · {m.transport_public_aller_minutes} min en transport · {m.eligibilite_standard?"critères usuels atteints":`circonstances justifiées : ${m.justification_eligibilite??"à contrôler"}`}</p></div><div className="text-right"><strong className="font-mono">{euros(m.mode_calcul==="frais_reels"?frais:m.montant_calcule)}</strong><p className="text-xs text-neutral-500">{m.mode_calcul==="frais_reels"?`${euros(frais)} de frais validés / budget ${euros(m.budget_manuel??0)}`:`${m.nombre_repas} repas · ${m.nombre_nuits} nuit(s)`}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{m.statut}</span>{m.statut==="brouillon"&&<form action={transitionGrandDeplacementAction.bind(null,m.id,"soumis")}><button className="rounded border px-3 py-1 text-xs">Soumettre</button></form>}{peutGerer&&m.statut==="soumis"&&<><form action={transitionGrandDeplacementAction.bind(null,m.id,"valide")}><button className="rounded bg-green-700 px-3 py-1 text-xs text-white">Valider</button></form><form action={transitionGrandDeplacementAction.bind(null,m.id,"refuse")}><button className="rounded border border-red-300 px-3 py-1 text-xs text-red-700">Refuser</button></form></>}</div></article>})}{!missions?.length&&<p className="rounded-lg border p-8 text-center text-sm text-neutral-500">Aucun grand déplacement.</p>}</div></section>
  </div></main>;
}
