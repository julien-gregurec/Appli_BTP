import type { SupabaseClient } from "@supabase/supabase-js";

const PLAFOND_QUOTIDIEN_PAR_DEFAUT = 300;

// Plafond d'appels IA/jour : dépend du palier Option IA choisi par l'entreprise (100, 300,
// ou illimité). Les comptes "gratuit" (historiques, grandfather) restent sans limite,
// quel que soit le palier enregistré. IA_PLAFOND_QUOTIDIEN sert de repli si l'entreprise
// n'a pas encore de palier reconnu (ex. avant application de la migration des paliers).
function plafondQuotidienParDefaut(): number {
  const valeur = Number(process.env.IA_PLAFOND_QUOTIDIEN);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : PLAFOND_QUOTIDIEN_PAR_DEFAUT;
}

function plafondQuotidienPourPalier(palier: string | null | undefined): number | null {
  if (palier === "100") return 100;
  if (palier === "300") return 300;
  if (palier === "illimite") return null;
  return plafondQuotidienParDefaut();
}

/** Retourne un message d'erreur si le plafond quotidien d'appels IA est atteint pour l'entreprise, sinon null. */
export async function verifierPlafondIA(supabase: SupabaseClient, entrepriseId: string): Promise<string | null> {
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("option_ia_statut,option_ia_palier")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (entreprise?.option_ia_statut === "gratuit") return null;

  const plafond = plafondQuotidienPourPalier(entreprise?.option_ia_palier);
  if (plafond === null) return null;

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("journal_ia")
    .select("id", { count: "exact", head: true })
    .eq("entreprise_id", entrepriseId)
    .gte("created_at", debutJournee.toISOString());
  if ((count ?? 0) >= plafond) {
    return `Limite quotidienne d'appels IA atteinte (${plafond}). Réessaie demain, ou passe à un palier supérieur dans Abonnement.`;
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
