"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Une entreprise invitée n'a rien à faire dans la gestion des chantiers ni des
// intervenants : sa navigation se limite à ce qui lui est attribué.
const ENTREES_HOTE = [
  { href: "/dashboard", libelle: "Tableau de bord" },
  { href: "/chantiers", libelle: "Chantiers" },
  { href: "/reserves", libelle: "Réserves" },
  { href: "/intervenants", libelle: "Entreprises" },
  { href: "/messages", libelle: "Messages", compteur: "messages" as const },
  { href: "/notifications", libelle: "Notifications", compteur: "notifications" as const },
];

// L'administration des membres n'apparaît que pour qui peut réellement l'exercer.
const ENTREE_MEMBRES = { href: "/parametres/membres", libelle: "Membres" };

const ENTREES_INTERVENANT = [
  { href: "/dashboard", libelle: "Tableau de bord" },
  { href: "/reserves", libelle: "Mes réserves" },
  { href: "/messages", libelle: "Messages", compteur: "messages" as const },
  { href: "/notifications", libelle: "Notifications", compteur: "notifications" as const },
];

export function Navigation({
  intervenant, administrateur, notificationsNonLues = 0, messagesNonLus = 0,
}: {
  intervenant: boolean;
  administrateur: boolean;
  notificationsNonLues?: number;
  messagesNonLus?: number;
}) {
  const chemin = usePathname();
  const entrees: { href: string; libelle: string; compteur?: "messages" | "notifications" }[] =
    intervenant
      ? ENTREES_INTERVENANT
      : administrateur ? [...ENTREES_HOTE, ENTREE_MEMBRES] : ENTREES_HOTE;

  // Un compteur nul ne s'affiche pas : une pastille « 0 » n'informe de rien et fait du
  // bruit sur une barre de navigation déjà dense en mobile.
  function badge(entree: { compteur?: "messages" | "notifications" }) {
    const valeur = entree.compteur === "messages" ? messagesNonLus
      : entree.compteur === "notifications" ? notificationsNonLues : 0;
    return valeur > 0 ? <span className="pastille" aria-hidden="true">{valeur > 99 ? "99+" : valeur}</span> : null;
  }
  return (
    <nav className="navigation" aria-label="Navigation principale">
      {entrees.map((entree) => (
        <Link
          key={entree.href}
          href={entree.href}
          aria-current={chemin === entree.href || chemin.startsWith(`${entree.href}/`) ? "page" : undefined}
        >
          {entree.libelle}
          {badge(entree)}
        </Link>
      ))}
    </nav>
  );
}
