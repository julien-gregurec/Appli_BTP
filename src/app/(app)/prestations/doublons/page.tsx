import { notFound } from "next/navigation";
import { Lien as Link } from "@/components/Lien";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

type Doublon = { source: string; champ: string; reference_normalisee: string; identifiants: string[] };

const SOURCES: Record<string, { libelle: string; table: string; nom: string; lien: (id: string) => string }> = {
  prestation: { libelle: "Catalogue", table: "prestations_catalogue", nom: "designation", lien: (id) => `/prestations/${id}/modifier` },
  article: { libelle: "Stock", table: "articles_stock", nom: "designation", lien: (id) => `/stock/${id}` },
  ouvrage: { libelle: "Ouvrages", table: "ouvrages", nom: "nom", lien: (id) => `/ouvrages/bibliotheque/${id}` },
  client: { libelle: "Clients", table: "clients", nom: "nom", lien: (id) => `/clients/${id}` },
  chantier: { libelle: "Chantiers", table: "chantiers", nom: "nom", lien: (id) => `/chantiers/${id}` },
  fournisseur: { libelle: "Fournisseurs", table: "fournisseurs", nom: "nom", lien: (id) => `/fournisseurs/${id}` },
};

const CHAMPS: Record<string, string> = {
  reference_interne: "référence interne",
  reference_fabricant: "référence fabricant",
  reference: "référence",
  code_article: "code distributeur",
};

/**
 * Contrôle des doublons de références : SIGNALÉS, jamais fusionnés. La liste vient de la base
 * (`doublons_references`, SECURITY INVOKER) : chacun ne voit que ce que ses droits lui montrent.
 */
export default async function DoublonsPage() {
  if (!devisV2Actif()) notFound();
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doublons_references", { p_entreprise_id: ctx.entrepriseId });
  const doublons = (data ?? []) as Doublon[];

  // Noms des objets concernés, par source (une requête par table, lecture sous RLS).
  const noms = new Map<string, string>();
  await Promise.all(Object.entries(SOURCES).map(async ([source, s]) => {
    const ids = [...new Set(doublons.flatMap((d) => (d.source === source || d.source.split("+").includes(source) ? d.identifiants : [])))];
    if (!ids.length) return;
    const { data: lignes } = await supabase.from(s.table).select(`id, ${s.nom}`).in("id", ids);
    for (const l of (lignes ?? []) as unknown as Array<Record<string, unknown>>) noms.set(String(l.id), String(l[s.nom] ?? ""));
  }));

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Bibliothèque d’articles</Link>
          <h1 className="mt-1 text-xl font-semibold">Contrôle des doublons</h1>
          <p className="text-sm text-neutral-500">Références identiques une fois ignorés casse, accents, espaces et séparateurs. Rien n’est fusionné : ouvrez chaque fiche pour corriger.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messageErreurUtilisateur("DoublonsPage", error, "Contrôle impossible pour le moment.")}</p>}
        {!error && doublons.length === 0 && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Aucun doublon de référence.</p>}
        {doublons.length > 0 && (
          <ul className="space-y-3">
            {doublons.map((d, i) => {
              const sources = d.source.split("+");
              return (
                <li key={`${d.source}-${d.champ}-${d.reference_normalisee}-${i}`} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                  <p className="text-sm">
                    <span className="font-medium">{sources.map((s) => SOURCES[s]?.libelle ?? (s === "code_fournisseur" ? "Codes distributeurs" : s)).join(" et ")}</span>
                    {" — "}{CHAMPS[d.champ] ?? d.champ} <span className="font-mono">« {d.reference_normalisee} »</span>
                    <span className="text-neutral-500"> ({d.identifiants.length} fiches)</span>
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {d.identifiants.map((id, j) => {
                      const source = SOURCES[sources[Math.min(j, sources.length - 1)]] ?? (d.source === "code_fournisseur" ? undefined : SOURCES[sources[0]]);
                      const libelle = noms.get(id) ?? "Fiche";
                      return (
                        <li key={`${id}-${j}`}>
                          {source ? (
                            <Link href={source.lien(id)} className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm hover:underline dark:border-neutral-700">{libelle}</Link>
                          ) : (
                            <span className="inline-flex min-h-11 items-center rounded-md border border-neutral-200 px-3 text-sm text-neutral-600">{libelle}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
