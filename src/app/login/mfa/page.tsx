import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinationInterneSure } from "@/lib/security/redirects";
import { verifierMfaConnexionAction } from "@/app/actions/mfa";
import { BrandWordmark } from "@/components/BrandWordmark";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: "Vérification en deux étapes" };

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: nextParam, error } = await searchParams;
  const next = destinationInterneSure(nextParam ?? null, "/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel === "aal2") redirect(next);

  const { data: facteurs } = await supabase.auth.mfa.listFactors();
  const facteurVerifie = facteurs?.totp?.some((element) => element.status === "verified") ?? false;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandWordmark className="text-2xl text-[#0d1b2a] dark:text-white" />
          <p className="text-sm text-neutral-500">{PRODUCT_NAME}</p>
          <h1 className="text-xl font-semibold">Vérification en deux étapes</h1>
          <p className="text-sm text-neutral-500">
            Cette session doit être confirmée par votre application d’authentification.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {facteurVerifie ? (
          <form action={verifierMfaConnexionAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-1">
              <label htmlFor="code" className="text-sm font-medium">
                Code à six chiffres
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.5em]"
              />
              <p className="text-xs text-neutral-500">
                Saisissez les six chiffres affichés dans votre application d’authentification.
              </p>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            >
              Vérifier
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              Aucun facteur d’authentification vérifié n’est associé à ce compte.
            </p>
            <p className="text-neutral-500">
              Configurez l’authentification renforcée depuis « Mon espace », puis reconnectez-vous.
            </p>
          </div>
        )}

        <p className="text-center text-xs">
          <Link href="/login" className="text-neutral-500 underline">
            Revenir à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
