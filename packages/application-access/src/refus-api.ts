/**
 * Réponse d'accès d'une API protégée : JSON, jamais une page de login HTML.
 *
 *   401  non authentifié            403  authentifié mais interdit (avec `code` stable)
 *   423  droit acquis, verrouillé   503  service indisponible (jamais 403 ni 500 pour une panne)
 *
 * Sans dépendance Next : n'utilise que `Response`. Additif — aucune route n'est encore migrée.
 */
import { REGLES_DECISION, type DecisionAccesClient, type StatutHttpAcces } from "./decision-acces";

/** Codes propres aux API, en plus des décisions d'accès. */
export type CodeRefusApiComplementaire =
  | "session_expiree"
  | "permission_refusee"
  | "origine_refusee"
  | "conflit_etat"
  | "trop_de_requetes";

export const STATUT_REFUS_API_COMPLEMENTAIRE: Record<CodeRefusApiComplementaire, StatutHttpAcces | 409 | 429> = {
  session_expiree: 401,
  permission_refusee: 403,
  origine_refusee: 403,
  conflit_etat: 409,
  trop_de_requetes: 429,
};

export type CodeRefusApi = DecisionAccesClient | CodeRefusApiComplementaire;

export function statutRefusApi(code: CodeRefusApi): number {
  return code in REGLES_DECISION
    ? REGLES_DECISION[code as DecisionAccesClient].statutHttp
    : STATUT_REFUS_API_COMPLEMENTAIRE[code as CodeRefusApiComplementaire];
}

export type OptionsRefusApi = {
  message?: string;
  /** `error` (GP, Réserves, Studio) ou `erreur` (Colors) : le champ existant de chaque application. */
  champMessage?: "error" | "erreur";
  retryAfterSecondes?: number;
};

export function reponseRefusApi(code: CodeRefusApi, options: OptionsRefusApi = {}): Response {
  const champ = options.champMessage ?? "error";
  const statut = statutRefusApi(code);
  const enTetes = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" });
  if (options.retryAfterSecondes && (statut === 429 || statut === 503)) {
    enTetes.set("Retry-After", String(options.retryAfterSecondes));
  }
  return new Response(JSON.stringify({ [champ]: options.message ?? code, code }), { status: statut, headers: enTetes });
}
