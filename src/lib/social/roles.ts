// Matrice des rôles ELSATIA Social. La base applique en plus, par trigger,
// la règle critique : seuls Administrateur et Validateur autorisent une publication.

export const ROLES_SOCIAL = [
  { cle: "administrateur", libelle: "Administrateur" },
  { cle: "responsable_communication", libelle: "Responsable communication" },
  { cle: "editeur", libelle: "Éditeur" },
  { cle: "validateur", libelle: "Validateur" },
  { cle: "lecture", libelle: "Lecture seule" },
] as const;
export type RoleSocial = (typeof ROLES_SOCIAL)[number]["cle"];

export type ActionSocial =
  | "consulter"
  | "rediger" // créer, modifier, soumettre un brouillon, utiliser l'assistant IA
  | "televerser"
  | "planifier" // calendrier : déplacer une idée ou un brouillon, proposer une date
  | "valider" // autoriser une publication (ou la refuser)
  | "publier" // déclencher la publication d'un contenu validé
  | "preparer_reponse"
  | "envoyer_reponse" // valider puis envoyer une réponse publique ou privée
  | "synchroniser"
  | "gerer_comptes" // OAuth, révocation, rotation
  | "gerer_equipe"
  | "voir_journal";

const MATRICE: Record<RoleSocial, readonly ActionSocial[]> = {
  administrateur: ["consulter", "rediger", "televerser", "planifier", "valider", "publier", "preparer_reponse", "envoyer_reponse", "synchroniser", "gerer_comptes", "gerer_equipe", "voir_journal"],
  responsable_communication: ["consulter", "rediger", "televerser", "planifier", "preparer_reponse", "synchroniser", "voir_journal"],
  editeur: ["consulter", "rediger", "televerser", "planifier", "preparer_reponse"],
  validateur: ["consulter", "valider", "publier", "preparer_reponse", "envoyer_reponse", "synchroniser", "voir_journal"],
  lecture: ["consulter"],
};

export function estRoleSocial(valeur: unknown): valeur is RoleSocial {
  return typeof valeur === "string" && ROLES_SOCIAL.some((r) => r.cle === valeur);
}

export function peut(role: RoleSocial | null | undefined, action: ActionSocial): boolean {
  if (!role) return false;
  return MATRICE[role].includes(action);
}

export function libelleRole(role: string | null | undefined) {
  return ROLES_SOCIAL.find((r) => r.cle === role)?.libelle ?? "Aucun accès";
}
