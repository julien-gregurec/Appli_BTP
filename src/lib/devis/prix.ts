/**
 * Prix unitaires, prix global et marges d'un ouvrage — module PUR.
 *
 * Ce module conserve SÉPARÉMENT : coût d'achat estimé, prix de vente calculé, remise, prix de
 * vente retenu, marge en euros, taux de marge (marge / coût) et taux de marque (marge / prix).
 *
 * ── Règles ──────────────────────────────────────────────────────────────────────────────
 *
 * 1. Changer le prix global ne touche JAMAIS un prix d'achat.
 * 2. Changer le prix global est une PROPOSITION : rien n'est appliqué sans que l'utilisateur ait
 *    vu l'avant/après et choisi une stratégie (ajustement, répartition, remise) — ou annulé.
 * 3. Un montant global n'est jamais réparti en silence entre des lignes de taux de TVA
 *    différents : sans règle explicite, la proposition s'arrête et demande laquelle appliquer.
 */

import {
  add,
  arrondir,
  cmp,
  dec,
  diviserArrondi,
  estNul,
  montantLigneHtExact,
  mul,
  repartirArrondi,
  somme,
  sub,
  versNombre,
  type Decimal,
} from "@/lib/devis/montants";
import type { InstanceOuvrage, LigneOuvrage, MotifAjustement } from "@/lib/devis/ouvrages";

const htLigne = (l: LigneOuvrage): Decimal =>
  montantLigneHtExact({ quantite: l.quantite, prixUnitaireHt: l.prixVenteHt, remiseLignePct: l.remiseLignePct, tauxTva: l.tauxTva });

const estComposant = (l: LigneOuvrage) => l.origine !== "ajustement";

// ── Indicateurs ──────────────────────────────────────────────────────────────

export type IndicateursPrix = {
  /** `null` : au moins un composant sans prix d'achat connu (ou masqué). */
  coutAchatHt: number | null;
  prixVenteCalculeHt: number;
  /** Remise accordée, en valeur positive. */
  remiseHt: number;
  /** Ajustements de prix global et écarts d'arrondi (positifs ou négatifs). */
  ajustementHt: number;
  prixVenteRetenuHt: number;
  margeHt: number | null;
  /** Marge / coût d'achat, en %. */
  tauxMargePct: number | null;
  /** Marge / prix de vente retenu, en %. */
  tauxMarquePct: number | null;
};

export function indicateursPrix(instance: Pick<InstanceOuvrage, "lignes">): IndicateursPrix {
  const composants = instance.lignes.filter(estComposant);
  const parMotif = (motifs: MotifAjustement[]) =>
    somme(instance.lignes.filter((l) => !estComposant(l) && motifs.includes(l.motifAjustement ?? "ajustement_prix_global")).map(htLigne));
  const calcule = arrondir(somme(composants.map(htLigne)));
  const retenu = arrondir(somme(instance.lignes.map(htLigne)));
  const remise = arrondir(parMotif(["remise"]));
  const ajustement = sub(sub(retenu, calcule), remise);
  const coutInconnu = composants.some((l) => l.prixAchatHt === null);
  const cout = coutInconnu ? null : arrondir(somme(composants.map((l) => mul(dec(l.quantite), dec(l.prixAchatHt!)))));
  const marge = cout === null ? null : sub(retenu, cout);
  return {
    coutAchatHt: cout === null ? null : versNombre(cout),
    prixVenteCalculeHt: versNombre(calcule),
    remiseHt: versNombre(mul(remise, dec(-1))),
    ajustementHt: versNombre(ajustement),
    prixVenteRetenuHt: versNombre(retenu),
    margeHt: marge === null ? null : versNombre(marge),
    tauxMargePct: marge === null || cout === null || estNul(cout) ? null : versNombre(diviserArrondi(mul(marge, dec(100)), cout)),
    tauxMarquePct: marge === null || estNul(retenu) ? null : versNombre(diviserArrondi(mul(marge, dec(100)), retenu)),
  };
}

// ── Avertissements ───────────────────────────────────────────────────────────

export type CodeAvertissement =
  | "prix_inferieur_cout"
  | "marge_sous_seuil"
  | "prix_nul"
  | "tva_incoherente"
  | "composant_sans_prix"
  | "cout_inconnu"
  | "tva_multiple";

export type Avertissement = {
  code: CodeAvertissement;
  gravite: "attention" | "information";
  message: string;
  cle?: string;
};

/** Taux de TVA admis par défaut (France métropolitaine). Un autre taux est signalé, pas refusé. */
export const TAUX_TVA_ADMIS = [20, 10, 5.5, 2.1, 0] as const;

export type ReglesAvertissement = {
  /** Seuil de taux de marque en dessous duquel on avertit. `null` : pas de seuil configuré. */
  seuilTauxMarquePct?: number | null;
  tauxAdmis?: readonly number[];
};

const eur = (x: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(x);

/**
 * Avertissements d'un ouvrage. Aucun n'empêche d'enregistrer : un prix sous le coût peut être
 * un choix commercial. Mais aucun ne doit passer inaperçu.
 */
export function avertissementsPrix(instance: Pick<InstanceOuvrage, "lignes">, regles: ReglesAvertissement = {}): Avertissement[] {
  const ind = indicateursPrix(instance);
  const tauxAdmis = regles.tauxAdmis ?? TAUX_TVA_ADMIS;
  const composants = instance.lignes.filter(estComposant);
  const avertissements: Avertissement[] = [];

  if (ind.prixVenteRetenuHt === 0) {
    avertissements.push({ code: "prix_nul", gravite: "attention", message: "Le prix de vente retenu est nul." });
  }
  if (ind.coutAchatHt !== null && ind.prixVenteRetenuHt < ind.coutAchatHt) {
    avertissements.push({
      code: "prix_inferieur_cout",
      gravite: "attention",
      message: `Prix de vente (${eur(ind.prixVenteRetenuHt)}) inférieur au coût d’achat estimé (${eur(ind.coutAchatHt)}).`,
    });
  }
  const seuil = regles.seuilTauxMarquePct ?? null;
  if (seuil !== null && ind.tauxMarquePct !== null && ind.tauxMarquePct < seuil) {
    avertissements.push({
      code: "marge_sous_seuil",
      gravite: "attention",
      message: `Taux de marque de ${ind.tauxMarquePct} % sous le seuil configuré de ${seuil} %.`,
    });
  }
  if (ind.coutAchatHt === null) {
    avertissements.push({
      code: "cout_inconnu",
      gravite: "information",
      message: "Coût d’achat incomplet : la marge ne peut pas être calculée.",
    });
  }
  for (const l of composants) {
    if (l.prixVenteHt === 0) {
      avertissements.push({ code: "composant_sans_prix", gravite: "attention", cle: l.cle, message: `« ${l.designation} » n’a pas de prix de vente.` });
    }
  }
  const tauxComposants = new Set(composants.map((l) => l.tauxTva));
  for (const l of instance.lignes) {
    if (!tauxAdmis.includes(l.tauxTva)) {
      avertissements.push({ code: "tva_incoherente", gravite: "attention", cle: l.cle, message: `Taux de TVA inhabituel (${l.tauxTva} %) sur « ${l.designation} ».` });
    } else if (!estComposant(l) && !tauxComposants.has(l.tauxTva)) {
      avertissements.push({
        code: "tva_incoherente",
        gravite: "attention",
        cle: l.cle,
        message: `L’ajustement « ${l.designation} » porte un taux (${l.tauxTva} %) qu’aucun composant n’a.`,
      });
    }
  }
  if (tauxComposants.size > 1) {
    avertissements.push({
      code: "tva_multiple",
      gravite: "information",
      message: `L’ouvrage mêle plusieurs taux de TVA (${[...tauxComposants].sort((a, b) => b - a).join(" %, ")} %).`,
    });
  }
  return avertissements;
}

// ── Prix global ──────────────────────────────────────────────────────────────

export type StrategiePrixGlobal = "ajustement" | "repartition" | "remise" | "annuler";

/** Règle explicite pour un ouvrage mêlant plusieurs taux de TVA. */
export type RegleTvaMixte = "refuser" | "prorata_bases";

export type PropositionPrixGlobal =
  | {
      etat: "propose";
      strategie: Exclude<StrategiePrixGlobal, "annuler">;
      instance: InstanceOuvrage;
      avant: IndicateursPrix;
      apres: IndicateursPrix;
      changementsPrix: Array<{ cle: string; designation: string; avant: number; apres: number }>;
      lignesAjustement: Array<{ cle: string; designation: string; montantHt: number; tauxTva: number }>;
    }
  | { etat: "annule"; instance: InstanceOuvrage }
  | { etat: "regle_tva_requise"; taux: number[]; motif: string }
  | { etat: "refuse"; motif: string };

function ligneAjustement(
  modele: LigneOuvrage | undefined,
  cle: string,
  designation: string,
  montant: Decimal,
  tauxTva: number,
  motif: MotifAjustement,
  ordre: number,
): LigneOuvrage {
  return {
    cle,
    designation,
    unite: "forfait",
    coefficient: null,
    base: { type: "principale" },
    quantiteFixe: null,
    saisieRequise: false,
    pertePct: 0,
    arrondi: { mode: "aucun" },
    quantiteMin: null,
    condition: { type: "toujours" },
    origine: "ajustement",
    motifAjustement: motif,
    ordre,
    nature: "libre",
    type: "forfait",
    source: null,
    referenceInterne: null,
    referenceFabricant: null,
    descriptionClient: null,
    quantite: 1,
    quantiteForcee: true,
    // Un ajustement n'est pas un achat : il n'a jamais de coût.
    prixAchatHt: null,
    prixVenteHt: versNombre(montant),
    tauxTva,
    remiseLignePct: 0,
    visibleClient: modele?.visibleClient ?? true,
    afficherQuantite: false,
    afficherPrix: true,
    descriptionPersonnalisee: null,
    detailCalcul: designation,
  };
}

/**
 * Répartit `montant` entre taux, au prorata des bases HT, au centime exact près.
 * C'est la règle `prorata_bases` — elle ne s'applique que si l'utilisateur l'a choisie.
 */
function repartirParTaux(montant: Decimal, bases: Map<number, Decimal>, total: Decimal): Map<number, Decimal> {
  const taux = [...bases.keys()].sort((a, b) => b - a);
  const parts = taux.map((t) => diviserArrondi(mul(montant, bases.get(t)!), total, 6));
  const arrondies = repartirArrondi(parts, arrondir(montant));
  return new Map(taux.map((t, i) => [t, arrondies[i]]));
}

/**
 * Propose un nouveau prix global HT pour un ouvrage, selon une stratégie EXPLICITE.
 *
 * - `ajustement` : les prix des composants restent ; une ligne d'ajustement porte l'écart.
 * - `repartition` : les prix unitaires de vente sont mis à l'échelle proportionnellement ;
 *   l'écart d'arrondi résiduel, s'il existe, est montré sur une ligne à part.
 * - `remise` : une remise (écart négatif uniquement) est posée sur l'ouvrage.
 * - `annuler` : rien ne change.
 *
 * Toute proposition précédente (ligne d'ajustement) est remplacée, jamais empilée.
 */
export function proposerPrixGlobal(
  instance: InstanceOuvrage,
  cibleHt: number,
  strategie: StrategiePrixGlobal,
  o: { statutDevis: string; regleTvaMixte?: RegleTvaMixte },
): PropositionPrixGlobal {
  if (strategie === "annuler") return { etat: "annule", instance };
  if (o.statutDevis !== "brouillon") return { etat: "refuse", motif: "Seul un devis en brouillon peut changer de prix." };
  if (!(Number.isFinite(cibleHt) && cibleHt >= 0)) return { etat: "refuse", motif: "Prix cible invalide." };

  const avant = indicateursPrix(instance);
  const composants = instance.lignes.filter(estComposant).map((l) => ({ ...l }));
  const cible = arrondir(dec(cibleHt));
  const baseExacte = somme(composants.map(htLigne));
  const base = arrondir(baseExacte);
  const bases = new Map<number, Decimal>();
  for (const l of composants) bases.set(l.tauxTva, add(bases.get(l.tauxTva) ?? dec(0), htLigne(l)));
  const taux = [...bases.keys()].sort((a, b) => b - a);
  const mixte = taux.length > 1;
  if (mixte && (o.regleTvaMixte ?? "refuser") === "refuser") {
    return {
      etat: "regle_tva_requise",
      taux,
      motif: `L’ouvrage mêle plusieurs taux de TVA (${taux.join(" %, ")} %) : choisissez explicitement comment répartir le montant.`,
    };
  }
  const ordreSuivant = Math.max(0, ...composants.map((l) => l.ordre)) + 1;
  let lignes = composants;
  const ajustements: LigneOuvrage[] = [];
  const changementsPrix: Array<{ cle: string; designation: string; avant: number; apres: number }> = [];

  const poserEcart = (ecart: Decimal, motif: MotifAjustement, libelle: string) => {
    if (estNul(ecart)) return;
    if (!mixte) {
      ajustements.push(ligneAjustement(undefined, `${motif}`, libelle, ecart, taux[0] ?? 20, motif, ordreSuivant));
      return;
    }
    if (estNul(baseExacte)) throw new Error("Prix calculé nul : impossible de répartir au prorata des bases.");
    let i = 0;
    for (const [t, part] of repartirParTaux(ecart, bases, baseExacte)) {
      if (estNul(part)) continue;
      ajustements.push(ligneAjustement(undefined, `${motif}-${t}`, `${libelle} (TVA ${t} %)`, part, t, motif, ordreSuivant + i++));
    }
  };

  try {
    if (strategie === "ajustement") {
      poserEcart(sub(cible, base), "ajustement_prix_global", "Ajustement du prix de l’ouvrage");
    } else if (strategie === "remise") {
      const ecart = sub(cible, base);
      if (cmp(ecart, dec(0)) > 0) {
        return { etat: "refuse", motif: "Une remise ne peut pas augmenter le prix : choisissez un ajustement." };
      }
      const pct = estNul(base) ? dec(0) : diviserArrondi(mul(ecart, dec(-100)), base);
      poserEcart(ecart, "remise", `Remise sur l’ouvrage (${new Intl.NumberFormat("fr-FR").format(versNombre(pct))} %)`);
    } else {
      if (estNul(baseExacte)) return { etat: "refuse", motif: "Prix calculé nul : impossible de répartir." };
      lignes = composants.map((l) => {
        if (l.prixVenteHt === 0) return l;
        const nouveau = versNombre(diviserArrondi(mul(dec(l.prixVenteHt), cible), baseExacte, 2));
        if (nouveau !== l.prixVenteHt) changementsPrix.push({ cle: l.cle, designation: l.designation, avant: l.prixVenteHt, apres: nouveau });
        return { ...l, prixVenteHt: nouveau };
      });
      const obtenu = arrondir(somme(lignes.map(htLigne)));
      const ecart = sub(cible, obtenu);
      if (!estNul(ecart)) {
        // Écart d'arrondi : posé sur le taux de la plus forte base, selon la règle choisie.
        const tauxMajoritaire = taux.reduce((m, t) => (cmp(bases.get(t)!, bases.get(m)!) > 0 ? t : m), taux[0]);
        ajustements.push(ligneAjustement(undefined, "ecart_arrondi", "Écart d’arrondi de la répartition", ecart, tauxMajoritaire, "ecart_arrondi", ordreSuivant));
      }
    }
  } catch (e) {
    return { etat: "refuse", motif: e instanceof Error ? e.message : "Proposition impossible." };
  }

  const suivante: InstanceOuvrage = { ...instance, lignes: [...lignes, ...ajustements] };
  return {
    etat: "propose",
    strategie,
    instance: suivante,
    avant,
    apres: indicateursPrix(suivante),
    changementsPrix,
    lignesAjustement: ajustements.map((l) => ({
      cle: l.cle,
      designation: l.designation,
      montantHt: l.prixVenteHt,
      tauxTva: l.tauxTva,
    })),
  };
}
