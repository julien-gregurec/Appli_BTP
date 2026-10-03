import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer <CRON_SECRET>` comparé en temps constant.
 *
 * Les deux valeurs sont d'abord ramenées à une empreinte de longueur fixe : ni la
 * durée de la comparaison ni un rejet anticipé sur la longueur ne renseignent sur
 * le secret. Un secret absent ou vide ne valide jamais rien (fail-closed).
 */
export function autorisationCronValide(enTete: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return secretsEgaux(enTete, `Bearer ${secret}`);
}

/** Comparaison en temps constant d'une valeur reçue (en-tête) avec la valeur attendue. */
export function secretsEgaux(recu: string | null, attendu: string | undefined): boolean {
  if (!attendu || !recu) return false;
  const a = createHash("sha256").update(recu).digest();
  const b = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(a, b);
}
