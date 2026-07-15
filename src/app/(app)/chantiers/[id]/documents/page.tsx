import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ajouterDocumentChantierAction, supprimerDocumentChantierAction } from "@/app/actions/documents";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DOCUMENT_CATEGORIES, libelleCategorie, tailleLisible } from "@/lib/documents";

export default async function DocumentsChantierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: chantier }, { data: documents }] = await Promise.all([
    supabase.from("chantiers").select("id, nom, reference_interne")
      .eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("documents_chantier")
      .select("id, nom, categorie, storage_path, mime_type, taille_octets, note, audience, created_at")
      .eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId)
      .order("created_at", { ascending: false }),
  ]);
  if (!chantier) notFound();

  const avecUrls = await Promise.all((documents ?? []).map(async (document) => {
    if (!document.mime_type.startsWith("image/")) return { ...document, previewUrl: null };
    const { data } = await supabase.storage.from("chantier-documents")
      .createSignedUrl(document.storage_path, 900);
    return { ...document, previewUrl: data?.signedUrl ?? null };
  }));
  const ajouter = ajouterDocumentChantierAction.bind(null, id);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/chantiers/${id}`} className="text-sm text-neutral-500 hover:underline">← {chantier.nom}</Link>
            <h1 className="mt-1 text-xl font-semibold">Photos et documents</h1>
            <p className="text-sm text-neutral-500">Plans, photos de suivi, livraisons et pièces techniques.</p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">{avecUrls.length} document{avecUrls.length > 1 ? "s" : ""}</span>
        </div>

        {messages.error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{messages.error}</p>}
        {messages.success && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">{messages.success}</p>}

        <form action={ajouter} className="grid gap-3 rounded-lg border-2 border-[#c9a24a]/60 bg-[#c9a24a]/5 p-4 sm:grid-cols-[1fr_220px_auto]">
          <div><h2 className="font-semibold">Photo rapide depuis le chantier</h2><p className="text-xs text-neutral-500">L’appareil photo du téléphone s’ouvre directement. Ajoutez une note pour faciliter le suivi.</p><input name="fichier" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" required className="mt-2 block w-full text-sm" /></div>
          <div><label className="text-xs text-neutral-500">Étape<select name="categorie" defaultValue="photo_pendant" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"><option value="photo_avant">Avant travaux</option><option value="photo_pendant">Pendant les travaux</option><option value="photo_apres">Après travaux</option></select></label><label className="mt-2 block text-xs text-neutral-500">Visible par<select name="audience" defaultValue="tous_affectes" className="mt-1 w-full rounded-md border px-3 py-2 text-sm"><option value="tous_affectes">Toute l’équipe affectée</option><option value="encadrement">Encadrement du chantier</option><option value="gestionnaires">Gestionnaires uniquement</option></select></label><label className="mt-2 block text-xs text-neutral-500">Note<input name="note" placeholder="Zone, tâche, anomalie…" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" /></label></div>
          <button className="self-end rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Ajouter la photo</button>
        </form>

        <form action={ajouter} className="grid gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-1">
            <label htmlFor="fichier" className="text-sm font-medium">Fichier</label>
            <input id="fichier" name="fichier" type="file" required accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx" className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-2 file:py-1 dark:border-neutral-700 dark:bg-neutral-900 dark:file:bg-neutral-800" />
            <p className="text-xs text-neutral-500">Images, PDF, Word ou Excel · 15 Mo maximum</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="categorie" className="text-sm font-medium">Catégorie</label>
            <select id="categorie" name="categorie" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              {DOCUMENT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="note" className="text-sm font-medium">Note <span className="font-normal text-neutral-500">(facultatif)</span></label>
            <input id="note" name="note" maxLength={500} placeholder="Ex. réception du lot cloisons" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </div>
          <div className="space-y-1 md:col-span-2"><label htmlFor="audience" className="text-sm font-medium">Visibilité</label><select id="audience" name="audience" defaultValue="gestionnaires" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"><option value="tous_affectes">Toute l’équipe affectée au chantier</option><option value="encadrement">Chef d’équipe, chef de chantier et conducteur</option><option value="gestionnaires">Gestionnaires uniquement</option></select></div>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Ajouter le document</button>
          </div>
        </form>

        {avecUrls.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avecUrls.map((document) => {
              const supprimer = supprimerDocumentChantierAction.bind(null, id, document.id);
              return (
                <article key={document.id} className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
                  {document.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={document.previewUrl} alt={document.nom} className="h-44 w-full bg-neutral-100 object-cover dark:bg-neutral-900" />
                  ) : (
                    <div className="flex h-44 items-center justify-center bg-neutral-50 text-4xl dark:bg-neutral-900">📄</div>
                  )}
                  <div className="space-y-3 p-3">
                    <div>
                      <p className="truncate text-sm font-medium" title={document.nom}>{document.nom}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{libelleCategorie(document.categorie)} · {tailleLisible(Number(document.taille_octets))}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#9a7625]">{document.audience==="tous_affectes"?"Équipe affectée":document.audience==="encadrement"?"Encadrement":"Gestionnaires"}</p>
                    </div>
                    {document.note && <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">{document.note}</p>}
                    <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
                      <a href={`/api/documents/${document.id}`} className="font-medium hover:underline">Télécharger</a>
                      <form action={supprimer}>
                        <ConfirmSubmitButton message={`Supprimer « ${document.nom} » ?`} className="text-red-600 hover:underline dark:text-red-400">Supprimer</ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
            <p className="font-medium">Aucun document pour ce chantier</p>
            <p className="mt-1 text-sm text-neutral-500">Ajoutez une photo, un plan ou une pièce technique ci-dessus.</p>
          </div>
        )}
      </div>
    </main>
  );
}
