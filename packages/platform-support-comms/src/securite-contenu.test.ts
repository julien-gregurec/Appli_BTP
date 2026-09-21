import { describe, expect, it } from "vitest";
import { validerTexteCommunication } from "./texte";
import { validerLienCommunication, validerLibelleBouton } from "./liens";
import {
  detecterFormatImage,
  estSourceImageAutorisee,
  validerImageCommunication,
  validerRecadrage,
} from "./image";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("texte : XSS et HTML arbitraire", () => {
  it("refuse toute balise", () => {
    for (const charge of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "Bonjour <b>tous</b>",
      "a < b",
    ]) {
      const r = validerTexteCommunication(charge, { max: 200, champ: "Titre" });
      expect(r).toMatchObject({ valide: false, erreur: "html_interdit" });
    }
  });

  it("accepte un texte normal avec accents et ponctuation", () => {
    const r = validerTexteCommunication("Maintenance prévue jeudi — 22 h à 23 h", { max: 200, champ: "Titre" });
    expect(r).toMatchObject({ valide: true });
  });

  it("refuse les caractères de contrôle et invisibles", () => {
    const controle = `Titre${String.fromCharCode(0x07)}masqué`;
    expect(validerTexteCommunication(controle, { max: 200, champ: "Titre" })).toMatchObject({
      valide: false,
      erreur: "caracteres_de_controle",
    });
    const invisible = `Titre${String.fromCharCode(0x202e)}inverse`;
    expect(validerTexteCommunication(invisible, { max: 200, champ: "Titre" })).toMatchObject({
      valide: false,
      erreur: "caracteres_invisibles",
    });
  });

  it("borne la longueur", () => {
    expect(validerTexteCommunication("  ", { max: 10, champ: "Titre" })).toMatchObject({ valide: false, erreur: "vide" });
    expect(validerTexteCommunication("a".repeat(11), { max: 10, champ: "Titre" })).toMatchObject({
      valide: false,
      erreur: "trop_long",
    });
  });
});

describe("liens : schéma, hôte et redirection ouverte", () => {
  it("refuse les schémas dangereux", () => {
    for (const lien of ["javascript:alert(1)", "data:text/html,<script>", "http://app.elsatia.fr/x"]) {
      expect(validerLienCommunication(lien)).toMatchObject({ valide: false });
    }
  });

  it("refuse un domaine non autorisé", () => {
    expect(validerLienCommunication("https://elsatia.fr.evil.example/x")).toMatchObject({
      valide: false,
      erreur: "hote_non_autorise",
    });
  });

  it("accepte un sous-domaine ELSATIA", () => {
    expect(validerLienCommunication("https://app.elsatia.fr/abonnement")).toMatchObject({ valide: true });
  });

  it("refuse une redirection ouverte portée par un paramètre", () => {
    expect(
      validerLienCommunication("https://app.elsatia.fr/go?next=https://evil.example/phish"),
    ).toMatchObject({ valide: false, erreur: "redirection_ouverte" });
  });

  it("accepte une redirection interne", () => {
    expect(
      validerLienCommunication("https://app.elsatia.fr/go?next=https://colors.elsatia.fr/stock"),
    ).toMatchObject({ valide: true });
  });

  it("accepte un lien relatif simple et refuse la forme protocol-relative", () => {
    expect(validerLienCommunication("/abonnement")).toMatchObject({ valide: true, interne: true });
    expect(validerLienCommunication("//evil.example/x")).toMatchObject({
      valide: false,
      erreur: "redirection_ouverte",
    });
    expect(validerLienCommunication("/\\evil.example")).toMatchObject({ valide: false });
  });

  it("refuse des identifiants incorporés", () => {
    expect(validerLienCommunication("https://user:pass@app.elsatia.fr/x")).toMatchObject({
      valide: false,
      erreur: "identifiants_incorpores",
    });
  });

  it("borne le libellé de bouton", () => {
    expect(validerLibelleBouton("")).toMatchObject({ valide: false });
    expect(validerLibelleBouton("a".repeat(41))).toMatchObject({ valide: false });
    expect(validerLibelleBouton("Voir l’offre")).toMatchObject({ valide: true });
  });
});

describe("image : fichier malveillant et accessibilité", () => {
  const base = { largeur: 1200, hauteur: 675, texteAlternatif: "Bandeau de maintenance planifiée" };

  it("détecte le format réel", () => {
    expect(detecterFormatImage(PNG)).toBe("png");
    expect(detecterFormatImage(JPEG)).toBe("jpeg");
    expect(detecterFormatImage(WEBP)).toBe("webp");
    expect(detecterFormatImage(SVG)).toBeNull();
  });

  it("refuse un SVG même annoncé comme PNG", () => {
    const r = validerImageCommunication({ ...base, octets: SVG, mimeDeclare: "image/png" });
    expect(r).toMatchObject({ valide: false, erreur: "format_non_reconnu" });
  });

  it("refuse un MIME déclaré incohérent avec le contenu", () => {
    const r = validerImageCommunication({ ...base, octets: PNG, mimeDeclare: "image/jpeg" });
    expect(r).toMatchObject({ valide: false, erreur: "mime_incoherent" });
  });

  it("exige un texte alternatif", () => {
    const r = validerImageCommunication({ ...base, octets: PNG, mimeDeclare: "image/png", texteAlternatif: " " });
    expect(r).toMatchObject({ valide: false, erreur: "alt_manquant" });
  });

  it("n'exige jamais une image", () => {
    expect(validerImageCommunication(null)).toEqual({ valide: true, image: null });
  });

  it("borne taille et dimensions", () => {
    const lourde = new Uint8Array(3 * 1024 * 1024);
    lourde.set(PNG.subarray(0, 8));
    expect(validerImageCommunication({ ...base, octets: lourde, mimeDeclare: "image/png" })).toMatchObject({
      valide: false,
      erreur: "trop_lourde",
    });
    expect(
      validerImageCommunication({ ...base, octets: PNG, mimeDeclare: "image/png", largeur: 4000, hauteur: 3000 }),
    ).toMatchObject({ valide: false, erreur: "dimensions_trop_grandes" });
    expect(
      validerImageCommunication({ ...base, octets: PNG, mimeDeclare: "image/png", largeur: 100, hauteur: 60 }),
    ).toMatchObject({ valide: false, erreur: "dimensions_trop_petites" });
  });

  it("accepte une image conforme et signale les dimensions recommandées", () => {
    const r = validerImageCommunication({ ...base, octets: PNG, mimeDeclare: "image/png" });
    expect(r).toMatchObject({ valide: true });
    expect(r.valide && r.image).toMatchObject({
      format: "png",
      mime: "image/png",
      dimensionsRecommandees: true,
      texteAlternatif: "Bandeau de maintenance planifiée",
    });
  });

  it("refuse une source d'image distante non contrôlée", () => {
    expect(estSourceImageAutorisee("https://cdn.evil.example/pub.png")).toBe(false);
    expect(estSourceImageAutorisee("http://projet.supabase.co/x.png")).toBe(false);
    expect(estSourceImageAutorisee("https://projet.supabase.co/storage/v1/object/x.png")).toBe(true);
    expect(estSourceImageAutorisee("/storage/communications/x.png")).toBe(true);
    expect(estSourceImageAutorisee("//evil.example/x.png")).toBe(false);
  });

  it("borne le recadrage à la source", () => {
    expect(validerRecadrage({ largeurSource: 1200, hauteurSource: 675, x: 0, y: 0, largeur: 1200, hauteur: 675 })).toBe(true);
    expect(validerRecadrage({ largeurSource: 1200, hauteurSource: 675, x: 100, y: 0, largeur: 1200, hauteur: 675 })).toBe(false);
    expect(validerRecadrage({ largeurSource: 1200, hauteurSource: 675, x: -1, y: 0, largeur: 10, hauteur: 10 })).toBe(false);
  });
});
