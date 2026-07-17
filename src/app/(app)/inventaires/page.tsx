import Link from "next/link";
import { InventaireCreationForm } from "@/components/InventaireCreationForm";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

type Zone = { id: string; code: string; nom: string };
type Article = { id: string; reference: string; designation: string; quantite_stock: number; unite: string; zone_id: string | null };
type ZoneLiee = { code: string; nom: string };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function InventairesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: zonesData }, { data: articlesData }, { data: inventaires }] = await Promise.all([
    supabase.from("zones_depot").select("id,code,nom").eq("entreprise_id", contexte.entrepriseId).eq("actif", true).order("code"),
    supabase.from("articles_stock").select("id,reference,designation,quantite_stock,unite,zone_id").eq("entreprise_id", contexte.entrepriseId).eq("actif", true).order("designation"),
    supabase.from("inventaires").select("id,numero,date_inventaire,statut,commentaire,zone:zones_depot(code,nom),lignes:lignes_inventaire(id)").eq("entreprise_id", contexte.entrepriseId).order("created_at", { ascending: false }),
  ]);
  const zones = (zonesData ?? []) as Zone[];
  const articles = (articlesData ?? []).map((article) => ({ ...article, quantite_stock: Number(article.quantite_stock) })) as Article[];

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Inventaires</h1>
          <p className="text-sm text-neutral-500">Choisissez une zone du dépôt et les références à compter, puis analysez les écarts physiques et financiers.</p>
        </div>
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <InventaireCreationForm zones={zones} articles={articles} />

        <div className="overflow-x-auto rounded-md border dark:border-neutral-800">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-3 py-2">N°</th><th>Date</th><th>Zone</th><th>Articles</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {inventaires?.map((inventaire) => {
                const zone = un(inventaire.zone as ZoneLiee | ZoneLiee[] | null);
                return (
                  <tr key={inventaire.id} className="border-t dark:border-neutral-800">
                    <td className="px-3 py-3 font-mono"><Link href={`/inventaires/${inventaire.id}`} className="hover:underline">{inventaire.numero}</Link></td>
                    <td>{inventaire.date_inventaire}</td>
                    <td>{zone ? `${zone.code} · ${zone.nom}` : "Sélection libre"}</td>
                    <td>{Array.isArray(inventaire.lignes) ? inventaire.lignes.length : 0}</td>
                    <td className="capitalize">{inventaire.statut}</td>
                  </tr>
                );
              })}
              {!inventaires?.length && <tr><td colSpan={5} className="p-8 text-center text-neutral-500">Aucun inventaire.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
