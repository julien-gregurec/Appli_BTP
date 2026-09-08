import {
  BLOC_STOCKAGE,
  MODULES_COMMERCIAUX,
  MODELE_COMPTES_PAR_DEFAUT,
  MULTIPLICATEURS_ANNUELS,
  TAUX_TVA_PAR_DEFAUT,
  TYPES_COMPTE,
  moduleCommercialParCle,
  offreTarifaireParCle,
  optionIAParCle,
  prixModuleCentimes,
  prixPersonneSupplementaireCentimes,
  type CodeForfaitVendable,
  type PeriodiciteAbonnement,
} from "@/lib/commercial/catalogue";
import {
  detecterConflits,
  debutEcheance,
  ordonnerRemises,
  perimetresSeRecouvrent,
  resoudreEtatRemise,
} from "@/lib/commercial/remises";
import type {
  AvantageApplique,
  CalculAbonnement,
  ConfigurationAbonnement,
  ConflitRemise,
  EcheanceProjetee,
  LigneAbonnement,
  PerimetreRemise,
  Remise,
} from "@/lib/commercial/types";

/**
 * MOTEUR DE CALCUL COMMERCIAL — pur, déterministe, sans I/O ni horloge.
 *
 * C'est le SEUL endroit où un prix Gestion Pro est calculé. Le configurateur,
 * la page abonnement, l'écran plateforme, les e-mails et les tests consomment
 * tous cette fonction : un prix ne doit jamais être recalculé différemment
 * selon la surface (§7).
 *
 * Unités : entiers de centimes HT. Le seul arrondi est celui d'un pourcentage
 * (`Math.round`, demi-supérieur) et celui de la répartition au prorata d'une
 * remise entre plusieurs lignes (méthode des plus forts restes, somme exacte).
 */

const CENTIMES_MIN = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Construction des lignes au tarif public
// ─────────────────────────────────────────────────────────────────────────────

function multiplicateur(famille: keyof typeof MULTIPLICATEURS_ANNUELS, periodicite: PeriodiciteAbonnement): number {
  return periodicite === "annuel" ? MULTIPLICATEURS_ANNUELS[famille].valeur : 1;
}

export type EtatModuleConfiguration = {
  cle: string;
  nom: string;
  /** "inclus" = compris dans le forfait ; "option" = ajouté et facturé ;
   *  "disponible" = achetable mais non retenu ; "indisponible" = pas à ce niveau. */
  etat: "inclus" | "option" | "disponible" | "indisponible";
  prixMensuelCentimes: number | null;
  statutCatalogue: string;
  statutPrix: string;
};

/** État de chaque module pour une configuration : « inclus / ajouté / indisponible » (§6). */
export function etatModulesPour(configuration: ConfigurationAbonnement): EtatModuleConfiguration[] {
  const forfait = configuration.forfait;
  const retenus = new Set(configuration.modules ?? []);
  return MODULES_COMMERCIAUX.map((definition) => {
    const prix = prixModuleCentimes(definition.cle, forfait);
    const inclus = definition.inclusDansForfaits.includes(forfait);
    const etat: EtatModuleConfiguration["etat"] = inclus
      ? "inclus"
      : prix === null
        ? "indisponible"
        : retenus.has(definition.cle)
          ? "option"
          : "disponible";
    return {
      cle: definition.cle,
      nom: definition.nom,
      etat,
      prixMensuelCentimes: inclus ? 0 : prix,
      statutCatalogue: definition.statutCatalogue,
      statutPrix: definition.statutPrix,
    };
  });
}

export function construireLignes(configuration: ConfigurationAbonnement): {
  lignes: LigneAbonnement[];
  avertissements: string[];
} {
  const avertissements: string[] = [];
  const periodicite = configuration.periodicite;
  const offre = offreTarifaireParCle(configuration.forfait);
  const lignes: LigneAbonnement[] = [];

  // 1. Forfait de base
  lignes.push({
    cle: `forfait:${configuration.forfait}`,
    libelle: `Forfait ${offre.nom}`,
    famille: "forfait",
    quantite: 1,
    prixUnitaireMensuelCentimes: offre.prixMensuelCentimes,
    montantPeriodeCentimes: periodicite === "annuel" ? offre.prixAnnuelCentimes : offre.prixMensuelCentimes,
    multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.forfait.valeur,
    statutPrix: "valide",
  });

  // 2. Comptes — deux modèles, jamais mélangés
  const modele = configuration.modeleComptes ?? MODELE_COMPTES_PAR_DEFAUT;
  const facteurComptes = multiplicateur("comptes", periodicite);
  if (modele === "capacite_personnes") {
    const voulues = Math.max(0, Math.trunc(configuration.personnesActives ?? offre.comptesInclus));
    const supplementaires = Math.max(0, voulues - offre.comptesInclus);
    if (supplementaires > 0) {
      const unitaire = prixPersonneSupplementaireCentimes(configuration.forfait);
      lignes.push({
        cle: "comptes:personnes_actives",
        libelle: `Personnes actives supplémentaires (au-delà de ${offre.comptesInclus})`,
        famille: "comptes",
        quantite: supplementaires,
        prixUnitaireMensuelCentimes: unitaire,
        montantPeriodeCentimes: supplementaires * unitaire * facteurComptes,
        multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.comptes.valeur,
        statutPrix: "valide",
      });
    }
  } else {
    for (const type of TYPES_COMPTE) {
      const quantite = Math.max(0, Math.trunc(configuration.comptesSupplementaires?.[type.cle] ?? 0));
      if (quantite === 0) continue;
      if (type.prixMensuelCentimes === 0) {
        lignes.push({
          cle: `comptes:${type.cle}`,
          libelle: type.nom,
          famille: "comptes",
          quantite,
          prixUnitaireMensuelCentimes: 0,
          montantPeriodeCentimes: 0,
          multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.comptes.valeur,
          statutPrix: type.statutPrix,
        });
        continue;
      }
      lignes.push({
        cle: `comptes:${type.cle}`,
        libelle: type.nom,
        famille: "comptes",
        quantite,
        prixUnitaireMensuelCentimes: type.prixMensuelCentimes,
        montantPeriodeCentimes: quantite * type.prixMensuelCentimes * facteurComptes,
        multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.comptes.valeur,
        statutPrix: type.statutPrix,
      });
    }
    avertissements.push(
      "Modèle « prix par type de compte » : ces montants ne sont facturés par aucun Price Stripe "
      + "et ne sont pas distingués en base. Modèle divergent, à arbitrer avant toute vente.",
    );
  }

  // 3. Modules optionnels
  const facteurModules = multiplicateur("modules", periodicite);
  for (const cle of configuration.modules ?? []) {
    const definition = moduleCommercialParCle(cle);
    if (!definition) {
      avertissements.push(`Module inconnu ignoré : « ${cle} ».`);
      continue;
    }
    if (definition.inclusDansForfaits.includes(configuration.forfait)) continue;
    const prix = prixModuleCentimes(cle, configuration.forfait);
    if (prix === null) {
      avertissements.push(
        `Module « ${definition.nom} » non disponible à la carte sur le forfait ${configuration.forfait}`
        + `${definition.statutCatalogue !== "actif" ? ` (statut catalogue : ${definition.statutCatalogue})` : ""}.`,
      );
      continue;
    }
    lignes.push({
      cle: `module:${cle}`,
      libelle: definition.nom,
      famille: "modules",
      moduleCle: cle,
      quantite: 1,
      prixUnitaireMensuelCentimes: prix,
      montantPeriodeCentimes: prix * facteurModules,
      multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.modules.valeur,
      statutPrix: definition.statutPrix,
    });
  }

  // 4. Stockage
  const blocs = Math.max(0, Math.trunc(configuration.blocsStockage ?? 0));
  if (blocs > 0) {
    const facteur = multiplicateur("stockage", periodicite);
    lignes.push({
      cle: "stockage:blocs",
      libelle: `Stockage supplémentaire (${blocs} × ${BLOC_STOCKAGE.goParBloc} Go)`,
      famille: "stockage",
      quantite: blocs,
      prixUnitaireMensuelCentimes: BLOC_STOCKAGE.prixMensuelCentimes,
      montantPeriodeCentimes: blocs * BLOC_STOCKAGE.prixMensuelCentimes * facteur,
      multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.stockage.valeur,
      statutPrix: BLOC_STOCKAGE.statutPrix,
    });
  }

  // 5. IA — le droit d'accès est inclus partout ; seule l'option est facturée.
  const optionIA = optionIAParCle(configuration.optionIA ?? "aucune");
  if (optionIA.prixMensuelCentimes > 0) {
    const facteur = multiplicateur("ia", periodicite);
    lignes.push({
      cle: `ia:${optionIA.cle}`,
      libelle: optionIA.nom,
      famille: "ia",
      quantite: 1,
      prixUnitaireMensuelCentimes: optionIA.prixMensuelCentimes,
      montantPeriodeCentimes: optionIA.prixMensuelCentimes * facteur,
      multiplicateurAnnuel: MULTIPLICATEURS_ANNUELS.ia.valeur,
      statutPrix: optionIA.statutPrix,
    });
  }

  return { lignes, avertissements };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Application des remises
// ─────────────────────────────────────────────────────────────────────────────

function ligneDansPerimetre(ligne: LigneAbonnement, perimetre: PerimetreRemise): boolean {
  switch (perimetre.cible) {
    case "abonnement":
      return ligne.famille !== "prestation";
    case "forfait":
      return ligne.famille === "forfait";
    case "comptes":
      return ligne.famille === "comptes";
    case "stockage":
      return ligne.famille === "stockage";
    case "ia":
      return ligne.famille === "ia";
    case "modules":
      if (ligne.famille !== "modules") return false;
      if (!perimetre.cles || perimetre.cles.length === 0) return true;
      return Boolean(ligne.moduleCle && perimetre.cles.includes(ligne.moduleCle));
    case "mise_en_service":
    case "prestation":
      // Prestations ponctuelles : hors de l'abonnement récurrent calculé ici.
      return false;
  }
}

/**
 * Répartit `reduction` entre les lignes au prorata de leur reste à payer.
 * Méthode des plus forts restes : la somme distribuée vaut EXACTEMENT
 * `reduction`, et aucune ligne ne passe sous zéro.
 */
function repartirAuProrata(restes: number[], reduction: number): number[] {
  const total = restes.reduce((somme, valeur) => somme + valeur, 0);
  if (total <= 0 || reduction <= 0) return restes.map(() => 0);
  const exacts = restes.map((reste) => (reste * reduction) / total);
  const parts = exacts.map((valeur) => Math.floor(valeur));
  let reste = reduction - parts.reduce((somme, valeur) => somme + valeur, 0);
  const ordre = exacts
    .map((valeur, index) => ({ index, fraction: valeur - Math.floor(valeur) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of ordre) {
    if (reste <= 0) break;
    if (parts[index] >= restes[index]) continue;
    parts[index] += 1;
    reste -= 1;
  }
  return parts.map((part, index) => Math.min(part, restes[index]));
}

export type OptionsCalcul = {
  remises?: readonly Remise[];
  /** Date d'évaluation des remises (ISO `AAAA-MM-JJ`). Obligatoire dès qu'il y a une remise. */
  date?: string;
};

export function calculerAbonnement(
  configuration: ConfigurationAbonnement,
  options: OptionsCalcul = {},
): CalculAbonnement {
  const { lignes, avertissements } = construireLignes(configuration);
  return calculerDepuisLignes(lignes, configuration, { ...options, avertissements });
}

/**
 * Même calcul, mais à partir de lignes déjà construites. Sert au moteur lui-même
 * et permet de rejouer un abonnement sur une AUTRE grille publique (test de
 * changement de tarif public : une remise en pourcentage suit le nouveau prix,
 * un prix négocié ne bouge pas — §9).
 */
export function calculerDepuisLignes(
  lignes: readonly LigneAbonnement[],
  configuration: ConfigurationAbonnement,
  options: OptionsCalcul & { avertissements?: readonly string[] } = {},
): CalculAbonnement {
  const periodicite = configuration.periodicite;
  const avertissements = [...(options.avertissements ?? [])];
  const sousTotalHtCentimes = lignes.reduce((somme, ligne) => somme + ligne.montantPeriodeCentimes, 0);

  const remisesEcartees: { id: string; raison: string }[] = [];
  const toutes = options.remises ?? [];
  const date = options.date;

  let candidates: Remise[] = [];
  if (toutes.length > 0) {
    if (!date) {
      avertissements.push("Aucune date d'évaluation fournie : les remises n'ont pas été appliquées.");
    } else {
      for (const remise of toutes) {
        const etat = resoudreEtatRemise(remise, date, periodicite);
        if (etat === "active") candidates.push(remise);
        else remisesEcartees.push({ id: remise.id, raison: `état ${etat} au ${date}` });
      }
    }
  }

  // Conflits : on conserve la remise la plus étroite (ordre déterministe) et on
  // écarte l'autre. Rien n'est jamais superposé silencieusement.
  const conflits: ConflitRemise[] = detecterConflits(candidates);
  if (conflits.length > 0) {
    const ordonnees = ordonnerRemises(candidates);
    const retenues: Remise[] = [];
    for (const remise of ordonnees) {
      const bloquante = retenues.find((deja) => {
        if (!perimetresSeRecouvrent(deja.perimetre, remise.perimetre)) return false;
        if (deja.type === "prix_negocie" || remise.type === "prix_negocie") return true;
        return !(deja.cumulAutorise && remise.cumulAutorise);
      });
      if (bloquante) {
        remisesEcartees.push({
          id: remise.id,
          raison: `conflit de périmètre avec la remise ${bloquante.id}`,
        });
        continue;
      }
      retenues.push(remise);
    }
    candidates = retenues;
  }

  const restes = lignes.map((ligne) => ligne.montantPeriodeCentimes);
  const avantages: AvantageApplique[] = [];
  let ordre = 0;

  for (const remise of ordonnerRemises(candidates)) {
    const indices = lignes
      .map((ligne, index) => ({ ligne, index }))
      .filter(({ ligne }) => ligneDansPerimetre(ligne, remise.perimetre))
      .map(({ index }) => index);
    const base = indices.reduce((somme, index) => somme + restes[index], 0);
    if (indices.length === 0 || base <= 0) {
      remisesEcartees.push({ id: remise.id, raison: "aucune ligne facturée dans le périmètre" });
      continue;
    }

    let reduction = 0;
    let explication = "";
    if (remise.type === "pourcentage") {
      reduction = Math.round((base * remise.valeur) / 100);
      explication = `${remise.valeur} % de ${(base / 100).toFixed(2)} € = ${(reduction / 100).toFixed(2)} €`;
    } else if (remise.type === "montant") {
      reduction = Math.min(remise.valeur, base);
      explication = `${(remise.valeur / 100).toFixed(2)} € déduits de ${(base / 100).toFixed(2)} €`
        + (remise.valeur > base ? " (plafonné au montant du périmètre)" : "");
    } else {
      // Prix négocié : la valeur est le prix FINAL du périmètre, exprimé dans la
      // périodicité de l'abonnement (aucune conversion implicite — §11).
      if (remise.valeur > base) {
        avertissements.push(
          `Prix négocié (${(remise.valeur / 100).toFixed(2)} €) supérieur au tarif public du périmètre `
          + `(${(base / 100).toFixed(2)} €) : aucune réduction appliquée, un prix négocié ne peut pas augmenter la facture.`,
        );
        remisesEcartees.push({ id: remise.id, raison: "prix négocié supérieur au tarif public" });
        continue;
      }
      reduction = base - remise.valeur;
      explication = `prix figé à ${(remise.valeur / 100).toFixed(2)} € au lieu de ${(base / 100).toFixed(2)} €`;
    }

    reduction = Math.max(0, Math.min(reduction, base));
    const parts = repartirAuProrata(indices.map((index) => restes[index]), reduction);
    indices.forEach((index, rang) => {
      restes[index] -= parts[rang];
    });

    ordre += 1;
    avantages.push({
      ordre,
      remiseId: remise.id,
      type: remise.type,
      cible: remise.perimetre.cible,
      libelle: remise.motif,
      baseCentimes: base,
      reductionCentimes: reduction,
      explication,
    });
  }

  const totalRemisesCentimes = avantages.reduce((somme, avantage) => somme + avantage.reductionCentimes, 0);
  const totalHtCentimes = Math.max(CENTIMES_MIN, sousTotalHtCentimes - totalRemisesCentimes);
  const tauxTvaPourcent = configuration.tauxTvaPourcent ?? TAUX_TVA_PAR_DEFAUT;
  const tvaCentimes = Math.round((totalHtCentimes * tauxTvaPourcent) / 100);

  return {
    configuration,
    periodicite,
    lignes,
    sousTotalHtCentimes,
    avantages,
    totalRemisesCentimes,
    totalHtCentimes,
    tauxTvaPourcent,
    tvaCentimes,
    totalTtcCentimes: totalHtCentimes + tvaCentimes,
    equivalentMensuelHtCentimes: periodicite === "annuel" ? Math.round(totalHtCentimes / 12) : totalHtCentimes,
    conflits,
    remisesAppliquees: avantages.map((avantage) => avantage.remiseId),
    remisesEcartees,
    avertissements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Projection des prochaines échéances (§10 : retour au tarif normal visible)
// ─────────────────────────────────────────────────────────────────────────────

export function projeterEcheances(
  configuration: ConfigurationAbonnement,
  options: { debutContrat: string; nombre: number; remises?: readonly Remise[] },
): EcheanceProjetee[] {
  const projections: EcheanceProjetee[] = [];
  const nombre = Math.max(1, Math.trunc(options.nombre));
  for (let index = 1; index <= nombre; index += 1) {
    const debut = debutEcheance(options.debutContrat, index, configuration.periodicite);
    const calcul = calculerAbonnement(configuration, { remises: options.remises, date: debut });
    const suivante = debutEcheance(options.debutContrat, index + 1, configuration.periodicite);
    const calculSuivant = calculerAbonnement(configuration, { remises: options.remises, date: suivante });
    projections.push({
      index,
      debut,
      totalHtCentimes: calcul.totalHtCentimes,
      totalTtcCentimes: calcul.totalTtcCentimes,
      avantages: calcul.avantages,
      derniereEcheanceRemisee:
        calcul.avantages.length > 0 && calculSuivant.totalHtCentimes > calcul.totalHtCentimes,
    });
  }
  return projections;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Formatage
// ─────────────────────────────────────────────────────────────────────────────

export function formatCentimes(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);
}

export type { CodeForfaitVendable };
