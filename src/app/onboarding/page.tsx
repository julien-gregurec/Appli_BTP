import { createEntrepriseAction, rejoindreEntrepriseAction } from "@/app/actions/entreprise";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Créer ton entreprise</h1>
          <p className="text-sm text-neutral-500">
            Tu deviens automatiquement Admin/Gérant avec tous les droits.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={createEntrepriseAction} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="nom" className="text-sm font-medium">
              Nom de l&apos;entreprise
            </label>
            <input
              id="nom"
              name="nom"
              type="text"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="siret" className="text-sm font-medium">
              SIRET
            </label>
            <input
              id="siret"
              name="siret"
              type="text"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="adresse" className="text-sm font-medium">
              Adresse
            </label>
            <input
              id="adresse"
              name="adresse"
              type="text"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1">
              <label htmlFor="code_postal" className="text-sm font-medium">
                Code postal
              </label>
              <input
                id="code_postal"
                name="code_postal"
                type="text"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label htmlFor="ville" className="text-sm font-medium">
                Ville
              </label>
              <input
                id="ville"
                name="ville"
                type="text"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Créer l&apos;entreprise
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          OU
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <form action={rejoindreEntrepriseAction} className="space-y-3 rounded-md border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <div>
            <h2 className="text-sm font-medium">Rejoindre une entreprise existante</h2>
            <p className="text-xs text-neutral-500">
              Saisis le code fourni par ton employeur. Ton accès sera activé après validation.
            </p>
          </div>
          <input
            name="code"
            type="text"
            required
            placeholder="Code entreprise (ex. K7M2PQ9R)"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm uppercase tracking-widest"
          />
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-900 px-3 py-2 text-sm font-medium dark:border-white"
          >
            Rejoindre avec le code
          </button>
        </form>
      </div>
    </main>
  );
}
