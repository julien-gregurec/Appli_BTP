/**
 * Garde de pré-déploiement des variables publiques (`scripts/verify-public-env.mjs`).
 *
 * Ce que ces tests fixent n'est pas un formatage mais un mode de défaillance. Next fige les
 * `NEXT_PUBLIC_*` dans le bundle au moment du build : un `next build` Production lancé sans elles
 * **réussit**, et livre un Colors dont l'authentification, les photos et la réinitialisation sont
 * mortes — sans qu'aucune étape n'ait échoué.
 *
 * Quatre propriétés sont vérifiées, dans cet ordre d'importance :
 *
 * 1. un build publié auquel manque une variable requise échoue ;
 * 2. l'ancienne convention de nom, seule, ne suffit jamais ;
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
  VARIABLE_ABANDONNEE,
  evaluerEnvPublic,
  formaterRapport,
  inspecterVariable,
  niveauApplication,
  ressembleAUnSecret,
  resoudreMode,
  secretsPublics,
} from "../../scripts/verify-public-env.mjs";
import { construireCspColors } from "./security/en-tetes";

/** Environnement complet et valide : la référence dont chaque test retire une pièce. */
const COMPLET = {
  ELSATIA_APPLICATION_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_valeur-de-test",
  NEXT_PUBLIC_COLORS_URL: "https://colors.elsatia.fr",
  NEXT_PUBLIC_ELSATIA_ACCOUNT_URL: "https://app.elsatia.fr/abonnement",
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
   * Le contrat n'est pas déclaratif : il doit décrire ce que `apps/colors/src` lit réellement.
   * L'ancien nom en est banni, et pas seulement absent — les clés JWT legacy sont désactivées au
   * niveau du projet Supabase, donc l'accepter en repli ferait passer la garde pour verte sur un
   * environnement où le compte ELSATIA est en réalité mort.
   */
  it("porte exactement les variables sans lesquelles Colors est amputé", () => {
    expect(REQUISES.map((entree) => entree.name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_COLORS_URL",
      "NEXT_PUBLIC_ELSATIA_ACCOUNT_URL",
      "ELSATIA_APPLICATION_ENV",
    ]);
    expect(CONTRAT_ENV_PUBLIC.map((entree) => entree.name)).not.toContain(VARIABLE_ABANDONNEE);
    expect(VARIABLE_ABANDONNEE).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  /*
   * `SUPABASE_SERVICE_ROLE_KEY` reste serveur-only : la garde ne la réclame pas, ne la lit pas,
   * et ne la mentionne nulle part comme variable attendue.
   */
  it("ne réclame jamais la clé de service", () => {
    expect(CONTRAT_ENV_PUBLIC.map((entree) => entree.name)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  /* Mêmes valeurs que `EnvironnementApplications` dans `src/lib/routes-applications.ts`. */
  it("connaît les mêmes environnements que l'application", () => {
    expect([...MODES]).toEqual(["local", "preview", "production"]);
    for (const valeur of MODES) expect(resoudreMode({ ELSATIA_APPLICATION_ENV: valeur })).toBe(valeur);
  });

  /*
   * Le point qui rend la garde utile par défaut, et sa seule divergence assumée avec
   * `environnementApplications()` : celle-ci ramène l'inconnu à `local` pour choisir des URL de
   * catalogue, ce qui est sans danger ; une garde qui ferait de même se désarmerait elle-même.
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
    /* Et la contradiction elle-même est signalée, au lieu d'être seulement ignorée. */
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

  /*
   * Le scénario réel de ce lot : le tableau de bord Vercel de Colors porte encore l'ancien nom,
   * et lui seul. Le build doit s'arrêter là — c'est la seule chose qui empêche de publier une
   * application dont la connexion est morte.
   */
  it("échoue quand seule l'ancienne convention de nom est fournie", () => {
    const env = { ...sans("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-legacy" };
    const resultat = evaluerEnvPublic(env);
    expect(resultat.ok).toBe(false);
    expect(resultat.failures.map((constat) => constat.name)).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
    /* Et le reliquat est nommé, sans bloquer à lui seul : un ménage n'est pas une panne. */
    expect(resultat.warnings).toEqual([
      expect.objectContaining({ name: VARIABLE_ABANDONNEE, reason: RAISONS.nomAbandonne }),
    ]);
  });

  it("laisse passer un environnement complet portant encore le reliquat, en le signalant", () => {
    const resultat = evaluerEnvPublic({ ...COMPLET, NEXT_PUBLIC_SUPABASE_ANON_KEY: "cle-legacy" });
    expect(resultat.ok).toBe(true);
    expect(resultat.warnings.map((constat) => constat.name)).toEqual([VARIABLE_ABANDONNEE]);
  });

  it("traite une variable vide comme une variable absente", () => {
    const resultat = evaluerEnvPublic({ ...COMPLET, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   " });
    expect(resultat.ok).toBe(false);
    expect(resultat.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      reason: RAISONS.vide,
    });
  });

  /*
   * Une URL invalide est plus dangereuse qu'une URL absente : `origineAutorisee()` la rejette
   * silencieusement, la CSP perd l'origine Supabase — donc `img-src` — et rien d'autre ne
   * signale l'erreur. Même chose pour `NEXT_PUBLIC_COLORS_URL`, qui devient un
   * `urlCallbackReinitialisation()` à `null`, c'est-à-dire plus aucun e-mail envoyé.
   */
  it("refuse une URL que la CSP ne saurait pas réduire à une origine", () => {
    for (const valeur of ["pas-une-url", "javascript:alert(1)", "supabase.co"]) {
      const resultat = evaluerEnvPublic({ ...COMPLET, NEXT_PUBLIC_SUPABASE_URL: valeur });
      expect(resultat.ok).toBe(false);
      expect(resultat.failures[0]).toMatchObject({
        name: "NEXT_PUBLIC_SUPABASE_URL",
        reason: RAISONS.pasUneUrl,
      });
    }
  });

  it("refuse le http en clair sur un build publié, et l'accepte en local", () => {
    const clair = { ...COMPLET, NEXT_PUBLIC_COLORS_URL: "http://localhost:3010" };
    expect(evaluerEnvPublic(clair).failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_COLORS_URL",
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

  /* Une valeur présente mais absurde est une faute de saisie, quel que soit le mode. */
  it("signale même en local une URL qui n'en est pas une", () => {
    const resultat = evaluerEnvPublic({
      ELSATIA_APPLICATION_ENV: "local",
      NEXT_PUBLIC_SUPABASE_URL: "abcdefgh.supabase.co",
    });
    expect(resultat.ok).toBe(true);
    expect(resultat.warnings.map((constat) => constat.name)).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe("aucun secret ne franchit la garde", () => {
  /*
   * `NEXT_PUBLIC_*` est inscrit en clair dans le bundle. Une clé de service placée là fuirait
   * vers tous les navigateurs. Les trois formes connues sont refusées, dans TOUS les modes :
   * c'est une fuite, pas un oubli de configuration.
   */
  it("reconnaît les formes de clé de service et de clé privée", () => {
    const jetonService = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    const jetonAnon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(ressembleAUnSecret(jetonService)).toBe(true);
    expect(ressembleAUnSecret("sb_secret_valeur-de-test")).toBe(true);
    expect(ressembleAUnSecret("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toBe(true);
    expect(ressembleAUnSecret("-----BEGIN RSA PRIVATE KEY-----\nAAAA")).toBe(true);
    expect(ressembleAUnSecret(jetonAnon)).toBe(false);
    expect(ressembleAUnSecret("sb_publishable_valeur-de-test")).toBe(false);
    expect(ressembleAUnSecret("pas.un.jwt")).toBe(false);
  });

  it("bloque une clé de service jusque dans un build local", () => {
    const resultat = evaluerEnvPublic({
      ELSATIA_APPLICATION_ENV: "local",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_valeur-de-test",
    });
    expect(resultat.ok).toBe(false);
    expect(resultat.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      reason: RAISONS.formeSecrete,
    });
  });

  /*
   * Le contrat ne peut pas anticiper le nom sous lequel un secret serait exposé : le balayage
   * porte donc sur toutes les variables `NEXT_PUBLIC_*` présentes, connues ou non.
   */
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

  /* Une variable serveur-only n'est pas concernée : elle ne part pas dans le bundle. */
  it("ne se déclenche pas sur la clé de service restée serveur-only", () => {
    expect(secretsPublics({ ...COMPLET, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_valeur-de-test" })).toEqual([]);
  });

  /*
   * Les deux causes de blocage appellent des consignes opposées : une variable manquante se
   * corrige en la fournissant (ou en déclarant un build non publié), une clé de service se
   * corrige en la retirant. Suggérer « déclarez ELSATIA_APPLICATION_ENV=local » devant une fuite
   * reviendrait à conseiller de publier le secret quand même.
   */
  it("ne propose jamais de contourner une fuite en déclarant un build local", () => {
    const fuite = formaterRapport(
      evaluerEnvPublic({ ELSATIA_APPLICATION_ENV: "local", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }),
    );
    expect(fuite).not.toContain("ELSATIA_APPLICATION_ENV=local");
    expect(fuite).toContain("Aucun mode ne lève ce refus.");
    const manque = formaterRapport(evaluerEnvPublic({ ELSATIA_APPLICATION_ENV: "production" }));
    expect(manque).toContain("ELSATIA_APPLICATION_ENV=local");
    expect(manque).not.toContain("Aucun mode ne lève ce refus.");
  });

  /*
   * Le test qui compte le plus : le rapport atterrit dans un journal de build consultable par
   * toute personne ayant accès au projet Vercel. Il ne doit contenir que des noms de variables.
   * Aucune valeur, jamais — pas même une URL, dont la fuite révélerait la référence du projet
   * Supabase.
   */
  it("n'imprime jamais une valeur d'environnement", () => {
    const env = {
      ELSATIA_APPLICATION_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_valeur-tres-reconnaissable",
      NEXT_PUBLIC_COLORS_URL: "http://origine-privee.interne",
      NEXT_PUBLIC_ELSATIA_ACCOUNT_URL: "http://autre-valeur-reconnaissable",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "valeur-legacy-reconnaissable",
    };
    const resultat = evaluerEnvPublic(env);
    const rapport = formaterRapport(resultat);
    expect(resultat.ok).toBe(false);
    for (const valeur of Object.values(env)) {
      if (valeur === "production") continue; /* Le mode, lui, est bien annoncé : ce n'est pas un secret. */
      expect(rapport).not.toContain(valeur);
    }
    expect(rapport).not.toMatch(/valeur-tres-reconnaissable|autre-valeur-reconnaissable|origine-privee|alert\(1\)|legacy-reconnaissable/);
    /* Ce qu'il contient : les noms, et rien d'autre d'exploitable. */
    for (const entree of CONTRAT_ENV_PUBLIC) expect(rapport).toContain(entree.name);
  });
});

describe("cohérence avec la CSP", () => {
  /*
   * `construireCspColors` tire ses origines `img-src` et `connect-src` de la seule
   * `NEXT_PUBLIC_SUPABASE_URL`. Ce test lie les deux : si une variable d'origine était ajoutée à
   * la CSP sans être ajoutée au contrat, un build publié pourrait de nouveau réussir avec une
   * origine manquante et des photos qui ne s'affichent pas.
   */
  it("exige exactement la variable qui alimente les origines de la CSP", () => {
    const csp = construireCspColors({
      nonce: "n",
      estDeveloppement: false,
      urlSupabase: COMPLET.NEXT_PUBLIC_SUPABASE_URL,
    });
    expect(csp).toContain("img-src 'self' data: https://abcdefgh.supabase.co");
    expect(csp).toContain("connect-src 'self' https://abcdefgh.supabase.co");
    const origines = construireCspColors({ nonce: "n", estDeveloppement: false, urlSupabase: undefined });
    expect(origines).toContain("img-src 'self' data:;");
    expect(origines).toContain("connect-src 'self';");
  });

  /* Une valeur acceptée par la garde est toujours réductible à une origine par la CSP. */
  it("n'accepte que des valeurs que la CSP sait réduire à une origine", () => {
    for (const entree of REQUISES.filter((item) => item.kind === "url")) {
      const options = { exigerHttps: true, mode: "production" } as const;
      expect(inspecterVariable(entree, "https://abcdefgh.supabase.co/rest/v1?x=1", options)).toBeNull();
      expect(inspecterVariable(entree, "javascript:alert(1)", options)).toBe(RAISONS.pasUneUrl);
    }
  });
});
