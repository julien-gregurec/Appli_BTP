import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accesDansSaFenetre,
  construireSelecteurApplications,
  environnementApplications,
  libelleRoleApplication,
  urlApplication,
  valeurDateHeureLocale,
} from "@/lib/multi-app";
import type { ApplicationElsatiaAutorisee } from "@elsatia/application-access";

const application = (code: string, roleCode = `${code}_utilisateur`): ApplicationElsatiaAutorisee => ({
  applicationCode: code,
  nom: `ELSATIA ${code}`,
  roleCode,
  urlLocale: `http://localhost/${code}`,
  urlPreview: `https://preview.example/${code}`,
  urlProduction: `https://example.com/${code}`,
  icone: null,
  estAdminPlateforme: false,
});

describe("ELSATIA Gestion Pro multi-app UI V1 — 20 scénarios", () => {
  it("01 — choisit local par défaut", () => expect(environnementApplications(undefined)).toBe("local"));
  it("02 — reconnaît preview", () => expect(environnementApplications("preview")).toBe("preview"));
  it("03 — reconnaît production", () => expect(environnementApplications("production")).toBe("production"));
  it("04 — rabat une valeur inconnue sur local", () => expect(environnementApplications("staging")).toBe("local"));
  it("05 — sélectionne l’URL locale", () => expect(urlApplication(application("colors"), "local")).toBe("http://localhost/colors"));
  it("06 — sélectionne l’URL preview", () => expect(urlApplication(application("colors"), "preview")).toBe("https://preview.example/colors"));
  it("07 — sélectionne l’URL production", () => expect(urlApplication(application("colors"), "production")).toBe("https://example.com/colors"));
  it("08 — conserve une URL absente comme non configurée", () => expect(urlApplication({ ...application("future"), urlPreview: null }, "preview")).toBeNull());
  it("09 — marque Gestion Pro comme application courante", () => expect(construireSelecteurApplications([application("gestion_pro")], "gestion_pro", "local")[0].active).toBe(true));
  it("10 — ne marque pas Colors comme application courante", () => expect(construireSelecteurApplications([application("colors")], "gestion_pro", "local")[0].active).toBe(false));
  it("11 — ajoute une future application sans liste codée en dur", () => expect(construireSelecteurApplications([application("gestion_pro"), application("future_app")], "gestion_pro", "local").map((item) => item.code)).toEqual(["gestion_pro", "future_app"]));
  it("12 — accepte un accès courant sans bornes", () => expect(accesDansSaFenetre({ autorise: true, valide_du: null, valide_jusqu_au: null }, 1_000)).toBe(true));
  it("13 — refuse un accès explicitement désactivé", () => expect(accesDansSaFenetre({ autorise: false, valide_du: null, valide_jusqu_au: null }, 1_000)).toBe(false));
  it("14 — refuse un accès futur", () => expect(accesDansSaFenetre({ autorise: true, valide_du: new Date(2_000).toISOString(), valide_jusqu_au: null }, 1_000)).toBe(false));
  it("15 — refuse un accès expiré", () => expect(accesDansSaFenetre({ autorise: true, valide_du: null, valide_jusqu_au: new Date(1_000).toISOString() }, 1_000)).toBe(false));
  it("16 — accepte un accès dans sa fenêtre", () => expect(accesDansSaFenetre({ autorise: true, valide_du: new Date(500).toISOString(), valide_jusqu_au: new Date(1_500).toISOString() }, 1_000)).toBe(true));
  it("17 — expose le rôle canonique Gestion Pro", () => expect(libelleRoleApplication("gestion_pro_admin")).toContain("Gestion Pro"));
  it("18 — expose les quatre rôles canoniques Colors", () => expect(["colors_admin_organisation", "colors_gestionnaire_stock", "colors_utilisateur_depot", "colors_consultation"].map(libelleRoleApplication)).toHaveLength(4));
  it("19 — conserve un rôle futur inconnu", () => expect(libelleRoleApplication("future_role")).toBe("future_role"));
  it("20 — garde les actions serveur sur les RPC et le contrôle admin canoniques", () => {
    const source = readFileSync(new URL("../app/actions/multi-app.ts", import.meta.url), "utf8");
    expect(source).toContain("await estAdministrateurPlateformeMultiApp()");
    expect(source).toContain("plateforme_activer_application_entreprise");
    expect(source).toContain("plateforme_desactiver_application_entreprise");
    expect(source).toContain("plateforme_habiliter_utilisateur_application");
    expect(source).toContain("plateforme_retirer_habilitation_application");
    expect(source).not.toMatch(/\.from\(["'](?:acces_applications_entreprises|habilitations_applications_utilisateurs)["']\)\.(?:insert|update|delete|upsert)/);
    expect(source).not.toMatch(/@elsatia\.fr/);
  });
});

describe("formatage des dates d’administration", () => {
  it("laisse une valeur absente vide", () => expect(valeurDateHeureLocale(null)).toBe(""));
  it("refuse une date invalide", () => expect(valeurDateHeureLocale("incorrecte")).toBe(""));
});
