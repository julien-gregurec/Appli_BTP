/**
 * Coeur, sans DOM, de la mise a jour PWA controlee par l'utilisateur
 * (lot ELSATIA-TOOLS-PWA-UPDATE-UX-AND-NETWORK-RESILIENCE-V1).
 *
 * Regle du lot : un nouveau service worker installe reste EN ATTENTE tant que l'utilisateur n'a
 * pas dit oui. Ce module observe l'enregistrement, expose un etat (`idle` / `available` /
 * `updating`) et n'envoie `SKIP_WAITING` que sur action explicite.
 *
 * Il ne depend que de formes structurelles (`RegistrationLike`, `ContainerLike`), compatibles avec
 * les types DOM reels : il se teste donc entierement en environnement `node`, sans navigateur.
 *
 * Trois gardes portent la surete du lot :
 *   1. Aucune banniere a la premiere installation — on n'annonce une mise a jour que si la page
 *      est deja controlee par un worker (`container.controller`), donc s'il y a bien un « avant ».
 *   2. Un seul rechargement — `reloaded` verrouille l'appel, quel que soit le nombre de
 *      `controllerchange` recus. Aucune boucle possible.
 *   3. Rechargement uniquement si CET onglet a demande la mise a jour (`requested`). Un autre
 *      onglet qui active la nouvelle version ne fait pas sauter le trace en cours ici : la
 *      banniere reste affichee et l'utilisateur recharge quand il veut.
 */

/** Sous-ensemble de `ServiceWorker` reellement utilise. */
export type WorkerLike = {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
};

/** Sous-ensemble de `ServiceWorkerRegistration` reellement utilise. */
export type RegistrationLike = {
  readonly waiting: WorkerLike | null;
  readonly installing: WorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  removeEventListener(type: "updatefound", listener: () => void): void;
};

/** Sous-ensemble de `ServiceWorkerContainer` reellement utilise. */
export type ContainerLike = {
  readonly controller: unknown;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
};

export type UpdateStatus = "idle" | "available" | "updating";

export type UpdateControllerOptions = {
  registration: RegistrationLike;
  container: ContainerLike;
  /** Notifie l'UI a chaque changement d'etat. */
  onStatus: (status: UpdateStatus) => void;
  /** Rechargement effectif de la page. Appele au plus une fois. */
  reload: () => void;
  /**
   * Mise a l'abri des donnees locales avant rechargement (autosave Atelier). Peut etre asynchrone ;
   * un rejet n'empeche pas la mise a jour — il est signale a `onError` puis ignore, car bloquer
   * laisserait l'utilisateur devant un bouton mort.
   */
  flushLocalState?: () => void | Promise<void>;
  /**
   * Delai au-dela duquel on considere que l'activation n'a pas eu lieu. On revient alors a
   * « mise a jour disponible » — surtout pas un rechargement a l'aveugle, qui ne changerait rien
   * et ferait clignoter l'application.
   */
  activationTimeoutMs?: number;
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
};

export const DEFAULT_ACTIVATION_TIMEOUT_MS = 12000;

export type UpdateController = {
  /** Etat courant, pour un rendu initial coherent. */
  status(): UpdateStatus;
  /** Action « Mettre a jour ». */
  applyUpdate(): Promise<void>;
  /** Action « Plus tard » : masque la banniere pour la session, sans rien persister. */
  dismiss(): void;
  dispose(): void;
};

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const {
    registration,
    container,
    onStatus,
    reload,
    flushLocalState,
    activationTimeoutMs = DEFAULT_ACTIVATION_TIMEOUT_MS,
    setTimeoutFn = ((callback: () => void, ms: number) => setTimeout(callback, ms)) as NonNullable<UpdateControllerOptions["setTimeoutFn"]>,
    clearTimeoutFn = ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)) as NonNullable<UpdateControllerOptions["clearTimeoutFn"]>,
    onError,
  } = options;

  let status: UpdateStatus = "idle";
  let pending: WorkerLike | null = null;
  /* Worker refuse via « Plus tard » : rien n'est ecrit sur disque, la memoire de ce refus meurt
   * avec l'onglet. Une version encore plus recente re-proposera la banniere. */
  let dismissed: WorkerLike | null = null;
  let requested = false;
  let reloaded = false;
  let disposed = false;
  let timer: unknown = null;
  const watched = new Set<WorkerLike>();

  function publish(next: UpdateStatus) {
    if (disposed || status === next) return;
    status = next;
    onStatus(status);
  }

  function offer(worker: WorkerLike) {
    if (disposed || worker === dismissed || status === "updating") return;
    pending = worker;
    publish("available");
  }

  /* Une mise a jour ne se declare qu'a partir d'une page DEJA controlee : sinon c'est la premiere
   * installation, l'utilisateur a la derniere version sous les yeux et n'a rien a decider. */
  function offerIfUpdate(worker: WorkerLike | null) {
    if (!worker || !container.controller) return;
    offer(worker);
  }

  function watchInstalling(worker: WorkerLike) {
    if (watched.has(worker)) return;
    watched.add(worker);
    const onStateChange = () => {
      if (worker.state === "installed") offerIfUpdate(worker);
      if (worker.state === "installed" || worker.state === "redundant" || worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        watched.delete(worker);
      }
    };
    worker.addEventListener("statechange", onStateChange);
    /* L'etat a pu passer a `installed` avant meme qu'on s'abonne. */
    if (worker.state === "installed") offerIfUpdate(worker);
  }

  const onUpdateFound = () => {
    const installing = registration.installing;
    if (installing) watchInstalling(installing);
  };

  const onControllerChange = () => {
    if (disposed) return;
    /* Activation declenchee ailleurs (autre onglet, fin de vie des clients) : on ne recharge pas
     * sous les doigts de l'utilisateur. La banniere reste, il rechargera quand il le decidera. */
    if (!requested || reloaded) return;
    reloaded = true;
    if (timer !== null) { clearTimeoutFn(timer); timer = null; }
    reload();
  };

  registration.addEventListener("updatefound", onUpdateFound);
  container.addEventListener("controllerchange", onControllerChange);

  /* Etat au chargement : un worker deja en attente depuis une session precedente. */
  offerIfUpdate(registration.waiting);
  if (registration.installing) watchInstalling(registration.installing);

  async function applyUpdate() {
    if (disposed || status !== "available") return;
    const worker = pending;
    if (!worker) return;
    publish("updating");

    /* 1. Mise a l'abri du travail local avant tout rechargement. */
    try {
      await flushLocalState?.();
    } catch (error) {
      onError?.(error);
    }
    if (disposed) return;

    /* 2. Ordre explicite au worker en attente. Aucun reseau : sur hors connexion aussi. */
    requested = true;
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch (error) {
      onError?.(error);
      requested = false;
      publish("available");
      return;
    }

    /* 3. On attend `controllerchange` ; 4. le rechargement a lieu la, une seule fois. */
    timer = setTimeoutFn(() => {
      timer = null;
      if (reloaded || disposed) return;
      requested = false;
      publish("available");
    }, activationTimeoutMs);
  }

  function dismiss() {
    if (disposed || status !== "available") return;
    dismissed = pending;
    pending = null;
    publish("idle");
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) { clearTimeoutFn(timer); timer = null; }
    registration.removeEventListener("updatefound", onUpdateFound);
    container.removeEventListener("controllerchange", onControllerChange);
    watched.clear();
  }

  return { status: () => status, applyUpdate, dismiss, dispose };
}
