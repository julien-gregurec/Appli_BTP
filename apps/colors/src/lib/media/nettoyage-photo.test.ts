import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import {
  DIMENSION_MAXIMALE,
  MOTIFS_ECHEC,
  SORTIE_PAR_ENTREE,
  nettoyerPhotoColors,
  porteEncoreDesMetadonnees,
} from "@/lib/media/nettoyage-photo";
import {
  HAUTEUR_FIXTURE,
  LARGEUR_FIXTURE,
  LOGICIEL_FIXTURE,
  MARQUE_FIXTURE,
  MODELE_FIXTURE,
  ORIENTATION_FIXTURE,
  compterDebutsJpeg,
  contientRepertoireGps,
  photoPiegee,
  photoPropre,
} from "@/lib/media/__fixtures__/photo-piegee";

/**
 * Decision D2 — aucune photo n'atteint le stockage avec ses metadonnees.
 *
 * L'ordre de ces tests compte. On demontre d'abord que la fixture est
 * REELLEMENT piegee : sans cela, tout le reste passerait au vert sur une image
 * vierge et ne prouverait rien.
 */

const octets = (b: Buffer) => Buffer.from(b).toString("latin1");

describe("0. la fixture est bien piegee", () => {
  it("porte EXIF, GPS, appareil, logiciel et orientation", async () => {
    const piegee = await photoPiegee();
    const metadonnees = await sharp(piegee).metadata();
    expect(metadonnees.exif, "aucun EXIF dans la fixture").toBeTruthy();
    // Lecture reelle du repertoire GPS : une recherche de texte serait vacante,
    // les coordonnees etant stockees en rationnels binaires.
    expect(contientRepertoireGps(metadonnees.exif), "aucun repertoire GPS dans la fixture").toBe(true);
    expect(metadonnees.orientation).toBe(ORIENTATION_FIXTURE);
    expect(metadonnees.icc, "aucun profil colorimetrique dans la fixture").toBeTruthy();

    const texte = octets(piegee);
    expect(texte).toContain(MARQUE_FIXTURE);
    expect(texte).toContain(MODELE_FIXTURE);
    expect(texte).toContain(LOGICIEL_FIXTURE);
  });

  it("le detecteur de metadonnees la reconnait comme sale", async () => {
    expect(porteEncoreDesMetadonnees(await photoPiegee())).toBe(true);
  });

  it("et reconnait une image propre comme propre", async () => {
    expect(porteEncoreDesMetadonnees(await photoPropre())).toBe(false);
  });
});

describe("1. l'image finale reste orientee correctement", () => {
  it("l'orientation EXIF est appliquee aux pixels, pas seulement effacee", async () => {
    // Sans cette application prealable, retirer l'EXIF ferait basculer d'un
    // quart de tour toutes les photos prises en portrait.
    const resultat = await nettoyerPhotoColors(await photoPiegee(), "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.largeur).toBe(HAUTEUR_FIXTURE);
    expect(resultat.hauteur).toBe(LARGEUR_FIXTURE);
  });

  it("une image sans orientation n'est pas tournee", async () => {
    const resultat = await nettoyerPhotoColors(await photoPropre(), "image/png");
    expect(resultat.ok && resultat.largeur).toBe(LARGEUR_FIXTURE);
    expect(resultat.ok && resultat.hauteur).toBe(HAUTEUR_FIXTURE);
  });
});

describe("2. aucune coordonnee GPS ne subsiste", () => {
  it("ni dans les metadonnees decodees, ni dans les octets", async () => {
    const resultat = await nettoyerPhotoColors(await photoPiegee(), "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const apres = await sharp(Buffer.from(resultat.contenu)).metadata();
    // Pas d'EXIF du tout : il ne peut donc pas y avoir de repertoire GPS.
    expect(apres.exif).toBeUndefined();
    expect(contientRepertoireGps(apres.exif)).toBe(false);

    // Et le controle sur les octets, qui ne depend d'aucun decodeur.
    const texte = octets(Buffer.from(resultat.contenu));
    expect(texte).not.toContain("GPSLatitude");
    expect(texte).not.toContain("GPSLongitude");
    expect(porteEncoreDesMetadonnees(resultat.contenu)).toBe(false);
  });
});

describe("3. aucun EXIF sensible ne subsiste", () => {
  it("appareil, modele, logiciel et date ont disparu des octets", async () => {
    const resultat = await nettoyerPhotoColors(await photoPiegee(), "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const texte = octets(Buffer.from(resultat.contenu));
    for (const secret of [MARQUE_FIXTURE, MODELE_FIXTURE, LOGICIEL_FIXTURE, "2026:09:10"]) {
      expect(texte, secret).not.toContain(secret);
    }
  });

  it("le profil colorimetrique et les autres blocs ont disparu", async () => {
    const resultat = await nettoyerPhotoColors(await photoPiegee(), "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const apres = await sharp(Buffer.from(resultat.contenu)).metadata();
    expect(apres.icc).toBeUndefined();
    expect(apres.xmp).toBeUndefined();
    expect(apres.iptc).toBeUndefined();
    expect(porteEncoreDesMetadonnees(resultat.contenu)).toBe(false);
  });

  it("aucune miniature embarquee ne subsiste : un seul debut d'image JPEG", async () => {
    const resultat = await nettoyerPhotoColors(await photoPiegee(), "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    // Une miniature embarquee est une seconde image complete : elle produirait
    // un second marqueur de debut. Dans les donnees compressees, un octet 0xFF
    // est toujours suivi de 0x00 ou d'un marqueur, jamais de 0xD8 0xFF.
    expect(compterDebutsJpeg(resultat.contenu)).toBe(1);
  });
});

describe("4. le fichier original n'est jamais celui qui est conserve", () => {
  it("le contenu produit differe de l'entree", async () => {
    const piegee = await photoPiegee();
    const resultat = await nettoyerPhotoColors(piegee, "image/jpeg");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(Buffer.from(resultat.contenu).equals(piegee)).toBe(false);
  });

  it("la route de televersement ne stocke que le contenu nettoye", () => {
    const route = readFileSync(fileURLToPath(new URL("../../app/api/photos/route.ts", import.meta.url)), "utf8");
    // L'appel de stockage ne doit recevoir que la sortie du nettoyage.
    expect(route).toMatch(/nettoyerPhotoColors\(/);
    expect(route).toMatch(/upload\([^,]+,\s*nettoyage\.contenu/);
    // Et jamais le tampon d'origine.
    expect(route).not.toMatch(/upload\([^,]+,\s*contenu\b/);
  });
});

describe("5. un echec de nettoyage empeche le stockage", () => {
  it("un contenu qui n'est pas une image est refuse", async () => {
    const resultat = await nettoyerPhotoColors(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "image/jpeg");
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.echec).toBe("illisible");
    expect(resultat.motif).toBe(MOTIFS_ECHEC.illisible);
  });

  it("une image aux dimensions aberrantes est refusee", async () => {
    const enorme = await sharp({
      create: { width: DIMENSION_MAXIMALE + 1, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    const resultat = await nettoyerPhotoColors(enorme, "image/png");
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.echec).toBe("dimensions_excessives");
  });

  it("le refus n'expose jamais la valeur d'une metadonnee", async () => {
    for (const motif of Object.values(MOTIFS_ECHEC)) {
      expect(motif).not.toMatch(/GPS|latitude|longitude|Fabricant|Modele/i);
    }
  });

  it("la route refuse le stockage quand le nettoyage echoue", () => {
    const route = readFileSync(fileURLToPath(new URL("../../app/api/photos/route.ts", import.meta.url)), "utf8");
    const garde = route.indexOf("if (!nettoyage.ok)");
    const stockage = route.indexOf("stockage.upload(");
    expect(garde).toBeGreaterThan(-1);
    expect(stockage).toBeGreaterThan(garde);
  });
});

describe("6. tous les formats convergent vers le meme traitement", () => {
  it("HEIC et HEIF sortent en JPEG : aucun navigateur n'affiche du HEIC", () => {
    expect(SORTIE_PAR_ENTREE["image/heic"]).toBe("image/jpeg");
    expect(SORTIE_PAR_ENTREE["image/heif"]).toBe("image/jpeg");
  });

  it("les formats du web conservent leur famille", () => {
    expect(SORTIE_PAR_ENTREE["image/jpeg"]).toBe("image/jpeg");
    expect(SORTIE_PAR_ENTREE["image/png"]).toBe("image/png");
    expect(SORTIE_PAR_ENTREE["image/webp"]).toBe("image/webp");
  });

  it("une image PNG piegee est nettoyee comme une JPEG", async () => {
    const png = await sharp(await photoPiegee()).png().withExif({ IFD0: { Software: LOGICIEL_FIXTURE } }).toBuffer();
    expect(octets(png)).toContain(LOGICIEL_FIXTURE);
    const resultat = await nettoyerPhotoColors(png, "image/png");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(octets(Buffer.from(resultat.contenu))).not.toContain(LOGICIEL_FIXTURE);
  });
});

describe("7. aucun televersement direct ne contourne le nettoyage", () => {
  it("une seule route ecrit dans le stockage, et elle nettoie", () => {
    const routes = ["photos/route.ts", "ocr/route.ts", "export/inventaire/route.ts"];
    const ecrivains: string[] = [];
    for (const relative of routes) {
      const source = readFileSync(fileURLToPath(new URL(`../../app/api/${relative}`, import.meta.url)), "utf8");
      if (/stockage\.upload\(|storage\.from\([^)]*\)\.upload\(/.test(source)) ecrivains.push(relative);
    }
    expect(ecrivains).toEqual(["photos/route.ts"]);
  });

  it("la lecture d'etiquette ne stocke aucune image", () => {
    const ocr = readFileSync(fileURLToPath(new URL("../../app/api/ocr/route.ts", import.meta.url)), "utf8");
    expect(ocr).not.toMatch(/upload\(/);
    expect(ocr).not.toMatch(/createAdminStorageClient/);
  });
});
