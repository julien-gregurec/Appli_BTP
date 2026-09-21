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
  plan_page: number | null;
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
  // V3 : la charge de travail, pas seulement l'état.
  a_traiter: number;
  echeance_proche: number;
  messages_non_lus: number;
  notifications_non_lues: number;
  invitations_a_suivre: number;
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

/**
 * PLAFOND DE LIGNES DE L'API DE DONNÉES — et pourquoi il faut le franchir explicitement.
 *
 * `supabase/config.toml` fixe `max_rows = 1000`, et Supabase Cloud applique la même valeur
 * par défaut. C'est une bonne protection contre une requête accidentelle ou malveillante :
 * personne ne doit pouvoir tirer un million de lignes d'une seule main. Mais PostgREST
 * l'applique EN SILENCE — il rend mille lignes et rien, ni statut ni en-tête d'erreur, ne
 * dit qu'il en manque.
 *
 * Pour Réserves, ce silence est le pire défaut possible. Un chantier de réception
 * d'immeuble dépasse couramment le millier de réserves, et la « liste des réserves » n'est
 * pas un écran de confort : c'est une pièce que l'on annexe à un procès-verbal, que l'on
 * signe et que l'on oppose à une entreprise. Un document tronqué sans le dire est un
 * document FAUX — les réserves manquantes passent pour inexistantes, donc pour levées.
 *
 * On pagine donc explicitement : on demande les lignes par tranches, jusqu'à ce qu'une
 * tranche revienne incomplète. Le plafond continue de protéger chaque REQUÊTE ; il ne
 * décide plus, à notre insu, du contenu d'un document contractuel.
 */
export const TRANCHE = 1000;

/**
 * Une garde d'arrêt, pour qu'une pagination ne devienne jamais une boucle infinie si le
 * serveur se mettait à rendre toujours la même tranche. Deux cent mille réserves sur un
 * seul chantier n'existent pas ; une boucle sans fin sur un rendu serveur, si.
 */
export const TRANCHES_MAX = 200;

/**
 * Lit toutes les lignes d'une requête paginée, tranche par tranche.
 *
 * `lire(de, a)` doit rendre les lignes de l'intervalle demandé, bornes comprises.
 */
export async function toutesLesLignes<T>(
  lire: (de: number, a: number) => PromiseLike<{ data: unknown }>,
): Promise<T[]> {
  const cumul: T[] = [];
  for (let tranche = 0; tranche < TRANCHES_MAX; tranche += 1) {
    const de = tranche * TRANCHE;
    const { data } = await lire(de, de + TRANCHE - 1);
    const lignes = (data ?? []) as T[];
    cumul.push(...lignes);
    // Une tranche incomplète est la DERNIÈRE : c'est le seul signal disponible, puisque
    // PostgREST ne distingue pas « tout est là » de « j'ai coupé au plafond ».
    if (lignes.length < TRANCHE) break;
  }
  return cumul;
}

export async function listerReserves(filtres: FiltresReserves = {}): Promise<LigneReserve[]> {
  const supabase = await createClient();
  // La requête est RECONSTRUITE à chaque tranche : un constructeur de requête
  // supabase-js porte son état et ne se rejoue pas — le réutiliser rendrait la deuxième
  // tranche identique à la première, donc une liste pleine de doublons.
  const tranche = (de: number, a: number) => {
    let requete = supabase
      .from("reserves")
      .select("id, numero, titre, description, statut, priorite, echeance, photo_obligatoire_levee, intervenant_id, chantier_id, plan_id, plan_page, position_x, position_y, created_at")
      .order("numero", { ascending: true });
    if (filtres.chantierId) requete = requete.eq("chantier_id", filtres.chantierId);
    if (filtres.intervenantId) requete = requete.eq("intervenant_id", filtres.intervenantId);
    if (filtres.statut) requete = requete.eq("statut", filtres.statut);
    if (filtres.priorite) requete = requete.eq("priorite", filtres.priorite);
    if (filtres.echeanceAvant) requete = requete.lte("echeance", filtres.echeanceAvant);
    return requete.range(de, a);
  };
  return toutesLesLignes<LigneReserve>(tranche);
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
  const tranche = (de: number, a: number) => {
    let requete = supabase
      .from("reserves_intervenants")
      .select("id, nom, corps_etat, statut, entreprise_intervenante_id, email_contact, telephone_contact, chantier_id")
      .order("nom");
    if (chantierId) requete = requete.eq("chantier_id", chantierId);
    return requete.range(de, a);
  };
  return toutesLesLignes<IntervenantReserves>(tranche);
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
    .select("id, nom, niveau, zone, storage_path, mime_type, nom_fichier, taille_octets, ordre, nb_pages")
    .eq("chantier_id", chantierId)
    .order("ordre");
  return (data ?? []) as {
    id: string; nom: string; niveau: string | null; zone: string | null;
    storage_path: string | null; mime_type: string | null;
    nom_fichier: string | null; taille_octets: number | null; ordre: number;
    nb_pages: number | null;
  }[];
}

export async function listerMembres(entrepriseId: string): Promise<MembreReserves[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_lister_membres", { p_entreprise_id: entrepriseId });
  return (data ?? []) as MembreReserves[];
}

// ── V3 : annuaire, invitations, notifications, exports ──────────────────────

export type ResultatAnnuaire = {
  entreprise_id: string;
  nom: string;
  ville: string | null;
  corps_etat: string | null;
  zone_intervention: string | null;
  deja_utilisatrice: boolean;
  origine: "siret" | "annuaire";
};

/**
 * La recherche n'est jamais élargie côté application : elle transmet le terme tel quel
 * et laisse la base décider ce qu'elle expose (SIRET exact partout, nom uniquement parmi
 * les organisations publiées).
 */
export async function rechercherAnnuaire(
  entrepriseId: string,
  terme: string,
): Promise<{ resultats: ResultatAnnuaire[]; erreur: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserves_annuaire_rechercher", {
    p_entreprise_id: entrepriseId,
    p_terme: terme,
  });
  if (error) return { resultats: [], erreur: error.message };
  return { resultats: (data ?? []) as ResultatAnnuaire[], erreur: null };
}

export type PublicationAnnuaire = {
  publiee: boolean;
  corps_etat: string | null;
  zone_intervention: string | null;
  email_contact: string | null;
  telephone_contact: string | null;
};

export async function lirePublicationAnnuaire(
  entrepriseId: string,
): Promise<PublicationAnnuaire | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_annuaire_publication")
    .select("publiee, corps_etat, zone_intervention, email_contact, telephone_contact")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  return (data as PublicationAnnuaire) ?? null;
}

export type InvitationChantier = {
  id: string;
  intervenant_id: string;
  intervenant: string;
  email: string;
  contact_nom: string | null;
  etat: "acceptee" | "revoquee" | "expiree" | "a_envoyer" | "en_attente";
  expire_at: string;
  envoye_at: string | null;
  created_at: string;
};

export async function listerInvitations(chantierId: string): Promise<InvitationChantier[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_invitations_chantier", {
    p_chantier_id: chantierId,
  });
  return (data ?? []) as InvitationChantier[];
}

export type NotificationInApp = {
  id: string;
  type: string;
  libelle: string;
  categorie: string;
  critique: boolean;
  chantier_id: string | null;
  chantier: string | null;
  reserve_id: string | null;
  reserve_numero: number | null;
  reserve_titre: string | null;
  payload: Record<string, unknown> | null;
  lu: boolean;
  created_at: string;
};

export async function listerNotifications(
  limite = 50,
  nonLuesSeulement = false,
): Promise<NotificationInApp[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_notifications_in_app", {
    p_limite: limite,
    p_non_lues_seulement: nonLuesSeulement,
  });
  return (data ?? []) as NotificationInApp[];
}

export async function compterNotifications(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_notifications_compteur");
  return typeof data === "number" ? data : 0;
}

export type PreferenceNotification = {
  categorie: string;
  libelle: string;
  email: boolean;
  contient_critique: boolean;
};

export async function lirePreferences(entrepriseId: string): Promise<PreferenceNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_preferences_lire", {
    p_entreprise_id: entrepriseId,
  });
  return (data ?? []) as PreferenceNotification[];
}

export type ConversationReserves = {
  id: string;
  titre: string;
  chantier_id: string;
  chantier: string;
  reserve_id: string | null;
  reserve_numero: number | null;
  intervenant: string | null;
  non_lus: number;
  dernier_message: string | null;
  dernier_extrait: string | null;
};

export async function listerConversations(chantierId?: string): Promise<ConversationReserves[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_conversations_visibles", {
    p_chantier_id: chantierId ?? null,
  });
  return (data ?? []) as ConversationReserves[];
}

export type ReperePlanPage = {
  id: string;
  numero: number;
  titre: string;
  statut: string;
  priorite: string;
  position_x: number;
  position_y: number;
};

export async function listerReperesPlan(
  planId: string,
  page: number,
): Promise<ReperePlanPage[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_reperes_plan", {
    p_plan_id: planId,
    p_page: page,
  });
  return (data ?? []) as ReperePlanPage[];
}

// ── Jeux de données d'export ────────────────────────────────────────────────

export type EnteteExport = {
  chantier: string;
  reference: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  statut: string;
  date_reception: string | null;
  organisation: string;
  organisation_siret: string | null;
  total: number;
  ouvertes: number;
  levees: number;
  en_retard: number;
};

export type LigneExport = {
  id: string;
  numero: number;
  titre: string;
  description: string | null;
  statut: StatutReserve;
  priorite: PrioriteReserve;
  intervenant: string | null;
  intervenant_corps_etat: string | null;
  plan: string | null;
  plan_niveau: string | null;
  plan_zone: string | null;
  plan_page: number | null;
  position_x: number | null;
  position_y: number | null;
  echeance: string | null;
  photo_obligatoire_levee: boolean;
  nb_photos: number;
  created_at: string;
  assignee_at: string | null;
  acceptee_at: string | null;
  levee_demandee_at: string | null;
  levee_at: string | null;
};

export type LigneHistoriqueExport = {
  reserve_id: string;
  numero: number;
  action: string;
  statut_avant: string | null;
  statut_apres: string | null;
  commentaire: string | null;
  auteur: string | null;
  auteur_organisation: string | null;
  created_at: string;
};

export type PhotoExport = {
  reserve_id: string;
  numero: number;
  photo_id: string;
  usage: string;
  legende: string | null;
  storage_path: string;
  created_at: string;
};

export type IntervenantExport = {
  intervenant_id: string;
  nom: string;
  corps_etat: string | null;
  statut: string;
  total: number;
  ouvertes: number;
  levees: number;
};

export type FiltresExport = {
  intervenantId?: string | null;
  statut?: string | null;
  priorite?: string | null;
  echeanceAvant?: string | null;
  inclureLevees?: boolean;
};

export async function lireEnteteExport(chantierId: string): Promise<EnteteExport | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("reserves_export_entete", { p_chantier_id: chantierId })
    .maybeSingle();
  return (data as EnteteExport) ?? null;
}

export async function lireLignesExport(
  chantierId: string,
  filtres: FiltresExport = {},
): Promise<LigneExport[]> {
  const supabase = await createClient();
  return toutesLesLignes<LigneExport>((de, a) => supabase
    .rpc("reserves_export_chantier", {
      p_chantier_id: chantierId,
      p_intervenant_id: filtres.intervenantId ?? null,
      p_statut: filtres.statut ?? null,
      p_priorite: filtres.priorite ?? null,
      p_echeance_avant: filtres.echeanceAvant ?? null,
      p_inclure_levees: filtres.inclureLevees ?? true,
    })
    .range(de, a));
}

export async function lireHistoriqueExport(
  chantierId: string,
  intervenantId?: string | null,
): Promise<LigneHistoriqueExport[]> {
  const supabase = await createClient();
  // L'historique est la table qui grossit le plus vite : chaque commentaire, chaque
  // photo, chaque transition y laisse une ligne. Un chantier de mille réserves en porte
  // plusieurs milliers, et c'est précisément ce journal qui fait foi.
  return toutesLesLignes<LigneHistoriqueExport>((de, a) => supabase
    .rpc("reserves_export_historique", {
      p_chantier_id: chantierId,
      p_intervenant_id: intervenantId ?? null,
    })
    .range(de, a));
}

export async function lirePhotosExport(
  chantierId: string,
  intervenantId?: string | null,
): Promise<PhotoExport[]> {
  const supabase = await createClient();
  return toutesLesLignes<PhotoExport>((de, a) => supabase
    .rpc("reserves_export_photos", {
      p_chantier_id: chantierId,
      p_intervenant_id: intervenantId ?? null,
    })
    .range(de, a));
}

export async function listerIntervenantsExport(chantierId: string): Promise<IntervenantExport[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_export_intervenants", {
    p_chantier_id: chantierId,
  });
  return (data ?? []) as IntervenantExport[];
}

export async function compterMessagesNonLus(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_messages_non_lus");
  return typeof data === "number" ? data : 0;
}
