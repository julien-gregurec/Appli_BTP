/**
 * Documents « emportés » pour consultation hors ligne — règles PURES.
 *
 * Le salarié choisit, document par document, ce qu'il veut avoir sous la main sans réseau :
 * le plan du niveau où il travaille, la photo de la réservation. Rien n'est téléchargé à sa
 * place. Ce module ne sait rien du réseau ni d'IndexedDB : il décide, les autres exécutent.
 *
 * ── Pourquoi jamais de téléchargement automatique ───────────────────────────────────────
 *
 * Emporter « toute la GED » serait plus simple à coder et pire à tous égards : des centaines
 * de mégaoctets sur un forfait de chantier, des plans confidentiels copiés sur un téléphone
 * qui peut être perdu, et personne capable de dire ensuite ce qui dort sur l'appareil. Chaque
 * document présent hors ligne l'est parce que quelqu'un l'a demandé, et il le sait.
 *
 * ── Ce qui se passe au retour du réseau ─────────────────────────────────────────────────
 *
 * Chaque document emporté est revérifié. S'il a été supprimé, ou si l'accès a été retiré
 * (changement d'affectation, d'audience), sa copie locale est EFFACÉE et l'utilisateur en
 * est informé. Conserver une copie d'un document auquel on n'a plus droit reviendrait à
 * contourner la révocation par le simple fait d'avoir été hors ligne au bon moment.
 */

/** Plafond du bucket `chantier-documents` (storage.buckets.file_size_limit). */
export const TAILLE_MAX_DOCUMENT = 15 * 1024 * 1024;

/** Types consultables hors ligne : ceux que le navigateur sait afficher sans réseau. */
export const MIMES_CONSULTABLES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export type EtatDocument = "absent" | "telechargement" | "disponible" | "revoque" | "erreur";

export const LIBELLES_ETAT_DOCUMENT: Record<EtatDocument, string> = {
  absent: "Non emporté",
  telechargement: "Téléchargement…",
  disponible: "Disponible hors ligne",
  revoque: "Retiré ou plus accessible — copie effacée",
  erreur: "Téléchargement impossible",
};

export type Emportable = { valide: true } | { valide: false; motif: string };

/** Ce document peut-il être emporté ? Contrôle AVANT de consommer le forfait. */
export function peutEtreEmporte(mime: string, taille: number): Emportable {
  if (!(MIMES_CONSULTABLES as readonly string[]).includes(mime)) {
    return { valide: false, motif: "Ce type de document ne se consulte pas hors ligne." };
  }
  if (!Number.isFinite(taille) || taille <= 0) return { valide: false, motif: "Taille du document inconnue." };
  if (taille > TAILLE_MAX_DOCUMENT) return { valide: false, motif: "Document trop volumineux pour être emporté." };
  return { valide: true };
}

/** « 1,2 Mo », « 92 octets » : la taille ANNONCÉE avant le téléchargement. */
export function tailleAnnoncee(octets: number): string {
  if (octets < 1024) return `${octets} octet${octets > 1 ? "s" : ""}`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1).replace(".", ",")} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Issue de la revérification d'un document emporté, au retour du réseau.
 *
 * 404 et 403 signifient la même chose pour l'appareil : ce document n'est plus à lui. La copie
 * doit partir. Une panne (5xx, coupure) ne dit RIEN de l'accès : on garde la copie et on
 * revérifiera — effacer sur une panne ferait perdre au salarié son plan dans le sous-sol pour
 * une raison qui n'a rien à voir avec ses droits.
 */
export function issueRevalidation(statut: number): "conserver" | "revoquer" | "reessayer" {
  if (statut >= 200 && statut < 400) return "conserver";
  if (statut === 403 || statut === 404) return "revoquer";
  if (statut === 401) return "reessayer";
  return "reessayer";
}
