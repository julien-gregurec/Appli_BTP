/**
 * File de mutations et cache de consultation, sur IndexedDB.
 *
 * ── Pourquoi le NOM de la base porte l'identité ─────────────────────────────────────────
 *
 * Une base IndexedDB est indexée par origine, comme un cache de service worker. Une base
 * unique nommée « elsatia-gp » serait donc partagée par tous les comptes qui se connectent
 * sur l'appareil — et un téléphone de chantier est partagé.
 *
 * On pourrait filtrer chaque lecture sur un champ `entrepriseId`. Ce serait plus fragile :
 * il suffirait d'un seul appel qui oublie le filtre pour que les données d'une entreprise
 * s'affichent chez une autre, et rien ne le signalerait. Mettre l'identité dans le NOM de la
 * base rend l'erreur impossible plutôt qu'improbable : un mauvais compte n'ouvre pas la
 * mauvaise base, il ouvre une base VIDE.
 *
 * C'est aussi ce qui rend la purge triviale et complète : `deleteDatabase`, et il ne reste
 * rien — pas de résidu qu'un filtre aurait manqué.
 *
 * ── Ce qui est stocké, et ce qui ne l'est jamais ────────────────────────────────────────
 *
 * `mutations` : le travail préparé sur l'appareil et pas encore transmis.
 * `consultation` : la copie des données explicitement demandées hors ligne (chantiers
 *                  récents, documents choisis). Jamais un jeton, jamais un secret.
 */
import { estCleGestionPro } from "@/lib/mobile/identite-locale";
import type { EtatMutation, MutationLocale } from "@/lib/mobile/offline/contrat";
import { ETATS_EN_SUSPENS } from "@/lib/mobile/offline/contrat";

const VERSION_SCHEMA = 1;
export const MAGASIN_MUTATIONS = "mutations";
export const MAGASIN_CONSULTATION = "consultation";

export type IdentiteBase = { entrepriseId: string; utilisateurId: string };

/** Le nom porte l'identité : un mauvais compte ouvre une base vide, jamais celle d'un autre. */
export function nomBase(identite: IdentiteBase): string {
  return `elsatia:gp:${identite.entrepriseId}:${identite.utilisateurId}`;
}

export function estBaseGestionPro(nom: string): boolean {
  return estCleGestionPro(nom);
}

function indexedDbDisponible(): IDBFactory | null {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    // Certains navigateurs lèvent à la simple lecture en navigation privée.
    return null;
  }
}

export async function ouvrirBase(identite: IdentiteBase): Promise<IDBDatabase | null> {
  const fabrique = indexedDbDisponible();
  if (!fabrique) return null;

  return new Promise((resoudre) => {
    let requete: IDBOpenDBRequest;
    try {
      requete = fabrique.open(nomBase(identite), VERSION_SCHEMA);
    } catch {
      resoudre(null);
      return;
    }

    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASIN_MUTATIONS)) {
        const magasin = base.createObjectStore(MAGASIN_MUTATIONS, { keyPath: "id" });
        magasin.createIndex("etat", "etat", { unique: false });
        magasin.createIndex("capteA", "capteA", { unique: false });
      }
      if (!base.objectStoreNames.contains(MAGASIN_CONSULTATION)) {
        base.createObjectStore(MAGASIN_CONSULTATION, { keyPath: "cle" });
      }
    };

    // Toute défaillance rend `null` plutôt que de lever : l'absence de stockage local
    // dégrade l'application (plus de hors-ligne), elle ne doit pas l'empêcher de servir.
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => resoudre(null);
    requete.onblocked = () => resoudre(null);
  });
}

function promesse<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

export async function inscrireMutation(base: IDBDatabase, mutation: MutationLocale): Promise<void> {
  const tx = base.transaction(MAGASIN_MUTATIONS, "readwrite");
  await promesse(tx.objectStore(MAGASIN_MUTATIONS).put(mutation));
}

export async function lireMutations(base: IDBDatabase): Promise<MutationLocale[]> {
  const tx = base.transaction(MAGASIN_MUTATIONS, "readonly");
  const toutes = await promesse(tx.objectStore(MAGASIN_MUTATIONS).getAll() as IDBRequest<MutationLocale[]>);
  // Ordre de CAPTURE, pas d'insertion : une arrivée doit partir avant le départ qu'elle
  // précède, faute de quoi le serveur refuse la clôture d'une session qui n'existe pas encore.
  return toutes.sort((a, b) => a.capteA - b.capteA);
}

export async function lireMutationsEnSuspens(base: IDBDatabase): Promise<MutationLocale[]> {
  return (await lireMutations(base)).filter((m) => ETATS_EN_SUSPENS.includes(m.etat));
}

export async function changerEtat(
  base: IDBDatabase,
  id: string,
  etat: EtatMutation,
  motif?: string,
): Promise<void> {
  const tx = base.transaction(MAGASIN_MUTATIONS, "readwrite");
  const magasin = tx.objectStore(MAGASIN_MUTATIONS);
  const mutation = await promesse(magasin.get(id) as IDBRequest<MutationLocale | undefined>);
  if (!mutation) return;
  await promesse(magasin.put({ ...mutation, etat, motif }));
}

/**
 * Écrit une donnée de consultation hors ligne.
 *
 * Réservé à ce que l'utilisateur a EXPLICITEMENT demandé à emporter. Rien n'est mis de côté
 * « au cas où » : un cache implicite finit toujours par contenir plus que ce que son auteur
 * croyait, et personne ne sait plus dire ce qui dort sur l'appareil.
 */
export async function ecrireConsultation(base: IDBDatabase, cle: string, valeur: unknown): Promise<void> {
  const tx = base.transaction(MAGASIN_CONSULTATION, "readwrite");
  await promesse(tx.objectStore(MAGASIN_CONSULTATION).put({ cle, valeur, ecritA: Date.now() }));
}

export async function lireConsultation<T>(base: IDBDatabase, cle: string): Promise<T | null> {
  const tx = base.transaction(MAGASIN_CONSULTATION, "readonly");
  const ligne = await promesse(
    tx.objectStore(MAGASIN_CONSULTATION).get(cle) as IDBRequest<{ valeur: T } | undefined>,
  );
  return ligne ? ligne.valeur : null;
}

/**
 * Supprime toutes les bases de Gestion Pro présentes sur l'appareil.
 *
 * Toutes, et pas seulement celle de la session courante : l'appareil peut porter les restes
 * d'un compte précédent, et personne n'est là pour les réclamer.
 *
 * `databases()` n'existe pas sur Firefox. Quand elle manque, on ne peut pas énumérer — la
 * fonction rend alors `0` et le dit par sa valeur de retour, plutôt que de laisser croire à
 * une purge complète. C'est une limite réelle, consignée comme telle.
 */
export async function purgerBasesLocales(): Promise<number> {
  const fabrique = indexedDbDisponible();
  if (!fabrique || typeof fabrique.databases !== "function") return 0;

  let bases: { name?: string }[];
  try {
    bases = await fabrique.databases();
  } catch {
    return 0;
  }

  let supprimees = 0;
  for (const { name } of bases) {
    if (!name || !estBaseGestionPro(name)) continue;
    await new Promise<void>((resoudre) => {
      const requete = fabrique.deleteDatabase(name);
      requete.onsuccess = () => { supprimees += 1; resoudre(); };
      requete.onerror = () => resoudre();
      // Un onglet resté ouvert bloque la suppression : on n'attend pas indéfiniment.
      requete.onblocked = () => resoudre();
    });
  }
  return supprimees;
}
