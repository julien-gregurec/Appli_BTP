#!/usr/bin/env node
/**
 * ELSATIA — Smoke test des e-mails d'une PREVIEW (jamais de la Production).
 *
 * Deux canaux distincts existent (docs/operations/MATRICE_EMAILS_V1.md) :
 *   1. Brevo, API HTTP, appelée par le code applicatif (packages/email/src/index.ts :
 *      documents, relances, paiement échoué, support, invitations et notifications Réserves) ;
 *   2. Supabase Auth (GoTrue), via le SMTP configuré sur le projet Supabase (Dashboard) :
 *      confirmation d'inscription, réinitialisation de mot de passe.
 *
 * Modes (un seul par exécution) :
 *   --check                     (défaut) configuration seulement, AUCUN appel réseau.
 *   --brevo-sandbox --to <adr>  appel Brevo réel en mode bac à sable (en-tête X-Sib-Sandbox: drop,
 *                               aucun e-mail délivré) : valide clé, expéditeur et charge utile.
 *   --brevo-send --to <adr>     envoi RÉEL par le transport de production du code
 *                               (envoyerEmailBrevo de packages/email) vers UNE adresse que
 *                               l'opérateur possède.
 *   --auth-recovery --to <adr>  demande Supabase Auth « mot de passe oublié » (POST /auth/v1/recover,
 *                               clé publishable) : prouve le SMTP du projet Supabase Preview. Le
 *                               compte <adr> doit exister sur la Preview pour qu'un e-mail parte.
 *
 * Garde-fous (tous bloquants, avant tout appel réseau) :
 *   - ELSATIA_APPLICATION_ENV=production ou VERCEL_ENV=production → refus ;
 *   - modes Supabase : la référence du projet (hôte de NEXT_PUBLIC_SUPABASE_URL) doit être la
 *     référence Preview attendue (--preview-ref, défaut : REF_PREVIEW_AUTORISEE du garde des
 *     scripts de recette) et jamais la référence Production connue ;
 *   - modes réseau : --to obligatoire, une seule adresse.
 * Aucune valeur secrète n'est jamais affichée.
 *
 * Usage (variables Preview dans un fichier local, jamais versionné) :
 *   node --env-file=.env.preview.local scripts/smoke-email-preview.mjs --check
 *   node --env-file=.env.preview.local scripts/smoke-email-preview.mjs --brevo-sandbox --to moi@exemple.fr
 *
 * Code de sortie : 0 = OK, 1 = échec du smoke, 2 = refus (garde-fou ou usage).
 */
import { fileURLToPath } from "node:url";
import { REF_PREVIEW_AUTORISEE } from "./garde-scripts-production.mjs";

/** Référence du projet Supabase Production (docs/ia/AI_PROD_ACTIVATION_V1.md). Jamais ciblée ici. */
export const REF_PRODUCTION_CONNUE = "exhvuzegsefmoguxoiak";
export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const MODES = ["--check", "--brevo-sandbox", "--brevo-send", "--auth-recovery"];

export class Refus extends Error {}

export function lireArguments(argv) {
  const modes = argv.filter((a) => MODES.includes(a));
  if (modes.length > 1) throw new Refus(`un seul mode à la fois (${modes.join(", ")})`);
  const valeur = (nom) => {
    const i = argv.indexOf(nom);
    return i === -1 ? null : argv[i + 1] ?? null;
  };
  return { mode: modes[0] ?? "--check", to: valeur("--to"), previewRef: valeur("--preview-ref") };
}

export function refDepuisUrl(url) {
  try {
    const { hostname } = new URL(url);
    const m = /^([a-z0-9]{20})\.supabase\.co$/i.exec(hostname);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Contrôles communs, avant tout réseau. Lève Refus. */
export function verifierCible(env, { mode, to, previewRef }) {
  const declare = env.ELSATIA_APPLICATION_ENV?.trim();
  if (declare === "production" || env.VERCEL_ENV?.trim() === "production") {
    throw new Refus("environnement Production détecté : ce smoke test est réservé à la Preview");
  }
  if (mode === "--check") return;
  if (!to || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) throw new Refus("--to <une adresse e-mail que vous possédez> est obligatoire");
  if (mode === "--auth-recovery") {
    const attendue = (previewRef ?? REF_PREVIEW_AUTORISEE).toLowerCase();
    const ref = refDepuisUrl(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (!ref) throw new Refus("NEXT_PUBLIC_SUPABASE_URL absente ou pas une URL https://<ref>.supabase.co");
    if (ref === REF_PRODUCTION_CONNUE || attendue === REF_PRODUCTION_CONNUE) throw new Refus("référence Supabase PRODUCTION : refus");
    if (ref !== attendue) throw new Refus("la référence Supabase ne correspond pas à la Preview attendue (--preview-ref)");
    if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Refus("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente");
    if (/^sb_secret_/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) throw new Refus("la clé fournie est une clé secrète, pas une clé publishable");
  }
  if (mode === "--brevo-sandbox" || mode === "--brevo-send") {
    if (!env.BREVO_API_KEY || !env.EMAIL_FROM_ADDRESS) throw new Refus("BREVO_API_KEY et EMAIL_FROM_ADDRESS sont requises");
  }
}

/** Rapport de configuration sans valeur. */
export function rapportConfiguration(env) {
  const present = (valeur) => typeof valeur === "string" && valeur.trim() !== "";
  const lignes = [];
  const brevo = present(env.BREVO_API_KEY) && present(env.EMAIL_FROM_ADDRESS);
  lignes.push(["BREVO_API_KEY", present(env.BREVO_API_KEY) ? (/^xkeysib-/.test(env.BREVO_API_KEY) ? "présente (forme clé API Brevo)" : "présente (forme inattendue : clé SMTP ?)") : "absente"]);
  lignes.push(["EMAIL_FROM_ADDRESS", present(env.EMAIL_FROM_ADDRESS) ? "présente" : "absente"]);
  lignes.push(["EMAIL_FROM_NAME", present(env.EMAIL_FROM_NAME) ? "présente" : "absente (défaut « ELSATIA »)"]);
  lignes.push(["SUPPORT_EMAIL", present(env.SUPPORT_EMAIL) ? "présente" : "absente (replyTo des flux 5/6)"]);
  const ref = refDepuisUrl(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  lignes.push(["NEXT_PUBLIC_SUPABASE_URL", ref ? (ref === REF_PRODUCTION_CONNUE ? "PRODUCTION — refusée" : ref === REF_PREVIEW_AUTORISEE ? "projet Preview connu" : "projet non répertorié (passer --preview-ref)") : "absente ou non Supabase"]);
  return {
    lignes,
    brevo,
    flux: [
      ["Documents devis/facture/avoir (Gestion Pro)", brevo],
      ["Relances manuelles et automatiques (Gestion Pro)", brevo],
      ["Paiement d'abonnement échoué (webhook Stripe)", brevo],
      ["Réponse support (plateforme)", brevo],
      ["Invitation et notifications Réserves", brevo],
      ["Confirmation d'inscription / mot de passe oublié (Supabase Auth)", "SMTP du projet Supabase — non vérifiable sans --auth-recovery"],
    ],
  };
}

export async function brevoSandbox(env, to, { fetchImpl = fetch } = {}) {
  const reponse = await fetchImpl(BREVO_API_URL, {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json", "X-Sib-Sandbox": "drop" },
    body: JSON.stringify({
      sender: { name: env.EMAIL_FROM_NAME || "ELSATIA", email: env.EMAIL_FROM_ADDRESS },
      to: [{ email: to }],
      subject: "[PREVIEW][SMOKE][SANDBOX] ELSATIA",
      textContent: "Smoke test Preview ELSATIA en mode bac à sable Brevo : cet e-mail ne doit pas être délivré.",
      headers: { "X-Sib-Sandbox": "drop" },
    }),
  });
  return { ok: reponse.ok, statut: reponse.status };
}

export async function brevoEnvoiReel(to, { envoyer } = {}) {
  const envoi = envoyer ?? (await import("../packages/email/src/index.ts")).envoyerEmailBrevo;
  const { messageId } = await envoi({
    to,
    sujet: "[PREVIEW][SMOKE] ELSATIA — transport Brevo",
    texte: `Smoke test Preview ELSATIA (${new Date().toISOString()}). Si vous recevez ce message, le transport Brevo de la Preview fonctionne.`,
  });
  return { ok: true, messageIdPresent: Boolean(messageId) };
}

export async function authRecovery(env, to, { fetchImpl = fetch } = {}) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const reponse = await fetchImpl(`${base}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: to }),
  });
  // GoTrue répond 200 même pour une adresse inconnue (anti-énumération) : un 200 prouve que
  // l'Auth accepte la demande, la RÉCEPTION doit être constatée dans la boîte de l'opérateur.
  return { ok: reponse.ok, statut: reponse.status };
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  let args;
  try {
    args = lireArguments(argv);
    verifierCible(env, args);
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); return 2; }
    throw error;
  }
  const rapport = rapportConfiguration(env);
  console.log("ELSATIA — smoke e-mail Preview (aucune valeur affichée)");
  for (const [nom, etat] of rapport.lignes) console.log(`  ${nom.padEnd(28)} ${etat}`);
  console.log("\nFlux applicatifs (actifs si Brevo configuré) :");
  for (const [flux, etat] of rapport.flux) console.log(`  ${etat === true ? "ACTIF  " : etat === false ? "INACTIF" : "À PROUVER"}  ${flux}`);

  try {
    if (args.mode === "--check") {
      console.log(`\n${rapport.brevo ? "OK" : "INFO"} : contrôle de configuration seulement (aucun appel réseau).`);
      return 0;
    }
    if (args.mode === "--brevo-sandbox") {
      const r = await brevoSandbox(env, args.to, deps);
      console.log(`\nBrevo (bac à sable) : HTTP ${r.statut}`);
      return r.ok ? 0 : 1;
    }
    if (args.mode === "--brevo-send") {
      const r = await brevoEnvoiReel(args.to, deps);
      console.log(`\nBrevo (envoi réel) : accepté, messageId ${r.messageIdPresent ? "reçu" : "absent"}. Constater la RÉCEPTION dans la boîte du destinataire.`);
      return 0;
    }
    const r = await authRecovery(env, args.to, deps);
    console.log(`\nSupabase Auth /recover : HTTP ${r.statut}. Constater la RÉCEPTION (lien vers /auth/confirm de Gestion Pro).`);
    return r.ok ? 0 : 1;
  } catch (error) {
    console.error(`ÉCHEC : ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
