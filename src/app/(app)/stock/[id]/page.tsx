import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ajouterFicheTechniqueArticleAction, ajouterTeinteAction, modifierPrixArticleStockAction } from "@/app/actions/stock";
import { euros } from "@/lib/devis";
import { IdentificationCodeCard } from "@/components/IdentificationCodeCard";
import { permissionsUtilisateur } from "@/lib/permissions";

type ArticleStockDetail = {
  id: string;
  entreprise_id: string;
  reference: string;
  designation: string;
  unite: string;
  quantite_stock: number;
  seuil_alerte: number;
  emplacement: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
  marque: string | null;
  code_barres: string | null;
  zone_id: string | null;
  prix_achat_ht?: number;
  prix_vente_ht?: number;
};

export default async function ArticleStockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutVoirPrix = permissions === null || permissions.includes("voir_prix_stock") || permissions.includes("gerer_prix_stock");
  const peutGererPrix = permissions === null || permissions.includes("gerer_prix_stock");
  const articleQuery = peutVoirPrix
    ? supabase.rpc("articles_stock_avec_prix", { p_entreprise_id: ctx.entrepriseId }).eq("id", id).maybeSingle()
    : supabase.from("articles_stock").select("id,entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,emplacement,actif,created_at,updated_at,marque,code_barres,zone_id").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  const [{ data: articleData }, { data: teintes }, { data: mouvements }, { data: code }, { data: fichesTechniques }] = await Promise.all([
    articleQuery,
    supabase.from("article_teintes").select("*").eq("article_id", id).eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("mouvements_stock").select("id,date,type,quantite,motif,teinte:article_teintes(nom),employe:employes(prenom,nom)").eq("article_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).limit(50),
    supabase.from("codes_identification").select("id,code").eq("entreprise_id", ctx.entrepriseId).eq("type_ressource", "article").eq("ressource_id", id).eq("actif", true).maybeSingle(),
    supabase.from("fiches_techniques_articles").select("id,titre,type_document,fabricant,reference_fabricant,nom_original,version,source_url,created_at").eq("article_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
  ]);
  if (!articleData) notFound();
  const article = articleData as ArticleStockDetail;
  const ajouterTeinte = ajouterTeinteAction.bind(null, id);
  const ajouterFiche = ajouterFicheTechniqueArticleAction.bind(null, id);
  const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <div><Link href="/stock" className="text-sm text-neutral-500 hover:underline">← Stock</Link><h1 className="mt-1 text-xl font-semibold">{article.reference} · {article.designation}</h1><p className="text-sm text-neutral-500">{article.marque ?? "Sans marque"} · code-barres {article.code_barres ?? "non renseigné"}</p></div>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}{messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    <div className={`grid gap-3 ${peutVoirPrix ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}><div className="rounded border p-4"><p className="text-xs text-neutral-500">Stock</p><strong className="text-xl">{article.quantite_stock} {article.unite}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Seuil</p><strong className="text-xl">{article.seuil_alerte} {article.unite}</strong></div>{peutVoirPrix ? <><div className="rounded border p-4"><p className="text-xs text-neutral-500">Prix achat HT</p><strong className="text-xl">{euros(article.prix_achat_ht)}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Prix revente HT</p><strong className="text-xl">{euros(article.prix_vente_ht)}</strong></div></> : <div className="rounded border border-blue-200 bg-blue-50 p-4"><p className="text-xs text-blue-700">Prix du stock</p><strong className="text-sm text-blue-950">Masqués par votre administrateur</strong></div>}</div>
    {peutGererPrix && <form action={modifierPrixArticleStockAction.bind(null,id)} className="grid gap-3 rounded border p-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs text-neutral-500">Prix d’achat HT<input name="prix_achat_ht" type="number" min="0" step="0.01" required defaultValue={article.prix_achat_ht} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-500">Prix de revente HT<input name="prix_vente_ht" type="number" min="0" step="0.01" required defaultValue={article.prix_vente_ht} className="mt-1 w-full rounded border px-3 py-2 text-sm"/></label><button className="self-end rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Enregistrer les prix</button></form>}
    {code && <IdentificationCodeCard id={code.id} code={code.code} label="Étiquette QR de l’article" />}
    <section className="rounded border p-4"><h2 className="font-semibold">Nuancier / teintes disponibles</h2><div className="mt-3 flex flex-wrap gap-2">{teintes?.map((teinte) => <div key={teinte.id} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"><span className="h-5 w-5 rounded-full border" style={{ background: teinte.code_hex ?? "#e5e5e5" }}/><span>{teinte.nom}</span>{teinte.reference && <span className="font-mono text-xs text-neutral-400">{teinte.reference}</span>}</div>)}{!teintes?.length && <span className="text-sm text-neutral-500">Aucune teinte.</span>}</div>
      <form action={ajouterTeinte} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-4"><input name="nom" required placeholder="Nom de la teinte" className="rounded border px-3 py-2 text-sm"/><input name="reference" placeholder="Référence fabricant" className="rounded border px-3 py-2 text-sm"/><input name="code_hex" type="color" defaultValue="#c9a24a" className="h-10 w-full rounded border"/><button className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">Ajouter la teinte</button></form>
    </section>
    <section className="rounded border p-4">
      <div><h2 className="font-semibold">Dossier technique du produit</h2><p className="text-sm text-neutral-500">Fiches techniques, notices, FDS et certificats réutilisés automatiquement dans les DOE.</p></div>
      <div className="mt-3 space-y-2">{fichesTechniques?.map((fiche) => <div key={fiche.id} className="flex flex-col gap-2 rounded border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><strong>{fiche.titre}</strong><p className="text-xs text-neutral-500">{fiche.type_document.replaceAll("_", " ")}{fiche.fabricant ? ` · ${fiche.fabricant}` : ""}{fiche.reference_fabricant ? ` · ${fiche.reference_fabricant}` : ""}{fiche.version ? ` · version ${fiche.version}` : ""}</p></div><div className="flex gap-3"><a href={`/api/fiches-techniques/${fiche.id}`} target="_blank" rel="noopener" className="font-medium text-blue-700 hover:underline">Consulter</a><a href={`/api/fiches-techniques/${fiche.id}?download=1`} className="font-medium text-blue-700 hover:underline">Télécharger</a>{fiche.source_url && <a href={fiche.source_url} target="_blank" rel="noopener" className="text-neutral-500 hover:underline">Source</a>}</div></div>)}{!fichesTechniques?.length && <p className="rounded bg-neutral-50 p-4 text-sm text-neutral-500">Aucun document technique enregistré.</p>}</div>
      <form action={ajouterFiche} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2" encType="multipart/form-data">
        <input name="titre" required placeholder="Titre du document" className="rounded border px-3 py-2 text-sm"/>
        <select name="type_document" className="rounded border px-3 py-2 text-sm"><option value="fiche_technique">Fiche technique</option><option value="fiche_securite">Fiche de données de sécurité</option><option value="notice_pose">Notice de pose</option><option value="certificat">Certificat</option><option value="autre">Autre document</option></select>
        <input name="fabricant" placeholder="Fabricant" defaultValue={article.marque ?? ""} className="rounded border px-3 py-2 text-sm"/>
        <input name="reference_fabricant" placeholder="Référence fabricant" className="rounded border px-3 py-2 text-sm"/>
        <input name="version" placeholder="Version / date" className="rounded border px-3 py-2 text-sm"/>
        <input name="source_url" type="url" placeholder="Lien officiel du fabricant (facultatif)" className="rounded border px-3 py-2 text-sm"/>
        <input name="fichier" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp" className="rounded border px-3 py-2 text-sm sm:col-span-2"/>
        <button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Ajouter au dossier technique</button>
      </form>
    </section>
    <section><h2 className="mb-2 font-semibold">Mouvements</h2><div className="rounded border">{mouvements?.map((mouvement) => { const teinte = un(mouvement.teinte as { nom: string } | { nom: string }[] | null); const employe = un(mouvement.employe as { prenom: string; nom: string } | { prenom: string; nom: string }[] | null); return <div key={mouvement.id} className="grid gap-1 border-t px-3 py-2 text-sm first:border-0 sm:grid-cols-[110px_130px_100px_1fr]"><span>{mouvement.date}</span><span>{mouvement.type.replace("_", " ")}</span><strong>{mouvement.quantite} {article.unite}</strong><span className="text-neutral-500">{teinte ? `${teinte.nom} · ` : ""}{employe ? `${employe.prenom} ${employe.nom} · ` : ""}{mouvement.motif ?? ""}</span></div>; })}{!mouvements?.length && <p className="p-6 text-center text-sm text-neutral-500">Aucun mouvement.</p>}</div></section>
  </div></main>;
}
