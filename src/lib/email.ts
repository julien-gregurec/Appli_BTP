import { euros } from "@/lib/devis";

type ClientMail = { nom: string | null; prenom: string | null; societe: string | null; email: string | null };

// Construit un lien mailto: pré-rempli pour envoyer un devis ou une facture au client.
// Le PDF n'est pas joignable via mailto — le corps invite donc à joindre le PDF téléchargé.
export function contenuEmailDocument(opts: {
  typeDoc: "devis" | "facture";
  numero: string | null;
  client: ClientMail;
  montantTtc: number;
  entrepriseNom: string;
  prenomEmetteur?: string | null;
}): {to:string;sujet:string;corps:string} | null {
  const to = opts.client.email?.trim();
  if (!to) return null;

  const estFacture = opts.typeDoc === "facture";
  const libelle = estFacture ? "facture" : "devis";
  const ref = opts.numero ?? (estFacture ? "facture" : "devis");
  const nomClient =
    opts.client.societe ||
    [opts.client.prenom, opts.client.nom].filter(Boolean).join(" ") ||
    "Madame, Monsieur";

  const sujet = `${estFacture ? "Facture" : "Devis"} ${ref} — ${opts.entrepriseNom}`;

  const corps = [
    `Bonjour ${nomClient},`,
    "",
    estFacture
      ? `Veuillez trouver ci-joint la ${libelle} ${ref} d'un montant de ${euros(opts.montantTtc)} TTC.`
      : `Veuillez trouver ci-joint le ${libelle} ${ref} d'un montant de ${euros(opts.montantTtc)} TTC.`,
    "",
    "(Pensez à joindre le PDF téléchargé à cet e-mail avant l'envoi.)",
    "",
    estFacture
      ? "Nous restons à votre disposition pour tout renseignement et vous remercions de votre confiance."
      : "Nous restons à votre disposition pour toute précision et espérons que cette proposition retiendra votre attention.",
    "",
    "Cordialement,",
    opts.prenomEmetteur ? `${opts.prenomEmetteur} — ${opts.entrepriseNom}` : opts.entrepriseNom,
  ].join("\n");

  return {to,sujet,corps};
}

export function contenuEmailCommande(opts: { numero: string; fournisseurNom: string; fournisseurEmail: string | null; montantTtc: number; entrepriseNom: string; dateLivraison?: string | null }) {
  const to = opts.fournisseurEmail?.trim();
  if (!to) return null;
  const sujet = `Commande ${opts.numero} — ${opts.entrepriseNom}`;
  const corps = [
    `Bonjour ${opts.fournisseurNom},`, "",
    `Veuillez trouver ci-joint notre bon de commande ${opts.numero}, d’un montant de ${euros(opts.montantTtc)} TTC.`,
    opts.dateLivraison ? `Livraison souhaitée au plus tard le ${opts.dateLivraison}.` : null,
    "", "(Pensez à joindre le PDF ouvert depuis l’application avant l’envoi.)", "",
    "Merci de nous confirmer la prise en compte de cette commande et le délai de livraison.", "", "Cordialement,", opts.entrepriseNom,
  ].filter((ligne) => ligne !== null).join("\n");
  return { to, sujet, corps };
}
