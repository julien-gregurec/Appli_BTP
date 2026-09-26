import { describe, expect, it } from "vitest";
import {
  contenuEmailReponseSupport,
  extraitReponseSupport,
  referenceFilSupport,
  sujetDemandeSupport,
} from "./email-support";

const ENTREPRISE = "a0000000-0000-4000-8000-000000000001";

describe("referenceFilSupport", () => {
  it("dérive une référence lisible et stable du fil", () => {
    expect(referenceFilSupport(ENTREPRISE)).toBe("SUP-A0000000");
    expect(referenceFilSupport(ENTREPRISE)).toBe(referenceFilSupport(ENTREPRISE.toUpperCase()));
  });

  it("ne fabrique pas de référence à partir d'une valeur non canonique", () => {
    for (const valeur of [null, undefined, "", "  ", "pas-un-uuid", "../../aide"]) {
      expect(referenceFilSupport(valeur)).toBeNull();
    }
  });
});

describe("sujetDemandeSupport", () => {
  it("reprend la première ligne utile de la demande", () => {
    expect(sujetDemandeSupport("\n\n  Export comptable   incomplet \nDétail ensuite")).toBe("Export comptable incomplet");
  });

  it("tronque une demande longue et renvoie null si elle est vide", () => {
    const sujet = sujetDemandeSupport("A".repeat(200));
    expect(sujet).toHaveLength(81);
    expect(sujet?.endsWith("…")).toBe(true);
    expect(sujetDemandeSupport("   \n  ")).toBeNull();
  });
});

describe("extraitReponseSupport", () => {
  it("aplatit et tronque la réponse", () => {
    expect(extraitReponseSupport("Bonjour,\n\nC'est corrigé.")).toBe("Bonjour, C'est corrigé.");
    const extrait = extraitReponseSupport("B".repeat(400));
    expect(extrait).toHaveLength(241);
    expect(extrait?.endsWith("…")).toBe(true);
  });

  it("renvoie null sur une réponse vide", () => {
    expect(extraitReponseSupport("   ")).toBeNull();
    expect(extraitReponseSupport(null)).toBeNull();
  });
});

describe("contenuEmailReponseSupport", () => {
  const BASE = {
    prenom: "Camille",
    nom: "Durand",
    entrepriseNom: "SARL Test",
    reference: "SUP-A0000000",
    sujet: "Export comptable incomplet",
    extrait: "C'est corrigé depuis ce matin.",
    lienSupport: "https://app.elsatia.fr/aide",
    emailSupport: "support@elsatia.fr",
  };

  it("porte l'objet attendu et les éléments d'identification du fil", () => {
    const contenu = contenuEmailReponseSupport(BASE);
    expect(contenu.sujet).toBe("Réponse du support ELSATIA");
    expect(contenu.texte).toContain("Bonjour Camille Durand,");
    expect(contenu.texte).toContain("Référence : SUP-A0000000");
    expect(contenu.texte).toContain("Entreprise : SARL Test");
    expect(contenu.texte).toContain("Votre demande : Export comptable incomplet");
    expect(contenu.texte).toContain("C'est corrigé depuis ce matin.");
    expect(contenu.texte).toContain("support@elsatia.fr");
  });

  it("n'ajoute le bouton que si un lien interne est fourni", () => {
    expect(contenuEmailReponseSupport(BASE).html).toContain('href="https://app.elsatia.fr/aide"');
    const sansLien = contenuEmailReponseSupport({ ...BASE, lienSupport: null });
    expect(sansLien.html).not.toContain("<a href");
    expect(sansLien.texte).toContain("connectez-vous à votre espace d'aide");
  });

  it("dégrade proprement sans identité, sans entreprise et sans extrait", () => {
    const contenu = contenuEmailReponseSupport({ reponse: undefined } as never);
    expect(contenu.texte).toContain("Bonjour,");
    expect(contenu.texte).not.toContain("Référence :");
    expect(contenu.texte).not.toContain("Entreprise :");
    expect(contenu.texte).not.toContain("« ");
  });

  it("échappe le contenu opérateur au lieu de l'injecter en HTML", () => {
    const contenu = contenuEmailReponseSupport({
      ...BASE,
      nom: '<img src=x onerror="alert(1)">',
      extrait: "<script>alert('xss')</script>",
    });
    // Aucune balise ne survit : `onerror` ne peut plus être un attribut faute
    // de `<img` ouvrant, et le script est rendu comme du texte.
    expect(contenu.html).not.toContain("<script>");
    expect(contenu.html).not.toContain("<img");
    expect(contenu.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(contenu.html).toContain("&lt;script&gt;");
  });

  it("ne transporte ni identifiant technique ni donnée interne du fil", () => {
    const contenu = contenuEmailReponseSupport(BASE);
    const complet = `${contenu.sujet}\n${contenu.texte}\n${contenu.html}`;
    for (const interdit of ["support_messages", "auteur_id", "lu_par_plateforme", "plateforme_support", "service_role", "BREVO"]) {
      expect(complet).not.toContain(interdit);
    }
    // La référence n'expose qu'un préfixe : jamais l'identifiant complet.
    expect(complet).not.toContain("a0000000-0000-4000-8000-000000000001");
  });
});
