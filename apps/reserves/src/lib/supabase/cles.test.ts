import { afterEach, describe, expect, it, vi } from "vitest";
import { clePubliqueSupabase } from "./cles";

describe("clé publique Supabase de Réserves", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lit le nom courant de l'écosystème en premier", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_courante");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "ancienne");
    expect(clePubliqueSupabase()).toBe("sb_publishable_courante");
  });

  it("accepte l'ancien nom en transition, sans casser un environnement déjà configuré", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "ancienne");
    expect(clePubliqueSupabase()).toBe("ancienne");
  });

  it("dit ce qui manque au lieu de laisser le SDK annoncer « supabaseKey is required »", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => clePubliqueSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente/);
  });
});
