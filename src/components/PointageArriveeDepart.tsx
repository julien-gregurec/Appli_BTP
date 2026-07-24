"use client";
import { useEffect, useState } from "react";
import { enregistrerArriveeAction, enregistrerDepartAction } from "@/app/actions/pointages";
import { SearchableSelect } from "@/components/SearchableSelect";
import { PointageChrono } from "@/components/PointageChrono";
type Option={id:string;nom:string;priorite?:"jour"|"affecte"|"autre"};
type Session={id:string;arrivee_at:string;tache:string|null;employe:Option|null;chantier:Option|null};
type Position={lat:number;lng:number;precision:number};
const input="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
// Le nom de chantier arrive parfois préfixé ("Aujourd’hui — X") pour le tri/la recherche ; on n’affiche que le nom réel.
const nomAffiche=(nom:string)=>nom.includes(" — ")?nom.slice(nom.indexOf(" — ")+3):nom;

function usePositionTerrain(){
  const[position,setPosition]=useState<Position|null>(null),[erreur,setErreur]=useState(""),[charge,setCharge]=useState(true);
  const[motifSansGps,setMotifSansGps]=useState("");
  useEffect(()=>{
    if(!navigator.geolocation){queueMicrotask(()=>{setErreur("La géolocalisation n’est pas disponible sur cet appareil.");setCharge(false);});return;}
    const suivi=navigator.geolocation.watchPosition(
      p=>{setPosition({lat:p.coords.latitude,lng:p.coords.longitude,precision:p.coords.accuracy});setErreur("");setCharge(false);},
      e=>{setErreur(e.message||"Position impossible à obtenir. Autorisez la localisation dans les réglages du navigateur.");setCharge(false);},
      {enableHighAccuracy:true,timeout:15000,maximumAge:10000},
    );
    return()=>navigator.geolocation.clearWatch(suivi);
  },[]);
  const gpsIndisponible=!charge&&!position;
  const peutContinuer=Boolean(position)||motifSansGps.trim().length>0;
  return{position,erreur,charge,motifSansGps,setMotifSansGps,gpsIndisponible,peutContinuer};
}

function ChampsGpsCaches({position,motifSansGps}:{position:Position|null;motifSansGps:string}){
  return<><input type="hidden" name="latitude" value={position?.lat??""}/><input type="hidden" name="longitude" value={position?.lng??""}/><input type="hidden" name="precision_metres" value={position?.precision??""}/><input type="hidden" name="motif_sans_gps" value={position?"":motifSansGps}/></>;
}

function StatutGps({gps}:{gps:ReturnType<typeof usePositionTerrain>}){
  return<div className="rounded-md bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900">
    {gps.charge&&<p className="text-blue-700" aria-live="polite">Acquisition automatique de la position GPS…</p>}
    {gps.position&&<p className="text-green-700" aria-live="polite">GPS prêt · précision ± {Math.round(gps.position.precision)} m</p>}
    {gps.erreur&&<p className="text-red-600" role="alert">{gps.erreur}</p>}
    {gps.gpsIndisponible&&<div className="mt-2 rounded-md bg-amber-50 p-2 dark:bg-amber-950/30"><label className="text-xs font-medium text-amber-800 dark:text-amber-300">Pas de GPS (poste de bureau, réseau indisponible…) ? Indique pourquoi pour continuer sans position<input value={gps.motifSansGps} onChange={e=>gps.setMotifSansGps(e.target.value)} placeholder="Ex. poste fixe au bureau, sans wifi" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm dark:bg-neutral-900"/></label></div>}
  </div>;
}

function CarteChantier({nom}:{nom:string}){
  return<div className="rounded-md border bg-neutral-50 px-4 py-3 text-center dark:bg-neutral-900"><p className="text-xs text-neutral-500">Chantier</p><p className="text-lg font-semibold text-[#9a7625]">{nomAffiche(nom)}</p></div>;
}

function CarteArrivee({employe,chantiers,plusieursEmployes}:{employe:Option;chantiers:Option[];plusieursEmployes:boolean}){
  const gps=usePositionTerrain();
  const[chantierId,setChantierId]=useState(chantiers[0]?.id??"");
  const[changerChantier,setChangerChantier]=useState(false);
  const chantierSelectionne=chantiers.find(c=>c.id===chantierId);
  return<form action={enregistrerArriveeAction} className="space-y-4 rounded-lg border bg-white p-5 shadow-sm dark:bg-neutral-950">
    <input type="hidden" name="employe_id" value={employe.id}/>
    <input type="hidden" name="chantier_id" value={chantierId}/>
    {plusieursEmployes&&<p className="text-xs text-neutral-500">Pointage au nom de <strong>{employe.nom}</strong></p>}
    <PointageChrono depuis={null}/>
    <CarteChantier nom={chantierSelectionne?.nom??""}/>
    {chantiers.length>1&&(changerChantier
      ?<SearchableSelect value={chantierId} onValueChange={setChantierId} options={chantiers.map(c=>({value:c.id,label:nomAffiche(c.nom),search:c.nom}))} placeholder="Écrire le nom du chantier…"/>
      :<button type="button" onClick={()=>setChangerChantier(true)} className="text-xs font-medium text-blue-700 underline">Changer de chantier</button>)}
    <ChampsGpsCaches position={gps.position} motifSansGps={gps.motifSansGps}/>
    <button disabled={!gps.peutContinuer} className="w-full rounded-md bg-green-700 px-4 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{gps.charge?"Localisation en cours…":"Pointer l’arrivée"}</button>
    <StatutGps gps={gps}/>
    <details className="text-sm"><summary className="cursor-pointer text-neutral-500">Options avancées</summary><label className="mt-2 block text-xs text-neutral-500">Tâche prévue <span className="font-normal">(facultatif)</span><input name="tache" placeholder="Pose de cloisons…" className={`${input} mt-1`}/></label></details>
  </form>;
}

function CarteDepart({session}:{session:Session}){
  const gps=usePositionTerrain();
  return<form action={enregistrerDepartAction.bind(null,session.id)} className="space-y-4 rounded-lg border border-red-200 bg-white p-5 shadow-sm dark:bg-neutral-950">
    <p className="text-xs text-neutral-500">Pointage au nom de <strong>{session.employe?.nom}</strong></p>
    <PointageChrono depuis={session.arrivee_at}/>
    <CarteChantier nom={session.chantier?.nom??""}/>
    <ChampsGpsCaches position={gps.position} motifSansGps={gps.motifSansGps}/>
    <button disabled={!gps.peutContinuer} className="w-full rounded-md bg-red-700 px-4 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{gps.charge?"Localisation en cours…":"Pointer le départ"}</button>
    <StatutGps gps={gps}/>
    <details className="text-sm"><summary className="cursor-pointer text-neutral-500">Options avancées</summary><label className="mt-2 block text-xs text-neutral-500">Pause (minutes)<input name="pause_minutes" type="number" min="0" max="1440" step="5" defaultValue="45" className="mt-1 w-28 rounded border px-2 py-1"/></label></details>
  </form>;
}

export function PointageArriveeDepart({employes,chantiers,sessions}:{employes:Option[];chantiers:Option[];sessions:Session[]}){
  const employesAvecSessionOuverte=new Set(sessions.map(s=>s.employe?.id).filter(Boolean));
  const employesSansSession=employes.filter(e=>!employesAvecSessionOuverte.has(e.id));
  return<section className="space-y-4 rounded-lg border-2 border-[#c9a24a]/60 bg-[#c9a24a]/5 p-5">
    <div><h2 className="text-lg font-semibold">Pointage</h2><p className="text-sm text-neutral-600">L’heure, la date et la position GPS sont ajoutées automatiquement.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {employesSansSession.map(employe=><CarteArrivee key={employe.id} employe={employe} chantiers={chantiers} plusieursEmployes={employes.length>1}/>)}
      {sessions.map(session=><CarteDepart key={session.id} session={session}/>)}
    </div>
  </section>;
}
