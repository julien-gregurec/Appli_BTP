import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ajouterTeinteAction } from "@/app/actions/stock";
import { euros } from "@/lib/devis";
import { IdentificationCodeCard } from "@/components/IdentificationCodeCard";

export default async function ArticleStockPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: article }, { data: teintes }, { data: mouvements }, { data: code }] = await Promise.all([
    supabase.from("articles_stock").select("*").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("article_teintes").select("*").eq("article_id", id).eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("mouvements_stock").select("id,date,type,quantite,motif,teinte:article_teintes(nom),employe:employes(prenom,nom)").eq("article_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }).limit(50),
    supabase.from("codes_identification").select("id,code").eq("entreprise_id", ctx.entrepriseId).eq("type_ressource", "article").eq("ressource_id", id).eq("actif", true).maybeSingle(),
  ]);
  if (!article) notFound();
  const ajouterTeinte = ajouterTeinteAction.bind(null, id);
  const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <div><Link href="/stock" className="text-sm text-neutral-500 hover:underline">← Stock</Link><h1 className="mt-1 text-xl font-semibold">{article.reference} · {article.designation}</h1><p className="text-sm text-neutral-500">{article.marque ?? "Sans marque"} · code-barres {article.code_barres ?? "non renseigné"}</p></div>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}{messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded border p-4"><p className="text-xs text-neutral-500">Stock</p><strong className="text-xl">{article.quantite_stock} {article.unite}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Seuil</p><strong className="text-xl">{article.seuil_alerte} {article.unite}</strong></div><div className="rounded border p-4"><p className="text-xs text-neutral-500">Prix achat HT</p><strong className="text-xl">{euros(article.prix_achat_ht)}</strong></div></div>
    {code && <IdentificationCodeCard id={code.id} code={code.code} label="Étiquette QR de l’article" />}
    <section className="rounded border p-4"><h2 className="font-semibold">Nuancier / teintes disponibles</h2><div className="mt-3 flex flex-wrap gap-2">{teintes?.map((teinte) => <div key={teinte.id} className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"><span className="h-5 w-5 rounded-full border" style={{ background: teinte.code_hex ?? "#e5e5e5" }}/><span>{teinte.nom}</span>{teinte.reference && <span className="font-mono text-xs text-neutral-400">{teinte.reference}</span>}</div>)}{!teintes?.length && <span className="text-sm text-neutral-500">Aucune teinte.</span>}</div>
      <form action={ajouterTeinte} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-4"><input name="nom" required placeholder="Nom de la teinte" className="rounded border px-3 py-2 text-sm"/><input name="reference" placeholder="Référence fabricant" className="rounded border px-3 py-2 text-sm"/><input name="code_hex" type="color" defaultValue="#c9a24a" className="h-10 w-full rounded border"/><button className="rounded bg-neutral-900 px-3 py-2 text-sm text-white">Ajouter la teinte</button></form>
    </section>
    <section><h2 className="mb-2 font-semibold">Mouvements</h2><div className="rounded border">{mouvements?.map((mouvement) => { const teinte = un(mouvement.teinte as { nom: string } | { nom: string }[] | null); const employe = un(mouvement.employe as { prenom: string; nom: string } | { prenom: string; nom: string }[] | null); return <div key={mouvement.id} className="grid gap-1 border-t px-3 py-2 text-sm first:border-0 sm:grid-cols-[110px_130px_100px_1fr]"><span>{mouvement.date}</span><span>{mouvement.type.replace("_", " ")}</span><strong>{mouvement.quantite} {article.unite}</strong><span className="text-neutral-500">{teinte ? `${teinte.nom} · ` : ""}{employe ? `${employe.prenom} ${employe.nom} · ` : ""}{mouvement.motif ?? ""}</span></div>; })}{!mouvements?.length && <p className="p-6 text-center text-sm text-neutral-500">Aucun mouvement.</p>}</div></section>
  </div></main>;
}
