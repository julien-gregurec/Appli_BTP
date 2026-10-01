import type { SupabaseClient } from "@supabase/supabase-js";

// Lectures du pointage d'équipe (/pointage/gestion) et du planning
// hebdomadaire (/planning), dont dépendent des totaux d'heures
// (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).

type Relation = { id: string; prenom?: string; nom: string };
export type PointageGestion = { id: string; date: string; heures_normales: number; heures_supplementaires: number; employe: Relation | Relation[] | null; [cle: string]: unknown };
export type SessionGestion = { id: string; arrivee_at: string; pointage_id: string | null; [cle: string]: unknown };
export type VerificationGestion = { id: string; session_id: string; created_at: string; [cle: string]: unknown };
export type AffectationPlanning = { id: string; date: string; heures: number; [cle: string]: unknown };
export type PointagePlanning = { id: string; date: string; heures_normales: number; heures_supplementaires: number; employe_id: string; chantier_id: string | null; verification_statut: string };

// Lecture complète en une RPC (jsonb, non plafonnée par `max_rows`, mêmes
// filtres, colonnes, ordre et contrôles d'accès que les lectures RLS
// d'origine, droits évalués une fois par salarié : migration 20260928000814).
// Une erreur est levée : des heures calculées sur des lignes manquantes ne
// doivent pas s'afficher.
export async function chargerPointagesGestion(supabase: SupabaseClient, entrepriseId: string, periode: { debut: string; fin: string; debutIso: string; finIso: string }) {
  const { data, error } = await supabase.rpc("pointages_equipe_periode", { p_entreprise_id: entrepriseId, p_debut: periode.debut, p_fin: periode.fin, p_debut_at: periode.debutIso, p_fin_at: periode.finIso });
  if (error) throw new Error(`Pointages indisponibles : ${error.message}`);
  const d = data as { pointages: PointageGestion[]; sessions: SessionGestion[]; verifications: VerificationGestion[] };
  return { pointages: d.pointages, sessions: d.sessions, verifications: d.verifications };
}

export function heuresParEmploye(pointages: PointageGestion[]) {
  const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;
  const parEmploye = new Map<string, { nom: string; heures: number }>();
  for (const p of pointages) { const e = un(p.employe); if (e) { const ligne = parEmploye.get(e.id) ?? { nom: `${e.prenom ?? ""} ${e.nom}`.trim(), heures: 0 }; ligne.heures += Number(p.heures_normales) + Number(p.heures_supplementaires); parEmploye.set(e.id, ligne); } }
  return parEmploye;
}

export async function chargerPlanningSemaine(supabase: SupabaseClient, entrepriseId: string, debut: string, fin: string, employeId: string | null) {
  const { data, error } = await supabase.rpc("planning_semaine", { p_entreprise_id: entrepriseId, p_debut: debut, p_fin: fin, p_employe_id: employeId });
  if (error) throw new Error(`Planning indisponible : ${error.message}`);
  const d = data as { affectations: AffectationPlanning[]; pointages: PointagePlanning[] };
  return { affectations: d.affectations, pointages: d.pointages };
}
