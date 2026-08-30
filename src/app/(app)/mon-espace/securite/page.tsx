import { redirect } from "next/navigation";
import Link from "next/link";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { SecuriteMfaClient } from "./SecuriteMfaClient";

export const metadata = { title: "Authentification renforcée" };

export default async function SecuritePage() {
  // L'accès est déjà protégé par le layout (app) ; on résout le contexte pour
  // rester cohérent avec les autres pages de « Mon espace ».
  await getContexteEntreprise();
  if (isEmailLoginDisabled()) redirect("/mon-espace");

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm">
            <Link href="/mon-espace" className="text-neutral-500 underline">
              ← Mon espace
            </Link>
          </p>
          <h1 className="mt-2 text-xl font-semibold">Authentification renforcée</h1>
          <p className="text-sm text-neutral-500">
            Ajoutez une application d’authentification (TOTP) pour protéger l’accès aux
            opérations sensibles. Le QR code et la clé manuelle s’affichent uniquement
            sur cet écran et ne sont jamais enregistrés.
          </p>
        </div>
        <SecuriteMfaClient />
      </div>
    </main>
  );
}
