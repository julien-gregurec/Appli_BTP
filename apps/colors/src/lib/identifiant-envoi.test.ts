import { describe, expect, it } from "vitest";
import { identifiantEnvoi } from "./identifiant-envoi";

describe("identifiantEnvoi", () => {
  it("accepte un UUID et le normalise en minuscules", () => {
    expect(identifiantEnvoi("5EA00000-0000-4000-8000-00000000000A")).toBe("5ea00000-0000-4000-8000-00000000000a");
  });

  it("ignore l'absence, le vide et tout ce qui n'est pas un UUID", () => {
    for (const valeur of [null, "", "abc", "5ea00000-0000-4000-8000-00000000000a' or 1=1", "5ea00000000040008000000000000000a"]) {
      expect(identifiantEnvoi(valeur)).toBeNull();
    }
  });

  it("ignore un fichier envoyé à la place du champ", () => {
    expect(identifiantEnvoi(new File(["x"], "x.txt"))).toBeNull();
  });
});
