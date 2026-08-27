"use client";

import { useFormStatus } from "react-dom";

export function RemiseConfirmButton({
  entrepriseNom,
  prixCatalogueMensuel,
  className,
}: {
  entrepriseNom: string;
  prixCatalogueMensuel: number;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const donnees = new FormData(form);
        const type = String(donnees.get("type") ?? "pourcentage");
        const valeur = Number(donnees.get("valeur") ?? 0);
        const duree = String(donnees.get("duree") ?? "once");
        const dureeMois = Number(donnees.get("duree_mois") ?? 0);
        const motifInterne = String(donnees.get("motif_interne") ?? "").trim();
        if (!motifInterne) {
          window.alert("Le motif interne est obligatoire pour accorder une remise.");
          event.preventDefault();
          return;
        }
        const reduction = type === "montant" ? valeur : (prixCatalogueMensuel * valeur) / 100;
        const prixEstime = Math.max(0, prixCatalogueMensuel - reduction);
        const periode = duree === "repeating" ? `pendant ${dureeMois || "?"} mois` : duree === "forever" ? "à vie" : "une fois (sur la prochaine facture)";
        const montant = type === "montant" ? `${valeur.toLocaleString("fr-FR")} € HT` : `${valeur} %`;
        const message = [
          `Accorder une remise à ${entrepriseNom} ?`,
          ``,
          `Prix catalogue actuel : ${prixCatalogueMensuel.toLocaleString("fr-FR")} € HT/mois (base + comptes supplémentaires éventuels)`,
          `Remise : ${montant}, ${periode}`,
          `Prix estimé après remise : ${prixEstime.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € HT${duree === "once" ? " sur la prochaine facture uniquement" : "/mois"}`,
          `Motif interne : ${motifInterne}`,
          ``,
          `La remise s'applique au prorata sur l'ensemble de la facture Stripe (abonnement de base et comptes supplémentaires).`,
        ].join("\n");
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "Application en cours…" : "Appliquer"}
    </button>
  );
}
