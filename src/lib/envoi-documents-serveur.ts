import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModeleEmail } from "@/lib/email-modeles";
import { modelesPour } from "@/lib/email-modeles";

export type ContexteEnvoi = {
  modeles: ModeleEmail[];
  cgvDisponible: boolean;
  piecesDisponibles: Array<{ id: string; nom: string; taille: number | null }>;
};

/**
 * Ce que le dialogue d'envoi propose (GP V1, lot G) : modèles d'e-mail de l'entreprise, CGV
 * renseignées, documents du chantier lié. Tolérant : sans la migration du lot, tout est vide et le
 * dialogue garde son comportement historique.
 */
export async function chargerContexteEnvoi(
  supabase: SupabaseClient,
  o: { entrepriseId: string; typeDocument: "devis" | "facture"; chantierId: string | null },
): Promise<ContexteEnvoi> {
  const [modeles, entreprise, pieces] = await Promise.all([
    supabase.from("modeles_email").select("id, nom, type_document, objet, corps, par_defaut").eq("entreprise_id", o.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("entreprises").select("cgv_texte").eq("id", o.entrepriseId).maybeSingle(),
    o.chantierId
      ? supabase.from("documents_chantier").select("id, nom, taille_octets").eq("entreprise_id", o.entrepriseId).eq("chantier_id", o.chantierId).order("nom").limit(50)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  const liste = (modeles.error ? [] : (modeles.data ?? [])) as Array<Record<string, unknown>>;
  const cgv = entreprise.error ? null : (entreprise.data as { cgv_texte?: string | null } | null)?.cgv_texte;
  return {
    modeles: modelesPour(liste.map((m) => ({
      id: String(m.id), nom: String(m.nom), typeDocument: m.type_document as ModeleEmail["typeDocument"], objet: String(m.objet), corps: String(m.corps), parDefaut: m.par_defaut === true,
    })), o.typeDocument),
    cgvDisponible: typeof cgv === "string" && cgv.trim().length > 0,
    piecesDisponibles: ((pieces.error ? [] : (pieces.data ?? [])) as Array<Record<string, unknown>>).map((p) => ({ id: String(p.id), nom: String(p.nom), taille: typeof p.taille_octets === "number" ? p.taille_octets : null })),
  };
}
