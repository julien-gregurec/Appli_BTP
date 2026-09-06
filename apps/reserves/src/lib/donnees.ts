import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PrioriteReserve, StatutReserve } from "@/lib/workflow";

export type ChantierReserves = {
  id: string;
  nom: string;
  reference: string | null;
  ville: string | null;
  statut: "en_cours" | "receptionne" | "clos";
  source: "reserves" | "gestion_pro";
  compteur_reserves: number;
};

export type IntervenantReserves = {
  id: string;
  nom: string;
  corps_etat: string | null;
  statut: "invitee" | "active" | "revoquee";
  entreprise_intervenante_id: string | null;
  email_contact: string | null;
  telephone_contact: string | null;
  chantier_id: string;
};

export type PlanReserves = {
  id: string;
  nom: string;
  niveau: string | null;
  zone: string | null;
};

export type LigneReserve = {
  id: string;
  numero: number;
  titre: string;
  description: string | null;
  statut: StatutReserve;
  priorite: PrioriteReserve;
  echeance: string | null;
  photo_obligatoire_levee: boolean;
  intervenant_id: string | null;
  chantier_id: string;
  plan_id: string | null;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
};

export type CompteursReserves = {
  total: number;
  emises: number;
  assignees: number;
  refusees: number;
  acceptees: number;
  demandes_levee: number;
  levees_refusees: number;
  levees: number;
  annulees: number;
  en_attente: number;
  en_retard: number;
};

export type FiltresReserves = {
  chantierId?: string | null;
  intervenantId?: string | null;
  statut?: string | null;
  priorite?: string | null;
  echeanceAvant?: string | null;
};

// Toutes les lectures passent par les RLS de la migration 00268 : le code applicatif ne
// filtre jamais par entreprise « en plus », il laisse la base décider et se contente de
// transmettre les filtres de confort choisis par l'utilisateur.
export async function listerChantiers(): Promise<ChantierReserves[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_chantiers")
    .select("id, nom, reference, ville, statut, source, compteur_reserves")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as ChantierReserves[];
}

export async function lireChantier(id: string): Promise<ChantierReserves | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_chantiers")
    .select("id, nom, reference, ville, statut, source, compteur_reserves")
    .eq("id", id)
    .maybeSingle();
  return (data as ChantierReserves) ?? null;
}

export async function listerReserves(filtres: FiltresReserves = {}): Promise<LigneReserve[]> {
  const supabase = await createClient();
  let requete = supabase
    .from("reserves")
    .select("id, numero, titre, description, statut, priorite, echeance, photo_obligatoire_levee, intervenant_id, chantier_id, plan_id, position_x, position_y, created_at")
    .order("numero", { ascending: true });
  if (filtres.chantierId) requete = requete.eq("chantier_id", filtres.chantierId);
  if (filtres.intervenantId) requete = requete.eq("intervenant_id", filtres.intervenantId);
  if (filtres.statut) requete = requete.eq("statut", filtres.statut);
  if (filtres.priorite) requete = requete.eq("priorite", filtres.priorite);
  if (filtres.echeanceAvant) requete = requete.lte("echeance", filtres.echeanceAvant);
  const { data } = await requete;
  return (data ?? []) as LigneReserve[];
}

/**
 * `entrepriseId` vaut `null` pour un compte intervenant : ses réserves appartiennent au
 * tenant de l'organisation hôte, pas au sien. La base compte alors exactement ce que
 * l'appelant a le droit de voir.
 */
export async function lireCompteurs(
  entrepriseId: string | null,
  filtres: FiltresReserves = {},
): Promise<CompteursReserves | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("reserves_tableau_de_bord", {
      p_entreprise_id: entrepriseId ?? null,
      p_chantier_id: filtres.chantierId ?? null,
      p_intervenant_id: filtres.intervenantId ?? null,
      p_statut: filtres.statut ?? null,
      p_priorite: filtres.priorite ?? null,
      p_echeance_avant: filtres.echeanceAvant ?? null,
    })
    .maybeSingle();
  return (data as CompteursReserves) ?? null;
}

export async function listerIntervenants(chantierId?: string): Promise<IntervenantReserves[]> {
  const supabase = await createClient();
  let requete = supabase
    .from("reserves_intervenants")
    .select("id, nom, corps_etat, statut, entreprise_intervenante_id, email_contact, telephone_contact, chantier_id")
    .order("nom");
  if (chantierId) requete = requete.eq("chantier_id", chantierId);
  const { data } = await requete;
  return (data ?? []) as IntervenantReserves[];
}

export async function listerPlans(chantierId: string): Promise<PlanReserves[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_plans")
    .select("id, nom, niveau, zone")
    .eq("chantier_id", chantierId)
    .order("ordre");
  return (data ?? []) as PlanReserves[];
}

// ── V2 : fichiers, plans et membres ─────────────────────────────────────────

export const BUCKET_PHOTOS = "reserves-photos";
export const BUCKET_PLANS = "reserves-plans";

/** Durée de vie d'une URL signée. Assez pour afficher une galerie, pas pour la diffuser. */
const DUREE_URL_SIGNEE = 900;

export type PhotoReserve = {
  id: string;
  usage: string;
  legende: string | null;
  storage_path: string;
  mime_type: string;
  taille_octets: number | null;
  nom_fichier: string | null;
  deposee_par_hote: boolean;
  created_at: string;
};

export type MembreReserves = {
  utilisateur_id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  statut_membre: string;
  role_code: string | null;
  autorise: boolean;
};

/**
 * Les fichiers ne sont jamais publics : chaque affichage passe par une URL signée à
 * durée courte, émise seulement pour les objets que les policies laissent lire.
 */
export async function signerFichiers(
  bucket: string,
  chemins: string[],
): Promise<Map<string, string>> {
  const liens = new Map<string, string>();
  if (chemins.length === 0) return liens;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(chemins, DUREE_URL_SIGNEE);
  for (const entree of data ?? []) {
    if (entree.signedUrl && entree.path) liens.set(entree.path, entree.signedUrl);
  }
  return liens;
}

export async function listerPhotosReserve(reserveId: string): Promise<PhotoReserve[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_photos_visibles", { p_reserve_id: reserveId });
  return (data ?? []) as PhotoReserve[];
}

export async function listerPlansComplets(chantierId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_plans")
    .select("id, nom, niveau, zone, storage_path, mime_type, nom_fichier, taille_octets, ordre")
    .eq("chantier_id", chantierId)
    .order("ordre");
  return (data ?? []) as {
    id: string; nom: string; niveau: string | null; zone: string | null;
    storage_path: string | null; mime_type: string | null;
    nom_fichier: string | null; taille_octets: number | null; ordre: number;
  }[];
}

export async function listerMembres(entrepriseId: string): Promise<MembreReserves[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_lister_membres", { p_entreprise_id: entrepriseId });
  return (data ?? []) as MembreReserves[];
}
