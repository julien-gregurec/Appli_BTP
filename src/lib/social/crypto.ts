import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// Chiffrement des jetons OAuth ELSATIA Social : AES-256-GCM, clé hors base.
//
// Rotation : définir la nouvelle clé dans SOCIAL_TOKEN_ENCRYPTION_KEY et
// l'ancienne dans SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS. Les jetons existants
// restent lisibles et sont rechiffrés avec la nouvelle clé (bouton « Rechiffrer »
// des comptes ou cron). Une fois tout rechiffré, retirer l'ancienne clé.
//
// Format : v1:<identifiant de clé>:<iv>:<tag>:<contenu>, tout en base64url.

type Cle = { id: string; octets: Buffer };

function lireCle(valeur: string | undefined, nom: string): Cle | null {
  const brute = valeur?.trim();
  if (!brute) return null;
  const octets = /^[0-9a-f]{64}$/i.test(brute) ? Buffer.from(brute, "hex") : Buffer.from(brute, "base64");
  if (octets.length !== 32) throw new Error(`${nom} doit contenir exactement 32 octets (64 caractères hexadécimaux ou base64)`);
  return { id: createHash("sha256").update(octets).digest("hex").slice(0, 12), octets };
}

function cleCourante(): Cle {
  const cle = lireCle(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY, "SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!cle) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY n’est pas configurée");
  return cle;
}

function clesDisponibles(): Cle[] {
  const cles = [cleCourante()];
  const precedente = lireCle(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS, "SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (precedente) cles.push(precedente);
  return cles;
}

export function versionCleCourante(): string {
  return cleCourante().id;
}

export function chiffrerSecret(valeur: string): string {
  const cle = cleCourante();
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle.octets, iv);
  chiffreur.setAAD(Buffer.from(`elsatia-social:${cle.id}`));
  const contenu = Buffer.concat([chiffreur.update(valeur, "utf8"), chiffreur.final()]);
  return ["v1", cle.id, iv.toString("base64url"), chiffreur.getAuthTag().toString("base64url"), contenu.toString("base64url")].join(":");
}

export function dechiffrerSecret(valeur: string): string {
  const [version, id, iv, tag, contenu] = valeur.split(":");
  if (version !== "v1" || !id || !iv || !tag || !contenu) throw new Error("Secret chiffré invalide");
  const cle = clesDisponibles().find((c) => c.id === id);
  if (!cle) throw new Error("Clé de chiffrement inconnue : rotation incomplète (ancienne clé retirée trop tôt ?)");
  const dechiffreur = createDecipheriv("aes-256-gcm", cle.octets, Buffer.from(iv, "base64url"));
  dechiffreur.setAAD(Buffer.from(`elsatia-social:${cle.id}`));
  dechiffreur.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([dechiffreur.update(Buffer.from(contenu, "base64url")), dechiffreur.final()]).toString("utf8");
}

export function estChiffreAvecCleCourante(valeur: string): boolean {
  return valeur.split(":")[1] === versionCleCourante();
}

// Clé HMAC dérivée (HKDF) : la clé de chiffrement n'est jamais utilisée deux fois.
function cleSignature(usage: string): Buffer {
  return Buffer.from(hkdfSync("sha256", cleCourante().octets, Buffer.alloc(0), `elsatia-social:${usage}`, 32));
}

export function signer(usage: string, donnees: string): string {
  return createHmac("sha256", cleSignature(usage)).update(donnees).digest("base64url");
}

export function comparerConstant(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sha256(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}
