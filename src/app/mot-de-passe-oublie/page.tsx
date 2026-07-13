import Link from "next/link";
import { redirect } from "next/navigation";
import { demanderReinitialisationAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

export default async function MotDePasseOubliePage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  if (isEmailLoginDisabled()) redirect("/dashboard");
  const { error, message } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div><h1 className="text-xl font-semibold">Mot de passe oublié</h1><p className="text-sm text-neutral-500">Recevez un lien sécurisé pour choisir un nouveau mot de passe.</p></div>
        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <form action={demanderReinitialisationAction} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">Adresse email<input name="email" type="email" required autoComplete="email" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
          <button className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Envoyer le lien</button>
        </form>
        <Link href="/login" className="block text-sm text-neutral-500 underline">← Retour à la connexion</Link>
      </div>
    </main>
  );
}
