import { messageConfirmationMetier, messageErreurMetier } from "@/lib/messages-metier";

/**
 * `ok` et `erreur` sont des codes reçus par l'URL, jamais des textes : seul le
 * libellé ELSATIA associé à un code connu est rendu. Un code inconnu — donc
 * tout texte fabriqué par un tiers — n'affiche rien.
 */
export function FlashMessage({ ok, erreur }: { ok?: unknown; erreur?: unknown }) {
  const echec = messageErreurMetier(erreur);
  const message = echec ?? messageConfirmationMetier(ok);
  if (!message) return null;
  return <p className={`flash ${echec ? "error" : "success"}`} role="status">{message}</p>;
}
