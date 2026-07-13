export const HABILITATION_TYPES = [
  { cle: "sst", libelle: "SST — Sauveteur Secouriste du Travail" },
  { cle: "caces", libelle: "CACES" },
  { cle: "travail_hauteur", libelle: "Travail en hauteur" },
  { cle: "habilitation_electrique", libelle: "Habilitation électrique" },
  { cle: "amiante", libelle: "Amiante (SS3 / SS4)" },
  { cle: "autre", libelle: "Autre" },
] as const;

export function libelleHabilitation(cle: string) {
  return HABILITATION_TYPES.find((h) => h.cle === cle)?.libelle ?? cle;
}

type Statut = { cle: string; libelle: string; couleur: string };

// Statut de la carte BTP interne, dérivé de la date d'expiration + présence d'un fichier.
export function statutCarteBtp(expiration: string | null, aUnFichier: boolean): Statut {
  if (!aUnFichier) return { cle: "en_attente", libelle: "En attente", couleur: "#8b8f96" };
  if (!expiration) return { cle: "valide", libelle: "Valide", couleur: "#2f6b47" };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (expiration < aujourdhui) return { cle: "expiree", libelle: "Expirée", couleur: "#a64b45" };
  const dans60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  if (expiration <= dans60) return { cle: "a_renouveler", libelle: "À renouveler", couleur: "#b8792e" };
  return { cle: "valide", libelle: "Valide", couleur: "#2f6b47" };
}

// Une habilitation est-elle encore valide (par sa date d'expiration) ?
export function habilitationStatut(expiration: string | null): Statut {
  if (!expiration) return { cle: "sans_date", libelle: "Sans échéance", couleur: "#6b7280" };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (expiration < aujourdhui) return { cle: "expiree", libelle: "Expirée", couleur: "#a64b45" };
  const dans60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  if (expiration <= dans60) return { cle: "bientot", libelle: "À renouveler", couleur: "#b8792e" };
  return { cle: "valide", libelle: "Valide", couleur: "#2f6b47" };
}

export const AVERTISSEMENT_CIBTP =
  "Cette carte numérique est un badge professionnel interne. Elle ne constitue pas la Carte d'identification professionnelle BTP délivrée par CIBTP France.";
