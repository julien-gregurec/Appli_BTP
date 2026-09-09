import "server-only";
import type { FournisseurOcrColors } from "@/lib/ocr-colors";
import { decisionOcr, VARIABLE_OCR_ACTIF, VARIABLE_OCR_FOURNISSEUR, type EtatOcrColors } from "@/lib/ocr/politique";

/**
 * Registre des prestataires de lecture d'étiquette.
 *
 * **Il est vide, et c'est le livrable.** Aucun prestataire n'est implémenté
 * dans cette version parce qu'aucun n'est contractualisé : brancher un service
 * tiers sans contrat de sous-traitance, sans base légale et sans information
 * des personnes ferait porter à ELSATIA un transfert de données non couvert,
 * pour une fonctionnalité de confort.
 *
 * Ajouter un prestataire consiste à ajouter une entrée ici. Deux exigences
 * s'imposent alors, et ce fichier est l'endroit où elles se vérifient :
 *
 *  1. la clé d'accès se lit dans une variable serveur — jamais `NEXT_PUBLIC_`,
 *     jamais transmise au navigateur, jamais journalisée ;
 *  2. l'implémentation ne reçoit que les octets de l'image et son type, et ne
 *     doit joindre ni identifiant d'organisation, ni identifiant de seau, ni
 *     nom de fichier : le prestataire n'a besoin de rien de cela pour lire une
 *     étiquette, et le lui envoyer élargirait le transfert sans nécessité.
 *
 * Tant que ce registre est vide, `COLORS_OCR_ACTIF=oui` ne peut pas activer
 * quoi que ce soit : la décision retombe sur `fournisseur_inconnu`, l'API
 * refuse, et aucune image n'est lue.
 */
export const FOURNISSEURS_OCR: Readonly<Record<string, () => FournisseurOcrColors>> = Object.freeze({});

export function fournisseursConnus(): readonly string[] {
  return Object.keys(FOURNISSEURS_OCR);
}

/** État de l'OCR pour cette installation, lu sur l'environnement serveur. */
/** Vue minimale de l'environnement : seules deux variables sont lues. */
export type EnvironnementOcr = Partial<Record<string, string | undefined>>;

export function etatOcrColors(env: EnvironnementOcr = process.env): EtatOcrColors {
  return decisionOcr({
    actif: env[VARIABLE_OCR_ACTIF],
    fournisseur: env[VARIABLE_OCR_FOURNISSEUR],
    fournisseursConnus: fournisseursConnus(),
  });
}

/**
 * Prestataire à employer, ou `null`.
 *
 * `etatOcrColors` a déjà vérifié que l'identifiant figure au registre ; ce
 * second contrôle n'est pas redondant mais défensif : il garantit qu'aucun
 * appelant ne peut obtenir un prestataire en court-circuitant la décision.
 */
export function fournisseurOcrActif(env: EnvironnementOcr = process.env): FournisseurOcrColors | null {
  const etat = etatOcrColors(env);
  if (!etat.actif) return null;
  const fabrique = FOURNISSEURS_OCR[etat.fournisseur];
  return fabrique ? fabrique() : null;
}
