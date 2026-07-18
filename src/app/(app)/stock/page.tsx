import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { creerArticleStockAction, importerStockAction } from "@/app/actions/stock";
import { euros } from "@/lib/devis";
import { StockMovementForm } from "@/components/StockMovementForm";
import { permissionsUtilisateur } from "@/lib/permissions";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const typeLabel: Record<string, string> = { entree: "Entrée", sortie: "Sortie chantier", ajustement_plus: "Ajustement +", ajustement_moins: "Ajustement -" };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

type Teinte = { id: string; article_id: string; nom: string; code_hex: string | null };
type Article = {
  id: string;
  reference: string;
  designation: string;
  unite: string;
  quantite_stock: number;
  seuil_alerte: number;
  prix_achat_ht?: number | null;
  prix_vente_ht?: number | null;
  emplacement: string | null;
  marque: string | null;
  code_barres: string | null;
  teintes: Omit<Teinte, "article_id">[];
};
type Mouvement = { id: string; date: string; type: string; quantite: number; motif: string | null; article: { reference: string; designation: string; unite: string } | { reference: string; designation: string; unite: string }[] | null; chantier: { nom: string } | { nom: string }[] | null; teinte: { nom: string } | { nom: string }[] | null };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const params = await searchParams;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererStock = permissions === null || permissions.includes("gerer_stock");
  const peutVoirPrix = permissions === null || permissions.includes("voir_prix_stock") || permissions.includes("gerer_prix_stock");
  const peutGererPrix = permissions === null || permissions.includes("gerer_prix_stock");

  const articlesPromise = peutVoirPrix
    ? sb.rpc("articles_stock_avec_prix", { p_entreprise_id: ctx.entrepriseId })
    : sb.from("articles_stock")
      .select("id,reference,designation,unite,quantite_stock,seuil_alerte,emplacement,marque,code_barres,actif")
      .eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("designation");

  const [{ data: articlesBruts }, { data: teintes }, { data: chantiers }, { data: mouvementsData }] = await Promise.all([
    articlesPromise,
    sb.from("article_teintes").select("id,article_id,nom,code_hex").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("nom"),
    sb.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    sb.from("mouvements_stock").select("id,date,type,quantite,motif,article:articles_stock(reference,designation,unite),chantier:chantiers(nom),teinte:article_teintes(nom)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).limit(30),
  ]);

  const articles = ((articlesBruts ?? []) as Omit<Article, "teintes">[])
    .map((article) => ({
      ...article,
      teintes: ((teintes ?? []) as Teinte[])
        .filter((teinte) => teinte.article_id === article.id)
        .map((teinte) => ({ id: teinte.id, nom: teinte.nom, code_hex: teinte.code_hex })),
    }));
  const mouvements = (mouvementsData ?? []) as Mouvement[];
  const alertes = articles.filter((article) => Number(article.quantite_stock) <= Number(article.seuil_alerte));
  const valeur = peutVoirPrix ? articles.reduce((total, article) => total + Number(article.quantite_stock) * Number(article.prix_achat_ht ?? 0), 0) : null;

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Stock</h1><p className="text-sm text-neutral-500">Catalogue, nuanciers, imports fournisseurs, inventaires et mouvements par scan.</p></div><Link href="/stock/reception" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Réception / sortie par scan</Link></div>
    {params.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>}
    {params.succes && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{params.succes}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Articles actifs</p><strong className="font-mono text-xl">{articles.length}</strong></div>
      <div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Alertes réapprovisionnement</p><strong className="font-mono text-xl text-amber-700">{alertes.length}</strong></div>
      <div className="rounded-md border p-4"><p className="text-xs text-neutral-500">{peutVoirPrix ? "Valeur d’achat estimée" : "Prix du stock"}</p><strong className="font-mono text-xl">{valeur === null ? "Masqués" : euros(valeur)}</strong>{!peutVoirPrix && <p className="mt-1 text-xs text-neutral-500">Autorisation administrateur requise.</p>}</div>
    </div>

    {peutGererPrix && <section className="rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4"><h2 className="font-semibold">Importer une liste fournisseur ou un inventaire</h2><p className="mt-1 text-sm text-neutral-600">Formats XLSX, CSV ou PDF · les prix importés sont réservés aux postes autorisés par l’administrateur.</p><form action={importerStockAction} encType="multipart/form-data" className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px_auto]"><input name="fichier" type="file" accept=".xlsx,.csv,.pdf,application/pdf" required className={input}/><select name="type_import" className={input}><option value="catalogue">Catalogue fournisseur</option><option value="inventaire">Inventaire</option></select><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Analyser et importer</button></form><p className="mt-2 text-xs text-neutral-500">L’import est atomique : si une ligne est invalide, aucune ligne n’est enregistrée.</p></section>}

    <div className="grid gap-4 lg:grid-cols-2">
      {peutGererStock && <form action={creerArticleStockAction} className="space-y-3 rounded-md border p-4"><h2 className="font-semibold">Nouvel article</h2><div className="grid grid-cols-2 gap-2"><input name="reference" required placeholder="Référence" className={input}/><input name="designation" required placeholder="Désignation" className={input}/><input name="marque" placeholder="Marque / fabricant" className={input}/><input name="code_barres" placeholder="Code-barres EAN / GTIN" className={input}/><input name="unite" defaultValue="u" placeholder="Unité" className={input}/><input name="emplacement" placeholder="Emplacement" className={input}/><input name="seuil_alerte" type="number" min="0" step="0.01" defaultValue="0" placeholder="Seuil" className={input}/>{peutGererPrix && <><input name="prix_achat_ht" type="number" min="0" step="0.01" defaultValue="0" placeholder="Prix achat HT" className={input}/><input name="prix_vente_ht" type="number" min="0" step="0.01" defaultValue="0" placeholder="Prix revente HT" className={input}/></>}</div><button className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">Créer l’article</button></form>}
      {articles.length ? <StockMovementForm articles={articles.map((article) => ({ ...article, quantite_stock: Number(article.quantite_stock), teintes: article.teintes ?? [] }))} chantiers={chantiers ?? []}/> : <p className="rounded border border-dashed p-5 text-sm text-neutral-500">Aucun article disponible.</p>}
    </div>

    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="px-3 py-2">Référence</th><th>Article</th><th>Marque</th><th>Nuancier</th><th className="text-right">Stock</th><th className="text-right">Seuil</th>{peutVoirPrix && <th className="px-3 text-right">Prix achat</th>}</tr></thead><tbody>{articles.map((article) => <tr key={article.id} className={`border-t ${Number(article.quantite_stock) <= Number(article.seuil_alerte) ? "bg-amber-50" : ""}`}><td className="px-3 py-2 font-mono"><Link href={`/stock/${article.id}`} className="font-medium hover:underline">{article.reference}</Link>{article.code_barres && <div className="text-[10px] text-neutral-400">{article.code_barres}</div>}</td><td><Link href={`/stock/${article.id}`} className="font-medium hover:underline">{article.designation}</Link><div className="text-xs text-neutral-400">{article.emplacement ?? ""}</div></td><td>{article.marque ?? "—"}</td><td><div className="flex gap-1">{article.teintes.slice(0, 6).map((teinte) => <span key={teinte.id} title={teinte.nom} className="h-5 w-5 rounded-full border" style={{ background: teinte.code_hex ?? "#e5e5e5" }}/>)}</div></td><td className="text-right font-mono">{article.quantite_stock} {article.unite}</td><td className="text-right font-mono">{article.seuil_alerte} {article.unite}</td>{peutVoirPrix && <td className="px-3 text-right font-mono">{euros(article.prix_achat_ht ?? 0)}</td>}</tr>)}</tbody></table></div>

    <section><h2 className="mb-2 font-semibold">Derniers mouvements</h2><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[650px] text-sm"><tbody>{mouvements.map((mouvement) => { const article = un(mouvement.article), chantier = un(mouvement.chantier), teinte = un(mouvement.teinte); return <tr key={mouvement.id} className="border-t first:border-0"><td className="px-3 py-2">{mouvement.date}</td><td className="px-3 py-2 font-medium">{article?.reference} · {article?.designation}</td><td>{typeLabel[mouvement.type]}</td><td className="text-right font-mono">{mouvement.quantite} {article?.unite}</td><td className="px-3 text-neutral-500">{teinte ? `${teinte.nom} · ` : ""}{chantier?.nom ?? mouvement.motif ?? ""}</td></tr>; })}{!mouvements.length && <tr><td className="px-3 py-6 text-center text-neutral-500">Aucun mouvement.</td></tr>}</tbody></table></div></section>
  </div></main>;
}
