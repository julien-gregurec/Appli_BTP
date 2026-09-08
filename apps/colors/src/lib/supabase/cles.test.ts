/**
 * Contrat de lecture des variables publiques Supabase.
 *
 * Ce que ces tests fixent tient en une phrase : Colors n'a plus qu'une convention de nom, et
 * l'ancienne ne peut pas la remplacer en silence. Un repli sur `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * ferait démarrer l'application avec une clé que le projet Supabase ne reconnaît plus — la panne
 * d'authentification se produirait quand même, mais après le déploiement et sans message.
 */
import { afterEach, describe, expect, it } from "vitest";
import { clePubliqueSupabase, urlSupabase, urlSupabaseConfiguree } from "./cles";

const initial = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  cle: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ancienne: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function poser(nom: string, valeur: string | undefined) {
  if (valeur === undefined) delete process.env[nom];
  else process.env[nom] = valeur;
}

afterEach(() => {
  poser("NEXT_PUBLIC_SUPABASE_URL", initial.url);
  poser("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", initial.cle);
  poser("NEXT_PUBLIC_SUPABASE_ANON_KEY", initial.ancienne);
});

describe("clePubliqueSupabase", () => {
  it("retourne NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY quand elle est définie", () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(clePubliqueSupabase()).toBe("sb_publishable_test");
  });

  it("échoue explicitement quand elle est absente, en nommant la variable", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => clePubliqueSupabase()).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  /* Le test central de ce lot : l'ancien nom, seul, ne configure rien. */
  it("ignore NEXT_PUBLIC_SUPABASE_ANON_KEY, même seule présente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cle-legacy";
    expect(() => clePubliqueSupabase()).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("urlSupabase", () => {
  it("retourne l'origine configurée", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
    expect(urlSupabase()).toBe("https://exemple.supabase.co");
  });

  it("échoue explicitement quand elle est absente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => urlSupabase()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("urlSupabaseConfiguree", () => {
  /*
   * La CSP est le seul appelant qui doit survivre à l'absence : `construireCspColors` se replie
   * sur une politique plus stricte. Lever ici retirerait tous les en-têtes de sécurité du proxy
   * pour cause d'une seule origine d'images manquante.
   */
  it("ne lève jamais et rend undefined quand l'origine est absente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(urlSupabaseConfiguree()).toBeUndefined();
  });
});
