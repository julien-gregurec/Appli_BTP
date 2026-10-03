import type { Cible, Publication, StatutPublication } from "@/lib/social/types";

// Workflow V1 obligatoire : Brouillon → Prévisualisation → Validation humaine → Publication.
// Fonctions pures (testées) ; la base applique les mêmes règles par trigger.

export type Transition = "soumettre" | "valider" | "refuser" | "programmer" | "deprogrammer" | "publier" | "annuler" | "remettre_en_brouillon";

const AUTORISEES: Record<Transition, readonly StatutPublication[]> = {
  soumettre: ["idee", "brouillon", "echec"],
  valider: ["a_valider"],
  refuser: ["a_valider", "valide", "programme"],
  programmer: ["valide"],
  deprogrammer: ["programme"],
  publier: ["valide", "programme", "echec", "partiel"],
  annuler: ["idee", "brouillon", "a_valider", "valide", "programme"],
  remettre_en_brouillon: ["idee", "a_valider", "valide", "programme", "echec", "annule"],
};

export function transitionPossible(statut: StatutPublication, transition: Transition): boolean {
  return AUTORISEES[transition].includes(statut);
}

/** Les statuts dans lesquels le contenu peut encore être modifié. */
export function estModifiable(statut: StatutPublication): boolean {
  return !["publication_en_cours", "publie", "partiel"].includes(statut);
}

export function peutEtrePublie(p: Pick<Publication, "statut" | "approuve_par" | "approuve_at" | "empreinte_validee" | "reseaux">, empreinteActuelle: string): { ok: true } | { ok: false; raison: string } {
  if (!transitionPossible(p.statut, "publier") && p.statut !== "publication_en_cours") return { ok: false, raison: "Cette publication n’est pas validée." };
  if (!p.approuve_par || !p.approuve_at || !p.empreinte_validee) return { ok: false, raison: "Validation humaine manquante." };
  if (p.empreinte_validee !== empreinteActuelle) return { ok: false, raison: "Le contenu a changé depuis la validation : une nouvelle validation est nécessaire." };
  if (p.reseaux.length === 0) return { ok: false, raison: "Aucun réseau cible." };
  return { ok: true };
}

/** Date de programmation acceptable : au moins 5 minutes dans le futur, au plus 6 mois. */
export function verifierDateProgrammation(date: Date, maintenant = new Date()): string | null {
  if (Number.isNaN(date.getTime())) return "Date de programmation invalide.";
  if (date.getTime() < maintenant.getTime() + 5 * 60_000) return "La date doit être au moins 5 minutes dans le futur.";
  if (date.getTime() > maintenant.getTime() + 183 * 86400_000) return "Programmation limitée à 6 mois.";
  return null;
}

/** Statut global d'une publication à partir de ses cibles actives. */
// Une simulation (dry-run) ne publie rien : la publication reste « Validé ».
export function calculerStatutPublication(cibles: Pick<Cible, "statut" | "prochaine_tentative_at">[]): StatutPublication | null {
  if (cibles.length === 0) return null;
  const n = (s: Cible["statut"]) => cibles.filter((c) => c.statut === s).length;
  const enCours = n("en_cours") + n("en_attente") + cibles.filter((c) => c.statut === "echec" && c.prochaine_tentative_at).length;
  if (enCours > 0) return "publication_en_cours";
  const publiees = n("publie");
  const echecs = n("echec");
  if (n("simule") === cibles.length) return "valide";
  if (publiees > 0 && echecs === 0) return "publie";
  if (publiees > 0 && echecs > 0) return "partiel";
  if (echecs > 0) return "echec";
  return null;
}

// Calendrier : seuls les contenus non validés se déplacent librement.
// Déplacer un contenu validé ou programmé conserve sa validation (le texte
// n'a pas changé) mais exige le droit « valider ».
export function deplacementCalendrier(statut: StatutPublication): "libre" | "validateur" | "interdit" {
  if (["idee", "brouillon", "a_valider"].includes(statut)) return "libre";
  if (["valide", "programme"].includes(statut)) return "validateur";
  return "interdit";
}
