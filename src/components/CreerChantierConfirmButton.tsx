"use client";

export function CreerChantierConfirmButton({
  clientNom,
  devisNumero,
  montantHt,
  className,
}: {
  clientNom: string;
  devisNumero: string | null;
  montantHt: number;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        const donnees = new FormData(form);
        const nom = String(donnees.get("nom") ?? "").trim();
        if (!nom) {
          window.alert("Le chantier doit avoir un nom.");
          event.preventDefault();
          return;
        }
        const adresse = String(donnees.get("adresse") ?? "").trim();
        const codePostal = String(donnees.get("code_postal") ?? "").trim();
        const ville = String(donnees.get("ville") ?? "").trim();
        const adresseComplete = [adresse, [codePostal, ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—";
        const message = [
          `Créer ce chantier ?`,
          ``,
          `Client : ${clientNom}`,
          `Chantier : ${nom}`,
          `Adresse : ${adresseComplete}`,
          `Devis source : ${devisNumero ?? "—"}`,
          `Budget prévisionnel : ${montantHt.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT (montant du devis)`,
        ].join("\n");
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      Créer le chantier
    </button>
  );
}
