import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_NAME } from "@/lib/brand";
import { construireVueDocument, type VueDocument } from "@/lib/devis/document-modele";
import { sourceDepuisRendu, type ReponseRendu } from "@/lib/devis/rendu-source";
import { hacherTokenPartage } from "@/lib/documents-partage";

/**
 * Vue v2 d'une réponse de rendu, ou `null` : document du moteur v1, à rendre par le chemin
 * historique (`DocumentImprimable`), inchangé.
 */
export function vueDepuisReponse(reponse: ReponseRendu, o: { estDuplicata?: boolean } = {}): VueDocument | null {
  if (moteurDeReponse(reponse) !== 2 || !reponse.rendu) return null;
  return construireVueDocument(sourceDepuisRendu(reponse.rendu, { nomProduit: PRODUCT_NAME, estDuplicata: o.estDuplicata }));
}

/** Moteur d'impression à demander au générateur PDF pour cette réponse. */
export function moteurDeReponse(reponse: ReponseRendu | null | undefined): 1 | 2 {
  return reponse && reponse.source !== "moteur_v1" && reponse.rendu?.moteur === 2 ? 2 : 1;
}

/** Message d'une impression v2 refusée pour débordement — à montrer tel quel à l'utilisateur. */
export function estDebordementMiseEnPage(e: unknown): e is Error {
  return e instanceof Error && e.message.startsWith("Mise en page à corriger");
}

/**
 * Accès serveur au moteur de devis v2 (éditeur visuel, ouvrages, rendu figé).
 *
 * ── Activation ───────────────────────────────────────────────────────────────────────────
 * Le moteur v2 repose sur un schéma qui n'est pas encore au ledger (SQL proposé, non numéroté).
 * Il reste donc ÉTEINT tant que `GP_DEVIS_V2=1` n'est pas posé dans l'environnement du serveur,
 * ce qui ne doit arriver qu'une fois la migration intégrée et appliquée. Éteint, l'application se
 * comporte exactement comme avant ce lot : moteur v1, éditeur historique.
 *
 * ── Une erreur n'est pas une absence ─────────────────────────────────────────────────────
 * Si la fonction SQL n'existe pas (schéma non migré alors que le drapeau est posé), on retombe
 * sur le moteur v1 : c'est une absence connue, sans risque. Toute AUTRE erreur est remontée — un
 * refus d'accès ou une panne ne doivent jamais se transformer silencieusement en « document v1 ».
 */

export function devisV2Actif(): boolean {
  return process.env.GP_DEVIS_V2 === "1";
}

type ErreurSupabase = { code?: string | null; message?: string | null } | null | undefined;

/** Fonction RPC inconnue du schéma (PostgREST PGRST202, PostgreSQL 42883). */
export function estFonctionAbsente(erreur: ErreurSupabase): boolean {
  return erreur?.code === "PGRST202" || erreur?.code === "42883";
}

export class ErreurRenduDocument extends Error {
  constructor(public readonly cause: ErreurSupabase) {
    super(`Rendu du document impossible (${cause?.code ?? "sans code"}).`);
  }
}

const V1: ReponseRendu = { source: "moteur_v1", rendu: null };

/**
 * Rendu d'un document pour un utilisateur connecté (RLS et droits vérifiés par la base).
 * `null` : document introuvable ou inaccessible. `{ source: "moteur_v1" }` : à rendre par le
 * chemin historique.
 */
export async function chargerRenduDocument(
  supabase: SupabaseClient,
  typeDocument: "devis" | "facture",
  documentId: string,
): Promise<ReponseRendu | null> {
  if (!devisV2Actif()) return V1;
  const { data, error } = await supabase.rpc("document_rendu", { p_type_document: typeDocument, p_document_id: documentId });
  if (error) {
    if (estFonctionAbsente(error)) return V1;
    throw new ErreurRenduDocument(error);
  }
  return (data as ReponseRendu | null) ?? null;
}

/** Rendu d'un document partagé par jeton (portail client, pièce jointe d'e-mail), sans service_role. */
export async function chargerRenduParJeton(supabase: SupabaseClient, token: string): Promise<ReponseRendu | null> {
  if (!devisV2Actif()) return V1;
  if (!token) return null;
  const { data, error } = await supabase.rpc("document_rendu_par_token", { p_token_hash: hacherTokenPartage(token) });
  if (error) {
    if (estFonctionAbsente(error)) return V1;
    throw new ErreurRenduDocument(error);
  }
  return (data as ReponseRendu | null) ?? null;
}
