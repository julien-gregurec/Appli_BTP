import Link from "next/link";
import { notFound } from "next/navigation";
import { enregistrerInventaireAction } from "@/app/actions/inventaires";
import { euros } from "@/lib/devis";
import { getContexteEntreprise } from "@/lib/entreprise";
import { calculerSyntheseInventaire } from "@/lib/inventaires";
import { createClient } from "@/lib/supabase/server";

type ArticleInventaire = { reference: string; designation: string; unite: string };
type LigneInventaire = {
  id: string;
  quantite_theorique: number;
  quantite_comptee: number | null;
  prix_achat_ht_snapshot: number;
  article: ArticleInventaire | ArticleInventaire[] | null;
};

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export default async function InventairePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const message = await searchParams;
  const contexte = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: inventaire }, { data: lignesData }] = await Promise.all([
    supabase.from("inventaires").select("*").eq("id", id).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase
      .from("lignes_inventaire")
      .select("id,quantite_theorique,quantite_comptee,prix_achat_ht_snapshot,article:articles_stock(reference,designation,unite)")
      .eq("inventaire_id", id)
      .eq("entreprise_id", contexte.entrepriseId)
      .order("created_at"),
  ]);
  if (!inventaire) notFound();

  const lignes = (lignesData ?? []) as LigneInventaire[];
  const synthese = calculerSyntheseInventaire(lignes.map((ligne) => ({
    quantiteTheorique: Number(ligne.quantite_theorique),
    quantiteComptee: ligne.quantite_comptee === null ? null : Number(ligne.quantite_comptee),
    prixAchatHt: Number(ligne.prix_achat_ht_snapshot),
  })));
  const action = enregistrerInventaireAction.bind(null, id);
  const cloture = inventaire.statut === "valide";
  const prixManquants = lignes.filter((ligne) => Number(ligne.prix_achat_ht_snapshot) === 0).length;

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/inventaires" className="text-sm text-neutral-500 hover:underline">← Inventaires</Link>
            <h1 className="mt-1 text-2xl font-semibold">{inventaire.numero}</h1>
            <p className="text-sm text-neutral-500">{inventaire.date_inventaire} · <span className="capitalize">{inventaire.statut}</span></p>
          </div>
          {cloture && (
            <a href={`/api/inventaires/${id}/cloture`} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-center text-sm font-semibold text-white">
              Exporter la clôture comptable CSV
            </a>
          )}
        </div>

        {message.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message.error}</p>}
        {message.success && <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{message.success}</p>}
        {prixManquants > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {prixManquants} article{prixManquants > 1 ? "s ont" : " a"} un prix d’achat nul. Complétez les prix avant le prochain inventaire pour obtenir une valorisation comptable complète.
          </p>
        )}

        <section>
          <h2 className="font-semibold">Synthèse de clôture au prix d’achat HT</h2>
          <p className="mt-1 text-sm text-neutral-500">Les prix sont figés au démarrage de l’inventaire : une modification ultérieure du catalogue ne change pas ce rapport.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Carte label="Articles comptés" valeur={`${synthese.articlesComptes} / ${synthese.articles}`} />
            <Carte label="Articles avec écart" valeur={String(synthese.articlesAvecEcart)} alerte={synthese.articlesAvecEcart > 0} />
            <Carte label="Valeur théorique HT" valeur={euros(synthese.valeurTheoriqueHt)} />
            <Carte label="Valeur comptée HT" valeur={euros(synthese.valeurCompteeHt)} />
            <Carte
              label="Écart de valeur HT"
              valeur={`${synthese.ecartValeurHt > 0 ? "+" : ""}${euros(synthese.ecartValeurHt)}`}
              tonalite={synthese.ecartValeurHt < 0 ? "negatif" : synthese.ecartValeurHt > 0 ? "positif" : "neutre"}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Quantités manquantes : {nombre(synthese.quantiteManquante)}</span>
            <span className="rounded-full bg-green-50 px-3 py-1 text-green-700">Quantités excédentaires : {nombre(synthese.quantiteExcedentaire)}</span>
          </div>
        </section>

        <form action={action}>
          <div className="overflow-x-auto rounded-md border dark:border-neutral-800">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-3">Référence</th>
                  <th>Article</th>
                  <th className="text-right">Théorique</th>
                  <th className="text-right">Compté</th>
                  <th className="text-right">Écart</th>
                  <th className="text-right">Prix achat HT</th>
                  <th className="text-right">Valeur théorique</th>
                  <th className="px-3 text-right">Valeur comptée</th>
                  <th className="px-3 text-right">Écart HT</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => {
                  const article = un(ligne.article);
                  const theorique = Number(ligne.quantite_theorique);
                  const compte = ligne.quantite_comptee === null ? null : Number(ligne.quantite_comptee);
                  const prix = Number(ligne.prix_achat_ht_snapshot);
                  const ecartQuantite = compte === null ? null : compte - theorique;
                  const valeurTheorique = theorique * prix;
                  const valeurComptee = compte === null ? null : compte * prix;
                  const ecartValeur = valeurComptee === null ? null : valeurComptee - valeurTheorique;
                  return (
                    <tr key={ligne.id} className={`border-t dark:border-neutral-800 ${ecartQuantite ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                      <td className="px-3 py-3 font-mono">{article?.reference}</td>
                      <td>{article?.designation}</td>
                      <td className="text-right font-mono">{nombre(theorique)} {article?.unite}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          name={`q_${ligne.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          disabled={inventaire.statut !== "brouillon"}
                          defaultValue={ligne.quantite_comptee ?? ligne.quantite_theorique}
                          className="w-28 rounded border px-2 py-1 text-right dark:bg-neutral-900"
                        />
                      </td>
                      <td className={`text-right font-mono ${ecartQuantite && ecartQuantite < 0 ? "text-red-700" : ecartQuantite && ecartQuantite > 0 ? "text-green-700" : ""}`}>
                        {ecartQuantite === null ? "—" : `${ecartQuantite > 0 ? "+" : ""}${nombre(ecartQuantite)}`}
                      </td>
                      <td className="text-right font-mono">{euros(prix)}</td>
                      <td className="text-right font-mono">{euros(valeurTheorique)}</td>
                      <td className="px-3 text-right font-mono">{valeurComptee === null ? "—" : euros(valeurComptee)}</td>
                      <td className={`px-3 text-right font-mono font-semibold ${ecartValeur !== null && ecartValeur < 0 ? "text-red-700" : ecartValeur !== null && ecartValeur > 0 ? "text-green-700" : ""}`}>
                        {ecartValeur === null ? "—" : `${ecartValeur > 0 ? "+" : ""}${euros(ecartValeur)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {inventaire.statut === "brouillon" && (
            <div className="mt-4 flex flex-col justify-end gap-3 sm:flex-row">
              <button name="intention" value="enregistrer" className="rounded-md border px-4 py-2 text-sm">Enregistrer le comptage</button>
              <button name="intention" value="valider" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">Valider, valoriser et ajuster le stock</button>
            </div>
          )}
        </form>

        <p className="rounded-md border bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-neutral-900">
          Ce rapport fournit une valorisation au prix d’achat HT pour préparer la clôture. L’expert-comptable reste responsable de la méthode de valorisation retenue, des dépréciations éventuelles et de l’écriture comptable définitive.
        </p>
      </div>
    </main>
  );
}

function Carte({
  label,
  valeur,
  alerte = false,
  tonalite = "neutre",
}: {
  label: string;
  valeur: string;
  alerte?: boolean;
  tonalite?: "neutre" | "positif" | "negatif";
}) {
  const couleur = tonalite === "negatif" ? "text-red-700" : tonalite === "positif" ? "text-green-700" : alerte ? "text-amber-700" : "";
  return <div className="rounded-md border p-4 dark:border-neutral-800"><p className="text-xs text-neutral-500">{label}</p><strong className={`mt-1 block font-mono text-xl ${couleur}`}>{valeur}</strong></div>;
}
