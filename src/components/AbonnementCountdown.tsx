"use client";

import { useEffect, useState } from "react";

function libelle(reste:number){
  if(reste<=0)return "Suspension en cours";
  const jours=Math.floor(reste/86400000);
  const heures=Math.floor((reste%86400000)/3600000);
  const minutes=Math.floor((reste%3600000)/60000);
  return `${jours} j ${heures} h ${minutes} min`;
}

export function AbonnementCountdown({echeance,bloquerAEcheance=false}:{echeance:string;bloquerAEcheance?:boolean}){
  const[reste,setReste]=useState(()=>Math.max(0,new Date(echeance).getTime()-Date.now()));
  useEffect(()=>{
    const actualiser=()=>{
      const valeur=Math.max(0,new Date(echeance).getTime()-Date.now());
      setReste(valeur);
      if(valeur===0&&bloquerAEcheance)window.location.assign("/abonnement-suspendu");
    };
    actualiser();const id=window.setInterval(actualiser,30000);return()=>window.clearInterval(id);
  },[echeance,bloquerAEcheance]);
  return <span className="font-mono font-semibold tabular-nums">{libelle(reste)}</span>;
}
