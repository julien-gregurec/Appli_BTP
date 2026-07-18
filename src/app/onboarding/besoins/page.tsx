import Link from "next/link";
import { enregistrerBesoinsAction } from "@/app/actions/besoins";
import { ATTENTES_OPTIONS, BESOINS_OPTIONS, DUREE_ESSAI_JOURS, offreParCle, prixAbonnementMensuel } from "@/lib/plateforme";

export default async function BesoinsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; recommande?: string; nb?: string }>;
}) {
  const { error, recommande, nb } = await searchParams;

  // Écran de recommandation (après soumission du questionnaire).
  if (recommande) {
    const offre = offreParCle(recommande);
    const nbEmployes = Math.max(1, Number(nb ?? "1") || 1);
    const prix = prixAbonnementMensuel(nbEmployes, offre);
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <p className="text-sm text-neutral-500">Offre recommandée</p>
            <h1 className="mt-1 text-2xl font-semibold">{offre.nom}</h1>
            <p className="mt-2 text-sm text-neutral-500">{offre.resume}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
            <div className="text-4xl font-bold">{prix.total} € <span className="text-base font-normal text-neutral-500">/ mois HT</span></div>
            <p className="mt-2 text-xs text-neutral-500">
              Base {prix.base} € (jusqu&apos;à {prix.employesInclus} comptes inclus)
              {prix.employesSupplementaires > 0 && <> + {prix.employesSupplementaires} compte(s) × {prix.parEmployeSup} €</>}
              {" "}· pour {nbEmployes} salarié(s)
            </p>
            <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400">
              ou {prix.mensuelSiAnnuel} € / mois en paiement annuel <span className="text-xs font-normal">(−20 %)</span>
            </p>
            <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
              Essai gratuit {DUREE_ESSAI_JOURS} jours, sans engagement ni carte bancaire.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Estimation indicative. La tarification définitive vous sera confirmée par LIRIA.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/dashboard" className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-center text-sm font-semibold text-white">
              Accéder à mon espace
            </Link>
            <Link href="/onboarding/besoins" className="w-full rounded-md border px-3 py-2 text-center text-sm">
              Revoir mes réponses
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Questionnaire.
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Trouvons l&apos;abonnement adapté</h1>
          <p className="text-sm text-neutral-500">Quelques questions pour vous recommander la formule la plus adaptée à votre entreprise.</p>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={enregistrerBesoinsAction} className="space-y-6">
          <div className="space-y-1">
            <label htmlFor="nb_employes" className="text-sm font-medium">Combien de salariés dans l&apos;entreprise ?</label>
            <input id="nb_employes" name="nb_employes" type="number" min={0} required defaultValue={1}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">De quoi avez-vous besoin ?</legend>
            <p className="text-xs text-neutral-500">Cochez tout ce qui vous concerne.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {BESOINS_OPTIONS.map((b) => (
                <label key={b.cle} className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
                  <input type="checkbox" name="besoins" value={b.cle} className="h-4 w-4" />
                  {b.libelle}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Quelles sont vos attentes ?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ATTENTES_OPTIONS.map((a) => (
                <label key={a.cle} className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
                  <input type="checkbox" name="attentes" value={a.cle} className="h-4 w-4" />
                  {a.libelle}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="commentaire" className="text-sm font-medium">Un besoin particulier ? (facultatif)</label>
            <textarea id="commentaire" name="commentaire" rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </div>

          <div className="flex flex-col gap-2">
            <button type="submit" className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-semibold text-white">
              Voir ma recommandation
            </button>
            <Link href="/dashboard" className="text-center text-xs text-neutral-500 underline">Passer cette étape</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
