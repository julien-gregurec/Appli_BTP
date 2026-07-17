"use client";
import { useEffect, useState } from "react";
import { enregistrerArriveeAction, enregistrerDepartAction } from "@/app/actions/pointages";
import { SearchableSelect } from "@/components/SearchableSelect";
type Option={id:string;nom:string;priorite?:"jour"|"affecte"|"autre"};
type Session={id:string;arrivee_at:string;tache:string|null;employe:Option|null;chantier:Option|null};
const input="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

function PositionEtValidation({libelle,bouton,couleur}:{libelle:string;bouton:string;couleur:string}){
  const[position,setPosition]=useState<{lat:number;lng:number;precision:number}|null>(null),[erreur,setErreur]=useState(""),[charge,setCharge]=useState(true);
  useEffect(()=>{
    if(!navigator.geolocation){queueMicrotask(()=>{setErreur("La géolocalisation n’est pas disponible sur cet appareil.");setCharge(false);});return;}
    const suivi=navigator.geolocation.watchPosition(
      p=>{setPosition({lat:p.coords.latitude,lng:p.coords.longitude,precision:p.coords.accuracy});setErreur("");setCharge(false);},
      e=>{setErreur(e.message||"Position impossible à obtenir. Autorisez la localisation dans les réglages du navigateur.");setCharge(false);},
      {enableHighAccuracy:true,timeout:15000,maximumAge:10000},
    );
    return()=>navigator.geolocation.clearWatch(suivi);
  },[]);
  return <div className="rounded-md border border-dashed p-3"><input type="hidden" name="latitude" value={position?.lat??""}/><input type="hidden" name="longitude" value={position?.lng??""}/><input type="hidden" name="precision_metres" value={position?.precision??""}/><div><p className="text-sm font-medium">Position GPS {libelle}</p><p className="text-xs text-neutral-500">La localisation, la date et l’heure sont enregistrées automatiquement.</p></div>{charge&&<p className="mt-2 text-xs text-blue-700" aria-live="polite">Acquisition automatique de la position GPS…</p>}{position&&<p className="mt-2 text-xs text-green-700" aria-live="polite">GPS prêt · précision ± {Math.round(position.precision)} m</p>}{erreur&&<p className="mt-2 text-xs text-red-600" role="alert">{erreur}</p>}<button disabled={!position} className={`mt-3 w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${couleur}`}>{charge?"Localisation en cours…":bouton}</button></div>;
}

export function PointageArriveeDepart({employes,chantiers,sessions}:{employes:Option[];chantiers:Option[];sessions:Session[]}){
  return <section className="space-y-4 rounded-lg border-2 border-[#c9a24a]/60 bg-[#c9a24a]/5 p-5"><div><h2 className="text-lg font-semibold">Pointage GPS chantier</h2><p className="text-sm text-neutral-600">Choisissez le chantier puis enregistrez votre arrivée. L’heure, la date et la position GPS sont ajoutées automatiquement.</p></div>
    <form action={enregistrerArriveeAction} className="space-y-3 rounded-md bg-white p-4 shadow-sm dark:bg-neutral-950"><h3 className="font-semibold text-green-800">Pointer une arrivée</h3><div className="grid gap-3 sm:grid-cols-2">{employes.length===1?<div className="rounded-md border bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-900"><span className="block text-xs text-neutral-500">Pointage au nom de</span><strong>{employes[0].nom}</strong><input type="hidden" name="employe_id" value={employes[0].id}/></div>:<label className="text-xs text-neutral-500">Employé<select name="employe_id" required className={input}>{employes.map(e=><option key={e.id} value={e.id}>{e.nom}</option>)}</select></label>}<label className="text-xs text-neutral-500">Chantier<SearchableSelect name="chantier_id" required options={chantiers.map(c=>({value:c.id,label:c.nom,search:c.priorite??""}))} placeholder="Écrire le nom du chantier…" className="mt-1"/></label><label className="text-xs text-neutral-500 sm:col-span-2">Tâche prévue <span className="font-normal">(facultatif)</span><input name="tache" placeholder="Pose de cloisons…" className={input}/></label></div><PositionEtValidation libelle="d’arrivée" bouton="Enregistrer mon arrivée" couleur="bg-green-700"/></form>
    <div className="grid gap-3">{sessions.map(session=><form key={session.id} action={enregistrerDepartAction.bind(null,session.id)} className="space-y-3 rounded-md border border-blue-200 bg-white p-4 dark:bg-neutral-950"><div><h3 className="font-semibold text-blue-800">Pointer le départ — {session.employe?.nom}</h3><p className="text-sm text-neutral-500"><strong>{session.chantier?.nom}</strong> · arrivée {new Date(session.arrivee_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</p></div><label className="block text-xs text-neutral-500">Pause (minutes)<input name="pause_minutes" type="number" min="0" max="1440" step="5" defaultValue="45" className="mt-1 w-28 rounded border px-2 py-1"/></label><PositionEtValidation libelle="de départ" bouton="Enregistrer mon départ" couleur="bg-blue-800"/></form>)}{!sessions.length&&<p className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Aucune arrivée ouverte. Le départ apparaîtra ici après le pointage d’arrivée.</p>}</div>
  </section>;
}
