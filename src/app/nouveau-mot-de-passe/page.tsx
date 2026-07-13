import { redirect } from "next/navigation";
import { modifierMotDePasseAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";

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
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Ce lien est invalide ou a expiré. Retournez à « Mot de passe oublié » pour recevoir un nouveau lien.</p>
        ) : (
          <form action={modifierMotDePasseAction} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">Nouveau mot de passe<input name="password" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
            <label className="block space-y-1 text-sm font-medium">Confirmer le mot de passe<input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
            <button className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Enregistrer le nouveau mot de passe</button>
          </form>
        )}
      </div>
    </main>
  );
}
