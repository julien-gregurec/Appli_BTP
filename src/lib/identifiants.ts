export function prefixeIdentifiantEntreprise(nom: string): string {
  const normalise = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);

  return normalise ? normalise.padEnd(3, "X") : "DEP";
}
