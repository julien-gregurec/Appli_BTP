/**
 * Habilitations de l'annuaire plateforme.
 *
 * Le rôle et la force d'authentification font autorité EN BASE : chaque RPC
 * d'écriture rappelle `plateforme_exiger_role` et `plateforme_exiger_session_aal2`.
 * Ce module ne fait que relire ces prédicats pour décider quelles commandes
 * afficher — masquer un bouton n'a jamais protégé une donnée, et une commande
 * affichée par erreur est refusée par la base (§17, « Ne pas coder les
 * permissions uniquement dans React »).
 */

import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export type RolePlateforme = "total" | "support" | "facturation" | "lecture";

export const ROLES_PLATEFORME_LIBELLES: Record<RolePlateforme, string> = {
  total: "Accès total",
  support: "Support",
  facturation: "Facturation",
  lecture: "Lecture seule",
};

export type HabilitationsAnnuaire = {
  role: RolePlateforme | null;
  /** Le rôle « propriétaire global » n'est pas un rôle distinct : c'est `total`. */
  peutConsulter: boolean;
  peutVoirFacturation: boolean;
  /** Remise : rôle habilité ET session en authentification forte (AAL2). */
  peutGererRemises: boolean;
  peutOuvrirAssistance: boolean;
  peutExporter: boolean;
  peutIntervenirTenant: boolean;
  /** Vrai quand le rôle ne permet aucune écriture : l'écran passe en lecture seule. */
  lectureSeule: boolean;
  /** Session authentifiée en AAL2 — conditionne les actions sensibles. */
  sessionForte: boolean;
  /** Mode démonstration local : toutes les commandes sensibles sont fermées. */
  modeDemonstration: boolean;
};

/**
 * Le rôle « commercial » demandé au §17 n'existe pas dans le modèle déployé :
 * `plateforme_admins.role` n'accepte que total / support / facturation /
 * lecture. Aucun rôle n'est inventé côté écran ; le besoin est consigné dans
 * la proposition SQL.
 */
export const ROLES_DEMANDES_NON_MODELISES = ["commercial"] as const;

const AUCUNE_HABILITATION: HabilitationsAnnuaire = {
  role: null,
  peutConsulter: false,
  peutVoirFacturation: false,
  peutGererRemises: false,
  peutOuvrirAssistance: false,
  peutExporter: false,
  peutIntervenirTenant: false,
  lectureSeule: true,
  sessionForte: false,
  modeDemonstration: false,
};

function estRolePlateforme(valeur: unknown): valeur is RolePlateforme {
  return valeur === "total" || valeur === "support" || valeur === "facturation" || valeur === "lecture";
}

/**
 * Dérive les habilitations d'écran à partir du rôle et de la force de session.
 * Fonction pure : c'est elle qui est testée, l'appel réseau est trivial.
 */
export function habilitationsDepuisRole(
  role: RolePlateforme | null,
  sessionForte: boolean,
  modeDemonstration = false,
): HabilitationsAnnuaire {
  if (!role) return { ...AUCUNE_HABILITATION, modeDemonstration };

  // Reflet exact de `plateforme_a_permission` (migration 20260816000202).
  const facturation = role === "total" || role === "facturation";
  const support = role === "total" || role === "support";

  return {
    role,
    peutConsulter: true,
    // `lecture` et `support` n'ont pas `consulter_facturation` : les colonnes
    // et onglets de paiement leur sont retirés, à l'écran comme à l'export.
    peutVoirFacturation: facturation,
    // Une remise engage un montant : rôle habilité ET session AAL2, comme
    // l'exige `plateforme_autoriser_effet_externe('remise_abonnement')`.
    peutGererRemises: facturation && sessionForte && !modeDemonstration,
    peutOuvrirAssistance: support && sessionForte && !modeDemonstration,
    // L'export sort des données clients de la plateforme : il suit la
    // facturation et le support, jamais la lecture seule.
    peutExporter: (facturation || support) && !modeDemonstration,
    peutIntervenirTenant: support && sessionForte && !modeDemonstration,
    lectureSeule: role === "lecture",
    sessionForte,
    modeDemonstration,
  };
}

/** Lit le rôle et la force de session courants. Jamais l'e-mail comme preuve. */
export async function chargerHabilitationsAnnuaire(): Promise<HabilitationsAnnuaire> {
  if (isEmailLoginDisabled()) {
    // Démonstration locale mono-entreprise : la consultation est ouverte comme
    // elle l'était sur l'ancien tableau de bord, mais tout ce qui engage un
    // montant, une intervention chez un client ou une extraction de données
    // reste fermé — ces gestes exigent une identité authentifiée réelle.
    return habilitationsDepuisRole("total", false, true);
  }

  const supabase = await createClient();
  const [{ data: role }, { data: forte }] = await Promise.all([
    supabase.rpc("plateforme_role_courant"),
    supabase.rpc("plateforme_ecriture_autorisee", { p_roles: ["total", "support", "facturation", "lecture"] }),
  ]);

  if (!estRolePlateforme(role)) return AUCUNE_HABILITATION;
  return habilitationsDepuisRole(role, forte === true, false);
}
