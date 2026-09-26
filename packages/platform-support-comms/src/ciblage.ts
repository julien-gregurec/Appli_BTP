/**
 * Ciblage d'une communication (§10).
 *
 * ATTENTION — écart documenté entre la demande et le modèle réel.
 *
 * La demande liste douze « postes/rôles ». Le modèle ELSATIA n'en connaît pas douze :
 *   * Gestion Pro n'a PAS de rôles fixes. Une entreprise crée ses `postes` (nom libre)
 *     et leur attribue des `permissions_poste`. Les neuf `modeles_roles_predefinis`
 *     (ouvrier, chef_equipe, chef_chantier, conducteur_travaux, directeur_travaux,
 *     administration, rh, comptable, gerant) ne sont que des MODÈLES de départ : une
 *     entreprise peut les renommer, les supprimer, ou n'en utiliser aucun.
 *   * Colors et Réserves ont, eux, des rôles applicatifs fixes
 *     (`roles_applications_elsatia`).
 *
 * Conséquence de conception : cibler par « nom de poste » serait faux (le nom est
 * libre). Le ciblage s'appuie donc sur trois critères combinables et vérifiables :
 *   1. `modelesPostes` — le modèle prédéfini dont le poste dérive, quand il est connu ;
 *   2. `permissions` — une clé de `permissions_disponibles`, qui est la seule notion
 *      réellement stable côté Gestion Pro ;
 *   3. `rolesApplicatifs` — les rôles fixes de Colors / Réserves / applications futures.
 *
 * Correspondance demandée → réelle :
 *   propriétaire            → modèle `gerant`
 *   administrateur          → permission `gerer_utilisateurs`
 *   administratif           → modèle `administration`
 *   conducteur de travaux   → modèle `conducteur_travaux`
 *   chef de chantier        → modèle `chef_chantier`
 *   chef d’équipe           → modèle `chef_equipe`
 *   salarié terrain         → modèle `ouvrier`
 *   RH                      → modèle `rh`
 *   comptabilité            → modèle `comptable`
 *   gestionnaire de stock   → ÉCART : aucun modèle GP. Ciblé par permission
 *                             `gerer_stock`, et par le rôle Colors
 *                             `colors_gestionnaire_stock`.
 *   responsable matériel    → ÉCART : aucun modèle GP. Ciblé par permissions
 *                             `gerer_outillage` / `gerer_flotte`.
 *   utilisateur personnalisé → ciblage libre par permission ou rôle applicatif.
 */

export type CleRoleDemande =
  | "proprietaire"
  | "administrateur"
  | "administratif"
  | "conducteur_travaux"
  | "chef_chantier"
  | "chef_equipe"
  | "salarie_terrain"
  | "rh"
  | "comptabilite"
  | "gestionnaire_stock"
  | "responsable_materiel";

export type CorrespondanceRole = {
  cle: CleRoleDemande;
  libelle: string;
  modelesPostes: readonly string[];
  permissions: readonly string[];
  rolesApplicatifs: readonly string[];
  /** Renseigné quand aucun modèle de poste Gestion Pro ne correspond. */
  ecart: string | null;
};

export const CORRESPONDANCES_ROLES: readonly CorrespondanceRole[] = [
  { cle: "proprietaire", libelle: "Propriétaire / gérant", modelesPostes: ["gerant"], permissions: [], rolesApplicatifs: ["colors_admin_organisation", "reserves_admin_organisation"], ecart: null },
  { cle: "administrateur", libelle: "Administrateur", modelesPostes: ["gerant", "administration"], permissions: ["gerer_utilisateurs"], rolesApplicatifs: ["colors_admin_organisation", "reserves_admin_organisation"], ecart: null },
  { cle: "administratif", libelle: "Administratif", modelesPostes: ["administration"], permissions: ["acces_parametres"], rolesApplicatifs: [], ecart: null },
  { cle: "conducteur_travaux", libelle: "Conducteur de travaux", modelesPostes: ["conducteur_travaux", "directeur_travaux"], permissions: ["gerer_chantiers"], rolesApplicatifs: ["reserves_responsable"], ecart: null },
  { cle: "chef_chantier", libelle: "Chef de chantier", modelesPostes: ["chef_chantier"], permissions: ["gerer_planning"], rolesApplicatifs: ["reserves_emetteur"], ecart: null },
  { cle: "chef_equipe", libelle: "Chef d’équipe", modelesPostes: ["chef_equipe"], permissions: [], rolesApplicatifs: [], ecart: null },
  { cle: "salarie_terrain", libelle: "Salarié terrain", modelesPostes: ["ouvrier"], permissions: ["saisir_son_pointage"], rolesApplicatifs: ["colors_utilisateur_depot", "reserves_intervenant"], ecart: null },
  { cle: "rh", libelle: "RH", modelesPostes: ["rh"], permissions: ["gerer_employes"], rolesApplicatifs: [], ecart: null },
  { cle: "comptabilite", libelle: "Comptabilité", modelesPostes: ["comptable"], permissions: ["gerer_factures"], rolesApplicatifs: [], ecart: null },
  {
    cle: "gestionnaire_stock",
    libelle: "Gestionnaire de stock",
    modelesPostes: [],
    permissions: ["gerer_stock"],
    rolesApplicatifs: ["colors_gestionnaire_stock"],
    ecart: "Aucun modèle de poste Gestion Pro : ciblage par la permission `gerer_stock` et le rôle Colors.",
  },
  {
    cle: "responsable_materiel",
    libelle: "Responsable matériel",
    modelesPostes: [],
    permissions: ["gerer_outillage", "gerer_flotte"],
    rolesApplicatifs: [],
    ecart: "Aucun modèle de poste Gestion Pro : ciblage par les permissions outillage / flotte.",
  },
];

export function correspondanceRole(cle: string): CorrespondanceRole | null {
  return CORRESPONDANCES_ROLES.find((c) => c.cle === cle) ?? null;
}

export function ecartsRolesDocumentes(): CorrespondanceRole[] {
  return CORRESPONDANCES_ROLES.filter((c) => c.ecart !== null);
}

// ── Audience ──────────────────────────────────────────────────────────────────

export type SegmentAbonnement = "pilote" | "essai" | "actif" | "expire";

export type Audience = {
  /** `null` = toutes les applications du catalogue actif. */
  applications: readonly string[] | null;
  /** `null` = toutes les entreprises. */
  entreprises: readonly string[] | null;
  /** `null` = tous les segments. */
  segments: readonly SegmentAbonnement[] | null;
  /** `null` = tous les postes/rôles. */
  roles: readonly CleRoleDemande[] | null;
  /** Ciblage libre additionnel, cumulé en OU avec `roles`. */
  permissions?: readonly string[];
  rolesApplicatifs?: readonly string[];
};

export type Lecteur = {
  utilisateurId: string;
  entrepriseId: string | null;
  applicationCode: string;
  segment: SegmentAbonnement | null;
  /**
   * Modèle de poste d'origine, `null` si le poste ne correspond à aucun modèle connu.
   *
   * Gestion Pro ne stocke pas ce lien : l'appelant le déduit du nom du poste, que
   * l'entreprise peut renommer. Ce critère est donc une heuristique — d'où l'existence
   * du critère `permissions`, qui, lui, reste exact après un renommage.
   */
  modelePoste: string | null;
  permissions: readonly string[];
  rolesApplicatifs: readonly string[];
};

export type ResultatCiblage =
  | { cible: true }
  | { cible: false; raison: RaisonHorsCible };

export type RaisonHorsCible =
  | "application_non_ciblee"
  | "entreprise_non_ciblee"
  | "segment_non_cible"
  | "role_non_cible";

/**
 * Un message destiné aux responsables de chantier ne doit pas s'afficher à tous les
 * salariés : c'est exactement le cas que cette fonction verrouille. Un lecteur est
 * ciblé s'il satisfait TOUS les critères renseignés (ET entre critères), et pour le
 * critère « rôle », l'un au moins des trois chemins (modèle, permission, rôle
 * applicatif) doit correspondre (OU à l'intérieur du critère).
 */
export function evaluerCiblage(audience: Audience, lecteur: Lecteur): ResultatCiblage {
  if (audience.applications !== null && !audience.applications.includes(lecteur.applicationCode)) {
    return { cible: false, raison: "application_non_ciblee" };
  }
  if (audience.entreprises !== null) {
    if (lecteur.entrepriseId === null || !audience.entreprises.includes(lecteur.entrepriseId)) {
      return { cible: false, raison: "entreprise_non_ciblee" };
    }
  }
  if (audience.segments !== null) {
    if (lecteur.segment === null || !audience.segments.includes(lecteur.segment)) {
      return { cible: false, raison: "segment_non_cible" };
    }
  }

  const rolesDemandes = audience.roles;
  const permissionsLibres = audience.permissions ?? [];
  const rolesApplicatifsLibres = audience.rolesApplicatifs ?? [];
  const cibleParRole = rolesDemandes === null && permissionsLibres.length === 0 && rolesApplicatifsLibres.length === 0;
  if (cibleParRole) return { cible: true };

  const modeles = new Set<string>();
  const permissions = new Set<string>(permissionsLibres);
  const rolesApplicatifs = new Set<string>(rolesApplicatifsLibres);
  for (const cle of rolesDemandes ?? []) {
    const correspondance = correspondanceRole(cle);
    if (!correspondance) continue;
    correspondance.modelesPostes.forEach((m) => modeles.add(m));
    correspondance.permissions.forEach((p) => permissions.add(p));
    correspondance.rolesApplicatifs.forEach((r) => rolesApplicatifs.add(r));
  }

  const parModele = lecteur.modelePoste !== null && modeles.has(lecteur.modelePoste);
  const parPermission = lecteur.permissions.some((p) => permissions.has(p));
  const parRoleApplicatif = lecteur.rolesApplicatifs.some((r) => rolesApplicatifs.has(r));
  if (parModele || parPermission || parRoleApplicatif) return { cible: true };
  return { cible: false, raison: "role_non_cible" };
}

/**
 * Une audience ne franchit jamais la frontière d'un tenant : les statistiques d'une
 * entreprise ne sont lisibles que par la plateforme, jamais par une autre entreprise.
 * Cette fonction sert de garde côté serveur avant de renvoyer un agrégat.
 */
export function statistiquesLisiblesPar(entree: {
  demandeurEstPlateforme: boolean;
  entrepriseDemandeur: string | null;
  entrepriseCible: string | null;
}): boolean {
  if (entree.demandeurEstPlateforme) return true;
  if (entree.entrepriseCible === null) return false;
  return entree.entrepriseDemandeur === entree.entrepriseCible;
}
