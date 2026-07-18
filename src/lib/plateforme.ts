import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

// L'espace plateforme est réservé au propriétaire (identifié par son email, table plateforme_admins).
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

// Essai gratuit à l'inscription, et réduction du paiement annuel.
export const DUREE_ESSAI_JOURS = 30;
export const REDUCTION_ANNUELLE = 0.2; // -20 % en paiement annuel

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
  return {
    total,
    base: offre.base,
    employesInclus: offre.comptesInclus,
    employesSupplementaires: sup,
    parEmployeSup: offre.parCompteSup,
    supplementAppareils: supAppareils,
    // Équivalent en paiement annuel (remise appliquée).
    mensuelSiAnnuel: Math.round(total * (1 - REDUCTION_ANNUELLE)),
    totalAnnuel: Math.round(total * 12 * (1 - REDUCTION_ANNUELLE)),
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
  { cle: "stock", libelle: "Gestion du stock", palier: 2 },
  { cle: "flotte", libelle: "Flotte & véhicules", palier: 2 },
  { cle: "outillage", libelle: "Outillage", palier: 2 },
  { cle: "notes_frais", libelle: "Notes de frais & justificatifs", palier: 3 },
  { cle: "portail_client", libelle: "Portail client & signature", palier: 3 },
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
export const OFFRES = [
  { cle: "essentiel", palier: 1, nom: "Essentiel", base: 59, comptesInclus: 2, parCompteSup: 15,
    resume: "Devis, factures, clients & chantiers. Pour l'artisan seul ou une petite équipe." },
  { cle: "pro", palier: 2, nom: "Pro", base: 129, comptesInclus: 5, parCompteSup: 15,
    resume: "Essentiel + planning, pointage GPS, stock, flotte & outillage. Pour 3 à 15 salariés." },
  { cle: "premium", palier: 3, nom: "Premium", base: 249, comptesInclus: 10, parCompteSup: 12,
    resume: "Pro + notes de frais probantes, portail client, exports comptables & QR codes. Au-delà de 15 salariés." },
] as const;

export type Offre = (typeof OFFRES)[number];

export function offreParCle(cle: string): Offre {
  return OFFRES.find((o) => o.cle === cle) ?? OFFRES[0];
}

export function recommanderOffre(besoins: string[], nbEmployes: number) {
  const paliers = besoins.map((b) => BESOINS_OPTIONS.find((o) => o.cle === b)?.palier ?? 1);
  const palierMax = paliers.length ? Math.max(...paliers) : 1;
  const offre = OFFRES.find((o) => o.palier === palierMax) ?? OFFRES[0];
  const prix = prixAbonnementMensuel(Math.max(1, nbEmployes || 1), offre);
  return { offre, prix };
}
