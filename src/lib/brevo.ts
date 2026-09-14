// GP_V1_RC : implémentation autonome (le paquet partagé `@elsatia/email`, qui réunit ce
// transport avec celui d'ELSATIA Réserves, est absent de la baseline release). Fonctions et
// comportement identiques à la version de la branche feature — Cc/Cci compris, nécessaires à
// `documents-envoi.ts` — sans dépendance à un paquet workspace hors périmètre GP.

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export function brevoEstConfigure(environnement: NodeJS.ProcessEnv = process.env) {
  return Boolean(environnement.BREVO_API_KEY && environnement.EMAIL_FROM_ADDRESS);
}

export type PieceJointeBrevo = { nom: string; contenuBase64: string };

export async function envoyerEmailBrevo(params: {
  to: string;
  toName?: string | null;
  sujet: string;
  texte: string;
  html?: string;
  replyTo?: string | null;
  piecesJointes?: PieceJointeBrevo[];
  /** Copies (Cc) et copies cachées (Cci) — adresses déjà validées par l'appelant. */
  cc?: string[];
  cci?: string[];
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !fromAddress) throw new Error("Envoi email indisponible : Brevo n'est pas configuré");
  const fromName = process.env.EMAIL_FROM_NAME || "ELSATIA";

  const reponse = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: fromAddress },
      to: [{ email: params.to, name: params.toName || undefined }],
      cc: params.cc?.length ? params.cc.map((email) => ({ email })) : undefined,
      bcc: params.cci?.length ? params.cci.map((email) => ({ email })) : undefined,
      replyTo: params.replyTo ? { email: params.replyTo } : undefined,
      subject: params.sujet,
      textContent: params.texte,
      htmlContent: params.html || undefined,
      attachment: params.piecesJointes?.length
        ? params.piecesJointes.map((p) => ({ name: p.nom, content: p.contenuBase64 }))
        : undefined,
    }),
  });

  if (!reponse.ok) {
    // Ne jamais journaliser le corps de la réponse Brevo : peut contenir l'adresse du destinataire.
    throw new Error(`Envoi email impossible (Brevo a répondu ${reponse.status})`);
  }
  const donnees: { messageId?: string } = await reponse.json();
  return { messageId: donnees.messageId ?? null };
}

/**
 * Échappement HTML. Tout ce qui vient de la base — nom de client, raison sociale, libellé de
 * ligne de devis — traverse cette fonction avant d'entrer dans un gabarit : une donnée saisie
 * par un utilisateur n'est pas du balisage.
 */
export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
