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

// Simulateur de la GÉNÉRATION PRÉCÉDENTE : il facture les comptes au tarif du
// FORFAIT (`parCompteSupHistorique`), pas au tarif du RÔLE. La grille courante
// dépend du rôle réel du compte — voir `calculerTarifAbonnement()` dans
// `tarification.ts`. Cette fonction est conservée pour lire un contrat souscrit
// sous l'ancienne génération ; elle ne doit pas servir à en chiffrer un nouveau.
export function prixAbonnementMensuel(
  nbComptesFacturables: number,
  offre: Offre = OFFRES[0],
  supplementAppareils: number = 0,
) {
  const sup = Math.max(0, nbComptesFacturables - offre.comptesInclus);
  const supAppareils = Number.isFinite(supplementAppareils) ? Math.max(0, supplementAppareils) : 0;
  const total = offre.base + sup * offre.parCompteSupHistorique + supAppareils;
  const prixAnnuelFixe = offre.prixAnnuelCentimes / 100;
  return {
    total,
    base: offre.base,
    employesInclus: offre.comptesInclus,
    employesSupplementaires: sup,
    parEmployeSup: offre.parCompteSupHistorique,
    supplementAppareils: supAppareils,
    // Équivalent en paiement annuel (remise appliquée).
    mensuelSiAnnuel: Math.round((prixAnnuelFixe / 12 + sup * offre.parCompteSupHistorique + supAppareils) * 100) / 100,
    totalAnnuel: Math.round((prixAnnuelFixe + (sup * offre.parCompteSupHistorique + supAppareils) * 12) * 100) / 100,
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
// compte au-delà était facturé `parCompteSupHistorique`. Positionnement ERP BTP complet
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
