// Domaines d'alertes délégables et permission de gestion associée. Doit
// rester synchronisé avec la fonction SQL `deleguer_alerte_operationnelle`
// (supabase/migrations/20260821000220_alertes_delegation_v1.sql), qui est la
// seule source de vérité pour le contrôle d'accès réel — cette table ne sert
// qu'à filtrer l'affichage côté client (bouton, liste d'employés).
export const DOMAINE_VERS_PERMISSION_DELEGATION: Record<string, string> = {
  Facturation: "gerer_factures",
  Commercial: "gerer_devis",
  Stock: "gerer_stock",
  Flotte: "gerer_flotte",
  Outillage: "gerer_outillage",
  Achats: "gerer_achats",
};

export function permissionDelegationPour(domaine: string): string | null {
  return DOMAINE_VERS_PERMISSION_DELEGATION[domaine] ?? null;
}

export type EmployeDelegable = {
  employeId: string;
  prenom: string;
  nom: string;
  permissions: string[];
};

export type DelegationAlerte = {
  employeId: string;
  employePrenom: string;
  employeNom: string;
  deleguePar: string;
  delegueParUserId: string;
  delegueAt: string;
  commentaire: string | null;
};
