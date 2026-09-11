import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEPARATEUR_FAMILLE,
  arbreFamilles,
  libelleFamille,
  optionsFamilles,
  refusRangement,
  validerNomFamille,
  type Famille,
} from "./familles";

const f = (id: string, nom: string, parentId: string | null = null, p: Partial<Famille> = {}): Famille => ({
  id, nom, parentId, ordre: 0, actif: true, ...p,
});

const platrerie = f("p", "Plâtrerie");
const plaques = f("pq", "Plaques", "p");
const rails = f("rl", "Rails", "p", { ordre: -1 });
const menuiserie = f("m", "Menuiserie");
const archivee = f("a", "Ancienne", null, { actif: false });
const toutes = [plaques, menuiserie, rails, platrerie, archivee];

describe("parité avec la base", () => {
  it("même séparateur que libelle_famille en SQL", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/proposed/gp-v1-metier-bibliotheque.sql.proposed"), "utf8");
    expect(sql).toContain(`p.nom || '${SEPARATEUR_FAMILLE}' || f.nom`);
  });
});

describe("libelleFamille", () => {
  it("« Famille › Sous-famille », ou le nom seul au premier niveau", () => {
    const parId = new Map(toutes.map((x) => [x.id, x]));
    expect(libelleFamille(plaques, parId)).toBe("Plâtrerie › Plaques");
    expect(libelleFamille(platrerie, parId)).toBe("Plâtrerie");
  });
});

describe("arbreFamilles", () => {
  it("trie par ordre puis par nom, sous-familles rangées sous leur parent", () => {
    const arbre = arbreFamilles(toutes);
    expect(arbre.map((b) => b.famille.nom)).toEqual(["Ancienne", "Menuiserie", "Plâtrerie"]);
    expect(arbre[2].sousFamilles.map((s) => s.nom)).toEqual(["Rails", "Plaques"]);
  });

  it("une sous-famille orpheline remonte au premier niveau plutôt que de disparaître", () => {
    expect(arbreFamilles([f("o", "Orpheline", "absente")]).map((b) => b.famille.nom)).toEqual(["Orpheline"]);
  });
});

describe("optionsFamilles", () => {
  it("omet les familles archivées", () => {
    expect(optionsFamilles(toutes).map((o) => o.libelle)).toEqual([
      "Menuiserie", "Plâtrerie", "Plâtrerie › Rails", "Plâtrerie › Plaques",
    ]);
  });

  it("garde une famille archivée déjà choisie : une valeur enregistrée ne disparaît pas", () => {
    expect(optionsFamilles(toutes, "a").map((o) => o.id)).toContain("a");
  });

  it("indique le niveau pour l'indentation", () => {
    expect(optionsFamilles(toutes).find((o) => o.id === "pq")?.niveau).toBe(1);
  });
});

describe("validerNomFamille", () => {
  it("nettoie et exige un nom", () => {
    expect(validerNomFamille("  Plâtrerie ")).toEqual({ ok: true, valeur: "Plâtrerie" });
    expect(validerNomFamille("   ")).toMatchObject({ ok: false });
    expect(validerNomFamille("x".repeat(121))).toMatchObject({ ok: false });
  });
});

describe("refusRangement — mêmes règles que la base", () => {
  it("deux niveaux au plus", () => {
    expect(refusRangement(toutes, "Trop profond", "pq")).toMatch(/Deux niveaux/);
  });

  it("jamais sa propre sous-famille", () => {
    expect(refusRangement(toutes, "Menuiserie", "m", "m")).toMatch(/propre sous-famille/);
  });

  it("une famille qui a des sous-familles ne devient pas sous-famille", () => {
    expect(refusRangement(toutes, "Plâtrerie", "m", "p")).toMatch(/a des sous-familles/);
  });

  it("nom unique sous un même parent, sur la forme normalisée", () => {
    expect(refusRangement(toutes, "platrerie", null)).toMatch(/existe déjà/);
    expect(refusRangement(toutes, "PLAQUES", "p")).toMatch(/existe déjà/);
  });

  it("un même nom est libre sous un autre parent, et renommer une famille en elle-même est permis", () => {
    expect(refusRangement(toutes, "Plaques", "m")).toBeNull();
    expect(refusRangement(toutes, "Plâtrerie", null, "p")).toBeNull();
  });
});
