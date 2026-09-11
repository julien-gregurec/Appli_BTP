/**
 * Application d'un plan d'import du catalogue — module PUR (les accès base sont injectés).
 *
 * `planifierImportCatalogue` (import-catalogue.ts) décide, ligne à ligne, ce qui DEVRAIT se passer.
 * Ce module traduit ce plan en opérations d'écriture puis les exécute au travers d'un « port »
 * fourni par l'action serveur, et rend le rapport final : chaque ligne garde le statut du plan,
 * sauf celles que la base a refusées, qui deviennent `refusee` avec un message lisible.
 *
 * ── Règles ──────────────────────────────────────────────────────────────────────────────
 *
 * 1. Liste BLANCHE de colonnes : seuls les champs connus de l'article sont écrits, sous leur nom de
 *    colonne. Le prix d'achat n'est JAMAIS écrit dans `prestations_catalogue` : il part dans
 *    `prestations_catalogue_couts`, et seulement si `peutModifierPrixAchat` — même si le plan en
 *    contient un (défense en profondeur : le droit est revérifié ici, pas seulement au planificateur).
 * 2. Une mise à jour n'écrit que les champs que le plan déclare changés, et jamais `null` (le
 *    planificateur n'efface rien ; ce module non plus).
 * 3. Un article n'est modifié qu'UNE fois par import. Le planificateur l'assure déjà (une clé
 *    partagée ou répétée donne `doublon`) ; si un plan désignait malgré tout deux fois le même
 *    article, la seconde ligne est refusée, jamais appliquée.
 * 4. Une création reçoit son identifiant AVANT l'insertion : le prix d'achat s'y rattache sans
 *    dépendre de l'ordre des lignes renvoyées par la base.
 * 5. Un lot d'insertion est une seule instruction SQL, donc tout ou rien. S'il échoue, il est rejoué
 *    ligne à ligne pour attribuer l'échec à la bonne ligne ; les autres passent.
 * 6. Le prix d'achat d'une ligne dont l'article a été refusé n'est pas écrit.
 */

import {
  STATUTS_LIGNE_IMPORT,
  type DonneesCreation,
  type PlanImportCatalogue,
  type StatutLigneImport,
} from "@/lib/devis/import-catalogue";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Colonnes de `prestations_catalogue` qu'un import sait écrire. Aucune colonne de coût. */
export type ChampsPrestationBase = {
  reference_interne?: string | null;
  reference_fabricant?: string | null;
  code_barres?: string | null;
  designation?: string;
  description?: string | null;
  fabricant?: string | null;
  fournisseur_id?: string | null;
  unite?: string;
  prix_unitaire_ht?: number;
  taux_tva?: number;
  categorie?: string | null;
  actif?: boolean;
};

export type InsertionPrestation = ChampsPrestationBase & { id: string; entreprise_id: string };

export type CoutPrestation = { prestation_id: string; entreprise_id: string; prix_achat_ht: number };

export type OperationsImportCatalogue = {
  creations: Array<{ numeroLigne: number; ligne: InsertionPrestation }>;
  misesAJour: Array<{ numeroLigne: number; articleId: string; champs: ChampsPrestationBase }>;
  couts: Array<{ numeroLigne: number; cout: CoutPrestation; origine: "creation" | "mise_a_jour" }>;
  /** Lignes refusées par les garde-fous de ce module (numéro de ligne → message). */
  refus: Map<number, string>;
};

/**
 * Accès base, injectés. Chaque méthode rend l'erreur rencontrée, ou `null` / `undefined` en cas de
 * succès. Une exception levée est traitée comme une erreur de la ligne (ou du lot).
 */
export type PortImportCatalogue = {
  insererPrestations(lignes: readonly InsertionPrestation[]): Promise<unknown>;
  /** Doit échouer si AUCUNE ligne n'a été modifiée (article invisible ou d'une autre entreprise). */
  mettreAJourPrestation(articleId: string, champs: ChampsPrestationBase): Promise<unknown>;
  enregistrerCouts(couts: readonly CoutPrestation[]): Promise<unknown>;
  /** Message montrable à l'utilisateur ; le détail technique reste dans les journaux serveur. */
  messageErreur(erreur: unknown): string;
};

export type LigneRapportImport = { numeroLigne: number; statut: StatutLigneImport; message: string };

/** Ce que l'action serveur renvoie à l'écran : aucun identifiant, aucune valeur lue en base. */
export type RapportImportCatalogue = {
  lignes: LigneRapportImport[];
  synthese: Record<StatutLigneImport, number>;
  colonnesInconnues: string[];
  colonnesEnDouble: string[];
};

// ── Traduction du plan en opérations ─────────────────────────────────────────

type ChampArticle = Exclude<keyof DonneesCreation, "prixAchatHt">;

const COLONNE_PAR_CHAMP: Record<ChampArticle, keyof ChampsPrestationBase> = {
  referenceInterne: "reference_interne",
  referenceFabricant: "reference_fabricant",
  codeBarres: "code_barres",
  designation: "designation",
  description: "description",
  fabricant: "fabricant",
  fournisseurId: "fournisseur_id",
  unite: "unite",
  prixVenteHt: "prix_unitaire_ht",
  tauxTva: "taux_tva",
  categorie: "categorie",
  actif: "actif",
};

/**
 * Champs de l'article → colonnes. En création, `null` (cellule vide) est écrit tel quel, sauf pour
 * le taux de TVA : la colonne est `NOT NULL`, la base applique son défaut. En mise à jour, `null`
 * n'est jamais écrit.
 */
function versColonnes(donnees: Partial<Record<ChampArticle, unknown>>, creation: boolean): ChampsPrestationBase {
  const champs: Record<string, unknown> = {};
  for (const champ of Object.keys(COLONNE_PAR_CHAMP) as ChampArticle[]) {
    if (!Object.prototype.hasOwnProperty.call(donnees, champ)) continue;
    const valeur = donnees[champ];
    if (valeur === undefined) continue;
    if (valeur === null && (!creation || champ === "tauxTva")) continue;
    champs[COLONNE_PAR_CHAMP[champ]] = valeur;
  }
  return champs as ChampsPrestationBase;
}

export function planifierOperationsImport(
  plan: PlanImportCatalogue,
  o: { entrepriseId: string; peutModifierPrixAchat: boolean; nouvelId: () => string },
): OperationsImportCatalogue {
  const ops: OperationsImportCatalogue = { creations: [], misesAJour: [], couts: [], refus: new Map() };
  const prixAchat = (d: { prixAchatHt?: unknown }): number | null =>
    o.peutModifierPrixAchat && typeof d.prixAchatHt === "number" && Number.isFinite(d.prixAchatHt) && d.prixAchatHt >= 0
      ? d.prixAchatHt
      : null;
  const vises = new Map<string, number>();

  for (const l of plan.lignes) {
    if (l.statut === "creee") {
      const id = o.nouvelId();
      ops.creations.push({ numeroLigne: l.numeroLigne, ligne: { ...versColonnes(l.donnees, true), id, entreprise_id: o.entrepriseId } });
      const p = prixAchat(l.donnees);
      if (p !== null) {
        ops.couts.push({ numeroLigne: l.numeroLigne, cout: { prestation_id: id, entreprise_id: o.entrepriseId, prix_achat_ht: p }, origine: "creation" });
      }
      continue;
    }
    if (l.statut !== "mise_a_jour") continue;

    const deja = vises.get(l.articleId);
    if (deja !== undefined) {
      ops.refus.set(l.numeroLigne, `Cet article est déjà modifié par la ligne ${deja} : un import ne modifie jamais deux fois le même article.`);
      continue;
    }
    vises.set(l.articleId, l.numeroLigne);
    const champs = versColonnes(l.donnees, false);
    const p = prixAchat(l.donnees);
    if (!Object.keys(champs).length && p === null) {
      ops.refus.set(l.numeroLigne, "Aucune modification autorisée pour cette ligne.");
      continue;
    }
    if (Object.keys(champs).length) ops.misesAJour.push({ numeroLigne: l.numeroLigne, articleId: l.articleId, champs });
    if (p !== null) {
      ops.couts.push({ numeroLigne: l.numeroLigne, cout: { prestation_id: l.articleId, entreprise_id: o.entrepriseId, prix_achat_ht: p }, origine: "mise_a_jour" });
    }
  }
  return ops;
}

// ── Exécution ─────────────────────────────────────────────────────────────────

async function essayer(f: () => Promise<unknown>): Promise<unknown> {
  try {
    return await f();
  } catch (e) {
    return e ?? new Error("Échec de l’écriture.");
  }
}

/** Écrit par lots ; un lot refusé est rejoué ligne à ligne pour attribuer chaque échec (règle 5). */
async function ecrireParLots<T>(
  elements: readonly T[],
  taille: number,
  ecrire: (lot: T[]) => Promise<unknown>,
  echec: (element: T, erreur: unknown) => void,
): Promise<void> {
  for (let i = 0; i < elements.length; i += taille) {
    const lot = elements.slice(i, i + taille);
    const erreur = await essayer(() => ecrire(lot));
    if (!erreur) continue;
    if (lot.length === 1) {
      echec(lot[0], erreur);
      continue;
    }
    for (const element of lot) {
      const erreurLigne = await essayer(() => ecrire([element]));
      if (erreurLigne) echec(element, erreurLigne);
    }
  }
}

async function enParallele<T>(elements: readonly T[], parallelisme: number, f: (e: T) => Promise<void>): Promise<void> {
  let suivant = 0;
  const travailleur = async () => {
    while (suivant < elements.length) {
      const e = elements[suivant++];
      await f(e);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallelisme, elements.length)) }, travailleur));
}

export async function appliquerOperationsImport(
  plan: PlanImportCatalogue,
  ops: OperationsImportCatalogue,
  port: PortImportCatalogue,
  o: { tailleLot?: number; parallelisme?: number } = {},
): Promise<RapportImportCatalogue> {
  const tailleLot = Math.max(1, o.tailleLot ?? 200);
  const parallelisme = Math.max(1, o.parallelisme ?? 6);
  const echecs = new Map<number, string>(ops.refus);

  await ecrireParLots(ops.creations, tailleLot, (lot) => port.insererPrestations(lot.map((c) => c.ligne)), (c, e) => {
    echecs.set(c.numeroLigne, `Création impossible : ${port.messageErreur(e)}`);
  });

  await enParallele(ops.misesAJour, parallelisme, async (m) => {
    const erreur = await essayer(() => port.mettreAJourPrestation(m.articleId, m.champs));
    if (erreur) echecs.set(m.numeroLigne, `Mise à jour impossible : ${port.messageErreur(erreur)}`);
  });

  const lignesModifiees = new Set(ops.misesAJour.map((m) => m.numeroLigne));
  const couts = ops.couts.filter((c) => !echecs.has(c.numeroLigne));
  await ecrireParLots(couts, tailleLot, (lot) => port.enregistrerCouts(lot.map((c) => c.cout)), (c, e) => {
    const message = port.messageErreur(e);
    echecs.set(
      c.numeroLigne,
      c.origine === "creation"
        ? `Article créé, mais son prix d’achat n’a pas été enregistré : ${message}`
        : lignesModifiees.has(c.numeroLigne)
          ? `Article mis à jour, mais son prix d’achat n’a pas été enregistré : ${message}`
          : `Prix d’achat non enregistré : ${message}`,
    );
  });

  const lignes: LigneRapportImport[] = plan.lignes.map((l) => {
    const echec = echecs.get(l.numeroLigne);
    return echec === undefined
      ? { numeroLigne: l.numeroLigne, statut: l.statut, message: l.message }
      : { numeroLigne: l.numeroLigne, statut: "refusee", message: echec };
  });
  const synthese = Object.fromEntries(STATUTS_LIGNE_IMPORT.map((s) => [s, 0])) as Record<StatutLigneImport, number>;
  for (const l of lignes) synthese[l.statut] += 1;
  return {
    lignes,
    synthese,
    colonnesInconnues: [...plan.colonnesInconnues],
    colonnesEnDouble: [...plan.colonnesEnDouble],
  };
}

/**
 * Message de repli propre à l'import pour une erreur de base connue, à passer à
 * `messageErreurUtilisateur` ; `undefined` : message générique par catégorie.
 */
export function repliErreurImport(erreur: unknown): string | undefined {
  const code = typeof erreur === "object" && erreur !== null && "code" in erreur ? String((erreur as { code?: unknown }).code) : "";
  switch (code) {
    case "23505":
      return "Un article du catalogue porte déjà cette désignation.";
    case "23514":
      return "Une valeur dépasse la longueur ou la plage autorisée (références : 120 caractères, code-barres : 64).";
    case "23503":
      return "Le fournisseur ou l’article visé n’appartient pas à cette entreprise.";
    case "23502":
      return "Une valeur obligatoire est manquante.";
    case "PGRST116":
      return "Article introuvable ou non modifiable.";
    default:
      return undefined;
  }
}
