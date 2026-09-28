// Registre des applications ELSATIA et construction des liens portés par les e-mails.
//
// Le défaut que ce module ferme : UNE seule URL de site (le `SiteURL` de Supabase Auth,
// ou un `NEXT_PUBLIC_APP_URL` réutilisé partout) pour cinq applications. Un e-mail émis
// par Réserves doit mener à Réserves, jamais à Gestion Pro ni à la Production depuis une
// Preview. Chaque application a donc SA variable d'origine, et chaque lien est
// reconstruit ici à partir de cette origine configurée — jamais d'un en-tête `Host`,
// `X-Forwarded-Host` ou `Origin` reçu d'une requête.

import { resoudreEnvironnementEmail, type EnvironnementEmail } from "./environnement.ts";

export type CodeApplicationEmail = "gestion_pro" | "tools" | "colors" | "reserves" | "studio";

export type ApplicationEmail = {
  code: CodeApplicationEmail;
  nom: string;
  /** Variable d'environnement portant l'origine publique de l'application. */
  variable: string;
  /** Seul hôte admis en Production. */
  hoteProduction: string;
};

export const APPLICATIONS_EMAIL: Readonly<Record<CodeApplicationEmail, ApplicationEmail>> = Object.freeze({
  gestion_pro: { code: "gestion_pro", nom: "ELSATIA Gestion Pro", variable: "NEXT_PUBLIC_APP_URL", hoteProduction: "app.elsatia.fr" },
  tools: { code: "tools", nom: "ELSATIA Tools", variable: "NEXT_PUBLIC_TOOLS_URL", hoteProduction: "tools.elsatia.fr" },
  colors: { code: "colors", nom: "ELSATIA Colors", variable: "NEXT_PUBLIC_COLORS_URL", hoteProduction: "colors.elsatia.fr" },
  reserves: { code: "reserves", nom: "ELSATIA Réserves", variable: "NEXT_PUBLIC_RESERVES_URL", hoteProduction: "reserves.elsatia.fr" },
  studio: { code: "studio", nom: "ELSATIA Studio", variable: "NEXT_PUBLIC_STUDIO_URL", hoteProduction: "studio.elsatia.fr" },
});

export const HOTES_PRODUCTION_ELSATIA: readonly string[] = Object.freeze(
  Object.values(APPLICATIONS_EMAIL).map((a) => a.hoteProduction),
);

export type MotifLienRefuse =
  | "application_inconnue"
  | "origine_absente"
  | "origine_invalide"
  | "schema_interdit"
  | "identifiants_incorpores"
  | "hote_production_inattendu"
  | "hote_production_hors_production"
  | "hote_local_hors_local"
  | "chemin_dangereux";

export type ResultatOrigine =
  | { ok: true; origine: string; application: ApplicationEmail; environnement: EnvironnementEmail }
  | { ok: false; motif: MotifLienRefuse };

export type ResultatLien = { ok: true; url: string } | { ok: false; motif: MotifLienRefuse };

type Env = Record<string, string | undefined>;

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Lectures STATIQUES (pas de `env[nom]`) : le manifeste d'environnement recense chaque
// variable lue par le code, et Next.js n'inline que les accès littéraux.
function lireOrigineConfiguree(code: CodeApplicationEmail, environnement: Env): string | undefined {
  switch (code) {
    case "gestion_pro": return environnement.NEXT_PUBLIC_APP_URL;
    case "tools": return environnement.NEXT_PUBLIC_TOOLS_URL;
    case "colors": return environnement.NEXT_PUBLIC_COLORS_URL;
    case "reserves": return environnement.NEXT_PUBLIC_RESERVES_URL;
    case "studio": return environnement.NEXT_PUBLIC_STUDIO_URL;
  }
}

export function estCodeApplicationEmail(valeur: unknown): valeur is CodeApplicationEmail {
  return typeof valeur === "string" && Object.prototype.hasOwnProperty.call(APPLICATIONS_EMAIL, valeur);
}

/**
 * Origine publique validée d'une application, pour l'environnement courant.
 *
 * Production : `https://<hoteProduction>` exactement — un hôte d'une AUTRE application
 * (lien croisé) ou un domaine Vercel est refusé.
 * Preview : HTTPS obligatoire, jamais un hôte de Production, jamais localhost.
 * Local / test : http ou https, sans autre contrainte que la forme.
 */
export function origineApplication(code: CodeApplicationEmail, environnement: Env = process.env): ResultatOrigine {
  if (!estCodeApplicationEmail(code)) return { ok: false, motif: "application_inconnue" };
  const application = APPLICATIONS_EMAIL[code];
  const env = resoudreEnvironnementEmail(environnement);
  const brut = lireOrigineConfiguree(code, environnement)?.trim();
  if (!brut) return { ok: false, motif: "origine_absente" };

  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return { ok: false, motif: "origine_invalide" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, motif: "schema_interdit" };
  if (url.username || url.password) return { ok: false, motif: "identifiants_incorpores" };

  const hote = url.hostname.toLowerCase();
  if (env === "production") {
    if (url.protocol !== "https:" || hote !== application.hoteProduction || url.port) {
      return { ok: false, motif: "hote_production_inattendu" };
    }
  } else if (env === "preview") {
    if (url.protocol !== "https:") return { ok: false, motif: "schema_interdit" };
    if (HOTES_PRODUCTION_ELSATIA.includes(hote)) return { ok: false, motif: "hote_production_hors_production" };
    if (HOTES_LOCAUX.has(hote)) return { ok: false, motif: "hote_local_hors_local" };
  }
  return { ok: true, origine: url.origin, application, environnement: env };
}

const CARACTERES_NEUTRALISES = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/;

/** Vrai si `chemin` est un chemin interne sans ambiguïté (ni `//`, ni `\`, ni contrôle). */
export function cheminInterneStrict(chemin: string): boolean {
  let courant = chemin;
  for (let passe = 0; passe < 3; passe += 1) {
    if (!courant.startsWith("/") || courant.startsWith("//") || courant.includes("\\")) return false;
    if (CARACTERES_NEUTRALISES.test(courant)) return false;
    if (!courant.includes("%")) break;
    let decode: string;
    try {
      decode = decodeURIComponent(courant);
    } catch {
      return false;
    }
    if (decode === courant) break;
    courant = decode;
  }
  if (!courant.startsWith("/") || courant.startsWith("//") || courant.includes("\\")) return false;
  if (CARACTERES_NEUTRALISES.test(courant)) return false;
  try {
    return new URL(chemin, "https://origine.invalid").origin === "https://origine.invalid";
  } catch {
    return false;
  }
}

/**
 * Lien absolu vers `chemin` dans l'application `code`. Les paramètres sont encodés par
 * `URLSearchParams` : un jeton n'est jamais concaténé à la main.
 */
export function lienApplication(
  code: CodeApplicationEmail,
  chemin: string,
  options: { environnement?: Env; parametres?: Record<string, string> } = {},
): ResultatLien {
  const origine = origineApplication(code, options.environnement ?? process.env);
  if (!origine.ok) return origine;
  if (!cheminInterneStrict(chemin)) return { ok: false, motif: "chemin_dangereux" };
  const url = new URL(chemin, origine.origine);
  if (url.origin !== origine.origine) return { ok: false, motif: "chemin_dangereux" };
  for (const [cle, valeur] of Object.entries(options.parametres ?? {})) url.searchParams.set(cle, valeur);
  return { ok: true, url: url.toString() };
}

/**
 * Vrai si `url` (absolue) mène bien à l'application `code` dans cet environnement.
 * Sert de garde de sortie : un gabarit n'émet un bouton que vers sa propre application.
 */
export function lienAppartientA(code: CodeApplicationEmail, url: string, environnement: Env = process.env): boolean {
  const origine = origineApplication(code, environnement);
  if (!origine.ok) return false;
  try {
    const cible = new URL(url);
    return cible.origin === origine.origine && !cible.username && !cible.password;
  } catch {
    return false;
  }
}
