import { afterEach, describe, expect, it, vi } from "vitest";
import { createToolProject } from "../projects/model";
import { proToolDefaults } from "../pro-engine";
import { buildProjectDocument } from "./document";
import { printProjectDocument, renderPrintHtml } from "./print";

const project = createToolProject(
  { name: "Voûte / Hall", siteName: "Chantier Nord", toolId: "fleur-6", inputParameters: proToolDefaults["fleur-6"], notes: "Axe depuis le mur façade." },
  new Date("2026-09-06T10:00:00Z"),
  "12345678-1234-1234-1234-123456789012",
);
const document = buildProjectDocument(project, new Date("2026-09-06T12:00:00Z"));

/**
 * Comment le navigateur termine le document écrit par `document.write` :
 * - `load-event`   : `close()` planifie le `load` de la fenêtre (Chrome, Firefox) ;
 * - `sync-complete`: `close()` bascule `readyState` sur `complete` sans événement ;
 * - `silent`       : aucun `load`, `readyState` reste bloqué (Safari iOS, WebView).
 */
type LoadBehaviour = "load-event" | "sync-complete" | "silent";

type FakePopupOptions = { behaviour?: LoadBehaviour; canPrint?: boolean };

function createFakePopup({ behaviour = "load-event", canPrint = true }: FakePopupOptions = {}) {
  const loadListeners: Array<() => void> = [];
  const state = { html: "", documentOpened: 0, documentClosed: 0, focused: 0, printed: 0, windowClosed: false, openerAtWrite: undefined as unknown, openerAtPrint: undefined as unknown };
  const view = {
    readyState: "loading",
    open() { state.documentOpened += 1; state.html = ""; view.readyState = "loading"; },
    write(chunk: string) { state.openerAtWrite = popup.opener; state.html += chunk; },
    close() {
      state.documentClosed += 1;
      if (behaviour === "sync-complete") view.readyState = "complete";
      if (behaviour === "load-event") setTimeout(() => { view.readyState = "complete"; for (const listener of [...loadListeners]) listener(); }, 0);
    },
  };
  const popup = {
    document: view,
    // Le navigateur pose la référence retour vers l'application dès l'ouverture.
    opener: { application: "elsatia-tools" } as unknown,
    closed: false,
    addEventListener(type: string, listener: () => void) { if (type === "load") loadListeners.push(listener); },
    focus() { state.focused += 1; },
    close() { popup.closed = true; state.windowClosed = true; },
    ...(canPrint ? { print() { state.openerAtPrint = popup.opener; state.printed += 1; } } : {}),
  };
  return { popup, state };
}

type OpenCall = { url: string; target: string; features: string | undefined };

function stubBrowser(options: FakePopupOptions & { blocked?: boolean } = {}) {
  const calls: OpenCall[] = [];
  const { popup, state } = createFakePopup(options);
  vi.stubGlobal("window", {
    open(url: string, target: string, features?: string) {
      calls.push({ url, target, features });
      // Spécification HTML : « if noopener is set, then return null ».
      if (features && /\bnoopener\b|\bnoreferrer\b/.test(features)) return null;
      if (options.blocked) return null;
      return popup;
    },
  });
  return { calls, popup, state };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("vue d’impression — ouverture de la fenêtre", () => {
  it("n’ouvre jamais la fenêtre avec noopener/noreferrer : window.open renverrait null", () => {
    vi.useFakeTimers();
    const { calls } = stubBrowser();
    printProjectDocument(document);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.features ?? "").not.toMatch(/noopener|noreferrer/);
  });

  it("écrit la vue d’impression complète dans la fenêtre ouverte", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser();
    printProjectDocument(document);
    expect(state.documentOpened).toBe(1);
    expect(state.documentClosed).toBe(1);
    expect(state.html).toBe(renderPrintHtml(document));
    expect(state.html).toContain("Points de construction");
  });

  it("remonte un message actionnable quand le navigateur bloque la fenêtre", () => {
    stubBrowser({ blocked: true });
    expect(() => printProjectDocument(document)).toThrow(/Autorisez/i);
  });
});

describe("vue d’impression — surface de sécurité", () => {
  it("coupe la référence opener avant toute écriture dans la fenêtre fille", () => {
    vi.useFakeTimers();
    const { popup, state } = stubBrowser();
    printProjectDocument(document);
    expect(state.openerAtWrite).toBeNull();
    expect(popup.opener).toBeNull();
  });

  it("laisse la référence opener coupée au moment de l’impression", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser();
    printProjectDocument(document);
    vi.advanceTimersByTime(0);
    expect(state.printed).toBe(1);
    expect(state.openerAtPrint).toBeNull();
  });
});

describe("vue d’impression — déclenchement de l’impression", () => {
  it("imprime au load du document écrit", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser({ behaviour: "load-event" });
    printProjectDocument(document);
    expect(state.printed).toBe(0);
    vi.advanceTimersByTime(0);
    expect(state.focused).toBe(1);
    expect(state.printed).toBe(1);
  });

  it("n’imprime qu’une fois même quand le load et le repli se déclenchent", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser({ behaviour: "load-event" });
    printProjectDocument(document);
    vi.runAllTimers();
    expect(state.printed).toBe(1);
  });

  it("imprime malgré un navigateur qui n’émet aucun load (Safari iOS, WebView)", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser({ behaviour: "silent" });
    printProjectDocument(document);
    expect(state.printed).toBe(0);
    vi.runAllTimers();
    expect(state.printed).toBe(1);
  });

  it("imprime sans attendre quand close() rend le document complet", () => {
    vi.useFakeTimers();
    const { state } = stubBrowser({ behaviour: "sync-complete" });
    printProjectDocument(document);
    expect(state.printed).toBe(1);
  });

  it("n’imprime pas dans une fenêtre que l’utilisateur a refermée", () => {
    vi.useFakeTimers();
    const { popup, state } = stubBrowser({ behaviour: "silent" });
    printProjectDocument(document);
    popup.closed = true;
    vi.runAllTimers();
    expect(state.printed).toBe(0);
  });

  it("oriente vers PDF/Partage sur une plateforme sans window.print, sans laisser de fenêtre ouverte", () => {
    const { state } = stubBrowser({ canPrint: false });
    expect(() => printProjectDocument(document)).toThrow(/PDF|Partager/i);
    expect(state.windowClosed).toBe(true);
    expect(state.documentOpened).toBe(0);
  });
});
