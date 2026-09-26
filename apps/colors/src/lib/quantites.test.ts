import { describe, expect, it } from "vitest";
import { calculerPourcentage, validerQuantite } from "@/lib/quantites";
import {
  CODE_QUANTITE_RESTANTE_DEPASSE,
  CODE_QUANTITE_RESTANTE_NEGATIVE,
  messageErreurMetier,
} from "@/lib/messages-metier";

describe("quantités Colors", () => {
  it("conserve une saisie en pourcentage", () => expect(calculerPourcentage({ mode:"pourcentage",unite:"pourcent",pourcentage:25 })).toBe(25));
  it("calcule les litres", () => expect(calculerPourcentage({ mode:"volume",unite:"l",nominale:10,restante:2.5 })).toBe(25));
  it("calcule les poids sans convertir en volume", () => expect(calculerPourcentage({ mode:"poids",unite:"kg",nominale:5,restante:1.25 })).toBe(25));
  it("refuse négatif et dépassement", () => {
    expect(validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:-1 })).toBe(CODE_QUANTITE_RESTANTE_NEGATIVE);
    expect(validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:11 })).toBe(CODE_QUANTITE_RESTANTE_DEPASSE);
  });
  it("ne renvoie que des codes affichables par le catalogue fermé", () => {
    const refus = [
      validerQuantite({ mode:"pourcentage",unite:"l",pourcentage:10 }),
      validerQuantite({ mode:"pourcentage",unite:"pourcent",pourcentage:180 }),
      validerQuantite({ mode:"volume",unite:"kg",nominale:1,restante:1 }),
      validerQuantite({ mode:"volume",unite:"l",nominale:0,restante:0 }),
      validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:-1 }),
      validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:11 }),
    ];
    for (const code of refus) expect(messageErreurMetier(code)).toBeTruthy();
  });
});
