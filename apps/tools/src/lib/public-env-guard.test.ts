/**
 * Garde de pré-déploiement des variables publiques (`scripts/verify-public-env.mjs`).
 *
 * Ce que ces tests fixent n'est pas un formatage mais un mode de défaillance : sans la garde, un
 * build Production sans `NEXT_PUBLIC_*` **réussit** et livre un Tools sans compte ni abonnement,
 * avec une CSP repliée sur `connect-src 'self'` — cohérente, donc silencieuse. `security-headers
 * .test.ts` documente précisément ce trou et le renvoie ici.
 *
 * Trois propriétés sont vérifiées, dans cet ordre d'importance :
 *
 * 1. un build publié sans une variable requise échoue ;
 * 2. un build local n'échoue pas pour autant ;
 * 3. aucun message produit ne contient jamais une valeur d'environnement.
 */
import { describe, expect, it } from "vitest";
import {
  ADVISORY_MODES,
  APP_ENVIRONMENTS,
  ENFORCED_MODES,
  PUBLIC_ENV_CONTRACT,
  REASONS,
  enforcementLevel,
  evaluatePublicEnv,
  formatReport,
  inspectVariable,
  looksLikeServiceSecret,
  resolveBuildMode,
} from "../../scripts/verify-public-env.mjs";
import { buildConnectSrc } from "./security-headers";
import { APP_ENVIRONMENTS as SITE_ENVIRONMENTS, getAppEnvironment } from "./site";

/** Environnement complet et valide : la référence dont chaque test retire une pièce. */
const COMPLETE = {
  NEXT_PUBLIC_TOOLS_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_valeur-de-test",
  NEXT_PUBLIC_TOOLS_BILLING_API_URL: "https://app.elsatia.fr",
  NEXT_PUBLIC_TOOLS_URL: "https://tools.elsatia.fr",
} as const;

function without(name: keyof typeof COMPLETE) {
  const env: Record<string, string | undefined> = { ...COMPLETE };
  delete env[name];
  return env;
}

function failedNames(env: Record<string, string | undefined>) {
  return evaluatePublicEnv(env).failures.map((finding) => finding.name);
}

const REQUIRED = PUBLIC_ENV_CONTRACT.filter((entry) => entry.level === "required");

describe("contrat des variables publiques", () => {
  /*
   * Le contrat n'est pas déclaratif : il doit décrire ce que le code lit réellement. Tools lit
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`auth/client.ts`) et non `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   * qui est la convention de Gestion Pro. Confondre les deux ferait passer la garde pour verte sur
   * un environnement où le compte ELSATIA est en réalité mort.
   */
  it("porte exactement les trois variables requises par le compte et l'abonnement", () => {
    expect(REQUIRED.map((entry) => entry.name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_TOOLS_BILLING_API_URL",
    ]);
    const names = PUBLIC_ENV_CONTRACT.map((entry) => entry.name);
    expect(names).not.toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    /* `NEXT_PUBLIC_TOOLS_URL` a un repli correct dans `site.ts` : recommandée, jamais bloquante. */
    expect(names).toContain("NEXT_PUBLIC_TOOLS_URL");
    expect(PUBLIC_ENV_CONTRACT.find((entry) => entry.name === "NEXT_PUBLIC_TOOLS_URL")?.level).toBe("recommended");
  });

  /* La garde ne réinvente pas la notion d'environnement : elle rejoue celle de `site.ts`. */
  it("résout le mode de build exactement comme l'application", () => {
    expect([...APP_ENVIRONMENTS]).toEqual([...SITE_ENVIRONMENTS]);
    for (const value of SITE_ENVIRONMENTS) {
      expect(resolveBuildMode({ NEXT_PUBLIC_TOOLS_ENV: value })).toBe(getAppEnvironment(value));
    }
    /* Le point qui rend la garde utile par défaut : ne pas se déclarer, c'est se déclarer publié. */
    expect(resolveBuildMode({})).toBe("production");
    expect(resolveBuildMode({ NEXT_PUBLIC_TOOLS_ENV: "recette" })).toBe("production");
    expect(getAppEnvironment(undefined)).toBe("production");
  });

  it("ne bloque que les deux builds réellement publiés", () => {
    expect([...ENFORCED_MODES]).toEqual(["production", "native-production"]);
    expect([...ADVISORY_MODES]).toEqual(["preview"]);
    expect(enforcementLevel("production")).toBe("enforced");
    expect(enforcementLevel("native-production")).toBe("enforced");
    expect(enforcementLevel("preview")).toBe("advisory");
    expect(enforcementLevel("local")).toBe("skipped");
    expect(enforcementLevel("native-dev")).toBe("skipped");
  });
});

describe("build publié", () => {
  it("passe quand l'environnement est complet", () => {
    const result = evaluatePublicEnv(COMPLETE);
    expect(result.mode).toBe("production");
    expect(result.level).toBe("enforced");
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  /* Un manque par variable requise : chacune, seule, suffit à interrompre le build. */
  it.each(REQUIRED.map((entry) => entry.name))("échoue sans %s", (name) => {
    const result = evaluatePublicEnv(without(name as keyof typeof COMPLETE));
    expect(result.ok).toBe(false);
    expect(result.failures.map((finding) => finding.name)).toEqual([name]);
    expect(result.failures[0].reason).toBe(REASONS.missing);
  });

  it("traite une variable vide comme une variable absente", () => {
    const result = evaluatePublicEnv({ ...COMPLETE, NEXT_PUBLIC_SUPABASE_ANON_KEY: "   " });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", reason: REASONS.blank });
  });

  /*
   * Une URL invalide est plus dangereuse qu'une URL absente : `toHttpOrigin()` la rejette
   * silencieusement, la CSP perd l'origine, et le client, lui, croit être configuré
   * (`isElsatiaAccountConfigured()` ne teste que la présence). C'est le seul cas où la divergence
   * CSP / client redoutée devient réellement possible — la garde le ferme au build.
   */
  it("refuse une URL que la CSP ne saurait pas réduire à une origine", () => {
    for (const value of ["pas-une-url", "javascript:alert(1)", "supabase.co"]) {
      const result = evaluatePublicEnv({ ...COMPLETE, NEXT_PUBLIC_SUPABASE_URL: value });
      expect(result.ok).toBe(false);
      expect(result.failures[0]).toMatchObject({ name: "NEXT_PUBLIC_SUPABASE_URL", reason: REASONS.notUrl });
    }
  });

  it("refuse le http en clair sur un build publié, et l'accepte en local", () => {
    const http = { ...COMPLETE, NEXT_PUBLIC_TOOLS_BILLING_API_URL: "http://localhost:3000" };
    expect(evaluatePublicEnv(http).failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_TOOLS_BILLING_API_URL",
      reason: REASONS.notHttps,
    });
    expect(evaluatePublicEnv({ ...http, NEXT_PUBLIC_TOOLS_ENV: "local" }).ok).toBe(true);
  });

  it("bloque le build natif publié comme le build web", () => {
    const native = { ...without("NEXT_PUBLIC_TOOLS_BILLING_API_URL"), NEXT_PUBLIC_TOOLS_ENV: "native-production" };
    /* `monetization-client.ts` appelle la même API pour vérifier un achat Apple ou Google. */
    expect(evaluatePublicEnv(native).ok).toBe(false);
  });

  it("échoue sur toutes les variables manquantes à la fois, pas seulement sur la première", () => {
    expect(failedNames({ NEXT_PUBLIC_TOOLS_ENV: "production" })).toEqual(REQUIRED.map((entry) => entry.name));
  });

  /* `NEXT_PUBLIC_TOOLS_URL` manquante reste un avis : `getPublicUrl()` a le bon repli. */
  it("signale sans bloquer la variable seulement recommandée", () => {
    const result = evaluatePublicEnv(without("NEXT_PUBLIC_TOOLS_URL"));
    expect(result.ok).toBe(true);
    expect(result.warnings.map((finding) => finding.name)).toEqual(["NEXT_PUBLIC_TOOLS_URL"]);
  });
});

describe("builds non publiés", () => {
  it("laisse passer un build local sans aucune variable, et sans bruit", () => {
    const result = evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "local" });
    expect(result.level).toBe("skipped");
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("laisse passer un build natif de développement", () => {
    expect(evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "native-dev" }).ok).toBe(true);
  });

  /* Une preview est jetable : elle mérite un avis, pas un blocage. */
  it("signale une preview incomplète sans interrompre le build", () => {
    const result = evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "preview" });
    expect(result.level).toBe("advisory");
    expect(result.ok).toBe(true);
    expect(result.warnings.map((finding) => finding.name)).toEqual(
      PUBLIC_ENV_CONTRACT.map((entry) => entry.name),
    );
  });

  /* Une valeur présente mais absurde est une faute de saisie, quel que soit le mode. */
  it("signale même en local une URL qui n'en est pas une", () => {
    const result = evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "local", NEXT_PUBLIC_SUPABASE_URL: "abcdefgh.supabase.co" });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((finding) => finding.name)).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
  });
});

describe("aucun secret ne franchit la garde", () => {
  /*
   * `NEXT_PUBLIC_*` est inscrit en clair dans le bundle. Une clé de service placée là fuiterait
   * vers tous les navigateurs. Les deux formes Supabase connues sont refusées, dans TOUS les
   * modes : c'est une fuite, pas un oubli de configuration.
   */
  it("reconnaît les deux formes de clé de service Supabase", () => {
    const serviceJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    const anonJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(looksLikeServiceSecret(serviceJwt)).toBe(true);
    expect(looksLikeServiceSecret("sb_secret_valeur-de-test")).toBe(true);
    expect(looksLikeServiceSecret(anonJwt)).toBe(false);
    expect(looksLikeServiceSecret("sb_publishable_valeur-de-test")).toBe(false);
    expect(looksLikeServiceSecret("pas.un.jwt")).toBe(false);
  });

  it("bloque une clé de service jusque dans un build local", () => {
    const env = { NEXT_PUBLIC_TOOLS_ENV: "local", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_valeur-de-test" };
    const result = evaluatePublicEnv(env);
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      reason: REASONS.secretShaped,
    });
  });

  /*
   * Les deux causes de blocage appellent des consignes opposées : une variable manquante se
   * corrige en la fournissant (ou en déclarant un build non publié), une clé de service se
   * corrige en la retirant. Suggérer « déclarez NEXT_PUBLIC_TOOLS_ENV=local » devant une fuite
   * reviendrait à conseiller de publier le secret quand même.
   */
  it("ne propose jamais de contourner une fuite en déclarant un build local", () => {
    const leak = formatReport(evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "local", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_x" }));
    expect(leak).not.toContain("NEXT_PUBLIC_TOOLS_ENV=local");
    expect(leak).toContain("Aucun mode ne leve ce refus.");
    const missing = formatReport(evaluatePublicEnv({ NEXT_PUBLIC_TOOLS_ENV: "production" }));
    expect(missing).toContain("NEXT_PUBLIC_TOOLS_ENV=local");
    expect(missing).not.toContain("Aucun mode ne leve ce refus.");
  });

  /*
   * Le test qui compte le plus : le rapport est ce qui atterrit dans un journal de build, souvent
   * public. Il ne doit contenir que des noms de variables. Aucune valeur, jamais — pas même une
   * valeur inoffensive comme une URL, dont la fuite révélerait la référence du projet Supabase.
   */
  it("n'imprime jamais une valeur d'environnement", () => {
    const env = {
      NEXT_PUBLIC_TOOLS_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_valeur-tres-reconnaissable",
      NEXT_PUBLIC_TOOLS_BILLING_API_URL: "http://origine-privee.interne",
      NEXT_PUBLIC_TOOLS_URL: "http://autre-valeur-reconnaissable",
    };
    const result = evaluatePublicEnv(env);
    const report = formatReport(result);
    expect(result.ok).toBe(false);
    for (const value of Object.values(env)) {
      if (value === "production") continue; /* Le mode, lui, est bien annoncé : ce n'est pas un secret. */
      expect(report).not.toContain(value);
    }
    expect(report).not.toMatch(/valeur-tres-reconnaissable|autre-valeur-reconnaissable|origine-privee|alert\(1\)/);
    /* Ce qu'il contient : les noms, et rien d'autre d'exploitable. */
    for (const entry of PUBLIC_ENV_CONTRACT) expect(report).toContain(entry.name);
  });
});

describe("cohérence avec la CSP", () => {
  /*
   * `next.config.ts` construit `connect-src` à partir des deux mêmes URL que la garde exige.
   * Ce test lie les deux : si une variable d'origine était ajoutée à la CSP sans être ajoutée au
   * contrat, un build publié pourrait de nouveau réussir avec une origine cloud manquante.
   */
  it("exige exactement les variables qui alimentent connect-src", () => {
    const sources = buildConnectSrc({
      supabaseUrl: COMPLETE.NEXT_PUBLIC_SUPABASE_URL,
      billingApiUrl: COMPLETE.NEXT_PUBLIC_TOOLS_BILLING_API_URL,
    });
    expect(sources).toEqual([
      "'self'",
      "https://abcdefgh.supabase.co",
      "wss://abcdefgh.supabase.co",
      "https://app.elsatia.fr",
      "wss://app.elsatia.fr",
    ]);
    const urlVariables = REQUIRED.filter((entry) => entry.kind === "url").map((entry) => entry.name);
    expect(urlVariables).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_TOOLS_BILLING_API_URL"]);
    /* La garde n'autorise aucune origine que la CSP ne connaîtrait pas : le repli reste total. */
    expect(buildConnectSrc({})).toEqual(["'self'"]);
  });

  /* Une valeur acceptée par la garde est toujours réductible à une origine par la CSP. */
  it("n'accepte que des valeurs que la CSP sait réduire à une origine", () => {
    for (const entry of REQUIRED.filter((item) => item.kind === "url")) {
      expect(inspectVariable(entry, "https://abcdefgh.supabase.co/rest/v1?x=1", { requireHttps: true })).toBeNull();
      expect(inspectVariable(entry, "javascript:alert(1)", { requireHttps: true })).toBe(REASONS.notUrl);
    }
  });
});
