/**
 * Import d'un catalogue d'articles — module PUR.
 *
 * Ce module PLANIFIE et n'écrit rien. Il reçoit les lignes d'un fichier déjà lu, le catalogue
 * de l'entreprise et ses fournisseurs, et rend pour CHAQUE ligne ce qui se passerait :
 * création, mise à jour limitée aux champs qui changent réellement, ou refus motivé. Une action
 * serveur appliquera ce plan plus tard, après relecture : un import touche des centaines de prix
 * d'un coup, il ne doit rien faire que l'utilisateur n'ait vu ligne à ligne.
 *
 * ── Règles qui ne se négocient pas ──────────────────────────────────────────────────────
 *
 * 1. Le rapprochement se fait sur UNE colonne choisie, comparée par `normaliser()`. Aucune autre
 *    colonne ne sert à décider qu'une ligne « est » un article existant.
 * 2. Jamais de fusion silencieuse. Une clé partagée par plusieurs articles du catalogue ne met à
 *    jour AUCUN d'eux ; une clé répétée dans le fichier n'est traitée qu'à sa première occurrence.
 * 3. `reference_interne`, `reference_fabricant` et `code_barres` sont trois champs DISTINCTS :
 *    aucune valeur n'est recopiée de l'un vers l'autre.
 * 4. Une cellule vide ne vaut jamais effacement : en mise à jour, elle laisse le champ intact.
 *    Dans un fichier, une colonne vide signifie aussi bien « je n'avais pas l'information » que
 *    « à effacer » ; effacer se fait sur la fiche de l'article, où l'intention est sans ambiguïté.
 * 5. Un fournisseur n'est JAMAIS créé par un import : un nom inconnu refuse la ligne. Une faute
 *    de frappe créerait sinon un second « Würth » que plus personne ne rapprocherait.
 * 6. La valeur ORIGINALE est conservée, débarrassée de ses seuls blancs extérieurs. La forme
 *    normalisée ne sert qu'à comparer ; elle n'est jamais écrite.
 *
 * ── Deux choix assumés ──────────────────────────────────────────────────────────────────
 *
 * - « - » n'a rien de spécial : c'est une valeur comme une autre, écrite telle quelle. Certains
 *   logiciels l'emploient pour « aucun », d'autres dans de vraies références ; deviner serait
 *   effacer des données en silence. Le plan montre la valeur, l'utilisateur voit ce qu'il importe.
 *   Seule exception, mécanique : dans la colonne CLÉ, « - » se normalise en chaîne vide et ne peut
 *   rapprocher aucun article — la ligne est alors « reference_absente ».
 * - L'échappement anti-formule que pose `csv()` (src/lib/csv.ts) est retiré à la lecture : une
 *   cellule « '-A12 » redevient « -A12 ». Sans cela, exporter puis réimporter le catalogue
 *   ajouterait une apostrophe à chaque référence commençant par `-`, `=`, `+` ou `@`, et ne
 *   rapprocherait plus ces articles. Seule une apostrophe suivie de l'un de ces quatre caractères
 *   est retirée : c'est exactement, et uniquement, ce que `csv()` ajoute.
 */

import { normaliser } from "@/lib/devis/recherche-articles";

// ── Types ─────────────────────────────────────────────────────────────────────

/** En-têtes reconnus, en snake_case, insensibles à la casse et aux blancs extérieurs. */
export const COLONNES_IMPORT_CATALOGUE = [
  "reference_interne",
  "reference_fabricant",
  "code_barres",
  "designation",
  "description",
  "fabricant",
  "fournisseur",
  "unite",
  "prix_achat_ht",
  "prix_vente_ht",
  "taux_tva",
  "categorie",
  "actif",
] as const;

export type ColonneImportCatalogue = (typeof COLONNES_IMPORT_CATALOGUE)[number];

export type ArticleExistant = {
  id: string;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  codeBarres: string | null;
  designation: string;
  description: string | null;
  fabricant: string | null;
  fournisseurId: string | null;
  unite: string;
  prixAchatHt: number | null;
  prixVenteHt: number;
  tauxTva: number | null;
  categorie: string | null;
  actif: boolean;
};

export type FournisseurConnu = { id: string; nom: string; reference: string };

export type CleRapprochement = "reference_interne" | "reference_fabricant" | "code_barres" | "aucune";

export type OptionsImport = {
  cleRapprochement: CleRapprochement;
  /** Droit de l'utilisateur, vérifié par l'appelant. Faux : le prix d'achat n'est ni lu ni importé. */
  peutModifierPrixAchat: boolean;
};

export type StatutLigneImport =
  | "creee"
  | "mise_a_jour"
  | "ignoree"
  | "doublon"
  | "reference_absente"
  | "fournisseur_inconnu"
  | "valeur_invalide"
  | "refusee";

export const STATUTS_LIGNE_IMPORT: readonly StatutLigneImport[] = [
  "creee",
  "mise_a_jour",
  "ignoree",
  "doublon",
  "reference_absente",
  "fournisseur_inconnu",
  "valeur_invalide",
  "refusee",
];

/** Tout ce qu'un import sait écrire : l'article sans son identifiant. */
export type ChampsArticle = Omit<ArticleExistant, "id">;

/**
 * Création : tous les champs, `null` pour une cellule vide — sauf le prix d'achat, présent
 * SEULEMENT quand il est importé. Une clé absente, et non `null` : l'action serveur ne peut pas
 * écrire par mégarde un prix d'achat que l'utilisateur n'avait pas le droit de fixer.
 */
export type DonneesCreation = Omit<ChampsArticle, "prixAchatHt"> & { prixAchatHt?: number };

/** Mise à jour : les SEULS champs qui changent réellement. Jamais `null` (règle 4). */
export type DonneesMiseAJour = Partial<Omit<ChampsArticle, "prixAchatHt"> & { prixAchatHt: number }>;

type Commun = {
  /** Numéro de ligne du fichier : l'en-tête est la ligne 1, la première donnée la ligne 2. */
  numeroLigne: number;
  message: string;
};

export type LigneImport =
  | (Commun & { statut: "creee"; donnees: DonneesCreation })
  | (Commun & { statut: "mise_a_jour"; articleId: string; donnees: DonneesMiseAJour })
  | (Commun & { statut: "ignoree"; articleId?: string })
  /**
   * `articleIds` : les articles du catalogue qui partagent la clé (doublon en base).
   * `premiereLigne` : la ligne du fichier qui porte déjà cette clé (doublon dans le fichier).
   */
  | (Commun & { statut: "doublon"; articleIds?: string[]; premiereLigne?: number })
  /** `articleId` : l'article visé, quand la clé l'a identifié avant le refus. */
  | (Commun & { statut: "reference_absente" | "fournisseur_inconnu" | "valeur_invalide" | "refusee"; articleId?: string });

export type PlanImportCatalogue = {
  lignes: LigneImport[];
  synthese: Record<StatutLigneImport, number>;
  /** En-têtes non reconnus, ignorés — à montrer : une colonne mal nommée est une donnée perdue. */
  colonnesInconnues: string[];
  /** Colonnes présentes plusieurs fois (« Designation » et « designation ») : tout est refusé. */
  colonnesEnDouble: ColonneImportCatalogue[];
};

/** Champ de l'article alimenté par chaque colonne. */
const CHAMP_PAR_COLONNE = {
  reference_interne: "referenceInterne",
  reference_fabricant: "referenceFabricant",
  code_barres: "codeBarres",
  designation: "designation",
  description: "description",
  fabricant: "fabricant",
  fournisseur: "fournisseurId",
  unite: "unite",
  prix_achat_ht: "prixAchatHt",
  prix_vente_ht: "prixVenteHt",
  taux_tva: "tauxTva",
  categorie: "categorie",
  actif: "actif",
} as const satisfies Record<ColonneImportCatalogue, keyof ChampsArticle>;

type Cellules = Record<ColonneImportCatalogue, string>;

// ── Lecture des cellules ──────────────────────────────────────────────────────

/** Retire l'apostrophe que `csv()` pose devant `=`, `+`, `-` et `@` — et elle seule. */
function sansEchappementFormule(valeur: string): string {
  return /^'[=+\-@]/.test(valeur) ? valeur.slice(1) : valeur;
}

function cellule(brute: unknown): string {
  return sansEchappementFormule(String(brute ?? "").trim());
}

type Entete = {
  presentes: ReadonlySet<ColonneImportCatalogue>;
  colonnesInconnues: string[];
  colonnesEnDouble: ColonneImportCatalogue[];
  lire: (ligne: Readonly<Record<string, string>>) => Cellules;
};

/**
 * Reconnaît les colonnes. `trim()` retire aussi un BOM resté collé au premier en-tête, ce que
 * laissent passer certains lecteurs CSV sur un fichier enregistré par Excel.
 */
function analyserEntete(lignes: readonly Readonly<Record<string, string>>[]): Entete {
  const origines = new Map<ColonneImportCatalogue, Set<string>>();
  const inconnues = new Set<string>();
  for (const ligne of lignes) {
    for (const cle of Object.keys(ligne)) {
      const canon = cle.trim().toLowerCase();
      if ((COLONNES_IMPORT_CATALOGUE as readonly string[]).includes(canon)) {
        const colonne = canon as ColonneImportCatalogue;
        origines.set(colonne, (origines.get(colonne) ?? new Set<string>()).add(cle));
      } else if (canon) {
        inconnues.add(cle.trim());
      }
    }
  }
  const source = new Map<ColonneImportCatalogue, string>();
  const enDouble: ColonneImportCatalogue[] = [];
  for (const colonne of COLONNES_IMPORT_CATALOGUE) {
    const cles = [...(origines.get(colonne) ?? [])];
    if (cles.length === 1) source.set(colonne, cles[0]);
    if (cles.length > 1) enDouble.push(colonne);
  }
  return {
    presentes: new Set(source.keys()),
    colonnesInconnues: [...inconnues],
    colonnesEnDouble: enDouble,
    lire: (ligne) => {
      const c = {} as Cellules;
      for (const colonne of COLONNES_IMPORT_CATALOGUE) {
        const cle = source.get(colonne);
        c[colonne] = cle === undefined ? "" : cellule(ligne[cle]);
      }
      return c;
    },
  };
}

/**
 * Lit un nombre : « 1 234,50 », « 1234.5 », « 12,50 € », « 20 % ».
 *
 * Refuse ce qui mélange virgule et point (« 1.234,50 », « 1,234.50 ») : selon le pays d'origine
 * du fichier, l'un ou l'autre sépare les milliers, et se tromper multiplie un prix par mille.
 * Refuser la ligne coûte une correction ; deviner coûte un devis faux.
 */
function lireNombre(texte: string, suffixe: string): { valeur: number; decimales: number } | null {
  let t = texte.replace(/\s/g, "");
  if (t.endsWith(suffixe)) t = t.slice(0, -suffixe.length);
  const m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(t);
  if (!m) return null;
  const valeur = Number(`${m[1]}${m[2]}.${m[3] ?? "0"}`);
  if (!Number.isFinite(valeur)) return null;
  return { valeur: valeur === 0 ? 0 : valeur, decimales: (m[3] ?? "").length };
}

/** Une `Map`, pas un objet : `normaliser("constructor")` ne doit rien trouver. */
const VALEURS_ACTIF = new Map<string, boolean>([
  ["oui", true], ["true", true], ["1", true], ["actif", true],
  ["non", false], ["false", false], ["0", false], ["archive", false],
]);

type Valeurs = { prixAchatHt?: number; prixVenteHt?: number; tauxTva?: number; actif?: boolean };

/**
 * Lit et contrôle les colonnes typées. Une cellule vide ne produit rien (règle 4).
 *
 * Prix et taux : deux décimales au plus. Les colonnes de prix du catalogue sont des
 * `numeric(12,2)` : un troisième chiffre serait arrondi en silence par la base, puis chaque
 * import suivant croirait voir un changement. Le même garde-fou attrape « 12.500 » écrit à
 * l'allemande pour douze mille cinq cents.
 *
 * Sans le droit de modifier les prix d'achat, `prix_achat_ht` n'est pas même lu : une valeur
 * qui ne sera pas importée ne doit pas pouvoir bloquer la ligne.
 */
function lireValeurs(c: Cellules, lirePrixAchat: boolean): { valeurs: Valeurs; erreurs: string[] } {
  const valeurs: Valeurs = {};
  const erreurs: string[] = [];

  const decimal = (colonne: ColonneImportCatalogue, suffixe: string, max: number, quoi: string): number | undefined => {
    const texte = c[colonne];
    if (!texte) return undefined;
    const n = lireNombre(texte, suffixe);
    if (!n) erreurs.push(`${colonne} : « ${texte} » n’est pas un nombre.`);
    else if (n.valeur < 0) erreurs.push(`${colonne} : « ${texte} » — ${quoi} ne peut pas être négatif.`);
    else if (n.valeur > max) erreurs.push(`${colonne} : « ${texte} » dépasse ${max}.`);
    else if (n.decimales > 2) erreurs.push(`${colonne} : « ${texte} » — deux décimales au plus.`);
    else return n.valeur;
    return undefined;
  };

  if (lirePrixAchat) valeurs.prixAchatHt = decimal("prix_achat_ht", "€", 9_999_999_999.99, "un prix");
  valeurs.prixVenteHt = decimal("prix_vente_ht", "€", 9_999_999_999.99, "un prix");
  valeurs.tauxTva = decimal("taux_tva", "%", 100, "un taux");
  if (c.actif) {
    const actif = VALEURS_ACTIF.get(normaliser(c.actif));
    if (actif === undefined) {
      erreurs.push(`actif : « ${c.actif} » n’est pas compris (attendu : oui, non, true, false, 1, 0, actif ou archivé).`);
    } else {
      valeurs.actif = actif;
    }
  }
  return { valeurs, erreurs };
}

// ── Planification ─────────────────────────────────────────────────────────────

function indexer<T>(elements: readonly T[], cles: (e: T) => Array<string | null>): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const e of elements) {
    for (const cle of new Set(cles(e).map(normaliser))) {
      if (cle) index.set(cle, [...(index.get(cle) ?? []), e]);
    }
  }
  return index;
}

/**
 * Plan d'import d'un catalogue : une entrée par ligne du fichier, dans l'ordre, et la synthèse.
 *
 * Ordre des contrôles d'une ligne, et pourquoi :
 *   1. ligne vide → ignorée ;
 *   2. clé absente ou vide → `reference_absente` ;
 *   3. clé déjà vue plus haut dans le fichier → `doublon`. La PREMIÈRE occurrence possède la clé,
 *      même si elle est ensuite refusée : décider laquelle de deux lignes contradictoires « gagne »
 *      revient à l'utilisateur, pas à l'ordre des contrôles ;
 *   4. clé partagée par plusieurs articles du catalogue → `doublon`, aucun article touché ;
 *   5. valeurs illisibles → `valeur_invalide` (toutes les colonnes fautives sont nommées) ;
 *   6. fournisseur introuvable ou ambigu → `fournisseur_inconnu` ;
 *   7. création (champs obligatoires, sinon `refusee`) ou mise à jour (sinon `ignoree`).
 *
 * En mise à jour, la colonne clé elle-même n'est jamais réécrite : elle a IDENTIFIÉ l'article,
 * et « BA 13 » dans le fichier face à « BA13 » en base est une variante d'écriture, pas une
 * demande de changement.
 */
export function planifierImportCatalogue(
  lignes: readonly Readonly<Record<string, string>>[],
  existants: readonly ArticleExistant[],
  fournisseurs: readonly FournisseurConnu[],
  options: OptionsImport,
): PlanImportCatalogue {
  const entete = analyserEntete(lignes);
  const colonneCle = options.cleRapprochement === "aucune" ? null : options.cleRapprochement;
  const parCle = colonneCle
    ? indexer(existants, (a) => [a[CHAMP_PAR_COLONNE[colonneCle]]])
    : new Map<string, ArticleExistant[]>();
  const parFournisseur = indexer(fournisseurs, (f) => [f.nom, f.reference]);
  const premieres = new Map<string, number>();

  const planifierLigne = (brute: Readonly<Record<string, string>>, numeroLigne: number): LigneImport => {
    if (entete.colonnesEnDouble.length) {
      return {
        numeroLigne,
        statut: "refusee",
        message: `En-tête ambigu : ${entete.colonnesEnDouble.map((c) => `« ${c} »`).join(", ")} `
          + "apparaît plusieurs fois, impossible de savoir quelle colonne retenir. Aucune ligne n’est importée.",
      };
    }
    const c = entete.lire(brute);
    if (COLONNES_IMPORT_CATALOGUE.every((colonne) => !c[colonne])) {
      return { numeroLigne, statut: "ignoree", message: "Ligne vide." };
    }

    let cible: ArticleExistant | null = null;
    if (colonneCle) {
      const valeurCle = c[colonneCle];
      if (!entete.presentes.has(colonneCle)) {
        return {
          numeroLigne,
          statut: "reference_absente",
          message: `La colonne « ${colonneCle} », choisie comme clé de rapprochement, est absente du fichier.`,
        };
      }
      if (!valeurCle) {
        return {
          numeroLigne,
          statut: "reference_absente",
          message: `${colonneCle} est vide : la ligne ne peut être rapprochée d’aucun article.`,
        };
      }
      const cle = normaliser(valeurCle);
      if (!cle) {
        return {
          numeroLigne,
          statut: "reference_absente",
          message: `${colonneCle} « ${valeurCle} » ne contient ni lettre ni chiffre : impossible de s’en servir pour rapprocher un article.`,
        };
      }
      const premiere = premieres.get(cle);
      if (premiere !== undefined) {
        return {
          numeroLigne,
          statut: "doublon",
          premiereLigne: premiere,
          message: `${colonneCle} « ${valeurCle} » figure déjà à la ligne ${premiere} du fichier : seule la première occurrence est traitée.`,
        };
      }
      premieres.set(cle, numeroLigne);
      const candidats = parCle.get(cle) ?? [];
      if (candidats.length > 1) {
        return {
          numeroLigne,
          statut: "doublon",
          articleIds: candidats.map((a) => a.id),
          message: `${candidats.length} articles du catalogue partagent ${colonneCle} « ${valeurCle} » : aucun n’est modifié. `
            + "Distinguez-les dans le catalogue ou choisissez une autre clé de rapprochement.",
        };
      }
      cible = candidats[0] ?? null;
    }
    const vise = cible ? { articleId: cible.id } : {};

    const { valeurs, erreurs } = lireValeurs(c, options.peutModifierPrixAchat);
    if (erreurs.length) return { numeroLigne, statut: "valeur_invalide", message: erreurs.join(" "), ...vise };

    let fournisseurId: string | null = null;
    if (c.fournisseur) {
      const ids = [...new Set((parFournisseur.get(normaliser(c.fournisseur)) ?? []).map((f) => f.id))];
      if (ids.length !== 1) {
        return {
          numeroLigne,
          statut: "fournisseur_inconnu",
          message: ids.length === 0
            ? `Fournisseur « ${c.fournisseur} » introuvable, ni par son nom ni par sa référence. `
              + "Un import ne crée jamais de fournisseur : créez-le d’abord, puis relancez l’import."
            : `« ${c.fournisseur} » désigne ${ids.length} fournisseurs différents : impossible de choisir. `
              + "Indiquez plutôt la référence du fournisseur.",
          ...vise,
        };
      }
      fournisseurId = ids[0];
    }

    const noteAchat = !options.peutModifierPrixAchat && c.prix_achat_ht
      ? " Prix d’achat non importé : vous n’avez pas le droit de modifier les prix d’achat."
      : "";

    if (!cible) {
      const manquantes = (["designation", "unite", "prix_vente_ht"] as const).filter((colonne) => !c[colonne]);
      if (manquantes.length) {
        return {
          numeroLigne,
          statut: "refusee",
          message: `Création impossible : ${manquantes.join(", ")} `
            + `${manquantes.length > 1 ? "sont obligatoires" : "est obligatoire"} pour un nouvel article.`,
        };
      }
      const donnees: DonneesCreation = {
        referenceInterne: c.reference_interne || null,
        referenceFabricant: c.reference_fabricant || null,
        codeBarres: c.code_barres || null,
        designation: c.designation,
        description: c.description || null,
        fabricant: c.fabricant || null,
        fournisseurId,
        unite: c.unite,
        prixVenteHt: valeurs.prixVenteHt!,
        tauxTva: valeurs.tauxTva ?? null,
        categorie: c.categorie || null,
        actif: valeurs.actif ?? true,
      };
      if (options.peutModifierPrixAchat && valeurs.prixAchatHt !== undefined) donnees.prixAchatHt = valeurs.prixAchatHt;
      return { numeroLigne, statut: "creee", message: `Nouvel article « ${c.designation} ».${noteAchat}`, donnees };
    }

    // Valeur proposée par colonne ; `undefined` = cellule vide, champ laissé intact.
    const proposees: ReadonlyArray<readonly [ColonneImportCatalogue, string | number | boolean | undefined]> = [
      ["reference_interne", c.reference_interne || undefined],
      ["reference_fabricant", c.reference_fabricant || undefined],
      ["code_barres", c.code_barres || undefined],
      ["designation", c.designation || undefined],
      ["description", c.description || undefined],
      ["fabricant", c.fabricant || undefined],
      ["fournisseur", fournisseurId ?? undefined],
      ["unite", c.unite || undefined],
      ["prix_achat_ht", options.peutModifierPrixAchat ? valeurs.prixAchatHt : undefined],
      ["prix_vente_ht", valeurs.prixVenteHt],
      ["taux_tva", valeurs.tauxTva],
      ["categorie", c.categorie || undefined],
      ["actif", valeurs.actif],
    ];
    const donnees: Record<string, string | number | boolean> = {};
    const modifiees: ColonneImportCatalogue[] = [];
    for (const [colonne, valeur] of proposees) {
      const champ = CHAMP_PAR_COLONNE[colonne];
      if (valeur === undefined || colonne === colonneCle || valeur === cible[champ]) continue;
      donnees[champ] = valeur;
      modifiees.push(colonne);
    }
    if (!modifiees.length) {
      return { numeroLigne, statut: "ignoree", articleId: cible.id, message: `Aucun changement par rapport au catalogue.${noteAchat}` };
    }
    return {
      numeroLigne,
      statut: "mise_a_jour",
      articleId: cible.id,
      donnees: donnees as DonneesMiseAJour,
      message: `Modifié : ${modifiees.join(", ")}.${noteAchat}`,
    };
  };

  const plan = lignes.map((ligne, i) => planifierLigne(ligne, i + 2));
  const synthese = Object.fromEntries(STATUTS_LIGNE_IMPORT.map((s) => [s, 0])) as Record<StatutLigneImport, number>;
  for (const l of plan) synthese[l.statut] += 1;
  return {
    lignes: plan,
    synthese,
    colonnesInconnues: entete.colonnesInconnues,
    colonnesEnDouble: entete.colonnesEnDouble,
  };
}
