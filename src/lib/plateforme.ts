import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { OFFRES_TARIFAIRES, offreTarifaireParCle, type OffreTarifaire } from "@/lib/tarification";

// L'espace plateforme est réservé à une identité active reliée par auth.uid() à
// plateforme_admins.utilisateur_id. L'email n'est jamais une preuve d'autorisation.
// En mode prototype (sans connexion), on l'autorise pour la démo mono-entreprise.
export async function estPlateformeAdmin(): Promise<boolean> {
  if (isEmailLoginDisabled()) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc("est_plateforme_admin");
  return data === true;
}

// Statuts possibles d'une identité dans plateforme_admins (migrations 236/237).
export const STATUTS_IDENTITE_PLATEFORME = ["en_attente", "rattachee_non_confirmee", "active", "revoquee"] as const;
export type StatutIdentitePlateforme = (typeof STATUTS_IDENTITE_PLATEFORME)[number];

export const STATUT_IDENTITE_LABEL: Record<StatutIdentitePlateforme, string> = {
  en_attente: "En attente (compte à créer)",
  rattachee_non_confirmee: "En attente de confirmation",
  active: "Actif",
  revoquee: "Révoqué",
};

// « Équipe plateforme » : quelles actions afficher pour une ligne d'administrateur.
// L'autorité reste le serveur — plateforme_retirer_admin compare auth.uid() et
// refuse l'auto-révocation, un compte déjà révoqué et le dernier administrateur
// total (gardes AAL2 incluses). Cette fonction ne fait que masquer les boutons
// qui ne mèneraient à rien, pour lever l'incohérence d'affichage.
//
// plateforme_lister_admins() n'expose pas utilisateur_id (l'ajouter imposerait une
// migration, hors périmètre) : la reconnaissance du compte courant se fait donc sur
// l'email. C'est la clé primaire de plateforme_admins, toujours normalisée
// (lower(trim())) par les RPC d'écriture — un identifiant stable, pas une heuristique.
export type LigneAdminPlateforme = {
  email: string;
  actif: boolean | null;
  statut_identite: string | null;
};

export function actionsLigneAdminPlateforme(
  ligne: LigneAdminPlateforme,
  emailCourantNormalise: string | null,
): {
  estUtilisateurCourant: boolean;
  estRevoque: boolean;
  peutAfficherRetrait: boolean;
  retraitIndisponible: boolean;
} {
  // Sans identité de session vérifiée, on ne peut pas garantir qu'une ligne n'est
  // pas le compte courant : aucun formulaire de retrait n'est alors rendu.
  const identiteCouranteConnue = emailCourantNormalise !== null;
  const emailLigne = (ligne.email ?? "").trim().toLowerCase();
  const estUtilisateurCourant =
    identiteCouranteConnue && emailLigne !== "" && emailLigne === emailCourantNormalise;
  const estRevoque =
    ligne.statut_identite === "revoquee" ||
    // Repli pour une liste antérieure à l'exposition de statut_identite.
    (ligne.statut_identite == null && ligne.actif === false);
  // Mode sûr : l'action destructrice n'apparaît que sur une ligne dont l'état est
  // explicitement exploitable (actif booléen connu) ; toute incohérence => aucune action.
  const etatExploitable = typeof ligne.actif === "boolean";
  const peutAfficherRetrait =
    identiteCouranteConnue && etatExploitable && !estUtilisateurCourant && !estRevoque;
  // Ligne qui serait retirable si la session courante était identifiée : on l'indique
  // explicitement (« Action indisponible ») plutôt que de laisser croire à un bouton.
  const retraitIndisponible = !identiteCouranteConnue && etatExploitable && !estRevoque;
  return { estUtilisateurCourant, estRevoque, peutAfficherRetrait, retraitIndisponible };
}

// Normalise l'email de la session courante pour la comparaison ci-dessus.
export function emailAdminCourantNormalise(email: string | null | undefined): string | null {
  return (email ?? "").trim().toLowerCase() || null;
}

// Statut d'identité plateforme de l'utilisateur courant, ou null s'il n'a aucune
// ligne plateforme_admins rattachée à son UID. Ne confère aucun droit : sert au
// routage (une identité plateforme non active ne doit pas voir l'onboarding).
export async function statutIdentitePlateforme(): Promise<StatutIdentitePlateforme | null> {
  if (isEmailLoginDisabled()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("plateforme_statut_identite_courant");
  return typeof data === "string" && (STATUTS_IDENTITE_PLATEFORME as readonly string[]).includes(data)
    ? (data as StatutIdentitePlateforme)
    : null;
}

export const ABONNEMENT_STATUTS = [
  { cle: "essai", libelle: "Essai", couleur: "#b8792e" },
  { cle: "actif", libelle: "Actif", couleur: "#2f6b47" },
  { cle: "suspendu", libelle: "Suspendu", couleur: "#a64b45" },
  { cle: "annule", libelle: "Annulé", couleur: "#8b8f96" },
] as const;

export function statutAbonnement(cle: string) {
  return ABONNEMENT_STATUTS.find((s) => s.cle === cle) ?? ABONNEMENT_STATUTS[0];
}

export type EntrepriseAbonnement = {
  id: string;
  nom: string;
  code_adhesion: string | null;
  reference_interne: string | null;
  abonnement_statut: string;
  abonnement_echeance: string | null;
  abonnement_note: string | null;
  impaye_signale_at?: string | null;
  suspension_prevue_at?: string | null;
  impaye_message?: string | null;
  dernier_reglement_at?: string | null;
  abonnement_offre?: string | null;
  abonnement_periodicite?: string | null;
  abonnement_essai_fin?: string | null;
  abonnement_annulation_prevue_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  derniere_facture_url?: string | null;
  derniere_facture_pdf?: string | null;
  derniere_facture_statut?: string | null;
  remise_stripe_coupon_id?: string | null;
  remise_description?: string | null;
  remise_appliquee_at?: string | null;
  remise_motif_interne?: string | null;
  remise_duree_mois?: number | null;
  remise_cree_par?: string | null;
  remise_type?: string | null;
  remise_valeur?: number | null;
  option_ia_statut?: string | null;
  option_ia_essai_fin?: string | null;
  option_ia_palier?: string | null;
  nb_membres: number;
  nb_membres_actifs: number;
  nb_fiches_employes?: number;
  nb_comptes_actives?: number;
  nb_comptes_pause?: number;
  nb_comptes_facturables?: number;
  nb_invitations_envoyees?: number;
  nb_applications_installees?: number;
  nb_connectes_30j?: number;
  derniere_connexion?: string | null;
  options_actives?: string[];
  estimation_mensuelle_ht?: number;
  detail_comptes?: Array<{poste:string;comptes:number;tarif_unitaire:number;total:number}>;
  offre_recommandee?: string | null;
  created_at: string;
};

// Essai gratuit à l'inscription. Chaque offre porte son propre prix annuel.
export const DUREE_ESSAI_JOURS = 30;
export const REDUCTION_ANNUELLE = 0;

// Prix mensuel = base de l'offre (incluant N comptes) + comptes supplémentaires
// au tarif de l'offre + éventuels dépassements d'appareils. Les montants sont
// portés par chaque offre (voir OFFRES ci-dessous).
export function prixAbonnementMensuel(
  nbComptesFacturables: number,
  offre: Offre = OFFRES[0],
  supplementAppareils: number = 0,
) {
  const sup = Math.max(0, nbComptesFacturables - offre.comptesInclus);
  const supAppareils = Number.isFinite(supplementAppareils) ? Math.max(0, supplementAppareils) : 0;
  const total = offre.base + sup * offre.parCompteSup + supAppareils;
  const prixAnnuelFixe = offre.prixAnnuelCentimes / 100;
  return {
    total,
    base: offre.base,
    employesInclus: offre.comptesInclus,
    employesSupplementaires: sup,
    parEmployeSup: offre.parCompteSup,
    supplementAppareils: supAppareils,
    // Équivalent en paiement annuel (remise appliquée).
    mensuelSiAnnuel: Math.round((prixAnnuelFixe / 12 + sup * offre.parCompteSup + supAppareils) * 100) / 100,
    totalAnnuel: Math.round((prixAnnuelFixe + (sup * offre.parCompteSup + supAppareils) * 12) * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────
// Questionnaire d'inscription : besoins → offre recommandée.
// Chaque besoin est rattaché à un palier minimum. L'offre recommandée
// est le palier le plus élevé exigé par les besoins cochés.
// (Montants placeholders, à ajuster ici.)
// ─────────────────────────────────────────────────────────────
export const BESOINS_OPTIONS = [
  { cle: "devis_factures", libelle: "Devis & factures", palier: 1 },
  { cle: "clients_chantiers", libelle: "Clients & chantiers", palier: 1 },
  { cle: "planning", libelle: "Planning des équipes", palier: 2 },
  { cle: "pointage", libelle: "Pointage des heures", palier: 2 },
  { cle: "stock", libelle: "Gestion du stock", palier: 3 },
  { cle: "flotte", libelle: "Flotte & véhicules", palier: 3 },
  { cle: "outillage", libelle: "Outillage", palier: 3 },
  { cle: "notes_frais", libelle: "Notes de frais & justificatifs", palier: 2 },
  { cle: "portail_client", libelle: "Portail client & signature", palier: 4 },
  { cle: "exports_compta", libelle: "Exports comptables", palier: 3 },
  { cle: "qr_codes", libelle: "QR codes & borne stock", palier: 3 },
] as const;

export const ATTENTES_OPTIONS = [
  { cle: "gagner_temps", libelle: "Gagner du temps administratif" },
  { cle: "suivre_rentabilite", libelle: "Suivre la rentabilité des chantiers" },
  { cle: "gerer_equipes", libelle: "Mieux gérer les équipes sur le terrain" },
  { cle: "professionnaliser", libelle: "Professionnaliser mes devis / factures" },
  { cle: "respecter_obligations", libelle: "Respecter mes obligations (heures, CIBTP…)" },
  { cle: "centraliser", libelle: "Tout centraliser au même endroit" },
] as const;

// Grille tarifaire publique. `base` inclut `comptesInclus` comptes ; chaque
// compte au-delà est facturé `parCompteSup`. Positionnement ERP BTP complet
// (au-dessus des outils devis-factures simples). Ajuster ici après validation
// auprès de prospects réels.
export const OFFRES = OFFRES_TARIFAIRES;

export type Offre = OffreTarifaire;

export function offreParCle(cle: string): Offre {
  return offreTarifaireParCle(cle);
}

export function recommanderOffre(besoins: string[], nbEmployes: number) {
  const paliers = besoins.map((b) => BESOINS_OPTIONS.find((o) => o.cle === b)?.palier ?? 1);
  const palierMax = paliers.length ? Math.max(...paliers) : 1;
  const offre = OFFRES.find((o) => o.palier === palierMax) ?? OFFRES[0];
  const prix = prixAbonnementMensuel(Math.max(1, nbEmployes || 1), offre);
  return { offre, prix };
}
