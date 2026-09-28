// ELSATIA — INCIDENT RESPONSE & SAFE MODE V1 — utilitaires du drill local.
// Aucune dépendance. Rien ici ne sait parler à un environnement hébergé : toute cible
// non locale est refusée par construction (`exigerCibleLocale`).
import crypto from "node:crypto";

const HOTES_LOCAUX = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Refuse toute URL dont l'hôte n'est pas la boucle locale. */
export function exigerCibleLocale(url) {
  let hote;
  try {
    hote = new URL(url).hostname;
  } catch {
    throw new Error(`REFUS : URL invalide (${String(url).slice(0, 40)})`);
  }
  if (!HOTES_LOCAUX.has(hote)) throw new Error(`REFUS : cible non locale (${hote}) — le drill est strictement local`);
  return url;
}

/** Refuse un nom de base qui ressemble à une URL ou à une chaîne de connexion. */
export function exigerBaseLocale(nom) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(nom ?? "")) throw new Error(`REFUS : nom de base local attendu (${nom})`);
  return nom;
}

const b64url = (tampon) => Buffer.from(tampon).toString("base64url");

/** JWT HS256 (même format que GoTrue) — secret local du drill uniquement. */
export function signerJwt(charge, secret, dureeSecondes = 3600) {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify({ iat: maintenant, exp: maintenant + dureeSecondes, ...charge }));
  const signature = crypto.createHmac("sha256", secret).update(`${entete}.${corps}`).digest("base64url");
  return `${entete}.${corps}.${signature}`;
}

/** En-tête `Stripe-Signature` (schéma v1) pour un corps donné — secret whsec_ local du drill. */
export function signerStripe(corps, secretWebhook, horodatage = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secretWebhook).update(`${horodatage}.${corps}`).digest("hex");
  return `t=${horodatage},v1=${v1}`;
}

/** Vérifie qu'un texte public ne contient aucune des valeurs sensibles fournies. */
export function fuites(texte, valeursSensibles) {
  return valeursSensibles.filter((v) => typeof v === "string" && v.length >= 6 && texte.includes(v));
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Réessaie `essai()` jusqu'à ce qu'il rende une valeur vraie, borné par `delaiMs`. */
export async function jusqua(essai, delaiMs = 30_000, pasMs = 500) {
  const debut = Date.now();
  let dernier;
  while (Date.now() - debut < delaiMs) {
    try {
      dernier = await essai();
      if (dernier) return { ok: true, valeur: dernier, ms: Date.now() - debut };
    } catch (e) {
      dernier = e;
    }
    await attendre(pasMs);
  }
  return { ok: false, valeur: dernier, ms: Date.now() - debut };
}
