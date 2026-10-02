import type { ReactNode } from "react";
import { Marque } from "@/components/Marque";
import { BanniereRetour } from "@/components/BanniereRetour";
import { AtelierOffline } from "@/components/offline/AtelierOffline";
import { IndicateurOffline } from "@/components/offline/IndicateurOffline";
import { ServiceWorkerReserves } from "@/components/offline/ServiceWorkerReserves";
import { BoutonDeconnexion } from "@/components/offline/BoutonDeconnexion";
import { Navigation } from "@/components/Navigation";
import { estCompteIntervenant, peutInviterEntreprise } from "@/lib/acces-reserves";
import type { ContexteReserves } from "@/lib/contexte";
import { BandeauAssistanceElsatia } from "@/components/BandeauAssistanceElsatia";
import type { BandeauAssistance } from "@elsatia/platform-support-comms";
import type { LienApplication } from "@/lib/selecteur-applications";

export function Coquille({
  contexte,
  notificationsNonLues = 0,
  messagesNonLus = 0,
  bandeauAssistance = null,
  applications = [],
  children,
}: {
  contexte: ContexteReserves;
  notificationsNonLues?: number;
  messagesNonLus?: number;
  bandeauAssistance?: BandeauAssistance | null;
  /** Autres applications ELSATIA ouvertes, URL déjà validées pour l'environnement (A-08). */
  applications?: LienApplication[];
  children: ReactNode;
}) {
  const intervenant = estCompteIntervenant(contexte.roleReserves);
  const administrateur = peutInviterEntreprise(contexte.roleReserves);
  return (
    <AtelierOffline
      entrepriseId={contexte.entrepriseId}
      utilisateurId={contexte.userId}
    >
    <div className="coquille">
      <ServiceWorkerReserves />
      <header className="barre">
        <Marque />
        {applications.length > 0 && (
          <nav className="barre-apps" aria-label="Applications ELSATIA">
            {applications.map((application) => (
              <a key={application.code} href={application.url} data-application={application.code}>{application.nom}</a>
            ))}
          </nav>
        )}
        <div className="barre-org">
          {contexte.entrepriseNom}
          {/* La déconnexion purge d'abord ce que l'appareil garde en mémoire. */}
          <BoutonDeconnexion />
        </div>
      </header>
      {/* Une session d'assistance ne fonctionne jamais hors-ligne : ce bandeau ne peut
          donc apparaître que sur un rendu servi en ligne, ce qui est cohérent. */}
      <BandeauAssistanceElsatia bandeau={bandeauAssistance} />
      <Navigation
        intervenant={intervenant}
        administrateur={administrateur}
        notificationsNonLues={notificationsNonLues}
        messagesNonLus={messagesNonLus}
      />
      <main className="contenu">
        {/* L'état du travail non transmis est visible sur TOUTES les pages : c'est ce
            qui empêche de croire une saisie enregistrée alors qu'elle dort ici. */}
        <IndicateurOffline />
        <BanniereRetour />
        {children}
      </main>
      <footer className="pied">
        ELSATIA Réserves — application indépendante de l’écosystème ELSATIA.
      </footer>
    </div>
    </AtelierOffline>
  );
}
