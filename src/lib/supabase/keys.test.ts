import { afterEach, describe, expect, it } from "vitest";
import { clePubliqueSupabase } from "./keys";

const anciennesValeurs = {
  publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anciennesValeurs.publishable;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anciennesValeurs.anon;
});

describe("clePubliqueSupabase", () => {
  it("utilise NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY quand elle est définie", () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-test";
    expect(clePubliqueSupabase()).toBe("sb_publishable_test");
  });

  it("retombe sur NEXT_PUBLIC_SUPABASE_ANON_KEY si la publishable est absente (environnements non migrés)", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-test";
    expect(clePubliqueSupabase()).toBe("legacy-anon-test");
  });
});
