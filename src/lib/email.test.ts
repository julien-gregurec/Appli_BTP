import {describe,expect,it} from "vitest";
import {construireLienMailto} from "@/lib/email";

describe("lien e-mail devis et factures",()=>{
  it("encode les espaces et accents sans aucun signe plus",()=>{
    const lien=construireLienMailto({to:"client@example.fr",sujet:"Devis accepté — Électricité",corps:"Bonjour Madame,\n\nPièce jointe à vérifier.",cc:"chef@example.fr; comptable@example.fr"});
    expect(lien).not.toContain("+");
    expect(lien).toContain("%20");
    const params=new URLSearchParams(lien.slice(lien.indexOf("?")+1));
    expect(params.get("subject")).toBe("Devis accepté — Électricité");
    expect(params.get("body")).toBe("Bonjour Madame,\n\nPièce jointe à vérifier.");
    expect(params.get("cc")).toBe("chef@example.fr,comptable@example.fr");
  });
});
