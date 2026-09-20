import "server-only";
/**
 * Minimal transactional mailer. Providers: `mailpit` (local catcher), `resend` (HTTPS API), or none.
 * Without a provider nothing is sent and the caller shows the link to copy. Secrets never reach a log.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export async function sendMail(mail: Mail): Promise<boolean> {
  const provider = (process.env.STUDIO_MAIL_PROVIDER ?? "").toLowerCase();
  const from = process.env.STUDIO_MAIL_FROM || "ELSATIA Studio <studio@localhost>";
  try {
    if (provider === "mailpit") {
      const base = process.env.STUDIO_MAILPIT_URL;
      if (!base || new URL(base).hostname !== "127.0.0.1") return false;
      const r = await fetch(`${base}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: "studio@localhost", Name: "ELSATIA Studio" },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          Text: mail.text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok;
    }
    if (provider === "resend") {
      const key = process.env.RESEND_API_KEY;
      if (!key) return false;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok;
    }
  } catch {
    return false;
  }
  return false;
}
