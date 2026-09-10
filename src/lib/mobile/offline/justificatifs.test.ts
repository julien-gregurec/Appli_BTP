import { describe, expect, it } from "vitest";
import {
  TAILLE_MAX_JUSTIFICATIF,
  classerReponseDepot,
  controlerFichier,
  empreinteSha256,
  etapeDeduite,
  fichiersADeposer,
} from "@/lib/mobile/offline/justificatifs";

const octets = (...valeurs: number[]) => new Uint8Array(valeurs);
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const PNG = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);

describe("contrôle d'un justificatif avant conservation", () => {
  it("accepte une photo JPEG, un PDF et un PNG sur leur contenu RÉEL", () => {
    expect(controlerFichier(JPEG, "ticket.jpg")).toMatchObject({ valide: true, mime: "image/jpeg" });
    expect(controlerFichier(PDF, "facture.pdf")).toMatchObject({ valide: true, mime: "application/pdf" });
    expect(controlerFichier(PNG, "scan.png")).toMatchObject({ valide: true, mime: "image/png" });
  });

  it("juge le contenu et non l'extension", () => {
    // Un exécutable renommé en .jpg ne passe pas : on lit les premiers octets, comme le serveur.
    const deguise = new TextEncoder().encode("MZ\x90\x00 pas une image");
    const controle = controlerFichier(deguise, "photo.jpg");
    expect(controle.valide).toBe(false);
  });

  it("refuse un fichier vide", () => {
    expect(controlerFichier(new Uint8Array(0), "vide.jpg").valide).toBe(false);
  });

  it("refuse au-delà de 15 Mo, et dit combien pèse le fichier", () => {
    const lourd = new Uint8Array(TAILLE_MAX_JUSTIFICATIF + 1);
    lourd.set(JPEG);
    const controle = controlerFichier(lourd, "photo-hd.jpg");
    expect(controle.valide).toBe(false);
    if (!controle.valide) expect(controle.motif).toMatch(/15 Mo/);
  });

  it("accepte exactement la limite", () => {
    const juste = new Uint8Array(TAILLE_MAX_JUSTIFICATIF);
    juste.set(JPEG);
    expect(controlerFichier(juste, "limite.jpg").valide).toBe(true);
  });
});

describe("empreinte", () => {
  it("est stable, hexadécimale, sur 64 caractères — comme celle du serveur", async () => {
    const a = await empreinteSha256(PDF);
    const b = await empreinteSha256(PDF);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distingue deux contenus différents", async () => {
    expect(await empreinteSha256(PDF)).not.toBe(await empreinteSha256(JPEG));
  });
});

describe("étape d'une note avec justificatif", () => {
  const nonDepose = { id: "f1", empreinte: "a".repeat(64), depose: false };
  const depose = { id: "f2", empreinte: "b".repeat(64), depose: true };

  it("ne se dit JAMAIS synchronisée tant qu'un fichier n'est pas déposé", () => {
    // Le cœur de R3 : la note existe côté serveur, le fichier non. Ce n'est pas « transmis ».
    expect(etapeDeduite(true, [nonDepose])).toBe("envoi_justificatif");
    expect(etapeDeduite(true, [depose, nonDepose])).toBe("envoi_justificatif");
  });

  it("ne se dit pas synchronisée non plus sans aucun fichier", () => {
    // Une note « avec justificatif » arrivée sans fichier est exactement le défaut décrit.
    expect(etapeDeduite(true, [])).toBe("envoi_justificatif");
  });

  it("se dit synchronisée seulement quand note ET fichiers sont acquittés", () => {
    expect(etapeDeduite(true, [depose])).toBe("synchronise");
  });

  it("reste en attente tant que la note elle-même n'est pas créée", () => {
    expect(etapeDeduite(false, [nonDepose])).toBe("en_attente");
  });

  it("fait passer le conflit de note avant tout le reste", () => {
    expect(etapeDeduite(true, [depose], { note: true })).toBe("conflit");
  });

  it("signale un fichier refusé comme à corriger", () => {
    expect(etapeDeduite(true, [nonDepose], { fichier: true })).toBe("a_corriger");
  });

  it("ne liste que les fichiers restant à déposer", () => {
    expect(fichiersADeposer([depose, nonDepose]).map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("classement d'une réponse de dépôt", () => {
  it("reconnaît le succès", () => {
    expect(classerReponseDepot(200)).toBe("depose");
  });

  it("ne rejoue jamais un conflit : la note n'accepte plus de fichier", () => {
    expect(classerReponseDepot(409)).toBe("conflit");
  });

  it("ne rejoue jamais un refus du fichier : il serait refusé à l'identique", () => {
    expect(classerReponseDepot(400)).toBe("a_corriger");
    expect(classerReponseDepot(413)).toBe("a_corriger");
  });

  it("attend la reconnexion sans rien perdre quand la session a expiré", () => {
    expect(classerReponseDepot(401)).toBe("attente_session");
  });

  it("traite une panne comme transitoire", () => {
    expect(classerReponseDepot(503)).toBe("transitoire");
    expect(classerReponseDepot(0)).toBe("transitoire");
  });
});
