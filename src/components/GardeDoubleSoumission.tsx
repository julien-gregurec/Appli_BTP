"use client";

import { useEffect } from "react";
import { installerGardeDoubleSoumission } from "@/lib/garde-double-soumission";

// Empêche la double soumission d'un formulaire pendant qu'une action serveur est
// en cours (recette métier GP, B29). Logique et garanties : src/lib/garde-double-soumission.ts.
export function GardeDoubleSoumission() {
  useEffect(() => installerGardeDoubleSoumission(window), []);
  return null;
}
