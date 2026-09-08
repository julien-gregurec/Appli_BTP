import type { PeriodiciteAbonnement } from "@/lib/commercial/catalogue";
import type {
  CibleRemise,
  ConflitRemise,
  DureeRemise,
  EtatRemise,
  PerimetreRemise,
  Remise,
  TypeRemiseCommerciale,
} from "@/lib/commercial/types";

/**
 * Modèle de remise commerciale individuelle (§8 à §12 du lot).
 *
 * Une remise ne modifie JAMAIS le tarif public : elle est un avantage attaché à
 * un client, à un périmètre, pour une durée. Elle ne modifie jamais non plus une
 * facture déjà émise — le moteur ne calcule que des échéances à venir.
 *
 * Tout est pur et déterministe : aucune lecture d'horloge, aucune I/O. La date
 * d'évaluation est toujours passée explicitement.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Dates (ISO `YYYY-MM-DD`, arithmétique en UTC, sans dépendance)
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function estDateIso(valeur: string): boolean {
  if (!FORMAT_DATE.test(valeur)) return false;
  const [a, m, j] = valeur.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

function versIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Ajoute `n` mois en calant sur le dernier jour du mois cible quand le quantième
 * n'existe pas (31 janvier + 1 mois = 28/29 février), comme le fait un cycle de
 * facturation Stripe.
 */
export function ajouterMois(date: string, n: number): string {
  const [a, m, j] = date.split("-").map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  return versIso(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), Math.min(j, dernierJour)));
}

/** Nombre de mois que dure une échéance selon la périodicité. */
export function moisParEcheance(periodicite: PeriodiciteAbonnement): number {
  return periodicite === "annuel" ? 12 : 1;
}

export function debutEcheance(debutContrat: string, index: number, periodicite: PeriodiciteAbonnement): string {
  return ajouterMois(debutContrat, (index - 1) * moisParEcheance(periodicite));
}

// ─────────────────────────────────────────────────────────────────────────────
// Bornes et état
// ─────────────────────────────────────────────────────────────────────────────

export function debutRemise(remise: Remise): string {
  return remise.duree.debut;
}

/**
 * Fin EXCLUE de la remise (première date à laquelle elle ne s'applique plus),
 * ou `null` si elle n'a pas de fin programmée.
 *
 * `une_echeance` et `nb_echeances` se comptent en ÉCHÉANCES DE FACTURATION, pas
 * en mois : sur un abonnement annuel, « 2 échéances » = 2 années. C'est
 * volontaire et c'est la raison pour laquelle `validerRemise` refuse les durées
 * exprimées en échéances sur un abonnement annuel sans confirmation explicite
 * (§11 : aucune interprétation implicite de « deux mois » sur de l'annuel).
 */
export function finRemise(remise: Remise, periodicite: PeriodiciteAbonnement): string | null {
  const duree: DureeRemise = remise.duree;
  const pas = moisParEcheance(periodicite);
  switch (duree.mode) {
    case "une_echeance":
      return ajouterMois(duree.debut, pas);
    case "nb_echeances":
      return ajouterMois(duree.debut, pas * Math.max(1, Math.trunc(duree.nombre)));
    case "dates":
      return duree.fin;
    case "jusqu_a_revocation":
    case "permanente":
      return null;
  }
}

/**
 * État EFFECTIF de la remise à une date. Un état terminal déclaré (révoquée,
 * remplacée, annulée) prime toujours : il ne se « réactive » jamais.
 */
export function resoudreEtatRemise(
  remise: Remise,
  date: string,
  periodicite: PeriodiciteAbonnement,
): EtatRemise {
  if (remise.etat === "revoquee" || remise.etat === "remplacee" || remise.etat === "annulee") {
    return remise.etat;
  }
  const debut = debutRemise(remise);
  if (date < debut) return "programmee";
  const fin = finRemise(remise, periodicite);
  if (fin !== null && date >= fin) return "expiree";
  return "active";
}

export function remiseActiveA(remise: Remise, date: string, periodicite: PeriodiciteAbonnement): boolean {
  return resoudreEtatRemise(remise, date, periodicite) === "active";
}

/**
 * Date de retour au tarif normal : première date à laquelle la remise ne
 * s'applique plus. `null` = pas de retour programmé (permanente ou jusqu'à
 * révocation) — l'interface doit alors le dire explicitement, jamais laisser
 * croire à une fin.
 */
export function dateRetourTarifNormal(remise: Remise, periodicite: PeriodiciteAbonnement): string | null {
  if (remise.etat === "revoquee") return remise.revoqueeLe ?? null;
  return finRemise(remise, periodicite);
}

// ─────────────────────────────────────────────────────────────────────────────
// Périmètres et cumul (§12)
// ─────────────────────────────────────────────────────────────────────────────

/** Familles récurrentes couvertes par la cible `abonnement`. */
const CIBLES_RECURRENTES: readonly CibleRemise[] = ["forfait", "comptes", "modules", "stockage", "ia"] as const;

type Empreinte = { familles: Set<CibleRemise>; modules: Set<string> | "tous" | null; prestations: Set<string> | "toutes" | null };

function empreinte(perimetre: PerimetreRemise): Empreinte {
  const familles = new Set<CibleRemise>();
  let modules: Empreinte["modules"] = null;
  let prestations: Empreinte["prestations"] = null;
  switch (perimetre.cible) {
    case "abonnement":
      for (const cible of CIBLES_RECURRENTES) familles.add(cible);
      modules = "tous";
      break;
    case "modules":
      familles.add("modules");
      modules = perimetre.cles && perimetre.cles.length > 0 ? new Set(perimetre.cles) : "tous";
      break;
    case "prestation":
      familles.add("prestation");
      prestations = perimetre.cles && perimetre.cles.length > 0 ? new Set(perimetre.cles) : "toutes";
      break;
    case "mise_en_service":
      familles.add("mise_en_service");
      break;
    default:
      familles.add(perimetre.cible);
  }
  return { familles, modules, prestations };
}

function ensemblesSeCroisent(a: Set<string> | "tous" | "toutes" | null, b: Set<string> | "tous" | "toutes" | null): boolean {
  if (a === null || b === null) return false;
  if (a === "tous" || a === "toutes" || b === "tous" || b === "toutes") return true;
  for (const valeur of a) if (b.has(valeur)) return true;
  return false;
}

/** Deux périmètres se recouvrent-ils, même partiellement ? */
export function perimetresSeRecouvrent(a: PerimetreRemise, b: PerimetreRemise): boolean {
  const ea = empreinte(a);
  const eb = empreinte(b);
  for (const famille of ea.familles) {
    if (!eb.familles.has(famille)) continue;
    if (famille === "modules") {
      if (ensemblesSeCroisent(ea.modules, eb.modules)) return true;
      continue;
    }
    if (famille === "prestation") {
      if (ensemblesSeCroisent(ea.prestations, eb.prestations)) return true;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Règles de cumul, volontairement restrictives (§12) :
 *
 *  1. Aucune superposition SILENCIEUSE : deux remises actives dont les périmètres
 *     se recouvrent sont en conflit par défaut.
 *  2. Le cumul n'est possible que si les DEUX remises le déclarent
 *     explicitement (`cumulAutorise`). L'interface demande alors confirmation.
 *  3. Un PRIX NÉGOCIÉ est toujours exclusif sur son périmètre : il fixe le prix
 *     final, donc rien ne peut s'y superposer, même avec `cumulAutorise`.
 */
export function detecterConflits(remises: readonly Remise[]): ConflitRemise[] {
  const conflits: ConflitRemise[] = [];
  for (let i = 0; i < remises.length; i += 1) {
    for (let j = i + 1; j < remises.length; j += 1) {
      const a = remises[i];
      const b = remises[j];
      if (!perimetresSeRecouvrent(a.perimetre, b.perimetre)) continue;
      if (a.type === "prix_negocie" || b.type === "prix_negocie") {
        conflits.push({
          remiseId: b.id,
          autreRemiseId: a.id,
          raison: "prix_negocie_exclusif",
          message: "Un prix négocié fixe le montant final de son périmètre : aucune autre remise ne peut s'y ajouter.",
        });
        continue;
      }
      if (!(a.cumulAutorise && b.cumulAutorise)) {
        conflits.push({
          remiseId: b.id,
          autreRemiseId: a.id,
          raison: "cumul_interdit",
          message: "Deux remises portent sur un périmètre commun. Le cumul doit être autorisé explicitement sur les deux.",
        });
      }
    }
  }
  return conflits;
}

/**
 * Ordre d'application déterministe : du périmètre le plus étroit au plus large,
 * puis `priorite` croissante, puis identifiant. Une remise globale s'applique
 * donc TOUJOURS après les remises ciblées, sur le reste à payer.
 */
const RANG_CIBLE: Record<CibleRemise, number> = {
  prestation: 0,
  mise_en_service: 1,
  ia: 2,
  stockage: 3,
  modules: 4,
  comptes: 5,
  forfait: 6,
  abonnement: 7,
};

export function ordonnerRemises(remises: readonly Remise[]): Remise[] {
  return [...remises].sort((a, b) => {
    const rang = RANG_CIBLE[a.perimetre.cible] - RANG_CIBLE[b.perimetre.cible];
    if (rang !== 0) return rang;
    const priorite = (a.priorite ?? 100) - (b.priorite ?? 100);
    if (priorite !== 0) return priorite;
    return a.id.localeCompare(b.id);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation (§11 : aucune configuration ambiguë ne doit pouvoir être créée)
// ─────────────────────────────────────────────────────────────────────────────

export type ErreurRemise = { champ: string; message: string };

export function validerRemise(
  remise: Remise,
  periodicite: PeriodiciteAbonnement,
  options: { ambiguiteAnnuelleConfirmee?: boolean } = {},
): ErreurRemise[] {
  const erreurs: ErreurRemise[] = [];

  if (!remise.motif || remise.motif.trim().length < 5) {
    erreurs.push({ champ: "motif", message: "Le motif est obligatoire (5 caractères minimum) et reste interne." });
  }

  if (!Number.isFinite(remise.valeur)) {
    erreurs.push({ champ: "valeur", message: "Valeur de remise invalide." });
  } else if (remise.type === "pourcentage") {
    if (remise.valeur <= 0 || remise.valeur > 100) {
      erreurs.push({ champ: "valeur", message: "Un pourcentage doit être strictement supérieur à 0 et au plus égal à 100." });
    }
  } else if (remise.type === "montant") {
    if (remise.valeur <= 0 || !Number.isInteger(remise.valeur)) {
      erreurs.push({ champ: "valeur", message: "Un montant déduit doit être un nombre entier de centimes strictement positif." });
    }
  } else if (remise.type === "prix_negocie") {
    if (remise.valeur < 0 || !Number.isInteger(remise.valeur)) {
      erreurs.push({ champ: "valeur", message: "Un prix négocié doit être un nombre entier de centimes positif ou nul." });
    }
  }

  if (!estDateIso(remise.duree.debut)) {
    erreurs.push({ champ: "duree.debut", message: "Date de début invalide (format attendu AAAA-MM-JJ)." });
  }
  if (remise.duree.mode === "dates") {
    if (!estDateIso(remise.duree.fin)) {
      erreurs.push({ champ: "duree.fin", message: "Date de fin invalide (format attendu AAAA-MM-JJ)." });
    } else if (remise.duree.fin <= remise.duree.debut) {
      erreurs.push({ champ: "duree.fin", message: "La date de fin doit être postérieure à la date de début." });
    }
  }
  if (remise.duree.mode === "nb_echeances" && (!Number.isInteger(remise.duree.nombre) || remise.duree.nombre < 1)) {
    erreurs.push({ champ: "duree.nombre", message: "Le nombre d'échéances doit être un entier supérieur ou égal à 1." });
  }

  // §11 — sur un abonnement annuel, « N échéances » vaut N ANNÉES. Une remise
  // pensée « pendant 2 mois » y serait silencieusement transformée en 2 ans.
  // On refuse tant que l'administrateur n'a pas confirmé l'interprétation, ou
  // qu'il n'a pas choisi une forme non ambiguë (pourcentage sur la période,
  // montant fixe, dates explicites).
  if (
    periodicite === "annuel"
    && (remise.duree.mode === "une_echeance" || remise.duree.mode === "nb_echeances")
    && !options.ambiguiteAnnuelleConfirmee
  ) {
    erreurs.push({
      champ: "duree.mode",
      message:
        "Sur un abonnement annuel, une durée exprimée en échéances vaut des ANNÉES. "
        + "Choisissez des dates explicites, ou confirmez que l'échéance annuelle est bien voulue.",
    });
  }

  if (remise.perimetre.cible === "prestation" && (!remise.perimetre.cles || remise.perimetre.cles.length === 0)) {
    erreurs.push({ champ: "perimetre.cles", message: "Une remise sur prestation doit désigner la prestation concernée." });
  }

  return erreurs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Libellés (interface et journalisation)
// ─────────────────────────────────────────────────────────────────────────────

export const LIBELLE_TYPE_REMISE: Record<TypeRemiseCommerciale, string> = {
  pourcentage: "Remise en pourcentage",
  montant: "Montant fixe déduit",
  prix_negocie: "Prix négocié fixe",
};

export const EXPLICATION_TYPE_REMISE: Record<TypeRemiseCommerciale, string> = {
  pourcentage:
    "La réduction suit le tarif public : si le tarif public augmente, la réduction s'applique au nouveau prix et le montant payé augmente.",
  montant:
    "Une somme fixe est déduite à chaque échéance. Si le tarif public augmente, le montant déduit ne change pas.",
  prix_negocie:
    "Le prix payé est figé : il ne bouge pas si le tarif public évolue, jusqu'à la date de fin ou la révocation.",
};

export const LIBELLE_CIBLE_REMISE: Record<CibleRemise, string> = {
  abonnement: "Abonnement complet",
  forfait: "Forfait de base",
  comptes: "Comptes supplémentaires",
  modules: "Modules",
  stockage: "Stockage",
  ia: "IA",
  mise_en_service: "Frais de mise en service",
  prestation: "Prestation ponctuelle",
};

export const LIBELLES_MODE_DUREE: Record<DureeRemise["mode"], string> = {
  une_echeance: "Une seule échéance",
  nb_echeances: "Nombre défini d'échéances",
  dates: "Dates de début et de fin",
  jusqu_a_revocation: "Jusqu'à révocation",
  permanente: "Permanente (sans date de fin)",
};

export const LIBELLE_ETAT_REMISE: Record<EtatRemise, string> = {
  programmee: "Programmée",
  active: "Active",
  expiree: "Expirée",
  revoquee: "Révoquée",
  remplacee: "Remplacée",
  annulee: "Annulée",
};
