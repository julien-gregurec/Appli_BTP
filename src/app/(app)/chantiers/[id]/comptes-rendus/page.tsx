import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { DicteeCompteRendu } from "@/components/DicteeCompteRendu";
import { PhotosCompteRendu } from "@/components/PhotosCompteRendu";
import { iaEstActive } from "@/lib/preview-features";

export default async function ComptesRendusChantierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const { error: erreurAction, success: succesAction } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const peutUtiliserIA = iaEstActive() && aAccesIA(await permissionsUtilisateur(ctx));

  const [{ data: chantier }, { data: comptesRendus }, { data: photos }] = await Promise.all([
    supabase.from("chantiers").select("id, nom").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase
      .from("comptes_rendus_chantier")
      .select("id, titre, contenu, created_at, utilisateurs(nom, prenom)")
      .eq("chantier_id", id)
      .eq("entreprise_id", ctx.entrepriseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents_chantier")
      .select("id, compte_rendu_id, storage_path, nom")
      .eq("chantier_id", id)
      .eq("entreprise_id", ctx.entrepriseId)
      .not("compte_rendu_id", "is", null),
  ]);
  if (!chantier) notFound();
  const photosParCompteRendu = new Map<string, { id: string; nom: string }[]>();
  for (const photo of photos ?? []) {
    if (!photo.compte_rendu_id) continue;
    const liste = photosParCompteRendu.get(photo.compte_rendu_id) ?? [];
    liste.push({ id: photo.id, nom: photo.nom });
    photosParCompteRendu.set(photo.compte_rendu_id, liste);
  }

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href={`/chantiers/${id}`} className="text-sm text-neutral-500 hover:underline">← {chantier.nom}</Link>
          <h1 className="mt-1 text-xl font-semibold">Comptes-rendus</h1>
        </div>

        {erreurAction && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreurAction}</p>}
        {succesAction && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{succesAction}</p>}

        <DicteeCompteRendu chantierId={id} peutUtiliserIA={peutUtiliserIA} />

        <div className="space-y-3">
          {(comptesRendus ?? []).map((cr) => {
            const auteur = cr.utilisateurs as unknown as { nom: string; prenom: string } | null;
            return (
              <article key={cr.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-3">
                  <strong>{cr.titre}</strong>
                  <span className="text-xs text-neutral-500">
                    {new Date(cr.created_at).toLocaleDateString("fr-FR")}{auteur ? ` · ${auteur.prenom} ${auteur.nom}` : ""}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">{cr.contenu}</p>
                <PhotosCompteRendu chantierId={id} compteRenduId={cr.id} photos={photosParCompteRendu.get(cr.id) ?? []} />
              </article>
            );
          })}
          {!comptesRendus?.length && (
            <div className="rounded-md border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
              <p className="font-medium">Aucun compte-rendu pour ce chantier</p>
              <p className="mt-1 text-sm text-neutral-500">Dicte ou écris le premier ci-dessus.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
