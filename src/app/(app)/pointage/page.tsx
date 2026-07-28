import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { PointageArriveeDepart } from "@/components/PointageArriveeDepart";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ForgottenPointageForm } from "@/components/ForgottenPointageForm";
import { creerMaFichePointageAdministrateurAction } from "@/app/actions/pointages";
import { SuiviZoneChantier } from "@/components/SuiviZoneChantier";

const input="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const AUCUN_ID="00000000-0000-0000-0000-000000000000";
const un=<T,>(valeur:T|T[]|null):T|null=>Array.isArray(valeur)?valeur[0]??null:valeur;
type Relation={id:string;prenom?:string;nom:string};
type Pointage={id:string;date:string;heures_normales:number;heures_supplementaires:number;tache:string|null;commentaire:string|null;latitude:number|null;longitude:number|null;precision_metres:number|null;verification_statut:string;commentaire_verification:string|null;employe:Relation|Relation[]|null;chantier:Relation|Relation[]|null};
type ValidationPointage={id:string;verification_statut:string;anomalie_niveau:string|null;anomalie_motif:string|null;heures_attendues:number|null};
type Session={id:string;arrivee_at:string;depart_at:string|null;pause_minutes:number;latitude_arrivee:number;longitude_arrivee:number;precision_arrivee_metres:number|null;latitude_depart:number|null;longitude_depart:number|null;precision_depart_metres:number|null;tache:string|null;pointage_id:string|null;pointage:ValidationPointage|ValidationPointage[]|null;employe:Relation|Relation[]|null;chantier:Relation|Relation[]|null};
const heure=(date:string)=>new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"}).format(new Date(date));
const dateHeure=(date:string)=>new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(date));

export default async function PointagePage({searchParams}:{searchParams:Promise<{mois?:string;error?:string;succes?:string}>}){
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
  const peutPointer=peutGerer||permissions?.includes("saisir_son_pointage")===true;

  let requeteEmployes=supabase.from("employes").select("id,prenom,nom").eq("entreprise_id",ctx.entrepriseId).eq("statut","actif").order("nom");
  // En authentification réelle, même un responsable pointe uniquement avec sa propre fiche.
  if(permissions!==null)requeteEmployes=requeteEmployes.eq("utilisateur_id",ctx.userId);
  const[{data:employes},{data:chantiersDisponibles},{data:entrepriseSuiviZone}]=await Promise.all([
    requeteEmployes,
    supabase.rpc("chantiers_pointage_disponibles",{p_entreprise_id:ctx.entrepriseId}),
    supabase.from("entreprises").select("suivi_zone_actif,suivi_zone_frequence_minutes").eq("id",ctx.entrepriseId).maybeSingle(),
  ]);
  const monEmploye=employes?.[0]??null;
  const monEmployeId=monEmploye?.id??AUCUN_ID;
  const[{data:pointagesData},{data:sessionsData}]=await Promise.all([
    supabase.from("pointages").select("id,date,heures_normales,heures_supplementaires,tache,commentaire,latitude,longitude,precision_metres,verification_statut,commentaire_verification,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).eq("employe_id",monEmployeId).gte("date",debut).lte("date",fin).order("date",{ascending:false}),
    supabase.from("sessions_pointage").select("id,arrivee_at,depart_at,pause_minutes,latitude_arrivee,longitude_arrivee,precision_arrivee_metres,latitude_depart,longitude_depart,precision_depart_metres,tache,pointage_id,pointage:pointages(id,verification_statut,anomalie_niveau,anomalie_motif,heures_attendues),employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).eq("employe_id",monEmployeId).gte("arrivee_at",`${debut}T00:00:00+02:00`).lte("arrivee_at",`${fin}T23:59:59+02:00`).order("arrivee_at",{ascending:false}),
  ]);

  const chantiersOrdonnes=((chantiersDisponibles??[])as{id:string;nom:string;priorite:number}[]).sort((a,b)=>a.priorite-b.priorite||a.nom.localeCompare(b.nom,"fr"));
  const pointages=(pointagesData??[])as Pointage[];
  const sessions=(sessionsData??[])as Session[];
  const ouvertes=sessions.filter(s=>!s.depart_at);
  const lies=new Set(sessions.map(s=>s.pointage_id).filter(Boolean));
  const anciens=pointages.filter(p=>!lies.has(p.id));
  const totalNormal=pointages.reduce((s,p)=>s+Number(p.heures_normales),0);
  const totalSup=pointages.reduce((s,p)=>s+Number(p.heures_supplementaires),0);
  const maSessionOuverte=ouvertes[0];

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-xl font-semibold">Mon pointage</h1><p className="text-sm text-neutral-500">Je pointe uniquement mon arrivée et mon départ, avec la date, l’heure serveur et ma position GPS.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {peutVoirEquipe&&<Link href={`/pointage/gestion?mois=${mois}`} className="rounded-md bg-[#0b1c2c] px-4 py-2 text-sm font-semibold text-white">Gérer et vérifier</Link>}
        <form method="get"><label className="text-xs text-neutral-500">Mois <input name="mois" type="month" defaultValue={mois} className={input}/></label><button className="ml-2 rounded-md border px-3 py-1.5 text-sm">Afficher</button></form>
      </div>
    </div>
    {params.error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}
    {params.succes&&<p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{params.succes==="arrivee"?"Arrivée enregistrée avec la date, l’heure et le GPS.":params.succes==="depart"?"Départ enregistré avec le GPS et heures calculées.":params.succes==="fiche_admin"?"Votre fiche personnelle est prête. Vous pouvez maintenant pointer sur un chantier.":"Pointage enregistré."}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Mes heures normales</p><strong className="font-mono text-xl">{totalNormal} h</strong></div><div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Mes heures supplémentaires</p><strong className="font-mono text-xl text-amber-700">{totalSup} h</strong></div><div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Mon total travaillé</p><strong className="font-mono text-xl">{totalNormal+totalSup} h</strong></div></div>
    {peutPointer&&monEmploye&&chantiersOrdonnes.length?<PointageArriveeDepart employes={[{id:monEmploye.id,nom:`${monEmploye.prenom??""} ${monEmploye.nom}`.trim()}]} chantiers={chantiersOrdonnes.map(c=>({id:c.id,nom:`${c.priorite===0?"Aujourd’hui":c.priorite===1?"Assigné":"Autre chantier"} — ${c.nom}`}))} sessions={ouvertes.map(s=>{const e=un(s.employe),c=un(s.chantier);return{id:s.id,arrivee_at:s.arrivee_at,tache:s.tache,employe:e?{id:e.id,nom:`${e.prenom??""} ${e.nom}`.trim()}:null,chantier:c?{id:c.id,nom:c.nom}:null};})}/>:peutPointer&&peutGerer&&!monEmploye&&!ctx.accesSupportPlateforme?<form action={creerMaFichePointageAdministrateurAction} className="rounded border border-blue-200 bg-blue-50 p-5 text-sm"><h2 className="font-semibold text-blue-950">Activer mon pointage administrateur</h2><p className="mt-1 text-blue-900">Une fiche personnelle sera créée ou reliée à votre compte. Vos arrivées et départs resteront strictement enregistrés en votre nom.</p><button className="mt-3 rounded bg-blue-800 px-4 py-2 font-semibold text-white">Créer ma fiche et pointer</button></form>:ctx.accesSupportPlateforme?<p className="rounded border border-dashed p-5 text-sm text-neutral-500">Le mode support plateforme permet de contrôler les écrans, mais ne crée jamais de pointage dans l’entreprise cliente.</p>:peutPointer?<p className="rounded border border-dashed p-5 text-sm text-neutral-500">Votre compte doit être lié à une fiche employé active et à un chantier.</p>:<p className="rounded border border-dashed p-5 text-sm text-neutral-500">Votre administrateur n’a pas activé le pointage personnel pour ce compte.</p>}
    {entrepriseSuiviZone?.suivi_zone_actif&&maSessionOuverte&&<SuiviZoneChantier sessionId={maSessionOuverte.id} frequenceMinutes={entrepriseSuiviZone.suivi_zone_frequence_minutes??30}/>}
    {peutPointer&&permissions!==null&&chantiersOrdonnes.length>0&&<ForgottenPointageForm chantiers={chantiersOrdonnes.map(({id,nom})=>({id,nom}))}/>}
    <section><h2 className="mb-3 font-semibold">Mes pointages GPS</h2><div className="space-y-3">{sessions.map(s=>{const c=un(s.chantier),validation=un(s.pointage),duree=s.depart_at?Math.max(0,(new Date(s.depart_at).getTime()-new Date(s.arrivee_at).getTime())/3600000-Number(s.pause_minutes)/60):null;return <article key={s.id} className={`rounded-md border p-4 ${validation?.anomalie_niveau==="critique"?"border-red-400 bg-red-50":validation?.anomalie_niveau?"border-amber-400 bg-amber-50":""}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-[#9a7625]">{c?.nom??"Chantier non renseigné"}</h3><p className="mt-1 text-sm text-neutral-500">{dateHeure(s.arrivee_at)} · arrivée {heure(s.arrivee_at)}{s.depart_at?` · départ ${heure(s.depart_at)}`:" · départ non pointé"}</p>{s.tache&&<p className="mt-1 text-sm">{s.tache}</p>}{validation?.anomalie_motif&&<p className="mt-2 rounded bg-white/70 p-2 text-sm font-medium text-amber-900">⚠ {validation.anomalie_motif}{validation.heures_attendues!==null?` · ${validation.heures_attendues} h attendues`:""}</p>}</div>{duree!==null&&<strong className="rounded bg-neutral-100 px-3 py-1 font-mono dark:bg-neutral-800">{duree.toFixed(2).replace(".",",")} h</strong>}</div><div className="mt-3 flex flex-wrap gap-4 text-xs"><a href={`https://www.openstreetmap.org/?mlat=${s.latitude_arrivee}&mlon=${s.longitude_arrivee}#map=18/${s.latitude_arrivee}/${s.longitude_arrivee}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">GPS arrivée{s.precision_arrivee_metres?` · ± ${Math.round(Number(s.precision_arrivee_metres))} m`:""}</a>{s.latitude_depart!==null&&s.longitude_depart!==null&&<a href={`https://www.openstreetmap.org/?mlat=${s.latitude_depart}&mlon=${s.longitude_depart}#map=18/${s.latitude_depart}/${s.longitude_depart}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">GPS départ{s.precision_depart_metres?` · ± ${Math.round(Number(s.precision_depart_metres))} m`:""}</a>}</div></article>;})}{!sessions.length&&<p className="rounded border border-dashed p-6 text-center text-sm text-neutral-500">Aucun pointage GPS pour ce mois.</p>}</div></section>
    {anciens.length>0&&<details className="rounded-md border"><summary className="cursor-pointer p-4 text-sm font-medium">Mes anciennes saisies d’heures ({anciens.length})</summary><div className="space-y-3 p-4 pt-0">{anciens.map(p=>{const c=un(p.chantier);return <article key={p.id} className="rounded border p-3"><p className="font-medium text-[#9a7625]">{c?.nom??"—"}</p><p className="text-sm text-neutral-500">{p.date} · {Number(p.heures_normales)+Number(p.heures_supplementaires)} h · {p.verification_statut.replaceAll("_"," ")}</p>{p.latitude!==null&&p.longitude!==null&&<a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-blue-700">Voir le GPS</a>}</article>;})}</div></details>}
  </div></main>;
}
