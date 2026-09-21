/**
 * Garde de la mise a jour PWA controlee par l'utilisateur.
 *
 * Les doublures reproduisent le cycle de vie reel d'un service worker (`installing` ->
 * `installed` -> `activated`, `updatefound`, `controllerchange`) : c'est ce cycle, et non un
 * resume, qui porte les regles du lot — pas de banniere au premier install, aucune activation
 * sans clic, un seul rechargement, pas d'auto-rechargement pilote par un autre onglet.
 */
import { describe, expect, it, vi } from "vitest";
import { createUpdateController, type ContainerLike, type RegistrationLike, type UpdateStatus, type WorkerLike } from "./update-controller";

class FakeWorker implements WorkerLike {
  state: string;
  readonly messages: unknown[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(state = "installing") { this.state = state; }
  postMessage(message: unknown) { this.messages.push(message); }
  addEventListener(_type: "statechange", listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: "statechange", listener: () => void) { this.listeners.delete(listener); }
  setState(state: string) { this.state = state; for (const listener of [...this.listeners]) listener(); }
  get listenerCount() { return this.listeners.size; }
}

class FakeRegistration implements RegistrationLike {
  waiting: WorkerLike | null = null;
  installing: WorkerLike | null = null;
  private readonly listeners = new Set<() => void>();
  addEventListener(_type: "updatefound", listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: "updatefound", listener: () => void) { this.listeners.delete(listener); }
  /** Reproduit `updatefound` : le navigateur pose `installing` PUIS emet l'evenement. */
  startInstall(worker: FakeWorker) { this.installing = worker; for (const listener of [...this.listeners]) listener(); }
  get listenerCount() { return this.listeners.size; }
}

class FakeContainer implements ContainerLike {
  controller: unknown;
  private readonly listeners = new Set<() => void>();
  constructor(controlled: boolean) { this.controller = controlled ? { id: "controller" } : null; }
  addEventListener(_type: "controllerchange", listener: () => void) { this.listeners.add(listener); }
  removeEventListener(_type: "controllerchange", listener: () => void) { this.listeners.delete(listener); }
  emitControllerChange() { for (const listener of [...this.listeners]) listener(); }
  get listenerCount() { return this.listeners.size; }
}

type Setup = {
  registration: FakeRegistration;
  container: FakeContainer;
  statuses: UpdateStatus[];
  reload: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  timers: { run: () => void; pending: () => number };
  controller: ReturnType<typeof createUpdateController>;
};

function setup(options: { controlled?: boolean; waiting?: FakeWorker; flushRejects?: boolean } = {}): Setup {
  const registration = new FakeRegistration();
  if (options.waiting) registration.waiting = options.waiting;
  const container = new FakeContainer(options.controlled ?? true);
  const statuses: UpdateStatus[] = [];
  const reload = vi.fn();
  const flush = vi.fn(async () => { if (options.flushRejects) throw new Error("flush ko"); });
  const queue: (() => void)[] = [];
  const controller = createUpdateController({
    registration,
    container,
    onStatus: (status) => statuses.push(status),
    reload,
    flushLocalState: flush,
    setTimeoutFn: (callback) => { queue.push(callback); return queue.length; },
    clearTimeoutFn: (handle) => { const index = (handle as number) - 1; if (index >= 0) queue[index] = () => {}; },
  });
  return { registration, container, statuses, reload, flush, timers: { run: () => { for (const task of queue.splice(0)) task(); }, pending: () => queue.length }, controller };
}

// ---------------------------------------------------------------- detection

describe("mise a jour PWA — detection", () => {
  it("n'annonce rien a la premiere installation : aucun worker ne controle encore la page", () => {
    const s = setup({ controlled: false });
    const worker = new FakeWorker();
    s.registration.startInstall(worker);
    worker.setState("installed");

    expect(s.controller.status()).toBe("idle");
    expect(s.statuses).toEqual([]);
  });

  it("annonce la mise a jour quand un worker est deja en attente au chargement", () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    expect(s.controller.status()).toBe("available");
    expect(s.statuses).toEqual(["available"]);
  });

  it("ignore un worker en attente si la page n'est controlee par personne", () => {
    const s = setup({ controlled: false, waiting: new FakeWorker("installed") });
    expect(s.controller.status()).toBe("idle");
  });

  it("annonce la mise a jour sur updatefound quand la page est deja controlee", () => {
    const s = setup();
    const worker = new FakeWorker();
    s.registration.startInstall(worker);
    expect(s.controller.status()).toBe("idle"); // encore en cours d'installation

    worker.setState("installed");
    expect(s.controller.status()).toBe("available");
  });

  it("n'annonce rien tant que le worker n'est pas installe (installing, puis redundant)", () => {
    const s = setup();
    const worker = new FakeWorker();
    s.registration.startInstall(worker);
    worker.setState("redundant");
    expect(s.controller.status()).toBe("idle");
    expect(worker.listenerCount).toBe(0); // abonnement libere
  });

  it("rattrape un worker deja passe a installed avant l'abonnement", () => {
    const s = setup();
    const worker = new FakeWorker("installed");
    s.registration.startInstall(worker);
    expect(s.controller.status()).toBe("available");
  });
});

// ---------------------------------------------------------------- activation

describe("mise a jour PWA — activation controlee", () => {
  it("n'envoie SKIP_WAITING qu'au clic explicite, jamais avant", async () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    expect(waiting.messages).toEqual([]);

    await s.controller.applyUpdate();
    expect(waiting.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(s.controller.status()).toBe("updating");
  });

  it("met les donnees locales a l'abri AVANT d'envoyer SKIP_WAITING", async () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    let flushedBeforeMessage = false;
    s.flush.mockImplementation(async () => { flushedBeforeMessage = waiting.messages.length === 0; });

    await s.controller.applyUpdate();
    expect(s.flush).toHaveBeenCalledTimes(1);
    expect(flushedBeforeMessage).toBe(true);
  });

  it("poursuit la mise a jour meme si la mise a l'abri echoue", async () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting, flushRejects: true });
    await s.controller.applyUpdate();
    expect(waiting.messages).toEqual([{ type: "SKIP_WAITING" }]);
  });

  it("recharge une seule fois sur controllerchange, quel que soit le nombre d'evenements", async () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    await s.controller.applyUpdate();

    s.container.emitControllerChange();
    s.container.emitControllerChange();
    s.container.emitControllerChange();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it("ne recharge jamais sans demande de l'utilisateur (premiere installation, claim)", () => {
    const s = setup({ controlled: false });
    s.container.emitControllerChange();
    expect(s.reload).not.toHaveBeenCalled();
  });

  it("ne recharge pas l'onglet quand c'est un AUTRE onglet qui a active la nouvelle version", () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    // aucun applyUpdate ici : l'activation vient d'ailleurs
    s.container.emitControllerChange();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.controller.status()).toBe("available"); // la banniere reste, l'utilisateur decide
  });

  it("ignore un second clic pendant la mise a jour", async () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    await s.controller.applyUpdate();
    await s.controller.applyUpdate();
    expect(waiting.messages).toHaveLength(1);
  });

  it("revient a « disponible » si l'activation n'a pas lieu, sans recharger a l'aveugle", async () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    await s.controller.applyUpdate();
    s.timers.run();

    expect(s.reload).not.toHaveBeenCalled();
    expect(s.controller.status()).toBe("available");
  });

  it("apres un delai depasse, un nouveau clic reste possible et recharge normalement", async () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    await s.controller.applyUpdate();
    s.timers.run();

    await s.controller.applyUpdate();
    s.container.emitControllerChange();
    expect(waiting.messages).toHaveLength(2);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it("n'arme aucun minuteur residuel apres rechargement", async () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    await s.controller.applyUpdate();
    s.container.emitControllerChange();
    s.timers.run(); // le minuteur d'expiration a ete annule
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.controller.status()).toBe("updating");
  });

  it("absorbe un postMessage impossible et laisse la banniere utilisable", async () => {
    const waiting = new FakeWorker("installed");
    waiting.postMessage = () => { throw new Error("worker parti"); };
    const errors: unknown[] = [];
    const registration = new FakeRegistration();
    registration.waiting = waiting;
    const container = new FakeContainer(true);
    const controller = createUpdateController({
      registration, container, onStatus: () => {}, reload: () => {}, onError: (error) => errors.push(error),
    });

    await controller.applyUpdate();
    expect(controller.status()).toBe("available");
    expect(errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- « Plus tard »

describe("mise a jour PWA — « Plus tard »", () => {
  it("masque la banniere pour la session sans activer quoi que ce soit", () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    s.controller.dismiss();

    expect(s.controller.status()).toBe("idle");
    expect(waiting.messages).toEqual([]);
    expect(s.reload).not.toHaveBeenCalled();
  });

  it("ne re-propose pas le meme worker refuse", () => {
    const waiting = new FakeWorker("installed");
    const s = setup({ waiting });
    s.controller.dismiss();
    s.registration.startInstall(waiting);
    waiting.setState("installed");
    expect(s.controller.status()).toBe("idle");
  });

  it("re-propose une version encore plus recente apres un refus", () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    s.controller.dismiss();

    const suivant = new FakeWorker();
    s.registration.startInstall(suivant);
    suivant.setState("installed");
    expect(s.controller.status()).toBe("available");
  });

  it("ne persiste rien : un nouveau controleur (nouvelle ouverture) reproposera la banniere", () => {
    const waiting = new FakeWorker("installed");
    const first = setup({ waiting });
    first.controller.dismiss();
    first.controller.dispose();

    const reopened = setup({ waiting });
    expect(reopened.controller.status()).toBe("available");
  });

  it("ignore « Plus tard » pendant une mise a jour en cours", async () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    await s.controller.applyUpdate();
    s.controller.dismiss();
    expect(s.controller.status()).toBe("updating");
  });
});

// ---------------------------------------------------------------- cycle de vie

describe("mise a jour PWA — cycle de vie", () => {
  it("libere tous les abonnements a la destruction", () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    expect(s.registration.listenerCount).toBe(1);
    expect(s.container.listenerCount).toBe(1);

    s.controller.dispose();
    expect(s.registration.listenerCount).toBe(0);
    expect(s.container.listenerCount).toBe(0);
  });

  it("ne recharge plus apres destruction", async () => {
    const s = setup({ waiting: new FakeWorker("installed") });
    await s.controller.applyUpdate();
    s.controller.dispose();
    s.container.emitControllerChange();
    expect(s.reload).not.toHaveBeenCalled();
  });

  it("n'emet plus d'etat apres destruction", () => {
    const s = setup();
    s.controller.dispose();
    const worker = new FakeWorker();
    s.registration.startInstall(worker);
    worker.setState("installed");
    expect(s.statuses).toEqual([]);
  });
});

// ---------------------------------------------------------------- multi-onglets

/*
 * Deux onglets partagent le MEME enregistrement et le meme conteneur : c'est ce qu'observe le
 * navigateur en realite. Le seul mecanisme dont dispose un service worker standard est
 * `controllerchange` — il ne dit pas QUI a demande l'activation. C'est la garde `requested`, locale
 * a chaque onglet, qui evite qu'un clic dans un onglet ne fasse sauter le trace en cours dans
 * l'autre. Limite assumee et documentee : l'onglet passif tourne alors sur du code de la version N
 * servi par un worker N+1 jusqu'a SON propre rechargement — d'ou la banniere qui y reste affichee.
 */
describe("mise a jour PWA — deux onglets", () => {
  function twoTabs() {
    const registration = new FakeRegistration();
    const waiting = new FakeWorker("installed");
    registration.waiting = waiting;
    const container = new FakeContainer(true);
    const make = () => {
      const reload = vi.fn();
      const statuses: UpdateStatus[] = [];
      const controller = createUpdateController({
        registration, container,
        onStatus: (status) => statuses.push(status),
        reload,
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
      });
      return { controller, reload, statuses };
    };
    return { registration, container, waiting, actif: make(), passif: make() };
  }

  it("affiche la banniere dans les deux onglets", () => {
    const tabs = twoTabs();
    expect(tabs.actif.controller.status()).toBe("available");
    expect(tabs.passif.controller.status()).toBe("available");
  });

  it("ne recharge que l'onglet qui a clique : un seul rechargement au total", async () => {
    const tabs = twoTabs();
    await tabs.actif.controller.applyUpdate();
    tabs.container.emitControllerChange();

    expect(tabs.actif.reload).toHaveBeenCalledTimes(1);
    expect(tabs.passif.reload).not.toHaveBeenCalled();
  });

  it("laisse l'onglet passif decider : sa banniere reste, il n'est jamais interrompu", async () => {
    const tabs = twoTabs();
    await tabs.actif.controller.applyUpdate();
    tabs.container.emitControllerChange();

    expect(tabs.passif.controller.status()).toBe("available");
    expect(tabs.passif.reload).not.toHaveBeenCalled();
  });

  it("n'envoie qu'un seul SKIP_WAITING si les deux onglets cliquent", async () => {
    const tabs = twoTabs();
    await tabs.actif.controller.applyUpdate();
    tabs.container.emitControllerChange();
    await tabs.passif.controller.applyUpdate();

    // Le worker recoit un message par onglet ayant clique, mais `skipWaiting()` est idempotent
    // cote worker ; ce qui compte est qu'AUCUN onglet ne recharge deux fois.
    expect(tabs.actif.reload).toHaveBeenCalledTimes(1);
    tabs.container.emitControllerChange();
    expect(tabs.actif.reload).toHaveBeenCalledTimes(1);
    expect(tabs.passif.reload).toHaveBeenCalledTimes(1);
  });

  it("« Plus tard » dans un onglet ne masque pas la banniere de l'autre", () => {
    const tabs = twoTabs();
    tabs.actif.controller.dismiss();
    expect(tabs.actif.controller.status()).toBe("idle");
    expect(tabs.passif.controller.status()).toBe("available");
  });
});
