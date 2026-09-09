import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estCleIdempotence, estTypeMutation, type IssueServeur } from "@/lib/mobile/offline/contrat";
import { resoudreIdentite } from "@/lib/mobile/offline/identite-serveur";

export const runtime = "nodejs";

/**
 * Point d'entrée de la file hors-ligne de Gestion Pro.
 *
 * Chaque mutation préparée sur l'appareil est rejouée ici, sous la session de l'appelant.
 * Trois principes la gouvernent — repris de Réserves, dont le moteur a fait ses preuves :
 *
 * 1. AUCUN DROIT NOUVEAU. La route n'utilise que le client Supabase normal, donc sous les
 *    mêmes RLS que l'écran. Une mutation préparée hors ligne ne peut pas faire ce que son
 *    auteur ne pourrait pas faire en ligne, et une permission révoquée entre-temps fait
 *    échouer le rejeu — comme il se doit.
 *
 * 2. L'IDENTITÉ DÉCLARÉE EST VÉRIFIÉE. La mutation transporte l'entreprise et l'utilisateur
 *    qui l'ont préparée. Si la session courante n'est pas exactement celle-là, la mutation
 *    est REFUSÉE : une saisie faite par A ne part jamais sous B, même si la file d'A se
 *    retrouvait ouverte dans la session de B. Sur un téléphone de chantier partagé, ce n'est
 *    pas une hypothèse d'école.
 *
 * 3. LE REJEU EST NORMAL. L'identifiant est produit par l'appareil et sert de clé primaire :
 *    rejouer une mutation déjà appliquée bute sur la clé primaire, ce qui se lit comme un
 *    succès et non comme une erreur. C'est ce qui rend la reprise après coupure sûre par
 *    construction plutôt que par chance de séquencement.
 */

type MutationEntrante = {
  id: string;
  type: string;
  entrepriseId: string;
  utilisateurId: string;
  capteA: number;
  payload: Record<string, unknown>;
  version?: number;
};

type Resultat = { id: string; issue: IssueServeur; motif?: string };

type ErreurPostgrest = { code?: string; message?: string; details?: string } | null;

function texte(payload: Record<string, unknown>, cle: string): string | null {
  const valeur = payload[cle];
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur : null;
}

function nombre(payload: Record<string, unknown>, cle: string): number | null {
  const valeur = payload[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

/** L'instant du GESTE, tel que l'appareil l'a noté — pas l'instant de la transmission. */
function instantCapture(capteA: unknown): string | null {
  if (typeof capteA !== "number" || !Number.isFinite(capteA)) return null;
  const date = new Date(capteA);
  if (Number.isNaN(date.getTime())) return null;
  // Une horloge d'appareil peut être fausse. On refuse ce qui est manifestement absurde —
  // dans le futur, ou vieux de plus de trente jours — plutôt que d'écrire en base une date
  // que personne ne pourra expliquer six mois plus tard.
  const maintenant = Date.now();
  if (capteA > maintenant + 5 * 60_000) return null;
  if (maintenant - capteA > 30 * 24 * 60 * 60_000) return null;
  return date.toISOString();
}

/** Le nom de la contrainte violée dit s'il s'agit d'un rejeu ou d'un vrai conflit. */
function classerViolationUnicite(erreur: ErreurPostgrest): IssueServeur {
  const empreinte = `${erreur?.message ?? ""} ${erreur?.details ?? ""}`;
  // Même identifiant : la mutation était déjà passée. C'est le rejeu attendu.
  if (empreinte.includes("sessions_pointage_pkey") || empreinte.includes("sessions_pointage_id_entreprise_id_key")) {
    return "rejeu";
  }
  // Une AUTRE session est ouverte pour ce salarié : arbitrage humain, pas de rejeu.
  if (empreinte.includes("sessions_pointage_ouverte_employe_unique")) return "conflit";
  if (empreinte.includes("notes_frais_pkey")) return "rejeu";
  return "conflit";
}

/** Une panne de service n'est pas un refus : la mutation doit retourner en file. */
function estIndisponibilite(erreur: ErreurPostgrest): boolean {
  const code = erreur?.code ?? "";
  // 08xxx : connexion ; 53xxx : ressources insuffisantes ; 57P0x : arrêt de l'instance.
  return code.startsWith("08") || code.startsWith("53") || code.startsWith("57P");
}

async function appliquer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mutation: MutationEntrante,
  identite: { entrepriseId: string; utilisateurId: string },
): Promise<Resultat> {
  const { id, type, payload } = mutation;
  const capture = instantCapture(mutation.capteA);
  if (!capture) {
    return { id, issue: "refus", motif: "Horodatage de l’appareil hors des limites acceptées." };
  }

  if (type === "pointage_arrivee") {
    const employeId = texte(payload, "employe_id");
    const chantierId = texte(payload, "chantier_id");
    if (!employeId || !chantierId) return { id, issue: "refus", motif: "Employé et chantier obligatoires." };

    const { error } = await supabase.from("sessions_pointage").insert({
      id,
      entreprise_id: identite.entrepriseId,
      employe_id: employeId,
      chantier_id: chantierId,
      arrivee_at: capture,
      latitude_arrivee: nombre(payload, "latitude"),
      longitude_arrivee: nombre(payload, "longitude"),
      precision_arrivee_metres: nombre(payload, "precision_metres"),
      tache: texte(payload, "tache"),
      // La trace du différé est portée par le commentaire ET par l'écart entre `created_at`
      // (horloge serveur, non falsifiable) et `arrivee_at` (horloge appareil). Aucun marqueur
      // dédié n'existe dans le schéma : `origine_pointage` n'admet pas de valeur « hors
      // ligne », et en ajouter une exigerait une migration — livrée en proposition, non créée.
      commentaire: [texte(payload, "commentaire"), "Saisi hors ligne, transmis au retour du réseau"]
        .filter(Boolean).join(" - "),
    });

    if (!error) return { id, issue: "applique" };
    if (error.code === "23505") return { id, issue: classerViolationUnicite(error) };
    if (estIndisponibilite(error)) return { id, issue: "indisponible", motif: "Base indisponible." };
    return { id, issue: "refus", motif: error.message };
  }

  if (type === "pointage_depart") {
    const sessionId = texte(payload, "session_id");
    if (!sessionId || !estCleIdempotence(sessionId)) {
      return { id, issue: "refus", motif: "Session de pointage absente de la saisie." };
    }

    const { error } = await supabase.rpc("cloturer_session_pointage", {
      p_entreprise_id: identite.entrepriseId,
      p_session_id: sessionId,
      p_depart_at: capture,
      p_pause_minutes: nombre(payload, "pause_minutes") ?? 0,
      p_latitude: nombre(payload, "latitude"),
      p_longitude: nombre(payload, "longitude"),
      p_precision: nombre(payload, "precision_metres"),
      p_photo_path: null,
      p_motif_sans_gps: texte(payload, "motif_sans_gps"),
    });

    if (!error) return { id, issue: "applique" };
    if (estIndisponibilite(error)) return { id, issue: "indisponible", motif: "Base indisponible." };
    // La RPC lève quand le départ est déjà enregistré. C'est précisément l'état recherché :
    // du point de vue de l'appareil, « je viens de le fermer » et « il était déjà fermé »
    // sont le même succès. Les distinguer ferait rejouer sans fin une réponse perdue.
    if (/d.j.\s+.t.\s+enregistr/i.test(error.message ?? "")) return { id, issue: "rejeu" };
    // La session n'existe pas encore côté serveur : l'arrivée qui la crée est probablement
    // restée derrière dans la file. Ce n'est pas un refus, c'est un « pas encore ».
    if (/introuvable/i.test(error.message ?? "")) {
      return { id, issue: "indisponible", motif: "L’arrivée correspondante n’est pas encore transmise." };
    }
    return { id, issue: "refus", motif: error.message };
  }

  if (type === "note_frais_brouillon") {
    const employeId = texte(payload, "employe_id");
    const montant = nombre(payload, "montant_ttc");
    if (!employeId || montant === null) {
      return { id, issue: "refus", motif: "Employé et montant obligatoires." };
    }

    const { error } = await supabase.from("notes_frais").insert({
      id,
      entreprise_id: identite.entrepriseId,
      employe_id: employeId,
      // La RLS exige `cree_par_utilisateur_id = auth.uid()` : la base refuserait de toute
      // façon une note déposée sous une autre identité. On l'écrit explicitement pour que
      // la règle soit lisible ici aussi.
      cree_par_utilisateur_id: identite.utilisateurId,
      date_frais: capture.slice(0, 10),
      montant_ttc: montant,
      categorie: texte(payload, "categorie"),
      description: texte(payload, "description"),
      fournisseur: texte(payload, "fournisseur"),
      chantier_id: texte(payload, "chantier_id"),
      lieu_hors_chantier: texte(payload, "chantier_id") ? null : (texte(payload, "lieu_hors_chantier") ?? "sans_chantier"),
      // Toujours un BROUILLON : la file transporte un travail préparé, jamais une soumission.
      // Le salarié rouvrira la note pour y joindre son justificatif et la soumettre lui-même.
      statut: "brouillon",
    });

    if (!error) return { id, issue: "applique" };
    if (error.code === "23505") return { id, issue: classerViolationUnicite(error) };
    if (estIndisponibilite(error)) return { id, issue: "indisponible", motif: "Base indisponible." };
    return { id, issue: "refus", motif: error.message };
  }

  return { id, issue: "refus", motif: `Type de mutation non pris en charge : ${type}` };
}

export async function POST(requete: Request) {
  const resolution = await resoudreIdentite();

  if (resolution.etat === "indisponible") {
    // 503, pas 401. Le client doit réessayer, pas demander à l'utilisateur de se reconnecter.
    return NextResponse.json({ erreur: resolution.motif }, { status: 503 });
  }
  if (resolution.etat === "anonyme") {
    return NextResponse.json({ erreur: "Session absente ou expirée." }, { status: 401 });
  }
  const { identite } = resolution;

  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Corps de requête illisible." }, { status: 400 });
  }

  const mutations = (corps as { mutations?: unknown })?.mutations;
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return NextResponse.json({ erreur: "Aucune mutation à traiter." }, { status: 400 });
  }
  // Un lot borné : au-delà, la requête risque le délai d'exécution et l'appareil ne saurait
  // pas lesquelles sont passées. Le client renverra le reste au tour suivant.
  if (mutations.length > 50) {
    return NextResponse.json({ erreur: "Lot trop volumineux (50 maximum)." }, { status: 400 });
  }

  const supabase = await createClient();
  const resultats: Resultat[] = [];

  // Séquentiel, et non parallèle : l'ordre porte du sens. Un départ ne peut pas être appliqué
  // avant l'arrivée qui crée sa session.
  for (const brute of mutations as MutationEntrante[]) {
    if (!estCleIdempotence(brute?.id)) {
      resultats.push({ id: String(brute?.id ?? "?"), issue: "refus", motif: "Identifiant de mutation invalide." });
      continue;
    }
    if (!estTypeMutation(brute?.type)) {
      resultats.push({ id: brute.id, issue: "refus", motif: "Type de mutation inconnu." });
      continue;
    }
    if (brute.entrepriseId !== identite.entrepriseId || brute.utilisateurId !== identite.utilisateurId) {
      resultats.push({
        id: brute.id,
        issue: "refus",
        motif: "Cette saisie a été préparée sous un autre compte : elle ne peut pas être envoyée depuis celui-ci.",
      });
      continue;
    }
    if (typeof brute.payload !== "object" || brute.payload === null) {
      resultats.push({ id: brute.id, issue: "refus", motif: "Contenu de mutation absent." });
      continue;
    }

    try {
      resultats.push(await appliquer(supabase, brute, identite));
    } catch {
      // Une exception inattendue ne doit pas faire perdre la mutation : on la rend
      // réessayable plutôt que de la marquer en échec définitif.
      resultats.push({ id: brute.id, issue: "indisponible", motif: "Erreur inattendue au rejeu." });
    }
  }

  return NextResponse.json({ resultats });
}
