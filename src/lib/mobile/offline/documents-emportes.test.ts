import { describe, expect, it } from "vitest";
import {
  TAILLE_MAX_DOCUMENT,
  issueRevalidation,
  peutEtreEmporte,
  tailleAnnoncee,
} from "@/lib/mobile/offline/documents-emportes";

describe("documents emportables", () => {
  it("accepte PDF et images consultables hors ligne", () => {
    expect(peutEtreEmporte("application/pdf", 92).valide).toBe(true);
    expect(peutEtreEmporte("image/png", 70).valide).toBe(true);
    expect(peutEtreEmporte("image/jpeg", 2048).valide).toBe(true);
  });

  it("refuse ce que le navigateur ne sait pas afficher sans réseau", () => {
    expect(peutEtreEmporte("application/vnd.ms-excel", 1000).valide).toBe(false);
    expect(peutEtreEmporte("video/mp4", 1000).valide).toBe(false);
  });

  it("refuse au-delà du plafond du bucket, et une taille inconnue", () => {
    expect(peutEtreEmporte("application/pdf", TAILLE_MAX_DOCUMENT + 1).valide).toBe(false);
    expect(peutEtreEmporte("application/pdf", 0).valide).toBe(false);
    expect(peutEtreEmporte("application/pdf", Number.NaN).valide).toBe(false);
  });
});

describe("taille annoncée avant téléchargement", () => {
  it("se lit en français", () => {
    expect(tailleAnnoncee(1)).toBe("1 octet");
    expect(tailleAnnoncee(92)).toBe("92 octets");
    expect(tailleAnnoncee(1536)).toBe("1,5 Ko");
    expect(tailleAnnoncee(1258291)).toBe("1,2 Mo");
  });
});

describe("revérification au retour du réseau", () => {
  it("efface la copie d'un document supprimé ou dont l'accès a été retiré", () => {
    // Conserver la copie reviendrait à contourner la révocation par le seul fait d'avoir
    // été hors ligne au bon moment.
    expect(issueRevalidation(404)).toBe("revoquer");
    expect(issueRevalidation(403)).toBe("revoquer");
  });

  it("conserve la copie d'un document toujours accessible", () => {
    expect(issueRevalidation(200)).toBe("conserver");
    expect(issueRevalidation(307)).toBe("conserver");
  });

  it("n'efface JAMAIS sur une panne : elle ne dit rien des droits", () => {
    expect(issueRevalidation(503)).toBe("reessayer");
    expect(issueRevalidation(0)).toBe("reessayer");
    expect(issueRevalidation(401)).toBe("reessayer");
  });
});
