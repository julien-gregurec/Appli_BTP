/**
 * Garde de pré-déploiement des variables publiques (`scripts/verify-public-env.mjs`).
 *
 * Ce que ces tests fixent n'est pas un formatage mais un mode de défaillance. Next fige les
 * `NEXT_PUBLIC_*` dans le bundle au moment du build : un `next build` Production lancé sans elles
 * **réussit**, et chaque invitation envoyée par e-mail par `urlInvitation()` (`invitations.ts`)
 * contient alors un lien vers `http://localhost:3020` — mort pour son destinataire, sans qu'aucune
 * étape du déploiement n'ait échoué.
 *
 * Quatre propriétés sont vérifiées, dans cet ordre d'importance :
 *
 * 1. un build publié auquel manque une variable requise échoue ;
 * 2. une URL non https (dont `http://localhost:3020`, le repli réel du code) est refusée sur un
 *    build publié, et seulement là ;
 * 3. un build local n'échoue pas pour autant ;
 * 4. aucun message produit ne contient jamais une valeur d'environnement.
 */
import { describe, expect, it } from "vitest";
import {
  CONTRAT_ENV_PUBLIC,
  MODES,
  MODES_BLOQUANTS,
  MODES_CONSULTATIFS,
  RAISONS,
  evaluerEnvPublic,
  formaterRapport,
  inspecterVariable,
  niveauApplication,
  ressembleAUnSecret,
  resoudreMode,
  secretsPublics,
} from "../../scripts/verify-public-env.mjs";

/** Environnement complet et valide : la référence dont chaque test retire une pièce. */
const COMPLET = {
  ELSATIA_APPLICATION_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_valeur-de-test",
  NEXT_PUBLIC_RESERVES_URL: "https://reserves.elsatia.fr",
} as const;

function sans(nom: keyof typeof COMPLET) {
  const env: Record<string, string | undefined> = { ...COMPLET };
  delete env[nom];
  return env;
}

function echecs(env: Record<string, string | undefined>) {
  return evaluerEnvPublic(env).failures.map((constat) => constat.name);
}

const REQUISES = CONTRAT_ENV_PUBLIC.filter((entree) => entree.level === "required");

describe("contrat des variables publiques", () => {
  /*
   * Le contrat n'est pas déclaratif : il doit décrire ce que `apps/reserves/src` lit réellement
   * (`proxy.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/invitations.ts`,
   * `app/layout.tsx`).
   */
  it("porte exactement les variables sans lesquelles Réserves est amputé", () => {
    expect(REQUISES.map((entree) => entree.name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_RESERVES_URL",
      "ELSATIA_APPLICATION_ENV",
    ]);
  });

  /* `SUPABASE_SERVICE_ROLE_KEY` reste serveur-only : la garde ne la réclame ni ne la mentionne. */
  it("ne réclame jamais la clé de service", () => {
    expect(CONTRAT_ENV_PUBLIC.map((entree) => entree.name)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("connaît les mêmes environnements que le reste de l'écosystème", () => {
    expect([...MODES]).toEqual(["local", "preview", "production"]);
    for (const valeur of MODES) expect(resoudreMode({ ELSATIA_APPLICATION_ENV: valeur })).toBe(valeur);
  });

  /*
   * Le point qui rend la garde utile par défaut : un build qui ne se déclare pas est traité comme
   * publié, jamais comme local — l'inverse désarmerait la garde sur l'oubli même qu'elle existe
   * pour attraper.
   */
  it("traite un build qui ne se déclare pas comme un build publié", () => {
    expect(resoudreMode({})).toBe("production");
    expect(resoudreMode({ ELSATIA_APPLICATION_ENV: "recette" })).toBe("production");
  });

  /* `VERCEL_ENV=production` est un fait de plateforme : il l'emporte sur toute déclaration. */
  it("ne se laisse pas désarmer par une déclaration contredisant Vercel", () => {
    expect(resoudreMode({ VERCEL_ENV: "production", ELSATIA_APPLICATION_ENV: "local" })).toBe("production");
    expect(resoudreMode({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(resoudreMode({ VERCEL_ENV: "development" })).toBe("local");
    const resultat = evaluerEnvPublic({ ...COMPLET, VERCEL_ENV: "production", ELSATIA_APPLICATION_ENV: "local" });
    expect(resultat.ok).toBe(false);
    expect(resultat.failures).toEqual([
      expect.objectContaining({ name: "ELSATIA_APPLICATION_ENV", reason: RAISONS.modeIncoherent }),
    ]);
  });

  it("ne bloque que le build réellement publié", () => {
    expect([...MODES_BLOQUANTS]).toEqual(["production"]);
    expect([...MODES_CONSULTATIFS]).toEqual(["preview"]);
    expect(niveauApplication("production")).toBe("bloquant");
    expect(niveauApplication("preview")).toBe("consultatif");
    expect(niveauApplication("local")).toBe("ignore");
  });
});

describe("build publié", () => {
  it("passe quand l'environnement est complet", () => {
    const resultat = evaluerEnvPublic(COMPLET);
    expect(resultat.mode).toBe("production");
    expect(resultat.niveau).toBe("bloquant");
    expect(resultat.failures).toEqual([]);
    expect(resultat.warnings).toEqual([]);
    expect(resultat.ok).toBe(true);
  });

  /* Un manque par variable requise : chacune, seule, suffit à interrompre le build. */
  it.each(REQUISES.map((entree) => entree.name))("échoue sans %s", (nom) => {
    const resultat = evaluerEnvPublic(sans(nom as keyof typeof COMPLET));
    expect(resultat.ok).toBe(false);
    expect(resultat.failures.map((constat) => constat.name)).toEqual([nom]);
    expect(resultat.failures[0].reason).toBe(RAISONS.absente);
  });

  it("traite une variable vide comme une variable absente", () => {
    const resultat = evaluerEnvPublic({ ...COMPLET, NEXT_PUBLIC_RESERVES_URL: "   " });
    expect(resultat.ok).toBe(false);
    expect(resultat.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_RESERVES_URL",
      reason: RAISONS.vide,
    });
  });

  it("refuse une URL qui n'en est structurellement pas une", () => {
    for (const valeur of ["pas-une-url", "javascript:alert(1)", "supabase.co"]) {
      const resultat = evaluerEnvPublic({ ...COMPLET, NEXT_PUBLIC_SUPABASE_URL: valeur });
      expect(resultat.ok).toBe(false);
      expect(resultat.failures[0]).toMatchObject({
        name: "NEXT_PUBLIC_SUPABASE_URL",
        reason: RAISONS.pasUneUrl,
      });
    }
  });

  /*
   * Le scénario réel de ce correctif : le repli du code (`urlApplicationReserves()`) est
   * précisément `http://localhost:3020`. Sur un build publié, cette valeur doit être refusée
   * exactement comme n'importe quelle autre URL http en clair — même si elle est syntaxiquement
   * valide — et acceptée sur un build local, là où elle est correcte.
   */
  it("refuse http://localhost:3020 sur un build publié, et l'accepte en local", () => {
    const clair = { ...COMPLET, NEXT_PUBLIC_RESERVES_URL: "http://localhost:3020" };
    expect(evaluerEnvPublic(clair).failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_RESERVES_URL",
      reason: RAISONS.pasHttps,
    });
    expect(evaluerEnvPublic({ ...clair, ELSATIA_APPLICATION_ENV: "local" }).ok).toBe(true);
  });

  it("échoue sur toutes les variables manquantes à la fois, pas seulement sur la première", () => {
    expect(echecs({ ELSATIA_APPLICATION_ENV: "production" })).toEqual(
      REQUISES.map((entree) => entree.name).filter((nom) => nom !== "ELSATIA_APPLICATION_ENV"),
    );
  });
});

describe("builds non publiés", () => {
  it("laisse passer un build local sans aucune variable, et sans bruit", () => {
    const resultat = evaluerEnvPublic({ ELSATIA_APPLICATION_ENV: "local" });
    expect(resultat.niveau).toBe("ignore");
    expect(resultat.ok).toBe(true);
    expect(resultat.failures).toEqual([]);
    expect(resultat.warnings).toEqual([]);
  });

  /* Une preview est jetable : elle mérite un avis, pas un blocage. */
  it("signale une preview incomplète sans interrompre le build", () => {
    const resultat = evaluerEnvPublic({ ELSATIA_APPLICATION_ENV: "preview" });
    expect(resultat.niveau).toBe("consultatif");
    expect(resultat.ok).toBe(true);
    expect(resultat.warnings.map((constat) => constat.name)).toEqual(
      CONTRAT_ENV_PUBLIC.map((entree) => entree.name).filter((nom) => nom !== "ELSATIA_APPLICATION_ENV"),
    );
  });

  it("signale même en local une URL qui n'en est pas une", () => {
    const resultat = evaluerEnvPublic({
      ELSATIA_APPLICATION_ENV: "local",
      NEXT_PUBLIC_RESERVES_URL: "abcdefgh-pas-une-url",
    });
    expect(resultat.ok).toBe(true);
    expect(resultat.warnings.map((constat) => constat.name)).toEqual(["NEXT_PUBLIC_RESERVES_URL"]);
  });
});

describe("aucun secret ne franchit la garde", () => {
  it("reconnaît les formes de clé de service et de clé privée", () => {
    const jetonService = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    const jetonAnon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(ressembleAUnSecret(jetonService)).toBe(true);
    expect(ressembleAUnSecret("sb_secret_valeur-de-test")).toBe(true);
    expect(ressembleAUnSecret("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toBe(true);
    expect(ressembleAUnSecret(jetonAnon)).toBe(false);
    expect(ressembleAUnSecret("sb_publishable_valeur-de-test")).toBe(false);
    expect(ressembleAUnSecret("pas.un.jwt")).toBe(false);
  });

  it("bloque une clé de service jusque dans un build local", () => {
    const resultat = evaluerEnvPublic({
      ELSATIA_APPLICATION_ENV: "local",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_valeur-de-test",
    });
    expect(resultat.ok).toBe(false);
    expect(resultat.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      reason: RAISONS.formeSecrete,
    });
  });

  it("refuse une clé de service exposée sous un nom public hors contrat", () => {
    const env = { ...COMPLET, NEXT_PUBLIC_UN_NOM_QUELCONQUE: "sb_secret_valeur-de-test" };
    expect(secretsPublics(env).map((constat) => constat.name)).toEqual(["NEXT_PUBLIC_UN_NOM_QUELCONQUE"]);
    const resultat = evaluerEnvPublic(env);
    expect(resultat.ok).toBe(false);
    expect(resultat.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_UN_NOM_QUELCONQUE",
      reason: RAISONS.formeSecrete,
    });
  });

  it("ne se déclenche pas sur la clé de service restée serveur-only", () => {
    expect(secretsPublics({ ...COMPLET, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_valeur-de-test" })).toEqual([]);
  });

  /*
   * Le test qui compte le plus : le rapport atterrit dans un journal de build consultable par
   * toute personne ayant accès au projet Vercel. Il ne doit contenir que des noms de variables.
   */
  it("n'imprime jamais une valeur d'environnement", () => {
    const env = {
      ELSATIA_APPLICATION_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_valeur-tres-reconnaissable",
      NEXT_PUBLIC_RESERVES_URL: "http://origine-privee-reconnaissable.interne",
    };
    const resultat = evaluerEnvPublic(env);
    const rapport = formaterRapport(resultat);
    expect(resultat.ok).toBe(false);
    for (const valeur of Object.values(env)) {
      if (valeur === "production") continue; /* Le mode, lui, est bien annoncé : ce n'est pas un secret. */
      expect(rapport).not.toContain(valeur);
    }
    expect(rapport).not.toMatch(/valeur-tres-reconnaissable|origine-privee-reconnaissable|alert\(1\)/);
    for (const entree of CONTRAT_ENV_PUBLIC) expect(rapport).toContain(entree.name);
  });
});

describe("cohérence avec le code réel", () => {
  /*
   * Ce test lie le contrat au comportement observable de `invitations.ts` : si le repli du code
   * changeait de valeur sans que ce test soit mis à jour, il romprait ici plutôt qu'en silence sur
   * un déploiement réel.
   */
  it("n'accepte que des valeurs que le code sait réduire à une origine http(s)", () => {
    const entree = REQUISES.find((item) => item.name === "NEXT_PUBLIC_RESERVES_URL")!;
    const options = { exigerHttps: true, mode: "production" } as const;
    expect(inspecterVariable(entree, "https://reserves.elsatia.fr", options)).toBeNull();
    expect(inspecterVariable(entree, "javascript:alert(1)", options)).toBe(RAISONS.pasUneUrl);
  });
});
