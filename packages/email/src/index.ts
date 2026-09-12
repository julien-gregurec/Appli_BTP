// Canal e-mail commun à toutes les applications ELSATIA.
//
// Ce module est l'UNIQUE implémentation du transport : Gestion Pro (`src/lib/brevo.ts`,
// qui le réexporte) et ELSATIA Réserves l'appellent tous deux. Les secrets ne sont donc
// jamais dupliqués — `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` et `EMAIL_FROM_NAME` restent
// les trois mêmes variables, déjà documentées dans `.env.example`.

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
 * Échappement HTML. Tout ce qui vient de la base — nom de chantier, raison sociale,
 * titre de réserve — traverse cette fonction avant d'entrer dans un gabarit : un nom de
 * chantier est une donnée saisie par un utilisateur, pas du balisage.
 */
export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gabarit commun : un en-tête ELSATIA, un corps, un bouton facultatif, un pied de page.
 * Volontairement en HTML de table et en styles en ligne — c'est ce que les clients de
 * messagerie rendent correctement, pas le CSS moderne.
 */
export function gabaritEmailElsatia(params: {
  titre: string;
  paragraphes: string[];
  bouton?: { libelle: string; url: string } | null;
  piedDePage?: string | null;
  application?: string;
}): string {
  const application = params.application ?? "ELSATIA";
  const corps = params.paragraphes
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2933;">${p}</p>`)
    .join("");
  const bouton = params.bouton
    ? `<p style="margin:24px 0 8px;">
         <a href="${echapperHtml(params.bouton.url)}"
            style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1f4f8f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
           ${echapperHtml(params.bouton.libelle)}
         </a>
       </p>`
    : "";
  const pied = params.piedDePage
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${params.piedDePage}</p>`
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr><td style="padding:22px 26px 0;">
      <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1f4f8f;font-weight:700;">${echapperHtml(application)}</p>
      <h1 style="margin:10px 0 18px;font-size:20px;line-height:1.3;color:#111827;">${echapperHtml(params.titre)}</h1>
    </td></tr>
    <tr><td style="padding:0 26px 26px;">${corps}${bouton}${pied}</td></tr>
  </table>
</body></html>`;
}
