import { afterEach, describe, expect, it } from "vitest";
import { clePubliqueSupabase } from "./keys";

const ancienneValeur = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ancienneValeur;
});

describe("clePubliqueSupabase", () => {
  it("retourne NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY quand elle est définie", () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(clePubliqueSupabase()).toBe("sb_publishable_test");
  });

  it("échoue explicitement si NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY est absente, sans repli silencieux", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => clePubliqueSupabase()).toThrowError(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
