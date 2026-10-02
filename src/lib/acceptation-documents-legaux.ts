// ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1 — garde serveur de l'acceptation des
// conditions avant tout acte commercial (création d'entreprise, souscription payante).
//
// La base fait foi (RPC `accepter_documents_legaux`, `documents_legaux_a_accepter`,
// migration 20261002000901) ; ce module ne fait qu'enchaîner les appels et traduire les
// refus en messages. Fail-closed : une erreur de lecture vaut « conditions non acceptées ».

import type { SupabaseClient } from "@supabase/supabase-js";
import { lireAcceptationFormulaire, messageLectureAcceptation } from "./documents-legaux-versions";

export type ContexteAcceptation = "creation_entreprise" | "souscription_abonnement" | "reacceptation";

export type ResultatGardeAcceptation = { ok: true } | { ok: false; message: string };

export const MESSAGE_ACCEPTATION_INDISPONIBLE =
  "L’enregistrement de votre acceptation des conditions a échoué. Réessayez ou contactez-nous.";

/**
 * Enregistre l'acceptation cochée dans le formulaire puis vérifie qu'il ne reste aucun
 * document en vigueur à accepter pour l'utilisateur et l'entreprise.
 */
export async function exigerAcceptationConditions(
  supabase: Pick<SupabaseClient, "rpc">,
  formData: FormData,
  entrepriseId: string,
  contexte: ContexteAcceptation,
): Promise<ResultatGardeAcceptation> {
  const lecture = lireAcceptationFormulaire(formData);
  if (!lecture.ok) return { ok: false, message: messageLectureAcceptation(lecture) };

  const { error: erreurAcceptation } = await supabase.rpc("accepter_documents_legaux", {
    p_entreprise_id: entrepriseId,
    p_contexte: contexte,
    p_documents: lecture.documents,
  });
  if (erreurAcceptation) {
    console.error("exigerAcceptationConditions:accepter", erreurAcceptation);
    return { ok: false, message: MESSAGE_ACCEPTATION_INDISPONIBLE };
  }

  const { data: restants, error: erreurLecture } = await supabase.rpc("documents_legaux_a_accepter", {
    p_entreprise_id: entrepriseId,
  });
  if (erreurLecture || !Array.isArray(restants)) {
    console.error("exigerAcceptationConditions:restants", erreurLecture);
    return { ok: false, message: MESSAGE_ACCEPTATION_INDISPONIBLE };
  }
  if (restants.length > 0) return { ok: false, message: MESSAGE_ACCEPTATION_INDISPONIBLE };
  return { ok: true };
}
