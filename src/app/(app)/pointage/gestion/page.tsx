import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { creerPointageRegularisationAction,supprimerPointageFormAction,validerPointageFormAction } from "@/app/actions/pointages";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { permissionsUtilisateur } from "@/lib/permissions";
import { PRODUCT_NAME } from "@/lib/brand";

const input="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const un=<T,>(valeur:T|T[]|null):T|null=>Array.isArray(valeur)?valeur[0]??null:valeur;
type Relation={id:string;prenom?:string;nom:string};
type ValidationPointage={id:string;verification_statut:string;anomalie_niveau:string|null;anomalie_motif:string|null;heures_attendues:number|null};
type Session={id:string;employe_id:string;chantier_id:string;arrivee_at:string;depart_at:string|null;pause_minutes:number;latitude_arrivee:number;longitude_arrivee:number;precision_arrivee_metres:number|null;latitude_depart:number|null;longitude_depart:number|null;precision_depart_metres:number|null;tache:string|null;pointage_id:string|null;pointage:ValidationPointage|ValidationPointage[]|null;employe:Relation|Relation[]|null;chantier:Relation|Relation[]|null};
type Pointage={id:string;date:string;heures_normales:number;heures_supplementaires:number;latitude:number|null;longitude:number|null;verification_statut:string;origine_pointage:string;commentaire:string|null;employe:Relation|Relation[]|null;chantier:Relation|Relation[]|null};
type VerificationZone={id:string;session_id:string;employe_id:string;chantier_id:string;latitude:number;longitude:number;precision_metres:number|null;distance_metres:number|null;dans_zone:boolean;created_at:string};
// Formateurs construits une seule fois (ELSATIA_NEXT_MEMORY_CAPACITY_V1) : `new Intl.DateTimeFormat`
// à chaque appel alloue des objets ICU natifs libérés seulement au GC ; appelé par cellule/ligne,
// il faisait monter le serveur à ~3 Go de RSS (mémoire native retenue après GC). Instances immuables,
// sans état : partageables entre requêtes.
const FORMAT_HEURE=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"});
const FORMAT_DATE_HEURE=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
// Une action unique par type + champs cachés, au lieu d'une action liée par pointage :
// voir validerPointageFormAction (ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1).
function ChampsPointage({id,statut,mois}:{id:string;statut?:"valide"|"rejete";mois:string}){return <><input type="hidden" name="pointage_id" value={id}/>{statut&&<input type="hidden" name="statut" value={statut}/>}<input type="hidden" name="mois" value={mois}/></>;}
// Pagination des listes (sessions, anciennes saisies) : un mois d'équipe compte plus d'un millier
// d'éléments, tous rendus avec leurs formulaires à chaque affichage. Toutes restent accessibles.
const PAR_PAGE=100;
const numeroPage=(valeur:string|undefined,total:number)=>Math.min(Math.max(1,Math.floor(Number(valeur))||1),Math.max(1,Math.ceil(total/PAR_PAGE)));
function Pagination({page,total,lien}:{page:number;total:number;lien:(page:number)=>string}){const pages=Math.ceil(total/PAR_PAGE);if(pages<=1)return null;return <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center gap-2 text-sm">{page>1&&<Link href={lien(page-1)} className="rounded border px-3 py-1 hover:bg-neutral-50">← Précédents</Link>}<span className="text-neutral-500">{(page-1)*PAR_PAGE+1}–{Math.min(total,page*PAR_PAGE)} sur {total} · page {page}/{pages}</span>{page<pages&&<Link href={lien(page+1)} className="rounded border px-3 py-1 hover:bg-neutral-50">Suivants →</Link>}</nav>;}
const heure=(date:string)=>FORMAT_HEURE.format(new Date(date));
const dateHeure=(date:string)=>FORMAT_DATE_HEURE.format(new Date(date));

export default async function GestionPointagesPage({searchParams}:{searchParams:Promise<{mois?:string;error?:string;succes?:string;page?:string;anciens?:string}>}){
  const params=await searchParams;
  const mois=/^\d{4}-\d{2}$/.test(params.mois??"")?params.mois!:new Date().toISOString().slice(0,7);
  const debut=`${mois}-01`;
  const finDate=new Date(Number(mois.slice(0,4)),Number(mois.slice(5,7)),0);
  const fin=`${mois}-${String(finDate.getDate()).padStart(2,"0")}`;
  const ctx=await getContexteEntreprise();
  const supabase=await createClient();
  const permissions=await permissionsUtilisateur(ctx);
  const peutGerer=permissions===null||permissions.includes("gerer_pointage");
  const peutValider=permissions===null||permissions.includes("valider_pointages");
  const peutVoirEquipe=permissions===null||permissions.includes("voir_pointages_equipe")||peutGerer||peutValider;
  if(!peutVoirEquipe)redirect("/pointage?error=Accès réservé aux responsables du pointage");

  const debutIso=`${debut}T00:00:00+02:00`;
  const finIso=`${fin}T23:59:59+02:00`;
  // Sessions : les pointage_id de tout le mois (léger, pour isoler les anciennes saisies) et leur
  // nombre exact ; le détail (jointures, GPS) n'est lu que pour la page affichée, ainsi que ses
  // contrôles de zone. Le nombre de contrôles du mois est un simple comptage.
  const[{data:pointagesData},{data:sessionsLies,count:totalSessions},{count:totalVerifications},{data:entreprise}]=await Promise.all([
    supabase.from("pointages").select("id,date,heures_normales,heures_supplementaires,latitude,longitude,verification_statut,origine_pointage,commentaire,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).gte("date",debut).lte("date",fin).order("date",{ascending:false}),
    supabase.from("sessions_pointage").select("pointage_id",{count:"exact"}).eq("entreprise_id",ctx.entrepriseId).gte("arrivee_at",debutIso).lte("arrivee_at",finIso),
    supabase.from("verifications_zone_pointage").select("id",{count:"exact",head:true}).eq("entreprise_id",ctx.entrepriseId).gte("created_at",debutIso).lte("created_at",finIso),
    supabase.from("entreprises").select("suivi_zone_actif,suivi_zone_frequence_minutes").eq("id",ctx.entrepriseId).maybeSingle(),
  ]);
  const page=numeroPage(params.page,totalSessions??0);
  const{data:sessionsData}=await supabase.from("sessions_pointage").select("id,employe_id,chantier_id,arrivee_at,depart_at,pause_minutes,latitude_arrivee,longitude_arrivee,precision_arrivee_metres,latitude_depart,longitude_depart,precision_depart_metres,tache,pointage_id,pointage:pointages(id,verification_statut,anomalie_niveau,anomalie_motif,heures_attendues),employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).gte("arrivee_at",debutIso).lte("arrivee_at",finIso).order("arrivee_at",{ascending:false}).order("id").range((page-1)*PAR_PAGE,page*PAR_PAGE-1);
  const idsSessionsPage=(sessionsData??[]).map(session=>session.id);
  const{data:verificationsData}=idsSessionsPage.length?await supabase.from("verifications_zone_pointage").select("id,session_id,employe_id,chantier_id,latitude,longitude,precision_metres,distance_metres,dans_zone,created_at").eq("entreprise_id",ctx.entrepriseId).in("session_id",idsSessionsPage).gte("created_at",debutIso).lte("created_at",finIso).order("created_at",{ascending:false}):{data:[]};
  // PT-08 : listes du formulaire de régularisation, chargées seulement pour qui peut s'en servir.
  const[{data:employesActifs},{data:chantiersOuverts}]=peutGerer?await Promise.all([
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").order("nom"),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id",ctx.entrepriseId).not("statut","in","(archive,annule)").order("nom"),
  ]):[{data:[]},{data:[]}];
  const aujourdhui=new Date().toISOString().slice(0,10);
  const limite=new Date(`${aujourdhui}T00:00:00Z`);limite.setUTCDate(limite.getUTCDate()-31);
  const limiteRegularisation=limite.toISOString().slice(0,10);
  const pointages=(pointagesData??[])as Pointage[];
  const sessions=(sessionsData??[])as Session[];
  const verifications=(verificationsData??[])as VerificationZone[];
  const lies=new Set((sessionsLies??[]).map(s=>s.pointage_id).filter(Boolean));
  const tousAnciens=pointages.filter(p=>!lies.has(p.id));
  const pageAnciens=numeroPage(params.anciens,tousAnciens.length);
  const anciens=tousAnciens.slice((pageAnciens-1)*PAR_PAGE,pageAnciens*PAR_PAGE);
  const lienPage=(cle:"page"|"anciens",valeur:number)=>{const q=new URLSearchParams({mois});if(cle==="page"?valeur>1:page>1)q.set("page",String(cle==="page"?valeur:page));if(cle==="anciens"?valeur>1:pageAnciens>1)q.set("anciens",String(cle==="anciens"?valeur:pageAnciens));return `/pointage/gestion?${q}`;};
  const parEmploye=new Map<string,{nom:string;heures:number}>();
  for(const p of pointages){const e=un(p.employe);if(e){const ligne=parEmploye.get(e.id)??{nom:`${e.prenom??""} ${e.nom}`.trim(),heures:0};ligne.heures+=Number(p.heures_normales)+Number(p.heures_supplementaires);parEmploye.set(e.id,ligne);}}
  const verificationsParSession=new Map<string,VerificationZone[]>();
  for(const controle of verifications){const liste=verificationsParSession.get(controle.session_id)??[];liste.push(controle);verificationsParSession.set(controle.session_id,liste);}

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/pointage?mois=${mois}`} className="text-sm text-neutral-500 hover:underline">← Retour à mon pointage</Link><h1 className="mt-2 text-xl font-semibold">Gérer et vérifier les pointages</h1><p className="text-sm text-neutral-500">Vue d’équipe réservée aux postes autorisés. Les salariés continuent de pointer uniquement en leur nom.</p></div><form method="get"><label className="text-xs text-neutral-500">Mois <input name="mois" type="month" defaultValue={mois} className={input}/></label><button className="ml-2 rounded-md border px-3 py-1.5 text-sm">Afficher</button></form></div>
    {params.error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}{params.succes&&<p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{params.succes==="regularisation"?"Pointage de régularisation créé au nom du salarié, à valider.":"Modification enregistrée."}</p>}
    {peutGerer&&<details className="rounded-md border"><summary className="cursor-pointer p-4 text-sm font-medium">Saisir un pointage au nom d’un salarié (régularisation)</summary><form action={creerPointageRegularisationAction} className="grid gap-3 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="mois" value={mois}/>
      <label className="text-xs text-neutral-500">Salarié<select name="employe_id" required className={`${input} mt-1 w-full`}><option value="">Choisir…</option>{(employesActifs??[]).map(e=><option key={e.id} value={e.id}>{`${e.prenom??""} ${e.nom}`.trim()}</option>)}</select></label>
      <label className="text-xs text-neutral-500">Chantier<select name="chantier_id" required className={`${input} mt-1 w-full`}><option value="">Choisir…</option>{(chantiersOuverts??[]).map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
      <label className="text-xs text-neutral-500">Date<input name="date" type="date" required min={limiteRegularisation} max={aujourdhui} defaultValue={aujourdhui} className={`${input} mt-1 w-full`}/></label>
      <label className="text-xs text-neutral-500">Pause (minutes)<input name="pause_minutes" type="number" min="0" max="600" defaultValue="60" className={`${input} mt-1 w-full`}/></label>
      <label className="text-xs text-neutral-500">Arrivée<input name="heure_arrivee" type="time" required defaultValue="08:00" className={`${input} mt-1 w-full`}/></label>
      <label className="text-xs text-neutral-500">Départ<input name="heure_depart" type="time" required defaultValue="17:00" className={`${input} mt-1 w-full`}/></label>
      <label className="text-xs text-neutral-500 sm:col-span-2">Motif de la régularisation<input name="motif" required minLength={5} maxLength={500} placeholder="Ex. : téléphone oublié, présence confirmée par le chef d’équipe" className={`${input} mt-1 w-full`}/></label>
      <p className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Le pointage est tracé comme régularisation (auteur et motif conservés), le salarié en est notifié, et il reste à valider comme tout pointage déclaré après coup.</p>
      <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:col-span-2 lg:col-span-4 dark:bg-white dark:text-neutral-900">Créer le pointage de régularisation</button>
    </form></details>}
    <div className="rounded-md border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Contrôles GPS périodiques</h2><p className="text-sm text-neutral-500">{entreprise?.suivi_zone_actif?`Actifs toutes les ${entreprise.suivi_zone_frequence_minutes??30} minutes pendant une session ouverte.`:"Désactivés dans les paramètres de l’entreprise."}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">{totalVerifications??0} contrôle(s) ce mois</span></div><p className="mt-2 text-xs text-neutral-500">Pour respecter la vie privée et les limites des navigateurs, le contrôle fonctionne uniquement pendant le pointage et tant que la page {PRODUCT_NAME} reste ouverte. Il s’arrête au départ ou à la fermeture de l’application.</p></div>
    {parEmploye.size>0&&<div className="rounded-md border p-4"><h2 className="mb-3 text-xs font-semibold uppercase text-neutral-500">Total par employé</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...parEmploye.entries()].map(([id,e])=><div key={id} className="flex justify-between rounded bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-900"><span>{e.nom}</span><span className="font-mono">{e.heures} h</span></div>)}</div></div>}
    <section><h2 className="mb-3 font-semibold">Pointages de l’équipe</h2><div className="space-y-3">{sessions.map(s=>{const e=un(s.employe),c=un(s.chantier),validation=un(s.pointage),controles=verificationsParSession.get(s.id)??[],duree=s.depart_at?Math.max(0,(new Date(s.depart_at).getTime()-new Date(s.arrivee_at).getTime())/3600000-Number(s.pause_minutes)/60):null;return <article key={s.id} className={`rounded-md border p-4 ${validation?.anomalie_niveau==="critique"?"border-red-400 bg-red-50":validation?.anomalie_niveau?"border-amber-400 bg-amber-50":""}`}><div className="flex items-start justify-between gap-3"><div><strong>{e?`${e.prenom??""} ${e.nom}`.trim():"Employé"}</strong><h3 className="mt-1 text-base font-semibold text-[#9a7625]">{c?.nom??"Chantier non renseigné"}</h3><p className="mt-1 text-sm text-neutral-500">{dateHeure(s.arrivee_at)} · arrivée {heure(s.arrivee_at)}{s.depart_at?` · départ ${heure(s.depart_at)}`:" · départ non pointé"}</p>{s.tache&&<p className="mt-1 text-sm">{s.tache}</p>}{validation?.anomalie_motif&&<p className="mt-2 rounded bg-white/70 p-2 text-sm font-medium text-amber-900">⚠ {validation.anomalie_motif}{validation.heures_attendues!==null?` · ${validation.heures_attendues} h attendues`:""}</p>}</div>{duree!==null&&<strong className="rounded bg-neutral-100 px-3 py-1 font-mono dark:bg-neutral-800">{duree.toFixed(2).replace(".",",")} h</strong>}</div><div className="mt-3 flex flex-wrap gap-4 text-xs">{s.latitude_arrivee!==null&&s.longitude_arrivee!==null?<a href={`https://www.openstreetmap.org/?mlat=${s.latitude_arrivee}&mlon=${s.longitude_arrivee}#map=18/${s.latitude_arrivee}/${s.longitude_arrivee}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">GPS arrivée{s.precision_arrivee_metres?` · ± ${Math.round(Number(s.precision_arrivee_metres))} m`:""}</a>:<span className="text-neutral-500">Pas de position à l’arrivée</span>}{s.latitude_depart!==null&&s.longitude_depart!==null&&<a href={`https://www.openstreetmap.org/?mlat=${s.latitude_depart}&mlon=${s.longitude_depart}#map=18/${s.latitude_depart}/${s.longitude_depart}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">GPS départ{s.precision_depart_metres?` · ± ${Math.round(Number(s.precision_depart_metres))} m`:""}</a>}</div>{controles.length>0&&<details className="mt-3 rounded border bg-white/70 dark:bg-neutral-950/70"><summary className="cursor-pointer px-3 py-2 text-sm font-medium">Contrôles de zone toutes les {entreprise?.suivi_zone_frequence_minutes??30} min ({controles.length})</summary><div className="divide-y px-3">{controles.map(v=><div key={v.id} className="flex flex-col justify-between gap-1 py-2 text-xs sm:flex-row sm:items-center"><span>{dateHeure(v.created_at)} · <strong className={v.dans_zone?"text-green-700":"text-red-700"}>{v.dans_zone?"Dans la zone":"Hors zone"}</strong>{v.distance_metres!==null?` · ${Math.round(Number(v.distance_metres))} m du chantier`:""}{v.precision_metres!==null?` · précision ± ${Math.round(Number(v.precision_metres))} m`:""}</span><a href={`https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=18/${v.latitude}/${v.longitude}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">Voir la position</a></div>)}</div></details>}{peutValider&&validation&&validation.verification_statut==="a_verifier"&&<div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2"><form action={validerPointageFormAction}><ChampsPointage id={validation.id} statut="valide" mois={mois}/><button className="w-full rounded bg-green-700 px-3 py-2 text-sm text-white">Valider ce pointage</button></form><form action={validerPointageFormAction} className="flex gap-2"><ChampsPointage id={validation.id} statut="rejete" mois={mois}/><input name="commentaire_verification" required placeholder="Motif du rejet" className="min-w-0 flex-1 rounded border px-2 text-sm"/><button className="rounded bg-red-700 px-3 py-2 text-sm text-white">Rejeter</button></form></div>}</article>;})}{!sessions.length&&<p className="rounded border border-dashed p-6 text-center text-sm text-neutral-500">Aucun pointage d’équipe visible pour ce mois.</p>}</div><Pagination page={page} total={totalSessions??0} lien={(n)=>lienPage("page",n)}/></section>
    {tousAnciens.length>0&&<details className="rounded-md border" open={pageAnciens>1||undefined}><summary className="cursor-pointer p-4 text-sm font-medium">Anciennes saisies d’heures ({tousAnciens.length})</summary><div className="space-y-3 p-4 pt-0">{anciens.map(p=>{const e=un(p.employe),c=un(p.chantier);return <article key={p.id} className="rounded border p-3"><strong>{e?`${e.prenom??""} ${e.nom}`.trim():"—"}</strong><p className="font-medium text-[#9a7625]">{c?.nom??"—"}</p><p className="text-sm text-neutral-500">{p.date} · {Number(p.heures_normales)+Number(p.heures_supplementaires)} h</p>{p.origine_pointage==="regularisation_responsable"&&<p className="mt-1 text-xs"><span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">Régularisation responsable</span>{p.commentaire?` · ${p.commentaire}`:""}</p>}{p.latitude!==null&&p.longitude!==null&&<a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-blue-700">Voir le GPS</a>}<div className={`mt-2 grid gap-2 ${peutValider?"sm:grid-cols-3":"sm:grid-cols-1"}`}>{peutValider&&<><form action={validerPointageFormAction}><ChampsPointage id={p.id} statut="valide" mois={mois}/><button className="text-xs text-green-700">Valider</button></form><form action={validerPointageFormAction}><ChampsPointage id={p.id} statut="rejete" mois={mois}/><input name="commentaire_verification" required placeholder="Motif" className="w-full rounded border px-2 py-1 text-xs"/><button className="text-xs text-red-700">Rejeter</button></form></>}{peutGerer&&<form action={supprimerPointageFormAction}><ChampsPointage id={p.id} mois={mois}/><ConfirmSubmitButton message="Supprimer ce pointage ?" className="text-xs text-neutral-400">Supprimer</ConfirmSubmitButton></form>}</div></article>;})}<Pagination page={pageAnciens} total={tousAnciens.length} lien={(n)=>lienPage("anciens",n)}/></div></details>}
  </div></main>;
}
