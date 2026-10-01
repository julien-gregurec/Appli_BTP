// Lecture complète d'une requête PostgREST, page par page, côté serveur
// (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
//
// PostgREST plafonne silencieusement chaque réponse à `max_rows` lignes
// (1 000 sur Supabase) : une requête sans `.range()` qui en attend davantage
// reçoit les 1 000 premières sans erreur, et tout total calculé ensuite côté
// Next est faux. Ce module relit la requête par tranches `.range()` jusqu'à
// épuisement.
//
// Règles :
// - la requête DOIT porter un ordre total et stable (dernier critère : une clé
//   unique, en pratique `id`), sinon deux pages peuvent se recouvrir ;
// - le nombre total attendu est demandé une fois (`count: "exact"`) : la
//   lecture continue tant qu'il n'est pas atteint, y compris si le serveur est
//   configuré avec un `max_rows` inférieur à la taille de page demandée ;
// - au-delà de `maxLignes`, la lecture échoue explicitement : elle ne rend
//   jamais un résultat tronqué.
//
// La requête s'exécute avec le client fourni (session de l'utilisateur) : RLS,
// isolation d'entreprise et permissions s'appliquent à chaque page.

export const TAILLE_PAGE_LECTURE = 1000;
export const MAX_LIGNES_LECTURE = 250_000;

type ErreurLecture = { message: string };
type ReponsePage<T> = { data: T[] | null; error: ErreurLecture | null; count?: number | null };
type RequetePaginable<T> = { range(debut: number, fin: number): PromiseLike<ReponsePage<T>> };
export type OptionsComptage = { count?: "exact" };

export class LectureTropVolumineuseError extends Error {
  constructor(readonly limite: number) {
    super(`Lecture interrompue : plus de ${limite} lignes à lire`);
    this.name = "LectureTropVolumineuseError";
  }
}

export async function lireToutesLesLignes<T>(
  construire: (options: OptionsComptage) => RequetePaginable<T>,
  { taillePage = TAILLE_PAGE_LECTURE, maxLignes = MAX_LIGNES_LECTURE }: { taillePage?: number; maxLignes?: number } = {},
): Promise<{ data: T[]; error: null } | { data: null; error: ErreurLecture }> {
  const lignes: T[] = [];
  let attendu: number | undefined;
  for (;;) {
    const premiere = attendu === undefined;
    const { data, error, count } = await construire(premiere ? { count: "exact" } : {}).range(lignes.length, lignes.length + taillePage - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    // Total inconnu (comptage non rendu) : seule une page vide prouve la fin.
    if (premiere) attendu = typeof count === "number" ? count : Number.POSITIVE_INFINITY;
    lignes.push(...page);
    if (lignes.length > maxLignes || (Number.isFinite(attendu) && (attendu ?? 0) > maxLignes)) return { data: null, error: new LectureTropVolumineuseError(maxLignes) };
    if (page.length === 0 || lignes.length >= (attendu ?? 0)) break;
  }
  return { data: lignes, error: null };
}

// Filtre `.in()` sur une longue liste d'identifiants : la liste part dans
// l'URL (≈ 37 caractères par UUID) et une requête de quelques centaines
// d'identifiants dépasse la longueur admise par la passerelle. On découpe en
// lots, chaque lot étant lui-même lu en entier page par page.
export const TAILLE_LOT_IDENTIFIANTS = 100;

export async function lireParLots<T>(
  identifiants: readonly string[],
  construire: (lot: string[], options: OptionsComptage) => RequetePaginable<T>,
  { tailleLot = TAILLE_LOT_IDENTIFIANTS, ...options }: { tailleLot?: number; taillePage?: number; maxLignes?: number } = {},
): Promise<{ data: T[]; error: null } | { data: null; error: ErreurLecture }> {
  const lignes: T[] = [];
  for (let i = 0; i < identifiants.length; i += tailleLot) {
    const lot = identifiants.slice(i, i + tailleLot);
    const resultat = await lireToutesLesLignes((o) => construire(lot, o), options);
    if (resultat.error) return resultat;
    lignes.push(...resultat.data);
  }
  return { data: lignes, error: null };
}
