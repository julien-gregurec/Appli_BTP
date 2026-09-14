/**
 * Espace de noms du stockage local, indexé sur l'identité.
 *
 * Toute donnée écrite sur l'appareil par Gestion Pro passe par une clé construite ici.
 * La raison est simple et vaut d'être dite : un téléphone de chantier est PARTAGÉ. Le
 * conducteur de travaux se connecte le matin, le chef d'équipe l'après-midi ; une tablette
 * de dépôt sert à trois entreprises sous-traitantes différentes dans la semaine.
 *
 * Une clé de stockage qui ne porte pas l'identité mélange donc les données de deux personnes
 * — au mieux un brouillon qui réapparaît chez le suivant, au pire une note de frais envoyée
 * sous le mauvais nom. L'identité n'est pas un préfixe décoratif : c'est la frontière.
 */

/** Préfixe historique, antérieur au renommage ELSATIA. Conservé pour la purge seulement. */
const PREFIXE_HISTORIQUE = "liria";
const PREFIXE = "elsatia";
const APPLICATION = "gp";

export type IdentiteLocale = { entrepriseId: string; utilisateurId: string };

/** Vrai identifiant, ou rien. On refuse de fabriquer une clé sur une identité incomplète. */
export function identiteValide(identite: Partial<IdentiteLocale> | null | undefined): identite is IdentiteLocale {
  return Boolean(identite?.entrepriseId && identite?.utilisateurId);
}

/**
 * Clé de stockage pour un usage donné.
 *
 * Renvoie `null` — plutôt que de lever, ou de retomber sur une clé « anonyme » — quand
 * l'identité manque. Une clé anonyme serait partagée par tous les comptes de l'appareil,
 * c'est-à-dire exactement le défaut que ce module existe pour empêcher. L'appelant doit
 * traiter l'absence de clé comme « on n'écrit rien », jamais comme « on écrit ailleurs ».
 */
export function cleLocale(identite: Partial<IdentiteLocale> | null | undefined, usage: string): string | null {
  if (!identiteValide(identite)) return null;
  return `${PREFIXE}:${APPLICATION}:${identite.entrepriseId}:${identite.utilisateurId}:${usage}`;
}

/** Préfixe de toutes les clés d'une identité — sert à purger cette identité et elle seule. */
export function prefixeIdentite(identite: IdentiteLocale): string {
  return `${PREFIXE}:${APPLICATION}:${identite.entrepriseId}:${identite.utilisateurId}:`;
}

/**
 * Ce qui appartient à Gestion Pro dans un stockage clé/valeur.
 *
 * Sert à la purge de déconnexion. On ne balaie JAMAIS tout le stockage : la même origine
 * héberge d'autres applications ELSATIA, et effacer leurs clés ferait perdre à l'utilisateur
 * un travail qui n'a rien à voir avec la session qu'il vient de fermer.
 */
export function estCleGestionPro(cle: string): boolean {
  return cle.startsWith(`${PREFIXE}:${APPLICATION}:`)
    || cle.startsWith(`${PREFIXE}-dashboard-`)
    || cle.startsWith(`${PREFIXE_HISTORIQUE}-dashboard-`);
}
