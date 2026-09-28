// Livraison d'un e-mail : garde des destinataires, reprise, lettre morte, audit, et
// jamais de doublon.
//
// Politique de reprise (fournisseur indisponible) :
//   * TRANSITOIRE et SANS AMBIGUÏTÉ (429, 500/502/503/504, connexion refusée avant tout
//     envoi) → nouvelle tentative, au plus `maxTentatives`, délais croissants ;
//   * DÉFINITIF (400/401/403/404/422…, configuration absente) → aucune reprise ;
//   * AMBIGU (délai dépassé, connexion coupée après émission de la requête) → AUCUNE
//     reprise automatique : le fournisseur a peut-être accepté le message, et Brevo ne
//     connaît pas de clé d'idempotence. Mieux vaut un e-mail à renvoyer à la main qu'un
//     doublon chez le client ;
//   * au-delà, l'envoi passe en LETTRE MORTE dans le registre, avec son motif technique
//     (jamais le contenu, jamais l'adresse), pour reprise opérateur.
//
// Le registre porte la clé d'idempotence : un second appel avec la même clé ne renvoie
// rien si le premier a réussi ou est en cours.

import { deciderDestinataire } from "./destinataires.ts";
import { resoudreEnvironnementEmail } from "./environnement.ts";
import { marquerPourEnvironnement } from "./gabarit.ts";
import { domaineDe, journaliserEvenementEmail, type EvenementEmail } from "./journal.ts";

type Env = Record<string, string | undefined>;

export type PieceJointeEmail = { nom: string; contenuBase64: string };

export type MessageEmail = {
  to: string;
  toName?: string | null;
  sujet: string;
  texte: string;
  html?: string;
  replyTo?: string | null;
  piecesJointes?: PieceJointeEmail[];
};

export type NatureEchec = "transitoire" | "definitif" | "ambigu";

export class ErreurFournisseurEmail extends Error {
  readonly nature: NatureEchec;
  readonly statut?: number;
  constructor(message: string, nature: NatureEchec, statut?: number) {
    super(message);
    this.nature = nature;
    this.statut = statut;
    this.name = "ErreurFournisseurEmail";
  }
}

export interface FournisseurEmail {
  readonly nom: string;
  envoyer(message: MessageEmail): Promise<{ messageId: string | null }>;
}

export type EtatEnvoi = "en_cours" | "envoye" | "echec" | "lettre_morte";

export interface RegistreEnvois {
  /** Réserve la clé. `false` si elle est déjà en cours ou envoyée : ne rien faire. */
  reserver(cle: string): Promise<boolean>;
  marquerEnvoye(cle: string, messageId: string | null): Promise<void>;
  marquerLettreMorte(cle: string, detail: { motif: string; tentatives: number; nature: NatureEchec }): Promise<void>;
}

/** Registre en mémoire : tests, scripts locaux. La Production s'appuie sur la base. */
export function creerRegistreEnMemoire() {
  const etats = new Map<string, { etat: EtatEnvoi; messageId?: string | null; motif?: string; tentatives?: number }>();
  const registre: RegistreEnvois & { etats: typeof etats } = {
    etats,
    async reserver(cle) {
      const courant = etats.get(cle);
      if (courant && (courant.etat === "en_cours" || courant.etat === "envoye")) return false;
      etats.set(cle, { etat: "en_cours" });
      return true;
    },
    async marquerEnvoye(cle, messageId) {
      etats.set(cle, { etat: "envoye", messageId });
    },
    async marquerLettreMorte(cle, detail) {
      etats.set(cle, { etat: "lettre_morte", motif: detail.motif, tentatives: detail.tentatives });
    },
  };
  return registre;
}

export type ResultatLivraison =
  | { statut: "envoye"; messageId: string | null; tentatives: number }
  | { statut: "bloque"; motif: string }
  | { statut: "doublon" }
  | { statut: "lettre_morte"; motif: string; nature: NatureEchec; tentatives: number };

const CLE_IDEMPOTENCE = /^[A-Za-z0-9:._-]{8,200}$/;

export async function livrerEmail(params: {
  cleIdempotence: string;
  flux: string;
  application: string;
  message: MessageEmail;
  fournisseur: FournisseurEmail;
  registre: RegistreEnvois;
  environnement?: Env;
  maxTentatives?: number;
  delaisMs?: readonly number[];
  attendre?: (ms: number) => Promise<void>;
  journal?: (ligne: string) => void;
}): Promise<ResultatLivraison> {
  const environnement = params.environnement ?? process.env;
  const env = resoudreEnvironnementEmail(environnement);
  const maxTentatives = Math.max(1, Math.min(params.maxTentatives ?? 3, 5));
  const delais = params.delaisMs ?? [500, 2000, 5000, 10000];
  const attendre = params.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = { flux: params.flux, application: params.application, environnement: env, domaineDestinataire: domaineDe(params.message.to) };
  const tracer = (e: Omit<EvenementEmail, keyof typeof base>) => journaliserEvenementEmail({ ...base, ...e }, params.journal);

  if (!CLE_IDEMPOTENCE.test(params.cleIdempotence)) {
    tracer({ evenement: "bloque", motif: "cle_idempotence_invalide" });
    return { statut: "bloque", motif: "cle_idempotence_invalide" };
  }
  const decision = deciderDestinataire(params.message.to, environnement);
  if (!decision.autorise) {
    tracer({ evenement: "bloque", motif: decision.motif });
    return { statut: "bloque", motif: decision.motif };
  }
  if (!(await params.registre.reserver(params.cleIdempotence))) {
    tracer({ evenement: "doublon_ignore" });
    return { statut: "doublon" };
  }

  const message = marquerPourEnvironnement(params.message, env);
  let dernier: { motif: string; nature: NatureEchec } = { motif: "inconnu", nature: "definitif" };
  for (let tentative = 1; tentative <= maxTentatives; tentative += 1) {
    try {
      const { messageId } = await params.fournisseur.envoyer(message);
      await params.registre.marquerEnvoye(params.cleIdempotence, messageId);
      tracer({ evenement: "envoye", tentative });
      return { statut: "envoye", messageId, tentatives: tentative };
    } catch (erreur) {
      const nature: NatureEchec = erreur instanceof ErreurFournisseurEmail ? erreur.nature : "ambigu";
      const motif = erreur instanceof ErreurFournisseurEmail
        ? `${params.fournisseur.nom}:${erreur.statut ?? nature}`
        : `${params.fournisseur.nom}:erreur_inattendue`;
      dernier = { motif, nature };
      if (nature === "transitoire" && tentative < maxTentatives) {
        tracer({ evenement: "echec_transitoire", tentative, motif });
        await attendre(delais[Math.min(tentative - 1, delais.length - 1)]);
        continue;
      }
      tracer({ evenement: "echec_definitif", tentative, motif });
      await params.registre.marquerLettreMorte(params.cleIdempotence, { motif, tentatives: tentative, nature });
      tracer({ evenement: "lettre_morte", tentative, motif });
      return { statut: "lettre_morte", motif, nature, tentatives: tentative };
    }
  }
  /* c8 ignore next */
  return { statut: "lettre_morte", motif: dernier.motif, nature: dernier.nature, tentatives: maxTentatives };
}

/**
 * Fournisseur factice : aucun réseau. Enregistre les messages et rejoue un scénario
 * d'échecs (`echecs[i]` s'applique à la i-ème tentative).
 */
export function creerFournisseurFactice(options: { echecs?: (NatureEchec | null)[]; nom?: string } = {}) {
  const envoyes: MessageEmail[] = [];
  let appels = 0;
  const fournisseur: FournisseurEmail & { envoyes: MessageEmail[]; appels: () => number } = {
    nom: options.nom ?? "factice",
    envoyes,
    appels: () => appels,
    async envoyer(message) {
      const nature = options.echecs?.[appels] ?? null;
      appels += 1;
      if (nature) {
        const statut = nature === "transitoire" ? 503 : nature === "definitif" ? 400 : undefined;
        throw new ErreurFournisseurEmail(`Échec simulé (${nature})`, nature, statut);
      }
      envoyes.push(message);
      return { messageId: `factice-${appels}` };
    },
  };
  return fournisseur;
}
