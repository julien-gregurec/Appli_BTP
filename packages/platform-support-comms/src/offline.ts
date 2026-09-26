import type { LectureCommunication } from "./affichage";
import type { TypeCommunication } from "./consentement";

/**
 * Fonctionnement hors-ligne (§16), pour Réserves et Tools qui embarquent un cache local.
 *
 * Quatre règles, toutes vérifiables sans réseau :
 *   * un message déjà reçu reste consultable hors connexion ;
 *   * un message expiré disparaît, même si l'appareil n'a pas revu le réseau — la date
 *     de fin est donc évaluée localement, pas seulement au moment de la synchro ;
 *   * les messages critiques sont resynchronisés en priorité au retour du réseau ;
 *   * les accusés de lecture produits hors-ligne sont idempotents.
 *
 * Et une interdiction : une session d'assistance ne fonctionne jamais hors-ligne
 * (`evaluerSessionAssistance` refuse dès `enLigne === false`).
 */

export type CommunicationLocale = {
  id: string;
  version: number;
  type: TypeCommunication;
  debutAt: string;
  finAt: string | null;
  recuAt: string;
};

export type ResultatCacheLocal = {
  aConserver: CommunicationLocale[];
  aPurger: CommunicationLocale[];
};

const TYPES_CRITIQUES: readonly TypeCommunication[] = ["securite", "incident", "interruption_planifiee", "conditions"];

export function estCommunicationCritique(type: TypeCommunication): boolean {
  return TYPES_CRITIQUES.includes(type);
}

/**
 * Nettoyage du cache local. Une ancienne publicité expirée ne doit jamais réapparaître :
 * elle est purgée, et non simplement masquée, pour qu'une resynchronisation partielle
 * ne puisse pas la ressusciter.
 */
export function reconcilierCacheLocal(
  cache: readonly CommunicationLocale[],
  maintenant: Date,
): ResultatCacheLocal {
  const aConserver: CommunicationLocale[] = [];
  const aPurger: CommunicationLocale[] = [];
  for (const message of cache) {
    const expiree = message.finAt !== null && new Date(message.finAt).getTime() <= maintenant.getTime();
    if (expiree) aPurger.push(message);
    else aConserver.push(message);
  }
  return { aConserver, aPurger };
}

/** Ordre de resynchronisation : les messages critiques d'abord, puis les plus récents. */
export function ordonnerResynchronisation(
  messages: readonly CommunicationLocale[],
): CommunicationLocale[] {
  return [...messages].sort((a, b) => {
    const critiqueA = estCommunicationCritique(a.type) ? 0 : 1;
    const critiqueB = estCommunicationCritique(b.type) ? 0 : 1;
    if (critiqueA !== critiqueB) return critiqueA - critiqueB;
    return new Date(b.debutAt).getTime() - new Date(a.debutAt).getTime();
  });
}

// ── File d'accusés de lecture ─────────────────────────────────────────────────

export type AccuseEnAttente = {
  /** Clé d'idempotence stable : (communication, utilisateur, événement). */
  cle: string;
  communicationId: string;
  utilisateurId: string;
  evenement: "affichage" | "ignore" | "acquittement" | "clic";
  produitAt: string;
};

/**
 * Clé d'idempotence. Deux acquittements du même message par la même personne sont le
 * MÊME fait, même produits sur deux appareils hors-ligne : la clé ne contient donc ni
 * horodatage ni identifiant d'appareil.
 */
export function cleAccuse(entree: Omit<AccuseEnAttente, "cle" | "produitAt">): string {
  return `${entree.communicationId}:${entree.utilisateurId}:${entree.evenement}`;
}

/**
 * Déduplique une file produite hors-ligne. Pour un même fait, on conserve l'occurrence
 * la PLUS ANCIENNE : c'est la date à laquelle l'utilisateur a réellement acquitté, et
 * c'est celle qui doit remonter au serveur.
 *
 * Exception : `affichage` est un compteur, pas un fait unique — ces entrées sont
 * conservées telles quelles et agrégées côté serveur.
 */
export function dedupliquerAccuses(file: readonly AccuseEnAttente[]): AccuseEnAttente[] {
  const uniques = new Map<string, AccuseEnAttente>();
  const compteurs: AccuseEnAttente[] = [];
  for (const accuse of file) {
    if (accuse.evenement === "affichage") {
      compteurs.push(accuse);
      continue;
    }
    const existant = uniques.get(accuse.cle);
    if (!existant || new Date(accuse.produitAt).getTime() < new Date(existant.produitAt).getTime()) {
      uniques.set(accuse.cle, accuse);
    }
  }
  return [...uniques.values(), ...compteurs].sort(
    (a, b) => new Date(a.produitAt).getTime() - new Date(b.produitAt).getTime(),
  );
}

/**
 * Fusion serveur d'un accusé remonté depuis un appareil hors-ligne. Un acquittement
 * déjà enregistré n'est jamais réécrit : sa date d'origine fait foi.
 */
export function fusionnerAccuse(
  distant: LectureCommunication | null,
  local: AccuseEnAttente,
  gabarit: Omit<LectureCommunication, "etat" | "vuAt" | "acquitteAt" | "cliqueAt" | "affichages" | "dernierAffichageAt">,
): LectureCommunication {
  const base: LectureCommunication =
    distant ?? {
      ...gabarit,
      etat: "non_vu",
      vuAt: null,
      acquitteAt: null,
      cliqueAt: null,
      affichages: 0,
      dernierAffichageAt: null,
    };
  switch (local.evenement) {
    case "affichage":
      return {
        ...base,
        etat: base.etat === "non_vu" ? "vu" : base.etat,
        vuAt: base.vuAt ?? local.produitAt,
        affichages: base.affichages + 1,
        dernierAffichageAt:
          base.dernierAffichageAt === null ||
          new Date(local.produitAt).getTime() > new Date(base.dernierAffichageAt).getTime()
            ? local.produitAt
            : base.dernierAffichageAt,
      };
    case "acquittement":
      return base.acquitteAt !== null
        ? base
        : { ...base, etat: "acquitte", acquitteAt: local.produitAt, vuAt: base.vuAt ?? local.produitAt };
    case "clic":
      return base.cliqueAt !== null
        ? base
        : { ...base, etat: "clique", cliqueAt: local.produitAt, vuAt: base.vuAt ?? local.produitAt };
    case "ignore":
      return base.acquitteAt !== null ? base : { ...base, etat: "ignore" };
  }
}
