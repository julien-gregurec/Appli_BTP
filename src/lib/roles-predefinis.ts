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

/**
 * Droits du circuit comptable des notes de frais, rendus configurables par CLÉ EXACTE.
 *
 * Ils n'avaient aucun préfixe reconnu : l'écran d'accès les masquait, et comme l'enregistrement
 * d'un poste réécrit TOUTES les clés du catalogue (une clé absente du formulaire devient
 * « non autorisée »), enregistrer un poste d'expert-comptable depuis l'écran lui retirait
 * silencieusement ses droits comptables. Des clés exactes, et non des préfixes : `exporter_`
 * exposerait aussi `exporter_paie`, qui n'a rien à faire ici.
 */
const PERMISSIONS_COMPTABLES_NOTES_FRAIS = new Set([
  "verifier_notes_frais",
  "comptabiliser_notes_frais",
  "exporter_notes_frais",
  "consulter_audit_notes_frais",
]);

export function estPermissionConfigurable(cle: string) {
  return PERMISSIONS_COMPTABLES_NOTES_FRAIS.has(cle)
    || PREFIXES_PERMISSIONS_CONFIGURABLES.some((prefixe) => cle.startsWith(prefixe));
}

export function categoriePermission(cle: string) {
  if (cle.startsWith("acces_")) return { libelle: "Consulter", classes: "bg-blue-100 text-blue-800" };
  if (cle.startsWith("gerer_")) return { libelle: "Gérer", classes: "bg-amber-100 text-amber-800" };
  if (cle.startsWith("voir_")) return { libelle: "Chiffres", classes: "bg-violet-100 text-violet-800" };
  if (cle.startsWith("preparer_")) return { libelle: "Préparer", classes: "bg-sky-100 text-sky-800" };
  if (cle.startsWith("valider_")) return { libelle: "Valider", classes: "bg-orange-100 text-orange-800" };
  if (cle.startsWith("executer_")) return { libelle: "Exécuter", classes: "bg-red-100 text-red-800" };
  if (cle.startsWith("effectuer_")) return { libelle: "Action", classes: "bg-cyan-100 text-cyan-800" };
  if (cle === "verifier_notes_frais") return { libelle: "Contrôler", classes: "bg-orange-100 text-orange-800" };
  if (cle === "comptabiliser_notes_frais") return { libelle: "Comptabiliser", classes: "bg-teal-100 text-teal-800" };
  if (cle === "exporter_notes_frais") return { libelle: "Exporter", classes: "bg-sky-100 text-sky-800" };
  if (cle === "consulter_audit_notes_frais") return { libelle: "Journal", classes: "bg-slate-100 text-slate-800" };
  return { libelle: "Personnel", classes: "bg-green-100 text-green-800" };
}

export function normaliserNomRole(nom: string) {
  return nom.trim().toLocaleLowerCase("fr-FR").replaceAll("'", "’");
}
