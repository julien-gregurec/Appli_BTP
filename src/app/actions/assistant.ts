"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { iaEstActive, iaDevisEstActive, MESSAGE_IA_INDISPONIBLE } from "@/lib/preview-features";
import { UNITES, TAUX_TVA, LIGNE_TYPES } from "@/lib/devis";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

// La conversation avec l'assistant passe par /api/assistant/chat (streaming SSE),
// pas par une server action — voir src/app/api/assistant/chat/route.ts.

const TYPES_ACTIVITE_AUTORISES = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"];

export async function creerAffectationDepuisPropositionAction(proposition: {
  affectationId: string | null;
  employeIds: string[];
  typeActivite: string;
  chantierId: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
}): Promise<{ error: string } | { ok: true }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!aAccesIA(permissions)) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  // Defense en profondeur : la RLS sur `affectations` impose deja gerer_planning, mais un
  // message clair ici vaut mieux que l'erreur Postgres brute remontee telle quelle.
  if (!(permissions === null || permissions.includes("gerer_planning"))) return { error: "Ton poste n'a pas le droit de modifier le planning." };
  if (!TYPES_ACTIVITE_AUTORISES.includes(proposition.typeActivite)) return { error: "Type d'activité invalide." };
  if (!proposition.heures || proposition.heures <= 0) return { error: "Nombre d'heures invalide." };
  if (!proposition.employeIds.length) return { error: "Aucun employé sélectionné." };

  const estChantier = proposition.typeActivite === "chantier";
  if (estChantier !== Boolean(proposition.chantierId)) return { error: "Chantier invalide." };

  const [{ data: employes }, { data: chantier }] = await Promise.all([
    supabase.from("employes").select("id").in("id", proposition.employeIds).eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif"),
    estChantier ? supabase.from("chantiers").select("id").eq("id", proposition.chantierId as string).eq("entreprise_id", ctx.entrepriseId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!employes || employes.length !== proposition.employeIds.length || (estChantier && !chantier)) return { error: "Employé ou chantier invalide." };

  const valeurs = {
    chantier_id: proposition.chantierId,
    date: proposition.date,
    heures: proposition.heures,
    tache: proposition.tache,
    type_activite: proposition.typeActivite,
    lieu_activite: estChantier ? null : proposition.lieuActivite,
  };

  if (proposition.affectationId) {
    const { error } = await supabase.from("affectations").update(valeurs).eq("id", proposition.affectationId).eq("entreprise_id", ctx.entrepriseId);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    return { ok: true };
  }

  // Idempotence double-clic (AI-LAUNCH-V1B §37) : le bouton Confirmer est desactive cote
  // client pendant la transition (disabled={pending} dans AssistantIA.tsx), mais ce n'est
  // qu'une premiere ligne de defense (deux onglets, un rejeu reseau... contournent un simple
  // etat client). Une affectation identique (meme entreprise/employe/date/heures/activite/
  // chantier) creee dans les 10 dernieres secondes est traitee comme le resultat du meme clic,
  // pas recreee.
  const ilYA10Secondes = new Date(Date.now() - 10_000).toISOString();
  let requeteRecentes = supabase
    .from("affectations")
    .select("employe_id")
    .eq("entreprise_id", ctx.entrepriseId)
    .in("employe_id", proposition.employeIds)
    .eq("date", proposition.date)
    .eq("heures", proposition.heures)
    .eq("type_activite", proposition.typeActivite)
    .gte("created_at", ilYA10Secondes);
  requeteRecentes = estChantier
    ? requeteRecentes.eq("chantier_id", proposition.chantierId as string)
    : valeurs.lieu_activite
      ? requeteRecentes.eq("lieu_activite", valeurs.lieu_activite)
      : requeteRecentes.is("lieu_activite", null);
  const { data: recentes } = await requeteRecentes;
  const dejaCrees = new Set((recentes ?? []).map((r) => r.employe_id));
  const aCreer = proposition.employeIds.filter((id) => !dejaCrees.has(id));

  if (aCreer.length > 0) {
    const { error } = await supabase.from("affectations").insert(aCreer.map((employeId) => ({ entreprise_id: ctx.entrepriseId, employe_id: employeId, ...valeurs })));
    if (error) return { error: error.message };
  }

  revalidatePath("/planning");
  return { ok: true };
}

const TYPES_CONGE_AUTORISES = ["conges_payes", "rtt", "sans_solde", "maladie", "evenement_familial", "recuperation", "autre"];
const DEMI_JOURNEES_AUTORISEES = ["journee", "matin", "apres_midi"];

// Meme comportement que creerDemandeCongeAction (saisie manuelle depuis /conges) : brouillon
// puis soumission immediate via la RPC dediee, jamais d'approbation automatique. employeId
// n'est jamais fourni par le client ici : on ne cree que pour SA PROPRE fiche.
export async function creerDemandeCongeDepuisPropositionAction(proposition: {
  typeConge: string;
  dateDebut: string;
  dateFin: string;
  demiJourDebut: string;
  demiJourFin: string;
  commentaire: string | null;
}): Promise<{ error: string } | { ok: true }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!TYPES_CONGE_AUTORISES.includes(proposition.typeConge)) return { error: "Type de congé invalide." };
  if (!DEMI_JOURNEES_AUTORISEES.includes(proposition.demiJourDebut) || !DEMI_JOURNEES_AUTORISEES.includes(proposition.demiJourFin)) return { error: "Demi-journée invalide." };
  if (!proposition.dateDebut || !proposition.dateFin || proposition.dateFin < proposition.dateDebut) return { error: "Période invalide." };

  const { data: employe } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) return { error: "Ton compte n'est pas lié à une fiche employé." };

  const { data, error } = await supabase
    .from("demandes_conges")
    .insert({
      entreprise_id: ctx.entrepriseId,
      employe_id: employe.id,
      type_conge: proposition.typeConge,
      date_debut: proposition.dateDebut,
      date_fin: proposition.dateFin,
      demi_jour_debut: proposition.demiJourDebut,
      demi_jour_fin: proposition.demiJourFin,
      commentaire: proposition.commentaire,
      created_by: ctx.userId,
      statut: "brouillon",
    })
    .select("id")
    .single();
  if (error || !data?.id) return { error: error?.message ?? "Création impossible." };

  const { error: erreurSoumission } = await supabase.rpc("transition_demande_conge", { p_demande_id: data.id, p_action: "soumettre", p_message: null });
  if (erreurSoumission) return { error: erreurSoumission.message };

  revalidatePath("/conges");
  return { ok: true };
}

// Meme logique de recherche/creation de conversation que creerConversationInterneAction
// (saisie manuelle depuis /messagerie) : conversation directe unique par paire d'employes,
// un seul fil partage par chantier. L'auteur n'est jamais fourni par le client : on ne
// resout que la fiche employe liee au compte qui parle (RLS l'exige de toute facon).
export async function envoyerMessageInterneDepuisPropositionAction(proposition: {
  destinataireEmployeId: string | null;
  chantierId: string | null;
  contenu: string;
}): Promise<{ error: string } | { ok: true }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!proposition.contenu.trim()) return { error: "Message vide." };
  if (Boolean(proposition.destinataireEmployeId) === Boolean(proposition.chantierId)) return { error: "Destinataire invalide." };

  const { data: employe } = await supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle();
  if (!employe) return { error: "Ton compte n'est pas lié à une fiche employé." };

  let conversationId: string | null = null;
  if (proposition.chantierId) {
    const { data: existante } = await supabase.from("conversations_internes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("type", "chantier").eq("chantier_id", proposition.chantierId).maybeSingle();
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({ entreprise_id: ctx.entrepriseId, type: "chantier", chantier_id: proposition.chantierId, cree_par_employe_id: employe.id }).select("id").single();
      if (error || !data) return { error: error?.message ?? "Conversation impossible à créer." };
      conversationId = data.id;
    }
  } else {
    const { data: conversations } = await supabase.from("conversations_internes").select("id,cree_par_employe_id,destinataire_employe_id").eq("entreprise_id", ctx.entrepriseId).eq("type", "directe");
    const existante = (conversations ?? []).find(
      (c) => (c.cree_par_employe_id === employe.id && c.destinataire_employe_id === proposition.destinataireEmployeId) || (c.cree_par_employe_id === proposition.destinataireEmployeId && c.destinataire_employe_id === employe.id),
    );
    conversationId = existante?.id ?? null;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations_internes").insert({ entreprise_id: ctx.entrepriseId, type: "directe", destinataire_employe_id: proposition.destinataireEmployeId, cree_par_employe_id: employe.id }).select("id").single();
      if (error || !data) return { error: error?.message ?? "Conversation impossible à créer." };
      conversationId = data.id;
    }
  }

  const { error } = await supabase.from("messages_internes").insert({ entreprise_id: ctx.entrepriseId, conversation_id: conversationId, auteur_employe_id: employe.id, contenu: proposition.contenu });
  if (error) return { error: error.message };

  revalidatePath("/messagerie");
  return { ok: true };
}

// Meme insertion que envoyerMessageSupportAction (saisie manuelle depuis /aide) — pas de
// lien avec une fiche employe, un compte suffit.
export async function envoyerMessageSupportDepuisPropositionAction(proposition: { contenu: string }): Promise<{ error: string } | { ok: true }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  if (!aAccesIA(await permissionsUtilisateur(ctx))) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  if (!proposition.contenu.trim()) return { error: "Message vide." };

  const { error } = await supabase.rpc("support_envoyer_message_entreprise", {
    p_entreprise_id: ctx.entrepriseId,
    p_contenu: proposition.contenu,
  });
  if (error) return { error: error.message };

  revalidatePath("/aide");
  return { ok: true };
}

const TYPES_LIGNE_AUTORISES: readonly string[] = LIGNE_TYPES.map((t) => t.cle);

// IA-DEVIS-V1 : réécrit exactement le même RPC creer_devis_brouillon que la création manuelle
// (src/app/actions/devis.ts, creerDevisAction) — aucune architecture d'écriture parallèle.
// Le devis créé est donc TOUJOURS un brouillon (creer_devis_brouillon n'accepte aucun statut
// en entrée), jamais accepté/envoyé automatiquement.
export async function creerDevisDepuisPropositionAction(proposition: {
  clientId: string;
  objet: string;
  lignes: Array<{
    designation: string;
    description: string | null;
    type: string;
    quantite: number;
    unite: string;
    prixUnitaireHt: number | null;
    tauxTva: number;
    remiseLigne: number;
  }>;
  notesClient: string | null;
}): Promise<{ error: string } | { ok: true; devisId: string }> {
  if (!iaEstActive()) return { error: MESSAGE_IA_INDISPONIBLE };
  if (!iaDevisEstActive()) return { error: "La préparation de devis par l'assistant est désactivée dans cet environnement." };
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  if (!aAccesIA(permissions)) return { error: "Ton poste n'a pas accès aux fonctionnalités IA." };
  // Defense en profondeur : la RLS restrictive sur `devis`/`lignes_devis` impose deja
  // gerer_devis (migration 20260713000043), mais un message clair ici vaut mieux que
  // l'erreur Postgres brute remontee telle quelle.
  if (!(permissions === null || permissions.includes("gerer_devis"))) return { error: "Ton poste n'a pas le droit de gérer les devis." };

  const objet = proposition.objet.trim().slice(0, 200);
  if (!objet) return { error: "Le devis doit avoir un objet." };
  if (!proposition.clientId) return { error: "Aucun client sélectionné." };

  // §36 : la proposition peut être obsolète (client supprimé entre la proposition et la
  // confirmation) — on ne fait jamais confiance au snapshot du modèle, on revérifie.
  const { data: client } = await supabase.from("clients").select("id").eq("id", proposition.clientId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!client) return { error: "Ce client n'existe plus ou n'appartient pas à votre entreprise." };

  const lignes = proposition.lignes
    .filter((l) => l.designation.trim() !== "" && Number(l.quantite) > 0)
    .slice(0, 40)
    .map((l, i) => ({
      designation: l.designation.trim().slice(0, 200),
      description: l.description?.trim() || null,
      type: TYPES_LIGNE_AUTORISES.includes(l.type) ? l.type : "forfait",
      quantite: Number(l.quantite),
      unite: (UNITES as readonly string[]).includes(l.unite) ? l.unite : "u",
      // §6 : un prix jamais trouvé (null) est écrit à 0 — le schéma de lignes_devis n'a pas
      // d'autre représentation possible (colonne NOT NULL) — mais la carte de proposition,
      // elle, l'a affiché clairement comme "à renseigner" avant que l'utilisateur ne confirme.
      prix_unitaire_ht: typeof l.prixUnitaireHt === "number" && l.prixUnitaireHt >= 0 ? l.prixUnitaireHt : 0,
      remise_ligne: Math.min(100, Math.max(0, Number(l.remiseLigne) || 0)),
      taux_tva: (TAUX_TVA as readonly number[]).includes(Number(l.tauxTva)) ? Number(l.tauxTva) : 20,
      ordre: i,
    }));
  if (!lignes.length) return { error: "Aucune ligne valide à enregistrer." };

  const notesClient = [objet, proposition.notesClient?.trim() || null].filter(Boolean).join("\n\n");

  // Idempotence double-clic/double-confirmation (même principe que
  // creerAffectationDepuisPropositionAction, §34/§35) : un devis brouillon identique (même
  // entreprise/client/objet) créé dans les 10 dernières secondes est traité comme le résultat
  // du même clic, pas recréé.
  const ilYA10Secondes = new Date(Date.now() - 10_000).toISOString();
  const { data: recent } = await supabase
    .from("devis")
    .select("id")
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("client_id", proposition.clientId)
    .eq("statut", "brouillon")
    .eq("notes_client", notesClient)
    .gte("created_at", ilYA10Secondes)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.id) return { ok: true, devisId: recent.id };

  const { data: devisId, error } = await supabase.rpc("creer_devis_brouillon", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis: {
      client_id: proposition.clientId,
      chantier_id: null,
      date_emission: null,
      date_validite: null,
      conditions: null,
      notes_client: notesClient,
      notes_internes: "Brouillon préparé avec l'assistant IA.",
      remise_globale: 0,
    },
    p_lignes: lignes,
  });
  if (error || !devisId) return { error: messageErreurUtilisateur("creerDevisDepuisPropositionAction", error, "Impossible de créer ce devis.") };

  revalidatePath("/devis");
  revalidatePath("/dashboard");
  return { ok: true, devisId: devisId as string };
}
