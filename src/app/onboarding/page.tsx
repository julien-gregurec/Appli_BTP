import { createEntrepriseAction, rejoindreEntrepriseAction } from "@/app/actions/entreprise";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const codeInvitation = (code || String(user?.user_metadata?.code_entreprise ?? "")).trim().toUpperCase();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Configurer votre accès</h1>
          <p className="text-sm text-neutral-500">
            Rejoignez l’entreprise qui vous invite ou créez une nouvelle entreprise si vous en êtes l’administrateur.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={rejoindreEntrepriseAction} className={`space-y-3 rounded-md border p-4 ${codeInvitation ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20" : "border-neutral-300"}`}>
          <div>
            <h2 className="font-medium">Rejoindre une entreprise existante</h2>
            <p className="text-xs text-neutral-500">
              Saisissez le code fourni par votre employeur. Votre accès sera activé après sa validation.
            </p>
          </div>
          <input
            name="code"
            type="text"
            required
            autoFocus={Boolean(codeInvitation)}
            defaultValue={codeInvitation}
            placeholder="Code entreprise (ex. K7M2PQ9R)"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm uppercase tracking-widest"
          />
          <button type="submit" className="w-full rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-medium text-white">
            Envoyer ma demande d’accès
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          OU, POUR LE DIRIGEANT
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <form action={createEntrepriseAction} className="space-y-4 rounded-md border p-4 dark:border-neutral-800">
          <div>
            <h2 className="font-medium">Créer une nouvelle entreprise</h2>
            <p className="text-xs text-neutral-500">Vous deviendrez automatiquement Admin/Gérant avec tous les droits.</p>
          </div>
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

      </div>
    </main>
  );
}
