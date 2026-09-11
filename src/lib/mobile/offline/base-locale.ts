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
import { basesAPurger, inscrireAuRegistre, lireRegistre, oublierRegistre } from "@/lib/mobile/offline/registre-bases";
import type { EtatMutation, MutationLocale } from "@/lib/mobile/offline/contrat";
import { ETATS_EN_SUSPENS } from "@/lib/mobile/offline/contrat";

/**
 * Version 2 : ajout du magasin `justificatifs` (réserve R3).
 *
 * L'ouverture d'une base en version 1 existante déclenche `onupgradeneeded` ; on n'y crée que
 * ce qui manque. Les mutations déjà en file sont conservées — perdre une file au prétexte
 * d'une mise à jour de l'application serait exactement la perte silencieuse que la file
 * existe pour empêcher.
 */
const VERSION_SCHEMA = 3;
export const MAGASIN_MUTATIONS = "mutations";
export const MAGASIN_CONSULTATION = "consultation";
export const MAGASIN_JUSTIFICATIFS = "justificatifs";
/** Version 3 : documents emportés pour consultation hors ligne (phase G). */
export const MAGASIN_DOCUMENTS = "documents_emportes";

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
      if (!base.objectStoreNames.contains(MAGASIN_JUSTIFICATIFS)) {
        const magasin = base.createObjectStore(MAGASIN_JUSTIFICATIFS, { keyPath: "id" });
        // Retrouver les fichiers d'une note sans parcourir tout le magasin.
        magasin.createIndex("mutationId", "mutationId", { unique: false });
      }
      if (!base.objectStoreNames.contains(MAGASIN_DOCUMENTS)) {
        const magasin = base.createObjectStore(MAGASIN_DOCUMENTS, { keyPath: "id" });
        magasin.createIndex("chantierId", "chantierId", { unique: false });
      }
    };

    // Toute défaillance rend `null` plutôt que de lever : l'absence de stockage local
    // dégrade l'application (plus de hors-ligne), elle ne doit pas l'empêcher de servir.
    requete.onsuccess = () => {
      const base = requete.result;
      // Réserve R4. Une connexion restée OUVERTE bloque `deleteDatabase` : la purge de
      // déconnexion attendait alors indéfiniment, ou renonçait, et la base survivait. Chaque
      // connexion cède donc la place d'elle-même dès qu'une suppression — ou une montée de
      // version — est demandée, depuis cet onglet ou un autre.
      base.onversionchange = () => base.close();
      // On retient le NOM de la base : Firefox n'a pas `indexedDB.databases()`, et sans ce
      // registre la purge ne saurait pas quelles bases supprimer.
      try { inscrireAuRegistre(window.localStorage, nomBase(identite)); } catch { /* stockage refusé */ }
      resoudre(base);
    };
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
 * Réserve R4 fermée ici. La liste des bases est l'UNION du registre tenu par `ouvrirBase` et
 * de `indexedDB.databases()` quand elle existe — elle n'existe pas sur Firefox, où l'ancienne
 * version rendait 0 et laissait tout en place. La promesse ne se résout qu'une fois chaque
 * suppression ACHEVÉE : un `onblocked` n'est plus une sortie silencieuse, on attend que les
 * connexions ouvertes cèdent (elles se ferment d'elles-mêmes sur `versionchange`).
 */
export async function purgerBasesLocales(filtre?: (nom: string) => boolean): Promise<number> {
  const fabrique = indexedDbDisponible();
  if (!fabrique) return 0;

  let enumerees: string[] | null = null;
  if (typeof fabrique.databases === "function") {
    try { enumerees = (await fabrique.databases()).map((b) => b.name ?? ""); } catch { enumerees = null; }
  }
  let registre: string[] = [];
  try { registre = lireRegistre(window.localStorage); } catch { registre = []; }

  const cibles = basesAPurger(registre, enumerees).filter((nom) => estBaseGestionPro(nom) && (!filtre || filtre(nom)));

  let supprimees = 0;
  for (const nom of cibles) {
    const ok = await new Promise<boolean>((resoudre) => {
      const requete = fabrique.deleteDatabase(nom);
      requete.onsuccess = () => resoudre(true);
      requete.onerror = () => resoudre(false);
      // Bloquée : une connexion n'a pas encore cédé. On NE RÉSOUT PAS ici — `onsuccess`
      // viendra dès qu'elle se sera fermée. Un plafond évite seulement d'attendre à jamais un
      // onglet figé ; il rend `false`, et la base est comptée comme non purgée.
      requete.onblocked = () => { setTimeout(() => resoudre(false), 5_000); };
    });
    if (ok) supprimees += 1;
  }
  // Le registre n'est oublié que pour une purge COMPLÈTE : une purge partielle (changement
  // d'entreprise) doit laisser la trace des bases qu'elle n'a pas visées.
  if (!filtre) { try { oublierRegistre(window.localStorage); } catch { /* rien */ } }
  return supprimees;
}

// ── Justificatifs conservés sur l'appareil (réserve R3) ─────────────────────────

/**
 * Un fichier capturé hors ligne, en attente de dépôt.
 *
 * Le contenu est conservé en octets bruts (`ArrayBuffer`), ni en base64 — un ticket
 * photographié pèse plusieurs mégaoctets, et le coder en texte ajouterait un tiers de poids —
 * ni en `Blob` : WebKit REFUSE un `Blob` dans IndexedDB en contexte éphémère (navigation privée
 * de Safari, et contextes de Playwright) — mesuré : `NotReadableError`, la note n'était jamais
 * conservée sur iPhone. Des octets bruts passent partout. Un `Blob` déjà conservé reste lu.
 */
/** Octets d'un fichier conservé sur l'appareil. `Blob` : forme antérieure, encore lue. */
export type ContenuLocal = ArrayBuffer | Blob;

/** Reconstitue un `Blob` pour l'envoi ou la consultation, quelle que soit la forme conservée. */
export function enBlob(contenu: ContenuLocal, mime: string): Blob {
  return contenu instanceof Blob ? contenu : new Blob([contenu], { type: mime });
}

export type JustificatifLocal = {
  /** Identifiant propre au fichier : deux fichiers d'une même note ne se confondent jamais. */
  id: string;
  /** La note (mutation) à laquelle il appartient. */
  mutationId: string;
  nom: string;
  mime: string;
  taille: number;
  empreinte: string;
  contenu: ContenuLocal;
  depose: boolean;
  documentId: string | null;
};

export async function conserverJustificatif(base: IDBDatabase, justificatif: JustificatifLocal): Promise<void> {
  const tx = base.transaction(MAGASIN_JUSTIFICATIFS, "readwrite");
  await promesse(tx.objectStore(MAGASIN_JUSTIFICATIFS).put(justificatif));
}

export async function lireJustificatifs(base: IDBDatabase, mutationId: string): Promise<JustificatifLocal[]> {
  const tx = base.transaction(MAGASIN_JUSTIFICATIFS, "readonly");
  const index = tx.objectStore(MAGASIN_JUSTIFICATIFS).index("mutationId");
  return promesse(index.getAll(mutationId) as IDBRequest<JustificatifLocal[]>);
}

export async function marquerJustificatifDepose(
  base: IDBDatabase,
  id: string,
  documentId: string | null,
): Promise<void> {
  const tx = base.transaction(MAGASIN_JUSTIFICATIFS, "readwrite");
  const magasin = tx.objectStore(MAGASIN_JUSTIFICATIFS);
  const actuel = await promesse(magasin.get(id) as IDBRequest<JustificatifLocal | undefined>);
  if (!actuel) return;
  await promesse(magasin.put({ ...actuel, depose: true, documentId }));
}

/**
 * Supprime les fichiers d'une note — à l'annulation par l'utilisateur, ou une fois TOUS
 * déposés et acquittés. Jamais avant : effacer un fichier non déposé serait la perte
 * silencieuse que R3 interdit.
 */
export async function effacerJustificatifs(base: IDBDatabase, mutationId: string): Promise<void> {
  const fichiers = await lireJustificatifs(base, mutationId);
  const tx = base.transaction(MAGASIN_JUSTIFICATIFS, "readwrite");
  const magasin = tx.objectStore(MAGASIN_JUSTIFICATIFS);
  await Promise.all(fichiers.map((f) => promesse(magasin.delete(f.id))));
}


// ── Documents emportés pour consultation hors ligne (phase G) ────────────────────

export type DocumentEmporte = {
  id: string;
  chantierId: string;
  nom: string;
  mime: string;
  taille: number;
  contenu: ContenuLocal;
  /** Date de dernière synchronisation, affichée à l'utilisateur. */
  emporteA: number;
};

export async function conserverDocumentEmporte(base: IDBDatabase, document: DocumentEmporte): Promise<void> {
  const tx = base.transaction(MAGASIN_DOCUMENTS, "readwrite");
  await promesse(tx.objectStore(MAGASIN_DOCUMENTS).put(document));
}

export async function lireDocumentsEmportes(base: IDBDatabase, chantierId: string): Promise<DocumentEmporte[]> {
  const tx = base.transaction(MAGASIN_DOCUMENTS, "readonly");
  return promesse(tx.objectStore(MAGASIN_DOCUMENTS).index("chantierId").getAll(chantierId) as IDBRequest<DocumentEmporte[]>);
}

export async function retirerDocumentEmporte(base: IDBDatabase, id: string): Promise<void> {
  const tx = base.transaction(MAGASIN_DOCUMENTS, "readwrite");
  await promesse(tx.objectStore(MAGASIN_DOCUMENTS).delete(id));
}
