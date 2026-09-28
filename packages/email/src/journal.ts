// Journalisation des e-mails sans fuite.
//
// Ne sortent JAMAIS d'ici : un jeton, un secret, une URL de réinitialisation ou
// d'invitation complète, l'adresse d'un destinataire. Un lien est réduit à son origine
// et à son premier segment de chemin ; une adresse, à son domaine.

const URL_ABSOLUE = /\bhttps?:\/\/[^\s"'<>]+/gi;
const ADRESSE = /[^\s@"'<>(),;:]+@([^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+)/g;
// Paramètres porteurs de secret, même hors URL absolue (`?token_hash=…` isolé).
const PARAMETRE_SECRET = /\b(token|token_hash|code|access_token|refresh_token|jeton|secret|signature|sig|key|api[-_]?key|otp|password|mot_de_passe)=([^&\s"'<>]+)/gi;
// Clés d'API reconnaissables (Brevo, Stripe, Supabase) et JWT.
const CLE_CONNUE = /\b(xkeysib-[A-Za-z0-9-]+|xsmtpsib-[A-Za-z0-9-]+|sk_(?:live|test)_[A-Za-z0-9]+|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;

function reduireUrl(brut: string): string {
  try {
    const url = new URL(brut);
    const premier = url.pathname.split("/").filter(Boolean)[0];
    return `${url.origin}${premier ? `/${premier}/…` : "/"}`;
  } catch {
    return "[url]";
  }
}

export function masquerPourJournal(texte: string): string {
  return texte
    .replace(URL_ABSOLUE, (url) => reduireUrl(url))
    .replace(ADRESSE, (_adresse, domaine: string) => `***@${domaine}`)
    .replace(PARAMETRE_SECRET, (_m, cle: string) => `${cle}=[masqué]`)
    .replace(CLE_CONNUE, "[secret masqué]");
}

export type EvenementEmail = {
  evenement: "envoye" | "bloque" | "echec_transitoire" | "echec_definitif" | "doublon_ignore" | "lettre_morte";
  flux: string;
  application: string;
  environnement: string;
  tentative?: number;
  motif?: string;
  domaineDestinataire?: string;
};

/** Trace structurée, sans donnée personnelle ni secret. */
export function journaliserEvenementEmail(
  evenement: EvenementEmail,
  sortie: (ligne: string) => void = (ligne) => console.info(ligne),
): void {
  const propre: Record<string, string | number> = {};
  for (const [cle, valeur] of Object.entries(evenement)) {
    if (valeur === undefined) continue;
    propre[cle] = typeof valeur === "string" ? masquerPourJournal(valeur) : valeur;
  }
  sortie(`[email] ${JSON.stringify(propre)}`);
}

export function domaineDe(adresse: string): string | undefined {
  const i = adresse.lastIndexOf("@");
  return i === -1 ? undefined : adresse.slice(i + 1).trim().toLowerCase() || undefined;
}
