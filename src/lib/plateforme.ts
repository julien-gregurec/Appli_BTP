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
  created_at: string;
};

// Tarification simple : prix mensuel = abonnement de base (incluant N employés) + employés supplémentaires.
// Barème par défaut, ajustable ici.
export const TARIF_ABONNEMENT = { base: 49, employesInclus: 3, parEmployeSup: 12 };

export function prixAbonnementMensuel(nbEmployesActifs: number) {
  const sup = Math.max(0, nbEmployesActifs - TARIF_ABONNEMENT.employesInclus);
  return {
    total: TARIF_ABONNEMENT.base + sup * TARIF_ABONNEMENT.parEmployeSup,
    base: TARIF_ABONNEMENT.base,
    employesSupplementaires: sup,
    parEmployeSup: TARIF_ABONNEMENT.parEmployeSup,
    employesInclus: TARIF_ABONNEMENT.employesInclus,
  };
}
