import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { PiedLegal } from "@/components/PiedLegal";
import { BrandWordmark } from "@/components/BrandWordmark";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";
import { PRODUCT_NAME } from "@/lib/brand";
import { PurgeLocaleAuLogin } from "@/components/mobile/PurgeLocaleAuLogin";
import { environnementPreviewActif } from "@/lib/badge-preview";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; demo?: string }>;
}) {
  if (isEmailLoginDisabled()) {
    redirect("/dashboard");
  }

  const { error, message, demo } = await searchParams;
  // PREVIEW UNIQUEMENT : accès rapide au compte de recette GP V1. Jamais en Production (même verrou
  // que le badge : drapeau + déploiement non promu) ; aucun mot de passe dans le code ni le navigateur —
  // l'adresse est préremplie, le mot de passe reste à saisir (l'URL de preview est publique).
  const emailDemo = process.env.NEXT_PUBLIC_GP_DEMO_EMAIL ?? "";
  const demoDisponible = Boolean(emailDemo) && environnementPreviewActif({ drapeau: process.env.NEXT_PUBLIC_GP_PREVIEW_BADGE, vercelEnv: process.env.VERCEL_ENV, appUrl: process.env.NEXT_PUBLIC_APP_URL });
  const emailPrerempli = demoDisponible && demo === "1" ? emailDemo : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <PurgeLocaleAuLogin />
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandWordmark className="text-2xl text-[#0d1b2a] dark:text-white" />
          <p className="text-sm text-neutral-500">{PRODUCT_NAME}</p>
          <h1 className="text-xl font-semibold">Connexion</h1>
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
              defaultValue={emailPrerempli}
              autoFocus={!emailPrerempli}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <Link href="/mot-de-passe-oublie" className="text-xs text-neutral-500 underline">Mot de passe oublié ?</Link>
            </div>
            <ChampMotDePasse id="password" name="password" required autoComplete="current-password" autoFocus={Boolean(emailPrerempli)} />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            Se connecter
          </button>
        </form>

        {demoDisponible && (
          <section aria-label="Compte de démonstration GP V1" data-testid="acces-demo" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-semibold">Environnement de preview — démo GP V1</p>
            <p className="text-[13px]">
              Compte de recette Dirigeant (offre Pro, coûts et marges visibles) : <span className="font-mono">{emailDemo}</span>.
              Le mot de passe vous a été transmis séparément ; il n’est jamais stocké ici.
            </p>
            {emailPrerempli ? (
              <p className="text-[13px]">Adresse préremplie ci-dessus : saisissez le mot de passe puis « Se connecter ».</p>
            ) : (
              <Link href="/login?demo=1" className="inline-flex min-h-9 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
                Ouvrir la démo GP V1
              </Link>
            )}
          </section>
        )}

        <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Votre connexion reste active sur cet ordinateur ou ce téléphone jusqu’à votre déconnexion. Sur un appareil partagé, pensez à utiliser « Se déconnecter ».
        </p>

        <p className="text-sm text-neutral-500">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-neutral-900 underline dark:text-white">
            Créer un compte
          </Link>
        </p>

        <PiedLegal />
      </div>
    </main>
  );
}
