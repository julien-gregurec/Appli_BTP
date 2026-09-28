// Identité officielle d'exploitation ELSATIA — source unique pour l'interface,
// les pages légales, Stripe et les contrôles automatisés.
// Aucune donnée personnelle superflue (date de naissance, adresse personnelle…)
// ne doit être ajoutée ici : seules les mentions publiques de l'immatriculation.

export const MARQUE = "ELSATIA";
export const PRODUIT_GESTION_PRO = "ELSATIA Gestion Pro";

export const IDENTITE_LEGALE = {
  exploitant: "Julien GREGUREC",
  forme: "entrepreneur individuel (EI)",
  siren: "850 559 873",
  rcs: "850 559 873 R.C.S. Strasbourg",
  dateImmatriculation: "2026-09-28",
  dateDebutActivite: "2026-10-01",
  site: "elsatia.fr",
  activite:
    "Edition, exploitation et commercialisation d'un logiciel en ligne (SaaS) de gestion d'entreprise et prestations de services numériques associées.",
} as const;

// Boîte de contact publique. À confirmer par l'exploitant (voir rapport d'audit) ;
// surchargeable sans modifier le code.
export const EMAIL_CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "contact@elsatia.fr";

export const DOMAINES_ELSATIA = {
  site: "elsatia.fr",
  gestionPro: "app.elsatia.fr",
  tools: "tools.elsatia.fr",
  colors: "colors.elsatia.fr",
  reserves: "reserves.elsatia.fr",
  studio: "studio.elsatia.fr",
} as const;

// Début officiel de l'activité : 1er octobre 2026, 00:00 heure de Paris.
export const DEBUT_COMMERCIALISATION = new Date("2026-10-01T00:00:00+02:00");

export function commercialisationOuverte(maintenant: Date = new Date()) {
  return maintenant.getTime() >= DEBUT_COMMERCIALISATION.getTime();
}

export function verifierCommercialisationOuverte(maintenant: Date = new Date()) {
  if (!commercialisationOuverte(maintenant)) {
    throw new Error("Les ventes ELSATIA ouvrent le 1er octobre 2026. Aucun abonnement ni achat ne peut être facturé avant cette date.");
  }
}

export function mentionEditeur() {
  return `${PRODUIT_GESTION_PRO} est édité par ${IDENTITE_LEGALE.exploitant}, ${IDENTITE_LEGALE.forme} — ${IDENTITE_LEGALE.rcs}`;
}
