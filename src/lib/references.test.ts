import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTITES_REFERENCE,
  FORMATS_REFERENCE_DEFAUT,
  formaterReference,
  memeReference,
  messageErreurReference,
  nettoyerReference,
  validerFormat,
  validerReferenceSaisie,
} from "./references";

const SQL = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260912000283_gp_v1_references_internes.sql"),
  "utf8",
);

describe("parité avec la base", () => {
  it("les formats par défaut sont ceux de reference_parametre_defaut", () => {
    for (const entite of ENTITES_REFERENCE) {
      const f = FORMATS_REFERENCE_DEFAUT[entite];
      const ligne = new RegExp(`\\('${entite}',\\s*'${f.prefixe}',\\s*${f.largeur},\\s*${f.avecAnnee}`);
      expect(SQL, entite).toMatch(ligne);
    }
  });

  it("la base connaît exactement les mêmes natures d'objet", () => {
    const bloc = SQL.match(/entite in \(([^)]+)\)/)?.[1] ?? "";
    const natures = [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(natures).toEqual([...ENTITES_REFERENCE].sort());
  });
});

describe("nettoyerReference", () => {
  it("retire les espaces et rend l'absence explicite", () => {
    expect(nettoyerReference("  ESP-1  ")).toBe("ESP-1");
    expect(nettoyerReference("   ")).toBeNull();
    expect(nettoyerReference("")).toBeNull();
    expect(nettoyerReference(null)).toBeNull();
    expect(nettoyerReference(undefined)).toBeNull();
  });
});

describe("memeReference", () => {
  it("ignore casse, accents et séparateurs, comme l'unicité en base", () => {
    expect(memeReference("UNI-42", "uni 42")).toBe(true);
    expect(memeReference("TEST_A_CLI_001", "test a cli 001")).toBe(true);
    expect(memeReference("Bà13.200", "BA13200")).toBe(true);
    expect(memeReference("UNI-42", "UNI-43")).toBe(false);
  });

  it("deux références vides ne sont jamais « la même »", () => {
    expect(memeReference("", "")).toBe(false);
    expect(memeReference("--", "..")).toBe(false);
  });
});

describe("validerReferenceSaisie", () => {
  it("accepte une référence et la nettoie", () => {
    expect(validerReferenceSaisie(" PO-77 ")).toEqual({ ok: true, valeur: "PO-77" });
  });

  it("une saisie vide laisse la base générer", () => {
    expect(validerReferenceSaisie("  ")).toEqual({ ok: true, valeur: null });
  });

  it("refuse une référence faite seulement de séparateurs", () => {
    expect(validerReferenceSaisie("--")).toMatchObject({ ok: false });
    expect(validerReferenceSaisie(" . / ")).toMatchObject({ ok: false });
  });

  it("borne la longueur à 120 caractères", () => {
    expect(validerReferenceSaisie("x".repeat(120))).toMatchObject({ ok: true });
    expect(validerReferenceSaisie("x".repeat(121))).toMatchObject({ ok: false });
  });
});

describe("validerFormat", () => {
  it("accepte les formats par défaut", () => {
    for (const entite of ENTITES_REFERENCE) expect(validerFormat(FORMATS_REFERENCE_DEFAUT[entite])).toBeNull();
  });

  it("refuse un préfixe hors majuscules et chiffres", () => {
    expect(validerFormat({ prefixe: "pr-d", largeur: 4, avecAnnee: false })).not.toBeNull();
    expect(validerFormat({ prefixe: "", largeur: 4, avecAnnee: false })).not.toBeNull();
    expect(validerFormat({ prefixe: "TROPLONG9", largeur: 4, avecAnnee: false })).not.toBeNull();
  });

  it("borne la largeur de 3 à 8 chiffres", () => {
    expect(validerFormat({ prefixe: "ART", largeur: 2, avecAnnee: false })).not.toBeNull();
    expect(validerFormat({ prefixe: "ART", largeur: 9, avecAnnee: false })).not.toBeNull();
    expect(validerFormat({ prefixe: "ART", largeur: 3.5, avecAnnee: false })).not.toBeNull();
  });
});

describe("formaterReference", () => {
  it("reproduit next_reference, avec et sans année", () => {
    expect(formaterReference(FORMATS_REFERENCE_DEFAUT.client, 7, 2026)).toBe("CLI-0007");
    expect(formaterReference(FORMATS_REFERENCE_DEFAUT.chantier, 12, 2026)).toBe("CHA-2026-012");
    expect(formaterReference(FORMATS_REFERENCE_DEFAUT.article, 1, 2026)).toBe("ART-00001");
  });

  it("ne tronque jamais un numéro plus long que la largeur", () => {
    expect(formaterReference({ prefixe: "PRD", largeur: 3, avecAnnee: false }, 1234, 2026)).toBe("PRD-1234");
  });
});

describe("messageErreurReference", () => {
  it("traduit un doublon de référence par nature d'objet", () => {
    expect(
      messageErreurReference({
        code: "23505",
        message: 'duplicate key value violates unique constraint "clients_reference_interne_norm_uniq"',
      }),
    ).toBe("Cette référence est déjà utilisée par un autre client.");
    expect(
      messageErreurReference({
        code: "23505",
        message: 'duplicate key value violates unique constraint "prestations_catalogue_reference_interne_norm_uniq"',
      }),
    ).toContain("article du catalogue");
    expect(
      messageErreurReference({
        code: "23505",
        message: 'duplicate key value violates unique constraint "articles_stock_reference_interne_norm_uniq"',
      }),
    ).toContain("stock");
  });

  it("traduit un code distributeur en double", () => {
    expect(
      messageErreurReference({
        code: "23505",
        message: 'duplicate key value violates unique constraint "catalogue_codes_fournisseurs_prestation_uniq"',
      }),
    ).toContain("distributeur");
  });

  it("traduit une référence sans lettre ni chiffre", () => {
    expect(
      messageErreurReference({
        code: "23514",
        message: 'new row violates check constraint "prestations_catalogue_reference_interne_signifiante_check"',
      }),
    ).toContain("lettre ou un chiffre");
  });

  it("laisse passer les erreurs qui ne concernent pas une référence", () => {
    expect(messageErreurReference({ code: "23505", message: 'unique constraint "devis_numero_key"' })).toBeNull();
    expect(messageErreurReference({ code: "42501", message: "Accès refusé" })).toBeNull();
    expect(messageErreurReference(null)).toBeNull();
  });
});
