import { logoutAction } from "@/app/actions/auth";

export default function EnAttentePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#c9a24a]/15 text-2xl">⏳</div>
        <div>
          <h1 className="text-xl font-semibold">Demande envoyée</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Tu as bien rejoint l&apos;entreprise. Un administrateur doit maintenant valider ton
            accès et te définir un rôle. Tu pourras te connecter dès que ce sera fait.
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
