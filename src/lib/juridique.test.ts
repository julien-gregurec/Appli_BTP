import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION_CGU, VERSION_CGV } from "./juridique";

describe("versions juridiques synchronisées avec les documents publiés", () => {
  it("docs/juridique/cgu.md affiche bien VERSION_CGU", () => {
    const contenu = readFileSync(resolve(process.cwd(), "docs/juridique/cgu.md"), "utf8");
    expect(contenu).toContain(`Version ${VERSION_CGU}`);
  });

  it("docs/juridique/cgv.md affiche bien VERSION_CGV", () => {
    const contenu = readFileSync(resolve(process.cwd(), "docs/juridique/cgv.md"), "utf8");
    expect(contenu).toContain(`Version ${VERSION_CGV}`);
  });
});
