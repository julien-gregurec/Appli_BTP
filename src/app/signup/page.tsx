import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { PwaInstallButton } from "@/components/PwaInstallButton";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; numero?: string }>;
}) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const { error, code, numero } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Créer un compte</h1>
          <p className="text-sm text-neutral-500">
            Créez votre accès personnel, puis rejoignez votre entreprise avec le code fourni par votre employeur.
          </p>
          {numero && <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">Fiche employé détectée · numéro <span className="font-mono font-semibold">{numero.toUpperCase()}</span></p>}
          {!numero && code && <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">Invitation détectée · code <span className="font-mono font-semibold">{code.toUpperCase()}</span></p>}
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={signupAction} className="space-y-4">
          {code && <input type="hidden" name="code_entreprise" value={code.toUpperCase()} />}
          {numero && <input type="hidden" name="numero_employe" value={numero.toUpperCase()} />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="prenom" className="text-sm font-medium">
                Prénom
              </label>
              <input
                id="prenom"
                name="prenom"
                type="text"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="nom" className="text-sm font-medium">
                Nom
              </label>
              <input
                id="nom"
                name="nom"
                type="text"
                required
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Créer mon compte
          </button>
        </form>

        <PwaInstallButton publicPage />

        <p className="text-sm text-neutral-500">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
