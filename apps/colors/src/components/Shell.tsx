import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { DesktopNavigation, MobileNavigation } from "@/components/Navigation";
import { ApplicationSwitcher } from "@/components/ApplicationSwitcher";
import { deconnexionAction } from "@/app/actions";
import type { ContexteColors } from "@/lib/contexte";

const LIBELLES_ROLES: Record<string, string> = {
  colors_admin_organisation: "Administrateur Colors",
  colors_gestionnaire_stock: "Gestionnaire de stock",
  colors_utilisateur_depot: "Utilisateur de dépôt",
  colors_consultation: "Consultation Colors",
  administrateur_plateforme_global: "Administration ELSATIA",
};

export function Shell({ contexte, children }: { contexte: ContexteColors; children: ReactNode }) {
  const compteUrl = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? "http://localhost:3000/abonnement";
  const role = contexte.roleColors ? LIBELLES_ROLES[contexte.roleColors] : null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <DesktopNavigation />
        <div className="sidebar-footer">
          <Link href={compteUrl} className="account-link">Compte et abonnements <span>↗</span></Link>
          <div className="profile-card">
            <span className="avatar">{(contexte.prenom ?? contexte.email ?? "E").slice(0, 1).toUpperCase()}</span>
            <span><strong>{contexte.prenom ?? "Compte ELSATIA"}</strong><small>{role ?? contexte.entrepriseNom}</small></span>
            <form action={deconnexionAction}><button aria-label="Se déconnecter" title="Se déconnecter">↪</button></form>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="mobile-brand"><MobileNavigation/><Brand compact /></div>
          <ApplicationSwitcher contexte={contexte} />
          <div className="topbar-actions">
            <span className="secure-pill"><i/> Accès sécurisé</span>
            <Link href={compteUrl} className="account-avatar" aria-label="Ouvrir le compte ELSATIA">
              {(contexte.prenom ?? contexte.email ?? "E").slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
