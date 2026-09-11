import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { PrestationForm } from "@/components/PrestationForm";
import { modifierPrestationAction } from "@/app/actions/prestations";
import type { PrestationCatalogue } from "@/lib/prestations";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerOptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2-serveur";
import type { ChampsCatalogueV2 } from "@/lib/prestations-catalogue-v2";

export default async function ModifierPrestationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  if (devisV2Actif()) return <ModifierPrestationV2 id={id} error={error} />;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("prestations_catalogue").select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva").eq("id", id).eq("entreprise_id", ctx.entrepriseId).single();
  if (!data) notFound();
  return <main className="p-8"><div className="mx-auto max-w-2xl space-y-6"><div><Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Prestations</Link><h1 className="mt-1 text-xl font-semibold">Modifier la prestation</h1></div>{error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<PrestationForm action={modifierPrestationAction.bind(null, id)} prestation={data as PrestationCatalogue} submitLabel="Enregistrer" /></div></main>;
}

/** Moteur de devis v2 : champs de catalogue, fournisseur et prix d'achat selon les droits. */
async function ModifierPrestationV2({ id, error }: { id: string; error?: string }) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data }, catalogueV2] = await Promise.all([
    supabase.from("prestations_catalogue")
      .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva, reference_interne, reference_fabricant, code_barres, fabricant, fournisseur_id, categorie")
      .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    chargerOptionsCatalogueV2(id),
  ]);
  if (!data) notFound();
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-2xl space-y-6"><div><Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Prestations</Link><h1 className="mt-1 text-xl font-semibold">Modifier la prestation</h1></div>{error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<PrestationForm action={modifierPrestationAction.bind(null, id)} prestation={data as PrestationCatalogue & ChampsCatalogueV2} submitLabel="Enregistrer" catalogueV2={catalogueV2} /></div></main>;
}
