/**
 * A-07 (ELSATIA_SATELLITES_PREVIEW_READINESS_V2) : Réserves lit la clé publique Supabase sous
 * le nom canonique de l'écosystème, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, avec repli
 * TRANSITOIRE sur l'alias hérité `NEXT_PUBLIC_SUPABASE_ANON_KEY` pour ne casser aucun
 * environnement existant (manifeste : « lecture canonique + repli sur l'alias, puis retrait »).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clePubliqueSupabase, clePubliqueSupabaseConfiguree, urlSupabase } from "./cles";

const CANONIQUE = "sb_publishable_canonique";
const HERITEE = "sb_publishable_heritee";

describe("clé publique Supabase de Réserves", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lit le nom canonique en priorité", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", CANONIQUE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", HERITEE);
    expect(clePubliqueSupabase()).toBe(CANONIQUE);
    expect(clePubliqueSupabaseConfiguree()).toBe(CANONIQUE);
  });

  it("accepte l'alias hérité seul pendant la transition (environnements existants)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", HERITEE);
    expect(clePubliqueSupabase()).toBe(HERITEE);
  });

  it("échoue en nommant la variable canonique quand aucune n'est posée", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => clePubliqueSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(clePubliqueSupabaseConfiguree()).toBeUndefined();
  });

  it("exige l'URL Supabase", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => urlSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
    expect(urlSupabase()).toBe("https://abcdefgh.supabase.co");
  });
});
