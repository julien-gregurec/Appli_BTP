"use client";

import { modifierCapacitePersonnesAction } from "@/app/actions/abonnement";

export function GestionCapacitePersonnes(props: {
  actuelle: number;
  base: number;
  prixUnitaire: number;
  dateEcheance: string | null;
  activee: boolean;
}) {
  const euros = (montant: number) => montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const confirmerHausse = (ajout: number) => (event: React.FormEvent<HTMLFormElement>) => {
    const cible = props.actuelle + ajout;
    const message = `Ajouter ${ajout} place(s) à ${euros(props.prixUnitaire)} HT/mois chacune ?\n\n` +
      `Nouveau supplément : ${cible} place(s), soit ${euros(cible * props.prixUnitaire)} HT/mois.\n` +
      `Nouvelle capacité totale : ${props.base + cible}. Un prorata sera facturé immédiatement par Stripe.`;
    if (!window.confirm(message)) event.preventDefault();
  };
  const confirmerBaisse = (event: React.FormEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget);
    const cible = Number(form.get("nouvelle_quantite"));
    const date = props.dateEcheance ? new Date(props.dateEcheance).toLocaleDateString("fr-FR") : "la prochaine échéance";
    if (!window.confirm(`Programmer ${cible} place(s) supplémentaires à compter du ${date} ? Aucune personne ne sera supprimée.`)) event.preventDefault();
  };

  if (!props.activee) return <p className="mt-3 text-sm text-amber-800">La gestion est disponible pour les abonnements mensuels Stripe TEST. La politique annuelle reste à valider.</p>;
  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap gap-2">
      {[1, 5, 10].map((ajout) => <form key={ajout} action={modifierCapacitePersonnesAction} onSubmit={confirmerHausse(ajout)}>
        <input type="hidden" name="nouvelle_quantite" value={props.actuelle + ajout}/>
        <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">+{ajout}</button>
      </form>)}
    </div>
    {props.actuelle > 0 && <form action={modifierCapacitePersonnesAction} onSubmit={confirmerBaisse} className="flex flex-wrap items-end gap-2">
      <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">Réduire à la prochaine échéance</span>
        <input className="w-28 rounded-md border px-3 py-2" type="number" name="nouvelle_quantite" min="0" max={props.actuelle - 1} defaultValue={Math.max(0, props.actuelle - 1)} required/>
      </label>
      <button className="rounded-md border px-4 py-2 text-sm font-semibold">Programmer la baisse</button>
    </form>}
  </div>;
}
