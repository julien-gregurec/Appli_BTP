/**
 * Garde d'interface et d'accessibilite de la banniere de mise a jour.
 *
 * Les tests Tools tournent en environnement `node` : on n'inspecte pas un DOM, mais l'arbre
 * d'elements React rendu par le composant — ce qui suffit a verrouiller ce qui compte ici
 * (visibilite selon l'etat, roles, `aria-label`, absence de piege a focus). Le rendu visuel reel
 * est verifie en recette navigateur.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PwaUpdateBanner,
  UPDATE_BANNER_APPLY_ARIA,
  UPDATE_BANNER_APPLY_LABEL,
  UPDATE_BANNER_LATER_ARIA,
  UPDATE_BANNER_LATER_LABEL,
  UPDATE_BANNER_TEXT,
  isUpdateBannerVisible,
} from "./PwaUpdateBanner";
import type { UpdateStatus } from "../lib/pwa/update-controller";

type Node = { type: unknown; props: Record<string, unknown> } | string | number | null | undefined | boolean;

function render(status: UpdateStatus, handlers: { onApply?: () => void; onLater?: () => void } = {}) {
  return PwaUpdateBanner({ status, onApply: handlers.onApply ?? (() => {}), onLater: handlers.onLater ?? (() => {}) }) as Node;
}

function walk(node: Node, out: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (!node || typeof node !== "object") return out;
  out.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) walk(child as Node, out);
  return out;
}

const buttons = (node: Node) => walk(node).filter((element) => element.type === "button");
const text = (node: Node) => walk(node).map((element) => element.props.children).filter((value) => typeof value === "string").join(" ");

describe("banniere de mise a jour — visibilite", () => {
  it("ne rend rien tant qu'aucune mise a jour n'est disponible", () => {
    expect(render("idle")).toBeNull();
  });

  it("s'affiche des qu'une mise a jour est disponible", () => {
    const node = render("available");
    expect(node).not.toBeNull();
    expect(text(node)).toContain(UPDATE_BANNER_TEXT);
  });

  it("reste affichee pendant la mise a jour, boutons neutralises", () => {
    const node = render("updating");
    expect(node).not.toBeNull();
    expect(buttons(node).every((button) => button.props.disabled === true)).toBe(true);
  });

  it("expose la meme regle de visibilite que le marqueur pose sur `body`", () => {
    expect(isUpdateBannerVisible("idle")).toBe(false);
    expect(isUpdateBannerVisible("available")).toBe(true);
    expect(isUpdateBannerVisible("updating")).toBe(true);
  });
});

describe("banniere de mise a jour — actions", () => {
  it("propose exactement « Mettre a jour » et « Plus tard »", () => {
    const labels = buttons(render("available")).map((button) => button.props.children);
    expect(labels).toEqual([UPDATE_BANNER_APPLY_LABEL, UPDATE_BANNER_LATER_LABEL]);
  });

  it("cable chaque bouton sur son action", () => {
    const onApply = vi.fn();
    const onLater = vi.fn();
    const [apply, later] = buttons(render("available", { onApply, onLater }));
    (apply.props.onClick as () => void)();
    (later.props.onClick as () => void)();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it("n'expose aucun bouton de type submit (aucun formulaire declenche)", () => {
    expect(buttons(render("available")).every((button) => button.props.type === "button")).toBe(true);
  });
});

describe("banniere de mise a jour — accessibilite", () => {
  it("est annoncee comme un statut poli, sans interrompre le lecteur d'ecran", () => {
    const root = walk(render("available"))[0];
    expect(root.props.role).toBe("status");
    expect(root.props["aria-live"]).toBe("polite");
  });

  it("donne un `aria-label` explicite a chaque bouton", () => {
    const labels = buttons(render("available")).map((button) => button.props["aria-label"]);
    expect(labels).toEqual([UPDATE_BANNER_APPLY_ARIA, UPDATE_BANNER_LATER_ARIA]);
  });

  it("signale l'attente via aria-busy pendant la mise a jour", () => {
    expect(buttons(render("updating"))[0].props["aria-busy"]).toBe(true);
  });

  it("ne vole pas le focus : ni autoFocus, ni tabIndex impose", () => {
    for (const element of walk(render("available"))) {
      expect(element.props.autoFocus).toBeUndefined();
      expect(element.props.tabIndex).toBeUndefined();
    }
  });

  it("ne pose aucun overlay bloquant : la banniere n'a pas de role de dialogue modal", () => {
    const root = walk(render("available"))[0];
    expect(root.props["aria-modal"]).toBeUndefined();
    expect(root.props.role).not.toBe("dialog");
  });
});
