import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaChallengeForm } from "@/components/MfaChallengeForm";
import { destinationInterneSure } from "@/lib/security/redirects";
import { BrandWordmark } from "@/components/BrandWordmark";

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string; controle?: string }> }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const params = await searchParams;
  const prochain = destinationInterneSure(params.next, "/plateforme");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 p-4 dark:bg-neutral-950">
      <section className="w-full max-w-md space-y-6 rounded-xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <div className="space-y-2"><BrandWordmark className="text-lg" /><h1 className="text-xl font-semibold">Vérification en deux étapes</h1><p className="text-sm text-neutral-600 dark:text-neutral-300">Ouvrez votre application d’authentification et saisissez le code actuel. Aucun code n’est enregistré par ELSATIA.</p></div>
        <MfaChallengeForm prochain={prochain} controleIndisponible={params.controle === "indisponible"} />
      </section>
    </main>
  );
}
