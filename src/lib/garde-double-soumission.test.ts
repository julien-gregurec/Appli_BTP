import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELAI_CANDIDAT_MS, DELAI_SECURITE_MS, estRequeteActionServeur, installerGardeDoubleSoumission, type FenetreGarde } from "./garde-double-soumission";

type Handler = (event: Event) => void;

function banc(reponses: Array<() => Promise<Response>> = []) {
  const handlers: Record<string, Handler> = {};
  const fenetreHandlers: Record<string, Handler> = {};
  const appels: unknown[] = [];
  const fetchFaux = vi.fn((...args: unknown[]) => {
    appels.push(args);
    const suivante = reponses.shift();
    return suivante ? suivante() : Promise.resolve(new Response("ok"));
  });
  const fenetre: FenetreGarde = {
    fetch: fetchFaux as unknown as typeof fetch,
    document: {
      addEventListener: ((type: string, fn: Handler) => { handlers[type] = fn; }) as Document["addEventListener"],
      removeEventListener: ((type: string) => { delete handlers[type]; }) as Document["removeEventListener"],
    },
    addEventListener: ((type: string, fn: Handler) => { fenetreHandlers[type] = fn; }) as Window["addEventListener"],
    removeEventListener: ((type: string) => { delete fenetreHandlers[type]; }) as Window["removeEventListener"],
    setTimeout,
    clearTimeout,
  };
  const desinstaller = installerGardeDoubleSoumission(fenetre);
  const soumettre = (formulaire: object) => {
    const event = { target: formulaire, defaultPrevented: false, arrete: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.arrete = true; } };
    handlers.submit?.(event as unknown as Event);
    return event;
  };
  const action = () => fenetre.fetch("/x", { method: "POST", headers: { "Next-Action": "abc" } });
  return { fenetre, soumettre, action, desinstaller, fetchFaux, fenetreHandlers, handlers };
}

const formulaire = (method = "post") => ({ tagName: "FORM", method });

describe("garde de double soumission (B29)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reconnaît l'en-tête Next-Action sous toutes ses formes", () => {
    expect(estRequeteActionServeur({ headers: { "Next-Action": "a" } })).toBe(true);
    expect(estRequeteActionServeur({ headers: new Headers({ "next-action": "a" }) })).toBe(true);
    expect(estRequeteActionServeur({ headers: [["NEXT-ACTION", "a"]] })).toBe(true);
    expect(estRequeteActionServeur({ headers: { accept: "x" } })).toBe(false);
    expect(estRequeteActionServeur(undefined)).toBe(false);
  });

  it("formulaire simple : second clic ignoré pendant l'action lente, de nouveau libre après la réponse", async () => {
    let finir!: (r: Response) => void;
    const b = banc([() => new Promise<Response>((r) => { finir = r; })]);
    const f = formulaire();
    expect(b.soumettre(f).defaultPrevented).toBe(false);
    const enCours = b.action();
    const second = b.soumettre(f);
    expect(second.defaultPrevented).toBe(true);
    expect(second.arrete).toBe(true);
    finir(new Response("ok"));
    await enCours;
    expect(b.soumettre(f).defaultPrevented).toBe(false); // second clic légitime après réponse
  });

  it("double clic avant le départ de la requête (encodage asynchrone) : ignoré", () => {
    const b = banc();
    const f = formulaire();
    b.soumettre(f);
    expect(b.soumettre(f).defaultPrevented).toBe(true);
  });

  it("erreur serveur ou réseau : le formulaire est libéré", async () => {
    const b = banc([() => Promise.reject(new Error("réseau"))]);
    const f = formulaire();
    b.soumettre(f);
    await expect(b.action()).rejects.toThrow("réseau");
    expect(b.soumettre(f).defaultPrevented).toBe(false);
  });

  it("autres formulaires libres pendant qu'un formulaire est en cours (multi-actions)", () => {
    const b = banc([() => new Promise<Response>(() => {})]);
    const f1 = formulaire();
    const f2 = formulaire();
    b.soumettre(f1);
    void b.action();
    expect(b.soumettre(f2).defaultPrevented).toBe(false);
    expect(b.soumettre(f1).defaultPrevented).toBe(true);
  });

  it("requête bloquée : libération au plus tard après le délai de sécurité (aucun blocage permanent)", () => {
    const b = banc([() => new Promise<Response>(() => {})]);
    const f = formulaire();
    b.soumettre(f);
    void b.action();
    expect(b.soumettre(f).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(DELAI_SECURITE_MS + 1);
    expect(b.soumettre(f).defaultPrevented).toBe(false);
  });

  it("formulaire sans action serveur (GET ou navigation classique) : jamais bloqué, candidat expiré", () => {
    const b = banc();
    const get = formulaire("get");
    b.soumettre(get);
    expect(b.soumettre(get).defaultPrevented).toBe(false);
    const classique = formulaire();
    b.soumettre(classique);
    expect(b.soumettre(classique).defaultPrevented).toBe(true); // double clic immédiat
    vi.advanceTimersByTime(DELAI_CANDIDAT_MS + 1);
    void b.action(); // action déclenchée hors formulaire, plus tard
    expect(b.soumettre(classique).defaultPrevented).toBe(false);
  });

  it("une action lancée hors formulaire ne bloque pas un formulaire déjà répondu", async () => {
    const b = banc([() => Promise.resolve(new Response("ok")), () => new Promise<Response>(() => {})]);
    const f = formulaire();
    b.soumettre(f);
    await b.action();
    void b.action(); // ex. startTransition(action) sans formulaire
    expect(b.soumettre(f).defaultPrevented).toBe(false);
  });

  it("retour arrière (page restaurée du cache) : tout envoi en cours est oublié", () => {
    const b = banc([() => new Promise<Response>(() => {})]);
    const f = formulaire();
    b.soumettre(f);
    void b.action();
    b.fenetreHandlers.pageshow?.({ persisted: true } as unknown as Event);
    expect(b.soumettre(f).defaultPrevented).toBe(false);
  });

  it("désinstallation : fetch d'origine restauré, plus d'écoute", () => {
    const b = banc();
    b.desinstaller();
    expect(b.fenetre.fetch).toBe(b.fetchFaux);
    expect(b.handlers.submit).toBeUndefined();
  });
});
