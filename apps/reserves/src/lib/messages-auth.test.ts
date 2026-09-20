import { describe, expect, it } from "vitest";
import {
  CODE_ACCES_RESERVES_ABSENT,
  CODE_DECONNEXION,
  CODE_IDENTIFIANTS_INVALIDES,
  CODE_SERVICE_INDISPONIBLE,
  messageConfirmationConnexion,
  messageErreurConnexion,
} from "./messages-auth";

describe("messages de l'écran de connexion de Réserves", () => {
  it("rend le libellé associé à un code connu", () => {
    expect(messageErreurConnexion(CODE_IDENTIFIANTS_INVALIDES)).toBe("Identifiants incorrects.");
    expect(messageErreurConnexion(CODE_ACCES_RESERVES_ABSENT)).toMatch(/accès actif à Réserves/);
    expect(messageConfirmationConnexion(CODE_DECONNEXION)).toBe("Vous êtes déconnecté");
  });

  it("n'affiche jamais un texte arbitraire reçu par l'URL", () => {
    expect(messageErreurConnexion("Compte suspendu — appelez le 01 23 45 67 89")).toBeNull();
    expect(messageConfirmationConnexion("Votre paiement a échoué")).toBeNull();
  });

  it("ignore les clés héritées du prototype et les valeurs non textuelles", () => {
    expect(messageErreurConnexion("constructor")).toBeNull();
    expect(messageErreurConnexion("__proto__")).toBeNull();
    expect(messageErreurConnexion(undefined)).toBeNull();
    expect(messageErreurConnexion(["identifiants"])).toBeNull();
  });

  it("une panne n'est ni un mot de passe faux ni une absence de droit", () => {
    const panne = messageErreurConnexion(CODE_SERVICE_INDISPONIBLE);
    expect(panne).toMatch(/ne répond pas/);
    expect(panne).not.toBe(messageErreurConnexion(CODE_IDENTIFIANTS_INVALIDES));
    expect(panne).not.toBe(messageErreurConnexion(CODE_ACCES_RESERVES_ABSENT));
  });
});
