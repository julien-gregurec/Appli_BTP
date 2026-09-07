/**
 * Téléversement par morceaux, reprenable (§18, §19 du brief prototype).
 *
 * Sémantique volontairement calquée sur TUS (`Upload-Offset`, `PATCH` à
 * l'offset courant, reprise après coupure) sans en importer le protocole ni
 * l'infrastructure : le prototype décrit la machine à états, pas le serveur.
 * Un vol de 300 photos sur un réseau de chantier, c'est exactement le cas où
 * une reprise vaut mieux qu'un nouvel envoi complet.
 *
 * Le stockage est un port (`EcrivainBlocs`) : l'implémentation mémoire sert aux
 * tests et à la démo, une implémentation Supabase Storage viendrait plus tard —
 * **aucun bucket Production n'est requis ni créé ici**.
 */

import type { StorageObjectRef } from "@elsatia/drone-core";

import { calculerSha256 } from "./empreinte";

/**
 * Clé d'écriture d'une référence de stockage. Le port `EcrivainBlocs` travaille
 * sur des clés plates ; un vrai client Supabase Storage prendrait le couple
 * (bucket, chemin) tel quel.
 */
export function cheminEcriture(ref: StorageObjectRef): string {
  return `${ref.bucket}/${ref.path}`;
}

export const CODES_ERREUR_TELEVERSEMENT = [
  "session_inconnue",
  "session_close",
  "offset_incoherent",
  "depassement_taille",
  "taille_incomplete",
  "empreinte_incoherente",
] as const;
export type CodeErreurTeleversement = (typeof CODES_ERREUR_TELEVERSEMENT)[number];

export class ErreurTeleversement extends Error {
  readonly code: CodeErreurTeleversement;

  constructor(code: CodeErreurTeleversement, message: string) {
    super(message);
    this.name = "ErreurTeleversement";
    this.code = code;
  }
}

export interface EcrivainBlocs {
  ecrire(chemin: string, offset: number, contenu: Uint8Array): Promise<void>;
  lire(chemin: string): Promise<Uint8Array>;
  supprimer(chemin: string): Promise<void>;
}

export function creerEcrivainMemoire(): EcrivainBlocs & { fichiers(): Map<string, Uint8Array> } {
  const fichiers = new Map<string, Uint8Array>();
  return {
    fichiers: () => fichiers,
    async ecrire(chemin, offset, contenu) {
      const existant = fichiers.get(chemin) ?? new Uint8Array(0);
      const taille = Math.max(existant.length, offset + contenu.length);
      const fusion = new Uint8Array(taille);
      fusion.set(existant, 0);
      fusion.set(contenu, offset);
      fichiers.set(chemin, fusion);
    },
    async lire(chemin) {
      const contenu = fichiers.get(chemin);
      if (contenu === undefined) throw new ErreurTeleversement("session_inconnue", chemin);
      return contenu;
    },
    async supprimer(chemin) {
      fichiers.delete(chemin);
    },
  };
}

export type StatutSession = "ouverte" | "terminee" | "abandonnee";

export type SessionTeleversement = {
  sessionId: string;
  ref: StorageObjectRef;
  cheminStockage: string;
  tailleTotale: number;
  tailleBloc: number;
  offset: number;
  sha256Attendu: string | null;
  statut: StatutSession;
  creeeLe: string;
  majLe: string;
};

export type DemandeSession = {
  sessionId: string;
  ref: StorageObjectRef;
  tailleTotale: number;
  tailleBloc?: number;
  /** Empreinte annoncée par le client ; vérifiée à la clôture (§19). */
  sha256Attendu?: string | null;
};

export const TAILLE_BLOC_DEFAUT = 5 * 1024 * 1024;

export type ResultatTeleversement = {
  ref: StorageObjectRef;
  octets: number;
  sha256: string;
};

export type GestionnaireTeleversement = {
  ouvrir(demande: DemandeSession): SessionTeleversement;
  etat(sessionId: string): SessionTeleversement;
  /** Retourne le nouvel offset. Rejouer un bloc déjà écrit est sans effet (idempotent). */
  televerserBloc(sessionId: string, offset: number, contenu: Uint8Array): Promise<number>;
  terminer(sessionId: string): Promise<ResultatTeleversement>;
  abandonner(sessionId: string): Promise<void>;
  sessions(): SessionTeleversement[];
};

export function creerGestionnaireTeleversement(
  ecrivain: EcrivainBlocs,
  horloge: () => Date = () => new Date(),
): GestionnaireTeleversement {
  const sessions = new Map<string, SessionTeleversement>();

  const exiger = (sessionId: string): SessionTeleversement => {
    const session = sessions.get(sessionId);
    if (session === undefined) {
      throw new ErreurTeleversement("session_inconnue", `Session inconnue : ${sessionId}`);
    }
    return session;
  };

  return {
    ouvrir(demande) {
      const session: SessionTeleversement = {
        sessionId: demande.sessionId,
        ref: demande.ref,
        cheminStockage: cheminEcriture(demande.ref),
        tailleTotale: demande.tailleTotale,
        tailleBloc: demande.tailleBloc ?? TAILLE_BLOC_DEFAUT,
        offset: 0,
        sha256Attendu: demande.sha256Attendu ?? null,
        statut: "ouverte",
        creeeLe: horloge().toISOString(),
        majLe: horloge().toISOString(),
      };
      sessions.set(session.sessionId, session);
      return { ...session };
    },

    etat(sessionId) {
      return { ...exiger(sessionId) };
    },

    async televerserBloc(sessionId, offset, contenu) {
      const session = exiger(sessionId);
      if (session.statut !== "ouverte") {
        throw new ErreurTeleversement(
          "session_close",
          `Session ${sessionId} en statut ${session.statut}`,
        );
      }
      // Rejeu d'un bloc déjà écrit : la reprise après coupure réseau renvoie
      // parfois le dernier bloc. On l'ignore au lieu de casser l'envoi.
      if (offset + contenu.length <= session.offset) return session.offset;
      if (offset !== session.offset) {
        throw new ErreurTeleversement(
          "offset_incoherent",
          `Offset attendu ${session.offset}, reçu ${offset}`,
        );
      }
      if (offset + contenu.length > session.tailleTotale) {
        throw new ErreurTeleversement(
          "depassement_taille",
          `Le bloc dépasse la taille annoncée (${session.tailleTotale} octets)`,
        );
      }
      await ecrivain.ecrire(session.cheminStockage, offset, contenu);
      session.offset = offset + contenu.length;
      session.majLe = horloge().toISOString();
      return session.offset;
    },

    async terminer(sessionId) {
      const session = exiger(sessionId);
      if (session.statut === "terminee") {
        const dejaEcrit = await ecrivain.lire(session.cheminStockage);
        return {
          ref: session.ref,
          octets: dejaEcrit.length,
          sha256: calculerSha256(dejaEcrit),
        };
      }
      if (session.statut !== "ouverte") {
        throw new ErreurTeleversement(
          "session_close",
          `Session ${sessionId} en statut ${session.statut}`,
        );
      }
      if (session.offset !== session.tailleTotale) {
        throw new ErreurTeleversement(
          "taille_incomplete",
          `${session.offset} octets reçus sur ${session.tailleTotale} annoncés`,
        );
      }
      const contenu = await ecrivain.lire(session.cheminStockage);
      const sha256 = calculerSha256(contenu);
      if (session.sha256Attendu !== null && session.sha256Attendu !== sha256) {
        // Le fichier reste en place : la reprise est possible, la corruption est tracée.
        throw new ErreurTeleversement(
          "empreinte_incoherente",
          `sha256 attendu ${session.sha256Attendu}, obtenu ${sha256}`,
        );
      }
      session.statut = "terminee";
      session.majLe = horloge().toISOString();
      return { ref: session.ref, octets: contenu.length, sha256 };
    },

    async abandonner(sessionId) {
      const session = exiger(sessionId);
      session.statut = "abandonnee";
      session.majLe = horloge().toISOString();
      await ecrivain.supprimer(session.cheminStockage);
    },

    sessions() {
      return [...sessions.values()].map((session) => ({ ...session }));
    },
  };
}
