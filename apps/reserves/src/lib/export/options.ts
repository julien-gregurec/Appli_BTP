import {
  estEnRetard, estStatutTermine,
  LIBELLES_PRIORITE, LIBELLES_STATUT,
  PRIORITES_RESERVE, STATUTS_RESERVE,
  type PrioriteReserve, type StatutReserve,
} from "@/lib/workflow";

/**
 * Options des listes de réserves imprimables.
 *
 * Ce module est PUR : il ne lit ni la base ni la session. Il traduit une URL en une
 * sélection, et une sélection en URL. Toute la console d'export, la page imprimable et
 * la route PDF partagent donc exactement la même lecture des paramètres — un document
 * ne peut pas contenir autre chose que ce que l'aperçu annonçait.
 *
 * IMPORTANT — périmètre de sécurité : les « vues » ci-dessous ne font que RESTREINDRE
 * un ensemble de lignes déjà filtré par la base sous la session de l'appelant
 * (`reserves_export_chantier`). Restreindre ne peut pas élargir : aucune de ces options
 * ne peut faire apparaître une réserve que l'utilisateur n'aurait pas le droit de voir.
 */

/** Vues métier du chantier — ce que l'on imprime réellement pour une réunion. */
export const VUES_EXPORT = [
  "toutes",
  "ouvertes",
  "attente_levee",
  "levees",
  "retard",
] as const;
export type VueExport = (typeof VUES_EXPORT)[number];

export const LIBELLES_VUE: Record<VueExport, string> = {
  toutes: "Toutes les réserves",
  ouvertes: "Ouvertes uniquement",
  attente_levee: "En attente de levée",
  levees: "Levées uniquement",
  retard: "En retard",
};

/** Deux formats, deux usages : la table pour la réunion, les fiches pour le traitement. */
export const FORMATS_EXPORT = ["synthetique", "detaillee"] as const;
export type FormatExport = (typeof FORMATS_EXPORT)[number];

export const LIBELLES_FORMAT: Record<FormatExport, string> = {
  synthetique: "Synthétique — une ligne par réserve",
  detaillee: "Détaillée — une fiche par réserve",
};

export const ORIENTATIONS_EXPORT = ["portrait", "paysage"] as const;
export type OrientationExport = (typeof ORIENTATIONS_EXPORT)[number];

export type OptionsExport = {
  intervenantId: string | null;
  vue: VueExport;
  statut: StatutReserve | null;
  priorite: PrioriteReserve | null;
  echeanceAvant: string | null;
  format: FormatExport;
  orientation: OrientationExport;
  photos: boolean;
  historique: boolean;
  plans: boolean;
};

/** Une réserve « à traiter » : ni levée, ni annulée. */
export function estOuverte(ligne: { statut: StatutReserve }): boolean {
  return !estStatutTermine(ligne.statut);
}

function dansUnEnsemble<T extends readonly string[]>(
  ensemble: T,
  valeur: string | null,
): T[number] | null {
  return valeur !== null && (ensemble as readonly string[]).includes(valeur)
    ? (valeur as T[number])
    : null;
}

function texte(
  query: Record<string, string | string[] | undefined>,
  cle: string,
): string | null {
  const valeur = query[cle];
  return typeof valeur === "string" && valeur !== "" ? valeur : null;
}

/** Une date ISO `AAAA-MM-JJ`, ou rien : jamais une chaîne arbitraire dans une URL de document. */
function dateIso(valeur: string | null): string | null {
  return valeur !== null && /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? valeur : null;
}

export function lireOptionsExport(
  query: Record<string, string | string[] | undefined>,
): OptionsExport {
  return {
    intervenantId: texte(query, "entreprise"),
    vue: dansUnEnsemble(VUES_EXPORT, texte(query, "vue")) ?? "toutes",
    statut: dansUnEnsemble(STATUTS_RESERVE, texte(query, "statut")),
    priorite: dansUnEnsemble(PRIORITES_RESERVE, texte(query, "priorite")),
    echeanceAvant: dateIso(texte(query, "echeance")),
    format: dansUnEnsemble(FORMATS_EXPORT, texte(query, "format")) ?? "synthetique",
    orientation: dansUnEnsemble(ORIENTATIONS_EXPORT, texte(query, "orientation")) ?? "portrait",
    // Les options coûteuses sont OPT-OUT sur la fiche détaillée et sans objet sur la
    // synthèse : une liste de réunion n'embarque ni photo ni historique.
    photos: texte(query, "photos") !== "0",
    historique: texte(query, "historique") !== "0",
    plans: texte(query, "plans") !== "0",
  };
}

/**
 * Sérialisation canonique : seules les valeurs qui S'ÉCARTENT du défaut voyagent. L'URL
 * d'un document reste donc lisible, et deux sélections identiques produisent la même URL.
 */
export function parametresExport(options: OptionsExport): URLSearchParams {
  const p = new URLSearchParams();
  if (options.intervenantId) p.set("entreprise", options.intervenantId);
  if (options.vue !== "toutes") p.set("vue", options.vue);
  if (options.statut) p.set("statut", options.statut);
  if (options.priorite) p.set("priorite", options.priorite);
  if (options.echeanceAvant) p.set("echeance", options.echeanceAvant);
  if (options.format !== "synthetique") p.set("format", options.format);
  if (options.orientation !== "portrait") p.set("orientation", options.orientation);
  if (!options.photos) p.set("photos", "0");
  if (!options.historique) p.set("historique", "0");
  if (!options.plans) p.set("plans", "0");
  return p;
}

export function suffixeExport(options: OptionsExport): string {
  const p = parametresExport(options).toString();
  return p ? `?${p}` : "";
}

/**
 * Filtres délégués à la base. La vue « levées » a évidemment besoin des réserves levées :
 * les exclure produirait un document systématiquement vide.
 */
export function filtresBase(options: OptionsExport) {
  return {
    intervenantId: options.intervenantId,
    statut: options.statut,
    priorite: options.priorite,
    echeanceAvant: options.echeanceAvant,
    inclureLevees: options.vue === "toutes" || options.vue === "levees",
  };
}

/** Restriction métier appliquée aux lignes déjà autorisées par la base. */
export function appliquerVue<T extends { statut: StatutReserve; echeance: string | null }>(
  lignes: T[],
  vue: VueExport,
  aujourdHui: Date = new Date(),
): T[] {
  switch (vue) {
    case "ouvertes":
      return lignes.filter(estOuverte);
    case "attente_levee":
      return lignes.filter((l) => l.statut === "levee_demandee");
    case "levees":
      return lignes.filter((l) => l.statut === "levee");
    case "retard":
      return lignes.filter((l) => estEnRetard(l, aujourdHui));
    case "toutes":
      return lignes;
  }
}

/**
 * Description littérale de la sélection, imprimée en tête du document. Un tirage sorti
 * d'une imprimante n'a plus d'URL : sans cette ligne, rien ne dit de quoi la liste est
 * la liste, et une liste partielle passe pour le chantier entier.
 */
export function decrireSelection(
  options: OptionsExport,
  entreprise: string | null,
): string[] {
  const filtres: string[] = [];
  if (entreprise) filtres.push(`entreprise : ${entreprise}`);
  if (options.vue !== "toutes") filtres.push(LIBELLES_VUE[options.vue].toLowerCase());
  if (options.statut) filtres.push(`statut : ${LIBELLES_STATUT[options.statut]}`);
  if (options.priorite) filtres.push(`priorité : ${LIBELLES_PRIORITE[options.priorite]}`);
  if (options.echeanceAvant) {
    filtres.push(
      `échéance au plus tard le ${new Date(options.echeanceAvant).toLocaleDateString("fr-FR")}`,
    );
  }
  return filtres;
}

/** Nom de fichier parlant : le destinataire reçoit souvent plusieurs tirages le même jour. */
export function nomFichierExport(
  chantier: string,
  entreprise: string | null,
  options: OptionsExport,
): string {
  const assainir = (valeur: string) =>
    valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const morceaux = ["reserves", assainir(chantier)];
  if (entreprise) morceaux.push(assainir(entreprise));
  if (options.vue !== "toutes") morceaux.push(assainir(LIBELLES_VUE[options.vue]));
  if (options.format === "detaillee") morceaux.push("detaille");
  return `${morceaux.join("-")}.pdf`;
}
