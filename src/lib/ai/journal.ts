import type { SupabaseClient } from "@supabase/supabase-js";

const PLAFOND_QUOTIDIEN_PAR_DEFAUT = 300;

function plafondQuotidien(): number {
  const valeur = Number(process.env.IA_PLAFOND_QUOTIDIEN);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : PLAFOND_QUOTIDIEN_PAR_DEFAUT;
}

/** Retourne un message d'erreur si le plafond quotidien d'appels IA est atteint pour l'entreprise, sinon null. */
export async function verifierPlafondIA(supabase: SupabaseClient, entrepriseId: string): Promise<string | null> {
  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("journal_ia")
    .select("id", { count: "exact", head: true })
    .eq("entreprise_id", entrepriseId)
    .gte("created_at", debutJournee.toISOString());
  const plafond = plafondQuotidien();
  if ((count ?? 0) >= plafond) {
    return `Limite quotidienne d'appels IA atteinte (${plafond}). Réessaie demain, ou contacte-nous pour l'augmenter.`;
  }
  return null;
}

/** Best-effort : une erreur de journalisation ne doit jamais faire échouer l'appel IA lui-même. */
export function journaliserAppelIA(
  supabase: SupabaseClient,
  params: { entrepriseId: string; utilisateurId: string; fonctionnalite: string; statut: "succes" | "erreur"; messageErreur?: string },
): void {
  supabase
    .from("journal_ia")
    .insert({
      entreprise_id: params.entrepriseId,
      utilisateur_id: params.utilisateurId,
      fonctionnalite: params.fonctionnalite,
      statut: params.statut,
      message_erreur: params.messageErreur?.slice(0, 500) ?? null,
    })
    .then(undefined, () => {});
}
