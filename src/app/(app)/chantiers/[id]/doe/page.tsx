import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { genererDoeAction } from "@/app/actions/doe";

type RelationArticle = { id: string; reference: string; designation: string; marque: string | null };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function DoeChantierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGenerer = permissions === null || permissions.includes("gerer_doe");
  const supabase = await createClient();
  const [{ data: chantier }, { data: documents }, { data: mouvements }, { data: generations }] = await Promise.all([
    supabase.from("chantiers").select("id,nom,reference_interne,adresse,code_postal,ville,client:clients(nom,prenom,societe)").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("documents_chantier").select("id,nom,categorie,note,created_at").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("categorie"),
    supabase.from("mouvements_stock").select("article_id,quantite,article:articles_stock(id,reference,designation,marque)").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).eq("type", "sortie"),
    supabase.from("doe_generations").select("id,version,statut,genere_at,manifeste").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("version", { ascending: false }),
  ]);
  if (!chantier) notFound();

  const articlesParId = new Map<string, RelationArticle>();
  for (const mouvement of mouvements ?? []) {
    const article = un(mouvement.article as RelationArticle | RelationArticle[] | null);
    if (article) articlesParId.set(article.id, article);
  }
  const articleIds = [...articlesParId.keys()];
  const { data: fiches } = articleIds.length
    ? await supabase.from("fiches_techniques_articles").select("id,article_id,titre,type_document,fabricant,version").eq("entreprise_id", ctx.entrepriseId).in("article_id", articleIds).order("titre")
    : { data: [] };
  const plans = (documents ?? []).filter((document) => document.categorie === "plan");
  const photos = (documents ?? []).filter((document) => document.categorie.startsWith("photo_"));
  const autres = (documents ?? []).filter((document) => document.categorie !== "plan" && !document.categorie.startsWith("photo_"));
  const client = un(chantier.client as { nom: string; prenom: string | null; societe: string | null } | { nom: string; prenom: string | null; societe: string | null }[] | null);
  const generer = genererDoeAction.bind(null, id);

  return <main className="p-4 sm:p-8 print:p-0"><div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href={`/chantiers/${id}`} className="text-sm text-neutral-500 hover:underline print:hidden">← {chantier.nom}</Link><h1 className="mt-1 text-2xl font-semibold">Dossier des ouvrages exécutés</h1><p className="text-sm text-neutral-500">{chantier.reference_interne} · {chantier.nom}</p></div><div className="flex gap-2 print:hidden"><a href={`/imprimer/doe/${id}`} target="_blank" rel="noopener" className="rounded-md border px-3 py-2 text-sm font-medium">Imprimer / enregistrer en PDF</a>{peutGenerer && <form action={generer}><button className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white">Figer une nouvelle version</button></form>}</div></div>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700 print:hidden">{messages.error}</p>}{messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700 print:hidden">{messages.success}</p>}
    <section className="rounded border p-4"><h2 className="font-semibold">Identification du chantier</h2><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-neutral-500">Entreprise :</span> {ctx.entrepriseNom}</p><p><span className="text-neutral-500">Client :</span> {client?.societe ?? [client?.prenom,client?.nom].filter(Boolean).join(" ")}</p><p><span className="text-neutral-500">Chantier :</span> {chantier.nom}</p><p><span className="text-neutral-500">Adresse :</span> {[chantier.adresse,chantier.code_postal,chantier.ville].filter(Boolean).join(" ") || "Non renseignée"}</p></div></section>
    <section className="grid gap-3 sm:grid-cols-4">{[["Plans",plans.length],["Photos",photos.length],["Autres pièces",autres.length],["Fiches produits",fiches?.length ?? 0]].map(([label,total])=><div key={String(label)} className="rounded border p-4"><p className="text-xs text-neutral-500">{label}</p><strong className="text-2xl">{total}</strong></div>)}</section>
    <section className="rounded border p-4"><h2 className="font-semibold">Plans et documents du chantier</h2><div className="mt-3 divide-y">{(documents ?? []).map(document=><a key={document.id} href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 py-2 text-sm hover:underline"><span>{document.categorie === "plan" ? "📐" : "📎"} {document.nom}</span><span className="text-xs text-neutral-500">{document.categorie.replaceAll("_"," ")}</span></a>)}{!documents?.length && <p className="py-4 text-sm text-neutral-500">Aucun plan ou document de chantier.</p>}</div></section>
    <section className="rounded border p-4"><h2 className="font-semibold">Produits utilisés et dossier technique</h2><p className="mt-1 text-sm text-neutral-500">Liste générée à partir des sorties de stock affectées à ce chantier.</p><div className="mt-3 space-y-4">{[...articlesParId.values()].map(article=>{const docs=(fiches ?? []).filter(fiche=>fiche.article_id===article.id);return <article key={article.id} className="rounded border p-3"><strong>{article.reference} · {article.designation}</strong>{article.marque && <span className="ml-2 text-sm text-neutral-500">{article.marque}</span>}<div className="mt-2 flex flex-wrap gap-2">{docs.map(fiche=><a key={fiche.id} href={`/api/fiches-techniques/${fiche.id}`} target="_blank" rel="noopener" className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:underline">{fiche.titre}{fiche.version ? ` · ${fiche.version}` : ""}</a>)}{!docs.length && <span className="text-xs text-amber-700">Fiche technique manquante</span>}</div></article>})}{!articlesParId.size && <p className="text-sm text-neutral-500">Aucune sortie de stock n’est encore rattachée à ce chantier.</p>}</div></section>
    <section className="rounded border p-4 print:hidden"><h2 className="font-semibold">Historique des versions figées</h2><p className="mt-1 text-sm text-neutral-500">Chaque version conserve la liste exacte des documents et produits présents au moment de sa génération.</p><div className="mt-3 divide-y">{(generations ?? []).map(generation=><div key={generation.id} className="flex items-center justify-between py-2 text-sm"><span>Version {generation.version} · {new Date(generation.genere_at).toLocaleString("fr-FR")}</span><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{generation.statut}</span></div>)}{!generations?.length && <p className="py-3 text-sm text-neutral-500">Aucune version figée.</p>}</div></section>
  </div></main>;
}
