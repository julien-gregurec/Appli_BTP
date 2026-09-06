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
import { EssaiExpireBanner, EssaiPreavisBanner } from "@/components/EssaiBanner";
import { preavisEssai } from "@/lib/acces-socle-essai";
import { activeFeaturesForCompany } from "@/lib/feature-flags";
import { boutiqueEstActive, iaEstActive } from "@/lib/preview-features";
import { listerApplicationsPourSwitcher } from "@/lib/multi-app-server";

// Layout des pages authentifiées avec navigation latérale.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContexteEntreprise();
  // Independants l'un de l'autre (aucun n'attend le resultat de l'autre) : les lancer en
  // parallele evite un aller-retour reseau supplementaire sur chaque navigation.
  const [permissions, plateformeAdmin, applications] = await Promise.all([
    permissionsUtilisateur(ctx),
    estPlateformeAdmin(),
    listerApplicationsPourSwitcher(ctx.entrepriseId).catch(() => []),
  ]);
  const activeFeatures = await activeFeaturesForCompany(ctx, permissions, plateformeAdmin);
  const peutVoirAlerteAbonnement = permissions === null || permissions.includes("gerer_utilisateurs") || permissions.includes("gerer_parametres");
  // Préavis de fin d'essai (ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1) : visible par
  // TOUS les membres — ils subissent le blocage à J31 — mais seul un profil
  // habilité se voit proposer le lien de souscription, qui exige acces_parametres.
  const preavis = ctx.accesSupportPlateforme
    ? null
    : preavisEssai({
        abonnementStatut: ctx.abonnementStatut,
        essaiDebut: ctx.abonnementEssaiDebut,
        essaiFin: ctx.abonnementEssaiFin,
      });

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
        .lecture-seule main form:not([method="get"]),
        .lecture-seule main a[href$="/nouveau"],
        .lecture-seule main a[href*="/modifier"],
        .lecture-seule main button[type="button"]{display:none!important}
        .lecture-seule main form[method="get"]{display:flex!important}
        .lecture-seule main form[method="get"] button{display:inline-flex!important}
      `}</style>
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} boutiqueActive={boutiqueEstActive()} activeFeatures={activeFeatures} applications={applications} />
      <div className="min-w-0 flex-1">
        {ctx.accesSupportPlateforme&&<SupportAccessBanner entrepriseNom={ctx.entrepriseNom}/>}
        {!ctx.accesSupportPlateforme&&ctx.suspensionPrevueAt&&peutVoirAlerteAbonnement&&<AbonnementBanner echeance={ctx.suspensionPrevueAt} message={ctx.impayeMessage}/>}
        {ctx.essaiExpireSansOffre&&<EssaiExpireBanner peutSouscrire={peutVoirAlerteAbonnement}/>}
        {preavis&&<EssaiPreavisBanner joursRestants={preavis.joursRestants} niveau={preavis.niveau} finEssai={ctx.abonnementEssaiFin} peutSouscrire={peutVoirAlerteAbonnement}/>}
        <ModuleAccessBoundary permissions={permissions} activeFeatures={activeFeatures}>{children}</ModuleAccessBoundary>
      </div>
      <MobileBack />
      <AideButton />
      {iaEstActive() && aAccesIA(permissions) && <AssistantIA />}
    </div>
  );
}
