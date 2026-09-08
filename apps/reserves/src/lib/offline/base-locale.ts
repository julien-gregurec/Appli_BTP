import {
  type EtatMutation, type Mutation, estEnSuspens, transitionAutorisee,
} from "./contrat";

/**
 * Stockage local hors-ligne — IndexedDB.
 *
 * POURQUOI INDEXEDDB, ET PAS `localStorage` :
 *   • `localStorage` est SYNCHRONE : chaque écriture bloque le fil principal, ce qui se
 *     voit immédiatement sur un téléphone de chantier ;
 *   • il ne stocke que des chaînes, donc une photo devrait y être encodée en base64,
 *     soit +33 % de volume pour une donnée qui est déjà le poste le plus lourd ;
 *   • son quota tourne autour de 5 Mo par origine — deux photos suffisent à le saturer,
 *     et le dépassement lève une exception au moment de l'écriture, c'est-à-dire au pire
 *     moment : après que l'utilisateur a cru enregistrer.
 * IndexedDB est asynchrone, stocke des `Blob` nativement, et offre un quota de l'ordre du
 * gigaoctet. Les photos y sont donc conservées telles quelles, sans réencodage.
 *
 * CLOISONNEMENT PAR LE NOM DE LA BASE.
 * Chaque couple (organisation, utilisateur) possède sa PROPRE base IndexedDB. Ce n'est
 * pas un filtre applicatif que l'on pourrait oublier dans une requête : deux identités
 * ouvrent deux bases distinctes, et rien de ce qui est écrit dans l'une n'est atteignable
 * depuis l'autre. Un changement de compte ne « filtre » pas les données précédentes — il
 * ne les ouvre simplement jamais.
 */

const PREFIXE = "elsatia-reserves";
const VERSION_SCHEMA = 1;

export const MAGASINS = {
  mutations: "mutations",
  photos: "photos",
  chantiers: "chantiers",
  reserves: "reserves",
  meta: "meta",
} as const;

export type Identite = { entrepriseId: string; utilisateurId: string };

/**
 * Nom de la base pour une identité. Les identifiants sont des uuid côté application ; on
 * refuse tout ce qui n'en est pas un plutôt que de composer un nom à partir d'une valeur
 * arbitraire, qui pourrait faire collisionner deux identités distinctes.
 */
export function nomBase(identite: Identite): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(identite.entrepriseId) || !uuid.test(identite.utilisateurId)) {
    throw new Error("Identité locale invalide : le cloisonnement ne peut pas être garanti");
  }
  return `${PREFIXE}::v${VERSION_SCHEMA}::${identite.entrepriseId}::${identite.utilisateurId}`;
}

function promesse<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

export function ouvrir(identite: Identite): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(nomBase(identite), VERSION_SCHEMA);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASINS.mutations)) {
        const magasin = base.createObjectStore(MAGASINS.mutations, { keyPath: "id" });
        magasin.createIndex("etat", "etat");
        magasin.createIndex("reserveId", "reserveId");
      }
      // Les photos vivent dans leur PROPRE magasin, indexées par mutation : la file reste
      // légère à parcourir même quand plusieurs dizaines de mégaoctets sont en attente.
      if (!base.objectStoreNames.contains(MAGASINS.photos)) {
        base.createObjectStore(MAGASINS.photos, { keyPath: "mutationId" });
      }
      if (!base.objectStoreNames.contains(MAGASINS.chantiers)) {
        base.createObjectStore(MAGASINS.chantiers, { keyPath: "id" });
      }
      if (!base.objectStoreNames.contains(MAGASINS.reserves)) {
        const magasin = base.createObjectStore(MAGASINS.reserves, { keyPath: "id" });
        magasin.createIndex("chantierId", "chantierId");
      }
      if (!base.objectStoreNames.contains(MAGASINS.meta)) {
        base.createObjectStore(MAGASINS.meta, { keyPath: "cle" });
      }
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

async function transaction<T>(
  identite: Identite,
  magasins: string[],
  mode: IDBTransactionMode,
  travail: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const base = await ouvrir(identite);
  try {
    const tx = base.transaction(magasins, mode);
    const resultat = await travail(tx);
    await new Promise<void>((resoudre, rejeter) => {
      tx.oncomplete = () => resoudre();
      tx.onerror = () => rejeter(tx.error);
      tx.onabort = () => rejeter(tx.error ?? new Error("Transaction locale interrompue"));
    });
    return resultat;
  } finally {
    base.close();
  }
}

// ── File de mutations ────────────────────────────────────────────────────────

export async function enregistrerMutation(
  identite: Identite, mutation: Mutation, photo?: Blob | null,
): Promise<void> {
  const magasins = photo ? [MAGASINS.mutations, MAGASINS.photos] : [MAGASINS.mutations];
  await transaction(identite, magasins, "readwrite", (tx) => {
    tx.objectStore(MAGASINS.mutations).put(mutation);
    if (photo) {
      // Le `Blob` est stocké TEL QUEL : aucune conversion, donc aucune perte ni
      // gonflement, et la preuve reste disponible jusqu'à confirmation du serveur.
      tx.objectStore(MAGASINS.photos).put({ mutationId: mutation.id, blob: photo });
    }
  });
}

export async function listerMutations(identite: Identite): Promise<Mutation[]> {
  return transaction(identite, [MAGASINS.mutations], "readonly", async (tx) =>
    (await promesse(tx.objectStore(MAGASINS.mutations).getAll())) as Mutation[]);
}

export async function lireMutation(
  identite: Identite, id: string,
): Promise<Mutation | undefined> {
  return transaction(identite, [MAGASINS.mutations], "readonly", async (tx) =>
    (await promesse(tx.objectStore(MAGASINS.mutations).get(id))) as Mutation | undefined);
}

export async function lirePhoto(identite: Identite, mutationId: string): Promise<Blob | null> {
  return transaction(identite, [MAGASINS.photos], "readonly", async (tx) => {
    const ligne = (await promesse(tx.objectStore(MAGASINS.photos).get(mutationId))) as
      { mutationId: string; blob: Blob } | undefined;
    return ligne?.blob ?? null;
  });
}

/**
 * Change l'état d'une mutation en respectant la machine à états.
 *
 * Une transition interdite n'est pas silencieusement ignorée : elle lève. Cela empêche
 * qu'un chemin de reprise mal écrit remette en file une mutation déjà acquittée — le
 * seul scénario capable de produire un doublon MALGRÉ les clés d'idempotence, si le
 * serveur venait à en perdre la trace.
 */
export async function changerEtat(
  identite: Identite,
  id: string,
  etat: EtatMutation,
  ajustements: Partial<Pick<Mutation,
    "derniereErreur" | "identifiantServeur" | "tentatives" | "payload">> = {},
): Promise<Mutation> {
  return transaction(identite, [MAGASINS.mutations], "readwrite", async (tx) => {
    const magasin = tx.objectStore(MAGASINS.mutations);
    const courante = (await promesse(magasin.get(id))) as Mutation | undefined;
    if (!courante) throw new Error(`Mutation locale ${id} introuvable`);
    if (courante.etat !== etat && !transitionAutorisee(courante.etat, etat)) {
      throw new Error(`Transition de file interdite : ${courante.etat} → ${etat}`);
    }
    const suivante: Mutation = {
      ...courante, ...ajustements, etat, modifieeA: new Date().toISOString(),
    };
    magasin.put(suivante);
    return suivante;
  });
}

/** Supprime une mutation ET sa photo : une file purgée ne laisse pas de pièce jointe. */
export async function supprimerMutation(identite: Identite, id: string): Promise<void> {
  await transaction(identite, [MAGASINS.mutations, MAGASINS.photos], "readwrite", (tx) => {
    tx.objectStore(MAGASINS.mutations).delete(id);
    tx.objectStore(MAGASINS.photos).delete(id);
  });
}

export async function compterEnSuspens(identite: Identite): Promise<number> {
  return (await listerMutations(identite)).filter((m) => estEnSuspens(m.etat)).length;
}

// ── Cache de lecture ─────────────────────────────────────────────────────────

export type ChantierCache = {
  id: string; nom: string; reference: string | null; ville: string | null;
  majA: string;
};

export type ReserveCache = {
  id: string; chantierId: string; numero: number; titre: string;
  description: string | null; statut: string; priorite: string;
  intervenant: string | null; echeance: string | null;
  plan: string | null; planPage: number | null; majA: string;
};

export async function memoriserChantiers(
  identite: Identite, chantiers: Omit<ChantierCache, "majA">[],
): Promise<void> {
  const majA = new Date().toISOString();
  await transaction(identite, [MAGASINS.chantiers], "readwrite", (tx) => {
    const magasin = tx.objectStore(MAGASINS.chantiers);
    for (const chantier of chantiers) magasin.put({ ...chantier, majA });
  });
}

export async function memoriserReserves(
  identite: Identite, reserves: Omit<ReserveCache, "majA">[],
): Promise<void> {
  const majA = new Date().toISOString();
  await transaction(identite, [MAGASINS.reserves], "readwrite", (tx) => {
    const magasin = tx.objectStore(MAGASINS.reserves);
    for (const reserve of reserves) magasin.put({ ...reserve, majA });
  });
}

export async function listerChantiersCache(identite: Identite): Promise<ChantierCache[]> {
  return transaction(identite, [MAGASINS.chantiers], "readonly", async (tx) =>
    (await promesse(tx.objectStore(MAGASINS.chantiers).getAll())) as ChantierCache[]);
}

export async function listerReservesCache(
  identite: Identite, chantierId?: string,
): Promise<ReserveCache[]> {
  const toutes = await transaction(identite, [MAGASINS.reserves], "readonly", async (tx) =>
    (await promesse(tx.objectStore(MAGASINS.reserves).getAll())) as ReserveCache[]);
  return chantierId ? toutes.filter((r) => r.chantierId === chantierId) : toutes;
}

export async function ecrireMeta(
  identite: Identite, cle: string, valeur: unknown,
): Promise<void> {
  await transaction(identite, [MAGASINS.meta], "readwrite", (tx) => {
    tx.objectStore(MAGASINS.meta).put({ cle, valeur });
  });
}

export async function lireMeta<T>(identite: Identite, cle: string): Promise<T | null> {
  return transaction(identite, [MAGASINS.meta], "readonly", async (tx) => {
    const ligne = (await promesse(tx.objectStore(MAGASINS.meta).get(cle))) as
      { cle: string; valeur: T } | undefined;
    return ligne?.valeur ?? null;
  });
}

// ── Purge ────────────────────────────────────────────────────────────────────

/**
 * Purge à la déconnexion.
 *
 * Le CACHE DE LECTURE part systématiquement : aucune donnée d'un chantier ne doit rester
 * lisible sur l'appareil après la déconnexion, et elle sera rechargée en une requête.
 *
 * La FILE, elle, est conservée par défaut. Supprimer un travail non transmis parce que
 * l'utilisateur s'est déconnecté — ou que sa session a expiré sur le chantier, ce qui est
 * le cas courant — lui ferait perdre des constats qu'il croit enregistrés. Elle reste
 * cloisonnée dans la base de SON identité : personne d'autre ne peut l'ouvrir, et
 * `envoyableSous()` la revérifie avant tout envoi.
 */
export async function purgerSession(
  identite: Identite, options: { viderFile?: boolean } = {},
): Promise<{ mutationsConservees: number }> {
  await transaction(identite, [MAGASINS.chantiers, MAGASINS.reserves, MAGASINS.meta],
    "readwrite", (tx) => {
      tx.objectStore(MAGASINS.chantiers).clear();
      tx.objectStore(MAGASINS.reserves).clear();
      tx.objectStore(MAGASINS.meta).clear();
    });

  if (options.viderFile) {
    await transaction(identite, [MAGASINS.mutations, MAGASINS.photos], "readwrite", (tx) => {
      tx.objectStore(MAGASINS.mutations).clear();
      tx.objectStore(MAGASINS.photos).clear();
    });
    return { mutationsConservees: 0 };
  }
  return { mutationsConservees: await compterEnSuspens(identite) };
}

/** Suppression totale de la base d'une identité — utilisée par la recette. */
export function effacerBase(identite: Identite): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.deleteDatabase(nomBase(identite));
    requete.onsuccess = () => resoudre();
    requete.onerror = () => rejeter(requete.error);
    requete.onblocked = () => resoudre();
  });
}
