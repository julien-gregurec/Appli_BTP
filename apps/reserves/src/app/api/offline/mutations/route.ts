import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  estCleIdempotence, VERSION_PAYLOAD, type TypeMutation,
} from "@/lib/offline/contrat";
import { identiteCourante } from "@/lib/offline/identite";

export const runtime = "nodejs";

/**
 * Point d'entrée de la file hors-ligne.
 *
 * Chaque mutation préparée sur l'appareil est rejouée ici, sous la session de l'appelant.
 * Trois principes gouvernent cette route :
 *
 * 1. AUCUN DROIT NOUVEAU. Elle n'appelle que les RPC du domaine, avec le client normal —
 *    donc sous les mêmes RLS que l'écran. Une mutation préparée hors ligne ne peut pas
 *    faire ce que son auteur ne pourrait pas faire en ligne, et une permission révoquée
 *    entre-temps fait échouer le rejeu, comme il se doit.
 *
 * 2. L'IDENTITÉ DÉCLARÉE EST VÉRIFIÉE. La mutation transporte l'organisation et
 *    l'utilisateur qui l'ont préparée. Si la session courante n'est pas exactement
 *    celle-là, la mutation est REFUSÉE : une action saisie par A ne part jamais sous B,
 *    même si la file d'A se retrouvait ouverte dans la session de B.
 *
 * 3. LE REJEU EST NORMAL. Toutes les actions passent par une RPC idempotente : rejouer
 *    n'ajoute rien. C'est ce qui rend la reprise après coupure sûre par construction,
 *    plutôt que par chance de séquencement.
 */

type MutationEntrante = {
  id: string;
  type: TypeMutation;
  entrepriseId: string;
  utilisateurId: string;
  reserveId: string | null;
  chantierId: string | null;
  payload: Record<string, unknown>;
  /** Version du format de charge utile, telle que l'appareil l'a écrite. */
  version?: number;
};

type Resultat =
  | { id: string; issue: "applique" | "rejeu"; identifiant: string | null }
  | { id: string; issue: "conflit" | "refus"; motif: string };

function texte(payload: Record<string, unknown>, cle: string): string | null {
  const valeur = payload[cle];
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur : null;
}

function nombre(payload: Record<string, unknown>, cle: string): number | null {
  const valeur = payload[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

export async function POST(requete: Request) {
  // `getContexteReserves()` REDIRIGE quand la session manque : dans une route d'API,
  // cela produirait un 307 vers /login qu'un client hors-ligne interpréterait comme une
  // réponse métier. On résout donc l'identité sans redirection, et on répond 401.
  const identite = await identiteCourante();
  if (!identite) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let corps: { mutations?: MutationEntrante[] };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }
  const mutations = Array.isArray(corps.mutations) ? corps.mutations : [];
  // La file est envoyée par petits lots : un lot démesuré viendrait d'un client
  // défaillant, pas d'un chantier.
  if (mutations.length === 0 || mutations.length > 50) {
    return NextResponse.json({ error: "Lot de mutations invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const resultats: Resultat[] = [];

  for (const mutation of mutations) {
    if (!estCleIdempotence(mutation.id)) {
      resultats.push({ id: String(mutation.id), issue: "refus", motif: "Clé de mutation invalide." });
      continue;
    }

    // ── Format de la charge utile ─────────────────────────────────────────
    // Une file écrite par une version PLUS RÉCENTE de l'application n'est pas
    // interprétable ici : la refuser explicitement vaut mieux que d'en tirer les champs
    // que l'on croit reconnaître. Le client garde sa saisie et la renverra après mise à
    // jour. Une version absente vient d'un client antérieur à ce champ : elle est
    // traitée comme la version 1, qui est bien celle qu'il écrivait.
    const version = typeof mutation.version === "number" ? mutation.version : 1;
    if (!Number.isInteger(version) || version < 1 || version > VERSION_PAYLOAD) {
      resultats.push({
        id: mutation.id,
        issue: "refus",
        motif: "Cette action a été préparée par une version plus récente de l’application : "
             + "rechargez ELSATIA Réserves pour l’envoyer.",
      });
      continue;
    }

    // ── Cloisonnement, avant toute chose ──────────────────────────────────
    if (
      mutation.entrepriseId !== identite.entrepriseId
      || mutation.utilisateurId !== identite.utilisateurId
    ) {
      resultats.push({
        id: mutation.id,
        issue: "refus",
        motif: "Cette action a été préparée sous une autre identité : elle ne peut pas être "
             + "envoyée depuis cette session.",
      });
      continue;
    }

    try {
      resultats.push(await appliquer(supabase, mutation));
    } catch (erreur) {
      resultats.push({
        id: mutation.id, issue: "refus",
        motif: erreur instanceof Error ? erreur.message : "Rejeu impossible.",
      });
    }
  }

  return NextResponse.json({ resultats }, { headers: { "Cache-Control": "no-store" } });
}

type ClientSupabase = Awaited<ReturnType<typeof createClient>>;

async function appliquer(
  supabase: ClientSupabase, mutation: MutationEntrante,
): Promise<Resultat> {
  const { id, payload } = mutation;

  switch (mutation.type) {
    // ── Création de réserve ───────────────────────────────────────────────
    case "reserve_creer": {
      const chantierId = mutation.chantierId;
      const titre = texte(payload, "titre");
      if (!chantierId || !titre) {
        return { id, issue: "refus", motif: "Réserve incomplète : chantier et titre requis." };
      }
      const { data, error } = await supabase.rpc("reserves_creer", {
        p_chantier_id: chantierId,
        p_titre: titre,
        p_description: texte(payload, "description"),
        p_priorite: texte(payload, "priorite") ?? "normale",
        p_intervenant_id: texte(payload, "intervenantId"),
        p_plan_id: texte(payload, "planId"),
        p_position_x: nombre(payload, "positionX"),
        p_position_y: nombre(payload, "positionY"),
        p_photo_obligatoire_levee: payload.photoObligatoireLevee === true,
        p_echeance: texte(payload, "echeance"),
        // L'identifiant de la mutation EST la clé d'idempotence : un rejeu retombe
        // nécessairement sur la même réserve.
        p_origine_client_id: id,
        p_plan_page: nombre(payload, "planPage"),
      });
      if (error) return { id, issue: "refus", motif: error.message };
      return { id, issue: "applique", identifiant: (data as string) ?? null };
    }

    // ── Commentaire ───────────────────────────────────────────────────────
    case "commentaire_ajouter": {
      const contenu = texte(payload, "contenu");
      if (!mutation.reserveId || !contenu) {
        return { id, issue: "refus", motif: "Commentaire vide." };
      }
      const { data, error } = await supabase.rpc("reserves_commenter", {
        p_reserve_id: mutation.reserveId,
        p_contenu: contenu,
        p_photo_id: null,
        p_origine_client_id: id,
      });
      if (error) return { id, issue: "refus", motif: error.message };
      // `reserves_commenter` rend la CONVERSATION, pas le message : c'est elle qui permet
      // d'ouvrir le fil, et le rejeu rend exactement la même valeur que l'envoi initial.
      return { id, issue: "applique", identifiant: (data as string) ?? null };
    }

    // ── Demande de levée ──────────────────────────────────────────────────
    case "levee_demander": {
      if (!mutation.reserveId) {
        return { id, issue: "refus", motif: "Réserve inconnue." };
      }
      const { data, error } = await supabase
        .rpc("reserves_transition_differee", {
          p_reserve_id: mutation.reserveId,
          p_statut_apres: "levee_demandee",
          p_commentaire: texte(payload, "commentaire"),
          p_intervenant_id: null,
          p_origine_client_id: id,
        })
        .maybeSingle();
      if (error) return { id, issue: "refus", motif: error.message };
      const issue = data as { issue: string; statut_courant: string; motif: string | null } | null;
      if (!issue) return { id, issue: "refus", motif: "Réponse serveur vide." };
      if (issue.issue === "conflit") {
        return { id, issue: "conflit", motif: issue.motif ?? "État du serveur incompatible." };
      }
      return {
        id,
        issue: issue.issue === "rejeu" ? "rejeu" : "applique",
        identifiant: mutation.reserveId,
      };
    }

    // La photo ne passe pas par ici : son corps est binaire et transite par une route
    // dédiée en `multipart/form-data`. L'inclure dans ce lot JSON imposerait un encodage
    // base64, soit un tiers de volume en plus sur le lien le plus fragile du parcours.
    case "photo_ajouter":
      return {
        id, issue: "refus",
        motif: "Une photo se dépose par /api/offline/photo, jamais dans le lot JSON.",
      };

    default:
      return { id, issue: "refus", motif: "Type de mutation inconnu." };
  }
}
