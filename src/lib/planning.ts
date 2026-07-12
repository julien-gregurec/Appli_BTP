export const PLANNING_TYPES = [
  { cle: "intervention", libelle: "Intervention" },
  { cle: "rdv_client", libelle: "RDV client" },
  { cle: "livraison", libelle: "Livraison" },
  { cle: "controle", libelle: "Contrôle" },
  { cle: "absence", libelle: "Absence" },
  { cle: "autre", libelle: "Autre" },
] as const;

export const PLANNING_STATUTS = [
  { cle: "planifie", libelle: "Planifié", couleur: "#8b8f96" },
  { cle: "confirme", libelle: "Confirmé", couleur: "#2c5a8c" },
  { cle: "en_cours", libelle: "En cours", couleur: "#b8792e" },
  { cle: "termine", libelle: "Terminé", couleur: "#2f6b47" },
  { cle: "annule", libelle: "Annulé", couleur: "#a64b45" },
] as const;

export function statutPlanning(cle: string) {
  return PLANNING_STATUTS.find((s) => s.cle === cle) ?? PLANNING_STATUTS[0];
}

export function typePlanningLabel(cle: string) {
  return PLANNING_TYPES.find((t) => t.cle === cle)?.libelle ?? cle;
}

export function lundiDeLaSemaine(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatHeure(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatJourCourt(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
