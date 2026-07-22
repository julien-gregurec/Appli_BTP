import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { modifierLocalisationChantierAction } from "@/app/actions/chantiers";
import { LocaliserGPSButton } from "@/components/LocaliserGPSButton";

export default async function LocalisationChantierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; succes?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: chantier } = await supabase
    .from("chantiers")
    .select("id, nom, latitude, longitude, rayon_metres")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!chantier) notFound();

  const modifier = modifierLocalisationChantierAction.bind(null, chantier.id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href={`/chantiers/${chantier.id}`} className="text-sm text-neutral-500 hover:underline">← {chantier.nom}</Link>
          <h1 className="mt-1 text-xl font-semibold">Position GPS du chantier</h1>
          <p className="mt-1 text-sm text-neutral-500">Utilisée par le suivi de zone pendant le pointage (Paramètres → Suivi de zone chantier), pour alerter si un salarié pointé quitte le périmètre.</p>
        </div>

        {messages.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messages.error}</p>}
        {messages.succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Position enregistrée.</p>}

        <form action={modifier} className="space-y-4 rounded-md border p-5">
          <LocaliserGPSButton
            latitudeDefaut={chantier.latitude}
            longitudeDefaut={chantier.longitude}
            rayonDefaut={chantier.rayon_metres ?? 300}
          />
          <p className="text-xs text-neutral-500">Le mieux est de se rendre sur place et de cliquer sur « Utiliser ma position actuelle ». Laissez vide pour désactiver le suivi de zone sur ce chantier.</p>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            Enregistrer
          </button>
        </form>
      </div>
    </main>
  );
}
