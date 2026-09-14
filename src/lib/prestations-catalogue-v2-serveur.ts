import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import type { FournisseurOption, OptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2";
import type { Famille } from "@/lib/catalogue/familles";
import { lireModePrix } from "@/lib/catalogue/prix-article";
import type { EntreeHistorique } from "@/lib/historique";

const nombreOuNul = (brut: unknown): number | null =>
  brut !== null && brut !== undefined && brut !== "" && Number.isFinite(Number(brut)) ? Number(brut) : null;

/** Familles de l'entreprise (lecture soumise à la RLS : accès devis, ouvrages ou stock). */
export async function chargerFamilles(): Promise<Famille[]> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogue_familles")
    .select("id, parent_id, nom, ordre, actif")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("ordre")
    .order("nom");
  return ((data ?? []) as Array<Record<string, unknown>>).map((f) => ({
    id: String(f.id),
    parentId: (f.parent_id as string | null) ?? null,
    nom: String(f.nom),
    ordre: Number(f.ordre ?? 0),
    actif: f.actif !== false,
  }));
}

/**
 * Options du formulaire de prestation en moteur v2 : fournisseurs, familles, prix d'achat, coefficient.
 *
 * À n'appeler QUE lorsque `devisV2Actif()` est vrai (les tables n'existent qu'avec les migrations). Le
 * coût n'est LU qu'avec `voir_couts_devis` : sans ce droit, il ne quitte jamais la base, et le
 * formulaire n'en montre ni champ ni valeur — pas même le mode de prix.
 */
export async function chargerOptionsCatalogueV2(prestationId: string | null): Promise<OptionsCatalogueV2> {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const possede = (cle: string) => permissions === null || permissions.includes(cle);
  const voir = possede("voir_couts_devis");
  const gerer = voir && possede("gerer_couts_devis");
  const supabase = await createClient();

  const [{ data: fournisseurs }, familles, cout] = await Promise.all([
    supabase.from("fournisseurs").select("id, nom, reference, actif").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    chargerFamilles(),
    voir && prestationId
      ? supabase.from("prestations_catalogue_couts").select("prix_achat_ht, coefficient, mode_prix")
        .eq("prestation_id", prestationId).eq("entreprise_id", ctx.entrepriseId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ligneCout = (cout.data as { prix_achat_ht?: unknown; coefficient?: unknown; mode_prix?: unknown } | null) ?? null;

  return {
    fournisseurs: ((fournisseurs ?? []) as Array<Record<string, unknown>>).map((f): FournisseurOption => ({
      id: String(f.id),
      nom: String(f.nom),
      reference: (f.reference as string | null) ?? null,
      actif: f.actif !== false,
    })),
    familles,
    cout: gerer ? "edition" : voir ? "lecture" : "absent",
    prixAchatHt: voir ? nombreOuNul(ligneCout?.prix_achat_ht) : null,
    coefficient: voir ? nombreOuNul(ligneCout?.coefficient) : null,
    modePrix: voir ? lireModePrix(ligneCout?.mode_prix) : "saisi",
  };
}

export type CodeDistributeur = {
  id: string;
  fournisseurId: string;
  fournisseur: string;
  code: string;
  principal: boolean;
};

export type FicheArticleV2 = {
  codes: CodeDistributeur[];
  historique: EntreeHistorique[];
  favori: boolean;
  imageUrl: string | null;
};

const DUREE_URL_IMAGE_S = 900;

/**
 * Compléments de la fiche d'un article (page de modification) : codes distributeurs, historique,
 * favori de l'utilisateur, image (URL signée de courte durée : le bucket est privé).
 * Tout passe par la RLS : un historique sensible n'arrive jamais sans `voir_couts_devis`.
 */
export async function chargerFicheArticleV2(prestationId: string, imageChemin: string | null): Promise<FicheArticleV2> {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: codes }, { data: historique }, { data: favori }, image] = await Promise.all([
    supabase.from("catalogue_codes_fournisseurs")
      .select("id, fournisseur_id, code_article, principal, fournisseurs(nom)")
      .eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId)
      .order("principal", { ascending: false }).order("cree_le"),
    supabase.from("historique_objets")
      .select("id, action, champ, avant, apres, sensible, cree_le, utilisateur_id")
      .eq("entreprise_id", ctx.entrepriseId).eq("ressource", "article").eq("ressource_id", prestationId)
      .order("cree_le", { ascending: false }).order("id", { ascending: false })
      .limit(50),
    supabase.from("catalogue_favoris").select("id")
      .eq("entreprise_id", ctx.entrepriseId).eq("prestation_id", prestationId).eq("utilisateur_id", ctx.userId)
      .maybeSingle(),
    imageChemin
      ? supabase.storage.from("catalogue-images").createSignedUrl(imageChemin, DUREE_URL_IMAGE_S)
      : Promise.resolve({ data: null }),
  ]);

  const lignesHistorique = (historique ?? []) as Array<Record<string, unknown>>;
  const auteursIds = [...new Set(lignesHistorique.map((h) => h.utilisateur_id).filter((v): v is string => typeof v === "string"))];
  const { data: auteurs } = auteursIds.length
    ? await supabase.from("utilisateurs").select("id, prenom, nom").in("id", auteursIds)
    : { data: [] };
  const nomAuteur = new Map(((auteurs ?? []) as Array<Record<string, unknown>>).map((u) => [
    String(u.id), [u.prenom, u.nom].filter(Boolean).join(" ") || "Utilisateur",
  ]));

  return {
    codes: ((codes ?? []) as Array<Record<string, unknown>>).map((c) => {
      const f = c.fournisseurs as { nom?: string } | Array<{ nom?: string }> | null;
      const nom = Array.isArray(f) ? f[0]?.nom : f?.nom;
      return {
        id: String(c.id),
        fournisseurId: String(c.fournisseur_id),
        fournisseur: nom ?? "Fournisseur",
        code: String(c.code_article),
        principal: c.principal === true,
      };
    }),
    historique: lignesHistorique.map((h) => ({
      id: Number(h.id),
      action: String(h.action),
      champ: (h.champ as string | null) ?? null,
      avant: h.avant ?? null,
      apres: h.apres ?? null,
      sensible: h.sensible === true,
      creeLe: String(h.cree_le),
      auteur: typeof h.utilisateur_id === "string" ? nomAuteur.get(h.utilisateur_id) ?? "Utilisateur" : null,
    })),
    favori: Boolean(favori),
    imageUrl: (image.data as { signedUrl?: string } | null)?.signedUrl ?? null,
  };
}
