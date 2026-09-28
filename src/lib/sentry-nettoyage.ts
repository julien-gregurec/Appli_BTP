import { masquerPourJournal } from "@elsatia/email";

// Nettoyage des événements Sentry avant envoi.
//
// `sendDefaultPii: false` ne suffit pas : l'URL de la requête en erreur est transmise
// telle quelle, et plusieurs routes portent un secret dans le chemin ou la requête
// (`/document/<jeton>`, `/imprimer/partage/<jeton>`, `/auth/confirm?token_hash=…`,
// `/invitation/<jeton>` côté Réserves). On réduit chaque URL à son origine et à son
// premier segment, on retire la chaîne de requête, les cookies et l'en-tête
// d'autorisation, et on masque les fils d'Ariane.

type Evenement = {
  message?: string;
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, string> };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};

const EN_TETES_SENSIBLES = new Set(["cookie", "authorization", "x-supabase-auth", "stripe-signature"]);

function masquerValeur(valeur: unknown): unknown {
  return typeof valeur === "string" ? masquerPourJournal(valeur) : valeur;
}

export function nettoyerEvenementSentry<T>(evenement: T): T {
  const e = evenement as Evenement;
  if (typeof e.message === "string") e.message = masquerPourJournal(e.message);
  if (e.request) {
    if (typeof e.request.url === "string") e.request.url = masquerPourJournal(e.request.url);
    delete e.request.query_string;
    delete e.request.cookies;
    if (e.request.headers) {
      for (const nom of Object.keys(e.request.headers)) {
        if (EN_TETES_SENSIBLES.has(nom.toLowerCase())) delete e.request.headers[nom];
        else e.request.headers[nom] = masquerPourJournal(e.request.headers[nom]);
      }
    }
  }
  for (const miette of e.breadcrumbs ?? []) {
    if (typeof miette.message === "string") miette.message = masquerPourJournal(miette.message);
    if (miette.data) for (const cle of Object.keys(miette.data)) miette.data[cle] = masquerValeur(miette.data[cle]);
  }
  return evenement;
}
