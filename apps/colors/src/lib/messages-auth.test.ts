import { describe, expect, it } from "vitest";

import {
  CODE_ACCES_COLORS_ABSENT,
  CODE_DECONNEXION,
  CODE_IDENTIFIANTS_INVALIDES,
  messageConfirmationConnexion,
  messageErreurConnexion,
} from "@/lib/messages-auth";

describe("messages de l’écran de connexion", () => {
  it("rend le libellé ELSATIA associé à un code connu", () => {
    expect(messageErreurConnexion(CODE_IDENTIFIANTS_INVALIDES)).toBe("Identifiants incorrects.");
    expect(messageErreurConnexion(CODE_ACCES_COLORS_ABSENT)).toBe(
      "Votre compte ELSATIA ne dispose pas d’un accès actif à Colors.",
    );
    expect(messageConfirmationConnexion(CODE_DECONNEXION)).toBe("Vous êtes déconnecté");
  });

  it("n’affiche jamais un texte arbitraire reçu par l’URL", () => {
    expect(messageErreurConnexion("Compte suspendu — appelez le 01 23 45 67 89")).toBeNull();
    expect(messageConfirmationConnexion("Appelez le 01 23 45 67 89")).toBeNull();
  });

  it("ignore les clés héritées du prototype", () => {
    expect(messageErreurConnexion("constructor")).toBeNull();
    expect(messageErreurConnexion("__proto__")).toBeNull();
    expect(messageConfirmationConnexion("toString")).toBeNull();
  });

  it("ignore les valeurs non textuelles", () => {
    expect(messageErreurConnexion(undefined)).toBeNull();
    expect(messageErreurConnexion(["identifiants"])).toBeNull();
    expect(messageConfirmationConnexion(null)).toBeNull();
  });

  it("ne croise pas erreurs et confirmations", () => {
    expect(messageConfirmationConnexion(CODE_IDENTIFIANTS_INVALIDES)).toBeNull();
    expect(messageErreurConnexion(CODE_DECONNEXION)).toBeNull();
  });
});
