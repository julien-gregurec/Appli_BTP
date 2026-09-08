import {
  FORFAITS_VENDABLES,
  MODULES_COMMERCIAUX,
  moduleCommercialParCle,
  offreTarifaireParCle,
  prixModuleCentimes,
  type CodeForfaitVendable,
} from "@/lib/commercial/catalogue";
import { calculerAbonnement } from "@/lib/commercial/moteur";
import type { ConfigurationAbonnement, Remise } from "@/lib/commercial/types";

/**
 * Comparaison et recommandation (§3 et §7-13).
 *
 * Règle non négociable : la recommandation N'IMPOSE JAMAIS un forfait. Une
 * entreprise de cinq personnes peut rester en Mini avec deux comptes en plus.
 * On se contente de dire, chiffres à l'appui, quelle formule couvre le même
 * besoin au meilleur prix — le choix reste au client.
 */

export type ComparaisonForfait = {
  forfait: CodeForfaitVendable;
  nom: string;
  /** Le forfait couvre-t-il tous les modules demandés (inclus ou achetables) ? */
  couvertureComplete: boolean;
  modulesManquants: readonly string[];
  totalHtCentimes: number;
  equivalentMensuelHtCentimes: number;
  /** Écart avec la configuration évaluée : négatif = moins cher. */
  ecartCentimes: number;
  actuel: boolean;
};

/**
 * Construit la configuration équivalente sur un autre forfait : mêmes personnes
 * actives, mêmes modules souhaités, mêmes options. Les modules déjà inclus dans
 * le forfait cible disparaissent naturellement de la facture.
 */
export function configurationEquivalente(
  configuration: ConfigurationAbonnement,
  forfait: CodeForfaitVendable,
): ConfigurationAbonnement {
  const offreActuelle = offreTarifaireParCle(configuration.forfait);
  const personnes = configuration.personnesActives ?? offreActuelle.comptesInclus;
  return { ...configuration, forfait, personnesActives: personnes };
}

/** Modules demandés que le forfait cible ne sait ni inclure ni vendre. */
export function modulesNonCouverts(
  modulesDemandes: readonly string[],
  forfait: CodeForfaitVendable,
): string[] {
  return modulesDemandes.filter((cle) => prixModuleCentimes(cle, forfait) === null);
}

export function comparerForfaits(
  configuration: ConfigurationAbonnement,
  options: { remises?: readonly Remise[]; date?: string } = {},
): ComparaisonForfait[] {
  const reference = calculerAbonnement(configuration, options);
  const modulesDemandes = [...(configuration.modules ?? [])];
  return FORFAITS_VENDABLES.map((forfait) => {
    const equivalente = configurationEquivalente(configuration, forfait);
    const calcul = calculerAbonnement(equivalente, options);
    const manquants = modulesNonCouverts(modulesDemandes, forfait);
    return {
      forfait,
      nom: offreTarifaireParCle(forfait).nom,
      couvertureComplete: manquants.length === 0,
      modulesManquants: manquants.map((cle) => moduleCommercialParCle(cle)?.nom ?? cle),
      totalHtCentimes: calcul.totalHtCentimes,
      equivalentMensuelHtCentimes: calcul.equivalentMensuelHtCentimes,
      ecartCentimes: calcul.totalHtCentimes - reference.totalHtCentimes,
      actuel: forfait === configuration.forfait,
    };
  });
}

export type Recommandation = {
  /** Forfait le moins cher à couverture au moins équivalente, ou `null`. */
  forfait: CodeForfaitVendable | null;
  economieCentimes: number;
  message: string;
  /** Toujours faux : une recommandation ne force jamais un changement. */
  forcee: false;
};

export function recommanderForfait(
  configuration: ConfigurationAbonnement,
  options: { remises?: readonly Remise[]; date?: string } = {},
): Recommandation {
  const comparaisons = comparerForfaits(configuration, options);
  const actuel = comparaisons.find((comparaison) => comparaison.actuel);
  const eligibles = comparaisons.filter(
    (comparaison) => comparaison.couvertureComplete && !comparaison.actuel,
  );
  const meilleur = eligibles
    .filter((comparaison) => comparaison.ecartCentimes < 0)
    .sort((a, b) => a.ecartCentimes - b.ecartCentimes)[0];

  if (!actuel?.couvertureComplete) {
    const secours = eligibles.sort((a, b) => a.totalHtCentimes - b.totalHtCentimes)[0];
    if (secours) {
      return {
        forfait: secours.forfait,
        economieCentimes: -secours.ecartCentimes,
        message:
          `Votre configuration demande des modules indisponibles sur ${actuel?.nom ?? configuration.forfait}. `
          + `${secours.nom} les couvre. Vous restez libre de garder votre forfait sans ces modules.`,
        forcee: false,
      };
    }
  }

  if (!meilleur) {
    return {
      forfait: null,
      economieCentimes: 0,
      message: "Votre configuration actuelle est la moins chère pour ce périmètre.",
      forcee: false,
    };
  }

  return {
    forfait: meilleur.forfait,
    economieCentimes: -meilleur.ecartCentimes,
    message:
      `À périmètre identique, ${meilleur.nom} revient moins cher. `
      + "Vous pouvez conserver votre forfait actuel : rien n'est imposé.",
    forcee: false,
  };
}

/** Économie du passage à l'annuel : douze mensualités contre une annualité. */
export function economieAnnuelle(
  configuration: ConfigurationAbonnement,
  options: { remises?: readonly Remise[]; date?: string } = {},
): { mensuelSurDouzeMoisCentimes: number; annuelCentimes: number; economieCentimes: number } {
  const mensuel = calculerAbonnement({ ...configuration, periodicite: "mensuel" }, options);
  const annuel = calculerAbonnement({ ...configuration, periodicite: "annuel" }, options);
  const surDouzeMois = mensuel.totalHtCentimes * 12;
  return {
    mensuelSurDouzeMoisCentimes: surDouzeMois,
    annuelCentimes: annuel.totalHtCentimes,
    economieCentimes: surDouzeMois - annuel.totalHtCentimes,
  };
}

/** Modules réellement proposables à l'achat pour ce forfait, prix compris. */
export function catalogueAchatPour(forfait: CodeForfaitVendable) {
  return MODULES_COMMERCIAUX.filter((definition) => definition.vendableALaCarte)
    .map((definition) => ({
      cle: definition.cle,
      nom: definition.nom,
      inclus: definition.inclusDansForfaits.includes(forfait),
      prixMensuelCentimes: prixModuleCentimes(definition.cle, forfait),
      statutPrix: definition.statutPrix,
    }))
    .filter((ligne) => ligne.inclus || ligne.prixMensuelCentimes !== null);
}
