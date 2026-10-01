import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNITES } from "@/lib/devis";
import {
  ecartTexte, importToolsHref, messageErreurImport, ouvragesDistincts, regrouperParSource, resumeComparaison, sourceImport, statutImport, type ComparaisonImports,
} from "@/lib/imports-tools";
import { droitsGestionPour, MODULE_PERMISSION_PAR_CHEMIN } from "@/lib/module-permissions";

// Même correspondance de préfixe que le proxy serveur (src/lib/supabase/proxy.ts).
const droitAcces = (chemin: string) => MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => chemin === c || chemin.startsWith(`${c}/`))?.[1];

describe("Imports Tools / Relevé — Gestion Pro (Lot 11)", () => {
  it("statut : « nouvelle version disponible » prime sur « devis créé » ; jamais de devis implicite", () => {
    expect(statutImport({ statut: "importe", nouvelle_version_id: null, devis_id: null })).toEqual({ libelle: "À chiffrer", ton: "info" });
    expect(statutImport({ statut: "devis_cree", nouvelle_version_id: null, devis_id: "d" })).toEqual({ libelle: "Devis brouillon créé", ton: "succes" });
    expect(statutImport({ statut: "devis_cree", nouvelle_version_id: "v2", devis_id: "d" })).toEqual({ libelle: "Devis créé · nouvelle version disponible", ton: "alerte" });
    expect(statutImport({ statut: "remplace", nouvelle_version_id: "v2", devis_id: null }).libelle).toBe("Remplacé par une version plus récente");
  });
  it("source affichée : Tools, état, version, contrat", () => {
    expect(sourceImport({ source_etat: "existant", source_version: 2, contract_name: "elsatia.tools.estimation", contract_version: "1.0.0" }))
      .toBe("Tools · Relevé & Métré · Existant · version 2 · contrat 1.0.0");
  });
  it("liste : une carte par source (relevé × état), dernière version en tête, versions antérieures conservées", () => {
    const g = regrouperParSource([
      { id: "a1", source_releve_id: "r1", source_etat: "existant", source_version: 1 },
      { id: "a3", source_releve_id: "r1", source_etat: "existant", source_version: 3 },
      { id: "b1", source_releve_id: "r1", source_etat: "projete", source_version: 1 },
      { id: "a2", source_releve_id: "r1", source_etat: "existant", source_version: 2 },
    ]);
    expect(g.map((x) => `${x.derniere.id}:${x.versions.map((v) => v.source_version).join("")}`)).toEqual(["a3:321", "b1:1"]);
  });
  it("comparaison résumée en une phrase ; écart signé", () => {
    const c = { a: { version: 2 }, b: { version: 3 }, ecart: "60.00", compteurs: { ajoutees: 0, supprimees: 1, modifiees: 2, identiques: 5 } } as unknown as ComparaisonImports;
    expect(resumeComparaison(c)).toBe(`Version 2 → 3 : 1 supprimée(s), 2 modifiée(s) ; écart estimatif ${ecartTexte(60)} HT.`);
    expect(ecartTexte(60).startsWith("+")).toBe(true);
    expect(ecartTexte(-1).startsWith("+")).toBe(false);
  });
  it("correspondances : ouvrages distincts, lignes liées / non liées", () => {
    const l = (cle: string, liee: boolean) => ({ ouvrage_cle: cle, designation: cle.toUpperCase(), unite: "m²", ouvrage_code: null, prestation_id: liee ? "p1" : null, correspondance: liee ? "liee" : "non_liee" });
    expect(ouvragesDistincts([l("a|m2", false), l("a|m2", false), l("b|m2", true)])).toEqual([
      { cle: "a|m2", designation: "A|M2", unite: "m²", code: null, prestationId: null, lignes: 2, liees: 0 },
      { cle: "b|m2", designation: "B|M2", unite: "m²", code: null, prestationId: "p1", lignes: 1, liees: 1 },
    ]);
  });
  it("messages d'erreur : version périmée, devis existant, autre tenant, inattendu", () => {
    expect(messageErreurImport({ code: "PT409", message: "Une version plus récente de ce relevé a été importée (version 3)", hint: "VERSION_PERIMEE" })).toContain("version 3");
    expect(messageErreurImport({ code: "23505", message: "Un devis a déjà été créé depuis cet import", hint: "DEVIS_EXISTANT" })).toBe("Un devis a déjà été créé depuis cet import");
    expect(messageErreurImport({ code: "42501", message: "Import introuvable ou non accessible" })).toBe("Import introuvable ou non accessible.");
    expect(messageErreurImport({ code: "XX000", message: "détail SQL interne" })).toBe("Action impossible pour le moment. Réessayez.");
  });
  it("route sous /devis : lecture « acces_devis », actions « gerer_devis » ; URL échappée", () => {
    expect(importToolsHref("i 1", "i/2")).toBe("/devis/imports-tools/i%201?comparer=i%2F2");
    expect(droitAcces("/devis/imports-tools")).toBe("acces_devis");
    expect(droitAcces("/devis/imports-tools/abc")).toBe("acces_devis");
    expect(droitsGestionPour("/devis/imports-tools/abc")).toEqual(["gerer_devis"]);
  });
  it("unités GP : m³ disponible pour les volumes Tools ; liens vers l'écran depuis Devis et Ouvrages", () => {
    expect(UNITES).toContain("m³");
    for (const page of ["src/app/(app)/devis/page.tsx", "src/app/(app)/ouvrages/page.tsx"]) {
      expect(readFileSync(page, "utf8")).toContain("Imports Tools / Relevé");
    }
  });
});
