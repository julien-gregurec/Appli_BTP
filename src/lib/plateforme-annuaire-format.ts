/**
 * Mises en forme partagées par l'annuaire, sa fiche et son export.
 *
 * Regroupées ici pour qu'un montant s'écrive de la même façon à l'écran et
 * dans le fichier exporté, et pour qu'« absent » et « non calculable » ne se
 * confondent jamais : « — » signale une donnée vide, « Non disponible » une
 * donnée que la plateforme ne sait pas produire.
 */

export const MENTION_NON_DISPONIBLE = "Non disponible";
export const MENTION_VIDE = "—";

export function montantHT(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return MENTION_NON_DISPONIBLE;
  return `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function montantCompact(valeur: number | null | undefined): string {
  if (valeur === null || valeur === undefined) return MENTION_NON_DISPONIBLE;
  return `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

export function dateCourte(valeur: string | null | undefined): string {
  if (!valeur) return MENTION_VIDE;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return MENTION_VIDE;
  return date.toLocaleDateString("fr-FR");
}

export function dateHeure(valeur: string | null | undefined): string {
  if (!valeur) return MENTION_VIDE;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return MENTION_VIDE;
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** « il y a 3 jours », « dans 12 jours » — pour les échéances et l'activité. */
export function delaiRelatif(valeur: string | null | undefined, maintenant: Date): string {
  if (!valeur) return MENTION_VIDE;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return MENTION_VIDE;
  const jours = Math.round((date.getTime() - maintenant.getTime()) / 86_400_000);
  if (jours === 0) return "aujourd'hui";
  if (jours > 0) return `dans ${jours} j`;
  return `il y a ${Math.abs(jours)} j`;
}

export function texteOuVide(valeur: string | null | undefined): string {
  return valeur && valeur.trim().length > 0 ? valeur : MENTION_VIDE;
}
