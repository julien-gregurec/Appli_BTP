import { Sidebar } from "@/components/Sidebar";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { ModuleAccessBoundary } from "@/components/ModuleAccessBoundary";
import { BadgePreview } from "@/components/BadgePreview";
import { MobileBack } from "@/components/MobileBack";
import { AideButton } from "@/components/AideButton";
import { AssistantIA } from "@/components/AssistantIA";
import { AppPresenceTracker } from "@/components/AppPresenceTracker";
import { AbonnementBanner } from "@/components/AbonnementBanner";
import { SupportAccessBanner } from "@/components/SupportAccessBanner";
import { TrialStatusBanner } from "@/components/TrialStatusBanner";
import { statutEssai } from "@/lib/essai-statut";
import { activeFeaturesForCompany } from "@/lib/feature-flags";
import { boutiqueEstActive, iaEstActive } from "@/lib/preview-features";
import { PaletteRecherche } from "@/components/PaletteRecherche";
import { devisV2Actif } from "@/lib/devis/v2-serveur";

// Layout des pages authentifiées avec navigation latérale.
//
// GP_V1_RC : version reconstruite à la main pour `release/gp-v1-rc`, à partir du layout de
// `release/commercialisation-v1` (fcdd4e7) + UNIQUEMENT les ajouts nécessaires à GP V1 (barre de
// recherche globale, badge preview, bandeau d'essai — explicitement dans le périmètre de smoke
// test GP V1, § 16). Le layout réel de la branche feature a accumulé, au même endroit, plusieurs
// autres chantiers plateforme sans rapport (bascule multi-application, bandeau d'assistance
// inter-applications, file hors-ligne/PWA de Réserves) : ces ajouts-là ne sont PAS repris ici — la
// RC garde le comportement d'origine du layout pour ces points, comme la 211-baseline le fait déjà.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContexteEntreprise();
  const [permissions, plateformeAdmin] = await Promise.all([permissionsUtilisateur(ctx), estPlateformeAdmin()]);
  const activeFeatures = await activeFeaturesForCompany(ctx, permissions, plateformeAdmin);
  const peutVoirAlerteAbonnement = permissions === null || permissions.includes("gerer_utilisateurs") || permissions.includes("gerer_parametres");
  // Préavis de fin d'essai (ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1) : visible par
  // TOUS les membres — ils subissent le blocage à J31 — mais seul un profil
  // habilité se voit proposer le lien de souscription, qui exige acces_parametres.
  const essai = ctx.accesSupportPlateforme
    ? null
    : statutEssai({
        abonnementStatut: ctx.abonnementStatut,
        essaiDebut: ctx.abonnementEssaiDebut,
        essaiFin: ctx.abonnementEssaiFin,
      });

  return (
    <div className="app-shell flex min-h-full flex-1">
      <AppPresenceTracker actif={!isEmailLoginDisabled()} />
      <Sidebar entrepriseNom={ctx.entrepriseNom} logoUrl={ctx.logoUrl} essai={essai} authDisabled={isEmailLoginDisabled()} permissions={permissions} plateformeAdmin={plateformeAdmin} boutiqueActive={boutiqueEstActive()} activeFeatures={activeFeatures} />
      <div className="min-w-0 flex-1">
        {ctx.accesSupportPlateforme&&<SupportAccessBanner entrepriseNom={ctx.entrepriseNom}/>}
        {!ctx.accesSupportPlateforme&&ctx.suspensionPrevueAt&&peutVoirAlerteAbonnement&&<AbonnementBanner echeance={ctx.suspensionPrevueAt} message={ctx.impayeMessage}/>}
        {essai&&<TrialStatusBanner statut={essai} peutSouscrire={peutVoirAlerteAbonnement} variante="bandeau"/>}
        <ModuleAccessBoundary permissions={permissions} activeFeatures={activeFeatures}>{children}</ModuleAccessBoundary>
      </div>
      <MobileBack />
      {/* GP V1 : recherche globale (Ctrl+K) — la RPC arrive avec les migrations du moteur v2. */}
      <PaletteRecherche actif={devisV2Actif() && !ctx.accesSupportPlateforme} />
      <BadgePreview />
      <AideButton />
      {iaEstActive() && aAccesIA(permissions) && <AssistantIA />}
    </div>
  );
}
