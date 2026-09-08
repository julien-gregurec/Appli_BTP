/**
 * Le catalogue d'applications est la seule source de vérité. Ce module ne contient
 * volontairement AUCUNE liste fermée d'applications : ajouter « drone » ou toute
 * application future au catalogue doit suffire, sans modification de code ici.
 *
 * Miroir de `public.applications_elsatia` (migration 00234) augmenté de la colonne
 * `portee_donnees` proposée par ce lot.
 */

/** Une application dont les données appartiennent à une entreprise, ou à un compte. */
export type PorteeDonneesApplication = "entreprise" | "compte";

export type ApplicationCatalogue = {
  code: string;
  nom: string;
  actif: boolean;
  /**
   * `entreprise` : les données sont rattachées à un tenant, une session d'assistance
   * peut donc les viser. `compte` : les données appartiennent à une personne (Tools et
   * ses `tools_projects`), aucune entreprise ne peut être « assistée » sur cette
   * application — voir `applicationsAssistables`.
   */
  portee: PorteeDonneesApplication;
};

/** Format canonique d'un code application, aligné sur la contrainte SQL du catalogue. */
export const MOTIF_CODE_APPLICATION = /^[a-z][a-z0-9_]{1,49}$/;

export function estCodeApplication(valeur: unknown): valeur is string {
  return typeof valeur === "string" && MOTIF_CODE_APPLICATION.test(valeur);
}

/**
 * Applications qu'une session d'assistance peut viser : actives ET rattachées à une
 * entreprise. Une application « compte » est exclue par construction, pas par une
 * exception codée sur son nom.
 */
export function applicationsAssistables(
  catalogue: readonly ApplicationCatalogue[],
): ApplicationCatalogue[] {
  return catalogue.filter((a) => a.actif && a.portee === "entreprise");
}

/**
 * Applications qu'une communication peut cibler : toutes les applications actives,
 * y compris celles à portée « compte » (un message produit destiné aux utilisateurs
 * de Tools est légitime, alors qu'une session d'assistance sur Tools ne l'est pas).
 */
export function applicationsCiblables(
  catalogue: readonly ApplicationCatalogue[],
): ApplicationCatalogue[] {
  return catalogue.filter((a) => a.actif);
}

export function trouverApplication(
  catalogue: readonly ApplicationCatalogue[],
  code: string,
): ApplicationCatalogue | null {
  return catalogue.find((a) => a.code === code) ?? null;
}
