import { createHmac, randomBytes } from "node:crypto";
import { comparerConstant, sha256, signer } from "@/lib/social/crypto";
import type { Fournisseur } from "@/lib/social/types";

// ─────────────────────────────────────────────────────────────
// État OAuth anti-CSRF : signé (HMAC dérivé), limité à 10 minutes, lié à
// l'utilisateur (UID canonique) ET à un nonce stocké dans un cookie httpOnly du navigateur
// qui a lancé la connexion.
// ─────────────────────────────────────────────────────────────

export const COOKIE_OAUTH = "elsatia_social_oauth";
const DUREE_ETAT_MS = 10 * 60_000;

export function creerEtatOAuth(fournisseur: Fournisseur, utilisateurId: string, maintenant = Date.now()) {
  const nonce = randomBytes(24).toString("base64url");
  const corps = Buffer.from(JSON.stringify({ f: fournisseur, u: sha256(utilisateurId.toLowerCase()), n: sha256(nonce), x: maintenant + DUREE_ETAT_MS })).toString("base64url");
  return { etat: `${corps}.${signer("oauth-state", corps)}`, nonce };
}

export function verifierEtatOAuth(etat: string | null, nonce: string | undefined, fournisseur: Fournisseur, utilisateurId: string, maintenant = Date.now()): boolean {
  if (!etat || !nonce) return false;
  const [corps, signature] = etat.split(".");
  if (!corps || !signature || !comparerConstant(signature, signer("oauth-state", corps))) return false;
  try {
    const v = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")) as { f?: string; u?: string; n?: string; x?: number };
    return v.f === fournisseur && v.u === sha256(utilisateurId.toLowerCase()) && v.n === sha256(nonce) && typeof v.x === "number" && v.x > maintenant;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Signatures de webhooks
// ─────────────────────────────────────────────────────────────

/** Meta : X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corps brut, secret de l'application). */
export function verifierSignatureMeta(corpsBrut: string, entete: string | null, secretApp: string | undefined): boolean {
  if (!entete || !secretApp || !entete.startsWith("sha256=")) return false;
  const attendu = createHmac("sha256", secretApp).update(corpsBrut, "utf8").digest("hex");
  return comparerConstant(entete.slice(7), attendu);
}

/** LinkedIn : X-LI-Signature = HMAC-SHA256("hmacsha256=" + corps brut, secret client), hexadécimal. */
export function verifierSignatureLinkedIn(corpsBrut: string, entete: string | null, secretClient: string | undefined): boolean {
  if (!entete || !secretClient) return false;
  const attendu = createHmac("sha256", secretClient).update(`hmacsha256=${corpsBrut}`, "utf8").digest("hex");
  return comparerConstant(entete.toLowerCase(), attendu);
}

/** LinkedIn : réponse au défi de validation de l'URL de webhook. */
export function reponseDefiLinkedIn(challengeCode: string, secretClient: string): string {
  return createHmac("sha256", secretClient).update(challengeCode, "utf8").digest("hex");
}

/** Clé d'idempotence d'un événement : empreinte du corps brut (les deux plateformes peuvent renvoyer un même événement). */
export function cleEvenement(fournisseur: Fournisseur, corpsBrut: string): string {
  return `${fournisseur}:${sha256(corpsBrut)}`;
}
