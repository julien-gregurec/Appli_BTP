import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((cible: string) => {
    throw new Error(`REDIRECT:${cible}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { getContexteColors, lireContexteRefus } from "@/lib/contexte";
import { MOTIF_APPARTENANCE, MOTIF_PAR_DEFAUT, explicationRefus } from "@/lib/messages-refus";

function source(chemin: string) {
  return readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");
}

const PAGE_ACCES_REFUSE = source("../app/acces-refuse/page.tsx");
const PAGE_ABONNEMENT = source("../app/abonnement-requis/page.tsx");
const CONTEXTE = source("./contexte.ts");

function client({ user, contexte }: { user: unknown; contexte: unknown }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    rpc: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: contexte, error: null }) }),
  };
}

/** Exécute l'appel et renvoie la cible de redirection émise. */
async function cible(execution: Promise<unknown>) {
  try {
    await execution;
  } catch (erreur) {
    return String((erreur as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("aucune redirection émise");
}

describe("boucle /acces-refuse — moitié amont reproduite", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["contrat canonique absent", null],
    ["contexte désignant une autre personne", { utilisateur_id: "u2", entreprise_nom: "Autre" }],
    [
      "compte sans entreprise ni rôle plateforme",
      { utilisateur_id: "u1", entreprise_id: null, entreprise_nom: "", est_admin_plateforme: false },
    ],
  ])("getContexteColors renvoie vers /acces-refuse (%s)", async (_cas, contexte) => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" }, contexte }));
    // Moitié amont de la boucle historique : la page /acces-refuse appelait
    // elle-même getContexteColors et recevait donc cette redirection en retour,
    // indéfiniment. La moitié aval est fermée par l'invariant ci-dessous.
    await expect(cible(getContexteColors())).resolves.toBe("/acces-refuse?motif=appartenance");
  });
});

describe("boucle /acces-refuse — invariant structurel", () => {
  it("getContexteColors renvoie bien vers /acces-refuse (origine de la boucle)", () => {
    expect(CONTEXTE).toContain("redirect(`/acces-refuse?motif=${MOTIF_APPARTENANCE}`)");
  });

  it("aucune page terminale n’appelle le contexte redirigeant", () => {
    // C’était exactement la boucle : /acces-refuse appelait getContexteColors,
    // qui redirige vers /acces-refuse pour la population que la page accueille.
    for (const page of [PAGE_ACCES_REFUSE, PAGE_ABONNEMENT]) {
      const imports = [...page.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@\/lib\/contexte"/g)]
        .flatMap((m) => m[1].split(",").map((nom) => nom.trim()));
      expect(imports).toContain("lireContexteRefus");
      expect(imports).not.toContain("getContexteColors");
    }
  });

  it("aucune page terminale ne peut se rediriger vers elle-même", () => {
    for (const page of [PAGE_ACCES_REFUSE, PAGE_ABONNEMENT]) {
      const cibles = [...page.matchAll(/redirect\("([^"]+)"\)/g)].map((m) => m[1]);
      expect(cibles).toEqual(["/login"]);
      expect(cibles).not.toContain("/acces-refuse");
      expect(cibles).not.toContain("/abonnement-requis");
    }
  });
});

describe("lireContexteRefus — jamais de redirection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signale l’absence de session sans rediriger", async () => {
    mocks.createClient.mockResolvedValue(client({ user: null, contexte: null }));
    await expect(lireContexteRefus()).resolves.toEqual({ authentifie: false, entrepriseNom: null });
  });

  it("accueille une session sans contrat canonique — le cas qui bouclait", async () => {
    mocks.createClient.mockResolvedValue(client({ user: { id: "u1" }, contexte: null }));
    await expect(lireContexteRefus()).resolves.toEqual({ authentifie: true, entrepriseNom: null });
  });

  it("accueille une session dont le contexte désigne une autre personne", async () => {
    mocks.createClient.mockResolvedValue(
      client({ user: { id: "u1" }, contexte: { utilisateur_id: "u2", entreprise_nom: "Autre" } }),
    );
    await expect(lireContexteRefus()).resolves.toEqual({ authentifie: true, entrepriseNom: null });
  });

  it("accueille un compte sans entreprise (admin plateforme compris)", async () => {
    mocks.createClient.mockResolvedValue(
      client({ user: { id: "u1" }, contexte: { utilisateur_id: "u1", entreprise_id: null, entreprise_nom: "", est_admin_plateforme: true } }),
    );
    await expect(lireContexteRefus()).resolves.toEqual({ authentifie: true, entrepriseNom: null });
  });

  it("restitue la raison sociale d’un utilisateur rattaché mais non habilité", async () => {
    mocks.createClient.mockResolvedValue(
      client({ user: { id: "u1" }, contexte: { utilisateur_id: "u1", entreprise_id: "e1", entreprise_nom: "SARL Peinture", est_admin_plateforme: false } }),
    );
    await expect(lireContexteRefus()).resolves.toEqual({ authentifie: true, entrepriseNom: "SARL Peinture" });
  });
});

describe("motif de refus — jeu fermé", () => {
  it("explicite le motif connu", () => {
    expect(explicationRefus(MOTIF_APPARTENANCE)).toContain("aucune organisation");
  });

  it("n’affiche jamais un texte arbitraire reçu par l’URL", () => {
    expect(explicationRefus("Compte suspendu — appelez le 01 23 45 67 89")).toBe(MOTIF_PAR_DEFAUT);
    expect(explicationRefus("__proto__")).toBe(MOTIF_PAR_DEFAUT);
    expect(explicationRefus(["appartenance"])).toBe(MOTIF_PAR_DEFAUT);
    expect(explicationRefus(undefined)).toBe(MOTIF_PAR_DEFAUT);
  });
});
