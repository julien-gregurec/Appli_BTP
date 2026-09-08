const RISQUE_FORMULE = /^\s*[=+\-@]/;

export function celluleCsvColors(valeur: unknown): string {
  let texte = String(valeur ?? "");
  if (typeof valeur !== "number" && RISQUE_FORMULE.test(texte)) texte = `'${texte}`;
  return `"${texte.replaceAll('"', '""')}"`;
}
