import { Sidebar } from "@/components/Sidebar";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { ModuleAccessBoundary } from "@/components/ModuleAccessBoundary";
import { MobileBack } from "@/components/MobileBack";
import { AideButton } from "@/components/AideButton";
import { AssistantIA } from "@/components/AssistantIA";
import { AppPresenceTracker } from "@/components/AppPresenceTracker";
import { AbonnementBanner } from "@/components/AbonnementBanner";
import { SupportAccessBanner } from "@/components/SupportAccessBanner";

// Layout des pages authentifiées avec navigation latérale.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContexteEntreprise();
  // Independants l'un de l'autre (aucun n'attend le resultat de l'autre) : les lancer en
  // parallele evite un aller-retour reseau supplementaire sur chaque navigation.
  const [permissions, plateformeAdmin] = await Promise.all([permissionsUtilisateur(ctx), estPlateformeAdmin()]);
  const peutVoirAlerteAbonnement = permissions === null || permissions.includes("gerer_utilisateurs") || permissions.includes("gerer_parametres");

  return (
    <div className="app-shell flex min-h-full flex-1">
      <AppPresenceTracker actif={!isEmailLoginDisabled()} />
      <style>{`@media (max-width:767px){
        /* Le header mobile est fixe (h-16) : on décale le contenu dessous + zone sûre iOS,
           sinon le titre ET les liens « ← Retour » passent cachés sous la barre. */
        .app-shell>header{padding-top:env(safe-area-inset-top)!important;height:auto!important;min-height:4rem}
        .app-shell main{width:100%;min-width:0;padding:calc(4rem + env(safe-area-inset-top) + 0.5rem) 1rem calc(1rem + env(safe-area-inset-bottom))!important}
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
      <style>{`
        .lecture-seule main form[method="post"],
        .lecture-seule main a[href$="/nouveau"],
        .lecture-seule main a[href*="/modifier"],
        .lecture-seule main button[type="button"]{display:none!important}
        .lecture-seule main form[method="get"]{display:flex!important}
        .lecture-seule main form[method="get"] button{display:inline-flex!important}
      `}</style>
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} />
      <div className="min-w-0 flex-1">
        {ctx.accesSupportPlateforme&&<SupportAccessBanner entrepriseNom={ctx.entrepriseNom}/>}
        {!ctx.accesSupportPlateforme&&ctx.suspensionPrevueAt&&peutVoirAlerteAbonnement&&<AbonnementBanner echeance={ctx.suspensionPrevueAt} message={ctx.impayeMessage}/>}
        <ModuleAccessBoundary permissions={permissions}>{children}</ModuleAccessBoundary>
      </div>
      <MobileBack />
      <AideButton />
      {aAccesIA(permissions) && <AssistantIA />}
    </div>
  );
}
