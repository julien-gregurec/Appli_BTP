import { notFound } from "next/navigation";
import { Lien as Link } from "@/components/Lien";
import { HistoriqueObjet } from "@/components/HistoriqueObjet";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { planningV2Actif } from "@/lib/planning/v2-serveur";
import { jourDe } from "@/lib/planning/modele";

/** Historique d'un évènement du planning v2 (création, modifications, affectations, suppression). */
export default async function HistoriquePlanningPage({ searchParams }: { searchParams: Promise<{ evenement?: string }> }) {
  if (!planningV2Actif()) notFound();
  const { evenement } = await searchParams;
  if (!evenement) notFound();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase.from("planning_evenements").select("id, titre, debut").eq("id", evenement).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  const jour = data ? jourDe(String(data.debut)) : jourDe(new Date());
  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={`/planning?jour=${jour}`} className="text-sm text-neutral-500 hover:underline">← Planning</Link>
        <h1 className="text-xl font-semibold">Historique — {data ? String(data.titre) : "évènement supprimé"}</h1>
        <HistoriqueObjet ressource="planning" id={evenement} limite={100} />
      </div>
    </main>
  );
}
