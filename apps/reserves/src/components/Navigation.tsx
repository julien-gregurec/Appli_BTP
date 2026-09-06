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
];

// L'administration des membres n'apparaît que pour qui peut réellement l'exercer.
const ENTREE_MEMBRES = { href: "/parametres/membres", libelle: "Membres" };

const ENTREES_INTERVENANT = [
  { href: "/dashboard", libelle: "Tableau de bord" },
  { href: "/reserves", libelle: "Mes réserves" },
];

export function Navigation({ intervenant, administrateur }: { intervenant: boolean; administrateur: boolean }) {
  const chemin = usePathname();
  const entrees = intervenant
    ? ENTREES_INTERVENANT
    : administrateur ? [...ENTREES_HOTE, ENTREE_MEMBRES] : ENTREES_HOTE;
  return (
    <nav className="navigation" aria-label="Navigation principale">
      {entrees.map((entree) => (
        <Link
          key={entree.href}
          href={entree.href}
          aria-current={chemin === entree.href || chemin.startsWith(`${entree.href}/`) ? "page" : undefined}
        >
          {entree.libelle}
        </Link>
      ))}
    </nav>
  );
}
