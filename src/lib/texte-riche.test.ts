import { describe, expect, it } from "vitest";
import { aDuFormatage, analyserTexteRiche, basculerBalise, styleSegment, texteBrut } from "./texte-riche";

describe("texte riche — format interne à liste blanche", () => {
  it("texte sans balise = un segment brut", () => {
    expect(analyserTexteRiche("Cloison vitrée")).toEqual([{ texte: "Cloison vitrée" }]);
    expect(analyserTexteRiche("")).toEqual([]);
    expect(analyserTexteRiche(null)).toEqual([]);
  });
  it("gras, italique, souligné, surligné, couleur, imbrication", () => {
    const s = analyserTexteRiche("[b]Cloison vitrée[/b] bord à bord avec [u]porte toute hauteur[/u], [i]finition[/i] [c=rouge]urgent[/c] [h]note[/h]");
    expect(s).toEqual([
      { gras: true, texte: "Cloison vitrée" }, { texte: " bord à bord avec " }, { souligne: true, texte: "porte toute hauteur" }, { texte: ", " },
      { italique: true, texte: "finition" }, { texte: " " }, { couleur: "rouge", texte: "urgent" }, { texte: " " }, { surligne: true, texte: "note" },
    ]);
    expect(analyserTexteRiche("[b]gras [i]et italique[/i][/b]")).toEqual([{ gras: true, texte: "gras " }, { gras: true, italique: true, texte: "et italique" }]);
  });
  it("ne perd jamais de caractères : balises inconnues, couleurs hors palette, fermetures orphelines, HTML", () => {
    expect(texteBrut("[x]pas une balise[/x]")).toBe("[x]pas une balise[/x]");
    expect(texteBrut("[c=#ff0000]pas de HEX libre[/c]")).toBe("[c=#ff0000]pas de HEX libre[/c]");
    expect(texteBrut("fermeture [/b] seule")).toBe("fermeture [/b] seule");
    expect(texteBrut("<script>alert(1)</script> [b]x[/b]")).toBe("<script>alert(1)</script> x");
    expect(analyserTexteRiche("<b>html</b>")).toEqual([{ texte: "<b>html</b>" }]);
  });
  it("balise ouverte jamais fermée : rendue en texte littéral, sans style", () => {
    const s = analyserTexteRiche("[b]jamais fermé et [i]encore[/i]");
    expect(s.map((x) => x.texte).join("")).toBe("[b]jamais fermé et encore");
    expect(s.some((x) => x.gras)).toBe(false);
    expect(s.find((x) => x.texte === "encore")?.italique).toBe(true);
  });
  it("retours à la ligne conservés dans les segments", () => {
    expect(analyserTexteRiche("ligne 1\n[b]ligne 2[/b]")).toEqual([{ texte: "ligne 1\n" }, { gras: true, texte: "ligne 2" }]);
  });
  it("style CSS inline sans HTML", () => {
    expect(styleSegment({ gras: true, souligne: true, couleur: "bleu" })).toEqual({ fontWeight: "700", textDecoration: "underline", color: "#1d4ed8" });
    expect(styleSegment({ couleur: "accent" }).color).toContain("--doc-accent");
    expect(aDuFormatage("[u]x[/u]")).toBe(true);
    expect(aDuFormatage("x")).toBe(false);
  });
  it("basculerBalise enveloppe la sélection, puis la désenveloppe", () => {
    const t = "Cloison vitrée bord à bord";
    const r = basculerBalise(t, 0, 14, "b");
    expect(r.texte).toBe("[b]Cloison vitrée[/b] bord à bord");
    expect(r).toMatchObject({ debut: 0, fin: 21 });
    const r2 = basculerBalise(r.texte, r.debut, r.fin, "b");
    expect(r2.texte).toBe(t);
    expect(r2).toMatchObject({ debut: 0, fin: 14 });
    // Sélection intérieure d'une balise existante : on retire la balise autour.
    const r3 = basculerBalise("[b]Cloison[/b]", 3, 10, "b");
    expect(r3.texte).toBe("Cloison");
    // Couleur.
    expect(basculerBalise("mot", 0, 3, "c", "rouge").texte).toBe("[c=rouge]mot[/c]");
    // Sélection vide : inchangé.
    expect(basculerBalise(t, 4, 4, "b").texte).toBe(t);
  });
});
