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
import { lireEtatAssistance } from "@/lib/assistance-server";

// Layout des pages authentifiées avec navigation latérale.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContexteEntreprise();
  // Independants l'un de l'autre (aucun n'attend le resultat de l'autre) : les lancer en
  // parallele evite un aller-retour reseau supplementaire sur chaque navigation.
  const [permissions, plateformeAdmin, applications, assistance] = await Promise.all([
    permissionsUtilisateur(ctx),
    estPlateformeAdmin(),
    listerApplicationsPourSwitcher(ctx.entrepriseId).catch(() => []),
    // Le bandeau ne doit jamais faire tomber le layout : si le contrat n'est pas
    // encore en base, on retombe sur le bandeau minimal historique.
    lireEtatAssistance("gestion_pro").catch(() => null),
  ]);
  const bandeauAssistance = assistance?.disponible ? assistance.bandeau : null;
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
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} boutiqueActive={boutiqueEstActive()} activeFeatures={activeFeatures} applications={applications} />
      <div className="min-w-0 flex-1">
        {ctx.accesSupportPlateforme&&<SupportAccessBanner entrepriseNom={ctx.entrepriseNom} bandeau={bandeauAssistance}/>}
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
