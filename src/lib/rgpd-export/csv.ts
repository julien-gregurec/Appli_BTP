// CSV (RFC 4180, séparateur « ; » pour les tableurs français, UTF-8 avec BOM), en flux.
// Neutralise l'injection de formules : une cellule commençant par = + - @ (ou tabulation / retour)
// est préfixée d'une apostrophe, pour qu'un tableur ne l'exécute jamais.

const SEPARATEUR = ";";

export function celluleCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  let texte = typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur);
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function ligneCsv(valeurs: unknown[]): string {
  return valeurs.map(celluleCsv).join(SEPARATEUR) + "\r\n";
}

/** Colonnes d'une section : clés de la première ligne (une table a les mêmes clés partout ; le JSON fait foi). */
export class ColonnesCsv {
  readonly colonnes: string[];
  constructor(premiere: Record<string, unknown>) {
    this.colonnes = Object.keys(premiere);
  }
  ligne(objet: Record<string, unknown>): string {
    return ligneCsv(this.colonnes.map((c) => objet[c]));
  }
  entete(): string {
    return "﻿" + ligneCsv(this.colonnes);
  }
}
