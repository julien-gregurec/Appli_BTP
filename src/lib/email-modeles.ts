/**
 * Modèles d'e-mail (GP V1, lot G) — module PUR.
 *
 * Un modèle = un objet et un corps avec des variables entre accolades. Les variables inconnues
 * restent telles quelles (jamais de valeur inventée) ; une variable connue mais vide devient « ».
 */

export type ModeleEmail = { id: string; nom: string; typeDocument: "devis" | "facture" | "tous"; objet: string; corps: string; parDefaut: boolean };

export type VariablesEmail = {
  numero: string;
  client: string;
  montant_ttc: string;
  entreprise: string;
  prenom: string;
  date_validite?: string | null;
  date_echeance?: string | null;
  chantier?: string | null;
  reference_client?: string | null;
};

export const VARIABLES_EMAIL: ReadonlyArray<{ cle: keyof VariablesEmail; libelle: string }> = [
  { cle: "numero", libelle: "Numéro du document" },
  { cle: "client", libelle: "Nom du client" },
  { cle: "montant_ttc", libelle: "Montant TTC" },
  { cle: "entreprise", libelle: "Nom de l’entreprise" },
  { cle: "prenom", libelle: "Prénom de l’expéditeur" },
  { cle: "date_validite", libelle: "Date de validité (devis)" },
  { cle: "date_echeance", libelle: "Date d’échéance (facture)" },
  { cle: "chantier", libelle: "Nom du chantier" },
  { cle: "reference_client", libelle: "Référence du client" },
];

const CLES = new Set<string>(VARIABLES_EMAIL.map((v) => v.cle));

/** Remplace `{variable}` par sa valeur ; espaces tolérés (`{ numero }`). */
export function appliquerVariables(texte: string, variables: VariablesEmail): string {
  return texte.replace(/\{\s*([a-z_]+)\s*\}/g, (tout, cle: string) => {
    if (!CLES.has(cle)) return tout;
    const v = variables[cle as keyof VariablesEmail];
    return v === null || v === undefined ? "" : String(v);
  });
}

export function appliquerModele(modele: Pick<ModeleEmail, "objet" | "corps">, variables: VariablesEmail): { objet: string; corps: string } {
  return { objet: appliquerVariables(modele.objet, variables).trim(), corps: appliquerVariables(modele.corps, variables) };
}

/** Modèles utilisables pour un type de document, le modèle par défaut du type en tête, puis « tous ». */
export function modelesPour(modeles: readonly ModeleEmail[], typeDocument: "devis" | "facture"): ModeleEmail[] {
  const retenus = modeles.filter((m) => m.typeDocument === typeDocument || m.typeDocument === "tous");
  const rang = (m: ModeleEmail) => (m.parDefaut && m.typeDocument === typeDocument ? 0 : m.typeDocument === typeDocument ? 1 : m.parDefaut ? 2 : 3);
  return [...retenus].sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, "fr"));
}

/** Adresses saisies « a@x, b@y ; c@z » → liste nettoyée, sans doublon, en minuscules. */
export function listeAdresses(saisie: string | null | undefined): string[] {
  if (!saisie) return [];
  const vues = new Set<string>();
  return saisie.split(/[,;\n]/).map((a) => a.trim().toLowerCase()).filter((a) => a && !vues.has(a) && vues.add(a));
}
