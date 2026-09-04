import { describe, expect, it } from "vitest";
import {
  CHEMIN_MODULE_NON_INCLUS,
  PERMISSION_BORNE,
  cheminAutorisePourCompteDepot,
  decisionRoutageAuthentifieSurPagePublique,
  decisionRoutageCompteDepot,
  estCulDeSacInformatif,
} from "./routage-proxy";

/**
 * Bug fermé ici : après login d'une entreprise onboardée, un compte dépôt dont
 * l'offre n'inclut pas la borne bouclait
 *   /dashboard → /stock/borne → garde module → /abonnement/module-non-inclus
 *              → priorité compte dépôt → /stock/borne → … (redirect count exceeded)
 */
describe("routage proxy — priorité compte dépôt & cul-de-sac module", () => {
  // ── A : compte dépôt, borne réellement accessible ─────────────────────────
  it("A. compte dépôt hors périmètre + borne accessible → /stock/borne", () => {
    expect(
      decisionRoutageCompteDepot({ compteDepot: true, pathname: "/dashboard", borneAccessible: true }),
    ).toEqual({ type: "rediriger", pathname: "/stock/borne" });
  });

  // ── B : compte dépôt sans droit borne → cul-de-sac, JAMAIS /stock/borne ───
  it("B. compte dépôt hors périmètre + borne non incluse → cul-de-sac informatif", () => {
    const decision = decisionRoutageCompteDepot({
      compteDepot: true,
      pathname: "/dashboard",
      borneAccessible: false,
    });
    expect(decision).toEqual({
      type: "rediriger",
      pathname: CHEMIN_MODULE_NON_INCLUS,
      module: PERMISSION_BORNE,
    });
    expect(decision).not.toMatchObject({ pathname: "/stock/borne" });
  });

  // ── C : compte dépôt déjà dans son périmètre → aucune redirection ─────────
  it("C. compte dépôt déjà sur /stock/borne → passer", () => {
    expect(
      decisionRoutageCompteDepot({ compteDepot: true, pathname: "/stock/borne", borneAccessible: false }),
    ).toEqual({ type: "passer" });
  });

  it("C bis. compte dépôt sur /stock ou /depot → passer", () => {
    for (const pathname of ["/stock", "/stock/mouvements", "/depot"]) {
      expect(
        decisionRoutageCompteDepot({ compteDepot: true, pathname, borneAccessible: true }),
      ).toEqual({ type: "passer" });
    }
  });

  // ── D : cul-de-sac informatif = destination terminale ────────────────────
  it("D. compte dépôt sur /abonnement/module-non-inclus → passer (jamais de rebond)", () => {
    expect(
      decisionRoutageCompteDepot({
        compteDepot: true,
        pathname: CHEMIN_MODULE_NON_INCLUS,
        borneAccessible: false,
      }),
    ).toEqual({ type: "passer" });
    expect(estCulDeSacInformatif(CHEMIN_MODULE_NON_INCLUS)).toBe(true);
    expect(cheminAutorisePourCompteDepot(CHEMIN_MODULE_NON_INCLUS)).toBe(true);
  });

  // ── E : utilisateur normal authentifié sur page publique → dashboard ─────
  it("E. utilisateur normal sur /login ou /signup → /dashboard", () => {
    for (const pathname of ["/login", "/signup"]) {
      expect(
        decisionRoutageAuthentifieSurPagePublique({ compteDepot: false, pathname }),
      ).toEqual({ type: "rediriger", pathname: "/dashboard" });
    }
  });

  it("E bis. compte dépôt sur /login → reste prisonnier (pas de saut vers /dashboard)", () => {
    expect(
      decisionRoutageAuthentifieSurPagePublique({ compteDepot: true, pathname: "/login" }),
    ).toEqual({ type: "passer" });
  });

  // ── F : utilisateur normal → la priorité compte dépôt ne s'applique pas ──
  it("F. utilisateur normal hors /login → passer partout", () => {
    for (const pathname of ["/dashboard", "/chantier", "/stock/borne", CHEMIN_MODULE_NON_INCLUS]) {
      expect(
        decisionRoutageCompteDepot({ compteDepot: false, pathname, borneAccessible: false }),
      ).toEqual({ type: "passer" });
      expect(
        decisionRoutageAuthentifieSurPagePublique({ compteDepot: false, pathname }),
      ).toEqual({ type: "passer" });
    }
  });

  // ── G : convergence — appliquer la décision n'entraîne pas de nouvelle
  //        redirection (pas de boucle) ────────────────────────────────────
  it("G. la cible d'une redirection compte dépôt est elle-même stable (pas de boucle)", () => {
    for (const borneAccessible of [true, false]) {
      const premiere = decisionRoutageCompteDepot({
        compteDepot: true,
        pathname: "/dashboard",
        borneAccessible,
      });
      expect(premiere.type).toBe("rediriger");
      if (premiere.type !== "rediriger") continue;

      // Rejoue la règle sur la destination : elle doit « passer ».
      const seconde = decisionRoutageCompteDepot({
        compteDepot: true,
        pathname: premiere.pathname,
        borneAccessible,
      });
      expect(seconde).toEqual({ type: "passer" });
    }
  });

  it("G bis. cheminAutorisePourCompteDepot couvre toutes les cibles produites par la règle", () => {
    for (const borneAccessible of [true, false]) {
      const decision = decisionRoutageCompteDepot({
        compteDepot: true,
        pathname: "/parametres",
        borneAccessible,
      });
      if (decision.type === "rediriger") {
        expect(cheminAutorisePourCompteDepot(decision.pathname)).toBe(true);
      }
    }
  });
});
