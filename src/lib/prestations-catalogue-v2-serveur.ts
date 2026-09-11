import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import type { FournisseurOption, OptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2";

/**
 * Options du formulaire de prestation en moteur v2 : fournisseurs de l'entreprise et prix d'achat.
 *
 * À n'appeler QUE lorsque `devisV2Actif()` est vrai (la table des coûts n'existe qu'avec la
 * migration). Le prix d'achat n'est LU qu'avec `voir_couts_devis` : sans ce droit, il ne quitte
 * jamais la base, et le formulaire n'en montre ni champ ni valeur.
 */
export async function chargerOptionsCatalogueV2(prestationId: string | null): Promise<OptionsCatalogueV2> {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const possede = (cle: string) => permissions === null || permissions.includes(cle);
  const voir = possede("voir_couts_devis");
  const gerer = voir && possede("gerer_couts_devis");
  const supabase = await createClient();

  const [{ data: fournisseurs }, cout] = await Promise.all([
    supabase.from("fournisseurs").select("id, nom, reference, actif").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    voir && prestationId
      ? supabase.from("prestations_catalogue_couts").select("prix_achat_ht")
        .eq("prestation_id", prestationId).eq("entreprise_id", ctx.entrepriseId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const brut = (cout.data as { prix_achat_ht?: number | string | null } | null)?.prix_achat_ht;

  return {
    fournisseurs: ((fournisseurs ?? []) as Array<Record<string, unknown>>).map((f): FournisseurOption => ({
      id: String(f.id),
      nom: String(f.nom),
      reference: (f.reference as string | null) ?? null,
      actif: f.actif !== false,
    })),
    cout: gerer ? "edition" : voir ? "lecture" : "absent",
    prixAchatHt: voir && brut !== null && brut !== undefined && Number.isFinite(Number(brut)) ? Number(brut) : null,
  };
}
