import { BRAND_NAME } from "@/lib/brand";

/**
 * Message de quota « personnes actives » — ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-
 * CAPACITY-FIX-V1 (P0-2 / §7).
 *
 * Le plafond lui-même n'est PAS modifié : il reste porté par le trigger
 * `trg_capacite_personnes_actives` (migration 20260903000256), garde-fou
 * infranchissable qui couvre tous les chemins d'écriture. Pendant l'essai, une
 * entreprise sans `abonnement_offre` est normalisée vers l'offre d'entrée par
 * `capacite_personnes_base` : sa capacité de base vaut donc 3 personnes.
 *
 * Ce qui est corrigé ici, c'est le message : il ne doit proposer QUE des actions
 * réellement possibles. Sous `ABONNEMENTS_PUBLICS_OUVERTS=false`, « changez
 * d'offre » et « ajoutez de la capacité » ne mènent nulle part — le seul chemin
 * réel est d'archiver une personne ou de contacter ELSATIA.
 */

export type ContexteQuotaPersonnes = {
  /** Offre souscrite (`null` pendant l'essai). */
  abonnementOffre?: string | null;
  /** `ABONNEMENTS_PUBLICS_OUVERTS` : la souscription en ligne est-elle ouverte ? */
  abonnementsOuverts: boolean;
  /**
   * L'entreprise peut-elle réellement ajouter de la capacité en libre-service
   * (abonnement Stripe actif, offre commercialisée, périodicité mensuelle) ?
   */
  capaciteAutogerable?: boolean;
  /** URL de contact commercial réellement configurée. */
  urlContact: string;
};

export type ActionQuota = { libelle: string; href?: string };

const ACTION_ARCHIVER: ActionQuota = {
  libelle:
    "Archiver une personne : un salarié sorti ou un compte fermé ne compte plus et libère une place",
  href: "/employes",
};

/**
 * Actions réellement disponibles, dans l'ordre où les proposer. Ne contient
 * jamais une action désactivée par la configuration de commercialisation.
 */
export function actionsQuotaPersonnes(contexte: ContexteQuotaPersonnes): ActionQuota[] {
  const actions: ActionQuota[] = [ACTION_ARCHIVER];

  if (contexte.capaciteAutogerable) {
    actions.push({ libelle: "Ajouter de la capacité depuis votre abonnement", href: "/abonnement#capacite" });
  }
  if (contexte.abonnementsOuverts) {
    actions.push({
      libelle: contexte.abonnementOffre ? "Changer d’offre" : "Choisir une offre",
      href: "/abonnement#choisir-offre",
    });
  }
  // Chemin toujours disponible, y compris commercialisation fermée : c'est le
  // seul moyen honnête d'augmenter la capacité tant que la souscription en
  // ligne n'est pas ouverte.
  if (!contexte.capaciteAutogerable || !contexte.abonnementsOuverts) {
    actions.push({ libelle: `Contacter ${BRAND_NAME} pour augmenter la capacité`, href: contexte.urlContact });
  }
  return actions;
}

function joindre(libelles: string[]): string {
  if (libelles.length === 0) return "";
  if (libelles.length === 1) return libelles[0];
  return `${libelles.slice(0, -1).join(", ")} ou ${libelles[libelles.length - 1]}`;
}

function phraseActions(contexte: ContexteQuotaPersonnes): string {
  return joindre(actionsQuotaPersonnes(contexte).map((action) => minuscule(action.libelle)));
}

/** Actions hors archivage, quand l'archivage est déjà formulé à part (dépassement). */
function phraseActionsSansArchivage(contexte: ContexteQuotaPersonnes): string {
  const autres = actionsQuotaPersonnes(contexte)
    .filter((action) => action.libelle !== ACTION_ARCHIVER.libelle)
    .map((action) => minuscule(action.libelle));
  return joindre(autres);
}

function minuscule(libelle: string): string {
  return libelle.charAt(0).toLowerCase() + libelle.slice(1);
}

/** Message « limite atteinte », sans jamais proposer une action impossible. */
export function messageLimiteAtteinte(contexte: ContexteQuotaPersonnes): string {
  const cadre = contexte.abonnementOffre
    ? "Votre abonnement autorise un nombre limité de personnes actives et cette limite est atteinte."
    : "La limite de personnes actives de votre essai est atteinte.";
  return `${cadre} Pour en enregistrer une de plus : ${phraseActions(contexte)}. Aucune donnée n’est supprimée.`;
}

/** Message « dépassement » (capacité réduite après coup), mêmes garanties. */
export function messageDepassementCapacite(
  contexte: ContexteQuotaPersonnes,
  compteurs: { actives: number; totale: number },
): string {
  const aArchiver = Math.max(1, compteurs.actives - compteurs.totale);
  const cadre = contexte.abonnementOffre ? "Votre abonnement autorise" : "Votre essai autorise";
  const autres = phraseActionsSansArchivage(contexte);
  return (
    `${cadre} ${compteurs.totale} personnes actives et vous en avez actuellement ${compteurs.actives}. ` +
    `Aucune nouvelle personne ne peut être activée tant que ce dépassement dure : archivez ${aArchiver} personne(s)` +
    `${autres ? ` ou ${autres}` : ""}. Aucune donnée n’est supprimée.`
  );
}

/** Message d'import en lot refusé faute de places, mêmes garanties. */
export function messageImportCapacite(
  contexte: ContexteQuotaPersonnes,
  compteurs: { totale: number; actives: number; restant: number; demandees: number },
): string {
  return (
    `Import annulé : votre ${contexte.abonnementOffre ? "abonnement" : "essai"} autorise ${compteurs.totale} personnes actives ` +
    `(${compteurs.actives} déjà enregistrées, ${compteurs.restant} place(s) disponible(s)) et le fichier contient ` +
    `${compteurs.demandees} personne(s) à créer. Réduisez le fichier, ${phraseActions(contexte)}, puis réessayez.`
  );
}
