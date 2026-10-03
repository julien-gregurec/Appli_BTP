export const RESEAUX = ["facebook", "instagram", "linkedin"] as const;
export type Reseau = (typeof RESEAUX)[number];
export type Fournisseur = "meta" | "linkedin";

export const LIBELLE_RESEAU: Record<Reseau, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export function fournisseurDuReseau(reseau: Reseau): Fournisseur {
  return reseau === "linkedin" ? "linkedin" : "meta";
}

export function estReseau(valeur: unknown): valeur is Reseau {
  return typeof valeur === "string" && (RESEAUX as readonly string[]).includes(valeur);
}

export const STATUTS_PUBLICATION = [
  { cle: "idee", libelle: "Idée", couleur: "#8b8f96" },
  { cle: "brouillon", libelle: "Brouillon", couleur: "#585b5e" },
  { cle: "a_valider", libelle: "À valider", couleur: "#b8792e" },
  { cle: "valide", libelle: "Validé", couleur: "#2f6b8f" },
  { cle: "programme", libelle: "Programmé", couleur: "#5b4b9a" },
  { cle: "publication_en_cours", libelle: "Publication en cours", couleur: "#5b4b9a" },
  { cle: "publie", libelle: "Publié", couleur: "#2f6b47" },
  { cle: "partiel", libelle: "Échec partiel", couleur: "#a64b45" },
  { cle: "echec", libelle: "Échec", couleur: "#a64b45" },
  { cle: "annule", libelle: "Annulé", couleur: "#adaeb0" },
] as const;
export type StatutPublication = (typeof STATUTS_PUBLICATION)[number]["cle"];

export function statutPublication(cle: string) {
  return STATUTS_PUBLICATION.find((s) => s.cle === cle) ?? STATUTS_PUBLICATION[1];
}

// Produits ELSATIA. Une publication reste toujours rattachée à ELSATIA.
export const APPLICATIONS_ELSATIA = [
  { cle: "elsatia", libelle: "ELSATIA" },
  { cle: "gestion_pro", libelle: "ELSATIA Gestion Pro" },
  { cle: "tools", libelle: "ELSATIA Tools" },
  { cle: "colors", libelle: "ELSATIA Colors" },
  { cle: "studio", libelle: "ELSATIA Studio" },
  { cle: "reserves", libelle: "ELSATIA Réserves" },
] as const;
export type ApplicationElsatia = (typeof APPLICATIONS_ELSATIA)[number]["cle"];

export function libelleApplication(cle: string) {
  return APPLICATIONS_ELSATIA.find((a) => a.cle === cle)?.libelle ?? "ELSATIA";
}

export type Publication = {
  id: string;
  titre: string;
  contenu_principal: string;
  contenu_facebook: string | null;
  contenu_instagram: string | null;
  contenu_linkedin: string | null;
  lien_url: string | null;
  application: ApplicationElsatia;
  reseaux: Reseau[];
  statut: StatutPublication;
  programme_at: string | null;
  soumis_at: string | null;
  soumis_par: string | null;
  approuve_at: string | null;
  approuve_par: string | null;
  empreinte_validee: string | null;
  commentaire_validation: string | null;
  publie_at: string | null;
  cree_par: string;
  modifie_par: string | null;
  created_at: string;
  updated_at: string;
};

export type Media = {
  id: string;
  type: "image" | "video";
  chemin_objet: string;
  mime_type: string;
  nom_original: string;
  taille_octets: number;
  largeur: number | null;
  hauteur: number | null;
  duree_secondes: number | null;
  texte_alternatif: string | null;
};

export type Cible = {
  id: string;
  publication_id: string;
  reseau: Reseau;
  compte_id: string | null;
  statut: "en_attente" | "en_cours" | "publie" | "simule" | "echec" | "annule";
  cle_idempotence: string;
  external_post_id: string | null;
  external_url: string | null;
  external_conteneur_id: string | null;
  tentatives: number;
  prochaine_tentative_at: string | null;
  publie_at: string | null;
  erreur: string | null;
  erreur_code: string | null;
};

export type CompteSocial = {
  id: string;
  fournisseur: Fournisseur;
  reseau: Reseau;
  nom_compte: string;
  external_account_id: string;
  external_parent_id: string | null;
  nom_utilisateur: string | null;
  statut: "connecte" | "a_reconnecter" | "expire" | "revoque" | "erreur";
  scopes: string[];
  connected_at: string;
  connecte_par: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  data_access_expires_at: string | null;
  derniere_verification_at: string | null;
  derniere_erreur: string | null;
  dernier_diagnostic?: { date: string; ok: boolean; identite: { nom: string | null; idExterne: string; lien: string | null }; permissions: string[]; expiration: { jeton: string | null; accesDonnees: string | null }; etapes: Array<{ libelle: string; ok: boolean; detail: string }> } | null;
};
