const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export function brevoEstConfigure(environnement: NodeJS.ProcessEnv = process.env) {
  return Boolean(environnement.BREVO_API_KEY && environnement.EMAIL_FROM_ADDRESS);
}

export async function envoyerEmailBrevo(params: {
  to: string;
  toName?: string | null;
  sujet: string;
  texte: string;
  replyTo?: string | null;
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
      replyTo: params.replyTo ? { email: params.replyTo } : undefined,
      subject: params.sujet,
      textContent: params.texte,
    }),
  });

  if (!reponse.ok) {
    // Ne jamais journaliser le corps de la réponse Brevo : peut contenir l'adresse du destinataire.
    throw new Error(`Envoi email impossible (Brevo a répondu ${reponse.status})`);
  }
  const donnees: { messageId?: string } = await reponse.json();
  return { messageId: donnees.messageId ?? null };
}
