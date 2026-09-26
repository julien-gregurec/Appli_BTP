import Link from "next/link";
import { redirect } from "next/navigation";
import { modifierMotDePasseAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import { ChampMotDePasse } from "@/components/ChampMotDePasse";

export default async function NouveauMotDePassePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div><h1 className="text-xl font-semibold">Nouveau mot de passe</h1><p className="text-sm text-neutral-500">Choisissez au moins 8 caractères.</p></div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!user ? (
          <div className="space-y-3">
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Ce lien est invalide, a expiré, ou a déjà été utilisé.</p>
            <Link href="/mot-de-passe-oublie" className="block w-full rounded-md bg-neutral-900 px-3 py-2 text-center text-sm font-medium text-white">Demander un nouveau lien</Link>
          </div>
        ) : (
          <form action={modifierMotDePasseAction} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium">Nouveau mot de passe</label>
              <ChampMotDePasse id="password" name="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <label htmlFor="password_confirmation" className="text-sm font-medium">Confirmer le mot de passe</label>
              <ChampMotDePasse id="password_confirmation" name="password_confirmation" required minLength={8} autoComplete="new-password" />
            </div>
            <button className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Enregistrer le nouveau mot de passe</button>
          </form>
        )}
      </div>
    </main>
  );
}
