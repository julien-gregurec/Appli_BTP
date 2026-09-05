import { euros } from "@/lib/devis";

type ClientMail = { nom: string | null; prenom: string | null; societe: string | null; email: string | null };

export function construireLienMailto(opts:{to:string;sujet:string;corps:string;cc?:string}){
  const parametres=[`subject=${encodeURIComponent(opts.sujet)}`,`body=${encodeURIComponent(opts.corps)}`];
  if(opts.cc?.trim())parametres.push(`cc=${encodeURIComponent(opts.cc.split(/[;,]/).map(adresse=>adresse.trim()).filter(Boolean).join(","))}`);
  return `mailto:${encodeURIComponent(opts.to.trim())}?${parametres.join("&")}`;
}

// Construit le message réellement destiné au client. Les consignes d'utilisation
// (notamment l'ajout manuel du PDF) restent dans l'interface et ne doivent jamais
// apparaître dans l'e-mail professionnel.
export function contenuEmailDocument(opts: {
  typeDoc: "devis" | "facture" | "avoir";
  numero: string | null;
  client: ClientMail;
  montantTtc: number;
  entrepriseNom: string;
  prenomEmetteur?: string | null;
}): {to:string;sujet:string;corps:string} | null {
  const to = opts.client.email?.trim();
  if (!to) return null;

  // Un avoir suit le ton "facture" (même relation contractuelle), mais ne doit jamais être
  // appelé "facture" dans l'objet/le corps — seul le libellé et l'article changent.
  const estAvoir = opts.typeDoc === "avoir";
  const estFacture = opts.typeDoc === "facture" || estAvoir;
  const libelle = estAvoir ? "avoir" : estFacture ? "facture" : "devis";
  const article = estAvoir ? "l'" : estFacture ? "la " : "le ";
  const ref = opts.numero ?? libelle;
  const contact = [opts.client.prenom, opts.client.nom].filter(Boolean).join(" ");
  const salutation = contact || "Madame, Monsieur";

  const sujetLabel = estAvoir ? "Avoir" : estFacture ? "Facture" : "Devis";
  const sujet = `${sujetLabel} ${ref} — ${opts.entrepriseNom}`;

  const corps = [
    `Bonjour ${salutation},`,
    "",
    `Veuillez trouver ci-joint ${article}${libelle} ${ref} d'un montant de ${euros(opts.montantTtc)} TTC.`,
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

// Version HTML du même message texte que contenuEmailDocument(), avec un
// bouton d'accès au document. Le texte source reste la référence : cette
// fonction ne fait qu'y ajouter une mise en forme minimale + le lien.
export function corpsHtmlEmailDocument(corpsTexte: string, lienDocument: string | null): string {
  const paragraphes = corpsTexte
    .split("\n\n")
    .map((bloc) => `<p style="margin:0 0 12px;">${bloc.split("\n").join("<br>")}</p>`)
    .join("");
  const bouton = lienDocument
    ? `<p style="margin:20px 0;"><a href="${lienDocument}" style="display:inline-block;background:#0d1b2a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Consulter le document</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px;">${paragraphes}${bouton}</div>`;
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
