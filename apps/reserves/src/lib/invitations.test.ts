import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  DUREE_INVITATION_JOURS, creerJetonInvitation, hacherJetonInvitation,
  urlApplicationReserves, urlInvitation,
} from "./invitations";

const MIGRATION = fileURLToPath(
  new URL("../../../../supabase/migrations/20260907000270_reserves_v3_collaboration_livrables_v1.sql", import.meta.url),
);

describe("jeton d'invitation", () => {
  it("produit un jeton différent à chaque appel", () => {
    const jetons = new Set(Array.from({ length: 200 }, () => creerJetonInvitation()));
    expect(jetons.size).toBe(200);
  });

  it("tire 32 octets, soit 43 caractères base64url sans remplissage", () => {
    const jeton = creerJetonInvitation();
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(jeton, "base64url")).toHaveLength(32);
  });

  it("hache en SHA-256 hexadécimal minuscule", () => {
    expect(hacherJetonInvitation("jeton-connu"))
      .toBe(createHash("sha256").update("jeton-connu").digest("hex"));
    expect(hacherJetonInvitation("jeton-connu")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produit une empreinte qui satisfait la contrainte de la migration", () => {
    // La base refuse tout `token_hash` qui n'est pas 64 caractères hexadécimaux : le
    // format calculé ici et celui exigé là-bas ne peuvent pas diverger sans que ce test
    // le voie.
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')");
    expect(hacherJetonInvitation(creerJetonInvitation())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ne rend jamais le jeton en clair dans son empreinte", () => {
    const jeton = creerJetonInvitation();
    expect(hacherJetonInvitation(jeton)).not.toContain(jeton);
  });
});

describe("durée de validité", () => {
  it("reste dans les bornes que la base sait accepter", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("least(greatest(coalesce(p_duree_jours, 30), 1), 90)");
    expect(DUREE_INVITATION_JOURS).toBeGreaterThanOrEqual(1);
    expect(DUREE_INVITATION_JOURS).toBeLessThanOrEqual(90);
  });
});

describe("URL d'invitation", () => {
  it("est absolue : elle voyage par e-mail", () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVES_URL", "https://reserves.elsatia.fr");
    expect(urlInvitation("abc")).toBe("https://reserves.elsatia.fr/invitation/abc");
    vi.unstubAllEnvs();
  });

  it("supprime une barre oblique finale pour ne pas produire de double barre", () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVES_URL", "https://reserves.elsatia.fr/");
    expect(urlApplicationReserves()).toBe("https://reserves.elsatia.fr");
    expect(urlInvitation("abc")).toBe("https://reserves.elsatia.fr/invitation/abc");
    vi.unstubAllEnvs();
  });

  it("encode un jeton contenant des caractères réservés", () => {
    vi.stubEnv("NEXT_PUBLIC_RESERVES_URL", "https://reserves.elsatia.fr");
    expect(urlInvitation("a/b?c")).toBe("https://reserves.elsatia.fr/invitation/a%2Fb%3Fc");
    vi.unstubAllEnvs();
  });
});
