import { MIME_ANALYSABLES_IA } from "@/lib/ai/documents";
import type { MessageChat } from "@/lib/ai/assistant";

// Limites dediees a la route assistant IA : ne pas reutiliser le plafond generique
// TAILLE_MAX_REQUETE (64 Ko, src/app/api/assistant/chat/route.ts) qui ne laisse pas la
// place a une piece jointe encodee en base64 (jusqu'a 6 Mo reels une fois decodee).
export const NOMBRE_MAX_MESSAGES = 30;
export const TAILLE_MAX_TEXTE_MESSAGE = 4_000; // caracteres, par message de l'historique
export const TAILLE_MAX_PIECE_JOINTE_BASE64 = 8_000_000; // caracteres, filtre rapide avant decodage
export const TAILLE_MAX_PIECE_JOINTE_OCTETS = 6_000_000; // octets reels une fois decodee (~6 Mo)

// Corps HTTP total accepte par la route : assez pour NOMBRE_MAX_MESSAGES messages de texte
// (NOMBRE_MAX_MESSAGES * TAILLE_MAX_TEXTE_MESSAGE) plus une seule piece jointe encodee,
// plus une marge pour la structure JSON (cles, guillemets, mimeType). Volontairement
// specifique a cette route : ne pas propager cette valeur aux autres routes JSON.
export const TAILLE_MAX_CORPS_ASSISTANT =
  NOMBRE_MAX_MESSAGES * TAILLE_MAX_TEXTE_MESSAGE + TAILLE_MAX_PIECE_JOINTE_BASE64 + 20_000;

// Validite verifiee par aller-retour decodage/reencodage plutot que par expression
// reguliere : sur une chaine de plusieurs megaoctets, un motif regex avec groupe repete
// peut depasser la profondeur de pile du moteur JS (constate en test). Le decodeur base64
// de Node ignore silencieusement les caracteres hors alphabet ; reencoder le resultat et
// comparer a l'original detecte donc fiablement toute chaine mal formee, en temps lineaire.
export function estBase64Valide(valeur: string): boolean {
  if (valeur.length === 0 || valeur.length % 4 !== 0) return false;
  const decode = Buffer.from(valeur, "base64");
  return decode.toString("base64") === valeur;
}

export type ResultatValidationAssistant = { ok: true } | { ok: false; message: string; statut: number };

// Validation metier apres parsing JSON : nombre de messages, longueur du texte, piece
// jointe (une seule, uniquement sur le dernier message, type MIME, base64 valide et taille
// decodee reelle). Volontairement une seule fonction pure et testable, appelee par la route.
export function validerRequeteAssistant(historique: unknown): ResultatValidationAssistant {
  if (!Array.isArray(historique) || historique.length === 0) {
    return { ok: false, message: "Écris une question.", statut: 400 };
  }
  if (historique.length > NOMBRE_MAX_MESSAGES) {
    return { ok: false, message: "Conversation trop longue, démarre une nouvelle discussion.", statut: 400 };
  }

  const messages = historique as Partial<MessageChat>[];
  for (const message of messages) {
    if (typeof message?.contenu === "string" && message.contenu.length > TAILLE_MAX_TEXTE_MESSAGE) {
      return { ok: false, message: "Message trop long, raccourcis ta demande.", statut: 400 };
    }
  }

  const dernierMessage = messages.at(-1);
  if (!dernierMessage || dernierMessage.role !== "user" || !dernierMessage.contenu?.trim()) {
    return { ok: false, message: "Écris une question.", statut: 400 };
  }

  // Une seule piece jointe possible : uniquement sur le dernier message. Un historique
  // avec plusieurs fichiers (message plus ancien re-souffle avec un fichier) est refuse
  // plutot que silencieusement ignore, pour ne jamais laisser passer un corps gonfle par
  // plusieurs pieces jointes.
  for (const message of messages.slice(0, -1)) {
    if (message?.fichier) {
      return { ok: false, message: "Une seule pièce jointe est autorisée, sur le dernier message uniquement.", statut: 400 };
    }
  }

  const fichier = dernierMessage.fichier;
  if (fichier) {
    if (!fichier.mimeType || !MIME_ANALYSABLES_IA.includes(fichier.mimeType)) {
      return { ok: false, message: "Format de pièce jointe non pris en charge (images JPEG/PNG/GIF/WebP ou PDF).", statut: 400 };
    }
    if (typeof fichier.base64 !== "string" || fichier.base64.length > TAILLE_MAX_PIECE_JOINTE_BASE64) {
      return { ok: false, message: "La pièce jointe dépasse la taille maximale autorisée de 6 Mo.", statut: 400 };
    }
    if (!estBase64Valide(fichier.base64)) {
      return { ok: false, message: "Pièce jointe illisible, réessaie avec un autre fichier.", statut: 400 };
    }
    const octetsReels = Buffer.byteLength(fichier.base64, "base64");
    if (octetsReels > TAILLE_MAX_PIECE_JOINTE_OCTETS) {
      return { ok: false, message: "La pièce jointe dépasse la taille maximale autorisée de 6 Mo.", statut: 400 };
    }
  }

  return { ok: true };
}
