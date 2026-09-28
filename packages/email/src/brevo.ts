// Transport Brevo — UNIQUE implémentation de l'envoi pour Gestion Pro (`src/lib/brevo.ts`,
// qui le réexporte) et ELSATIA Réserves. Les secrets ne sont jamais dupliqués :
// `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` et `EMAIL_FROM_NAME` restent les trois mêmes
// variables.
//
// Deux gardes s'appliquent ICI, donc à tous les flux sans exception :
//   1. hors Production, le destinataire doit figurer dans `EMAIL_PREVIEW_ALLOWLIST`,
//      sinon rien ne part (`EnvoiEmailBloqueError`, avant tout appel réseau) ;
//   2. hors Production, l'objet est préfixé (`[PREVIEW]`) et une bannière est posée.

import { deciderDestinataire } from "./destinataires.ts";
import { resoudreEnvironnementEmail } from "./environnement.ts";
import { marquerPourEnvironnement } from "./gabarit.ts";
import { ErreurFournisseurEmail, type FournisseurEmail, type MessageEmail, type NatureEchec } from "./livraison.ts";

export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DELAI_MAXIMAL_MS = 15_000;

type Env = Record<string, string | undefined>;

export function brevoEstConfigure(environnement: NodeJS.ProcessEnv | Env = process.env) {
  return Boolean(environnement.BREVO_API_KEY && environnement.EMAIL_FROM_ADDRESS);
}

export class EnvoiEmailBloqueError extends Error {
  readonly motif: string;
  constructor(motif: string) {
    super(
      motif === "adresse_invalide"
        ? "Envoi e-mail refusé : adresse du destinataire invalide."
        : "Envoi e-mail bloqué hors Production : destinataire absent de EMAIL_PREVIEW_ALLOWLIST.",
    );
    this.name = "EnvoiEmailBloqueError";
    this.motif = motif;
  }
}

export function natureStatutHttp(statut: number): NatureEchec {
  if (statut === 429 || statut === 500 || statut === 502 || statut === 503 || statut === 504) return "transitoire";
  return "definitif";
}

function natureErreurReseau(erreur: unknown): NatureEchec {
  const nom = erreur instanceof Error ? erreur.name : "";
  if (nom === "AbortError" || nom === "TimeoutError") return "ambigu";
  const cause = (erreur as { cause?: { code?: string } } | null)?.cause?.code;
  // Refus de connexion ou résolution DNS : la requête n'a pas quitté la machine.
  if (cause === "ECONNREFUSED" || cause === "ENOTFOUND" || cause === "EAI_AGAIN") return "transitoire";
  return "ambigu";
}

/** Fournisseur Brevo, branché sur une configuration explicite (testable sans `process.env`). */
export function creerFournisseurBrevo(
  environnement: Env = process.env,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): FournisseurEmail {
  return {
    nom: "brevo",
    async envoyer(message: MessageEmail) {
      const apiKey = environnement.BREVO_API_KEY;
      const fromAddress = environnement.EMAIL_FROM_ADDRESS;
      if (!apiKey || !fromAddress) {
        throw new ErreurFournisseurEmail("Envoi email indisponible : Brevo n'est pas configuré", "definitif");
      }
      const fromName = environnement.EMAIL_FROM_NAME || "ELSATIA";
      let reponse: Response;
      try {
        reponse = await fetchImpl(BREVO_API_URL, {
          method: "POST",
          headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { name: fromName, email: fromAddress },
            to: [{ email: message.to, name: message.toName || undefined }],
            replyTo: message.replyTo ? { email: message.replyTo } : undefined,
            subject: message.sujet,
            textContent: message.texte,
            htmlContent: message.html || undefined,
            attachment: message.piecesJointes?.length
              ? message.piecesJointes.map((p) => ({ name: p.nom, content: p.contenuBase64 }))
              : undefined,
          }),
          signal: AbortSignal.timeout(DELAI_MAXIMAL_MS),
        });
      } catch (erreur) {
        // Jamais le message d'origine : il peut contenir l'URL ou des en-têtes.
        throw new ErreurFournisseurEmail("Envoi email impossible (Brevo injoignable)", natureErreurReseau(erreur));
      }
      if (!reponse.ok) {
        // Ne jamais journaliser le corps de la réponse Brevo : peut contenir l'adresse du destinataire.
        throw new ErreurFournisseurEmail(
          `Envoi email impossible (Brevo a répondu ${reponse.status})`,
          natureStatutHttp(reponse.status),
          reponse.status,
        );
      }
      const donnees: { messageId?: string } = await reponse.json().catch(() => ({}));
      return { messageId: donnees.messageId ?? null };
    },
  };
}

export type PieceJointeBrevo = { nom: string; contenuBase64: string };

/**
 * Envoi direct (une tentative), conservé pour les appelants existants. Pour la reprise,
 * la lettre morte et l'idempotence, passer par `livrerEmail`.
 */
export async function envoyerEmailBrevo(params: MessageEmail): Promise<{ messageId: string | null }> {
  const environnement = process.env;
  if (!brevoEstConfigure(environnement)) throw new Error("Envoi email indisponible : Brevo n'est pas configuré");
  const decision = deciderDestinataire(params.to, environnement);
  if (!decision.autorise) throw new EnvoiEmailBloqueError(decision.motif);
  const message = marquerPourEnvironnement(params, resoudreEnvironnementEmail(environnement));
  return creerFournisseurBrevo(environnement).envoyer(message);
}
