import type { ReactNode } from "react";
import { Coquille } from "@/components/Coquille";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { compterNotifications, compterMessagesNonLus } from "@/lib/donnees";

export default async function LayoutReserves({ children }: { children: ReactNode }) {
  const contexte = await exigerShellReserves();
  // Les deux compteurs sont lus en parallèle et à chaque rendu de la coquille : ce sont
  // deux agrégats bornés par les mêmes prédicats de visibilité que les listes elles-mêmes.
  const [notificationsNonLues, messagesNonLus] = await Promise.all([
    compterNotifications(),
    compterMessagesNonLus(),
  ]);
  return (
    <Coquille
      contexte={contexte}
      notificationsNonLues={notificationsNonLues}
      messagesNonLus={messagesNonLus}
    >
      {children}
    </Coquille>
  );
}
