import { Sidebar } from "@/components/Sidebar";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur } from "@/lib/permissions";
import { estPlateformeAdmin } from "@/lib/plateforme";

// Layout des pages authentifiées avec navigation latérale.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const plateformeAdmin = await estPlateformeAdmin();

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
