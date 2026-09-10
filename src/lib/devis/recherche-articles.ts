/**
 * Recherche et sélection multiple d'articles depuis un devis — module PUR.
 *
 * Phase L (exigence ajoutée au lot) : « référence interne et sélection multiple d'articles ».
 *
 * Ce module décide ; il ne lit ni n'écrit rien. Il reçoit des articles DÉJÀ restreints à
 * l'entreprise de l'utilisateur — la restriction réelle vit dans la base (RLS et RPC en
 * `SECURITY INVOKER`, voir la proposition SQL) — et il rend un classement, une sélection, des
 * lignes de devis. Tout ce qui compte s'éprouve donc sans navigateur ni base.
 *
 * ── Trois règles qui ne se négocient pas ────────────────────────────────────────────────
 *
 * 1. `reference_interne` et `reference_fabricant` sont deux champs DISTINCTS. Aucune fonction
 *    ici n'écrit l'une avec la valeur de l'autre, ni ne les fusionne en une seule clé.
 * 2. Deux articles de même référence restent DEUX articles. Rien n'est jamais dédoublonné
 *    automatiquement : une même référence peut désigner deux teintes, deux conditionnements,
 *    deux fournisseurs — c'est à l'humain de trancher, pas à un algorithme.
 * 3. La valeur ORIGINALE est conservée et affichée. La normalisation ne sert qu'à comparer.
 */

export type SourceCatalogue = "prestation" | "article";

export type ArticleCatalogue = {
  id: string;
  entrepriseId: string;
  source: SourceCatalogue;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  designation: string;
  description: string | null;
  fabricant: string | null;
  fournisseur: string | null;
  codeBarres: string | null;
  unite: string;
  /** `null` quand l'utilisateur n'a pas le droit de voir les prix d'achat. */
  prixAchatHt: number | null;
  prixVenteHt: number;
  tauxTva: number | null;
  /** `null` quand le module Stock n'est pas actif pour l'entreprise. */
  stockDisponible: number | null;
  actif: boolean;
};

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Forme de COMPARAISON d'une référence ou d'une recherche.
 *
 * Insensible à la casse, aux accents, aux espaces, aux tirets, aux points, aux barres et aux
 * soulignés : « BA-13.200 », « ba 13 200 » et « BA13200 » se comparent égaux. Cette forme n'est
 * JAMAIS affichée ni enregistrée à la place de l'original.
 */
export function normaliser(valeur: string | null | undefined): string {
  if (!valeur) return "";
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-._/\\]+/g, "");
}

// ── Classement ────────────────────────────────────────────────────────────────

/**
 * Niveau de pertinence d'un article pour une recherche — plus petit = plus pertinent.
 *
 *   1. référence interne exacte
 *   2. référence fabricant exacte
 *   3. référence interne qui COMMENCE par la recherche
 *   4. référence fabricant qui commence par la recherche
 *   5. correspondance partielle sur une référence ou le code-barres
 *   6. désignation, fabricant ou fournisseur
 *
 * `null` : aucune correspondance.
 */
export function rangCorrespondance(article: ArticleCatalogue, recherche: string): number | null {
  const q = normaliser(recherche);
  if (!q) return null;
  const ri = normaliser(article.referenceInterne);
  const rf = normaliser(article.referenceFabricant);
  const cb = normaliser(article.codeBarres);

  if (ri && ri === q) return 1;
  if (rf && rf === q) return 2;
  if (ri && ri.startsWith(q)) return 3;
  if (rf && rf.startsWith(q)) return 4;
  if ((ri && ri.includes(q)) || (rf && rf.includes(q)) || (cb && cb.includes(q))) return 5;
  for (const champ of [article.designation, article.fabricant, article.fournisseur]) {
    if (normaliser(champ).includes(q)) return 6;
  }
  return null;
}

/**
 * Articles correspondant à la recherche, classés.
 *
 * Défense en profondeur : on écarte tout article d'une autre entreprise, même si la base ne
 * devait jamais en renvoyer. Le coût est une comparaison ; l'absence de ce filtre ferait
 * reposer l'isolation sur un seul verrou.
 *
 * À rang égal, un article actif passe avant un archivé, puis ordre alphabétique de désignation.
 * Aucun doublon n'est fusionné : chaque identifiant reste une entrée.
 */
export function rechercherArticles(
  articles: readonly ArticleCatalogue[],
  recherche: string,
  entrepriseId: string,
): ArticleCatalogue[] {
  return articles
    .filter((a) => a.entrepriseId === entrepriseId)
    .map((a) => ({ a, rang: rangCorrespondance(a, recherche) }))
    .filter((x): x is { a: ArticleCatalogue; rang: number } => x.rang !== null)
    .sort((x, y) =>
      x.rang - y.rang
      || Number(y.a.actif) - Number(x.a.actif)
      || x.a.designation.localeCompare(y.a.designation, "fr"),
    )
    .map((x) => x.a);
}

/** Articles d'une même entreprise partageant une référence — à SIGNALER, jamais à fusionner. */
export function doublonsDeReference(
  articles: readonly ArticleCatalogue[],
  champ: "referenceInterne" | "referenceFabricant",
): Map<string, string[]> {
  const groupes = new Map<string, string[]>();
  for (const a of articles) {
    const cle = normaliser(a[champ]);
    if (!cle) continue;
    const cleComplete = `${a.entrepriseId}|${cle}`;
    groupes.set(cleComplete, [...(groupes.get(cleComplete) ?? []), a.id]);
  }
  for (const [cle, ids] of groupes) if (ids.length < 2) groupes.delete(cle);
  return groupes;
}

// ── Sélection multiple et lignes de devis ─────────────────────────────────────

export type Selection = {
  articleId: string;
  quantite: number;
  /** Modifiables seulement si les droits le permettent — le contrôle est côté appelant. */
  unite?: string;
  description?: string | null;
  /** Obligatoire pour un article archivé : l'ajout doit être CONSENTI. */
  confirmeArchive?: boolean;
};

/** Ligne de devis portant l'INSTANTANÉ de l'article au moment de l'ajout. */
export type LigneDevisInstantanee = {
  sourceCatalogue: SourceCatalogue;
  sourceId: string;
  referenceInterneInstantane: string | null;
  referenceFabricantInstantane: string | null;
  designation: string;
  description: string | null;
  quantite: number;
  unite: string;
  prixUnitaireHt: number;
  tauxTva: number | null;
};

/**
 * Instantané d'un article pour une ligne de devis.
 *
 * Une COPIE des valeurs, pas une référence vers l'article : si le catalogue change demain —
 * référence corrigée, prix revu, désignation reformulée — ce devis-ci ne bouge pas. Un devis
 * envoyé à un client est un engagement ; il ne doit pas se réécrire derrière son dos.
 */
export function instantaneLigne(article: ArticleCatalogue, selection: Selection): LigneDevisInstantanee {
  return {
    sourceCatalogue: article.source,
    sourceId: article.id,
    referenceInterneInstantane: article.referenceInterne,
    referenceFabricantInstantane: article.referenceFabricant,
    designation: article.designation,
    description: selection.description !== undefined ? selection.description : article.description,
    quantite: selection.quantite,
    unite: selection.unite ?? article.unite,
    prixUnitaireHt: article.prixVenteHt,
    tauxTva: article.tauxTva,
  };
}

export type DecisionDejaPresent = "additionner" | "nouvelle_ligne" | "annuler";

export type IssueAjout =
  | { etat: "ajoute"; lignes: LigneDevisInstantanee[] }
  | { etat: "decision_requise"; articlesDejaPresents: string[] }
  | { etat: "refuse"; motif: string };

/**
 * Ajoute une sélection de plusieurs articles à un devis, EN UNE ACTION.
 *
 * - chaque article sélectionné crée SA ligne ;
 * - aucune ligne existante n'est remplacée ;
 * - un article DÉJÀ présent exige une décision explicite (additionner, nouvelle ligne,
 *   annuler) : sans elle, rien n'est ajouté et l'appelant reçoit la liste à trancher ;
 * - un article archivé exige une confirmation explicite ;
 * - une quantité doit être un nombre strictement positif.
 */
export function ajouterSelection(
  lignesExistantes: readonly LigneDevisInstantanee[],
  selections: readonly Selection[],
  catalogue: readonly ArticleCatalogue[],
  decisions: Readonly<Record<string, DecisionDejaPresent>> = {},
): IssueAjout {
  const parId = new Map(catalogue.map((a) => [a.id, a]));

  for (const s of selections) {
    const article = parId.get(s.articleId);
    if (!article) return { etat: "refuse", motif: "Article introuvable dans le catalogue de l’entreprise." };
    if (!Number.isFinite(s.quantite) || s.quantite <= 0) {
      return { etat: "refuse", motif: `Quantité invalide pour « ${article.designation} ».` };
    }
    if (!article.actif && !s.confirmeArchive) {
      return { etat: "refuse", motif: `« ${article.designation} » est archivé : confirmez explicitement son ajout.` };
    }
  }

  const presents = new Set(lignesExistantes.map((l) => l.sourceId));
  const aTrancher = selections.map((s) => s.articleId).filter((id) => presents.has(id) && !decisions[id]);
  if (aTrancher.length) return { etat: "decision_requise", articlesDejaPresents: aTrancher };

  const lignes = lignesExistantes.map((l) => ({ ...l }));
  for (const s of selections) {
    const article = parId.get(s.articleId)!;
    const decision = presents.has(s.articleId) ? decisions[s.articleId] : "nouvelle_ligne";
    if (decision === "annuler") continue;
    if (decision === "additionner") {
      // On additionne sur la PREMIÈRE ligne de cet article, et sur elle seule : une
      // quantité ne se répartit jamais en silence sur plusieurs lignes.
      const cible = lignes.find((l) => l.sourceId === s.articleId)!;
      cible.quantite += s.quantite;
      continue;
    }
    lignes.push(instantaneLigne(article, s));
  }
  return { etat: "ajoute", lignes };
}

/** Avertissement à afficher avant d'ajouter un article archivé — `null` s'il est actif. */
export function avertissementArchive(article: ArticleCatalogue): string | null {
  return article.actif ? null : "Article archivé : il ne devrait plus être proposé. Confirmez pour l’ajouter malgré tout.";
}
