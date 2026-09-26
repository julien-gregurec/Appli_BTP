import { describe, expect, it } from "vitest";
import { optionsCookieAuth } from "./cookies";

describe("cookie de session Supabase", () => {
  it("est explicite, same-site et sécurisé en production", () => {
    expect(optionsCookieAuth("production")).toMatchObject({
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
  });

  it("reste utilisable en HTTP local uniquement hors production", () => {
    expect(optionsCookieAuth("development").secure).toBe(false);
  });
});
