import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { BRAND_NAME } from "@/lib/brand";
import { plateformeRoleCourant, rolePlateformeAPermission } from "@/lib/plateforme";
import { createClient } from "@/lib/supabase/server";

export default async function PlateformeLayout({ children }: { children: React.ReactNode }) {
  if (!isEmailLoginDisabled()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  const role = await plateformeRoleCourant();
  if (!role) notFound();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <Link href="/plateforme" className="font-semibold">{BRAND_NAME} — Administration</Link>
            <p className="text-xs text-neutral-500">Espace plateforme indépendant des entreprises clientes</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/plateforme" className="rounded-md border px-3 py-2">Entreprises</Link>
            <Link href="/plateforme/tarification" className="rounded-md border px-3 py-2">Tarification</Link>
            {(rolePlateformeAPermission(role,"consulter_facturation")||rolePlateformeAPermission(role,"gerer_remises"))&&<Link href="/plateforme/promotions" className="rounded-md border px-3 py-2">Promotions</Link>}
            <form action={logoutAction}>
              <button className="rounded-md bg-[#0d1b2a] px-3 py-2 font-medium text-white">Se déconnecter</button>
            </form>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
