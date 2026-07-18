export type ModeleRolePredefini = {
  cle: string;
  nom: string;
  description: string;
  ordre: number;
  permissions: string[];
  tous_les_droits: boolean;
};

const PREFIXES_PERMISSIONS_CONFIGURABLES = [
  "acces_",
  "gerer_",
  "voir_",
  "saisir_",
  "effectuer_",
  "demander_",
  "valider_",
  "desactiver_",
  "utiliser_",
  "preparer_",
  "executer_",
];

export function estPermissionConfigurable(cle: string) {
  return PREFIXES_PERMISSIONS_CONFIGURABLES.some((prefixe) => cle.startsWith(prefixe));
}

export function categoriePermission(cle: string) {
  if (cle.startsWith("acces_")) return { libelle: "Consulter", classes: "bg-blue-100 text-blue-800" };
  if (cle.startsWith("gerer_")) return { libelle: "Gérer", classes: "bg-amber-100 text-amber-800" };
  if (cle.startsWith("voir_")) return { libelle: "Chiffres", classes: "bg-violet-100 text-violet-800" };
  if (cle.startsWith("preparer_")) return { libelle: "Préparer", classes: "bg-sky-100 text-sky-800" };
  if (cle.startsWith("valider_")) return { libelle: "Valider", classes: "bg-orange-100 text-orange-800" };
  if (cle.startsWith("executer_")) return { libelle: "Exécuter", classes: "bg-red-100 text-red-800" };
  if (cle.startsWith("effectuer_")) return { libelle: "Action", classes: "bg-cyan-100 text-cyan-800" };
  return { libelle: "Personnel", classes: "bg-green-100 text-green-800" };
}

export function normaliserNomRole(nom: string) {
  return nom.trim().toLocaleLowerCase("fr-FR").replaceAll("'", "’");
}
