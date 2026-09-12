/**
 * Historique des objets (`historique_objets`) — mise en forme, module PUR.
 *
 * La base écrit (déclencheurs et RPC SECURITY DEFINER), filtre la lecture selon le module de l'objet et
 * masque les entrées sensibles sans `voir_couts_devis`. Ce module ne fait que rendre chaque entrée
 * lisible : un libellé d'action, un libellé de champ, des valeurs avant / après.
 */

export type EntreeHistorique = {
  id: number;
  action: string;
  champ: string | null;
  avant: unknown;
  apres: unknown;
  sensible: boolean;
  creeLe: string;
  /** Nom affiché de l'auteur ; `null` pour une écriture système (migration, tâche planifiée). */
  auteur: string | null;
};

const ACTIONS: Record<string, string> = {
  creation: "Création",
  modification: "Modification",
  duplication: "Créé par duplication",
  archivage: "Archivé",
  reactivation: "Réactivé",
  statut_modifie: "Changement de statut",
  reference_attribuee: "Référence attribuée",
  reference_modifiee: "Référence modifiée",
  reference_retiree: "Référence retirée",
  code_fournisseur_ajoute: "Code distributeur ajouté",
  code_fournisseur_modifie: "Code distributeur modifié",
  code_fournisseur_retire: "Code distributeur retiré",
  prix_achat_modifie: "Prix d’achat",
  coefficient_modifie: "Coefficient",
  numero_attribue: "Numéro attribué",
  envoi: "Envoyé",
  pdf: "PDF généré",
};

const CHAMPS: Record<string, string> = {
  designation: "désignation",
  nom: "nom",
  prix_unitaire_ht: "prix de vente HT",
  prix_vente_ht: "prix de vente HT",
  prix_achat_ht: "prix d’achat HT",
  taux_tva: "TVA",
  unite: "unité",
  type: "nature",
  actif: "état",
  statut: "statut",
  famille_id: "famille",
  version_courante: "version",
  reference: "code article",
  reference_interne: "référence interne",
  reference_fabricant: "référence fabricant",
  reference_client: "référence client",
  reference_fournisseur: "référence fournisseur",
  code_barres: "code-barres",
  code_article_fournisseur: "code distributeur",
  coefficient: "coefficient",
};

export function libelleAction(action: string): string {
  return ACTIONS[action] ?? action.replace(/_/g, " ");
}

export function libelleChamp(champ: string | null): string | null {
  if (!champ) return null;
  return CHAMPS[champ] ?? champ.replace(/_/g, " ");
}

/** Valeur lisible d'un avant / après : texte, nombre, booléen ou objet simple. `—` pour une absence. */
export function valeurLisible(valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === "") return "—";
  if (typeof valeur === "boolean") return valeur ? "oui" : "non";
  if (typeof valeur === "number") return String(valeur).replace(".", ",");
  if (typeof valeur === "string") return /^-?\d+\.\d+$/.test(valeur) ? valeur.replace(".", ",") : valeur;
  if (typeof valeur === "object") {
    const o = valeur as Record<string, unknown>;
    if ("code" in o) return valeurLisible(o.code);
    if ("coefficient" in o) return `${valeurLisible(o.coefficient)} (${o.mode_prix === "calcule" ? "prix calculé" : "prix saisi"})`;
    if ("source_reference" in o || "source_id" in o) return o.source_reference ? `depuis ${String(o.source_reference)}` : "depuis un autre article";
    if ("libelle" in o) return valeurLisible(o.libelle);
    return JSON.stringify(o);
  }
  return String(valeur);
}

/** Une ligne de résumé : « Modification — prix de vente HT : 20,00 → 21,00 ». */
export function resumeEntree(e: Pick<EntreeHistorique, "action" | "champ" | "avant" | "apres">): string {
  const action = libelleAction(e.action);
  const champ = libelleChamp(e.champ);
  if (e.action === "creation" || e.action === "duplication") {
    const detail = valeurLisible(e.apres);
    return detail === "—" ? action : `${action} — ${detail}`;
  }
  const avant = valeurLisible(e.avant);
  const apres = valeurLisible(e.apres);
  const etiquette = champ && !["archivage", "reactivation"].includes(e.action) ? `${action} — ${champ}` : action;
  if (e.action === "archivage" || e.action === "reactivation") return etiquette;
  return `${etiquette} : ${avant} → ${apres}`;
}
