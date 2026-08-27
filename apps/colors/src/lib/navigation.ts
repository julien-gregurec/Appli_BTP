export const NAVIGATION_COLORS = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard", disponible: true },
  { href: "/inventaire", label: "Inventaire", icon: "inventory", disponible: false },
  { href: "/ajout-photo", label: "Ajout par photo", icon: "camera", disponible: false },
  { href: "/depots", label: "Dépôts et emplacements", icon: "location", disponible: false },
  { href: "/mouvements", label: "Mouvements", icon: "movement", disponible: false },
  { href: "/nuanciers", label: "Nuanciers", icon: "palette", disponible: false },
  { href: "/catalogues", label: "Catalogues produits", icon: "catalog", disponible: false },
  { href: "/imports", label: "Imports", icon: "upload", disponible: false },
  { href: "/utilisateurs", label: "Utilisateurs et habilitations", icon: "users", disponible: false },
  { href: "/parametres", label: "Paramètres", icon: "settings", disponible: false },
] as const;

export type IconeNavigation = (typeof NAVIGATION_COLORS)[number]["icon"];
