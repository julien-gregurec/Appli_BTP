import {
  estOffreAbonnement,
  estPeriodiciteAbonnement,
  OFFRES_ABONNEMENT_COMMERCIALISEES,
  type OffreAbonnement,
  type PeriodiciteAbonnement,
  type StripeSubscription,
} from "@/lib/stripe-abonnement";
import { offreTarifaireParCle } from "@/lib/tarification";

/**
 * ELSATIA-CAPACITY-STRIPE-R2 — logique pure (slice 1 : DB + lib + tests).
 *
 * Contrat commercial figé :
 *  - « capacité supplémentaire » = PERSONNE ACTIVE supplémentaire enregistrée dans
 *    Gestion Pro (R1 `entreprises.capacite_personnes_supplementaire`), PAS un
 *    compte Auth ni `compte_application_statut`.
 *  - UN Price unitaire par (plan, périodicité) × `quantity`. Les raccourcis UX
 *    +1 / +5 / +10 ne sont pas des Prices distincts.
 *  - Hausse : effet immédiat + prorata. Baisse : effet à fin de période.
 *  - Downgrade / impayé : aucune suppression de personne ; R1 dérive `over_capacity`.
 *  - Stripe TEST uniquement. Aucun appel Stripe dans ce module : il ne produit
 *    que des décisions et des payloads ; l'exécution HTTP est un lot séparé.
 *
 * Autorité métier = DB ELSATIA (R1). Stripe = représentation de facturation
 * synchronisée DB → Stripe. Un webhook ne doit jamais augmenter la capacité
 * depuis une quantité/metadata Stripe non sollicitée.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registre des Price IDs de capacité (allowlist serveur)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dette de nommage assumée : les variables historiques `STRIPE_PRICE_COMPTE_SUP_*`
 * représentent DÉSORMAIS le prix d'une personne active supplémentaire. On ne
 * renomme pas les variables d'environnement dans ce lot (rollout/rollback plus
 * risqués que la dette esthétique). `SEMANTIQUE_CAPACITE` documente le sens réel.
 */
export const SEMANTIQUE_CAPACITE = "capacite_personne_active" as const;

const VARIABLES_PRIX_CAPACITE: Partial<
  Record<OffreAbonnement, Record<PeriodiciteAbonnement, string>>
> = {
  mini: { mensuel: "STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_MINI_ANNUEL" },
  pro: { mensuel: "STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL" },
  business: { mensuel: "STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_BUSINESS_ANNUEL" },
  entreprise: { mensuel: "STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_ANNUEL" },
  // Offres historiques : mappées mais non commercialisées ; no-op si non configurées.
  essentiel: { mensuel: "STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_ANNUEL" },
  premium: { mensuel: "STRIPE_PRICE_COMPTE_SUP_PREMIUM_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_PREMIUM_ANNUEL" },
};

/** Nom de variable d'environnement du Price capacité pour (plan, périodicité). */
export function variablePrixCapacitePour(
  plan: OffreAbonnement,
  periodicite: PeriodiciteAbonnement,
): string | null {
  return VARIABLES_PRIX_CAPACITE[plan]?.[periodicite] ?? null;
}

/** Price ID de capacité configuré pour (plan, périodicité), ou null. */
export function prixCapacitePersonnePour(
  plan: OffreAbonnement,
  periodicite: PeriodiciteAbonnement,
  environnement: Record<string, string | undefined> = process.env,
): string | null {
  const variable = variablePrixCapacitePour(plan, periodicite);
  return variable ? environnement[variable] || null : null;
}

/**
 * Allowlist exhaustive des Price IDs capacité connus (tous plans × périodicités
 * configurés). Sert au classifieur : un item dont le Price n'est pas dans cette
 * liste n'est jamais adopté comme item de capacité.
 */
export function allowlistPrixCapacite(environnement: Record<string, string | undefined> = process.env): Set<string> {
  const ids = new Set<string>();
  for (const parPeriode of Object.values(VARIABLES_PRIX_CAPACITE)) {
    for (const variable of Object.values(parPeriode)) {
      const valeur = environnement[variable];
      if (valeur) ids.add(valeur);
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Classifieur d'items de subscription (jamais `items.data[0]`, jamais metadata client)
// ─────────────────────────────────────────────────────────────────────────────

export type ItemAbonnement = { id: string; quantity?: number; price?: { id?: string } };

export type ClassificationItems = {
  base: ItemAbonnement | null;
  capacite: ItemAbonnement | null;
  capaciteDupliquee: ItemAbonnement[];
  autres: ItemAbonnement[];
  inconnus: ItemAbonnement[];
  fiable: boolean;
  anomalies: string[];
};

/**
 * Classe les items d'une subscription Stripe à partir d'allowlists de Price IDs
 * **résolues côté serveur** (jamais l'ordre des items, jamais une metadata fournie
 * par le client).
 */
export function classifierItemsAbonnement(
  items: ItemAbonnement[] | undefined,
  registres: {
    prixBaseAttendus: Iterable<string>;
    prixCapaciteAttendus: Iterable<string>;
    prixAutresConnus?: Iterable<string>;
  },
): ClassificationItems {
  const base = new Set(registres.prixBaseAttendus);
  const capacite = new Set(registres.prixCapaciteAttendus);
  const autres = new Set(registres.prixAutresConnus ?? []);
  const anomalies: string[] = [];

  const resultat: ClassificationItems = {
    base: null,
    capacite: null,
    capaciteDupliquee: [],
    autres: [],
    inconnus: [],
    fiable: true,
    anomalies,
  };

  for (const item of items ?? []) {
    const priceId = item.price?.id ?? "";
    if (!priceId) {
      resultat.inconnus.push(item);
      anomalies.push(`item ${item.id} sans price.id`);
      continue;
    }
    if (base.has(priceId)) {
      if (resultat.base) {
        anomalies.push("plusieurs items de base");
        resultat.fiable = false;
      } else {
        resultat.base = item;
      }
    } else if (capacite.has(priceId)) {
      if (resultat.capacite) {
        resultat.capaciteDupliquee.push(item);
        anomalies.push("plusieurs items de capacité");
        resultat.fiable = false;
      } else {
        resultat.capacite = item;
        const q = item.quantity;
        if (q === undefined || !Number.isInteger(q) || q < 0) {
          anomalies.push(`quantité de capacité invalide (${String(q)})`);
          resultat.fiable = false;
        }
      }
    } else if (autres.has(priceId)) {
      resultat.autres.push(item);
    } else {
      resultat.inconnus.push(item);
      anomalies.push(`price ${priceId} inconnu (item ${item.id})`);
    }
  }
  return resultat;
}

/** Extrait les items d'une StripeSubscription sous forme normalisée. */
export function itemsDeSubscription(sub: StripeSubscription): ItemAbonnement[] {
  return (sub.items?.data ?? []).map((it) => ({ id: it.id, quantity: it.quantity, price: it.price }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Validation de quantité
// ─────────────────────────────────────────────────────────────────────────────

export const CAPACITE_SUPPLEMENTAIRE_MAX = 100_000;

export class QuantiteCapaciteInvalideError extends Error {
  constructor(public readonly raison: string) {
    super(`Quantité de capacité invalide : ${raison}`);
    this.name = "QuantiteCapaciteInvalideError";
  }
}

/** Valide et normalise une quantité de capacité supplémentaire cible. */
export function validerQuantiteCapacite(valeur: unknown): number {
  const n = typeof valeur === "number" ? valeur : Number(valeur);
  if (!Number.isFinite(n)) throw new QuantiteCapaciteInvalideError("non numérique");
  if (!Number.isInteger(n)) throw new QuantiteCapaciteInvalideError("non entière");
  if (n < 0) throw new QuantiteCapaciteInvalideError("négative");
  if (n > CAPACITE_SUPPLEMENTAIRE_MAX) throw new QuantiteCapaciteInvalideError("au-delà du maximum");
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Planification d'un changement de capacité (hausse immédiate / baisse fin de période)
// ─────────────────────────────────────────────────────────────────────────────

export type PlanChangementCapacite = {
  type: "hausse" | "baisse" | "aucun";
  effet: "immediat" | "fin_de_periode";
  /** ISO. Pour une hausse : maintenant. Pour une baisse : fin de période. */
  dateEffet: string | null;
  /** Capacité DB à appliquer tout de suite (R1 reste autorité). */
  capaciteImmediate: number;
  /** Capacité DB à appliquer plus tard (baisse programmée), ou null. */
  capacitePlanifiee: number | null;
  /** Comportement de prorata Stripe recommandé. */
  proration: "always_invoice" | "create_prorations" | "none";
};

/**
 * Décide de l'effet d'un passage de `actuel` → `cible` personnes supplémentaires.
 * - hausse : effet immédiat, `always_invoice` (ne jamais accorder une hausse non payée).
 * - baisse : effet fin de période ; la capacité DB reste `actuel` jusqu'à `finDePeriodeAt`,
 *   `capacitePlanifiee = cible`. Crédit de prorata laissé à la facture suivante.
 * - aucun : no-op.
 */
export function planifierChangementCapacite(params: {
  actuel: number;
  cible: number;
  finDePeriodeAt: string | Date | null;
  maintenant?: Date;
}): PlanChangementCapacite {
  const actuel = validerQuantiteCapacite(params.actuel);
  const cible = validerQuantiteCapacite(params.cible);
  const maintenant = params.maintenant ?? new Date();

  if (cible === actuel) {
    return {
      type: "aucun",
      effet: "immediat",
      dateEffet: null,
      capaciteImmediate: actuel,
      capacitePlanifiee: null,
      proration: "none",
    };
  }
  if (cible > actuel) {
    return {
      type: "hausse",
      effet: "immediat",
      dateEffet: maintenant.toISOString(),
      capaciteImmediate: cible,
      capacitePlanifiee: null,
      proration: "always_invoice",
    };
  }
  // baisse
  const fin = params.finDePeriodeAt ? new Date(params.finDePeriodeAt) : null;
  const dateEffet = fin && !Number.isNaN(fin.getTime()) ? fin.toISOString() : null;
  return {
    type: "baisse",
    effet: "fin_de_periode",
    dateEffet,
    capaciteImmediate: actuel, // inchangé jusqu'à l'échéance
    capacitePlanifiee: cible,
    proration: "create_prorations",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Machine à états de la saga d'opération
// ─────────────────────────────────────────────────────────────────────────────

export type StatutSagaCapacite =
  | "pending"
  | "stripe_applied"
  | "db_applied"
  | "completed"
  | "failed"
  | "needs_reconcile"
  | "scheduled";

export type EvenementSagaCapacite =
  | "stripe_ok"
  | "stripe_erreur"
  | "db_ok"
  | "db_erreur"
  | "reconcile_ok"
  | "echeance_atteinte"
  | "abandon";

/**
 * Transition déterministe. Renvoie null si la transition n'est pas permise depuis
 * l'état courant (l'appelant doit alors traiter une incohérence, pas « forcer »).
 */
export function prochaineTransitionSaga(
  courant: StatutSagaCapacite,
  evenement: EvenementSagaCapacite,
): StatutSagaCapacite | null {
  if (courant === "completed" || courant === "failed") return null; // terminal

  switch (courant) {
    case "scheduled":
      if (evenement === "echeance_atteinte") return "pending";
      if (evenement === "abandon") return "failed";
      return null;
    case "pending":
      if (evenement === "stripe_ok") return "stripe_applied";
      if (evenement === "stripe_erreur") return "failed";
      if (evenement === "abandon") return "failed";
      return null;
    case "stripe_applied":
      if (evenement === "db_ok") return "completed";
      if (evenement === "db_erreur") return "needs_reconcile";
      return null;
    case "db_applied": // état de sécurité si la DB a été écrite avant confirmation Stripe finale
      if (evenement === "stripe_ok") return "completed";
      if (evenement === "stripe_erreur") return "needs_reconcile";
      return null;
    case "needs_reconcile":
      if (evenement === "reconcile_ok") return "completed";
      if (evenement === "stripe_erreur" || evenement === "db_erreur") return "needs_reconcile";
      if (evenement === "abandon") return "failed";
      return null;
    default:
      return null;
  }
}

export function sagaEstTerminale(statut: StatutSagaCapacite): boolean {
  return statut === "completed" || statut === "failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Garde d'événements Stripe désordonnés (out-of-order)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un événement Stripe n'est pris en compte que s'il est au moins aussi récent que
 * l'état déjà connu. On compare d'abord l'horodatage d'événement, puis, à égalité,
 * le début de période de la subscription observée.
 */
export function evenementStripeEstApplicable(params: {
  evenementCreatedAt: number | null | undefined;
  dernierEvenementTraiteAt: number | null | undefined;
  subscriptionPeriodStart?: number | null;
  dernierePeriodStartConnu?: number | null;
}): boolean {
  const e = Number(params.evenementCreatedAt ?? 0);
  const dernier = Number(params.dernierEvenementTraiteAt ?? 0);
  if (e > dernier) return true;
  if (e < dernier) return false;
  // Égalité d'horodatage : départager par la période de subscription observée.
  const p = Number(params.subscriptionPeriodStart ?? 0);
  const dp = Number(params.dernierePeriodStartConnu ?? 0);
  return p >= dp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Clé d'idempotence déterministe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clé stable pour une opération logique. La même intention rejouée (même
 * entreprise, même type, même cible, même subscription) produit la même clé, donc
 * l'opération n'est jamais dédoublée.
 */
export function construireIdempotencyKey(params: {
  entrepriseId: string;
  type: "hausse" | "baisse" | "swap_prix" | "synchronisation" | "suppression";
  cible: number;
  subscriptionId: string;
  periodeReference?: string | number | null;
}): string {
  const parts = [
    "capacite",
    params.type,
    params.entrepriseId,
    params.subscriptionId,
    String(params.cible),
  ];
  if (params.periodeReference !== undefined && params.periodeReference !== null) {
    parts.push(String(params.periodeReference));
  }
  return parts.join(":");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Payload de swap de Price atomique (jamais delete-puis-create)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paramètres d'un `POST /v1/subscription_items/{id}` qui remplace le Price d'un
 * item **existant** en conservant sa `quantity`. Utilisé lors d'un changement de
 * plan (Mini 15 € → Pro 12 €) : la quantité de personnes supplémentaires reste
 * identique, seul le Price change, sur la même ligne.
 */
export function payloadSwapPrixCapacite(params: {
  itemId: string;
  nouveauPrixId: string;
  quantite: number;
  proration?: "always_invoice" | "create_prorations" | "none";
}): { path: string; body: Record<string, string> } {
  const quantite = validerQuantiteCapacite(params.quantite);
  if (!params.itemId) throw new Error("itemId requis pour le swap de Price");
  if (!params.nouveauPrixId) throw new Error("nouveauPrixId requis pour le swap de Price");
  return {
    path: `subscription_items/${encodeURIComponent(params.itemId)}`,
    body: {
      price: params.nouveauPrixId,
      quantity: String(quantite),
      proration_behavior: params.proration ?? "create_prorations",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Résolution plan/périodicité sûre
// ─────────────────────────────────────────────────────────────────────────────

export function resoudrePlanPeriodicite(
  offre: string | null | undefined,
  periodicite: string | null | undefined,
): { plan: OffreAbonnement; periodicite: PeriodiciteAbonnement } | null {
  if (!offre || !periodicite) return null;
  if (!estOffreAbonnement(offre) || !estPeriodiciteAbonnement(periodicite)) return null;
  return { plan: offre, periodicite };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Présentation d'un changement de capacité (UI abonnement — R2-C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raccourcis UX. Ce ne sont PAS des Prices distincts : un raccourci n'est qu'un
 * incrément appliqué à `quantity` sur l'unique Price capacité du plan.
 */
export const RACCOURCIS_CAPACITE = [1, 5, 10] as const;

export type SensChangementCapacite = "hausse" | "baisse" | "aucun";

export type ResumeChangementCapacite = {
  plan: OffreAbonnement;
  sens: SensChangementCapacite;
  /** Prix unitaire mensuel HT d'une personne active supplémentaire pour ce plan
   *  (grille tarifaire canonique serveur : `OffreTarifaire.parCompteSup`). */
  prixUnitaireMensuelHt: number;
  supplementActuel: number;
  supplementCible: number;
  /** `supplementCible - supplementActuel`, signé. */
  deltaPersonnes: number;
  coutMensuelActuelHt: number;
  coutMensuelCibleHt: number;
  /** Différence signée de coût mensuel HT (positive = hausse). */
  coutMensuelDeltaHt: number;
  /** Capacité totale projetée (base du forfait + supplément cible). */
  capaciteTotaleProjetee: number;
  /** true si une baisse laisserait l'entreprise au-dessus de sa capacité. */
  depasseraCapacite: boolean;
};

/**
 * Résout la quantité cible côté serveur à partir d'un incrément (raccourci
 * +1/+5/+10, positif ou négatif) OU d'une valeur absolue. Le résultat est
 * toujours un entier borné à `[0, CAPACITE_SUPPLEMENTAIRE_MAX]` : aucune valeur
 * client n'est utilisée telle quelle.
 */
export function resoudreCibleCapacite(params: {
  actuel: number;
  delta?: number | null;
  cibleAbsolue?: number | null;
}): number {
  const actuel = Number.isFinite(params.actuel) ? Math.trunc(params.actuel) : 0;
  let cible: number;
  if (params.cibleAbsolue != null && Number.isFinite(Number(params.cibleAbsolue))) {
    cible = Number(params.cibleAbsolue);
  } else if (params.delta != null && Number.isFinite(Number(params.delta))) {
    cible = actuel + Number(params.delta);
  } else {
    cible = actuel;
  }
  cible = Math.trunc(cible);
  if (cible < 0) cible = 0;
  if (cible > CAPACITE_SUPPLEMENTAIRE_MAX) cible = CAPACITE_SUPPLEMENTAIRE_MAX;
  return cible;
}

/**
 * Construit le résumé chiffré d'un passage de `supplementActuel` →
 * `supplementCible` personnes actives supplémentaires, pour l'écran de
 * confirmation. Retourne `null` si le plan n'est pas une offre commercialisée
 * (Mini/Pro/Business/Entreprise) : la capacité à la carte n'y est pas proposée.
 */
export function resumeChangementCapacite(params: {
  plan: string | null | undefined;
  capaciteBase: number;
  personnesActives: number;
  supplementActuel: number;
  supplementCible: number;
}): ResumeChangementCapacite | null {
  const plan = params.plan ?? "";
  if (!estOffreAbonnement(plan)) return null;
  if (!(OFFRES_ABONNEMENT_COMMERCIALISEES as readonly string[]).includes(plan)) return null;

  const prixUnitaire = offreTarifaireParCle(plan).parCompteSup;
  const actuel = Math.max(0, Math.trunc(params.supplementActuel));
  const cible = Math.max(0, Math.trunc(params.supplementCible));
  const delta = cible - actuel;
  const sens: SensChangementCapacite = delta === 0 ? "aucun" : delta > 0 ? "hausse" : "baisse";
  const capaciteTotaleProjetee = Math.max(0, Math.trunc(params.capaciteBase)) + cible;

  return {
    plan: plan as OffreAbonnement,
    sens,
    prixUnitaireMensuelHt: prixUnitaire,
    supplementActuel: actuel,
    supplementCible: cible,
    deltaPersonnes: delta,
    coutMensuelActuelHt: actuel * prixUnitaire,
    coutMensuelCibleHt: cible * prixUnitaire,
    coutMensuelDeltaHt: delta * prixUnitaire,
    capaciteTotaleProjetee,
    depasseraCapacite: Math.trunc(params.personnesActives) > capaciteTotaleProjetee,
  };
}
