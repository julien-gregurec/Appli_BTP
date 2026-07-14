// Statuts de chantier (Clients & Chantiers §3) : libellé, couleur, ordre du workflow.
export const CHANTIER_STATUTS = [
  { cle: "prospect", libelle: "Prospect", couleur: "#8b8f96" },
  { cle: "devis_envoye", libelle: "Devis envoyé", couleur: "#2c5a8c" },
  { cle: "accepte", libelle: "Accepté", couleur: "#3e7c5a" },
  { cle: "a_preparer", libelle: "À préparer", couleur: "#8b8f96" },
  { cle: "en_attente_validation", libelle: "En attente validation", couleur: "#b8792e" },
  { cle: "en_commande_materiel", libelle: "En commande matériel", couleur: "#1f6f6f" },
  { cle: "en_cours", libelle: "En cours", couleur: "#b8792e" },
  { cle: "en_pause", libelle: "En pause", couleur: "#a64b45" },
  { cle: "termine", libelle: "Terminé", couleur: "#2f6b47" },
  { cle: "facture", libelle: "Facturé", couleur: "#6b4e8c" },
  { cle: "archive", libelle: "Archivé", couleur: "#8b8f96" },
  { cle: "annule", libelle: "Annulé", couleur: "#a64b45" },
] as const;

export type ChantierStatut = (typeof CHANTIER_STATUTS)[number]["cle"];

export function statutChantier(cle: string) {
  return CHANTIER_STATUTS.find((s) => s.cle === cle) ?? CHANTIER_STATUTS[0];
}

export const ROLES_CHANTIER = [
  { cle: "ouvrier", libelle: "Ouvrier" },
  { cle: "chef_equipe", libelle: "Chef d’équipe" },
  { cle: "chef_chantier", libelle: "Chef de chantier" },
  { cle: "conducteur_travaux", libelle: "Conducteur de travaux" },
  { cle: "autre", libelle: "Autre intervenant" },
] as const;

export type RoleChantier = (typeof ROLES_CHANTIER)[number]["cle"];

export function roleChantier(cle: string) {
  return ROLES_CHANTIER.find((role) => role.cle === cle) ?? ROLES_CHANTIER[0];
}

export const CLIENT_TYPES = [
  { cle: "particulier", libelle: "Particulier" },
  { cle: "professionnel", libelle: "Professionnel" },
  { cle: "collectivite", libelle: "Collectivité" },
  { cle: "syndic", libelle: "Syndic" },
  { cle: "promoteur", libelle: "Promoteur" },
] as const;

export const CLIENT_STATUTS = [
  { cle: "prospect", libelle: "Prospect" },
  { cle: "actif", libelle: "Actif" },
  { cle: "inactif", libelle: "Inactif" },
] as const;

// Nom affiché d'un client : société si renseignée, sinon prénom + nom.
export function nomClient(c: { societe?: string | null; nom?: string | null; prenom?: string | null }) {
  if (c.societe) return c.societe;
  return [c.prenom, c.nom].filter(Boolean).join(" ") || "(sans nom)";
}
