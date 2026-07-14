import { quitterEntreprisePlateformeAction } from "@/app/actions/plateforme";

export function SupportAccessBanner({entrepriseNom}:{entrepriseNom:string}){
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"><p><strong>Mode administrateur plateforme :</strong> vous intervenez dans {entrepriseNom}. Cette session est journalisée.</p><form action={quitterEntreprisePlateformeAction}><button className="rounded-md bg-blue-900 px-3 py-2 text-xs font-semibold text-white">Quitter l’entreprise</button></form></div>;
}
