import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { origineApplication, resoudreEnvironnementEmail } from "@elsatia/email";

/**
 * Jeton d'invitation à une intervention.
 *
 * Convention reprise telle quelle des liens de partage de documents commerciaux
 * (`src/lib/documents-partage.ts`, migration 00200) : le jeton est tiré côté serveur,
 * et SEULE son empreinte SHA-256 est envoyée à la base. Le jeton en clair n'existe que
 * dans l'URL remise au destinataire — jamais en base, jamais dans un journal.
 *
 * 32 octets aléatoires en base64url : 256 bits d'entropie, non devinables, et une URL
 * qui reste copiable-collable dans un e-mail.
 */
export function creerJetonInvitation(): string {
  return randomBytes(32).toString("base64url");
}

export function hacherJetonInvitation(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/** Durée de vie par défaut d'une invitation, en jours. La base borne à [1, 90]. */
export const DUREE_INVITATION_JOURS = 30;

/**
 * URL publique de l'application Réserves. Sert à composer le lien d'invitation : il doit
 * être absolu, puisqu'il voyage par e-mail.
 *
 * L'origine est validée par le registre commun (`@elsatia/email`) : en Production,
 * `https://reserves.elsatia.fr` exactement ; en Preview, HTTPS et jamais un hôte de
 * Production. Le repli `http://localhost:3040` n'existe plus qu'en local et en test :
 * ailleurs, une origine absente ou invalide LÈVE plutôt que d'envoyer un lien mort ou
 * pointant vers une autre application.
 */
export function urlApplicationReserves(): string {
  const origine = origineApplication("reserves");
  if (origine.ok) return origine.origine;
  const env = resoudreEnvironnementEmail();
  if ((env === "local" || env === "test") && origine.motif === "origine_absente") return "http://localhost:3040";
  throw new Error(`Origine publique de Réserves inutilisable (${origine.motif}) : aucun lien n'est émis.`);
}

export function urlInvitation(jeton: string): string {
  return `${urlApplicationReserves()}/invitation/${encodeURIComponent(jeton)}`;
}
