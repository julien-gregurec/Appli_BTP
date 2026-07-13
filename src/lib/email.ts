import { euros } from "@/lib/devis";

type ClientMail = { nom: string | null; prenom: string | null; societe: string | null; email: string | null };

// Construit le message réellement destiné au client. Les consignes d'utilisation
// (notamment l'ajout manuel du PDF) restent dans l'interface et ne doivent jamais
// apparaître dans l'e-mail professionnel.
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
  const contact = [opts.client.prenom, opts.client.nom].filter(Boolean).join(" ");
  const salutation = contact || "Madame, Monsieur";

  const sujet = `${estFacture ? "Facture" : "Devis"} ${ref} — ${opts.entrepriseNom}`;

  const corps = [
    `Bonjour ${salutation},`,
    "",
    estFacture
      ? `Veuillez trouver ci-joint la ${libelle} ${ref} d'un montant de ${euros(opts.montantTtc)} TTC.`
      : `Veuillez trouver ci-joint le ${libelle} ${ref} d'un montant de ${euros(opts.montantTtc)} TTC.`,
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
    "Bonjour,", "",
    `Veuillez trouver ci-joint notre bon de commande ${opts.numero}, d’un montant de ${euros(opts.montantTtc)} TTC.`,
    opts.dateLivraison ? `Livraison souhaitée au plus tard le ${opts.dateLivraison}.` : null,
    "",
    "Merci de nous confirmer la prise en compte de cette commande et le délai de livraison.", "", "Cordialement,", opts.entrepriseNom,
  ].filter((ligne) => ligne !== null).join("\n");
  return { to, sujet, corps };
}
