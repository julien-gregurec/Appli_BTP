export const EMPLOYE_STATUTS = [
  { cle: "actif", libelle: "Actif", couleur: "#2f6b47" },
  { cle: "en_conge", libelle: "En congé", couleur: "#b8792e" },
  { cle: "sorti", libelle: "Sorti", couleur: "#8b8f96" },
  { cle: "suspendu", libelle: "Suspendu", couleur: "#a64b45" },
] as const;

export const EMPLOYE_CONTRATS = [
  { cle: "cdi", libelle: "CDI" },
  { cle: "cdd", libelle: "CDD" },
  { cle: "interim", libelle: "Intérim" },
  { cle: "apprenti", libelle: "Apprenti" },
  { cle: "stage", libelle: "Stage" },
  { cle: "freelance", libelle: "Freelance" },
  { cle: "autre", libelle: "Autre" },
] as const;

export function statutEmploye(cle: string) {
  return EMPLOYE_STATUTS.find((s) => s.cle === cle) ?? EMPLOYE_STATUTS[0];
}

export function contratEmployeLabel(cle: string) {
  return EMPLOYE_CONTRATS.find((c) => c.cle === cle)?.libelle ?? cle;
}

export function nomEmploye(e: { prenom?: string | null; nom?: string | null }) {
  return [e.prenom, e.nom].filter(Boolean).join(" ") || "(sans nom)";
}

export function formatEuro(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const nombre = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(nombre)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(nombre);
}

export function formatDateFr(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T12:00:00`));
}
