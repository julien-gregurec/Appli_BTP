import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { lireParametresDevis } from "@/lib/devis/parametres-devis";
import { ParametresDevisForm } from "@/components/parametres/ParametresDevisForm";

export const dynamic = "force-dynamic";

export default async function ParametresDevisPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_parametres");
  const { data } = await supabase.from("parametres_devis").select("*").eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Devis</h1>
          <p className="text-sm text-neutral-500">Valeurs par défaut des nouveaux devis et rappel de sauvegarde. Propres à votre entreprise.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Réglages enregistrés.</p>}
        <ParametresDevisForm initial={lireParametresDevis(data)} peutGerer={peutGerer} />
      </div>
    </main>
  );
}
