import type { SupabaseClient } from "@supabase/supabase-js";
import { offreTarifaireParCle } from "@/lib/tarification";

const PLAFOND_MENSUEL_REPLI = 100;

function debutMoisUTC(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function debutMoisSuivantUTC(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function quotaHistorique(palier: string | null | undefined, statut: string | null | undefined) {
  if (statut === "gratuit") return 3_000;
  if (palier === "100") return 100;
  if (palier === "300") return 300;
  if (palier === "illimite") return 3_000;
  return PLAFOND_MENSUEL_REPLI;
}

export type ConsommationIAMensuelle = {
  utilise: number;
  quota: number;
  restant: number;
  pourcentage: number;
  seuilAlerte: 0 | 70 | 90 | 100;
  active: boolean;
  politique: "blocage" | "depassement_facture" | "achat_pack";
  creditsAchetes: number;
  coutEstimeHT: number;
  plafondCoutMensuelHT: number | null;
  debut: string;
  fin: string;
};

export async function consommationIAMensuelle(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<ConsommationIAMensuelle> {
  const debut = debutMoisUTC();
  const fin = debutMoisSuivantUTC();
  const [{ data: entreprise }, { data: lignes }] = await Promise.all([
    supabase
      .from("entreprises")
      .select("abonnement_offre,option_ia_statut,option_ia_palier,ia_active,ia_politique_quota,ia_credits_achetes,ia_plafond_cout_mensuel_ht")
      .eq("id", entrepriseId)
      .maybeSingle(),
    supabase
      .from("journal_ia")
      .select("operations_decomptees,cout_estime_ht")
      .eq("entreprise_id", entrepriseId)
      .eq("statut", "succes")
      .is("annule_at", null)
      .gte("created_at", debut.toISOString())
      .lt("created_at", fin.toISOString()),
  ]);
  const code = String(entreprise?.abonnement_offre ?? "");
  const quotaBase = ["mini", "pro", "business", "entreprise", "sur_mesure"].includes(code)
    ? offreTarifaireParCle(code).operationsIAIncluses
    : quotaHistorique(entreprise?.option_ia_palier, entreprise?.option_ia_statut);
  const creditsAchetes = Math.max(0, Number(entreprise?.ia_credits_achetes ?? 0));
  const quota = quotaBase + creditsAchetes;
  const utilise = (lignes ?? []).reduce(
    (total, ligne) => total + Math.max(0, Number(ligne.operations_decomptees ?? 1)),
    0,
  );
  const pourcentage = quota > 0 ? Math.min(100, Math.round((utilise / quota) * 100)) : 100;
  const seuilAlerte: ConsommationIAMensuelle["seuilAlerte"] =
    pourcentage >= 100 ? 100 : pourcentage >= 90 ? 90 : pourcentage >= 70 ? 70 : 0;
  const politiqueBrute = String(entreprise?.ia_politique_quota ?? "blocage");
  const politique: ConsommationIAMensuelle["politique"] =
    politiqueBrute === "depassement_facture" || politiqueBrute === "achat_pack" ? politiqueBrute : "blocage";
  const plafondBrut = Number(entreprise?.ia_plafond_cout_mensuel_ht);
  const plafondCoutMensuelHT = Number.isFinite(plafondBrut) && plafondBrut > 0 ? plafondBrut : null;
  return {
    utilise,
    quota,
    restant: Math.max(0, quota - utilise),
    pourcentage,
    seuilAlerte,
    active: entreprise?.ia_active !== false,
    politique,
    creditsAchetes,
    coutEstimeHT: (lignes ?? []).reduce((total, ligne) => total + Math.max(0, Number(ligne.cout_estime_ht ?? 0)), 0),
    plafondCoutMensuelHT,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
  };
}

/** Retourne un message si le quota mensuel d'opérations IA est atteint. */
export async function verifierPlafondIA(supabase: SupabaseClient, entrepriseId: string): Promise<string | null> {
  const consommation = await consommationIAMensuelle(supabase, entrepriseId);
  if (!consommation.active) return "Les fonctions IA ont été désactivées par un administrateur de l’entreprise.";
  if (
    consommation.plafondCoutMensuelHT !== null &&
    consommation.coutEstimeHT >= consommation.plafondCoutMensuelHT
  ) {
    return `Plafond budgétaire IA atteint (${consommation.plafondCoutMensuelHT.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT). Un administrateur peut le modifier dans Abonnement.`;
  }
  if (consommation.utilise >= consommation.quota && consommation.politique !== "depassement_facture") {
    return `Quota mensuel d'opérations IA atteint (${consommation.quota}). Le compteur sera réinitialisé le mois prochain. Un pack additionnel peut être activé dans Abonnement.`;
  }
  return null;
}

/** Best-effort : une erreur de journalisation ne doit jamais faire échouer l'appel IA lui-même. */
export function journaliserAppelIA(
  supabase: SupabaseClient,
  params: {
    entrepriseId: string;
    utilisateurId: string;
    fonctionnalite: string;
    statut: "succes" | "erreur";
    messageErreur?: string;
    operationId?: string;
    fournisseur?: string;
    modele?: string;
    jetonsEntree?: number;
    jetonsSortie?: number;
    jetonsTotal?: number;
    coutEstimeHT?: number;
  },
): void {
  supabase
    .from("journal_ia")
    .insert({
      entreprise_id: params.entrepriseId,
      utilisateur_id: params.utilisateurId,
      fonctionnalite: params.fonctionnalite,
      statut: params.statut,
      message_erreur: params.messageErreur?.slice(0, 500) ?? null,
      operation_id: params.operationId ?? null,
      fournisseur: params.fournisseur ?? "openai",
      modele: params.modele ?? process.env.OPENAI_MODEL ?? "gpt-5.1",
      jetons_entree: Math.max(0, Math.round(params.jetonsEntree ?? 0)),
      jetons_sortie: Math.max(0, Math.round(params.jetonsSortie ?? 0)),
      jetons_total: Math.max(0, Math.round(params.jetonsTotal ?? 0)),
      cout_estime_ht: Math.max(0, params.coutEstimeHT ?? 0),
      operations_decomptees: params.statut === "succes" ? 1 : 0,
    })
    .then(undefined, () => {});
}
