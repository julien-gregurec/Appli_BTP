import type { ReactNode } from "react";
import { Marque } from "@/components/Marque";
import { Navigation } from "@/components/Navigation";
import { deconnexionAction } from "@/app/actions";
import { estCompteIntervenant, peutInviterEntreprise } from "@/lib/acces-reserves";
import type { ContexteReserves } from "@/lib/contexte";

export function Coquille({
  contexte,
  notificationsNonLues = 0,
  messagesNonLus = 0,
  children,
}: {
  contexte: ContexteReserves;
  notificationsNonLues?: number;
  messagesNonLus?: number;
  children: ReactNode;
}) {
  const intervenant = estCompteIntervenant(contexte.roleReserves);
  const administrateur = peutInviterEntreprise(contexte.roleReserves);
  return (
    <div className="coquille">
      <header className="barre">
        <Marque />
        <div className="barre-org">
          {contexte.entrepriseNom}
          <form action={deconnexionAction}>
            <button type="submit" className="bouton secondaire" style={{ color: "#fff", borderColor: "#3a5a57", minHeight: 32, padding: "0 10px", marginTop: 4, fontSize: 13 }}>
              Se déconnecter
            </button>
          </form>
        </div>
      </header>
      <Navigation
        intervenant={intervenant}
        administrateur={administrateur}
        notificationsNonLues={notificationsNonLues}
        messagesNonLus={messagesNonLus}
      />
      <main className="contenu">{children}</main>
      <footer className="pied">
        ELSATIA Réserves — application indépendante de l’écosystème ELSATIA.
      </footer>
    </div>
  );
}
