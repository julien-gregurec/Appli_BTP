import type { SupabaseClient } from "@supabase/supabase-js";

// Lecture de la vue « Gérer et vérifier les pointages » (/pointage/gestion).
//
// PostgREST plafonne chaque réponse à `max_rows` (1 000 : supabase/config.toml
// et projet hébergé) sans erreur. La page lisait tout le mois d'un bloc et
// additionnait les heures côté serveur Next : au-delà de 1 000 pointages, les
// totaux étaient faux sans avertissement (ELSATIA-GP-POINTAGES-FACTURE-FIX-V1).
// Désormais : totaux calculés par PostgreSQL (une ligne par salarié), listes
// paginées avec un total exact, contrôles de zone lus page par page.

export const TAILLE_PAGE_SESSIONS = 50;
export const TAILLE_PAGE_ANCIENNES_SAISIES = 50;
/** Plafond PostgREST (`max_rows`) : aucune lecture ne doit compter dessus. */
export const PLAFOND_LIGNES_POSTGREST = 1000;

type Relation = { id: string; prenom?: string; nom: string };
type ValidationPointage = { id: string; verification_statut: string; anomalie_niveau: string | null; anomalie_motif: string | null; heures_attendues: number | null };

export type SessionPointage = {
  id: string; employe_id: string; chantier_id: string; arrivee_at: string; depart_at: string | null; pause_minutes: number;
  latitude_arrivee: number; longitude_arrivee: number; precision_arrivee_metres: number | null;
  latitude_depart: number | null; longitude_depart: number | null; precision_depart_metres: number | null;
  tache: string | null; pointage_id: string | null;
  pointage: ValidationPointage | ValidationPointage[] | null; employe: Relation | Relation[] | null; chantier: Relation | Relation[] | null;
};
export type AncienneSaisie = {
  id: string; date: string; heures_normales: number; heures_supplementaires: number; latitude: number | null; longitude: number | null;
  verification_statut: string; origine_pointage: string; commentaire: string | null;
  employe: Relation | Relation[] | null; chantier: Relation | Relation[] | null;
};
export type ControleZone = { id: string; session_id: string; employe_id: string; chantier_id: string; latitude: number; longitude: number; precision_metres: number | null; distance_metres: number | null; dans_zone: boolean; created_at: string };
export type TotalEmploye = { employeId: string; nom: string; nbPointages: number; heuresNormales: number; heuresSupplementaires: number; heures: number };

export type BornesMois = { mois: string; debut: string; fin: string; debutIso: string; finIso: string };

export function bornesMois(mois: string): BornesMois {
  const annee = Number(mois.slice(0, 4));
  const numero = Number(mois.slice(5, 7));
  const dernierJour = new Date(Date.UTC(annee, numero, 0)).getUTCDate();
  const debut = `${mois}-01`;
  const fin = `${mois}-${String(dernierJour).padStart(2, "0")}`;
  return { mois, debut, fin, debutIso: `${debut}T00:00:00+02:00`, finIso: `${fin}T23:59:59+02:00` };
}

export function numeroPage(valeur: string | undefined): number {
  const page = Number.parseInt(valeur ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function nombrePages(total: number, taille: number): number {
  return Math.max(1, Math.ceil(total / taille));
}

/** Totaux d'heures par salarié, calculés en base (RPC pointages_gestion_totaux_mois). */
export async function chargerTotauxParEmploye(supabase: SupabaseClient, entrepriseId: string, bornes: BornesMois): Promise<{ totaux: TotalEmploye[]; erreur: string | null }> {
  const { data, error } = await supabase.rpc("pointages_gestion_totaux_mois", { p_entreprise_id: entrepriseId, p_debut: bornes.debut, p_fin: bornes.fin });
  if (error) return { totaux: [], erreur: error.message };
  const lignes = (data ?? []) as { employe_id: string; prenom: string | null; nom: string; nb_pointages: number; heures_normales: number | string; heures_supplementaires: number | string; heures_total: number | string }[];
  return {
    erreur: null,
    totaux: lignes.map((ligne) => ({
      employeId: ligne.employe_id,
      nom: `${ligne.prenom ?? ""} ${ligne.nom}`.trim(),
      nbPointages: Number(ligne.nb_pointages),
      heuresNormales: Number(ligne.heures_normales),
      heuresSupplementaires: Number(ligne.heures_supplementaires),
      heures: Number(ligne.heures_total),
    })),
  };
}

const COLONNES_SESSION = "id,employe_id,chantier_id,arrivee_at,depart_at,pause_minutes,latitude_arrivee,longitude_arrivee,precision_arrivee_metres,latitude_depart,longitude_depart,precision_depart_metres,tache,pointage_id,pointage:pointages(id,verification_statut,anomalie_niveau,anomalie_motif,heures_attendues),employe:employes(id,prenom,nom),chantier:chantiers(id,nom)";

export type CompteursMois = { sessions: number; anciennesSaisies: number; controles: number };

/**
 * Compteurs exacts (pagination, en-tête), calculés en base par
 * pointages_gestion_compteurs_mois. Un `count=exact` PostgREST évaluerait la
 * RLS ligne à ligne : 15 à 40 s à 20 000 pointages dans le mois.
 */
export async function chargerCompteurs(supabase: SupabaseClient, entrepriseId: string, bornes: BornesMois): Promise<{ compteurs: CompteursMois; erreur: string | null }> {
  const { data, error } = await supabase.rpc("pointages_gestion_compteurs_mois", { p_entreprise_id: entrepriseId, p_debut: bornes.debut, p_fin: bornes.fin, p_debut_at: bornes.debutIso, p_fin_at: bornes.finIso });
  const ligne = (Array.isArray(data) ? data[0] : data) as { nb_sessions: number; nb_anciennes_saisies: number; nb_controles: number } | null;
  if (error || !ligne) return { compteurs: { sessions: 0, anciennesSaisies: 0, controles: 0 }, erreur: error?.message ?? "Compteurs indisponibles" };
  return { erreur: null, compteurs: { sessions: Number(ligne.nb_sessions), anciennesSaisies: Number(ligne.nb_anciennes_saisies), controles: Number(ligne.nb_controles) } };
}

/** Une page de sessions GPS du mois, plus récentes d'abord. */
export async function chargerSessionsPage(supabase: SupabaseClient, entrepriseId: string, bornes: BornesMois, page: number): Promise<SessionPointage[]> {
  const depart = (page - 1) * TAILLE_PAGE_SESSIONS;
  const { data } = await supabase.from("sessions_pointage").select(COLONNES_SESSION)
    .eq("entreprise_id", entrepriseId).gte("arrivee_at", bornes.debutIso).lte("arrivee_at", bornes.finIso)
    .order("arrivee_at", { ascending: false }).order("id", { ascending: false })
    .range(depart, depart + TAILLE_PAGE_SESSIONS - 1);
  return (data ?? []) as SessionPointage[];
}

/**
 * Une page des « anciennes saisies » : pointages du mois qui ne sont adossés à
 * aucune session GPS. Les identifiants de la page viennent de la base
 * (pointages_gestion_anciennes_saisies_ids : l'anti-jointure PostgREST
 * équivalente lisait tout le mois sous RLS, 37 s à 20 000 pointages) ; les
 * lignes sont ensuite relues par PostgREST, sous la RLS normale.
 */
export async function chargerAnciennesSaisiesPage(supabase: SupabaseClient, entrepriseId: string, bornes: BornesMois, page: number): Promise<AncienneSaisie[]> {
  const { data: ids } = await supabase.rpc("pointages_gestion_anciennes_saisies_ids", {
    p_entreprise_id: entrepriseId, p_debut: bornes.debut, p_fin: bornes.fin,
    p_limite: TAILLE_PAGE_ANCIENNES_SAISIES, p_decalage: (page - 1) * TAILLE_PAGE_ANCIENNES_SAISIES,
  });
  const identifiants = ((ids ?? []) as { id: string }[]).map((ligne) => ligne.id);
  if (!identifiants.length) return [];
  const { data } = await supabase.from("pointages")
    .select("id,date,heures_normales,heures_supplementaires,latitude,longitude,verification_statut,origine_pointage,commentaire,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)")
    .eq("entreprise_id", entrepriseId).in("id", identifiants)
    .order("date", { ascending: false }).order("id", { ascending: false });
  return (data ?? []) as AncienneSaisie[];
}

/** Contrôles de zone des sessions affichées, lus par tranches pour ne jamais buter sur max_rows. */
export async function chargerControlesZone(supabase: SupabaseClient, entrepriseId: string, sessionIds: string[]): Promise<ControleZone[]> {
  if (!sessionIds.length) return [];
  const controles: ControleZone[] = [];
  for (let depart = 0; ; depart += PLAFOND_LIGNES_POSTGREST) {
    const { data } = await supabase.from("verifications_zone_pointage")
      .select("id,session_id,employe_id,chantier_id,latitude,longitude,precision_metres,distance_metres,dans_zone,created_at")
      .eq("entreprise_id", entrepriseId).in("session_id", sessionIds)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(depart, depart + PLAFOND_LIGNES_POSTGREST - 1);
    const tranche = (data ?? []) as ControleZone[];
    controles.push(...tranche);
    if (tranche.length < PLAFOND_LIGNES_POSTGREST) return controles;
  }
}
