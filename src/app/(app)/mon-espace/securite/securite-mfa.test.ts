import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const client = readFileSync(
  join(process.cwd(), "src/app/(app)/mon-espace/securite/SecuriteMfaClient.tsx"),
  "utf8",
);

describe("écran d’enrôlement TOTP — cloisonnement du secret", () => {
  it("s’exécute uniquement côté navigateur", () => {
    expect(client.startsWith('"use client"')).toBe(true);
    // Client navigateur Supabase, jamais le client serveur.
    expect(client).toContain('from "@/lib/supabase/client"');
    expect(client).not.toContain("@/lib/supabase/server");
  });

  it("ne journalise ni le secret, ni le QR, ni le code", () => {
    expect(client).not.toMatch(/console\./);
    expect(client).not.toMatch(/Sentry|captureException|fetch\(/);
  });

  it("garde le secret et le QR dans l’état local et les efface après vérification", () => {
    expect(client).toContain("data.totp.secret");
    expect(client).toContain("data.totp.qr_code");
    // Après verify : l'enrôlement (secret + QR) est retiré de l'état.
    expect(client).toContain("setEnrolement(null)");
  });

  it("applique les garde-fous MFA-V1", () => {
    // La seule cible d'unenroll est le facteur en attente (unverified).
    expect(client).toContain("unenroll({ factorId: facteurEnAttente.id })");
    expect(client).not.toMatch(/unenroll\(\{\s*factorId:\s*facteurVerifie/);
    // Un seul enrôlement à la fois.
    expect(client).toContain("if (enCours) return");
  });
});
