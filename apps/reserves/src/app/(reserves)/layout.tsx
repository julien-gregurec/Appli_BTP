import type { ReactNode } from "react";
import { Coquille } from "@/components/Coquille";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { compterNotifications, compterMessagesNonLus } from "@/lib/donnees";
import { lireBandeauAssistance } from "@/lib/assistance";
import { environnementNavigationServeur } from "@elsatia/application-access";
import { listerApplicationsAutorisees } from "@/lib/applications-elsatia";
import { construireLiensApplications } from "@/lib/selecteur-applications";

export default async function LayoutReserves({ children }: { children: ReactNode }) {
  const contexte = await exigerShellReserves();
  // Les deux compteurs sont lus en parallèle et à chaque rendu de la coquille : ce sont
  // deux agrégats bornés par les mêmes prédicats de visibilité que les listes elles-mêmes.
  const [notificationsNonLues, messagesNonLus, bandeauAssistance, applications] = await Promise.all([
    compterNotifications(),
    compterMessagesNonLus(),
    lireBandeauAssistance().catch(() => null),
    // Retour vers l'univers ELSATIA (A-08/A-09) : catalogue + environnement ; jamais bloquant.
    listerApplicationsAutorisees({ entrepriseId: contexte.entrepriseId })
      .then((autorisees) => construireLiensApplications(autorisees, environnementNavigationServeur()))
      .catch(() => []),
  ]);
  return (
    <Coquille
      contexte={contexte}
      notificationsNonLues={notificationsNonLues}
      messagesNonLus={messagesNonLus}
      bandeauAssistance={bandeauAssistance}
      applications={applications}
    >
      {children}
    </Coquille>
  );
}
