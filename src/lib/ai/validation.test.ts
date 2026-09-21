import { describe, expect, it } from "vitest";
import {
  NOMBRE_MAX_MESSAGES,
  TAILLE_MAX_CORPS_ASSISTANT,
  TAILLE_MAX_PIECE_JOINTE_BASE64,
  TAILLE_MAX_PIECE_JOINTE_OCTETS,
  TAILLE_MAX_TEXTE_MESSAGE,
  estBase64Valide,
  validerRequeteAssistant,
} from "./validation";

// Genere une chaine base64 valide dont la taille DECODEE (en octets) correspond
// exactement a `octets`, pour tester precisement les bornes de taille reelle.
function base64DeTaille(octets: number): string {
  return Buffer.alloc(octets, 1).toString("base64");
}

const messageUtilisateur = (contenu: string, fichier?: { mimeType: string; base64: string }) => [
  { role: "user" as const, contenu, fichier },
];

describe("validerRequeteAssistant", () => {
  it("accepte un message texte normal sans fichier", () => {
    expect(validerRequeteAssistant(messageUtilisateur("Bonjour, peux-tu résumer ce chantier ?"))).toEqual({ ok: true });
  });

  it("accepte une pièce jointe JPEG de 50 Ko", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Analyse cette photo", { mimeType: "image/jpeg", base64: base64DeTaille(50 * 1024) }),
    );
    expect(resultat).toEqual({ ok: true });
  });

  it("accepte une pièce jointe JPEG de 500 Ko (cas régression confirmé)", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Analyse cette photo", { mimeType: "image/jpeg", base64: base64DeTaille(500 * 1024) }),
    );
    expect(resultat).toEqual({ ok: true });
  });

  it("accepte un PDF fictif de 1 Mo", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Relis ce devis", { mimeType: "application/pdf", base64: base64DeTaille(1024 * 1024) }),
    );
    expect(resultat).toEqual({ ok: true });
  });

  it("accepte un fichier proche de la limite de 6 Mo", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Photo haute résolution", { mimeType: "image/jpeg", base64: base64DeTaille(TAILLE_MAX_PIECE_JOINTE_OCTETS - 1_000) }),
    );
    expect(resultat).toEqual({ ok: true });
  });

  it("refuse un fichier strictement supérieur à 6 Mo", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Photo trop lourde", { mimeType: "image/jpeg", base64: base64DeTaille(TAILLE_MAX_PIECE_JOINTE_OCTETS + 1_000) }),
    );
    expect(resultat).toEqual({ ok: false, message: "La pièce jointe dépasse la taille maximale autorisée de 6 Mo.", statut: 400 });
  });

  it("refuse un type MIME interdit", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Ouvre ce fichier", { mimeType: "application/zip", base64: base64DeTaille(1024) }),
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.message).toMatch(/non pris en charge/);
  });

  it("refuse un historique de plus de 30 messages", () => {
    const historique = Array.from({ length: NOMBRE_MAX_MESSAGES + 1 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      contenu: `message ${index}`,
    }));
    const resultat = validerRequeteAssistant(historique);
    expect(resultat).toEqual({ ok: false, message: "Conversation trop longue, démarre une nouvelle discussion.", statut: 400 });
  });

  it("refuse un payload texte abusif sans fichier (70 000 caractères)", () => {
    const resultat = validerRequeteAssistant(messageUtilisateur("x".repeat(70_000)));
    expect(resultat).toEqual({ ok: false, message: "Message trop long, raccourcis ta demande.", statut: 400 });
  });

  it("accepte un message texte juste sous la limite dédiée", () => {
    const resultat = validerRequeteAssistant(messageUtilisateur("x".repeat(TAILLE_MAX_TEXTE_MESSAGE)));
    expect(resultat).toEqual({ ok: true });
  });

  it("refuse une base64 invalide (caractères hors alphabet)", () => {
    const resultat = validerRequeteAssistant(
      messageUtilisateur("Photo", { mimeType: "image/jpeg", base64: "!!!pas-du-base64-valide!!!" }),
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.message).toMatch(/illisible/);
  });

  it("refuse une pièce jointe présente sur un message autre que le dernier", () => {
    const historique = [
      { role: "user" as const, contenu: "Première photo", fichier: { mimeType: "image/jpeg", base64: base64DeTaille(1024) } },
      { role: "assistant" as const, contenu: "Je regarde." },
      { role: "user" as const, contenu: "Et celle-ci ?" },
    ];
    const resultat = validerRequeteAssistant(historique);
    expect(resultat).toEqual({ ok: false, message: "Une seule pièce jointe est autorisée, sur le dernier message uniquement.", statut: 400 });
  });

  it("refuse un historique vide ou absent", () => {
    expect(validerRequeteAssistant(undefined).ok).toBe(false);
    expect(validerRequeteAssistant([]).ok).toBe(false);
  });

  it("refuse quand le dernier message n'est pas de l'utilisateur", () => {
    const historique = [{ role: "assistant" as const, contenu: "..." }];
    expect(validerRequeteAssistant(historique).ok).toBe(false);
  });
});

describe("estBase64Valide", () => {
  it("accepte une chaîne base64 correctement formée", () => {
    expect(estBase64Valide(Buffer.from("test").toString("base64"))).toBe(true);
  });

  it("refuse une chaîne vide", () => {
    expect(estBase64Valide("")).toBe(false);
  });

  it("refuse une longueur non multiple de 4", () => {
    expect(estBase64Valide("abcde")).toBe(false);
  });

  it("refuse des caractères hors alphabet base64", () => {
    expect(estBase64Valide("abc!")).toBe(false);
  });
});

describe("cohérence des constantes de taille", () => {
  it("TAILLE_MAX_CORPS_ASSISTANT laisse assez de place pour l'historique texte et une pièce jointe au maximum", () => {
    const besoinTheorique = NOMBRE_MAX_MESSAGES * TAILLE_MAX_TEXTE_MESSAGE + TAILLE_MAX_PIECE_JOINTE_BASE64;
    expect(TAILLE_MAX_CORPS_ASSISTANT).toBeGreaterThan(besoinTheorique);
  });

  it("TAILLE_MAX_PIECE_JOINTE_OCTETS reste cohérent avec le message affiché à l'utilisateur (6 Mo)", () => {
    expect(TAILLE_MAX_PIECE_JOINTE_OCTETS).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
