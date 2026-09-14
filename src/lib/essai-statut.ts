/**
 * Statut de la période d'essai pour l'AFFICHAGE (bandeau, carte du tableau de bord, barre latérale) —
 * module PUR, testé sans base.
 *
 * SOURCE DE VÉRITÉ (jamais une valeur du navigateur) : le contexte entreprise résolu côté serveur par
 * `getContexteEntreprise()` depuis la RPC `contexte_abonnement_courant` — colonnes `abonnement_statut`,
 * `abonnement_essai_debut`, `abonnement_essai_fin` de `entreprises`. La fin effective est celle du
 * socle (`finEssaiEffective` : `abonnement_essai_fin`, à défaut début + 30 jours).
 *
 * FUSEAU : convention produit = calendrier de Paris. L'essai court jusqu'à la fin de la journée
 * `abonnement_essai_fin` (date sans heure) ; « aujourd'hui » et « jours restants » sont comptés en jours
 * calendaires Europe/Paris, jamais en UTC (un client connecté à 00:30 le jour J ne doit pas voir « J-1 »
 * parce qu'il est encore la veille en UTC). Le blocage d'accès du socle (proxy) reste évalué sur
 * `fin T23:59:59.999Z`, soit 01:59 (été) / 00:59 (hiver) le lendemain à Paris : l'affichage annonce
 * « terminée » AVANT que l'accès ne soit coupé, jamais après.
 */
import { finEssaiEffective, type FenetreEssai } from "@/lib/acces-socle-essai";

export const FUSEAU_PRODUIT = "Europe/Paris";

export type NiveauEssai = "info" | "avertissement" | "renforce" | "fort" | "expire";

export type StatutEssai =
  | { etat: "sans_essai" }
  | { etat: "abonnement_actif" }
  | {
      etat: "essai";
      joursRestants: number;
      dateFin: string;
      dateFinLisible: string;
      niveau: Exclude<NiveauEssai, "expire">;
      titre: string;
      detail: string;
      /** Bandeau visible dans toute l'application (J-7 et moins). */
      bandeau: boolean;
    }
  | {
      etat: "expire";
      dateFin: string | null;
      dateFinLisible: string | null;
      niveau: "expire";
      titre: string;
      detail: string;
      bandeau: true;
    };

/** Jour calendaire (AAAA-MM-JJ) d'un instant dans le fuseau produit. */
export function jourCalendaire(instant: Date, fuseau: string = FUSEAU_PRODUIT): string {
  const parties = new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/** Écart en jours calendaires entre deux dates AAAA-MM-JJ (b − a). */
export function ecartJours(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
}

/** « 25 septembre 2026 » */
export function dateLisible(dateIso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${dateIso}T00:00:00.000Z`));
}

export function niveauPourJours(joursRestants: number): Exclude<NiveauEssai, "expire"> {
  if (joursRestants > 7) return "info";
  if (joursRestants >= 4) return "avertissement";
  if (joursRestants >= 2) return "renforce";
  return "fort";
}

export function titreEssai(joursRestants: number): string {
  if (joursRestants > 7) return `Période d’essai — ${joursRestants} jours restants`;
  if (joursRestants >= 2) return `Votre période d’essai se termine dans ${joursRestants} jours.`;
  if (joursRestants === 1) return "Votre période d’essai se termine demain.";
  return "Dernier jour de votre période d’essai.";
}

export function statutEssai(fenetre: FenetreEssai, maintenant: Date = new Date()): StatutEssai {
  const statut = fenetre.abonnementStatut ?? null;
  if (statut === "actif") return { etat: "abonnement_actif" };
  if (statut !== "essai") return { etat: "sans_essai" };
  const fin = finEssaiEffective(fenetre);
  if (!fin) return { etat: "sans_essai" };
  const joursRestants = ecartJours(jourCalendaire(maintenant), fin);
  const dateFinLisible = dateLisible(fin);
  if (joursRestants < 0) {
    return {
      etat: "expire", dateFin: fin, dateFinLisible, niveau: "expire", bandeau: true,
      titre: "Votre période d’essai est terminée.",
      detail: `Elle s’est terminée le ${dateFinLisible}. Vos données sont conservées ; choisissez une offre pour continuer à travailler.`,
    };
  }
  return {
    etat: "essai", joursRestants, dateFin: fin, dateFinLisible, niveau: niveauPourJours(joursRestants),
    titre: titreEssai(joursRestants),
    detail: `Votre essai se termine le ${dateFinLisible}.`,
    bandeau: joursRestants <= 7,
  };
}

/** Le bouton d'abonnement n'est proposé qu'aux profils qui peuvent souscrire (Dirigeant / Admin). */
export function ctaAbonnementVisible(statut: StatutEssai, peutSouscrire: boolean): boolean {
  return peutSouscrire && (statut.etat === "essai" || statut.etat === "expire");
}

/** Texte compact pour la zone « Entreprise active » de la barre latérale ; `null` si rien à dire. */
export function libelleCompactEssai(statut: StatutEssai): string | null {
  if (statut.etat === "expire") return "Essai terminé";
  if (statut.etat !== "essai") return null;
  if (statut.joursRestants === 0) return "Essai · dernier jour";
  return `Essai · ${statut.joursRestants} j restant${statut.joursRestants > 1 ? "s" : ""}`;
}
