/**
 * Justificatif préparé hors ligne — module PUR.
 *
 * Ferme la réserve R3 : « une note de frais préparée hors ligne part sans son justificatif ».
 *
 * ── La règle ────────────────────────────────────────────────────────────────────────────
 *
 * Une note accompagnée d'un justificatif n'est JAMAIS présentée comme transmise tant que son
 * fichier ne l'est pas. Ce module ne sait rien du réseau ni d'IndexedDB : il décide, les
 * autres exécutent.
 *
 * ── Pourquoi en deux temps, et sans migration ───────────────────────────────────────────
 *
 * La politique de stockage du bucket `notes-frais` n'autorise le dépôt d'un fichier QUE sous
 * une note qui existe déjà et que son auteur peut modifier (`peut_modifier_note_frais_
 * personnelle`). Le fichier ne peut donc pas partir avant la note. L'ordre est imposé :
 *
 *   1. créer la note au statut `brouillon` — c'est-à-dire, en toutes lettres, INCOMPLÈTE ;
 *   2. déposer chaque fichier par la route de dépôt existante, qui reste l'unique chemin
 *      d'import (empreinte, horodatage, archivage renforcé, journal d'audit) ;
 *   3. seulement alors, déclarer l'opération synchronisée.
 *
 * Entre 1 et 3, la note existe côté serveur en brouillon et l'appareil la montre « envoi du
 * justificatif ». Rien ne laisse croire à une transmission complète. Aucune colonne, aucun
 * statut nouveau n'est nécessaire : `brouillon` dit déjà exactement ce qu'il faut.
 *
 * ── L'idempotence du dépôt ──────────────────────────────────────────────────────────────
 *
 * `documents_notes_frais` ne porte AUCUNE contrainte d'unicité sur (note, empreinte). Rejouer
 * le dépôt créerait donc un second document identique. Et `existe_doublon_note_frais` ne
 * sert pas ici : il EXCLUT la note courante, car il cherche les doublons ailleurs dans
 * l'entreprise. Avant chaque dépôt, on demande donc au serveur si cette note porte déjà un
 * document de cette empreinte ; si oui, le dépôt a déjà eu lieu — c'est un rejeu.
 */
import { detecterMimeReel, type MimeJustificatif } from "@/lib/expenses/files";

/** Plafond du bucket `notes-frais` (storage.buckets.file_size_limit = 15 728 640). */
export const TAILLE_MAX_JUSTIFICATIF = 15 * 1024 * 1024;

/** Types acceptés par la route de dépôt — repris à l'identique, pas réinventés. */
export const TYPES_DOCUMENT = [
  "facture", "ticket_caisse", "recu_paiement", "recu_carte_bancaire",
  "facture_electronique_originale", "autre_justificatif",
] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export type ControleFichier =
  | { valide: true; mime: MimeJustificatif }
  | { valide: false; motif: string };

/**
 * Contrôle un fichier AVANT de le conserver sur l'appareil.
 *
 * On applique les mêmes règles que le serveur — taille et type RÉEL lu dans les premiers
 * octets, jamais l'extension ni le type déclaré par le navigateur. Refuser tout de suite un
 * fichier que le serveur refusera évite le pire scénario : un salarié qui croit sa note
 * prête, et qui découvre au retour du réseau, loin du ticket, qu'elle ne partira jamais.
 */
export function controlerFichier(octets: Uint8Array, nom: string): ControleFichier {
  if (octets.length === 0) return { valide: false, motif: `« ${nom} » est vide.` };
  if (octets.length > TAILLE_MAX_JUSTIFICATIF) {
    const mo = (octets.length / 1024 / 1024).toFixed(1).replace(".", ",");
    return { valide: false, motif: `« ${nom} » pèse ${mo} Mo ; la limite est de 15 Mo.` };
  }
  const mime = detecterMimeReel(octets);
  if (!mime) {
    return { valide: false, motif: `Le contenu de « ${nom} » n’est pas un PDF, JPG, PNG, WebP ou HEIC accepté.` };
  }
  return { valide: true, mime };
}

/** Empreinte SHA-256 en hexadécimal, identique à celle que calcule le serveur. */
export async function empreinteSha256(octets: Uint8Array): Promise<string> {
  // Copie sur un `ArrayBuffer` ordinaire : `subtle.digest` refuse une vue dont le tampon
  // pourrait être partagé (`SharedArrayBuffer`), et le type d'un `Uint8Array` reçu en
  // paramètre ne garantit pas le contraire.
  const condensat = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(octets));
  return [...new Uint8Array(condensat)].map((o) => o.toString(16).padStart(2, "0")).join("");
}

// ── Étapes d'une note avec justificatif ────────────────────────────────────────

/**
 * Où en est une note préparée hors ligne.
 *
 * Ces étapes sont ce que l'utilisateur voit. Elles sont délibérément distinctes : « note
 * créée, fichier non parti » ne doit JAMAIS se confondre avec « transmise ».
 */
export const ETAPES = [
  "en_attente",          // rien n'est parti
  "envoi_justificatif",  // la note existe en brouillon, le fichier reste à déposer
  "synchronise",         // note ET fichiers acquittés
  "a_corriger",          // refus définitif sur le fichier (taille, type) : geste humain
  "conflit",             // la note n'accepte plus de fichier (validée, verrouillée)
  "annule",              // abandonné par l'utilisateur, fichiers effacés de l'appareil
] as const;
export type Etape = (typeof ETAPES)[number];

export const LIBELLES_ETAPE: Record<Etape, string> = {
  en_attente: "En attente d’envoi",
  envoi_justificatif: "Note créée — justificatif en cours d’envoi",
  synchronise: "Note et justificatif transmis",
  a_corriger: "Justificatif refusé — à corriger",
  conflit: "La note n’accepte plus de justificatif",
  annule: "Brouillon supprimé",
};

export type EtatFichier = { id: string; empreinte: string; depose: boolean };

/**
 * Étape résultant de l'état réel de la note et de ses fichiers.
 *
 * Une fonction et non un champ stocké : l'étape SE DÉDUIT de ce qui est vrai, elle ne se
 * déclare pas. Stocker « synchronisé » à part permettrait qu'il diverge de la réalité — un
 * fichier non déposé sous une note marquée synchronisée, précisément le défaut à fermer.
 */
export function etapeDeduite(
  noteCreee: boolean,
  fichiers: readonly EtatFichier[],
  refus: { fichier?: boolean; note?: boolean } = {},
): Etape {
  if (refus.note) return "conflit";
  if (refus.fichier) return "a_corriger";
  if (!noteCreee) return "en_attente";
  // Une note sans aucun fichier attaché n'est pas « synchronisée avec justificatif » : c'est
  // exactement le défaut que R3 décrit. Elle reste en envoi tant qu'aucun fichier n'est parti.
  if (fichiers.length === 0) return "envoi_justificatif";
  return fichiers.every((f) => f.depose) ? "synchronise" : "envoi_justificatif";
}

/** Fichiers qu'il reste à déposer, dans l'ordre de capture. */
export function fichiersADeposer(fichiers: readonly EtatFichier[]): EtatFichier[] {
  return fichiers.filter((f) => !f.depose);
}

/**
 * Classement d'une réponse de la route de dépôt existante.
 *
 * 200 → déposé. 409 → la note n'accepte plus de fichier (validée, verrouillée) : conflit,
 * jamais rejoué. 400 → le serveur refuse ce fichier (taille, type réel) : à corriger, jamais
 * rejoué en boucle — le même fichier serait refusé à l'identique. 401 → session expirée : on
 * attend, sans rien perdre. Tout le reste est transitoire.
 */
export function classerReponseDepot(statut: number): "depose" | "conflit" | "a_corriger" | "attente_session" | "transitoire" {
  if (statut >= 200 && statut < 300) return "depose";
  if (statut === 409) return "conflit";
  if (statut === 400 || statut === 413 || statut === 415) return "a_corriger";
  if (statut === 401) return "attente_session";
  return "transitoire";
}
