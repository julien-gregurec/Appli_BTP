import { logErreur, logWarn } from "@/lib/observability/logger";

type ErreurAuthMinimale = { code?: string; message?: string } | null | undefined;

// Codes attendus en usage normal (session expirée, déconnexion, jeton révoqué) : pas
// une panne, juste un utilisateur à faire rejouer la connexion. Tout le reste (réseau,
// service Auth indisponible, erreur inattendue) est une vraie alerte opérationnelle.
const CODES_SESSION_ATTENDUS = new Set([
  "session_not_found", "refresh_token_not_found", "refresh_token_already_used",
  "bad_jwt", "session_expired", "user_not_found",
]);

// auth.getUser() ne devait auparavant JAMAIS être inspecté pour son `error` : un service
// Auth indisponible et une session expirée finissaient dans le même `redirect("/login")`,
// invisibles l'un de l'autre. Ce helper ajoute la visibilité sans changer ce comportement.
export function journaliserErreurAuthGetUser(erreur: ErreurAuthMinimale, contexte: { requestId?: string; route?: string }) {
  if (!erreur) return;
  if (erreur.code && CODES_SESSION_ATTENDUS.has(erreur.code)) {
    logWarn("auth", `Session invalide ou expirée (${erreur.code})`, { ...contexte, operation: "auth.getUser" });
  } else {
    logErreur("auth", "Échec auth.getUser (service Auth potentiellement indisponible)", { ...contexte, operation: "auth.getUser" }, erreur.message);
  }
}
