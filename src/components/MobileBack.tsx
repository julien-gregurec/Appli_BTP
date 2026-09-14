"use client";

import { usePathname, useRouter } from "next/navigation";
import { demanderNavigation } from "@/components/GardeModifications";

// Bouton « retour » flottant, visible uniquement sur mobile (notamment en PWA standalone
// où il n'y a pas de bouton retour du navigateur).
export function MobileBack() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  const morceaux = pathname.split("/").filter(Boolean);
  const destination = morceaux.length >= 3
    ? `/${morceaux.slice(0, -1).join("/")}`
    : morceaux.length === 2
      ? `/${morceaux[0]}`
      : "/dashboard";
  return (
    <button
      type="button"
      onClick={() => { if (demanderNavigation(destination)) router.push(destination); }}
      aria-label="Revenir à la page précédente"
      title="Retour"
      // `bottom` relevé (GP V1, § 40) : la barre d'actions contextuelle du devis et du planning pose
      // désormais un bouton « Actions » sur toute la largeur en bas d'écran sous `lg` (1024 px) — ce
      // bouton flottant, jusque-là seul dans ce coin, s'y superposait. `md:hidden` couvre un intervalle
      // plus étroit que cette barre (< 768 contre < 1024) : la marge supplémentaire est sans effet ailleurs.
      className="fixed left-4 z-50 flex h-12 w-12 touch-manipulation items-center justify-center rounded-full border border-[#243447] bg-[#0d1b2a] text-xl text-white shadow-lg md:hidden"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      ←
    </button>
  );
}
