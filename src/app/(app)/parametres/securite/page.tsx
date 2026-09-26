import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaSecurityPanel } from "@/components/MfaSecurityPanel";
import { destinationInterneSure } from "@/lib/security/redirects";

export default async function SecuriteComptePage({ searchParams }: { searchParams: Promise<{ next?: string; requis?: string }> }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const [params, liste, niveau] = await Promise.all([
    searchParams,
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const prochain = destinationInterneSure(params.next, "/plateforme");

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div><h1 className="text-xl font-semibold">Sécurité du compte</h1><p className="text-sm text-neutral-500">Gérez les applications d’authentification associées à votre compte.</p></div>
        <MfaSecurityPanel facteursInitiaux={liste.data?.all ?? []} aalInitial={niveau.data?.currentLevel ?? null} erreurInitiale={Boolean(liste.error || niveau.error)} prochain={prochain} requisPlateforme={params.requis === "plateforme"} />
      </div>
    </main>
  );
}
