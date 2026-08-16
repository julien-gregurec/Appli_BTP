"use client";

import { useMemo, useState } from "react";
import { enregistrerPromotionAction } from "@/app/actions/promotions";
import { calculerApercuPromotion, type OffrePromotion } from "@/lib/promotions-commerciales";

type Entreprise = { id: string; nom: string };
type Initial = {
  id?: string;
  nom_interne?: string;
  type_remise?: "pourcentage" | "montant";
  valeur?: number;
  duree?: "once" | "repeating" | "forever";
  duree_mois?: number | null;
  date_debut?: string;
  date_fin?: string | null;
  offres?: string[];
  entreprise_id?: string | null;
  justification?: string;
  est_pilote?: boolean;
  code_promotionnel?: string | null;
  limite_utilisations?: number | null;
};

const champ = "rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";
const offres: OffrePromotion[] = ["mini", "pro", "business", "entreprise"];

export function PromotionCommercialeForm({ entreprises, initial = {}, libelleBouton = "Créer le brouillon" }: { entreprises: Entreprise[]; initial?: Initial; libelleBouton?: string }) {
  const [type, setType] = useState(initial.type_remise ?? "pourcentage");
  const [valeur, setValeur] = useState(Number(initial.valeur ?? 10));
  const [periodicite, setPeriodicite] = useState<"mensuel" | "annuel">("mensuel");
  const [base, setBase] = useState(69);
  const [supplements, setSupplements] = useState(0);
  const apercu = useMemo(() => calculerApercuPromotion({ baseMensuelleHt: base, supplementsMensuelsHt: supplements, periodicite, type, valeur }), [base, supplements, periodicite, type, valeur]);

  return <form action={enregistrerPromotionAction} className="grid gap-3 md:grid-cols-3">
    {initial.id ? <input type="hidden" name="promotion_id" value={initial.id}/> : null}
    <input name="nom_interne" defaultValue={initial.nom_interne} minLength={3} placeholder="Nom interne" className={champ} required/>
    <select name="type_remise" value={type} onChange={(event)=>setType(event.target.value as typeof type)} className={champ}><option value="pourcentage">Pourcentage</option><option value="montant">Montant fixe HT</option></select>
    <input name="valeur" value={valeur} onChange={(event)=>setValeur(Number(event.target.value))} type="number" min="0.01" max={type==="pourcentage"?100:undefined} step="0.01" className={champ} required/>
    <select name="duree" defaultValue={initial.duree??"once"} className={champ}><option value="once">Ponctuelle</option><option value="repeating">X mois</option><option value="forever">Permanente</option></select>
    <input name="duree_mois" defaultValue={initial.duree_mois??""} type="number" min="1" max="36" placeholder="Nombre de mois si temporaire" className={champ}/>
    <label className="text-xs text-neutral-500">Début<input name="date_debut" defaultValue={initial.date_debut??new Date().toISOString().slice(0,10)} type="date" className={`${champ} mt-1 w-full`} required/></label>
    <label className="text-xs text-neutral-500">Fin facultative<input name="date_fin" defaultValue={initial.date_fin??""} type="date" className={`${champ} mt-1 w-full`}/></label>
    <select name="entreprise_id" defaultValue={initial.entreprise_id??""} className={champ}><option value="">Code promotionnel sans entreprise imposée</option>{entreprises.map((entreprise)=><option key={entreprise.id} value={entreprise.id}>{entreprise.nom}</option>)}</select>
    <input name="code_promotionnel" defaultValue={initial.code_promotionnel??""} pattern="[A-Za-z0-9_-]{3,32}" placeholder="Code public facultatif" className={champ}/>
    <input name="limite_utilisations" defaultValue={initial.limite_utilisations??""} type="number" min="1" placeholder="Limite d’utilisations" className={champ}/>
    <fieldset className="rounded-lg border p-3 md:col-span-2"><legend className="px-1 text-sm font-semibold">Offres compatibles</legend><div className="flex flex-wrap gap-4">{offres.map((offre)=><label key={offre} className="text-sm"><input name="offres" value={offre} type="checkbox" defaultChecked={(initial.offres??["mini"]).includes(offre)} className="mr-2"/>{offre}</label>)}</div><p className="mt-2 text-xs text-neutral-500">Sur mesure reste sur devis et ne peut pas utiliser ce parcours automatique.</p></fieldset>
    <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input name="est_pilote" type="checkbox" defaultChecked={initial.est_pilote}/> Offre pilote identifiée</label>
    <textarea name="justification" defaultValue={initial.justification} minLength={5} placeholder="Justification interne obligatoire" className={`${champ} md:col-span-2`} required/>
    <button className="rounded-lg bg-[#0d1b2a] px-4 py-2 font-semibold text-white">{libelleBouton}</button>
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 md:col-span-3 dark:border-blue-900 dark:bg-blue-950/30">
      <h3 className="font-semibold">Aperçu non contractuel</h3><div className="mt-2 grid gap-2 sm:grid-cols-3"><label className="text-xs">Base mensuelle HT<input type="number" min="0" step="0.01" value={base} onChange={(event)=>setBase(Number(event.target.value))} className={`${champ} mt-1 w-full`}/></label><label className="text-xs">Suppléments récurrents HT<input type="number" min="0" step="0.01" value={supplements} onChange={(event)=>setSupplements(Number(event.target.value))} className={`${champ} mt-1 w-full`}/></label><label className="text-xs">Périodicité<select value={periodicite} onChange={(event)=>setPeriodicite(event.target.value as typeof periodicite)} className={`${champ} mt-1 w-full`}><option value="mensuel">Mensuel</option><option value="annuel">Annuel · 10 mois facturés</option></select></label></div>
      <p className="mt-3 text-sm">Tarif normal <strong>{apercu.tarifNormalHt.toLocaleString("fr-FR")} €</strong> · remise <strong>-{apercu.remiseHt.toLocaleString("fr-FR")} €</strong> · résultat <strong>{apercu.tarifResultantHt.toLocaleString("fr-FR")} € HT</strong></p>
      <p className="mt-1 text-xs text-neutral-600">La remise s’applique à l’abonnement et aux suppléments récurrents de comptes. L’annuel utilise d’abord son prix de 10 mois, puis applique la remise une seule fois.</p>
    </section>
  </form>;
}
