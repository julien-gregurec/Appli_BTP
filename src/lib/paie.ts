export const STATUTS_PERIODE_PAIE = {
  brouillon: "Brouillon",
  saisie_en_cours: "Saisie en cours",
  a_controler: "À contrôler",
  validee: "Validée",
  transmise_comptable: "Transmise au comptable",
  verrouillee: "Verrouillée",
} as const;

export const STATUTS_DOSSIER_PAIE = {
  brouillon: "Brouillon",
  saisie_en_cours: "Saisie en cours",
  a_controler: "À contrôler",
  correction_demandee: "Correction demandée",
  valide: "Validé",
  refuse: "Refusé",
  exporte: "Exporté",
  verrouille: "Verrouillé",
} as const;

export const CATEGORIES_TEMPS_PAIE = [
  ["normales", "Heures normales"], ["sup_25", "Heures supplémentaires 25 %"],
  ["sup_50", "Heures supplémentaires 50 %"], ["sup_autre", "Heures supplémentaires autre taux"],
  ["nuit", "Heures de nuit"], ["dimanche", "Dimanche"], ["ferie", "Jour férié"],
  ["astreinte", "Astreinte"], ["trajet_travail", "Temps de trajet travaillé"],
  ["repos_acquis", "Repos acquis"], ["repos_pris", "Repos pris"],
] as const;

export const TYPES_ABSENCE_PAIE = [
  ["conges_payes", "Congés payés"], ["sans_solde", "Absence sans solde"],
  ["maladie", "Maladie"], ["accident_travail", "Accident du travail"],
  ["accident_trajet", "Accident de trajet"], ["maternite", "Maternité"],
  ["paternite", "Paternité"], ["evenement_familial", "Événement familial"],
  ["formation", "Formation"], ["intemperie", "Intempérie"], ["autre", "Autre"],
] as const;

export const TYPES_PRIME_PAIE = [
  ["rendement", "Prime de rendement"], ["anciennete", "Prime d’ancienneté"],
  ["exceptionnelle", "Prime exceptionnelle"], ["objectif", "Prime sur objectif"],
  ["astreinte", "Prime d’astreinte"], ["nuit", "Prime de nuit"],
  ["dimanche", "Prime de dimanche"], ["ferie", "Prime de jour férié"], ["autre", "Autre prime"],
] as const;

export const TYPES_INDEMNITE_PAIE = [
  ["panier_repas", "Panier repas"], ["indemnite_trajet", "Indemnité de trajet"],
  ["indemnite_transport", "Indemnité de transport"], ["petit_deplacement", "Petit déplacement"],
  ["grand_deplacement", "Grand déplacement"], ["kilometrage", "Indemnité kilométrique"],
  ["train", "Train"], ["avion", "Avion"], ["taxi", "Taxi"],
  ["peage", "Péage"], ["stationnement", "Stationnement"], ["note_frais", "Note de frais validée"],
] as const;

export function bornesMois(mois: string) {
  if (!/^\d{4}-\d{2}$/.test(mois)) throw new Error("Mois invalide");
  const [annee, numero] = mois.split("-").map(Number);
  if (numero < 1 || numero > 12) throw new Error("Mois invalide");
  const debut = `${annee}-${String(numero).padStart(2, "0")}-01`;
  const fin = new Date(Date.UTC(annee, numero, 0)).toISOString().slice(0, 10);
  return { debut, fin, mois: debut };
}

export function montantIndemnite(quantite: number, tarif: number) {
  if (!Number.isFinite(quantite) || !Number.isFinite(tarif) || quantite < 0 || tarif < 0) return 0;
  return Math.round(quantite * tarif * 100) / 100;
}

export function formaterMois(mois: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mois.slice(0, 7)}-01T12:00:00Z`));
}

export function statutPeriodePaie(statut: string) {
  return STATUTS_PERIODE_PAIE[statut as keyof typeof STATUTS_PERIODE_PAIE] ?? statut;
}

export function estPeriodePaieModifiable(statut: string) {
  return ["brouillon", "saisie_en_cours", "a_controler"].includes(statut);
}
