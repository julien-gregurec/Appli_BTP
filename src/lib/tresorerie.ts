export type FluxTresorerie = { date: string; montant: number; type: "entree" | "sortie" };
export type SemaineTresorerie = { index: number; debut: Date; fin: Date; entrees: number; sorties: number; detailsEntrees: number; detailsSorties: number; net: number; cumul: number };

const JOUR = 86_400_000;
export function projectionHebdomadaire(flux: FluxTresorerie[], dateReference: string, nombreSemaines = 13): SemaineTresorerie[] {
  const reference = new Date(`${dateReference}T12:00:00`);
  const semaines = Array.from({ length: nombreSemaines }, (_, index) => {
    const debut = new Date(reference.getTime() + index * 7 * JOUR);
    return { index, debut, fin: new Date(debut.getTime() + 6 * JOUR), entrees: 0, sorties: 0, detailsEntrees: 0, detailsSorties: 0 };
  });
  for (const item of flux) {
    const date = Date.parse(`${item.date}T12:00:00`);
    if (!Number.isFinite(date) || !Number.isFinite(item.montant) || item.montant <= 0) continue;
    const ecart = Math.floor((date - reference.getTime()) / (7 * JOUR));
    if (ecart >= nombreSemaines) continue;
    const semaine = semaines[Math.max(0, ecart)];
    if (item.type === "entree") { semaine.entrees += item.montant; semaine.detailsEntrees += 1; }
    else { semaine.sorties += item.montant; semaine.detailsSorties += 1; }
  }
  let cumul = 0;
  return semaines.map((semaine) => { const net = semaine.entrees - semaine.sorties; cumul += net; return { ...semaine, net, cumul }; });
}
