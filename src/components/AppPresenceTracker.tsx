"use client";

import { useEffect } from "react";
import { enregistrerPresenceApplicationAction } from "@/app/actions/suivi-acces";
import { lireEtMigrerCleStockage } from "@/lib/browser-storage";

export function AppPresenceTracker({ actif }: { actif: boolean }) {
  useEffect(() => {
    if (!actif) return;
    const navigateur = navigator as Navigator & { standalone?: boolean };
    const installee = window.matchMedia("(display-mode: standalone)").matches || navigateur.standalone === true;
    const cleAppareil="elsatia-appareil-id",cleAppareilHistorique="liria-appareil-id";
    let identifiant=lireEtMigrerCleStockage(localStorage,cleAppareil,cleAppareilHistorique);
    if(!identifiant){identifiant=crypto.randomUUID();localStorage.setItem(cleAppareil,identifiant);}
    const mobile=/iPhone|Android.+Mobile/i.test(navigator.userAgent),tablette=/iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent);
    const type=tablette?"tablette":mobile?"telephone":"ordinateur";
    const navigateurNom=/Edg\//.test(navigator.userAgent)?"Edge":/Firefox\//.test(navigator.userAgent)?"Firefox":/Chrome\//.test(navigator.userAgent)?"Chrome":/Safari\//.test(navigator.userAgent)?"Safari":"Navigateur";
    const nom=`${installee?"Application":"Navigateur"} ${navigateurNom} · ${type}`;
    const date=new Date().toISOString().slice(0,10),cle=`elsatia-presence-${identifiant}-${date}`,cleHistorique=`liria-presence-${identifiant}-${date}`;
    if (lireEtMigrerCleStockage(sessionStorage,cle,cleHistorique)) return;
    sessionStorage.setItem(cle, new Date().toISOString());
    enregistrerPresenceApplicationAction(installee,{id:identifiant,nom,type}).catch(() => sessionStorage.removeItem(cle));
  }, [actif]);
  return null;
}
