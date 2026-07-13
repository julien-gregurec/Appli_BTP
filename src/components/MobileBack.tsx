"use client";

import { useRouter } from "next/navigation";

// Bouton « retour » flottant, visible uniquement sur mobile (notamment en PWA standalone
// où il n'y a pas de bouton retour du navigateur).
export function MobileBack() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Revenir en arrière"
      className="fixed left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#243447] bg-[#0d1b2a] text-xl text-white shadow-lg md:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      ←
    </button>
  );
}
