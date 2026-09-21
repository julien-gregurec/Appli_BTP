import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CODE_ERREUR_GENERIQUE,
  CODE_PARAMETRES_ENREGISTRES,
  CODE_SEAU_AJOUTE,
  CODE_SEUIL_INVALIDE,
  messageConfirmationMetier,
  messageErreurMetier,
} from "@/lib/messages-metier";

const SOURCE_ACTIONS = readFileSync(
  fileURLToPath(new URL("../app/actions-metier.ts", import.meta.url)),
  "utf8",
);

describe("messages métier Colors", () => {
  it("rend le libellé ELSATIA associé à un code connu", () => {
    expect(messageErreurMetier(CODE_SEUIL_INVALIDE)).toBe(
      "Le seuil doit être un nombre compris entre 0 et 100.",
    );
    expect(messageConfirmationMetier(CODE_SEAU_AJOUTE)).toBe("Seau ajouté");
    expect(messageConfirmationMetier(CODE_PARAMETRES_ENREGISTRES)).toBe("Paramètres enregistrés");
  });

  it("n’affiche jamais un texte arbitraire reçu par l’URL", () => {
    expect(messageErreurMetier("Votre compte est suspendu — appelez le 01 23 45 67 89")).toBeNull();
    expect(messageConfirmationMetier("Virement validé")).toBeNull();
  });

  it("n’affiche jamais un message PostgreSQL fabriqué", () => {
    const fuites = [
      'duplicate key value violates unique constraint "colors_seaux_pkey"',
      'new row for relation "colors_seaux" violates check constraint "colors_seaux_etat_check"',
      'permission denied for table colors_emplacements',
      'null value in column "entreprise_id" violates not-null constraint',
      'insert or update on table "colors_seaux" violates foreign key constraint',
      'relation "colors_parametres" does not exist',
    ];
    for (const fuite of fuites) {
      expect(messageErreurMetier(fuite)).toBeNull();
      expect(messageConfirmationMetier(fuite)).toBeNull();
    }
  });

  it("ignore les clés héritées du prototype et les valeurs non textuelles", () => {
    expect(messageErreurMetier("constructor")).toBeNull();
    expect(messageErreurMetier("__proto__")).toBeNull();
    expect(messageConfirmationMetier("toString")).toBeNull();
    expect(messageErreurMetier(undefined)).toBeNull();
    expect(messageErreurMetier(["validation"])).toBeNull();
    expect(messageConfirmationMetier(null)).toBeNull();
  });

  it("ne croise pas erreurs et confirmations", () => {
    expect(messageConfirmationMetier(CODE_ERREUR_GENERIQUE)).toBeNull();
    expect(messageErreurMetier(CODE_SEAU_AJOUTE)).toBeNull();
  });
});

describe("actions métier — aucun détail base dans l’URL", () => {
  it("ne construit plus aucune redirection à partir d’un message d’erreur", () => {
    // Le seul chemin d’un échec base vers l’écran passe par echecBase(), qui
    // journalise côté serveur et renvoie un code du catalogue fermé.
    expect(SOURCE_ACTIONS).not.toMatch(/error\.message/);
    expect(SOURCE_ACTIONS).not.toMatch(/erreurDb\?\.message/);
    expect(SOURCE_ACTIONS).not.toMatch(/erreurDb\.message/);
  });

  it("ne redirige jamais avec un texte composé à la volée", () => {
    // `retour()` est le point de sortie unique et n’accepte qu’un code.
    const redirections = SOURCE_ACTIONS.match(/redirect\(`[^`]*`\)/g) ?? [];
    expect(redirections).toHaveLength(1);
    expect(redirections[0]).toBe("redirect(`${path}?${type}=${encodeURIComponent(code)}`)");
  });

  it("route tout échec base vers echecBase()", () => {
    // Chaque garde d’échec Supabase de la source doit passer par echecBase(),
    // seul endroit où le message technique est journalisé puis remplacé.
    const gardes = SOURCE_ACTIONS.split("\n").filter((ligne) =>
      /^\s*if\((?:error|erreurDb)\b/.test(ligne),
    );
    expect(gardes.length).toBeGreaterThanOrEqual(8);
    for (const garde of gardes) expect(garde).toContain("echecBase(");
  });
});
