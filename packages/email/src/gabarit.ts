// Gabarit transactionnel commun à toutes les applications ELSATIA.
//
// Un e-mail ELSATIA porte toujours, dans cet ordre : bannière d'environnement (hors
// Production), logo et nom d'application, titre, corps, bouton d'action facultatif,
// URL de l'application, contact support (s'il est configuré), ligne légale de l'éditeur.
// Les versions HTML et texte sont produites ensemble, à partir des mêmes données.
//
// HTML en tables et styles en ligne : c'est ce que les clients de messagerie rendent.

import { APPLICATIONS_EMAIL, lienAppartientA, origineApplication, type CodeApplicationEmail } from "./applications.ts";
import { libelleEnvironnement, resoudreEnvironnementEmail, type EnvironnementEmail } from "./environnement.ts";
import { adresseContact, ligneLegale, MARQUE_ELSATIA } from "./identite.ts";

type Env = Record<string, string | undefined>;

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

export const MARQUEUR_BANNIERE = "data-elsatia-environnement";

export function texteBanniereEnvironnement(env: EnvironnementEmail): string | null {
  const libelle = libelleEnvironnement(env);
  return libelle
    ? `${libelle} — e-mail émis depuis un environnement de test ELSATIA. Ne pas en tenir compte.`
    : null;
}

export function banniereEnvironnementHtml(env: EnvironnementEmail): string {
  const texte = texteBanniereEnvironnement(env);
  if (!texte) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${MARQUEUR_BANNIERE}="${echapperHtml(env)}" style="max-width:560px;margin:0 auto 12px;"><tr><td style="padding:10px 14px;border-radius:8px;background:#fff4d6;border:1px solid #f0c24b;color:#7a4b00;font-size:13px;font-weight:700;">${echapperHtml(texte)}</td></tr></table>`;
}

/** Préfixe d'objet hors Production (`[PREVIEW] …`), idempotent. */
export function sujetAvecEnvironnement(sujet: string, env: EnvironnementEmail): string {
  const libelle = libelleEnvironnement(env);
  if (!libelle) return sujet;
  const prefixe = `[${libelle}]`;
  return sujet.startsWith(prefixe) ? sujet : `${prefixe} ${sujet}`;
}

export type BoutonEmail = { libelle: string; url: string };

export type ParametresGabaritTransactionnel = {
  application: CodeApplicationEmail;
  titre: string;
  /** Texte brut, échappé ici. */
  paragraphes: string[];
  bouton?: BoutonEmail | null;
  /**
   * Par défaut, le bouton doit mener à l'application émettrice. `true` admet une URL
   * HTTPS tierce explicitement choisie par le code (ex. facture hébergée Stripe).
   */
  boutonExterneAutorise?: boolean;
  /** Pourquoi la personne reçoit cet e-mail (texte brut). */
  raison?: string | null;
  sujet: string;
  environnement?: Env;
};

export type EmailRendu = { sujet: string; texte: string; html: string };

export class LienEmailRefuseError extends Error {
  readonly motif: string;
  constructor(motif: string) {
    super(`Lien d'e-mail refusé (${motif})`);
    this.motif = motif;
    this.name = "LienEmailRefuseError";
  }
}

function boutonSur(bouton: BoutonEmail, params: ParametresGabaritTransactionnel, environnement: Env): string {
  let url: URL;
  try {
    url = new URL(bouton.url);
  } catch {
    throw new LienEmailRefuseError("url_invalide");
  }
  if (url.username || url.password) throw new LienEmailRefuseError("identifiants_incorpores");
  if (params.boutonExterneAutorise) {
    if (url.protocol !== "https:") throw new LienEmailRefuseError("schema_interdit");
    return url.toString();
  }
  if (!lienAppartientA(params.application, url.toString(), environnement)) {
    throw new LienEmailRefuseError("lien_hors_application");
  }
  return url.toString();
}

/**
 * Rend un e-mail complet (objet, texte, HTML). Lève `LienEmailRefuseError` si le bouton
 * mène ailleurs que prévu : mieux vaut ne pas envoyer qu'envoyer un lien piégé.
 */
export function rendreEmailTransactionnel(params: ParametresGabaritTransactionnel): EmailRendu {
  const environnement = params.environnement ?? process.env;
  const env = resoudreEnvironnementEmail(environnement);
  const application = APPLICATIONS_EMAIL[params.application];
  const origine = origineApplication(params.application, environnement);
  const urlApplication = origine.ok ? origine.origine : null;
  const contact = adresseContact(environnement);
  const urlBouton = params.bouton ? boutonSur(params.bouton, params, environnement) : null;
  const banniere = texteBanniereEnvironnement(env);

  const pied: string[] = [];
  if (params.raison) pied.push(params.raison);
  if (contact) pied.push(`Besoin d'aide ? ${contact}`);
  pied.push(ligneLegale());

  const texte = [
    banniere ? `*** ${banniere} ***\n` : null,
    `${MARQUE_ELSATIA} · ${application.nom}`,
    "",
    params.titre,
    "",
    ...params.paragraphes.flatMap((p) => [p, ""]),
    params.bouton && urlBouton ? `${params.bouton.libelle} : ${urlBouton}\n` : null,
    urlApplication ? `${application.nom} : ${urlApplication}` : null,
    "--",
    ...pied,
  ].filter((ligne): ligne is string => ligne !== null).join("\n");

  const corps = params.paragraphes
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2933;">${echapperHtml(p)}</p>`)
    .join("");
  const boutonHtml = params.bouton && urlBouton
    ? `<p style="margin:24px 0 8px;"><a href="${echapperHtml(urlBouton)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1f4f8f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${echapperHtml(params.bouton.libelle)}</a></p>`
    : "";
  const lienApplicationHtml = urlApplication
    ? `<p style="margin:0 0 6px;"><a href="${echapperHtml(urlApplication)}" style="color:#1f4f8f;">${echapperHtml(application.nom)}</a></p>`
    : "";
  const piedHtml = pied.map((l) => `<p style="margin:0 0 4px;">${echapperHtml(l)}</p>`).join("");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapperHtml(params.titre)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${banniereEnvironnementHtml(env)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr><td style="padding:22px 26px 0;">
      <p style="margin:0;font-size:18px;letter-spacing:.18em;font-weight:800;color:#0d1b2a;">${MARQUE_ELSATIA}</p>
      <p style="margin:2px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#1f4f8f;font-weight:700;">${echapperHtml(application.nom)}</p>
      <h1 style="margin:14px 0 18px;font-size:20px;line-height:1.3;color:#111827;">${echapperHtml(params.titre)}</h1>
    </td></tr>
    <tr><td style="padding:0 26px 22px;">${corps}${boutonHtml}</td></tr>
    <tr><td style="padding:14px 26px 20px;border-top:1px solid #eef0f3;font-size:12px;line-height:1.5;color:#6b7280;">${lienApplicationHtml}${piedHtml}</td></tr>
  </table>
</body></html>`;

  return { sujet: sujetAvecEnvironnement(params.sujet, env), texte, html };
}

/**
 * Gabarit historique (Réserves). Conservé pour compatibilité : les paragraphes sont du
 * HTML composé par l'appelant, qui échappe lui-même ses données. La ligne légale est
 * désormais ajoutée à chaque e-mail ; la bannière d'environnement est posée par le
 * transport.
 */
export function gabaritEmailElsatia(params: {
  titre: string;
  paragraphes: string[];
  bouton?: { libelle: string; url: string } | null;
  piedDePage?: string | null;
  application?: string;
}): string {
  const application = params.application ?? MARQUE_ELSATIA;
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
  const legal = `<p style="margin:14px 0 0;font-size:11px;line-height:1.5;color:#9ca3af;">${echapperHtml(ligneLegale())}</p>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr><td style="padding:22px 26px 0;">
      <p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1f4f8f;font-weight:700;">${echapperHtml(application)}</p>
      <h1 style="margin:10px 0 18px;font-size:20px;line-height:1.3;color:#111827;">${echapperHtml(params.titre)}</h1>
    </td></tr>
    <tr><td style="padding:0 26px 26px;">${corps}${bouton}${pied}${legal}</td></tr>
  </table>
</body></html>`;
}

/**
 * Marque un message déjà composé pour un environnement hors Production : objet préfixé,
 * bannière en tête du texte et du HTML. Idempotent (un gabarit déjà marqué ne l'est pas
 * deux fois). En Production, le message ressort inchangé.
 */
export function marquerPourEnvironnement<T extends { sujet: string; texte: string; html?: string }>(
  message: T,
  env: EnvironnementEmail,
): T {
  const banniere = texteBanniereEnvironnement(env);
  if (!banniere) return message;
  const texte = message.texte.includes(banniere) ? message.texte : `*** ${banniere} ***\n\n${message.texte}`;
  let html = message.html;
  if (html && !html.includes(MARQUEUR_BANNIERE)) {
    const bandeau = banniereEnvironnementHtml(env);
    html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (b) => `${b}${bandeau}`) : `${bandeau}${html}`;
  }
  return { ...message, sujet: sujetAvecEnvironnement(message.sujet, env), texte, ...(html !== undefined ? { html } : {}) };
}
