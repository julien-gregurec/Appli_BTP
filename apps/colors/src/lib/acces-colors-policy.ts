export type EntreesAccesColors = {
  authentifie: boolean;
  organisationAutorisee: boolean;
  utilisateurHabilite: boolean;
};

export type SortieAccesColors = "connexion" | "abonnement" | "habilitation" | "autorise";

export function evaluerAccesColors(entrees: EntreesAccesColors): SortieAccesColors {
  if (!entrees.authentifie) return "connexion";
  if (!entrees.organisationAutorisee) return "abonnement";
  if (!entrees.utilisateurHabilite) return "habilitation";
  return "autorise";
}
