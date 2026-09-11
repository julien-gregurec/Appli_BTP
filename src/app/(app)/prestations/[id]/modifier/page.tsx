import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { PrestationForm } from "@/components/PrestationForm";
import { modifierPrestationAction } from "@/app/actions/prestations";
import type { PrestationCatalogue } from "@/lib/prestations";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { permissionsUtilisateur } from "@/lib/permissions";
import { chargerFicheArticleV2, chargerOptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2-serveur";
import type { ChampsCatalogueV2 } from "@/lib/prestations-catalogue-v2";
import { ActionsFicheArticle, FicheArticleComplements } from "@/components/prestations/FicheArticleComplements";

const SUCCES_FICHE: Record<string, string> = {
  image: "Image enregistrée.",
  code: "Code distributeur ajouté.",
  duplication: "Copie créée : vous modifiez maintenant la copie.",
};

export default async function ModifierPrestationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ id }, { error, succes }] = await Promise.all([params, searchParams]);
  if (devisV2Actif()) return <ModifierPrestationV2 id={id} error={error} succes={succes} />;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("prestations_catalogue").select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva").eq("id", id).eq("entreprise_id", ctx.entrepriseId).single();
  if (!data) notFound();
  return <main className="p-8"><div className="mx-auto max-w-2xl space-y-6"><div><Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Prestations</Link><h1 className="mt-1 text-xl font-semibold">Modifier la prestation</h1></div>{error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<PrestationForm action={modifierPrestationAction.bind(null, id)} prestation={data as PrestationCatalogue} submitLabel="Enregistrer" /></div></main>;
}

/**
 * Moteur de devis v2 : fiche complète de l'article — champs, prix et coûts selon les droits, famille,
 * notes internes, image, codes distributeurs, historique, favori et duplication.
 */
async function ModifierPrestationV2({ id, error, succes }: { id: string; error?: string; succes?: string }) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data }, catalogueV2, permissions] = await Promise.all([
    supabase.from("prestations_catalogue")
      .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva, reference_interne, reference_fabricant, code_barres, fabricant, fournisseur_id, categorie, famille_id, notes_internes, image_chemin")
      .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    chargerOptionsCatalogueV2(id),
    permissionsUtilisateur(ctx),
  ]);
  if (!data) notFound();
  const fiche = await chargerFicheArticleV2(id, (data.image_chemin as string | null) ?? null);
  const peutGerer = permissions === null || permissions.includes("gerer_devis");

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Bibliothèque d’articles</Link>
            <h1 className="mt-1 text-xl font-semibold">{String(data.designation)}</h1>
            <p className="font-mono text-sm text-neutral-500">{(data.reference_interne as string | null) ?? "Sans référence interne"}</p>
          </div>
          <ActionsFicheArticle prestationId={id} favori={fiche.favori} peutGerer={peutGerer} />
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && SUCCES_FICHE[succes] && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{SUCCES_FICHE[succes]}</p>}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <PrestationForm action={modifierPrestationAction.bind(null, id)} prestation={data as PrestationCatalogue & ChampsCatalogueV2} submitLabel="Enregistrer" catalogueV2={catalogueV2} />
          <FicheArticleComplements prestationId={id} designation={String(data.designation)} fiche={fiche} fournisseurs={catalogueV2.fournisseurs} peutGerer={peutGerer} />
        </div>
      </div>
    </main>
  );
}
