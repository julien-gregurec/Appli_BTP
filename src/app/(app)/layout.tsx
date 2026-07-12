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
    <div className="app-shell flex min-h-full flex-1">
      <style>{`@media (max-width:767px){
        .app-shell main{width:100%;min-width:0;padding:1rem!important}
        .app-shell main>div{width:100%;min-width:0}
        .app-shell main [class*="grid-cols-"]{grid-template-columns:minmax(0,1fr)!important}
        .app-shell main [class*="col-span-"]{grid-column:auto!important}
        .app-shell main .flex{flex-wrap:wrap}
        .app-shell main form.flex{align-items:stretch}
        .app-shell main form.flex>:is(input,select,textarea,label){min-width:0;width:100%}
        .app-shell main :is(input,select,textarea,button){max-width:100%}
        .app-shell main :is(button,a.rounded-md){min-height:42px}
        .app-shell main table{min-width:680px}
        .app-shell main :is(.overflow-hidden,.overflow-x-hidden):has(>table){overflow-x:auto!important;-webkit-overflow-scrolling:touch}
        .app-shell main article{min-width:0}
        .app-shell main h1{font-size:1.35rem;line-height:1.25}
        .app-shell main h2{line-height:1.3}
        .app-shell main .fixed[role="dialog"]>div{max-height:calc(100dvh - 2rem);overflow-y:auto;padding:1rem}
      }`}</style>
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} />
      <div className="min-w-0 flex-1 overflow-y-auto pt-16 md:pt-0">{children}</div>
    </div>
  );
}
