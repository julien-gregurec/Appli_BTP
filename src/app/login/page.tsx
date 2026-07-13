import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const { error, message } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Connexion</h1>
          <p className="text-sm font-medium tracking-widest text-[#c9a24a]">LIRIA CONCEPT</p>
        </div>

        {message && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
        )}
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <form action={loginAction} className="space-y-4">
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
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <Link href="/mot-de-passe-oublie" className="text-xs text-neutral-500 underline">Mot de passe oublié ?</Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Se connecter
          </button>
        </form>

        <p className="text-sm text-neutral-500">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-neutral-900 underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </main>
  );
}
