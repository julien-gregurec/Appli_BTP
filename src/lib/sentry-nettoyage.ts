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
  exception?: { values?: { value?: string }[] };
  extra?: Record<string, unknown>;
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, string> };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};

const EN_TETES_SENSIBLES = new Set(["cookie", "authorization", "x-supabase-auth", "stripe-signature"]);

// Données bancaires (rotation des clés V1) : IBAN complet (avec ou sans espaces), valeur
// chiffrée « v1:… » / « v2:kN:A256GCM:… » et trousseau « kN:<clé> ». Les quatre derniers
// caractères seuls (« •••• 0189 ») ne sont pas un IBAN et restent lisibles.
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const CHIFFRE_BANCAIRE = /\bv(?:1|2:k\d+:A256GCM):[A-Za-z0-9_:-]+/g;
const CLE_TROUSSEAU = /\bk\d+:(?:[A-Za-z0-9+/]{43}=|[0-9a-fA-F]{64})/g;

export function masquerDonneesBancaires(texte: string): string {
  return texte
    .replace(CHIFFRE_BANCAIRE, "[chiffré bancaire masqué]")
    .replace(CLE_TROUSSEAU, "[clé masquée]")
    .replace(IBAN, "[IBAN masqué]");
}

const masquer = (texte: string) => masquerDonneesBancaires(masquerPourJournal(texte));

function masquerValeur(valeur: unknown): unknown {
  return typeof valeur === "string" ? masquer(valeur) : valeur;
}

export function nettoyerEvenementSentry<T>(evenement: T): T {
  const e = evenement as Evenement;
  if (typeof e.message === "string") e.message = masquer(e.message);
  for (const exception of e.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = masquer(exception.value);
  }
  if (e.extra) for (const cle of Object.keys(e.extra)) e.extra[cle] = masquerValeur(e.extra[cle]);
  if (e.request) {
    if (typeof e.request.url === "string") e.request.url = masquer(e.request.url);
    delete e.request.query_string;
    delete e.request.cookies;
    if (e.request.headers) {
      for (const nom of Object.keys(e.request.headers)) {
        if (EN_TETES_SENSIBLES.has(nom.toLowerCase())) delete e.request.headers[nom];
        else e.request.headers[nom] = masquer(e.request.headers[nom]);
      }
    }
  }
  for (const miette of e.breadcrumbs ?? []) {
    if (typeof miette.message === "string") miette.message = masquer(miette.message);
    if (miette.data) for (const cle of Object.keys(miette.data)) miette.data[cle] = masquerValeur(miette.data[cle]);
  }
  return evenement;
}
