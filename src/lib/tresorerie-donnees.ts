import type { SupabaseClient } from "@supabase/supabase-js";
import { lireToutesLesLignes } from "@/lib/supabase/lecture-complete";

// Chargement et indicateurs de la page /tresorerie, isolés de l'affichage pour
// être vérifiables contre la base (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).

type Personne = { nom: string | null; prenom?: string | null; societe?: string | null };
type Nom = { nom: string };
export type FactureTresorerie = { id: string; numero: string | null; date_emission: string; date_echeance: string | null; montant_ttc: number; montant_paye: number; statut: string; client: Personne | Personne[] | null; chantier: Nom | Nom[] | null };
export type DepenseTresorerie = { id: string; numero_piece: string; date_piece: string; date_echeance: string | null; montant_ttc: number; montant_regle: number; statut: string; fournisseur: Nom | Nom[] | null; chantier: Nom | Nom[] | null };
export type ChargeTresorerie = { id: string; libelle: string; periodicite: string; montant_ht: number; montant_tva: number; prochaine_echeance: string; date_fin: string | null; fournisseur: Nom | Nom[] | null; chantier: Nom | Nom[] | null };
export type DonneesTresorerie = {
  factures: FactureTresorerie[];
  depenses: DepenseTresorerie[];
  avoirs: { facture_origine_id: string | null; montant_ttc: number }[];
  encaissements: { montant: number }[];
  decaissements: { montant: number }[];
  charges: ChargeTresorerie[];
};

// Pièces ouvertes et flux réalisés sont lus en une RPC `tresorerie_donnees`
// (jsonb, non plafonnée par `max_rows`, mêmes règles et mêmes contrôles
// d'accès que les lectures RLS d'origine) ; les charges récurrentes actives,
// peu nombreuses, restent une lecture directe, lue en entier page par page.
// Une erreur de lecture est levée : la page ne doit jamais afficher des
// montants calculés sur des données manquantes.
export async function chargerDonneesTresorerie(supabase: SupabaseClient, entrepriseId: string, depuis: string): Promise<DonneesTresorerie> {
  const [rpc, charges] = await Promise.all([
    supabase.rpc("tresorerie_donnees", { p_entreprise_id: entrepriseId, p_depuis: depuis }),
    lireToutesLesLignes<ChargeTresorerie>((options) => supabase.from("charges_recurrentes").select("id,libelle,periodicite,montant_ht,montant_tva,prochaine_echeance,date_fin,fournisseur:fournisseurs(nom),chantier:chantiers(nom)", options).eq("entreprise_id", entrepriseId).eq("actif", true).order("id")),
  ]);
  if (rpc.error) throw new Error(`Trésorerie indisponible : ${rpc.error.message}`);
  if (charges.error) throw new Error("Trésorerie indisponible : charges récurrentes illisibles");
  const d = rpc.data as { factures_ouvertes: FactureTresorerie[]; avoirs_par_facture: { facture_origine_id: string; montant_ttc: number }[]; depenses_ouvertes: DepenseTresorerie[]; encaisse: number; decaisse: number };
  return {
    factures: d.factures_ouvertes, depenses: d.depenses_ouvertes, avoirs: d.avoirs_par_facture,
    encaissements: [{ montant: Number(d.encaisse) }], decaissements: [{ montant: Number(d.decaisse) }], charges: charges.data,
  };
}

export const STATUTS_FACTURE_HORS_TRESORERIE = ["payee", "annulee", "avoir_emis", "brouillon"];
export const STATUTS_DEPENSE_HORS_TRESORERIE = ["payee", "annulee"];

export function indicateursTresorerie(donnees: DonneesTresorerie) {
  const avoirsParFacture = new Map<string, number>();
  for (const a of donnees.avoirs) { if (!a.facture_origine_id) continue; avoirsParFacture.set(a.facture_origine_id, (avoirsParFacture.get(a.facture_origine_id) ?? 0) + Number(a.montant_ttc)); }
  const resteNetFacture = (f: { id: string; montant_ttc: number; montant_paye: number }) => Number(f.montant_ttc) - Number(f.montant_paye) + (avoirsParFacture.get(f.id) ?? 0);
  const entrees30 = donnees.encaissements.reduce((s, x) => s + Number(x.montant), 0), sorties30 = donnees.decaissements.reduce((s, x) => s + Number(x.montant), 0);
  const facturesOuvertes = donnees.factures.filter((f) => !STATUTS_FACTURE_HORS_TRESORERIE.includes(f.statut));
  const depensesOuvertes = donnees.depenses.filter((d) => !STATUTS_DEPENSE_HORS_TRESORERIE.includes(d.statut));
  const aEncaisser = facturesOuvertes.reduce((s, f) => s + Math.max(0, resteNetFacture(f)), 0);
  const aPayer = depensesOuvertes.reduce((s, d) => s + Math.max(0, Number(d.montant_ttc) - Number(d.montant_regle)), 0);
  return { entrees30, sorties30, aEncaisser, aPayer, facturesOuvertes, depensesOuvertes, resteNetFacture };
}
