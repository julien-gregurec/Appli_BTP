import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { typePrestationLabel } from "@/lib/prestations";
import { changerActivationPrestationAction } from "@/app/actions/prestations";
import { basculerFavoriPrestationAction } from "@/app/actions/catalogue-v2";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { Lien as Link } from "@/components/Lien";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { permissionsUtilisateur } from "@/lib/permissions";
import { TableCataloguePrestations, type LignePrestationV2 } from "@/components/prestations/TableCataloguePrestations";

export default async function PrestationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (devisV2Actif()) return <PrestationsCatalogueV2 error={(await searchParams).error} />;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: prestations } = await supabase
    .from("prestations_catalogue")
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva, actif")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("actif", { ascending: false })
    .order("designation");

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-semibold">Prestations</h1><p className="text-sm text-neutral-500">Catalogue réutilisable dans les devis</p></div>
          <Link href="/prestations/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">+ Nouvelle prestation</Link>
        </div>
        <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Prestation</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Prix HT</th><th className="px-4 py-2">TVA</th><th className="px-4 py-2">État</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {(prestations ?? []).map((p) => (
                <tr key={p.id} className={`border-t border-neutral-100 dark:border-neutral-800 ${p.actif ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3"><div className="font-medium">{p.designation}</div>{p.description && <div className="mt-0.5 max-w-md truncate text-xs text-neutral-500">{p.description}</div>}</td>
                  <td className="px-4 py-3">{typePrestationLabel(p.type)}</td>
                  <td className="px-4 py-3 font-mono">{euros(Number(p.prix_unitaire_ht))} / {p.unite}</td>
                  <td className="px-4 py-3">{Number(p.taux_tva)} %</td>
                  <td className="px-4 py-3">{p.actif ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-3"><Link href={`/prestations/${p.id}/modifier`} className="hover:underline">Modifier</Link><form action={changerActivationPrestationAction.bind(null, p.id, !p.actif)}><ConfirmSubmitButton message={p.actif ? `Désactiver « ${p.designation} » ?` : `Réactiver « ${p.designation} » ?`} className="text-neutral-500 hover:underline">{p.actif ? "Désactiver" : "Réactiver"}</ConfirmSubmitButton></form></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

/**
 * Catalogue en moteur de devis v2 : références, code distributeur principal, famille, favoris de
 * l'utilisateur, recherche immédiate. Aucun prix d'achat n'est lu ici.
 */
async function PrestationsCatalogueV2({ error }: { error?: string }) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: prestations }, { data: favoris }, { data: codes }, permissions] = await Promise.all([
    supabase
      .from("prestations_catalogue")
      .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva, actif, reference_interne, reference_fabricant, fabricant, famille_id, categorie")
      .eq("entreprise_id", ctx.entrepriseId)
      .order("actif", { ascending: false })
      .order("designation"),
    supabase.from("catalogue_favoris").select("prestation_id")
      .eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).not("prestation_id", "is", null),
    supabase.from("catalogue_codes_fournisseurs").select("prestation_id, code_article, principal")
      .eq("entreprise_id", ctx.entrepriseId).not("prestation_id", "is", null)
      .order("principal", { ascending: false }).order("cree_le"),
    permissionsUtilisateur(ctx),
  ]);
  const peutGerer = permissions === null || permissions.includes("gerer_devis");
  const mesFavoris = new Set(((favoris ?? []) as Array<{ prestation_id: string }>).map((f) => f.prestation_id));
  const codePrincipal = new Map<string, string>();
  for (const c of (codes ?? []) as Array<{ prestation_id: string; code_article: string }>) {
    if (!codePrincipal.has(c.prestation_id)) codePrincipal.set(c.prestation_id, c.code_article);
  }

  const lignes: LignePrestationV2[] = (prestations ?? []).map((p) => {
    const id = String(p.id);
    const favori = mesFavoris.has(id);
    return {
      id,
      designation: String(p.designation),
      description: (p.description as string | null) ?? null,
      referenceInterne: (p.reference_interne as string | null) ?? null,
      referenceFabricant: (p.reference_fabricant as string | null) ?? null,
      fabricant: (p.fabricant as string | null) ?? null,
      codeFournisseur: codePrincipal.get(id) ?? null,
      familleId: (p.famille_id as string | null) ?? null,
      famille: (p.categorie as string | null) ?? null,
      favori,
      type: typePrestationLabel(String(p.type)),
      prix: `${euros(Number(p.prix_unitaire_ht))} / ${p.unite}`,
      tva: `${Number(p.taux_tva)} %`,
      actif: p.actif !== false,
      favoriBouton: (
        <form action={basculerFavoriPrestationAction.bind(null, id, !favori, "/prestations")}>
          <button type="submit" className="min-h-11 min-w-11 text-lg text-amber-500" aria-label={favori ? `Retirer « ${p.designation} » des favoris` : `Ajouter « ${p.designation} » aux favoris`} title={favori ? "Retirer des favoris" : "Ajouter aux favoris"}>
            {favori ? "★" : "☆"}
          </button>
        </form>
      ),
      actions: (
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <Link href={`/prestations/${id}/modifier`} className="inline-flex min-h-11 items-center hover:underline">{peutGerer ? "Modifier" : "Ouvrir"}</Link>
          {peutGerer && (
            <form action={changerActivationPrestationAction.bind(null, id, !p.actif)}>
              <ConfirmSubmitButton message={p.actif ? `Archiver « ${p.designation} » ?` : `Réactiver « ${p.designation} » ?`} className="min-h-11 text-neutral-500 hover:underline">{p.actif ? "Archiver" : "Réactiver"}</ConfirmSubmitButton>
            </form>
          )}
        </div>
      ),
    };
  });

  const bouton = "inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700";
  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Bibliothèque d’articles</h1><p className="text-sm text-neutral-500">Catalogue réutilisable dans les devis</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/prestations/familles" className={bouton}>Familles</Link>
            <Link href="/prestations/doublons" className={bouton}>Contrôle des doublons</Link>
            {peutGerer && <Link href="/prestations/nouveau" className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">+ Nouvel article</Link>}
          </div>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <TableCataloguePrestations lignes={lignes} />
      </div>
    </main>
  );
}
