import { describe, expect, it } from "vitest";
import { destinationInterneSure, urlExterneAutorisee } from "./redirects";

describe("redirections sûres", () => {
  it("accepte les chemins internes normaux", () => {
    expect(destinationInterneSure("/dashboard", "/repli")).toBe("/dashboard");
    expect(destinationInterneSure("/clients?filtre=actif#liste", "/repli")).toBe("/clients?filtre=actif#liste");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/%2f%2fevil.example",
    "/chemin\nLocation:https://evil.example",
    "https://user:pass@example.com",
  ])("refuse la destination externe ou ambiguë %s", (destination) => {
    expect(destinationInterneSure(destination, "/repli")).toBe("/repli");
  });

  it("n'autorise que les hôtes HTTPS explicitement approuvés", () => {
    expect(urlExterneAutorisee("https://checkout.stripe.com/c/pay", ["checkout.stripe.com"])).toBe(true);
    expect(urlExterneAutorisee("http://checkout.stripe.com/c/pay", ["checkout.stripe.com"])).toBe(false);
    expect(urlExterneAutorisee("https://checkout.stripe.com.evil.example/c/pay", ["checkout.stripe.com"])).toBe(false);
    expect(urlExterneAutorisee("https://user:pass@checkout.stripe.com/c/pay", ["checkout.stripe.com"])).toBe(false);
  });
});
