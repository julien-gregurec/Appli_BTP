import type { Identite } from "./base-locale";

/**
 * Pointeur vers la dernière identité connectée sur cet appareil.
 *
 * Hors ligne, la coquille de repli ne peut interroger personne : elle doit pourtant
 * savoir QUELLE base IndexedDB ouvrir. Ce pointeur ne contient que deux identifiants
 * d'organisation et d'utilisateur — aucun jeton, aucun secret, aucune donnée de chantier.
 *
 * C'est le seul usage de `localStorage` dans tout le lot, et il est délibéré : deux uuid
 * tiennent en 80 octets, doivent être lus SYNCHRONEMENT au tout premier rendu de la
 * coquille, et n'ont aucune valeur exploitable pour un tiers. Les données, elles — photos
 * comprises — ne passent jamais par là : elles vivent dans IndexedDB.
 *
 * Le pointeur est effacé à la déconnexion : après elle, la coquille hors-ligne n'ouvre
 * plus aucune base, et rien de l'organisation précédente n'est affichable.
 */
const CLE = "elsatia-reserves::identite";

export function memoriserIdentiteLocale(identite: Identite): void {
  try {
    localStorage.setItem(CLE, `${identite.entrepriseId}:${identite.utilisateurId}`);
  } catch { /* stockage refusé : la coquille hors-ligne sera simplement vide */ }
}

export function lireIdentiteLocale(): Identite | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const [entrepriseId, utilisateurId] = brut.split(":");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(entrepriseId ?? "") || !uuid.test(utilisateurId ?? "")) return null;
    return { entrepriseId, utilisateurId };
  } catch {
    return null;
  }
}

export function oublierIdentiteLocale(): void {
  try { localStorage.removeItem(CLE); } catch { /* rien à faire */ }
}
