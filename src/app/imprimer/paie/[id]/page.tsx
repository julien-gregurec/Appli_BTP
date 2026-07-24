import { notFound } from "next/navigation";
import { AutoPrint } from "@/components/AutoPrint";
import { euros } from "@/lib/devis";
import { getContexteEntreprise } from "@/lib/entreprise";
import { formaterMois, statutPeriodePaie } from "@/lib/paie";
import { permissionsUtilisateur } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

type Employe = { prenom:string|null; nom:string|null; reference_interne:string|null; poste:string|null };
const un=<T,>(valeur:T|T[]|null):T|null=>Array.isArray(valeur)?valeur[0]??null:valeur;

export default async function ImprimerPaiePage({params}:{params:Promise<{id:string}>}){
  const [{id},ctx]=await Promise.all([params,getContexteEntreprise()]);
  const supabase=await createClient();
  const permissions=await permissionsUtilisateur(ctx);
  if(permissions!==null&&!permissions.includes("exporter_paie")) notFound();
  const [{data:periode},{data:dossiers},{data:entreprise}]=await Promise.all([
    supabase.from("periodes_paie").select("id,mois,date_debut,date_fin,date_limite_saisie,statut,date_validation,date_export").eq("id",id).eq("entreprise_id",ctx.entrepriseId).maybeSingle(),
    supabase.from("dossiers_paie_salaries").select("id,statut,heures_normales,heures_sup_25,heures_sup_50,heures_absence,jours_conges,total_paniers,total_trajets,total_transports,total_grands_deplacements,total_kilometres,total_primes,total_acomptes,total_notes_frais,commentaire_comptable,employe:employes(prenom,nom,reference_interne,poste)").eq("periode_id",id).eq("entreprise_id",ctx.entrepriseId),
    supabase.from("entreprises").select("nom,siret,adresse,code_postal,ville").eq("id",ctx.entrepriseId).maybeSingle(),
  ]);
  if(!periode)notFound();
  const lignes=(dossiers??[]).map(d=>({...d,employe:un(d.employe as Employe|Employe[]|null)})).sort((a,b)=>`${a.employe?.nom??""} ${a.employe?.prenom??""}`.localeCompare(`${b.employe?.nom??""} ${b.employe?.prenom??""}`,"fr"));
  return <><AutoPrint/><main className="mx-auto max-w-[1120px] bg-white p-8 text-[11px] text-black print:max-w-none print:p-0"><header className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4"><div><h1 className="text-2xl font-bold">Variables de paie · <span className="capitalize">{formaterMois(periode.mois)}</span></h1><p>{periode.date_debut} au {periode.date_fin} · {statutPeriodePaie(periode.statut)}</p></div><div className="text-right"><strong className="text-base">{entreprise?.nom??ctx.entrepriseNom}</strong><p>{entreprise?.siret?`SIRET ${entreprise.siret}`:""}</p><p>{[entreprise?.adresse,entreprise?.code_postal,entreprise?.ville].filter(Boolean).join(" · ")}</p></div></header><div className="mb-4 overflow-hidden rounded border"><table className="w-full border-collapse"><thead className="bg-slate-100 text-left"><tr><th className="p-2">Salarié</th><th className="p-2">Normales</th><th className="p-2">HS 25 / 50</th><th className="p-2">Absence / congés</th><th className="p-2">Déplacements</th><th className="p-2">Primes</th><th className="p-2">Acomptes</th><th className="p-2">Frais</th><th className="p-2">Statut</th></tr></thead><tbody>{lignes.map(d=><tr key={d.id} className="border-t align-top"><td className="p-2"><strong>{d.employe?.prenom} {d.employe?.nom}</strong><br/><span>{d.employe?.reference_interne??""} · {d.employe?.poste??""}</span></td><td className="p-2">{Number(d.heures_normales).toFixed(2)} h</td><td className="p-2">{Number(d.heures_sup_25).toFixed(2)} / {Number(d.heures_sup_50).toFixed(2)} h</td><td className="p-2">{Number(d.heures_absence).toFixed(2)} h / {Number(d.jours_conges).toFixed(2)} j</td><td className="p-2">{euros(Number(d.total_paniers)+Number(d.total_trajets)+Number(d.total_transports)+Number(d.total_grands_deplacements))}<br/>{Number(d.total_kilometres).toFixed(2)} km</td><td className="p-2">{euros(d.total_primes)}</td><td className="p-2">{euros(d.total_acomptes)}</td><td className="p-2">{euros(d.total_notes_frais)}</td><td className="p-2">{d.statut}</td></tr>)}</tbody></table></div><aside className="rounded border border-amber-400 bg-amber-50 p-3"><strong>Document préparatoire.</strong> Ce relevé consolide les variables transmises au gestionnaire de paie. Il ne constitue ni un bulletin de paie, ni une déclaration sociale, ni un calcul officiel de cotisations. Les données doivent être contrôlées par le cabinet comptable ou le gestionnaire de paie.</aside><footer className="mt-6 flex justify-between border-t pt-3 text-[9px] text-slate-500"><span>Généré par Liria Gestion Pro</span><span>{new Date().toLocaleString("fr-FR",{timeZone:"Europe/Paris"})}</span></footer></main></>;
}
