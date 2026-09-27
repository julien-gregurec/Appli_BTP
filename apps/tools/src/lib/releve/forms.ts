/**
 * Conversions et messages des formulaires Relevé (saisie terrain) — fonctions pures.
 *
 * Le domaine stocke en millimètres ; le terrain saisit des hauteurs en centimètres
 * (« 250 ») et des altitudes en mètres (« 2,80 », virgule française acceptée).
 */
import {
  deletionImpact, deletionImpactText, RELEVE_LIMITS,
  type ReleveStructure, type StructureKind,
} from "@elsatia/releve-domain";

export type ParsedNumber = { ok: true; value: number | null } | { ok: false; message: string };

function parseDecimal(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** « 250 » (cm) → 2500 mm ; vide → null ; hors bornes serveur → message. */
export function parseHauteurCm(input: string): ParsedNumber {
  const value = parseDecimal(input);
  if (value === undefined) return { ok: false, message: "Hauteur en centimètres attendue (ex. 250)." };
  if (value === null) return { ok: true, value: null };
  const mm = Math.round(value * 10 * 10) / 10;
  if (mm < RELEVE_LIMITS.hauteurMinMm || mm > RELEVE_LIMITS.hauteurMaxMm) {
    return { ok: false, message: `Hauteur entre ${RELEVE_LIMITS.hauteurMinMm / 10} et ${RELEVE_LIMITS.hauteurMaxMm / 10} cm.` };
  }
  return { ok: true, value: mm };
}

export function formatHauteurCm(mm: number | null): string {
  return mm === null ? "" : String(Math.round(mm) / 10);
}

/** « 2,80 » (m) → 2800 mm ; vide → null. */
export function parseAltitudeM(input: string): ParsedNumber {
  const value = parseDecimal(input);
  if (value === undefined) return { ok: false, message: "Altitude en mètres attendue (ex. 2,80)." };
  if (value === null) return { ok: true, value: null };
  const mm = Math.round(value * 1000 * 10) / 10;
  if (Math.abs(mm) > 1_000_000) return { ok: false, message: "Altitude entre -1000 et 1000 m." };
  return { ok: true, value: mm };
}

export function formatAltitudeM(mm: number | null): string {
  return mm === null ? "" : String(Math.round(mm) / 1000).replace(".", ",");
}

/** Niveau entier saisi (« -1 », « 3 ») ; `null` si invalide. */
export function parseNiveau(input: string): number | null {
  const trimmed = input.trim();
  if (!/^-?\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= -10 && value <= 200 ? value : null;
}

/** Surface / volume calculés (futurs) : affichage en m² / m³, « — » tant que non calculés. */
export function formatSurfaceM2(mm2: number | null): string {
  return mm2 === null ? "—" : `${(mm2 / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²`;
}
export function formatVolumeM3(mm3: number | null): string {
  return mm3 === null ? "—" : `${(mm3 / 1_000_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m³`;
}

export const KIND_LABELS: Record<StructureKind, { article: string; nom: string }> = {
  chantier: { article: "le chantier", nom: "Chantier" }, batiment: { article: "le bâtiment", nom: "Bâtiment" },
  etage: { article: "l'étage", nom: "Étage" }, zone: { article: "la zone", nom: "Zone" }, piece: { article: "la pièce", nom: "Pièce" },
};

/**
 * Message de confirmation d'une suppression : ce qui part avec le nœud, et le rappel que
 * rien n'est détruit (corbeille du relevé, restauration possible).
 */
export function confirmRemovalMessage(structure: ReleveStructure, kind: StructureKind, id: string, nom: string): string {
  const impact = deletionImpactText(deletionImpact(structure, { kind, id }));
  return `Retirer ${KIND_LABELS[kind].article} « ${nom} » ? ${impact} Rien n'est détruit : tout reste restaurable depuis la corbeille du relevé.`;
}
