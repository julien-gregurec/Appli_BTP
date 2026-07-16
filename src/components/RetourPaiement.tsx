"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function RetourPaiement({cible}:{cible:string}){const router=useRouter(),[secondes,setSecondes]=useState(4);useEffect(()=>{const intervalle=window.setInterval(()=>setSecondes(valeur=>Math.max(0,valeur-1)),1000),retour=window.setTimeout(()=>router.replace(cible),4000);return()=>{window.clearInterval(intervalle);window.clearTimeout(retour);};},[cible,router]);return <div className="mt-6"><p className="mb-3 text-xs text-neutral-500">Retour automatique vers la facture dans {secondes} seconde{secondes>1?"s":""}.</p><Link href={cible} className="inline-flex rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Retour immédiat à la facture</Link></div>}
