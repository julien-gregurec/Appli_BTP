"use client";

import { useMemo, useState } from "react";
import { creerChargeRecurrenteAction } from "@/app/actions/charges";
import { DEPENSE_CATEGORIES } from "@/lib/depenses";
import { calculerMontantsTva, TAUX_TVA_FRANCE } from "@/lib/tva";

type Option = { id: string; nom: string };

const champ = "w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900";
const montant = (valeur: number | null) => valeur === null ? "" : valeur.toFixed(2);

export function ChargeRecurrenteForm({ fournisseurs, chantiers, dateDuJour }: { fournisseurs: Option[]; chantiers: Option[]; dateDuJour: string }) {
  const [montantHt, setMontantHt] = useState("");
  const [tauxTva, setTauxTva] = useState("20");
  const calcul = useMemo(() => {
    if (montantHt.trim() === "") return null;
    try { return calculerMontantsTva(Number(montantHt), Number(tauxTva)); } catch { return null; }
  }, [montantHt, tauxTva]);

  return <form action={creerChargeRecurrenteAction} className="grid gap-3 rounded border p-4 dark:border-neutral-800 sm:grid-cols-2 lg:grid-cols-4">
    <h2 className="font-semibold sm:col-span-2 lg:col-span-4">Nouvelle charge</h2>
    <input name="libelle" required placeholder="Libellé *" className={champ}/>
    <select name="fournisseur_id" required className={champ}><option value="">Fournisseur *</option>{fournisseurs.map((fournisseur) => <option key={fournisseur.id} value={fournisseur.id}>{fournisseur.nom}</option>)}</select>
    <select name="categorie" className={champ}>{Object.entries(DEPENSE_CATEGORIES).map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}</select>
    <select name="chantier_id" className={champ}><option value="">Frais généraux</option>{chantiers.map((chantier) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}</select>
    <select name="periodicite" className={champ}><option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option><option value="annuelle">Annuelle</option></select>
    <input name="prochaine_echeance" type="date" required defaultValue={dateDuJour} className={champ}/>
    <input name="date_fin" type="date" className={champ}/>
    <input name="notes" placeholder="Notes" className={champ}/>
    <label className="text-sm font-medium">Montant HT<input name="montant_ht" type="number" min="0" step="0.01" required value={montantHt} onChange={(event) => setMontantHt(event.target.value)} className={`mt-1 ${champ}`}/></label>
    <label className="text-sm font-medium">Taux de TVA<select name="taux_tva" value={tauxTva} onChange={(event) => setTauxTva(event.target.value)} className={`mt-1 ${champ}`}>{TAUX_TVA_FRANCE.map((taux) => <option key={taux} value={taux}>{taux.toLocaleString("fr-FR")} %</option>)}</select></label>
    <label className="text-sm font-medium">Montant TVA<input readOnly value={montant(calcul?.tva ?? null)} placeholder="Calcul automatique" className={`mt-1 bg-neutral-50 font-mono dark:bg-neutral-950 ${champ}`}/></label>
    <label className="text-sm font-medium">Montant TTC<input readOnly value={montant(calcul?.ttc ?? null)} placeholder="Calcul automatique" className={`mt-1 bg-neutral-50 font-mono dark:bg-neutral-950 ${champ}`}/></label>
    <p className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">La charge conserve ce taux. Chaque facture fournisseur générée reprendra automatiquement le même HT, la même TVA et le même TTC pour la comptabilité.</p>
    <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900 sm:col-span-2 lg:col-span-4">Créer la charge</button>
  </form>;
}
